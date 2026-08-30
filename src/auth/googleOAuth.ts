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

export function getAuthUrl(oauth2Client: ReturnType<typeof createOAuth2Client>): string {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [...GOOGLE_SCOPES],
  });
}

export async function exchangeCodeForTokens(
  oauth2Client: ReturnType<typeof createOAuth2Client>,
  code: string,
): Promise<StoredTokens> {
  const { tokens } = await oauth2Client.getToken(code);
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
