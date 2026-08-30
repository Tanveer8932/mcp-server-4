import type { Config } from "../config/env.js";
import type { CredentialProvider } from "../auth/credentialProvider.js";
import { createAuthenticatedClient } from "../auth/googleOAuth.js";
import type { AppendDocumentInput, AppendDocumentResult } from "../types/index.js";
import { createDocsClient, type DocsClient } from "../integrations/googleDocs/docsClient.js";

export interface GoogleDocsService {
  appendContent(input: AppendDocumentInput): Promise<AppendDocumentResult>;
}

export class DefaultGoogleDocsService implements GoogleDocsService {
  constructor(
    private readonly config: Config["google"],
    private readonly credentialProvider: CredentialProvider,
    private readonly clientFactory: (auth: ReturnType<typeof createAuthenticatedClient>) => DocsClient = createDocsClient,
  ) {}

  private async getClient(principal?: string): Promise<DocsClient> {
    const credentials = await this.credentialProvider.getGoogleCredentials(principal);
    const auth = createAuthenticatedClient(this.config, credentials);
    return this.clientFactory(auth);
  }

  async appendContent(
    input: AppendDocumentInput,
    principal?: string,
  ): Promise<AppendDocumentResult> {
    const client = await this.getClient(principal);
    return client.appendContent(input);
  }
}

export function createGoogleDocsService(
  config: Config,
  credentialProvider: CredentialProvider,
): GoogleDocsService {
  return new DefaultGoogleDocsService(config.google, credentialProvider);
}
