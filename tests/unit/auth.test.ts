import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OAuthStateManager } from "../../src/auth/oauthState.js";
import { loadConfig } from "../../src/config/env.js";
import { checkBearer, extractBearerToken, hashToken, parseTokenHashes } from "../../src/http/auth.js";

const TOKEN = "s3cr3t-token-for-tests_abcdefghijklmnop";
const HASH = hashToken(TOKEN);

describe("parseTokenHashes", () => {
  it("parses, trims, lowercases and de-duplicates hashes", () => {
    expect(parseTokenHashes(` ${HASH.toUpperCase()} ,${HASH},`, "X")).toEqual([HASH]);
  });

  it("returns an empty list when unset", () => {
    expect(parseTokenHashes(undefined, "X")).toEqual([]);
  });

  it("rejects a plaintext token where a hash is expected", () => {
    expect(() => parseTokenHashes(TOKEN, "MCP_AUTH_TOKEN_SHA256")).toThrow(
      /MCP_AUTH_TOKEN_SHA256.*SHA-256/,
    );
  });
});

describe("extractBearerToken", () => {
  it("accepts the Bearer scheme case-insensitively", () => {
    expect(extractBearerToken(`bearer ${TOKEN}`)).toBe(TOKEN);
    expect(extractBearerToken(`Bearer ${TOKEN}`)).toBe(TOKEN);
  });

  it("rejects other schemes and empty values", () => {
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken("")).toBeNull();
    expect(extractBearerToken("Bearer ")).toBeNull();
    expect(extractBearerToken(`Basic ${TOKEN}`)).toBeNull();
    expect(extractBearerToken(TOKEN)).toBeNull();
  });
});

describe("checkBearer", () => {
  it("accepts a valid token", () => {
    expect(checkBearer(`Bearer ${TOKEN}`, [HASH])).toEqual({ ok: true });
  });

  it("rejects a missing token", () => {
    expect(checkBearer(undefined, [HASH])).toEqual({ ok: false, reason: "missing" });
  });

  it("rejects an invalid token", () => {
    expect(checkBearer("Bearer wrong-token", [HASH])).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects the hash itself presented as a token", () => {
    expect(checkBearer(`Bearer ${HASH}`, [HASH]).ok).toBe(false);
  });

  it("fails closed when no hashes are configured", () => {
    expect(checkBearer(`Bearer ${TOKEN}`, [])).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("accepts any of several configured tokens (rotation)", () => {
    const other = "another-token-value";
    expect(checkBearer(`Bearer ${other}`, [HASH, hashToken(other)]).ok).toBe(true);
  });
});

describe("OAuthStateManager", () => {
  const secret = "x".repeat(32);

  it("accepts an issued state exactly once", () => {
    const manager = new OAuthStateManager(secret);
    const state = manager.issue();
    expect(manager.consume(state)).toBe(true);
    expect(manager.consume(state)).toBe(false);
  });

  it("rejects missing, malformed and tampered states", () => {
    const manager = new OAuthStateManager(secret);
    const state = manager.issue();
    const [payload, signature] = state.split(".");
    expect(manager.consume(null)).toBe(false);
    expect(manager.consume("")).toBe(false);
    expect(manager.consume("garbage")).toBe(false);
    expect(manager.consume(`${payload}.${signature}x`)).toBe(false);
    expect(manager.consume(`${payload}x.${signature}`)).toBe(false);
  });

  it("rejects a state signed with another secret", () => {
    const state = new OAuthStateManager("y".repeat(32)).issue();
    expect(new OAuthStateManager(secret).consume(state)).toBe(false);
  });

  it("rejects an expired state", () => {
    let now = 1_000_000;
    const manager = new OAuthStateManager(secret, 1000, () => now);
    const state = manager.issue();
    now += 1001;
    expect(manager.consume(state)).toBe(false);
  });
});

describe("loadConfig security settings", () => {
  let original: NodeJS.ProcessEnv;

  beforeEach(() => {
    original = { ...process.env };
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    process.env.GOOGLE_REDIRECT_URI = "http://localhost:3000/oauth/callback";
    for (const name of [
      "PORT",
      "MCP_PORT",
      "MCP_HOST",
      "MCP_AUTH_TOKEN_SHA256",
      "ENABLED_TOOLS",
      "ENABLE_OAUTH_ROUTES",
      "OAUTH_ADMIN_TOKEN_SHA256",
      "OAUTH_STATE_SECRET",
      "ALLOWED_GOOGLE_ACCOUNT",
    ]) {
      delete process.env[name];
    }
  });

  afterEach(() => {
    process.env = original;
  });

  it("refuses streamable-http without MCP_AUTH_TOKEN_SHA256", () => {
    process.env.PORT = "8080";
    expect(() => loadConfig()).toThrow(/MCP_AUTH_TOKEN_SHA256/);
  });

  it("loads auth token hashes for streamable-http", () => {
    process.env.PORT = "8080";
    process.env.MCP_AUTH_TOKEN_SHA256 = HASH;
    expect(loadConfig().mcp.authTokenHashes).toEqual([HASH]);
  });

  it("does not require a token for stdio", () => {
    process.env.MCP_TRANSPORT = "stdio";
    expect(loadConfig().mcp.authTokenHashes).toEqual([]);
  });

  it("enables only the draft and append tools by default", () => {
    process.env.MCP_TRANSPORT = "stdio";
    expect(loadConfig().tools.enabled).toEqual(["gmail_create_draft", "google_docs_append_content"]);
  });

  it("allows gmail_send_email to be enabled explicitly", () => {
    process.env.MCP_TRANSPORT = "stdio";
    process.env.ENABLED_TOOLS = "gmail_create_draft,gmail_send_email";
    expect(loadConfig().tools.enabled).toEqual(["gmail_create_draft", "gmail_send_email"]);
  });

  it("rejects unknown tool names in ENABLED_TOOLS", () => {
    process.env.MCP_TRANSPORT = "stdio";
    process.env.ENABLED_TOOLS = "gmail_create_draft,drive_delete_everything";
    expect(() => loadConfig()).toThrow(/ENABLED_TOOLS.*drive_delete_everything/);
  });

  it("disables OAuth routes by default", () => {
    process.env.MCP_TRANSPORT = "stdio";
    expect(loadConfig().oauthRoutes).toEqual({ enabled: false });
  });

  it("requires admin token, state secret and allowed account when OAuth routes are enabled", () => {
    process.env.MCP_TRANSPORT = "stdio";
    process.env.ENABLE_OAUTH_ROUTES = "true";
    expect(() => loadConfig()).toThrow(/OAUTH_ADMIN_TOKEN_SHA256/);

    process.env.OAUTH_ADMIN_TOKEN_SHA256 = hashToken("admin");
    expect(() => loadConfig()).toThrow(/OAUTH_STATE_SECRET/);

    process.env.OAUTH_STATE_SECRET = "too-short";
    expect(() => loadConfig()).toThrow(/at least 32/);

    process.env.OAUTH_STATE_SECRET = "z".repeat(32);
    expect(() => loadConfig()).toThrow(/ALLOWED_GOOGLE_ACCOUNT/);

    process.env.ALLOWED_GOOGLE_ACCOUNT = "Owner@Example.com";
    expect(loadConfig().oauthRoutes).toMatchObject({
      enabled: true,
      allowedGoogleAccount: "owner@example.com",
    });
  });
});
