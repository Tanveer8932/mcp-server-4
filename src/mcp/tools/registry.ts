import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { Config } from "../../config/env.js";
import type { ToolName } from "../../config/tools.js";
import type { CredentialProvider } from "../../auth/credentialProvider.js";
import type { Logger } from "../../logging/logger.js";
import { createGmailService } from "../../services/gmailService.js";
import { createGoogleDocsService } from "../../services/googleDocsService.js";
import {
  countRecipients,
  validateAppendDocumentInput,
  validateEmailInput,
} from "../../validation/schemas.js";
import { executeTool } from "./handlerUtils.js";

const emailInputSchema = z
  .object({
    to: z.array(z.string().email()).min(1),
    cc: z.array(z.string().email()).default([]),
    bcc: z.array(z.string().email()).default([]),
    subject: z.string().min(1),
    body: z.string().min(1),
    bodyType: z.enum(["text", "html"]).default("text"),
  })
  .strict();

const appendDocumentInputSchema = z
  .object({
    documentId: z.string().min(1),
    content: z.string().min(1),
    tabId: z.string().optional(),
    ensureLeadingNewline: z.boolean().default(false),
  })
  .strict();

export function registerTools(
  server: McpServer,
  config: Config,
  credentialProvider: CredentialProvider,
  logger: Logger,
): void {
  const gmailService = createGmailService(config, credentialProvider);
  const docsService = createGoogleDocsService(config, credentialProvider);
  const enabled = new Set<ToolName>(config.tools.enabled);

  if (enabled.has("gmail_create_draft")) {
    server.registerTool(
      "gmail_create_draft",
      {
        title: "Create Gmail Draft",
        description:
          "Create a Gmail draft for the authenticated Google account. This does not send the email.",
        inputSchema: emailInputSchema,
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      async (input) =>
        executeTool({
          action: "gmail_create_draft",
          logger,
          logFields: {
            recipientCount: countRecipients(validateEmailInput(input, config.limits)),
          },
          execute: async () => {
            const validated = validateEmailInput(input, config.limits);
            const result = await gmailService.createDraft(validated);
            return {
              draftId: result.draftId,
              threadId: result.threadId,
              status: "draft_created",
            };
          },
        }),
    );
  }

  if (enabled.has("gmail_send_email")) {
    server.registerTool(
      "gmail_send_email",
      {
        title: "Send Gmail Email",
        description:
          "Send an email through the authenticated Google account. This causes an external side effect and sends immediately.",
        inputSchema: emailInputSchema,
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      async (input) =>
        executeTool({
          action: "gmail_send_email",
          logger,
          logFields: {
            recipientCount: countRecipients(validateEmailInput(input, config.limits)),
          },
          execute: async () => {
            const validated = validateEmailInput(input, config.limits);
            const result = await gmailService.sendEmail(validated);
            return {
              messageId: result.messageId,
              threadId: result.threadId,
              status: "sent",
            };
          },
        }),
    );
  }

  if (enabled.has("google_docs_append_content")) {
    server.registerTool(
      "google_docs_append_content",
      {
        title: "Append Google Doc Content",
        description:
          "Append content to the end of an existing Google Doc that the authenticated Google account is allowed to edit.",
        inputSchema: appendDocumentInputSchema,
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      async (input) =>
        executeTool({
          action: "google_docs_append_content",
          logger,
          execute: async () => {
            const validated = validateAppendDocumentInput(input, config.limits);
            const result = await docsService.appendContent(validated);
            return {
              documentId: result.documentId,
              charactersAppended: result.charactersAppended,
              revisionId: result.revisionId,
              status: "appended",
            };
          },
        }),
    );
  }
}
