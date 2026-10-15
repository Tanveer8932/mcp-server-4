# Generic Google Workspace MCP Server

A reusable [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that exposes selected Google Workspace capabilities to any MCP-compatible AI agent.

## Features

- **Gmail**: create drafts and send emails
- **Google Docs**: append content to existing documents
- **Agent-agnostic**: works with Cursor, Claude Desktop, or any MCP client
- **Secure**: bearer-token authentication on the HTTP endpoint; OAuth managed by the server; no tokens in tool inputs
- **Structured responses**: consistent success/error envelopes

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full design. The server uses a layered architecture:

```text
MCP Layer → Validation → Services → Auth / Integrations → Google APIs
```

## Supported MCP Tools

| Tool | Side effect | Description |
|------|-------------|-------------|
| `gmail_create_draft` | No | Create a Gmail draft without sending |
| `gmail_send_email` | **Yes** | Send an email immediately. **Disabled by default**; enable via `ENABLED_TOOLS` |
| `google_docs_append_content` | **Yes** | Append text to the end of a Google Doc |

## Authentication (HTTP transport)

Every MCP request to the HTTP endpoint must carry `Authorization: Bearer <token>`; missing or
invalid tokens get `401`. The server stores only SHA-256 hashes of tokens and refuses to start in
`streamable-http` mode without `MCP_AUTH_TOKEN_SHA256`.

```bash
npm run auth:token   # prints a new token (for the client) and its hash (for the server)
```

OAuth routes are off by default. See [docs/authentication.md](docs/authentication.md) for Railway
and client configuration, OAuth-route hardening, and token rotation.

## Prerequisites

- **Node.js 20+** (required by MCP SDK v2)
- A Google Cloud project with Gmail API and Google Docs API enabled
- OAuth 2.0 credentials (Desktop or Web application)

## Google Cloud Setup

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **Gmail API** and **Google Docs API**.
3. Configure the **OAuth consent screen** (External or Internal).
4. Create **OAuth 2.0 credentials**:
   - Application type: Desktop app (for local dev) or Web application
   - Authorized redirect URI: `http://localhost:3000/oauth/callback` (or your chosen URI)
5. Download the client ID and client secret.

### Required OAuth Scopes

| Scope | Purpose |
|-------|---------|
| `https://www.googleapis.com/auth/gmail.compose` | Create drafts and send email |
| `https://www.googleapis.com/auth/documents` | Append content to Google Docs |

The `documents` scope is sensitive — it allows editing any Doc the authenticated user can access. This is required because agents may append to arbitrary document IDs supplied by the user.

## Local Setup

```bash
git clone <repo-url>
cd mcp-server-4
npm install
cp .env.example .env
# Edit .env with your Google OAuth credentials
```

### Authenticate

Run the OAuth flow to store tokens locally:

```bash
# Option 1: Manual code entry
npm run auth

# Option 2: Local callback server (opens browser, captures redirect)
npm run auth -- --callback-server
```

Tokens are saved to `GOOGLE_TOKEN_STORE_PATH` (default: `./tokens.json`).

### Run the Server

```bash
# Development (stdio)
npm run dev

# Production build
npm run build
npm start
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | — | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | — | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Yes | — | OAuth redirect URI |
| `GOOGLE_TOKEN_STORE_PATH` | No | `./tokens.json` | Token storage path |
| `MCP_TRANSPORT` | No | `stdio` | `stdio` or `streamable-http` |
| `MCP_HOST` | No | `127.0.0.1` | HTTP transport host |
| `MCP_PORT` | No | `3000` | HTTP transport port |
| `MCP_AUTH_TOKEN_SHA256` | For `streamable-http` | — | Comma-separated SHA-256 hashes of accepted bearer tokens |
| `ENABLED_TOOLS` | No | `gmail_create_draft,google_docs_append_content` | Tools to register |
| `ENABLE_OAUTH_ROUTES` | No | `false` | Expose `/oauth/start` and `/oauth/callback` |
| `OAUTH_ADMIN_TOKEN_SHA256` | If OAuth routes on | — | Hash of the admin token required by `/oauth/start` |
| `OAUTH_STATE_SECRET` | If OAuth routes on | — | ≥ 32 chars; signs the OAuth `state` |
| `ALLOWED_GOOGLE_ACCOUNT` | If OAuth routes on | — | Only this Google account may complete OAuth |
| `GOOGLE_TOKENS_JSON` | No | — | Inline tokens (recommended on Railway) |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error` |
| `MAX_EMAIL_BODY_BYTES` | No | `1048576` | Max email body size |
| `MAX_DOC_APPEND_BYTES` | No | `1048576` | Max doc append size |

## MCP Client Configuration

### Cursor

Add to your Cursor MCP settings (see [examples/cursor-mcp-config.json](examples/cursor-mcp-config.json)):

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server-4/dist/index.js"],
      "env": {
        "GOOGLE_CLIENT_ID": "your-client-id",
        "GOOGLE_CLIENT_SECRET": "your-client-secret",
        "GOOGLE_REDIRECT_URI": "http://localhost:3000/oauth/callback",
        "GOOGLE_TOKEN_STORE_PATH": "/absolute/path/to/tokens.json",
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

Build first with `npm run build`, or use `tsx` for development:

```json
"command": "npx",
"args": ["tsx", "/absolute/path/to/mcp-server-4/src/index.ts"]
```

## Example Tool Calls

### Create a draft

```json
{
  "to": ["user@example.com"],
  "subject": "Project update",
  "body": "Hi team,\n\nHere is the latest update...",
  "bodyType": "text"
}
```

### Send an email

```json
{
  "to": ["user@example.com"],
  "cc": ["manager@example.com"],
  "subject": "Project update",
  "body": "Hi team,\n\nHere is the latest update...",
  "bodyType": "text"
}
```

### Append to a Google Doc

```json
{
  "documentId": "1AbCdEf...",
  "content": "\n\n## Meeting Notes\n- Decision 1\n- Decision 2"
}
```

Optional: `"tabId": "..."` targets a specific tab; `"ensureLeadingNewline": true` prepends a newline.

## Testing

```bash
# Unit tests
npm test

# Integration tests (opt-in, requires real Google account)
RUN_INTEGRATION_TESTS=1 npm run test:integration
```

## Docker

```bash
docker build -t google-workspace-mcp .
docker run -it --env-file .env -v $(pwd)/tokens.json:/app/data/tokens.json google-workspace-mcp
```

## Security Considerations

- Never commit `.env` or `tokens.json` — both are gitignored
- The HTTP endpoint requires a bearer token; only token hashes are configured on the server
- `gmail_send_email` is not exposed unless explicitly enabled
- OAuth routes are disabled by default; when enabled they require an admin token, a signed `state`, and the allowed Google account
- OAuth tokens are never exposed in MCP tool inputs or outputs
- Email bodies and document content are not logged
- Use human confirmation before high-impact email sends when appropriate
- For production, replace file-based token storage with a secret manager

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `GOOGLE_AUTH_REQUIRED` | Run `npm run auth` to authenticate |
| `INSUFFICIENT_SCOPE` | Re-authenticate after adding scopes in Google Cloud |
| `DOC_PERMISSION_DENIED` | Ensure the Google account has edit access to the document |
| Server won't start | Verify all required env vars are set; check Node.js ≥ 20 |

## License

MIT
