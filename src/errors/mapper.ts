import type { GaxiosError } from "gaxios";
import { AppError, ErrorCode } from "./codes.js";

const SENSITIVE_PATTERNS = [
  /access_token[=:]\S+/gi,
  /refresh_token[=:]\S+/gi,
  /Bearer\s+\S+/gi,
  /client_secret[=:]\S+/gi,
];

export function sanitizeMessage(message: string): string {
  let sanitized = message;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  return sanitized.slice(0, 500);
}

function getStatusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const gaxios = error as GaxiosError;
  return gaxios.response?.status ?? gaxios.status;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }
  if (error instanceof Error) {
    return sanitizeMessage(error.message);
  }
  return "An unexpected error occurred.";
}

export function mapGoogleError(error: unknown, context: { gmail?: boolean; docs?: boolean }): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const status = getStatusCode(error);
  const rawMessage =
    error instanceof Error ? error.message : "Google API request failed.";
  const message = sanitizeMessage(rawMessage);

  if (status === 401) {
    return new AppError(ErrorCode.GOOGLE_AUTH_REQUIRED, "Google authorization is required.", false, error);
  }

  if (status === 403) {
    const insufficientScope =
      message.toLowerCase().includes("insufficient") ||
      message.toLowerCase().includes("scope");

    if (insufficientScope) {
      return new AppError(ErrorCode.INSUFFICIENT_SCOPE, message, false, error);
    }

    if (context.docs) {
      return new AppError(ErrorCode.DOC_PERMISSION_DENIED, message, false, error);
    }

    return new AppError(
      context.gmail ? ErrorCode.GMAIL_SEND_FAILED : ErrorCode.DOC_APPEND_FAILED,
      message,
      false,
      error,
    );
  }

  if (status === 404 && context.docs) {
    return new AppError(ErrorCode.DOC_NOT_FOUND, "Document not found.", false, error);
  }

  if (status === 429) {
    return new AppError(ErrorCode.GOOGLE_RATE_LIMITED, message, true, error);
  }

  if (status !== undefined && status >= 500) {
    return new AppError(ErrorCode.GOOGLE_API_UNAVAILABLE, message, true, error);
  }

  if (context.gmail) {
    return new AppError(ErrorCode.GMAIL_SEND_FAILED, message, false, error);
  }

  if (context.docs) {
    return new AppError(ErrorCode.DOC_APPEND_FAILED, message, false, error);
  }

  return new AppError(ErrorCode.INTERNAL_ERROR, message, false, error);
}

export function mapToAppError(error: unknown, action: string): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const message = getErrorMessage(error);

  if (action.startsWith("gmail_create_draft")) {
    return mapGoogleError(error, { gmail: true });
  }
  if (action.startsWith("gmail_send")) {
    return mapGoogleError(error, { gmail: true });
  }
  if (action.startsWith("google_docs")) {
    return mapGoogleError(error, { docs: true });
  }

  return new AppError(ErrorCode.INTERNAL_ERROR, message, false, error);
}
