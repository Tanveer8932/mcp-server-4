import { google } from "googleapis";
import { AppError, ErrorCode } from "../errors/codes.js";
import type { Config } from "../config/env.js";
import type { GoogleCredentials, StoredTokens } from "../types/index.js";
import { GOOGLE_SCOPES } from "../types/index.js";
import type { TokenStore } from "./tokenStore/tokenStore.js";

export function createOAuth2Client(config: Config["google"]) {
  return new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri,
  );
}

/** Lets the server learn which Google account completed consent (see the OAuth callback route). */
export const IDENTITY_SCOPES = ["openid", "email"] as const;

export type AuthUrlOptions = {
  state?: string;
  includeIdentity?: boolean;
};

export function getAuthUrl(
  oauth2Client: ReturnType<typeof createOAuth2Client>,
  options: AuthUrlOptions = {},
): string {
  const scope: string[] = [...GOOGLE_SCOPES];
  if (options.includeIdentity) {
    scope.push(...IDENTITY_SCOPES);
  }
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope,
    ...(options.state ? { state: options.state } : {}),
  });
}

type GoogleTokenResponse = Parameters<
  ReturnType<typeof createOAuth2Client>["setCredentials"]
>[0];

function toStoredTokens(tokens: GoogleTokenResponse): StoredTokens {
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new AppError(
      ErrorCode.GOOGLE_AUTH_REQUIRED,
      "OAuth response did not include access and refresh tokens.",
    );
  }
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date ?? Date.now() + 3600 * 1000,
  };
}

export async function exchangeCodeForTokens(
  oauth2Client: ReturnType<typeof createOAuth2Client>,
  code: string,
): Promise<StoredTokens> {
  const { tokens } = await oauth2Client.getToken(code);
  return toStoredTokens(tokens);
}

/**
 * Exchanges the code and returns the tokens together with the verified email of the
 * Google account that granted consent (null if Google did not return a verified email).
 */
export async function exchangeCodeForTokensWithIdentity(
  oauth2Client: ReturnType<typeof createOAuth2Client>,
  code: string,
  clientId: string,
): Promise<{ tokens: StoredTokens; email: string | null }> {
  const { tokens } = await oauth2Client.getToken(code);
  const stored = toStoredTokens(tokens);

  if (!tokens.id_token) {
    return { tokens: stored, email: null };
  }
  const ticket = await oauth2Client.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
  const payload = ticket.getPayload();
  const email = payload?.email_verified && payload.email ? payload.email.toLowerCase() : null;
  return { tokens: stored, email };
}

export function toGoogleCredentials(tokens: StoredTokens): GoogleCredentials {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiryDate: tokens.expiryDate,
  };
}

export async function refreshTokensIfNeeded(
  oauth2Client: ReturnType<typeof createOAuth2Client>,
  tokens: StoredTokens,
  tokenStore: TokenStore,
  principal?: string,
): Promise<GoogleCredentials> {
  oauth2Client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.expiryDate,
  });

  const expiresSoon = tokens.expiryDate - Date.now() < 60_000;
  if (!expiresSoon) {
    return toGoogleCredentials(tokens);
  }

  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    if (!credentials.access_token) {
      throw new AppError(
        ErrorCode.GOOGLE_TOKEN_REFRESH_FAILED,
        "Token refresh did not return an access token.",
      );
    }

    const refreshed: StoredTokens = {
      accessToken: credentials.access_token,
      refreshToken: credentials.refresh_token ?? tokens.refreshToken,
      expiryDate: credentials.expiry_date ?? Date.now() + 3600 * 1000,
    };
    await tokenStore.save(refreshed, principal);
    return toGoogleCredentials(refreshed);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      ErrorCode.GOOGLE_TOKEN_REFRESH_FAILED,
      "Failed to refresh Google access token. Re-authentication may be required.",
      false,
      error,
    );
  }
}

export function createAuthenticatedClient(
  config: Config["google"],
  credentials: GoogleCredentials,
) {
  const oauth2Client = createOAuth2Client(config);
  oauth2Client.setCredentials({
    access_token: credentials.accessToken,
    refresh_token: credentials.refreshToken,
    expiry_date: credentials.expiryDate,
  });
  return oauth2Client;
}
