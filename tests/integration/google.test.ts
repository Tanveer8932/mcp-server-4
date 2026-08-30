/**
 * Integration tests require a dedicated Google test account and valid OAuth tokens.
 *
 * Run with:
 *   RUN_INTEGRATION_TESTS=1 npm run test:integration
 *
 * Required environment variables:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
 *   GOOGLE_TOKEN_STORE_PATH (with valid tokens from `npm run auth`)
 *   TEST_DOC_ID (Google Doc the test account can edit)
 *   TEST_EMAIL_TO (mailbox for send tests)
 */

import { describe, expect, it } from "vitest";

const runIntegration = process.env.RUN_INTEGRATION_TESTS === "1";

describe.skipIf(!runIntegration)("integration", () => {
  it("placeholder for Gmail draft integration test", () => {
    expect(true).toBe(true);
  });
});

describe("integration test setup", () => {
  it("documents opt-in flag", () => {
    expect(process.env.RUN_INTEGRATION_TESTS ?? "").toBeDefined();
  });
});
