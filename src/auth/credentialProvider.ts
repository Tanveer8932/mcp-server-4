import type { Config } from "../config/env.js";
import { AppError, ErrorCode } from "../errors/codes.js";
import type { GoogleCredentials } from "../types/index.js";
import {
  createOAuth2Client,
  refreshTokensIfNeeded,
} from "./googleOAuth.js";
import { EnvTokenStore } from "./tokenStore/envTokenStore.js";
import { FileTokenStore } from "./tokenStore/fileTokenStore.js";
import type { TokenStore } from "./tokenStore/tokenStore.js";

export interface CredentialProvider {
  getGoogleCredentials(principal?: string): Promise<GoogleCredentials>;
}

export class DefaultCredentialProvider implements CredentialProvider {
  constructor(
    private readonly config: Config["google"],
    private readonly tokenStore: TokenStore,
  ) {}

  async getGoogleCredentials(principal?: string): Promise<GoogleCredentials> {
    const stored = await this.tokenStore.load(principal);
    if (!stored) {
      throw new AppError(
        ErrorCode.GOOGLE_AUTH_REQUIRED,
        "Google authorization is required. Run `npm run auth` to authenticate.",
      );
    }

    const oauth2Client = createOAuth2Client(this.config);
    return refreshTokensIfNeeded(oauth2Client, stored, this.tokenStore, principal);
  }
}

export function createTokenStore(google: Config["google"]): TokenStore {
  if (google.tokensJson) {
    return new EnvTokenStore(google.tokensJson);
  }
  return new FileTokenStore(google.tokenStorePath);
}

export function createCredentialProvider(config: Config): CredentialProvider {
  const tokenStore = createTokenStore(config.google);
  return new DefaultCredentialProvider(config.google, tokenStore);
}
