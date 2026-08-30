# Deployment Plan: Google Workspace MCP Server on Railway

This document describes how to deploy the Generic Google Workspace MCP Server to [Railway](https://railway.app). It covers prerequisites, configuration, OAuth/token strategy, deployment steps, client wiring, and a pre/post-deploy checklist.

Related docs: [architecture.md](./architecture.md) · [problemStatement.md](./problemStatement.md)

---

## 1. Deployment Overview

### Local vs Railway

| Aspect | Local (current) | Railway (target) |
|--------|-----------------|------------------|
| Transport | `stdio` | `streamable-http` |
| Bind address | `127.0.0.1` | `0.0.0.0` |
| Port | Fixed (`3000`) | Railway-assigned (`PORT`) |
| TLS | Not required | Provided by Railway |
| Token storage | `./tokens.json` | Persistent **Volume** |
| MCP clients | Cursor / Claude Desktop (stdio) | Remote HTTP MCP clients |

### Target architecture on Railway

```text
MCP Client (remote)
        |
        | HTTPS (Streamable HTTP)
        v
Railway Edge (TLS termination)
        |
        v
google-workspace-mcp-server container
  - MCP HTTP handler
  - Gmail / Docs services
  - FileTokenStore → mounted Volume
        |
        v
Google APIs (Gmail, Docs)
```

Railway is suitable for a **remote, always-on MCP server**. Local IDE clients that only support stdio (e.g. Cursor) will still use the local setup; remote agents or HTTP-capable MCP clients connect to the Railway URL.

---

## 2. Prerequisites

Before deploying, ensure you have:

- [ ] A Railway account and project
- [ ] This repository pushed to GitHub (or another Railway-supported source)
- [ ] A Google Cloud project with **Gmail API** and **Google Docs API** enabled
- [ ] OAuth 2.0 credentials configured for **production** (see §4)
- [ ] A working local setup (server verified with `npx tsx scripts/verify-server.ts`)
- [ ] Node.js **20+** in the container (Dockerfile uses Node 22)

---

## 3. Required Code & Config Adjustments

The server already supports HTTP transport. No code changes are strictly required for a first deployment, but the following **environment configuration is mandatory**.

### 3.1 Transport and networking

Railway injects a dynamic `PORT` and expects the process to listen on `0.0.0.0`.

| Variable | Local value | Railway value |
|----------|-------------|---------------|
| `MCP_TRANSPORT` | `stdio` | `streamable-http` |
| `MCP_HOST` | `127.0.0.1` | `0.0.0.0` |
| `MCP_PORT` | `3000` | `${PORT}` (Railway reference) |

In the Railway dashboard, set:

```dotenv
MCP_TRANSPORT=streamable-http
MCP_HOST=0.0.0.0
MCP_PORT=${{PORT}}
```

> **Note:** The app reads `MCP_PORT`, not `PORT` directly. Mapping `${{PORT}}` → `MCP_PORT` is required until the config layer is updated to fall back to `process.env.PORT`.

### 3.2 Token store path (Volume)

Railway containers have an **ephemeral filesystem**. Tokens written to `./tokens.json` inside the container are **lost on redeploy**.

Mount a Railway Volume and point the token store at it:

```dotenv
GOOGLE_TOKEN_STORE_PATH=/data/tokens.json
```

The Dockerfile already documents `/app/data`; align the Volume mount path with this variable.

### 3.3 Recommended follow-up code improvements (post-V1)

These are not blockers but should be tracked:

| Improvement | Why |
|-------------|-----|
| Auto-read `process.env.PORT` when `MCP_PORT` is unset | Native Railway compatibility |
| `GET /health` endpoint | Railway health checks & uptime monitoring |
| Env-based `TokenStore` (JSON in a single secret var) | Simpler than Volume for single-account V1 |
| Production OAuth callback route on the server | Re-auth without local `npm run auth` |

---

## 4. Google Cloud OAuth (Production)

### 4.1 Credential type

For Railway, use a **Web application** OAuth client (not Desktop), because:

- Redirect URIs must match your public Railway URL
- The callback server runs on a public HTTPS endpoint

### 4.2 Redirect URI

After Railway assigns a public domain (e.g. `https://google-workspace-mcp-production.up.railway.app`), register this redirect URI in Google Cloud Console → **APIs & Services → Credentials → OAuth 2.0 Client → Authorized redirect URIs**:

```text
https://<your-railway-domain>/oauth/callback
```

Update Railway env:

```dotenv
GOOGLE_REDIRECT_URI=https://<your-railway-domain>/oauth/callback
```

> The current server does **not** expose `/oauth/callback` in HTTP mode. For the first deployment, use the **token seeding** approach in §6.2 rather than in-container OAuth.

### 4.3 Scopes (unchanged)

| Scope | Purpose |
|-------|---------|
| `https://www.googleapis.com/auth/gmail.compose` | Draft + send |
| `https://www.googleapis.com/auth/documents` | Append to Docs |

### 4.4 OAuth consent screen

- Set app name, support email, and developer contact
- Add test users if the app is in **Testing** mode
- Publish to **Production** when ready for non-test users

---

## 5. Railway Environment Variables

Set these in **Railway → Service → Variables**:

### Required

| Variable | Example | Notes |
|----------|---------|-------|
| `GOOGLE_CLIENT_ID` | `696759...apps.googleusercontent.com` | From Google Cloud |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-...` | Mark as secret |
| `GOOGLE_REDIRECT_URI` | `https://your-app.up.railway.app/oauth/callback` | Must match Google Console |
| `GOOGLE_TOKEN_STORE_PATH` | `/data/tokens.json` | Must be on a Volume |
| `MCP_TRANSPORT` | `streamable-http` | Required for Railway |
| `MCP_HOST` | `0.0.0.0` | Bind all interfaces |
| `MCP_PORT` | `${{PORT}}` | Railway dynamic port |

### Optional

| Variable | Default | Notes |
|----------|---------|-------|
| `LOG_LEVEL` | `info` | Use `warn` in production |
| `MAX_EMAIL_BODY_BYTES` | `1048576` | Adjust if needed |
| `MAX_DOC_APPEND_BYTES` | `1048576` | Adjust if needed |
| `NODE_ENV` | — | Set to `production` |

**Do not** commit `.env`, `credential.json`, or `tokens.json` to git.

---

## 6. Token Strategy on Railway

### 6.1 Problem

OAuth tokens must persist across deploys. Railway's default filesystem does not.

### 6.2 Recommended approach: Volume + local auth seed

**Phase 1 — Generate tokens locally (already done):**

```bash
npm run auth -- --callback-server
# produces ./tokens.json
```

**Phase 2 — Mount a Railway Volume:**

1. Railway → Service → **Volumes** → Add Volume
2. Mount path: `/data`
3. Set `GOOGLE_TOKEN_STORE_PATH=/data/tokens.json`

**Phase 3 — Seed tokens into the Volume (one-time):**

Option A — Railway CLI:

```bash
railway login
railway link
# Copy tokens.json into the running container's volume
railway run -- sh -c 'cat > /data/tokens.json' < tokens.json
```

Option B — One-off deploy script / init container that writes tokens from a Railway secret (future improvement).

**Phase 4 — Verify token refresh:**

The server auto-refreshes access tokens using the stored refresh token. After deploy, invoke `gmail_create_draft` and confirm success. If refresh fails, re-seed tokens.

### 6.3 Token rotation

If tokens are compromised:

1. Revoke access in [Google Account permissions](https://myaccount.google.com/permissions)
2. Re-run local `npm run auth`
3. Re-seed `/data/tokens.json` on the Volume

---

## 7. Deployment Steps

### Phase 1: Prepare repository

- [ ] Ensure `Dockerfile` is present at repo root
- [ ] Confirm `.gitignore` excludes `.env`, `tokens.json`, `credential.json`
- [ ] Push latest code to GitHub

### Phase 2: Create Railway service

1. Log in to [Railway](https://railway.app)
2. **New Project** → **Deploy from GitHub repo**
3. Select this repository
4. Railway detects the `Dockerfile` automatically

### Phase 3: Configure service

- [ ] Add all environment variables from §5
- [ ] Add a **Volume** mounted at `/data`
- [ ] Set **Start Command** (optional — Dockerfile `CMD` is sufficient):

  ```bash
  node dist/index.js
  ```

- [ ] Generate a public domain: **Settings → Networking → Generate Domain**

### Phase 4: Seed tokens

- [ ] Copy local `tokens.json` to the Volume (§6.2)
- [ ] Confirm file permissions (container user can read/write `/data/tokens.json`)

### Phase 5: Deploy

- [ ] Trigger deploy (automatic on push, or manual **Deploy**)
- [ ] Watch **Deploy Logs** for:

  ```json
  {"level":"info","message":"Starting MCP server","transport":"streamable-http",...}
  ```

- [ ] Confirm no startup errors about missing env vars

### Phase 6: Smoke test

From your local machine (with MCP client or curl):

```bash
# Replace with your Railway domain
export MCP_URL=https://your-app.up.railway.app

# List tools via MCP client (recommended)
npx tsx scripts/verify-server.ts   # adapt for HTTP — see §8
```

Minimum checks:

- [ ] Server responds on HTTPS
- [ ] MCP `tools/list` returns 3 tools
- [ ] `gmail_create_draft` succeeds (confirms OAuth + Volume)
- [ ] Logs show no token or body content leakage

---

## 8. Connecting MCP Clients to Railway

### 8.1 HTTP-capable MCP clients

Point the client at your Railway URL using **Streamable HTTP** transport:

```text
https://<your-railway-domain>
```

Consult your MCP client's remote-server configuration docs for the exact JSON shape. The server uses the MCP SDK's `createMcpHandler` over HTTP.

### 8.2 Cursor / stdio-only clients

Cursor's default MCP config spawns a **local stdio process**. It does **not** connect to a remote Railway URL out of the box.

Options:

| Option | Description |
|--------|-------------|
| **Keep local stdio** | Use Railway for remote agents; keep Cursor on local `npm run dev` |
| **HTTP proxy / bridge** | Run a local bridge that forwards stdio ↔ Railway HTTP (custom tooling) |
| **Future Cursor remote MCP** | Adopt when/if your client adds native remote HTTP MCP support |

### 8.3 Example remote client env

```json
{
  "mcpServers": {
    "google-workspace-remote": {
      "url": "https://your-app.up.railway.app",
      "transport": "streamable-http"
    }
  }
}
```

Exact schema depends on the MCP client — adjust per client documentation.

---

## 9. Dockerfile & Build Notes

The existing multi-stage `Dockerfile`:

- Builds TypeScript in a builder stage
- Runs production deps only in runtime stage
- Uses Node 22 Alpine
- Expects tokens on a mounted volume

Railway build settings:

| Setting | Value |
|---------|-------|
| Builder | Dockerfile |
| Root directory | `/` (repo root) |
| Watch paths | `src/**`, `Dockerfile`, `package.json` |

No `railway.toml` is required for a basic deploy, but you may add one later for reproducible config.

---

## 10. Security Checklist

- [ ] All secrets (`GOOGLE_CLIENT_SECRET`, tokens) stored in Railway Variables or Volume — never in git
- [ ] Railway service is **not** publicly advertised unless intended
- [ ] Consider Railway **private networking** or access controls if available on your plan
- [ ] OAuth scopes remain least-privilege (`gmail.compose`, `documents`)
- [ ] `LOG_LEVEL=warn` or `info` in production; never `debug` with sensitive traffic
- [ ] Review who can trigger `gmail_send_email` (side-effecting tool)
- [ ] Rotate credentials if `credential.json` or `tokens.json` were ever committed
- [ ] Enable Google OAuth **Publishing** review before broad user access

---

## 11. Monitoring & Operations

### Logs

Railway captures stdout/stderr. The server emits structured JSON logs:

```json
{
  "level": "info",
  "requestId": "req_...",
  "toolName": "gmail_send_email",
  "recipientCount": 2,
  "durationMs": 481,
  "resultStatus": "success"
}
```

Use Railway **Observability → Logs** to filter by `toolName`, `errorCode`, or `resultStatus`.

### Deploy triggers

| Event | Action |
|-------|--------|
| Push to `main` | Auto-redeploy (if configured) |
| Env var change | Redeploy required |
| Volume data | Persists across redeploys |
| Token expiry / revoke | Re-seed `tokens.json` on Volume |

### Rollback

Railway → **Deployments** → select previous successful deployment → **Rollback**.

---

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Deploy crashes immediately | Missing env var | Check logs for `Missing required environment variable` |
| `Connection refused` externally | `MCP_HOST=127.0.0.1` | Set `MCP_HOST=0.0.0.0` |
| Port binding error | `MCP_PORT` ≠ Railway `PORT` | Set `MCP_PORT=${{PORT}}` |
| `GOOGLE_AUTH_REQUIRED` | No tokens on Volume | Seed `/data/tokens.json` |
| `GOOGLE_TOKEN_REFRESH_FAILED` | Revoked refresh token | Re-auth locally, re-seed Volume |
| `redirect_uri_mismatch` | Google Console URI ≠ env | Align `GOOGLE_REDIRECT_URI` |
| Tokens lost after redeploy | No Volume mounted | Add Volume at `/data` |
| MCP client can't connect | Using stdio config for remote | Switch client to Streamable HTTP |

---

## 13. Deployment Checklist (Summary)

### Pre-deploy

- [ ] Google Cloud OAuth configured for production
- [ ] Railway project + GitHub repo linked
- [ ] Local verification passed
- [ ] `tokens.json` generated locally

### Deploy

- [ ] Dockerfile build succeeds
- [ ] All §5 env vars set
- [ ] Volume mounted at `/data`
- [ ] `MCP_TRANSPORT=streamable-http`, `MCP_HOST=0.0.0.0`, `MCP_PORT=${{PORT}}`
- [ ] Public Railway domain generated
- [ ] Tokens seeded to Volume

### Post-deploy

- [ ] MCP tool discovery works over HTTPS
- [ ] Gmail draft test succeeds
- [ ] Logs are clean (no secrets leaked)
- [ ] Client configuration updated for remote URL
- [ ] OAuth redirect URI registered in Google Console (for future in-app auth)

---

## 14. Estimated Timeline

| Phase | Effort |
|-------|--------|
| Google Cloud production OAuth setup | 30–60 min |
| Railway service + env + Volume | 20–30 min |
| Token seeding + smoke test | 15–30 min |
| Client wiring + documentation | 15–30 min |
| **Total (first deploy)** | **~1.5–2.5 hours** |

Subsequent deploys (code-only changes) typically take 5–10 minutes with Volume-backed tokens persisting automatically.

---

## 15. References

- [Railway Docs — Deployments](https://docs.railway.app/deploy/deployments)
- [Railway Docs — Volumes](https://docs.railway.app/reference/volumes)
- [Railway Docs — Variables](https://docs.railway.app/guides/variables)
- [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- Project [README.md](../README.md)
- Project [architecture.md](./architecture.md)
