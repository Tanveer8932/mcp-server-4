import type { ErrorCode } from "./codes.js";

export type ErrorDetail = {
  code: ErrorCode;
  message: string;
  retryable: boolean;
};

export type SuccessEnvelope<T extends Record<string, unknown>> = {
  ok: true;
  action: string;
  status: string;
} & T;

export type ErrorEnvelope = {
  ok: false;
  action: string;
  error: ErrorDetail;
};

export function successResponse<T extends Record<string, unknown>>(
  action: string,
  status: string,
  fields: T,
): SuccessEnvelope<T> {
  return { ok: true, action, status, ...fields };
}

export function errorResponse(
  action: string,
  code: ErrorCode,
  message: string,
  retryable = false,
): ErrorEnvelope {
  return {
    ok: false,
    action,
    error: { code, message, retryable },
  };
}
