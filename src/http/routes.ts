import type { Config } from "../config/env.js";
import {
  createOAuth2Client,
  exchangeCodeForTokens,
  getAuthUrl,
} from "../auth/googleOAuth.js";
import type { TokenStore } from "../auth/tokenStore/tokenStore.js";

export function handleHealth(): Response {
  return Response.json({ status: "ok" });
}

export function handleOAuthStart(config: Config): Response {
  const oauth2Client = createOAuth2Client(config.google);
  const authUrl = getAuthUrl(oauth2Client);
  return Response.redirect(authUrl, 302);
}

export async function handleOAuthCallback(
  url: URL,
  config: Config,
  tokenStore: TokenStore,
): Promise<Response> {
  const error = url.searchParams.get("error");
  if (error) {
    return new Response(`Authentication failed: ${error}`, { status: 400 });
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return new Response("Missing authorization code.", { status: 400 });
  }

  const oauth2Client = createOAuth2Client(config.google);
  const tokens = await exchangeCodeForTokens(oauth2Client, code);
  await tokenStore.save(tokens);

  return new Response(
    "<h1>Authentication successful!</h1><p>You can close this window.</p>",
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function handleHttpRoute(
  method: string,
  url: URL,
  config: Config,
  tokenStore: TokenStore,
): Promise<Response | null> {
  if (method === "GET" && url.pathname === "/health") {
    return handleHealth();
  }

  if (method === "GET" && url.pathname === "/oauth/start") {
    return handleOAuthStart(config);
  }

  if (method === "GET" && url.pathname === "/oauth/callback") {
    return handleOAuthCallback(url, config, tokenStore);
  }

  return null;
}
