import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { mapGoogleError } from "../../errors/mapper.js";
import { AppError, ErrorCode } from "../../errors/codes.js";
import type { EmailInput, CreateDraftResult, SendEmailResult } from "../../types/index.js";
import { encodeEmailForGmail } from "./mimeBuilder.js";

export interface GmailClient {
  createDraft(input: EmailInput): Promise<CreateDraftResult>;
  sendEmail(input: EmailInput): Promise<SendEmailResult>;
}

export class GoogleGmailClient implements GmailClient {
  constructor(private readonly auth: OAuth2Client) {}

  private get gmail() {
    return google.gmail({ version: "v1", auth: this.auth });
  }

  async createDraft(input: EmailInput): Promise<CreateDraftResult> {
    try {
      const raw = encodeEmailForGmail(input);
      const response = await this.gmail.users.drafts.create({
        userId: "me",
        requestBody: {
          message: { raw },
        },
      });

      const draftId = response.data.id;
      if (!draftId) {
        throw new AppError(ErrorCode.GMAIL_DRAFT_CREATE_FAILED, "Gmail did not return a draft ID.");
      }

      return {
        draftId,
        threadId: response.data.message?.threadId ?? undefined,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw mapGoogleError(error, { gmail: true });
    }
  }

  async sendEmail(input: EmailInput): Promise<SendEmailResult> {
    try {
      const raw = encodeEmailForGmail(input);
      const response = await this.gmail.users.messages.send({
        userId: "me",
        requestBody: { raw },
      });

      const messageId = response.data.id;
      if (!messageId) {
        throw new AppError(ErrorCode.GMAIL_SEND_FAILED, "Gmail did not return a message ID.");
      }

      return {
        messageId,
        threadId: response.data.threadId ?? undefined,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw mapGoogleError(error, { gmail: true });
    }
  }
}

export function createGmailClient(auth: OAuth2Client): GmailClient {
  return new GoogleGmailClient(auth);
}
