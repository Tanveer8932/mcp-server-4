export const ErrorCode = {
  INVALID_INPUT: "INVALID_INPUT",
  AUTH_NOT_CONFIGURED: "AUTH_NOT_CONFIGURED",
  GOOGLE_AUTH_REQUIRED: "GOOGLE_AUTH_REQUIRED",
  GOOGLE_TOKEN_REFRESH_FAILED: "GOOGLE_TOKEN_REFRESH_FAILED",
  INSUFFICIENT_SCOPE: "INSUFFICIENT_SCOPE",
  GMAIL_DRAFT_CREATE_FAILED: "GMAIL_DRAFT_CREATE_FAILED",
  GMAIL_SEND_FAILED: "GMAIL_SEND_FAILED",
  DOC_NOT_FOUND: "DOC_NOT_FOUND",
  DOC_PERMISSION_DENIED: "DOC_PERMISSION_DENIED",
  DOC_APPEND_FAILED: "DOC_APPEND_FAILED",
  GOOGLE_RATE_LIMITED: "GOOGLE_RATE_LIMITED",
  GOOGLE_API_UNAVAILABLE: "GOOGLE_API_UNAVAILABLE",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;

  constructor(code: ErrorCode, message: string, retryable = false, cause?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.retryable = retryable;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}
