import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { docs_v1 } from "googleapis";
import { mapGoogleError } from "../../errors/mapper.js";
import { AppError, ErrorCode } from "../../errors/codes.js";
import type { AppendDocumentInput, AppendDocumentResult } from "../../types/index.js";

export interface DocsClient {
  appendContent(input: AppendDocumentInput): Promise<AppendDocumentResult>;
}

export function buildAppendRequest(input: AppendDocumentInput): docs_v1.Schema$Request {
  let text = input.content;
  if (input.ensureLeadingNewline && !text.startsWith("\n")) {
    text = `\n${text}`;
  }

  const endOfSegmentLocation: docs_v1.Schema$EndOfSegmentLocation = {};
  if (input.tabId) {
    endOfSegmentLocation.tabId = input.tabId;
  }

  return {
    insertText: {
      text,
      endOfSegmentLocation,
    },
  };
}

export class GoogleDocsClient implements DocsClient {
  constructor(private readonly auth: OAuth2Client) {}

  private get docs() {
    return google.docs({ version: "v1", auth: this.auth });
  }

  async appendContent(input: AppendDocumentInput): Promise<AppendDocumentResult> {
    const request = buildAppendRequest(input);
    const textToAppend = request.insertText?.text ?? input.content;

    try {
      const response = await this.docs.documents.batchUpdate({
        documentId: input.documentId,
        requestBody: {
          requests: [request],
        },
      });

      const insertReply = response.data.replies?.[0] as
        | { insertText?: { location?: { segmentId?: string; index?: number } } }
        | undefined;
      return {
        documentId: input.documentId,
        charactersAppended: [...textToAppend].length,
        revisionId: response.data.writeControl?.requiredRevisionId ?? undefined,
        insertLocation: insertReply?.insertText?.location
          ? {
              segmentId: insertReply.insertText.location.segmentId ?? undefined,
              index: insertReply.insertText.location.index ?? undefined,
            }
          : undefined,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw mapGoogleError(error, { docs: true });
    }
  }
}

export function createDocsClient(auth: OAuth2Client): DocsClient {
  return new GoogleDocsClient(auth);
}
