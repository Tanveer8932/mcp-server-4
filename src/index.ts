#!/usr/bin/env node
import { loadConfig } from "./config/env.js";
import { startServer } from "./mcp/server.js";

async function main(): Promise<void> {
  const config = loadConfig();

  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      message: "MCP server configuration loaded",
      transport: config.mcp.transport,
      host: config.mcp.host,
      port: config.mcp.port,
      tokenStore: config.google.tokensJson ? "env" : "file",
      redirectUri: config.google.redirectUri,
    }),
  );

  await startServer(config);
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      message: "Failed to start MCP server",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});
