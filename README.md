# CyberQP MCP Server

MCP server for [CyberQP](https://www.getquickpass.com/)'s (formerly QuickPass Cybersecurity) privileged access management (PAM) API - customer/account metadata, the tenant event log, and JIT (Just-In-Time) account status/policy visibility, for AI assistants and the WYRE Conduit gateway.

## Authentication

CyberQP authenticates with **OAuth2 authorization_code** flow (`offline_access` scope, refresh_token-backed) - not `client_credentials`. This connector never performs the OAuth dance itself: the WYRE Conduit gateway owns the authorize/exchange/refresh legs, and this server only ever receives a live bearer access token, sent as `Authorization: Bearer <token>` to CyberQP's API. In gateway mode the token arrives per-request via the `X-CyberQP-Access-Token` header; in local/stdio mode it's read once from `CYBERQP_ACCESS_TOKEN`.

## Configuration

| Env var | Description |
|---|---|
| `CYBERQP_ACCESS_TOKEN` | OAuth2 access token issued by CyberQP. |
| `MCP_TRANSPORT` | `stdio` (default) or `http`. |
| `AUTH_MODE` | `env` (default, reads the var above) or `gateway` (credential arrives per-request via the `X-CyberQP-Access-Token` header, injected by the Conduit gateway). |
| `CONDUIT_S2S_SECRET` | When set, the HTTP transport requires a valid `X-Gateway-S2S` header (Conduit sidecar auth) on every `/mcp` request. |
| `LOG_LEVEL` | `debug` \| `info` (default) \| `warn` \| `error`. |

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

```bash
docker build -t cyberqp-mcp .
docker run -p 8080:8080 -e CYBERQP_ACCESS_TOKEN=... cyberqp-mcp
```
