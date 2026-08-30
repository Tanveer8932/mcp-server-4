# Problem Statement: Generic Google Workspace MCP Server

## 1. Overview

Build a reusable **Model Context Protocol (MCP) server** that allows AI agents to interact with selected Google Workspace capabilities through well-defined MCP tools.

The MCP server must initially support:

1. **Gmail**
   - Create an email draft.
   - Send an email.

2. **Google Docs**
   - Append content to an existing Google Doc.

The server must be **agent-agnostic**. It should not contain logic that is specific to one AI agent, one prompt, one application, Cursor, Antigravity, or any particular LLM provider. Any MCP-compatible client should be able to discover and invoke the exposed tools.

The server acts as a secure integration layer:

```text
AI Agent / MCP Client
        |
        | Model Context Protocol
        v
Generic Google Workspace MCP Server
        |
        +--------------------+
        |                    |
        v                    v
   Gmail API           Google Docs API
```

---

## 2. Objective

Create a production-ready MCP server that exposes a small, predictable set of Google Workspace actions to AI agents while handling:

- MCP tool discovery and invocation.
- Google OAuth 2.0 authentication.
- Gmail API integration.
- Google Docs API integration.
- Input validation.
- Consistent responses.
- Error handling.
- Logging and observability.
- Secure credential/token handling.
- Configuration through environment variables.
- Local development and deployment documentation.

The implementation should favor **clear interfaces, minimal permissions, and portability across MCP clients**.

---

## 3. Primary Use Cases

### Use Case A: Create an Email Draft

An AI agent has generated an email and wants to save it in the authenticated user's Gmail account without sending it.

Example request:

```json
{
  "to": ["user@example.com"],
  "cc": [],
  "bcc": [],
  "subject": "Project status update",
  "body": "Hi team,\n\nHere is the latest project update...",
  "bodyType": "text"
}
```

Expected result:

- A Gmail draft is created.
- The MCP tool returns a stable machine-readable response containing at least:
  - draft ID
  - thread ID, if available
  - recipients
  - subject
  - status

The tool must **not send** the email.

---

### Use Case B: Send an Email

An AI agent wants to send an email through the authenticated user's Gmail account.

Example request:

```json
{
  "to": ["user@example.com"],
  "cc": ["manager@example.com"],
  "bcc": [],
  "subject": "Project status update",
  "body": "Hi team,\n\nHere is the latest project update...",
  "bodyType": "text"
}
```

Expected result:

- The email is sent using the Gmail API.
- The MCP tool returns at least:
  - Gmail message ID
  - thread ID, if available
  - status

This is a side-effecting operation and must be clearly described as such in MCP tool metadata and documentation.

---

### Use Case C: Append Content to a Google Doc

An AI agent wants to add content to the end of an existing Google Doc.

Example request:

```json
{
  "documentId": "1AbCdEf...",
  "content": "\n\n## Meeting Notes\n- Decision 1\n- Decision 2"
}
```

Expected result:

- The content is appended to the end of the document body.
- Existing document content must not be replaced.
- The MCP tool returns at least:
  - document ID
  - success status
  - number of characters appended
  - any relevant Google API revision/write metadata that is readily available

---

## 4. Scope

### In Scope

The first version must implement:

- MCP server initialization and tool discovery.
- `gmail_create_draft`
- `gmail_send_email`
- `google_docs_append_content`
- Google OAuth 2.0 authentication.
- Secure access-token/refresh-token usage.
- Gmail MIME message creation.
- Plain-text email support.
- Optional HTML email support if it can be added cleanly.
- To/Cc/Bcc support.
- Google Docs append-at-end behavior.
- Multi-tab Google Docs support where practical, with a documented default.
- Structured success responses.
- Structured error responses.
- Request validation.
- Logging that does not leak email bodies, document contents, or OAuth credentials.
- README/setup instructions.
- Example MCP client configuration.
- Unit tests.
- Integration-test strategy.
- `.env.example`.
- Docker support if practical.

### Out of Scope for V1

Do not add these unless required for the core design:

- Reading Gmail inbox/messages.
- Searching Gmail.
- Deleting messages.
- Managing Gmail labels.
- Replying to an existing email/thread.
- Email scheduling.
- Attachments.
- Editing an existing draft.
- Reading Google Docs content.
- Creating new Google Docs.
- Replacing arbitrary document content.
- Rich Google Docs formatting.
- Comments or suggestions in Google Docs.
- Google Sheets.
- Google Calendar.
- Agent-specific prompts or workflows.
- LLM calls inside the MCP server.
- Storing conversation history.

The architecture should make future tools possible without requiring a rewrite.

---

## 5. Functional Requirements

## 5.1 MCP Server

The server must:

1. Follow the current Model Context Protocol specification supported by the chosen official/maintained MCP SDK.
2. Expose tools through standard MCP tool discovery.
3. Define clear JSON Schemas for tool inputs.
4. Return deterministic, machine-readable tool results.
5. Keep tool names stable.
6. Keep Google-specific implementation details behind service/adaptor modules rather than mixing them into MCP handlers.
7. Be usable by multiple MCP-compatible agents without code changes.

Recommended logical layering:

```text
src/
  mcp/
    server
    tools/
  auth/
    googleOAuth
    tokenStore
  integrations/
    gmail/
      gmailClient
      mimeBuilder
    googleDocs/
      docsClient
  validation/
  errors/
  config/
  logging/
```

Exact folder structure may vary, but responsibilities must remain separated.

---

## 5.2 Tool: `gmail_create_draft`

### Purpose

Create a draft email in Gmail without sending it.

### Input Schema

Suggested schema:

```json
{
  "type": "object",
  "properties": {
    "to": {
      "type": "array",
      "items": { "type": "string", "format": "email" },
      "minItems": 1
    },
    "cc": {
      "type": "array",
      "items": { "type": "string", "format": "email" },
      "default": []
    },
    "bcc": {
      "type": "array",
      "items": { "type": "string", "format": "email" },
      "default": []
    },
    "subject": {
      "type": "string"
    },
    "body": {
      "type": "string"
    },
    "bodyType": {
      "type": "string",
      "enum": ["text", "html"],
      "default": "text"
    }
  },
  "required": ["to", "subject", "body"],
  "additionalProperties": false
}
```

### Behavior

- Validate all recipient email addresses.
- Construct a valid MIME email.
- Encode the Gmail `raw` message using URL-safe Base64 as required by Gmail.
- Call the Gmail drafts API.
- Do not send the draft.
- Do not log the full email body in production logs.

### Suggested Output

```json
{
  "ok": true,
  "action": "gmail_create_draft",
  "draftId": "r123456",
  "threadId": "18abc...",
  "status": "draft_created"
}
```

---

## 5.3 Tool: `gmail_send_email`

### Purpose

Send an email immediately through Gmail.

### Input Schema

Use the same email fields as `gmail_create_draft`:

```json
{
  "type": "object",
  "properties": {
    "to": {
      "type": "array",
      "items": { "type": "string", "format": "email" },
      "minItems": 1
    },
    "cc": {
      "type": "array",
      "items": { "type": "string", "format": "email" },
      "default": []
    },
    "bcc": {
      "type": "array",
      "items": { "type": "string", "format": "email" },
      "default": []
    },
    "subject": {
      "type": "string"
    },
    "body": {
      "type": "string"
    },
    "bodyType": {
      "type": "string",
      "enum": ["text", "html"],
      "default": "text"
    }
  },
  "required": ["to", "subject", "body"],
  "additionalProperties": false
}
```

### Behavior

- Validate recipients.
- Construct MIME content.
- Encode the message as URL-safe Base64.
- Send through the Gmail API.
- Return the Google-generated message ID.
- Never silently convert a request to "draft" behavior.
- Never retry a send in a way that can cause duplicate emails without considering idempotency.

### Suggested Output

```json
{
  "ok": true,
  "action": "gmail_send_email",
  "messageId": "18abc...",
  "threadId": "18abc...",
  "status": "sent"
}
```

### Safety Requirement

Tool documentation must make it obvious to an MCP client that this operation has an external side effect.

Where supported by the MCP SDK/specification, provide appropriate tool annotations/hints indicating that this is not read-only and can produce an external action.

The MCP server itself should not invent recipients, subjects, or email content. It executes validated tool inputs supplied by the MCP client.

---

## 5.4 Tool: `google_docs_append_content`

### Purpose

Append text to the end of an existing Google Doc.

### Suggested Input Schema

```json
{
  "type": "object",
  "properties": {
    "documentId": {
      "type": "string",
      "minLength": 1
    },
    "content": {
      "type": "string",
      "minLength": 1
    },
    "tabId": {
      "type": "string",
      "description": "Optional Google Docs tab ID. If omitted, append to the first/default tab."
    }
  },
  "required": ["documentId", "content"],
  "additionalProperties": false
}
```

### Behavior

Use the Google Docs `documents.batchUpdate` API with an `InsertTextRequest`.

Prefer `endOfSegmentLocation` so the service appends to the document body instead of requiring the AI agent to calculate document indexes.

Expected request conceptually:

```json
{
  "requests": [
    {
      "insertText": {
        "text": "content to append",
        "endOfSegmentLocation": {}
      }
    }
  ]
}
```

If `tabId` is supplied, target that tab according to Google Docs API semantics.

### Newline Handling

The implementation must define predictable behavior.

Recommended behavior:

- Append the input exactly as provided by default.
- Do not silently rewrite or summarize content.
- Do not automatically add formatting.
- If the implementation chooses to add a separating newline, expose that behavior as an explicit option such as:

```json
{
  "ensureLeadingNewline": true
}
```

Avoid hidden content mutations.

### Suggested Output

```json
{
  "ok": true,
  "action": "google_docs_append_content",
  "documentId": "1AbCdEf...",
  "charactersAppended": 142,
  "status": "appended"
}
```

---

## 6. Authentication and Authorization

## 6.1 Google OAuth 2.0

Use Google OAuth 2.0.

The MCP server must not require an AI agent to directly handle Google access tokens or refresh tokens as tool parameters.

Credentials must be managed by the integration/authentication layer.

At minimum, support:

- OAuth client ID.
- OAuth client secret when required by the selected OAuth client type.
- Access token.
- Refresh token.
- Token expiration.
- Automatic token refresh.
- Secure persistence or an injectable token-store abstraction.

For local development, file-backed token storage may be acceptable.

For production, design the token store so it can be replaced by a secret manager, encrypted database, or platform credential store.

---

## 6.2 OAuth Scopes

Request the narrowest Google scopes that satisfy the feature set.

### Gmail

For creating drafts and sending email, prefer:

```text
https://www.googleapis.com/auth/gmail.compose
```

This scope supports managing drafts and sending email.

If the implementation only supported direct sending, `gmail.send` would be narrower, but because V1 also requires draft creation, `gmail.compose` is the practical shared scope.

Do not request the broad `https://mail.google.com/` scope unless there is a concrete requirement.

### Google Docs

Evaluate:

```text
https://www.googleapis.com/auth/drive.file
```

where the product's authorization/file-selection model makes per-file access practical.

Otherwise, editing arbitrary existing Google Docs may require:

```text
https://www.googleapis.com/auth/documents
```

The README must explain the chosen scope, why it is needed, and the implications of using a sensitive scope.

Do not request full Google Drive access unless a future requirement genuinely needs it.

---

## 6.3 Multi-User / Generic Design

Do not hard-code one Gmail account or one Google account into the service layer.

Design authentication so that a future deployment can support credentials per authenticated user/tenant.

A simple local V1 may use one configured Google account, but interfaces must not make that assumption permanent.

A recommended internal abstraction is:

```text
CredentialProvider.getCredentials(principal)
```

rather than reading one global token directly inside Gmail/Docs tool handlers.

For remote deployments, the identity of the MCP caller and the identity of the connected Google account must be explicitly mapped.

---

## 7. Security Requirements

The implementation must:

- Never expose client secrets, access tokens, or refresh tokens in MCP tool outputs.
- Never place OAuth tokens in MCP tool input schemas.
- Never log OAuth tokens.
- Avoid logging full email bodies or appended document content.
- Validate all external inputs.
- Reject malformed email addresses.
- Reject empty document IDs.
- Reject unexpectedly large payloads using configurable limits.
- Sanitize error output so upstream Google responses do not accidentally leak secrets.
- Use HTTPS for remote deployments.
- Follow least-privilege OAuth scope selection.
- Keep secrets in environment variables or a secret-management system.
- Include `.env` in `.gitignore`.
- Provide `.env.example` with placeholders only.
- Avoid storing Google credentials in source code.
- Avoid returning Bcc values unnecessarily in logs/telemetry.

For email sending, document that the MCP host/client should use human confirmation or an equivalent approval mechanism before high-impact sends when appropriate.

---

## 8. Error Handling

Define one consistent error envelope.

Example:

```json
{
  "ok": false,
  "action": "gmail_send_email",
  "error": {
    "code": "GOOGLE_AUTH_REQUIRED",
    "message": "Google authorization is required before this action can be completed.",
    "retryable": false
  }
}
```

Recommended application-level error codes:

```text
INVALID_INPUT
AUTH_NOT_CONFIGURED
GOOGLE_AUTH_REQUIRED
GOOGLE_TOKEN_REFRESH_FAILED
INSUFFICIENT_SCOPE
GMAIL_DRAFT_CREATE_FAILED
GMAIL_SEND_FAILED
DOC_NOT_FOUND
DOC_PERMISSION_DENIED
DOC_APPEND_FAILED
GOOGLE_RATE_LIMITED
GOOGLE_API_UNAVAILABLE
PAYLOAD_TOO_LARGE
INTERNAL_ERROR
```

Do not return raw stack traces to the MCP client in production.

Errors should preserve enough context for an AI agent to decide whether it can correct the request or must ask the user for action.

Examples:

- Invalid recipient -> agent can correct input.
- Missing Google authorization -> user/admin action required.
- Permission denied on document -> user must grant access/use another document.
- Rate limit -> may be retryable.
- Send request with unknown completion state -> do not automatically retry if duplicate delivery is possible.

---

## 9. Idempotency and Retry Policy

This is especially important for email sending.

### Gmail Draft Creation

A retry may create duplicate drafts.

Do not blindly retry after an ambiguous network failure.

### Gmail Send

A retry may send duplicate emails.

Therefore:

- Automatically retry only when it is safe.
- Use exponential backoff for clearly retryable pre-operation failures/rate limits.
- Treat network failures after the request may have reached Google as an ambiguous state.
- Do not perform an automatic duplicate send merely because the HTTP client timed out.
- Document this behavior.

Optional future enhancement:

```json
{
  "idempotencyKey": "caller-generated-stable-key"
}
```

If implemented, store request/result mappings in an appropriate persistence layer.

### Google Docs Append

A retry can duplicate appended content.

Apply the same principle: do not blindly replay an append after an ambiguous outcome.

---

## 10. Logging and Observability

Use structured logs.

Recommended fields:

```text
timestamp
level
requestId
toolName
principal/tenant identifier if available
googleApi
durationMs
resultStatus
errorCode
```

Do not log by default:

```text
accessToken
refreshToken
clientSecret
email body
full document append content
bcc recipients
```

Recipient email addresses may also be considered sensitive. Prefer counts or masked values in standard logs.

Example:

```json
{
  "level": "info",
  "requestId": "req_123",
  "toolName": "gmail_send_email",
  "recipientCount": 2,
  "durationMs": 481,
  "resultStatus": "success"
}
```

---

## 11. Configuration

Use environment-based configuration.

Suggested `.env.example`:

```dotenv
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
GOOGLE_TOKEN_STORE_PATH=

MCP_TRANSPORT=
MCP_HOST=
MCP_PORT=

LOG_LEVEL=info

MAX_EMAIL_BODY_BYTES=
MAX_DOC_APPEND_BYTES=
```

Only include variables that the chosen implementation actually requires.

Validate configuration at startup and fail with a clear message if mandatory configuration is missing.

---

## 12. MCP Transport

The business logic must not depend on a single transport.

Support the transport recommended by the current MCP SDK for the chosen deployment model.

At minimum:

- Make local development easy for desktop/IDE MCP clients.
- Structure the server so a remote HTTP deployment can be added or enabled without rewriting Gmail/Docs integrations.

The implementation should follow the current MCP protocol/SDK rather than copying assumptions from older MCP tutorials.

---

## 13. Implementation Guidance

A TypeScript/Node.js implementation is a good default because it integrates well with:

- MCP TypeScript SDK.
- Google APIs Node.js client.
- JSON Schema/Zod-style validation.
- Cursor and other developer tooling.

However, the problem statement is intentionally implementation-language agnostic.

If TypeScript is selected, prefer:

```text
TypeScript
Node.js current LTS
Official/maintained MCP SDK
googleapis
zod or equivalent validation library
vitest/jest or equivalent test runner
```

Do not manually implement OAuth, MIME, or HTTP behavior when a maintained library provides a safe implementation.

---

## 14. Suggested Internal Interfaces

Example conceptual interfaces:

```ts
interface GmailService {
  createDraft(input: EmailInput): Promise<CreateDraftResult>;
  sendEmail(input: EmailInput): Promise<SendEmailResult>;
}

interface GoogleDocsService {
  appendContent(input: AppendDocumentInput): Promise<AppendDocumentResult>;
}

interface CredentialProvider {
  getGoogleCredentials(principal?: string): Promise<GoogleCredentials>;
}
```

MCP tool handlers should remain thin:

```text
validate input
    ->
resolve credentials
    ->
call service
    ->
map integration result to stable MCP result
```

Do not put Google API calls directly throughout MCP protocol code.

---

## 15. Data Contracts

Define common internal types.

### EmailInput

```ts
type EmailInput = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  bodyType?: "text" | "html";
};
```

### AppendDocumentInput

```ts
type AppendDocumentInput = {
  documentId: string;
  content: string;
  tabId?: string;
};
```

Do not expose internal Google client objects as the public MCP response contract.

Return small, stable DTOs.

---

## 16. Testing Requirements

## 16.1 Unit Tests

Cover at least:

- Email validation.
- Empty recipient validation.
- MIME creation.
- Unicode subject/body handling.
- Base64URL encoding.
- Cc/Bcc headers.
- HTML vs text body behavior.
- Google Docs request construction.
- Optional tab ID behavior.
- Error mapping.
- Config validation.
- Secret/log redaction.

Mock Google API clients for unit tests.

---

## 16.2 Integration Tests

Provide an integration-test strategy for a dedicated Google test account.

Integration tests should verify:

### Gmail

- Draft is created and remains unsent.
- Email is sent to a controlled test mailbox.
- Unicode content works.
- Invalid OAuth scope produces a useful MCP error.

### Google Docs

- Content is appended.
- Existing text remains unchanged.
- Permission-denied behavior is correctly mapped.
- Invalid document ID is correctly handled.

Do not run real email sends automatically in the default unit-test command.

Use an explicit opt-in flag/environment variable for external integration tests.

---

## 17. Documentation Requirements

Create a `README.md` containing:

1. What the server does.
2. Architecture overview.
3. Supported MCP tools.
4. Prerequisites.
5. Google Cloud project setup.
6. Enabling Gmail API.
7. Enabling Google Docs API.
8. OAuth consent-screen setup.
9. Required OAuth scopes.
10. Creating OAuth credentials.
11. Local authentication flow.
12. Environment variables.
13. How to run locally.
14. How to build.
15. How to run tests.
16. Example MCP client configuration.
17. Example tool calls.
18. Security considerations.
19. Troubleshooting.
20. Deployment notes.

Also include:

```text
.env.example
.gitignore
LICENSE or placeholder if appropriate
```

---

## 18. Example Tool Catalog

The MCP client should discover approximately the following catalog:

```text
gmail_create_draft
  Create a Gmail draft for the authenticated Google account.
  This does not send the email.

gmail_send_email
  Send an email through the authenticated Google account.
  This causes an external side effect and sends immediately.

google_docs_append_content
  Append content to the end of an existing Google Doc that the
  authenticated Google account is allowed to edit.
```

Descriptions should be written for AI agents: concise, specific, and explicit about side effects.

---

## 19. Non-Functional Requirements

The MCP server should be:

### Generic

No assumptions about the calling AI product.

### Modular

Gmail, Docs, auth, MCP protocol, and configuration must be separable modules.

### Secure

Least privilege, token protection, validation, and safe logging.

### Predictable

Stable tool names, schemas, response contracts, and error codes.

### Extensible

Future Google Workspace tools can be added without breaking existing tools.

### Testable

Google integrations must be mockable.

### Deployable

Configuration must not depend on a developer's machine.

### Observable

Requests must have IDs, structured logs, duration, and useful failure categories.

---

## 20. Acceptance Criteria

The implementation is complete when all of the following are true:

- [ ] MCP server starts successfully with valid configuration.
- [ ] An MCP client can discover all required tools.
- [ ] `gmail_create_draft` creates a real Gmail draft.
- [ ] Creating a draft never sends the message.
- [ ] `gmail_send_email` sends a real email.
- [ ] Gmail supports To, Cc, Bcc, subject, and body.
- [ ] Plain-text email works.
- [ ] HTML body works if included in V1.
- [ ] `google_docs_append_content` appends to an existing Google Doc.
- [ ] Existing Google Doc content is not overwritten.
- [ ] Google Docs tab behavior is documented.
- [ ] OAuth refresh is handled.
- [ ] No OAuth token is passed through an MCP tool parameter.
- [ ] No secrets are committed to source control.
- [ ] Logs do not contain access tokens, refresh tokens, or complete user-generated content.
- [ ] Validation errors are returned in a consistent structured format.
- [ ] Google API errors are mapped to stable application error codes.
- [ ] Ambiguous retries do not blindly duplicate email sends or document appends.
- [ ] Unit tests pass.
- [ ] Integration-test instructions exist.
- [ ] README contains end-to-end setup instructions.
- [ ] At least one example MCP client configuration is included.
- [ ] Server code contains no dependency on a specific AI model or agent.

---

## 21. Recommended Development Order

Implement in this order:

1. Project skeleton and configuration validation.
2. MCP server with temporary stub tools.
3. Google OAuth credential provider.
4. Gmail MIME builder.
5. Gmail draft creation.
6. Gmail send.
7. Google Docs append.
8. Error mapping.
9. Safe structured logging.
10. Unit tests.
11. Integration tests.
12. MCP client example.
13. Docker/deployment packaging.
14. Final README and security review.

---

## 22. Deliverables

The coding agent should produce a repository containing at least:

```text
README.md
problemStatement.md
.env.example
.gitignore
package.json / pyproject.toml / equivalent
source code
tests
example MCP client configuration
```

If TypeScript is chosen, a reasonable result could look like:

```text
src/
  index.ts
  config/
  auth/
  mcp/
    server.ts
    tools/
      gmailCreateDraft.ts
      gmailSendEmail.ts
      googleDocsAppendContent.ts
  integrations/
    gmail/
    googleDocs/
  errors/
  logging/
  validation/

tests/
  unit/
  integration/
```

---

## 23. Definition of Done

The final repository should allow a developer to:

1. Clone the repository.
2. Create/configure a Google Cloud project.
3. Enable Gmail and Google Docs APIs.
4. Configure OAuth credentials.
5. Authenticate a Google account.
6. Start the MCP server.
7. Connect it to an MCP-compatible client.
8. Ask the client/agent to create a Gmail draft.
9. Ask the client/agent to send a Gmail email.
10. Ask the client/agent to append content to a Google Doc.
11. Receive clear structured results/errors from each operation.

No changes to the MCP server should be necessary when switching between different MCP-compatible AI agents, other than the MCP client's own server connection configuration.

---

## 24. Important Design Decisions

The implementation must preserve these principles:

### MCP is the public integration contract

Agents should interact with MCP tool schemas, not directly with Google APIs.

### Google APIs are implementation details

Gmail/Docs API response structures should not leak unnecessarily into the public tool contract.

### Authentication is not an agent responsibility

Agents invoke business actions. The MCP integration layer owns OAuth credentials.

### Sending is different from drafting

Never combine "draft" and "send" into ambiguous behavior. They must be separate explicit tools.

### Append must be non-destructive

The Docs operation must add content at the end rather than replacing existing document content.

### Side effects must be obvious

Tool descriptions and metadata must distinguish operations that mutate external systems.

### Keep V1 intentionally small

Do not expand the project into a complete Google Workspace MCP server before the three required tools are reliable and secure.

---

## 25. Official References

Implementation should validate behavior against current official documentation rather than relying on old tutorials.

- Model Context Protocol specification and tools:
  - https://modelcontextprotocol.io/specification/
  - https://modelcontextprotocol.io/specification/draft/server/tools

- Gmail API: create/send messages:
  - https://developers.google.com/workspace/gmail/api/guides/sending

- Gmail API: create draft:
  - https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/create

- Google OAuth scopes:
  - https://developers.google.com/identity/protocols/oauth2/scopes

- Google Docs API authentication/scopes:
  - https://developers.google.com/workspace/docs/api/auth

- Google Docs API text insertion:
  - https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/request

- Google Docs API batch updates:
  - https://developers.google.com/workspace/docs/api/concepts/request-response

As of the current MCP specification generation, prefer the current MCP SDK and specification over older examples that assume legacy session/transport behavior.
