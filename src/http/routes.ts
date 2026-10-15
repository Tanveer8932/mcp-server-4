import type { Config } from "../config/env.js";
import {
  createOAuth2Client,
  exchangeCodeForTokensWithIdentity,
  getAuthUrl,
} from "../auth/googleOAuth.js";
import { OAuthStateManager } from "../auth/oauthState.js";
import type { TokenStore } from "../auth/tokenStore/tokenStore.js";
import { checkBearer, unauthorizedResponse } from "./auth.js";

export type RouteOptions = {
  /** Value of the request's Authorization header. */
  authorization?: string | null;
  /** Shared across requests so OAuth `state` values are single-use. */
  oauthState?: OAuthStateManager;
};

export function handleHealth(): Response {
  return Response.json({ status: "ok" });
}

export function handleRoot(config: Config): Response {
  return Response.json({
    service: "google-workspace-mcp-server",
    status: "running",
    endpoints: {
      health: "/health",
      ...(config.oauthRoutes.enabled
        ? { oauthStart: "/oauth/start", oauthCallback: "/oauth/callback" }
        : {}),
      mcp: "/",
    },
  });
}

function notFound(): Response {
  return Response.json({ error: "not_found" }, { status: 404 });
}

export function handleOAuthStart(
  config: Config,
  options: RouteOptions,
  oauthState: OAuthStateManager,
): Response {
  if (!config.oauthRoutes.enabled) {
    return notFound();
  }
  if (!checkBearer(options.authorization, config.oauthRoutes.adminTokenHashes).ok) {
    return unauthorizedResponse("oauth-admin");
  }

  const oauth2Client = createOAuth2Client(config.google);
  const authUrl = getAuthUrl(oauth2Client, {
    state: oauthState.issue(),
    includeIdentity: true,
  });
  return new Response(null, {
    status: 302,
    headers: { Location: authUrl, "Cache-Control": "no-store" },
  });
}

export async function handleOAuthCallback(
  url: URL,
  config: Config,
  tokenStore: TokenStore,
  oauthState: OAuthStateManager,
): Promise<Response> {
  if (!config.oauthRoutes.enabled) {
    return notFound();
  }

  // Reject before touching Google so forged or replayed callbacks cannot change the token store.
  if (!oauthState.consume(url.searchParams.get("state"))) {
    return new Response("Invalid or expired OAuth state.", { status: 400 });
  }

  const error = url.searchParams.get("error");
  if (error) {
    return new Response(`Authentication failed: ${error}`, { status: 400 });
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return new Response("Missing authorization code.", { status: 400 });
  }

  const oauth2Client = createOAuth2Client(config.google);
  const { tokens, email } = await exchangeCodeForTokensWithIdentity(
    oauth2Client,
    code,
    config.google.clientId,
  );
  if (email !== config.oauthRoutes.allowedGoogleAccount) {
    return new Response("This Google account is not allowed to authorize this server.", {
      status: 403,
    });
  }
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
  options: RouteOptions = {},
): Promise<Response | null> {
  if (method === "GET" && url.pathname === "/health") {
    return handleHealth();
  }

  if (method === "GET" && (url.pathname === "/" || url.pathname === "")) {
    return handleRoot(config);
  }

  if (url.pathname === "/oauth/start" || url.pathname === "/oauth/callback") {
    if (method !== "GET" || !config.oauthRoutes.enabled) {
      return notFound();
    }
    const oauthState =
      options.oauthState ?? new OAuthStateManager(config.oauthRoutes.stateSecret);
    return url.pathname === "/oauth/start"
      ? handleOAuthStart(config, options, oauthState)
      : handleOAuthCallback(url, config, tokenStore, oauthState);
  }

  return null;
}
