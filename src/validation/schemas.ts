import { z } from "zod";
import { AppError, ErrorCode } from "../errors/codes.js";
import type { PayloadLimits } from "../config/limits.js";
import type { EmailInput, AppendDocumentInput } from "../types/index.js";

const emailAddressSchema = z.string().email();

export const emailInputSchema = z
  .object({
    to: z.array(emailAddressSchema).min(1, "At least one recipient is required"),
    cc: z.array(emailAddressSchema).default([]),
    bcc: z.array(emailAddressSchema).default([]),
    subject: z.string().min(1, "Subject is required"),
    body: z.string().min(1, "Body is required"),
    bodyType: z.enum(["text", "html"]).default("text"),
  })
  .strict();

export const appendDocumentInputSchema = z
  .object({
    documentId: z.string().min(1, "documentId is required"),
    content: z.string().min(1, "content is required"),
    tabId: z.string().optional(),
    ensureLeadingNewline: z.boolean().default(false),
  })
  .strict();

export function validateEmailInput(input: unknown, limits: PayloadLimits): EmailInput {
  const parsed = emailInputSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join("; ");
    throw new AppError(ErrorCode.INVALID_INPUT, message);
  }

  const bodyBytes = Buffer.byteLength(parsed.data.body, "utf8");
  if (bodyBytes > limits.maxEmailBodyBytes) {
    throw new AppError(
      ErrorCode.PAYLOAD_TOO_LARGE,
      `Email body exceeds maximum size of ${limits.maxEmailBodyBytes} bytes.`,
    );
  }

  return parsed.data;
}

export function validateAppendDocumentInput(
  input: unknown,
  limits: PayloadLimits,
): AppendDocumentInput {
  const parsed = appendDocumentInputSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join("; ");
    throw new AppError(ErrorCode.INVALID_INPUT, message);
  }

  const contentBytes = Buffer.byteLength(parsed.data.content, "utf8");
  if (contentBytes > limits.maxDocAppendBytes) {
    throw new AppError(
      ErrorCode.PAYLOAD_TOO_LARGE,
      `Document content exceeds maximum size of ${limits.maxDocAppendBytes} bytes.`,
    );
  }

  return parsed.data;
}

export function countRecipients(input: EmailInput): number {
  return input.to.length + (input.cc?.length ?? 0) + (input.bcc?.length ?? 0);
}
