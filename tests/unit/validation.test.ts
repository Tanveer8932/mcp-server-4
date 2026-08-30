import { describe, expect, it } from "vitest";
import { validateEmailInput, validateAppendDocumentInput } from "../../src/validation/schemas.js";
import { createPayloadLimits } from "../../src/config/limits.js";
import { AppError, ErrorCode } from "../../src/errors/codes.js";
import { buildAppendRequest } from "../../src/integrations/googleDocs/docsClient.js";

const limits = createPayloadLimits(1024, 1024);

describe("email validation", () => {
  it("accepts valid email input", () => {
    const result = validateEmailInput(
      {
        to: ["a@example.com"],
        subject: "Hi",
        body: "Body",
      },
      limits,
    );
    expect(result.to).toEqual(["a@example.com"]);
    expect(result.bodyType).toBe("text");
  });

  it("rejects invalid email addresses", () => {
    expect(() =>
      validateEmailInput(
        { to: ["not-an-email"], subject: "Hi", body: "Body" },
        limits,
      ),
    ).toThrow(AppError);

    try {
      validateEmailInput(
        { to: ["not-an-email"], subject: "Hi", body: "Body" },
        limits,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCode.INVALID_INPUT);
    }
  });

  it("rejects empty recipient list", () => {
    expect(() =>
      validateEmailInput({ to: [], subject: "Hi", body: "Body" }, limits),
    ).toThrow(AppError);
  });

  it("rejects oversized email body", () => {
    expect(() =>
      validateEmailInput(
        { to: ["a@example.com"], subject: "Hi", body: "x".repeat(2000) },
        limits,
      ),
    ).toThrow(AppError);
  });
});

describe("docs validation", () => {
  it("accepts valid append input", () => {
    const result = validateAppendDocumentInput(
      { documentId: "doc123", content: "Notes" },
      limits,
    );
    expect(result.documentId).toBe("doc123");
  });

  it("rejects empty document ID", () => {
    expect(() =>
      validateAppendDocumentInput({ documentId: "", content: "x" }, limits),
    ).toThrow(AppError);
  });
});

describe("docs append request", () => {
  it("uses endOfSegmentLocation without tabId by default", () => {
    const request = buildAppendRequest({ documentId: "doc", content: "Hello" });
    expect(request.insertText?.text).toBe("Hello");
    expect(request.insertText?.endOfSegmentLocation).toEqual({});
  });

  it("includes tabId when provided", () => {
    const request = buildAppendRequest({
      documentId: "doc",
      content: "Hello",
      tabId: "tab-1",
    });
    expect(request.insertText?.endOfSegmentLocation?.tabId).toBe("tab-1");
  });

  it("prepends newline when ensureLeadingNewline is true", () => {
    const request = buildAppendRequest({
      documentId: "doc",
      content: "Hello",
      ensureLeadingNewline: true,
    });
    expect(request.insertText?.text).toBe("\nHello");
  });
});
