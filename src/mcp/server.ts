import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import type { Config } from "../config/env.js";
import { createCredentialProvider, createTokenStore } from "../auth/credentialProvider.js";
import { OAuthStateManager } from "../auth/oauthState.js";
import { checkBearer, unauthorizedResponse } from "../http/auth.js";
import { handleHttpRoute } from "../http/routes.js";
import { Logger } from "../logging/logger.js";
import { registerTools } from "./tools/registry.js";

const SERVER_NAME = "google-workspace-mcp-server";
const SERVER_VERSION = "1.0.0";

export function createMcpServerInstance(config: Config): McpServer {
  const logger = new Logger(config.logging.level);
  const credentialProvider = createCredentialProvider(config);

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  registerTools(server, config, credentialProvider, logger);
  return server;
}

export async function startStdioServer(config: Config): Promise<void> {
  const logger = new Logger(config.logging.level);
  logger.info("Starting MCP server", { transport: "stdio" });

  serveStdio(() => createMcpServerInstance(config), {
    onerror: (error) => {
      logger.error("MCP transport error", { message: error.message });
    },
  });
}

export async function startHttpServer(config: Config): Promise<HttpServer> {
  const logger = new Logger(config.logging.level);
  if (config.mcp.authTokenHashes.length === 0) {
    // loadConfig already enforces this; guard against hand-built configs failing open.
    throw new Error("Refusing to start streamable-http without MCP_AUTH_TOKEN_SHA256.");
  }

  const { createMcpHandler } = await import("@modelcontextprotocol/server");
  const tokenStore = createTokenStore(config.google);
  const oauthState = config.oauthRoutes.enabled
    ? new OAuthStateManager(config.oauthRoutes.stateSecret)
    : undefined;

  const handler = createMcpHandler(() => createMcpServerInstance(config));

  const httpServer = createHttpServer(async (req, res) => {
    try {
      const host = config.mcp.host;
      const port = config.mcp.port;
      const url = new URL(req.url ?? "/", `http://${host}:${port}`);
      const method = req.method ?? "GET";

      const routeResponse = await handleHttpRoute(method, url, config, tokenStore, {
        authorization: req.headers.authorization,
        oauthState,
      });
      if (routeResponse) {
        await writeNodeResponse(res, routeResponse);
        return;
      }

      // Everything past the public routes is MCP traffic: authenticate before reading the
      // body or handing the request to the MCP handler, so no tool is reachable without a token.
      const auth = checkBearer(req.headers.authorization, config.mcp.authTokenHashes);
      if (!auth.ok) {
        logger.warn("Rejected unauthenticated MCP request", { method, reason: auth.reason });
        await writeNodeResponse(res, unauthorizedResponse("mcp"));
        return;
      }

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value !== undefined) {
          headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        }
      }

      const body =
        req.method === "GET" || req.method === "HEAD"
          ? undefined
          : await readRequestBody(req);

      const request = new Request(url.toString(), {
        method: req.method,
        headers,
        body: body as BodyInit | undefined,
      });

      const response = await handler.fetch(request);
      await writeNodeResponse(res, response);
    } catch (error) {
      logger.error("HTTP request failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    }
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(config.mcp.port, config.mcp.host, () => {
      logger.info("Starting MCP server", {
        transport: "streamable-http",
        host: config.mcp.host,
        port: config.mcp.port,
        authTokens: config.mcp.authTokenHashes.length,
        oauthRoutes: config.oauthRoutes.enabled,
        tools: config.tools.enabled,
      });
      resolve();
    });
  });
  return httpServer;
}

function readRequestBody(req: import("node:http").IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function writeNodeResponse(
  res: import("node:http").ServerResponse,
  response: Response,
): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value: string, key: string) => {
    res.setHeader(key, value);
  });
  const responseBody = Buffer.from(await response.arrayBuffer());
  res.end(responseBody);
}

export async function startServer(config: Config): Promise<void> {
  if (config.mcp.transport === "streamable-http") {
    await startHttpServer(config);
    return;
  }
  await startStdioServer(config);
}
