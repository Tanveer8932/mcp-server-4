#!/usr/bin/env node
import { loadConfig } from "./config/env.js";
import { startServer } from "./mcp/server.js";

async function main(): Promise<void> {
  const config = loadConfig();
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
