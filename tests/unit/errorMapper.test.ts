import { describe, expect, it } from "vitest";
import { mapGoogleError } from "../../src/errors/mapper.js";
import { ErrorCode } from "../../src/errors/codes.js";

describe("mapGoogleError", () => {
  it("maps 404 docs errors to DOC_NOT_FOUND", () => {
    const error = { response: { status: 404 }, message: "Not Found" };
    const mapped = mapGoogleError(error, { docs: true });
    expect(mapped.code).toBe(ErrorCode.DOC_NOT_FOUND);
  });

  it("maps 403 docs errors to DOC_PERMISSION_DENIED", () => {
    const error = { response: { status: 403 }, message: "Forbidden" };
    const mapped = mapGoogleError(error, { docs: true });
    expect(mapped.code).toBe(ErrorCode.DOC_PERMISSION_DENIED);
  });

  it("maps 429 to GOOGLE_RATE_LIMITED with retryable true", () => {
    const error = { response: { status: 429 }, message: "Rate Limit Exceeded" };
    const mapped = mapGoogleError(error, { gmail: true });
    expect(mapped.code).toBe(ErrorCode.GOOGLE_RATE_LIMITED);
    expect(mapped.retryable).toBe(true);
  });

  it("maps 503 to GOOGLE_API_UNAVAILABLE", () => {
    const error = { response: { status: 503 }, message: "Unavailable" };
    const mapped = mapGoogleError(error, { gmail: true });
    expect(mapped.code).toBe(ErrorCode.GOOGLE_API_UNAVAILABLE);
    expect(mapped.retryable).toBe(true);
  });

  it("sanitizes token fragments from error messages", () => {
    const error = new Error("Error access_token=secret123 failed");
    (error as unknown as { response: { status: number } }).response = { status: 500 };
    const mapped = mapGoogleError(error, { gmail: true });
    expect(mapped.message).not.toContain("secret123");
    expect(mapped.message).toContain("[REDACTED]");
  });
});
