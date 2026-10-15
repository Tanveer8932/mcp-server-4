import { createHash, timingSafeEqual } from "node:crypto";

const SHA256_HEX = /^[0-9a-f]{64}$/;
const BEARER = /^Bearer[ ]+([A-Za-z0-9\-._~+/]+=*)[ ]*$/i;

/**
 * Parses a comma-separated list of hex SHA-256 token hashes.
 * Only hashes are kept in the environment so a leaked env dump does not leak usable tokens.
 */
export function parseTokenHashes(raw: string | undefined, name: string): string[] {
  const hashes = (raw ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  for (const hash of hashes) {
    if (!SHA256_HEX.test(hash)) {
      throw new Error(
        `Invalid ${name}: each entry must be a 64-character hex SHA-256 hash of a token (not the token itself).`,
      );
    }
  }
  return [...new Set(hashes)];
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function extractBearerToken(header: string | null | undefined): string | null {
  if (!header) {
    return null;
  }
  const match = BEARER.exec(header);
  return match ? match[1] : null;
}

export type AuthResult = { ok: true } | { ok: false; reason: "missing" | "invalid" | "unconfigured" };

/** Constant-time check of a presented bearer token against the configured hashes. */
export function checkBearer(header: string | null | undefined, allowedHashes: readonly string[]): AuthResult {
  if (allowedHashes.length === 0) {
    return { ok: false, reason: "unconfigured" };
  }

  const token = extractBearerToken(header);
  if (token === null) {
    return { ok: false, reason: "missing" };
  }

  const presented = Buffer.from(hashToken(token), "hex");
  let matched = false;
  for (const allowed of allowedHashes) {
    // Compare against every hash so timing does not reveal which one matched.
    if (timingSafeEqual(presented, Buffer.from(allowed, "hex"))) {
      matched = true;
    }
  }
  return matched ? { ok: true } : { ok: false, reason: "invalid" };
}

export function unauthorizedResponse(realm: string): Response {
  return Response.json(
    { error: "unauthorized", message: "A valid bearer token is required." },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer realm="${realm}"`,
        "Cache-Control": "no-store",
      },
    },
  );
}
