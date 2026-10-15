# Client Authentication

The Streamable HTTP endpoint (`/`) requires a bearer token on **every** MCP request
(`POST`, `GET` stream, `DELETE`). Requests without a valid token get `401 Unauthorized`
(`WWW-Authenticate: Bearer realm="mcp"`) before the body is read or any MCP handler runs,
so `initialize`, `tools/list` and `tools/call` are unreachable without a token.

stdio transport is unchanged (no token: the client spawns the process locally).

## How it works

| Piece | Behaviour |
|---|---|
| Token storage | The server stores only **SHA-256 hashes** of tokens (`MCP_AUTH_TOKEN_SHA256`). A leaked env dump does not reveal usable tokens |
| Comparison | The presented token is hashed and compared with `crypto.timingSafeEqual` against every configured hash |
| Fail closed | With `streamable-http`, the server **refuses to start** if `MCP_AUTH_TOKEN_SHA256` is empty or malformed |
| Rotation | Several comma-separated hashes are accepted at once |
| Public routes | `GET /health` (Railway healthcheck) and `GET /` (service info, no secrets) |
| Logging | Rejections are logged as `Rejected unauthenticated MCP request` with `reason` (`missing`/`invalid`); tokens are never logged |

## Tools

Only `gmail_create_draft` and `google_docs_append_content` are registered by default.
`gmail_send_email` must be opted into with `ENABLED_TOOLS` (it sends immediately and cannot be undone).

## OAuth routes

`/oauth/start` and `/oauth/callback` return **404** unless `ENABLE_OAUTH_ROUTES=true`.
The recommended production setup is to authorize locally and inject tokens:

```bash
npm run auth          # local consent, writes ./tokens.json
npm run tokens:env    # prints GOOGLE_TOKENS_JSON for Railway
```

If the routes are enabled, they are hardened:

- `/oauth/start` requires `Authorization: Bearer <admin token>` (a **separate** token, hash in
  `OAUTH_ADMIN_TOKEN_SHA256`). Browsers cannot attach that header, so fetch the redirect and open it:
  ```bash
  curl -s -o /dev/null -w '%{redirect_url}\n' \
    -H "Authorization: Bearer $OAUTH_ADMIN_TOKEN" https://<domain>/oauth/start
  ```
- The redirect carries an HMAC-signed, 10-minute, single-use `state` (`OAUTH_STATE_SECRET`).
  Callbacks with a missing, forged, expired or replayed `state` get `400` and never reach Google.
- After the code exchange, the server verifies the Google ID token and saves tokens **only** if the
  verified email equals `ALLOWED_GOOGLE_ACCOUNT`; otherwise `403` and the token store is unchanged.

## Railway configuration

Set in **Railway → service → Variables** (mark secrets as sealed where available):

| Variable | Required | Value |
|---|---|---|
| `MCP_AUTH_TOKEN_SHA256` | **Yes** | Hash(es) from `npm run auth:token`, comma-separated. Never the plaintext token |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Yes | As before |
| `GOOGLE_TOKENS_JSON` | Recommended | Output of `npm run tokens:env`. Avoids the file token store being writable through OAuth routes |
| `ENABLED_TOOLS` | No | Default `gmail_create_draft,google_docs_append_content` |
| `ENABLE_OAUTH_ROUTES` | No | Default `false` |
| `OAUTH_ADMIN_TOKEN_SHA256`, `OAUTH_STATE_SECRET`, `ALLOWED_GOOGLE_ACCOUNT` | Only if `ENABLE_OAUTH_ROUTES=true` | See above |

`PORT` is injected by Railway (forces `streamable-http` on `0.0.0.0`); the `/health` healthcheck in
`railway.toml` keeps working without a token.

> **Deploy order:** set `MCP_AUTH_TOKEN_SHA256` **before** deploying this version. Without it the
> container exits at startup (by design) and the healthcheck fails.

## Client configuration

Clients send the plaintext token:

```http
Authorization: Bearer <token>
```

| Client | Settings |
|---|---|
| Groww Review Pulse Agent | `MCP_SERVER_URL=https://<domain>/` and `MCP_AUTH_TOKEN=<token>` in its `.env` / secret store |
| `scripts/verify-server.ts` | `MCP_URL=https://<domain>` and `MCP_AUTH_TOKEN=<token>` |

## Rotation

1. `npm run auth:token` → new token + hash.
2. Set `MCP_AUTH_TOKEN_SHA256=<old-hash>,<new-hash>` and redeploy.
3. Update every client to the new token.
4. Remove `<old-hash>` and redeploy.

## Verifying a deployment

```bash
URL=https://<domain>/
INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
H=(-H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream')

curl -s -o /dev/null -w '%{http_code}\n' "${H[@]}" -d "$INIT" "$URL"                                    # 401
curl -s -o /dev/null -w '%{http_code}\n' "${H[@]}" -H 'Authorization: Bearer wrong' -d "$INIT" "$URL"   # 401
curl -s -o /dev/null -w '%{http_code}\n' "${H[@]}" -H "Authorization: Bearer $MCP_AUTH_TOKEN" -d "$INIT" "$URL"  # 200
curl -s -o /dev/null -w '%{http_code}\n' "${URL}oauth/start"                                            # 404
```
