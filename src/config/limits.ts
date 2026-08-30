export const DEFAULT_MAX_EMAIL_BODY_BYTES = 1_048_576;
export const DEFAULT_MAX_DOC_APPEND_BYTES = 1_048_576;

export type PayloadLimits = {
  maxEmailBodyBytes: number;
  maxDocAppendBytes: number;
};

export function createPayloadLimits(
  maxEmailBodyBytes: number,
  maxDocAppendBytes: number,
): PayloadLimits {
  return { maxEmailBodyBytes, maxDocAppendBytes };
}
