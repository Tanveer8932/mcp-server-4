#!/usr/bin/env tsx
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";

loadDotenv();

async function main(): Promise<void> {
  const tokenPath = resolve(process.env.GOOGLE_TOKEN_STORE_PATH ?? "./tokens.json");
  const raw = await readFile(tokenPath, "utf8");
  const parsed: unknown = JSON.parse(raw);

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`Expected JSON object in ${tokenPath}`);
  }

  const oneLine = JSON.stringify(parsed);

  console.log("\nAdd this Railway environment variable:\n");
  console.log(`GOOGLE_TOKENS_JSON=${oneLine}\n`);
  console.log("Notes:");
  console.log("- Mark it as a secret in Railway.");
  console.log("- When GOOGLE_TOKENS_JSON is set, you do not need a Volume or GOOGLE_TOKEN_STORE_PATH.");
  console.log("- Refreshed access tokens stay in memory until the next deploy/restart.");
  console.log("- Keep your refresh token in this env var; re-auth locally if it is revoked.\n");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
