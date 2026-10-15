import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

type StatePayload = { n: string; exp: number };

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/**
 * Issues and verifies HMAC-signed, short-lived, single-use OAuth `state` values.
 * Single-use tracking is in memory, which is sufficient for one Railway replica.
 */
export class OAuthStateManager {
  private readonly used = new Map<string, number>();

  constructor(
    private readonly secret: string,
    private readonly ttlMs: number = OAUTH_STATE_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  issue(): string {
    const payload: StatePayload = {
      n: randomBytes(16).toString("base64url"),
      exp: this.now() + this.ttlMs,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${encoded}.${sign(this.secret, encoded)}`;
  }

  /** Returns true once for a valid, unexpired state; false otherwise. */
  consume(state: string | null): boolean {
    if (!state) {
      return false;
    }
    const [encoded, signature, extra] = state.split(".");
    if (!encoded || !signature || extra !== undefined) {
      return false;
    }

    const expected = Buffer.from(sign(this.secret, encoded));
    const presented = Buffer.from(signature);
    if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) {
      return false;
    }

    let payload: StatePayload;
    try {
      payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as StatePayload;
    } catch {
      return false;
    }
    if (typeof payload.n !== "string" || typeof payload.exp !== "number") {
      return false;
    }

    const now = this.now();
    this.prune(now);
    if (payload.exp <= now || this.used.has(payload.n)) {
      return false;
    }
    this.used.set(payload.n, payload.exp);
    return true;
  }

  private prune(now: number): void {
    for (const [nonce, exp] of this.used) {
      if (exp <= now) {
        this.used.delete(nonce);
      }
    }
  }
}
