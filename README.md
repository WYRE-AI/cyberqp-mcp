# CyberQP MCP Server

MCP server for [CyberQP](https://www.getquickpass.com/)'s (formerly QuickPass Cybersecurity) privileged access management (PAM) API - customer/account metadata, the tenant event log, and JIT (Just-In-Time) account status/policy visibility, for AI assistants and the WYRE Conduit gateway.

## Authentication

CyberQP authenticates with **OAuth2 authorization_code** flow (`offline_access` scope, refresh_token-backed) - not `client_credentials`. This connector never performs the OAuth dance itself: the WYRE Conduit gateway owns the authorize/exchange/refresh legs, and this server only ever receives a live bearer access token, sent as `Authorization: Bearer <token>` to CyberQP's API. In gateway mode the token arrives per-request via the `X-CyberQP-Access-Token` header; in local/stdio mode it's read once from `CYBERQP_ACCESS_TOKEN`.

## Configuration

Copy [`.env.example`](.env.example) and set the variables below. The stdio transport reads `CYBERQP_ACCESS_TOKEN` and does not use `CONDUIT_S2S_SECRET`.

| Env var | Description |
|---|---|
| `CYBERQP_ACCESS_TOKEN` | OAuth2 access token issued by CyberQP. Required for stdio and for HTTP when `AUTH_MODE=env`. Gateway mode does not read it. |
| `MCP_TRANSPORT` | `stdio` (default) or `http`. |
| `AUTH_MODE` | `env` (default, reads the var above) or `gateway` (credential arrives per-request via the `X-CyberQP-Access-Token` header, injected by the Conduit gateway). The container image and Compose default to `gateway`. |
| `CONDUIT_S2S_SECRET` | Required for HTTP. HMAC secret checked against `X-Gateway-S2S` on every `/mcp` request. The process logs an error and exits non-zero when this is empty or a known placeholder (`changeme`, `placeholder`, `secret`, `example`, and similar public example values). Compose will not start when it is unset. Never commit a real value. Generate one with `openssl rand -hex 32`. The value is never logged. |
| `MCP_ALLOW_INSECURE_DEV` | Set to exactly `1` only for local development to start HTTP without `CONDUIT_S2S_SECRET`. The process logs a warning, does not enforce `X-Gateway-S2S`, and binds `127.0.0.1` only. A wider `MCP_HTTP_HOST` (including `0.0.0.0`) is ignored and the override is logged. A known placeholder secret is still rejected. |
| `MCP_HTTP_HOST` | Bind address when `MCP_TRANSPORT=http`. Unset binds `127.0.0.1`. A configured `CONDUIT_S2S_SECRET` honors this value (the container image sets `0.0.0.0`). With no secret, the insecure-dev bypass forces `127.0.0.1`. |
| `MCP_HTTP_PORT` | HTTP port. Defaults to `8080`. |
| `LOG_LEVEL` | `debug` \| `info` (default) \| `warn` \| `error`. |

`/health` stays unauthenticated and does not read credentials.

### HTTP authentication

With `MCP_TRANSPORT=http` and `CONDUIT_S2S_SECRET` set, every `/mcp` request must include `X-Gateway-S2S`:

```
t=<unix seconds>,v1=<hex hmac-sha256>
```

`v1` is the lowercase hex HMAC-SHA256 of the ASCII message `t=<unix seconds>`, keyed by `CONDUIT_S2S_SECRET`. The timestamp must be within 300 seconds of the server clock. A missing or invalid header returns 401 before any vendor credential is read. The secret is never written to logs or error bodies.

In `AUTH_MODE=gateway`, `/mcp` also requires `X-CyberQP-Access-Token`. That header is the only credential source for the request. A missing token returns 401. The server does not fall back to `CYBERQP_ACCESS_TOKEN` in the process environment.

```
X-Gateway-S2S: t=1710000000,v1=<hmac-sha256 of "t=1710000000">
X-CyberQP-Access-Token: <live bearer token>
```

Single-tenant HTTP (`AUTH_MODE=env`) still requires a valid `X-Gateway-S2S` header. The access token then comes from `CYBERQP_ACCESS_TOKEN`.

### Request limits

- HTTP request bodies are capped at 256 KiB (262144 bytes). After the `X-Gateway-S2S` check passes, a `Content-Length` above the cap returns 413 with a JSON-RPC error; bodies without `Content-Length` are capped by the MCP SDK transport. Unauthenticated requests still get 401 first.
- `tools/call` arguments are capped at 10,000 elements (every array item and object key at any depth). Larger inputs return an `isError` tool result and are never dispatched.

These limits address CVE-2026-111768 / GHSA-46jr-4wx8-v453 (memory exhaustion during validation) and GHSA-f897-62hf-6gxq (no request body / batch cap).

## Tools

### Customers
- `cyberqp_list_customers` - list customers visible to the authenticated technician, filterable by directory type and name.
- `cyberqp_get_customer_accounts` - list account metadata (id, username, type, status) for a customer.
- `cyberqp_get_customer_accounts_count` - get per-account-type counts for a customer.

### Events
- `cyberqp_get_events` - get the tenant's event log, filterable by customer, account, event type, status, and date range.
- `cyberqp_get_event_types` - get the full set of event-type values.

### Tenant
- `cyberqp_get_tenant_company_data` - get the authenticated tenant's own company profile.

### JIT (Just-In-Time) - status and policy only
- `cyberqp_get_jit_policies` - get the configured JIT policy (approval requirements, max duration) for a customer + account type.
- `cyberqp_get_customer_jit_status` - get JIT account status for a specific customer.
- `cyberqp_check_jit_account_exists` - check whether a JIT account exists for a customer + directory type.
- `cyberqp_get_tenant_jit_status` - get JIT account status across the entire tenant.

## Scope

**This is a deliberately narrow, read-only, non-credential-exposing v1 surface.** CyberQP is a PAM product - several of its real endpoints return live plaintext passwords and OTP codes, or mutate/provision privileged access. None of those are implemented here, by design, not by oversight:

**Hard-excluded (credential-exposing) - never implemented:**
- `GET /api/v1/account/{accountId}/password` (`AccountController_getAccountPassword_v1`)
- `GET /api/v1/jit/customer/{customerId}/account/{accountId}/password` (`JitController_getJitAccountPassword_v1`)
- `GET /api/v1/jit/customer/{customerId}/account/{accountId}/otp` (`JitController_getJitAccountOTP_v1`)
- `POST /api/v1/jit/customer/{customerId}/account/{accountId}/otp` (`JitController_saveJitAccountOtpSecret_v1`)
- `DELETE /api/v1/jit/customer/{customerId}/account/{accountId}/otp` (`JitController_deleteJitAccountOtpSecret_v1`)

**Hard-excluded (provisioning/mutation) - never implemented:**
- `PATCH /api/v1/jit/customer/{customerId}/account/{accountId}/enable` (`JitController_enableJitAccount_v1`)
- `PATCH /api/v1/jit/customer/{customerId}/account/{accountId}/disable` (`JitController_disableJitAccount_v1`)
- `DELETE /api/v1/jit/customer/{customerId}/account/{accountId}` (`JitController_deleteJitAccount_v1`)
- `POST /api/v1/jit/customer/{customerId}/account` (`JitController_createJitAccount_v1`)

**Out of v1 scope** (not credential/provisioning, just not part of this connector's metadata-visibility surface - could be added later as a deliberate follow-up):
- `GET /api/v1/customers/installer` (`CustomerController_downloadAgent_v1`) - returns a binary installer, not structured data.
- `GET /api/v1/tenants/install-token` (`TenantController_getInstallToken_v1`) - returns an installation token.
- `GET /api/v1/auth/login`, `GET /api/v1/auth/status`, `POST /api/v1/auth/refresh-token`, `POST /api/v1/auth/revoke-token`, `POST /api/v1/auth/notification-engine-token` - OAuth/session plumbing the gateway already owns, not tool-shaped.
- `POST /api/v1/event` (`EventController_processGenericEvent_v1`) - a write.
- `POST /api/v1/identity-verification/self-serve-notification` (`IdentityVerificationController_triggerSelfServePushIdentityVerification_v1`) - a write/notification trigger.

They can be added as a follow-up if there's demand, after a deliberate scope decision - not by default.

## Development

```bash
npm install
npm run build
npm test
npm run lint   # tsc --noEmit
```

## Docker

The image listens on `0.0.0.0` inside the container (`MCP_HTTP_HOST`) and defaults to `AUTH_MODE=gateway`. Publish the port on loopback and pass the S2S secret. In gateway mode the access token arrives on each request as `X-CyberQP-Access-Token`. It is not read from the environment.

```bash
docker build -t cyberqp-mcp .
docker run \
  -e CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" \
  -p 127.0.0.1:8080:8080 \
  cyberqp-mcp
```

Compose refuses to start when `CONDUIT_S2S_SECRET` is unset, defaults `AUTH_MODE` to `gateway`, publishes `127.0.0.1:8080:8080`, and does not set `CYBERQP_ACCESS_TOKEN` or `env_file`:

```bash
CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" docker compose up
```

Single-tenant HTTP (`AUTH_MODE=env`) still requires the S2S secret, then uses `CYBERQP_ACCESS_TOKEN`:

```bash
docker run \
  -e CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" \
  -e AUTH_MODE=env \
  -e CYBERQP_ACCESS_TOKEN="$CYBERQP_ACCESS_TOKEN" \
  -p 127.0.0.1:8080:8080 \
  cyberqp-mcp
```

Local HTTP without a secret is development-only. It binds `127.0.0.1` even when `MCP_HTTP_HOST` is `0.0.0.0`, and logs a warning:

```bash
MCP_TRANSPORT=http MCP_ALLOW_INSECURE_DEV=1 npm run start:http
```
