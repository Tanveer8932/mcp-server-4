import type { Config } from "../config/env.js";
import type { CredentialProvider } from "../auth/credentialProvider.js";
import { createAuthenticatedClient } from "../auth/googleOAuth.js";
import type { EmailInput, CreateDraftResult, SendEmailResult } from "../types/index.js";
import { createGmailClient, type GmailClient } from "../integrations/gmail/gmailClient.js";

export interface GmailService {
  createDraft(input: EmailInput): Promise<CreateDraftResult>;
  sendEmail(input: EmailInput): Promise<SendEmailResult>;
}

export class DefaultGmailService implements GmailService {
  constructor(
    private readonly config: Config["google"],
    private readonly credentialProvider: CredentialProvider,
    private readonly clientFactory: (auth: ReturnType<typeof createAuthenticatedClient>) => GmailClient = createGmailClient,
  ) {}

  private async getClient(principal?: string): Promise<GmailClient> {
    const credentials = await this.credentialProvider.getGoogleCredentials(principal);
    const auth = createAuthenticatedClient(this.config, credentials);
    return this.clientFactory(auth);
  }

  async createDraft(input: EmailInput, principal?: string): Promise<CreateDraftResult> {
    const client = await this.getClient(principal);
    return client.createDraft(input);
  }

  async sendEmail(input: EmailInput, principal?: string): Promise<SendEmailResult> {
    const client = await this.getClient(principal);
    return client.sendEmail(input);
  }
}

export function createGmailService(
  config: Config,
  credentialProvider: CredentialProvider,
): GmailService {
  return new DefaultGmailService(config.google, credentialProvider);
}
