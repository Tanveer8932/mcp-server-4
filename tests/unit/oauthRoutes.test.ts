import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../../src/config/env.js";
import type { StoredTokens } from "../../src/types/index.js";
import type { TokenStore } from "../../src/auth/tokenStore/tokenStore.js";
import { OAuthStateManager } from "../../src/auth/oauthState.js";
import { hashToken } from "../../src/http/auth.js";

const exchangeMock = vi.fn();

vi.mock("../../src/auth/googleOAuth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/auth/googleOAuth.js")>();
  return { ...actual, exchangeCodeForTokensWithIdentity: exchangeMock };
});

const { handleHttpRoute } = await import("../../src/http/routes.js");

const ADMIN_TOKEN = "admin-test-token-0123456789abcdefghijkl";
const MCP_TOKEN = "mcp-test-token-0123456789abcdefghijklmn";
const TOKENS: StoredTokens = { accessToken: "a", refreshToken: "r", expiryDate: 1 };

const config: Config = {
  google: {
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "https://example.test/oauth/callback",
    tokenStorePath: "./unused.json",
  },
  mcp: {
    transport: "streamable-http",
    host: "127.0.0.1",
    port: 3000,
    authTokenHashes: [hashToken(MCP_TOKEN)],
  },
  oauthRoutes: {
    enabled: true,
    adminTokenHashes: [hashToken(ADMIN_TOKEN)],
    stateSecret: "s".repeat(32),
    allowedGoogleAccount: "owner@example.com",
  },
  tools: { enabled: ["gmail_create_draft", "google_docs_append_content"] },
  logging: { level: "error" },
  limits: { maxEmailBodyBytes: 1024, maxDocAppendBytes: 1024 },
};

class RecordingTokenStore implements TokenStore {
  saved: StoredTokens[] = [];
  async load(): Promise<StoredTokens | null> {
    return null;
  }
  async save(tokens: StoredTokens): Promise<void> {
    this.saved.push(tokens);
  }
}

let store: RecordingTokenStore;
let oauthState: OAuthStateManager;

function route(path: string, authorization?: string) {
  return handleHttpRoute("GET", new URL(`https://example.test${path}`), config, store, {
    authorization,
    oauthState,
  });
}

async function startAndGetState(): Promise<string> {
  const response = await route("/oauth/start", `Bearer ${ADMIN_TOKEN}`);
  const location = new URL(response!.headers.get("location")!);
  return location.searchParams.get("state")!;
}

beforeEach(() => {
  store = new RecordingTokenStore();
  oauthState = new OAuthStateManager(config.oauthRoutes.enabled ? config.oauthRoutes.stateSecret : "");
  exchangeMock.mockReset();
});

describe("GET /oauth/start (enabled)", () => {
  it("rejects requests without the admin token", async () => {
    const response = await route("/oauth/start");
    expect(response?.status).toBe(401);
  });

  it("rejects the MCP client token (admin token is separate)", async () => {
    const response = await route("/oauth/start", `Bearer ${MCP_TOKEN}`);
    expect(response?.status).toBe(401);
  });

  it("redirects to Google with a signed state and identity scopes for the admin", async () => {
    const response = await route("/oauth/start", `Bearer ${ADMIN_TOKEN}`);
    expect(response?.status).toBe(302);
    const location = new URL(response!.headers.get("location")!);
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("state")).toMatch(/^[\w-]+\.[\w-]+$/);
    expect(location.searchParams.get("scope")).toContain("email");
  });
});

describe("GET /oauth/callback (enabled)", () => {
  it("rejects a missing state without contacting Google or saving tokens", async () => {
    const response = await route("/oauth/callback?code=abc");
    expect(response?.status).toBe(400);
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(store.saved).toEqual([]);
  });

  it("rejects a forged state", async () => {
    const forged = new OAuthStateManager("f".repeat(32)).issue();
    const response = await route(`/oauth/callback?code=abc&state=${forged}`);
    expect(response?.status).toBe(400);
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(store.saved).toEqual([]);
  });

  it("refuses to save tokens for a different Google account", async () => {
    exchangeMock.mockResolvedValue({ tokens: TOKENS, email: "attacker@example.com" });
    const state = await startAndGetState();
    const response = await route(`/oauth/callback?code=abc&state=${state}`);
    expect(response?.status).toBe(403);
    expect(store.saved).toEqual([]);
  });

  it("refuses to save tokens when Google returns no verified email", async () => {
    exchangeMock.mockResolvedValue({ tokens: TOKENS, email: null });
    const state = await startAndGetState();
    const response = await route(`/oauth/callback?code=abc&state=${state}`);
    expect(response?.status).toBe(403);
    expect(store.saved).toEqual([]);
  });

  it("saves tokens for the allowed account, and the state cannot be replayed", async () => {
    exchangeMock.mockResolvedValue({ tokens: TOKENS, email: "owner@example.com" });
    const state = await startAndGetState();

    const first = await route(`/oauth/callback?code=abc&state=${state}`);
    expect(first?.status).toBe(200);
    expect(store.saved).toEqual([TOKENS]);

    const replay = await route(`/oauth/callback?code=abc&state=${state}`);
    expect(replay?.status).toBe(400);
    expect(store.saved).toHaveLength(1);
  });
});
