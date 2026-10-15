#!/usr/bin/env tsx
/**
 * Generates a random bearer token and its SHA-256 hash.
 *
 *   npm run auth:token
 *
 * - Put the HASH in the server's MCP_AUTH_TOKEN_SHA256 (or OAUTH_ADMIN_TOKEN_SHA256).
 * - Give the TOKEN to the client (e.g. MCP_AUTH_TOKEN). It is shown once and never stored here.
 */
import { randomBytes } from "node:crypto";
import { hashToken } from "../src/http/auth.js";

const token = randomBytes(32).toString("base64url");

console.log("\nBearer token (give to the client; store as a secret; shown once):\n");
console.log(`  ${token}`);
console.log("\nSHA-256 hash (set on the server, e.g. MCP_AUTH_TOKEN_SHA256):\n");
console.log(`  ${hashToken(token)}\n`);
console.log("To rotate: append the new hash comma-separated, deploy, update clients, then remove the old hash.\n");
