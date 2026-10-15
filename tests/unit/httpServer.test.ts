import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { Config } from "../../src/config/env.js";
import { hashToken } from "../../src/http/auth.js";
import { startHttpServer } from "../../src/mcp/server.js";

const VALID_TOKEN = "valid-test-token-0123456789abcdefghijklmnop";

const INITIALIZE = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "auth-test", version: "1.0.0" },
  },
});

let server: Server;
let baseUrl: string;
let tmp: string;

function buildConfig(tokenStorePath: string): Config {
  return {
    google: {
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost/oauth/callback",
      tokenStorePath,
    },
    mcp: {
      transport: "streamable-http",
      host: "127.0.0.1",
      port: 0,
      authTokenHashes: [hashToken(VALID_TOKEN)],
    },
    oauthRoutes: { enabled: false },
    tools: { enabled: ["gmail_create_draft", "google_docs_append_content"] },
    logging: { level: "error" },
    limits: { maxEmailBodyBytes: 1024, maxDocAppendBytes: 1024 },
  };
}

function postInitialize(headers: Record<string, string> = {}): Promise<Response> {
  return fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...headers,
    },
    body: INITIALIZE,
  });
}

async function connectClient(headers: Record<string, string>): Promise<Client> {
  const client = new Client({ name: "auth-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(baseUrl), {
    requestInit: { headers },
  });
  await client.connect(transport);
  return client;
}

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), "mcp-auth-test-"));
  server = await startHttpServer(buildConfig(join(tmp, "tokens.json")));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(tmp, { recursive: true, force: true });
});

describe("MCP endpoint bearer authentication", () => {
  it("rejects a request without a token with 401", async () => {
    const response = await postInitialize();
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('Bearer realm="mcp"');
    await expect(response.json()).resolves.toMatchObject({ error: "unauthorized" });
  });

  it("rejects an invalid token with 401", async () => {
    const response = await postInitialize({ Authorization: "Bearer not-the-right-token" });
    expect(response.status).toBe(401);
  });

  it("rejects a non-bearer scheme with 401", async () => {
    const response = await postInitialize({ Authorization: `Basic ${VALID_TOKEN}` });
    expect(response.status).toBe(401);
  });

  it("rejects DELETE (session termination) without a token", async () => {
    const response = await fetch(baseUrl, { method: "DELETE" });
    expect(response.status).toBe(401);
  });

  it("does not leak the token or tool names in the 401 body", async () => {
    const text = await (await postInitialize({ Authorization: "Bearer wrong" })).text();
    expect(text).not.toMatch(/gmail|docs|wrong/);
  });

  it("accepts a valid token for the MCP handshake", async () => {
    const response = await postInitialize({ Authorization: `Bearer ${VALID_TOKEN}` });
    expect(response.status).toBe(200);
  });

  it("lets an authenticated SDK client list only the enabled tools", async () => {
    const client = await connectClient({ Authorization: `Bearer ${VALID_TOKEN}` });
    try {
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name).sort()).toEqual([
        "gmail_create_draft",
        "google_docs_append_content",
      ]);
    } finally {
      await client.close();
    }
  });

  it("refuses an SDK client without a token", async () => {
    await expect(connectClient({})).rejects.toThrow();
  });

  it("refuses an SDK client with an invalid token", async () => {
    await expect(connectClient({ Authorization: "Bearer nope" })).rejects.toThrow();
  });
});

describe("public routes", () => {
  it("keeps /health public for the Railway healthcheck", async () => {
    const response = await fetch(new URL("/health", baseUrl));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("does not advertise OAuth routes when they are disabled", async () => {
    const body = (await (await fetch(baseUrl)).json()) as { endpoints: Record<string, string> };
    expect(body.endpoints).not.toHaveProperty("oauthStart");
  });

  it("returns 404 for OAuth routes when they are disabled", async () => {
    expect((await fetch(new URL("/oauth/start", baseUrl), { redirect: "manual" })).status).toBe(404);
    expect((await fetch(new URL("/oauth/callback?code=x", baseUrl))).status).toBe(404);
  });
});

describe("startHttpServer", () => {
  it("refuses to start without configured token hashes", async () => {
    const config = buildConfig(join(tmp, "unused.json"));
    config.mcp.authTokenHashes = [];
    await expect(startHttpServer(config)).rejects.toThrow(/MCP_AUTH_TOKEN_SHA256/);
  });
});
