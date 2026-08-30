import type { StoredTokens } from "../../types/index.js";

export interface TokenStore {
  load(principal?: string): Promise<StoredTokens | null>;
  save(tokens: StoredTokens, principal?: string): Promise<void>;
}
