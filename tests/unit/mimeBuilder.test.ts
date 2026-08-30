import { describe, expect, it } from "vitest";
import {
  buildMimeMessage,
  encodeEmailForGmail,
  toBase64Url,
} from "../../src/integrations/gmail/mimeBuilder.js";
import type { EmailInput } from "../../src/types/index.js";

const baseInput: EmailInput = {
  to: ["user@example.com"],
  subject: "Hello",
  body: "Test body",
};

describe("mimeBuilder", () => {
  it("builds plain text MIME with To and Subject", () => {
    const mime = buildMimeMessage(baseInput);
    expect(mime).toContain("To: user@example.com");
    expect(mime).toContain("Subject: Hello");
    expect(mime).toContain("Content-Type: text/plain");
    expect(mime).toContain("Test body");
  });

  it("includes Cc and Bcc headers", () => {
    const mime = buildMimeMessage({
      ...baseInput,
      cc: ["cc@example.com"],
      bcc: ["bcc@example.com"],
    });
    expect(mime).toContain("Cc: cc@example.com");
    expect(mime).toContain("Bcc: bcc@example.com");
  });

  it("builds HTML body type", () => {
    const mime = buildMimeMessage({
      ...baseInput,
      body: "<p>Hi</p>",
      bodyType: "html",
    });
    expect(mime).toContain("Content-Type: text/html");
    expect(mime).toContain("<p>Hi</p>");
  });

  it("encodes unicode subject", () => {
    const mime = buildMimeMessage({
      ...baseInput,
      subject: "更新",
    });
    expect(mime).toContain("Subject: =?UTF-8?B?");
  });

  it("produces URL-safe base64 for Gmail raw field", () => {
    const encoded = encodeEmailForGmail(baseInput);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("round-trips base64url encoding", () => {
    const raw = "hello world";
    const encoded = toBase64Url(raw);
    expect(encoded).toBe("aGVsbG8gd29ybGQ");
  });
});
