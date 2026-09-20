/**
 * CyberQP authenticates with OAuth2 authorization_code (offline_access
 * scope, refresh_token-backed) - never client_credentials. This connector
 * never performs that dance itself: the WYRE Conduit gateway owns the
 * authorize/exchange/refresh legs and this server only ever receives a
 * live bearer access token, per-request in gateway mode or once at start
 * for local/stdio mode. See README's Authentication section.
 */
export interface CyberQpCredentials {
  accessToken: string;
}

/** Thrown when CyberQP rejects the access token (HTTP 401) - distinct from rate limiting so callers get an honest error. */
export class CyberQpAuthError extends Error {}

/** Thrown when CyberQP rate-limits the request (HTTP 429) - distinct from an auth failure. */
export class CyberQpRateLimitError extends Error {}

/** Thrown for any other non-2xx / unexpected vendor response. */
export class CyberQpApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export type DirectoryType = 'AD' | 'OFFICE' | 'LOCAL';
export type JitPolicyAccountType = 'AD' | 'OFFICE' | 'LOCAL' | 'HYBRID';
export type CustomerAccountType = 'enduser' | 'admin' | 'service' | 'jit';
export type EventStatus = 'Success' | 'Failed';

export interface PageParams {
  limit?: number;
  page?: number;
}

export interface CursorPageParams extends PageParams {
  cursor?: string;
}

export interface ListCustomersParams extends PageParams {
  name?: string;
  directoryType: DirectoryType;
}

export interface GetCustomerAccountsParams extends CursorPageParams {
  accountType?: CustomerAccountType;
}

export interface GetEventsParams extends CursorPageParams {
  customerId?: string;
  accountId?: string;
  eventType?: string;
  status?: EventStatus;
  startDate?: string;
  endDate?: string;
}

export interface GetJitPoliciesParams {
  accountType: JitPolicyAccountType;
  customerId: string;
}

export interface GetCustomerJitStatusParams extends PageParams {
  searchText?: string;
}

export interface CheckJitAccountExistsParams {
  userType: DirectoryType;
  agentId?: string;
}

export interface GetTenantJitStatusParams extends PageParams {
  searchText?: string;
}

/** Generic paginated-list envelope shared by /customers/{id}/accounts and /event. */
export interface CursorPagedResponse<T> {
  data: T[];
  totalItems?: number;
  limit?: number;
  hasMore?: boolean;
  nextCursor?: string | null;
  [key: string]: unknown;
}

export interface CustomersListResponse {
  totalItems: number;
  data: Array<{ type?: string; id: string; attributes?: Record<string, unknown>; [key: string]: unknown }>;
}

export interface CustomerAccountsCountResponse {
  data: {
    _id?: string;
    guid?: string;
    name?: string;
    enduser?: number;
    admin?: number;
    service?: number;
    jit?: number;
    [key: string]: unknown;
  };
}

export interface EventTypesResponse {
  data: string[];
  totalItems: number;
}

export interface TenantCompanyDataResponse {
  data: {
    name?: string;
    address?: string;
    city?: string;
    stateProvinceCode?: string;
    zipCode?: string;
    countryCode?: string;
    phoneNumber?: string;
    timeZone?: string;
    companyImage?: string;
    [key: string]: unknown;
  };
}

export interface JitPoliciesResponse {
  data: unknown[];
  maxCount: number;
}

export interface JitAccountsResponse {
  data: unknown[];
  maxCount: number;
}

export interface JitAccountCheckResponse {
  account: unknown | null;
}
