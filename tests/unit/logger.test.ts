import { describe, expect, it } from "vitest";
import { Logger } from "../../src/logging/logger.js";

describe("Logger redaction", () => {
  it("redacts sensitive fields from log output", () => {
    const logs: string[] = [];
    const original = console.error;
    console.error = (msg: string) => logs.push(msg);

    try {
      const logger = new Logger("info");
      logger.info("test", {
        accessToken: "secret-token",
        body: "email body content",
        recipientCount: 2,
      });

      expect(logs.length).toBe(1);
      const parsed = JSON.parse(logs[0]!) as Record<string, unknown>;
      expect(parsed.accessToken).toBeUndefined();
      expect(parsed.body).toBeUndefined();
      expect(parsed.bodyLength).toBe(18);
      expect(parsed.recipientCount).toBe(2);
    } finally {
      console.error = original;
    }
  });
});
