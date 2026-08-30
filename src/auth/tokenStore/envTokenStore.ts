import type { StoredTokens } from "../../types/index.js";
import type { TokenStore } from "./tokenStore.js";

type TokenFile = Record<string, StoredTokens>;

/**
 * Loads OAuth tokens from a JSON env var (e.g. Railway secret).
 * Refreshed access tokens are kept in memory for the process lifetime.
 */
export class EnvTokenStore implements TokenStore {
  private cache: TokenFile;

  constructor(private readonly tokensJson: string) {
    this.cache = this.parse(tokensJson);
  }

  private key(principal?: string): string {
    return principal ?? "default";
  }

  private parse(raw: string): TokenFile {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "accessToken" in parsed &&
      "refreshToken" in parsed &&
      "expiryDate" in parsed
    ) {
      return { default: parsed as StoredTokens };
    }
    return parsed as TokenFile;
  }

  async load(principal?: string): Promise<StoredTokens | null> {
    return this.cache[this.key(principal)] ?? null;
  }

  async save(tokens: StoredTokens, principal?: string): Promise<void> {
    this.cache[this.key(principal)] = tokens;
  }
}
