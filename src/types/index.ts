export type BodyType = "text" | "html";

export type EmailInput = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  bodyType?: BodyType;
};

export type AppendDocumentInput = {
  documentId: string;
  content: string;
  tabId?: string;
  ensureLeadingNewline?: boolean;
};

export type CreateDraftResult = {
  draftId: string;
  threadId?: string;
};

export type SendEmailResult = {
  messageId: string;
  threadId?: string;
};

export type AppendDocumentResult = {
  documentId: string;
  charactersAppended: number;
  revisionId?: string;
  insertLocation?: {
    segmentId?: string;
    index?: number;
  };
};

export type GoogleCredentials = {
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
};

export type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
};

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/documents",
] as const;
