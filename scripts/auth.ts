#!/usr/bin/env tsx
import { createServer } from "node:http";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadAuthConfig } from "../src/config/env.js";
import {
  createOAuth2Client,
  exchangeCodeForTokens,
  getAuthUrl,
} from "../src/auth/googleOAuth.js";
import { createTokenStore } from "../src/auth/credentialProvider.js";
import type { TokenStore } from "../src/auth/tokenStore/tokenStore.js";

async function main(): Promise<void> {
  const config = loadAuthConfig();
  const oauth2Client = createOAuth2Client(config.google);
  const tokenStore = createTokenStore(config.google);

  const authUrl = getAuthUrl(oauth2Client);
  console.log("\nGoogle OAuth Authentication\n");
  console.log("1. Open this URL in your browser:\n");
  console.log(authUrl);
  console.log("\n2. After granting access, you will be redirected to your redirect URI.");
  console.log("   Copy the `code` query parameter from the redirect URL.\n");

  const rl = createInterface({ input, output });
  const code = (await rl.question("Enter authorization code: ")).trim();
  rl.close();

  if (!code) {
    throw new Error("Authorization code is required.");
  }

  const tokens = await exchangeCodeForTokens(oauth2Client, code);
  await tokenStore.save(tokens);

  console.log(`\nTokens saved to ${config.google.tokenStorePath}`);
  console.log("You can now start the MCP server with `npm run dev` or `npm start`.\n");
}

async function startLocalCallbackServer(
  oauth2Client: ReturnType<typeof createOAuth2Client>,
  tokenStore: TokenStore,
  redirectUri: string,
): Promise<void> {
  const redirectUrl = new URL(redirectUri);
  const port = redirectUrl.port ? Number.parseInt(redirectUrl.port, 10) : 3000;

  await new Promise<void>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? "/", redirectUri);
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end(`Authentication failed: ${error}`);
          reject(new Error(error));
          return;
        }

        if (!code) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing authorization code.");
          return;
        }

        const tokens = await exchangeCodeForTokens(oauth2Client, code);
        await tokenStore.save(tokens);

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1>Authentication successful!</h1><p>You can close this window.</p>");
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });

    server.listen(port, () => {
      console.log(`Listening for OAuth callback on ${redirectUri}`);
    });
  });
}

if (process.argv.includes("--callback-server")) {
  const config = loadAuthConfig();
  const oauth2Client = createOAuth2Client(config.google);
  const tokenStore = createTokenStore(config.google);
  const authUrl = getAuthUrl(oauth2Client);
  console.log("\nOpen this URL:\n", authUrl, "\n");
  startLocalCallbackServer(oauth2Client, tokenStore, config.google.redirectUri)
    .then(() => console.log(`Tokens saved to ${config.google.tokenStorePath}`))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
