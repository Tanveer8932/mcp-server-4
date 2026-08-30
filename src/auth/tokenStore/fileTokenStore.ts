import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { StoredTokens } from "../../types/index.js";
import type { TokenStore } from "./tokenStore.js";

type TokenFile = Record<string, StoredTokens>;

export class FileTokenStore implements TokenStore {
  constructor(private readonly filePath: string) {}

  private key(principal?: string): string {
    return principal ?? "default";
  }

  private async readStore(): Promise<TokenFile> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as TokenFile;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {};
      }
      throw error;
    }
  }

  async load(principal?: string): Promise<StoredTokens | null> {
    const store = await this.readStore();
    return store[this.key(principal)] ?? null;
  }

  async save(tokens: StoredTokens, principal?: string): Promise<void> {
    const store = await this.readStore();
    store[this.key(principal)] = tokens;
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(store, null, 2), { mode: 0o600 });
  }
}
