import { AsyncLocalStorage } from 'node:async_hooks';
import { logger } from './utils/logger.js';
import { CyberQpApiError, CyberQpAuthError, CyberQpRateLimitError } from './types.js';
import type {
  CheckJitAccountExistsParams,
  CustomerAccountsCountResponse,
  CustomersListResponse,
  CyberQpCredentials,
  CursorPagedResponse,
  EventTypesResponse,
  GetCustomerAccountsParams,
  GetCustomerJitStatusParams,
  GetEventsParams,
  GetJitPoliciesParams,
  GetTenantJitStatusParams,
  JitAccountCheckResponse,
  JitAccountsResponse,
  JitPoliciesResponse,
  ListCustomersParams,
  TenantCompanyDataResponse,
} from './types.js';

export const BASE_URL = 'https://us.getquickpass.com';

// Request-scoped credential store. In gateway mode the HTTP layer runs each
// request inside runWithCredentials({accessToken}); getCredentials() reads
// from it. Falls back to process.env for stdio/single-tenant mode.
const credStore = new AsyncLocalStorage<CyberQpCredentials>();

export function runWithCredentials<T>(creds: CyberQpCredentials, fn: () => T): T {
  return credStore.run(creds, fn);
}

export function getCredentials(): CyberQpCredentials | null {
  const scoped = credStore.getStore();
  if (scoped?.accessToken) return scoped;
  const accessToken = process.env.CYBERQP_ACCESS_TOKEN;
  if (!accessToken) {
    logger.warn('Missing credentials', { hasAccessToken: !!accessToken });
    return null;
  }
  return { accessToken };
}

function buildQuery(params: Record<string, unknown> = {}): URLSearchParams {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    qs.append(key, String(value));
  }
  return qs;
}

async function doGet<T>(
  creds: CyberQpCredentials,
  path: string,
  query?: Record<string, unknown>
): Promise<T> {
  const qs = query ? buildQuery(query).toString() : '';
  const url = `${BASE_URL}${path}${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${creds.accessToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });

  // 401 (invalid/expired access token) and 429 (rate-limited) are distinct
  // failure modes with distinct remediations - grouping them under one
  // generic auth-error class hides a transient rate limit behind a message
  // that reads like a bad/expired token.
  if (res.status === 401) {
    throw new CyberQpAuthError(`CyberQP rejected the access token (HTTP 401): ${path}`);
  }
  if (res.status === 429) {
    throw new CyberQpRateLimitError(`CyberQP rate-limited the request (HTTP 429): ${path}`);
  }
  if (!res.ok) {
    throw new CyberQpApiError(`CyberQP ${path} failed: HTTP ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------

/** GET /api/v1/customers - list customers visible to the authenticated technician. */
export async function listCustomers(
  creds: CyberQpCredentials,
  params: ListCustomersParams
): Promise<CustomersListResponse> {
  return doGet(creds, '/api/v1/customers', { ...params });
}

/** GET /api/v1/customers/{id}/accounts - metadata for every account under a customer (no credential material). */
export async function getCustomerAccounts(
  creds: CyberQpCredentials,
  id: string,
  params: GetCustomerAccountsParams = {}
): Promise<CursorPagedResponse<unknown>> {
  return doGet(creds, `/api/v1/customers/${encodeURIComponent(id)}/accounts`, { ...params });
}

/** GET /api/v1/customers/{id}/accounts/count - per-account-type counts for a customer. */
export async function getCustomerAccountsCount(
  creds: CyberQpCredentials,
  id: string
): Promise<CustomerAccountsCountResponse> {
  return doGet(creds, `/api/v1/customers/${encodeURIComponent(id)}/accounts/count`);
}

// ---------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------

/** GET /api/v1/event - the tenant's event log, filterable by customer/account/type/status/date range. */
export async function getEvents(
  creds: CyberQpCredentials,
  params: GetEventsParams = {}
): Promise<CursorPagedResponse<unknown>> {
  return doGet(creds, '/api/v1/event', { ...params });
}

/** GET /api/v1/event/types - the full set of event-type values usable in getEvents' eventType filter. */
export async function getEventTypes(creds: CyberQpCredentials): Promise<EventTypesResponse> {
  return doGet(creds, '/api/v1/event/types');
}

// ---------------------------------------------------------------------
// Tenant
// ---------------------------------------------------------------------

/** GET /api/v1/tenants/company-data - the authenticated tenant's own company profile (name, address, timezone). */
export async function getTenantCompanyData(creds: CyberQpCredentials): Promise<TenantCompanyDataResponse> {
  return doGet(creds, '/api/v1/tenants/company-data');
}

// ---------------------------------------------------------------------
// JIT (Just-In-Time) - read-only surface only. No enable/disable/create/
// delete/password/OTP tool exists in this connector by design; see README.
// ---------------------------------------------------------------------

/** GET /api/v1/jit-policies/account - the configured JIT policy (approval requirements, max duration) for a customer + account type. */
export async function getJitPolicies(
  creds: CyberQpCredentials,
  params: GetJitPoliciesParams
): Promise<JitPoliciesResponse> {
  return doGet(creds, '/api/v1/jit-policies/account', { ...params });
}

/** GET /api/v1/jit/customer/{customerId} - JIT account status for a specific customer (no password/OTP fields). */
export async function getCustomerJitStatus(
  creds: CyberQpCredentials,
  customerId: string,
  params: GetCustomerJitStatusParams = {}
): Promise<JitAccountsResponse> {
  return doGet(creds, `/api/v1/jit/customer/${encodeURIComponent(customerId)}`, { ...params });
}

/** GET /api/v1/jit/customer/{customerId}/account/check - whether a JIT account exists for a customer + directory type (existence only, never returns credential material). */
export async function checkJitAccountExists(
  creds: CyberQpCredentials,
  customerId: string,
  params: CheckJitAccountExistsParams
): Promise<JitAccountCheckResponse> {
  return doGet(creds, `/api/v1/jit/customer/${encodeURIComponent(customerId)}/account/check`, { ...params });
}

/** GET /api/v1/jit/tenant - JIT account status across the entire tenant (no password/OTP fields). */
export async function getTenantJitStatus(
  creds: CyberQpCredentials,
  params: GetTenantJitStatusParams = {}
): Promise<JitAccountsResponse> {
  return doGet(creds, '/api/v1/jit/tenant', { ...params });
}
