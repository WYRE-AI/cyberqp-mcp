import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCustomerTool } from '../tools/customers.js';
import { runWithCredentials } from '../client.js';
import { jsonResponse, textOf } from './test-helpers.js';

describe('handleCustomerTool', () => {
  const fetchMock = vi.fn();
  const creds = { accessToken: 'token-1' };

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('cyberqp_list_customers sends the Bearer token and required directoryType filter', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ totalItems: 1, data: [{ id: 'c1' }] }));

    const result = await runWithCredentials(creds, () =>
      handleCustomerTool('cyberqp_list_customers', { directoryType: 'AD' })
    );

    expect(result.isError).toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/api/v1/customers');
    expect(new URL(url).searchParams.get('directoryType')).toBe('AD');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-1');
    expect(JSON.parse(textOf(result)).totalItems).toBe(1);
  });

  it('cyberqp_get_customer_accounts requests account metadata for a customer, never credential fields', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ totalItems: 1, limit: 50, hasMore: false, nextCursor: null, data: [{ id: 'a1', accountType: 'admin' }] })
    );

    const result = await runWithCredentials(creds, () =>
      handleCustomerTool('cyberqp_get_customer_accounts', { id: 'c1', accountType: 'admin' })
    );

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/api/v1/customers/c1/accounts');
    expect(url.searchParams.get('accountType')).toBe('admin');
    expect(textOf(result)).not.toMatch(/password|otp/i);
  });

  it('cyberqp_get_customer_accounts_count fetches per-type counts', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { enduser: 3, admin: 1, service: 0, jit: 2 } })
    );

    const result = await runWithCredentials(creds, () =>
      handleCustomerTool('cyberqp_get_customer_accounts_count', { id: 'c1' })
    );

    expect(new URL(fetchMock.mock.calls[0][0] as string).pathname).toBe('/api/v1/customers/c1/accounts/count');
    expect(JSON.parse(textOf(result)).data.jit).toBe(2);
  });

  it('surfaces a 401 as a readable auth error rather than throwing', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'unauthorized' }, 401));

    const result = await runWithCredentials(creds, () =>
      handleCustomerTool('cyberqp_get_customer_accounts_count', { id: 'c1' })
    );

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/rejected the access token/i);
  });

  it('returns a credential error without calling fetch when no token is configured', async () => {
    const result = await handleCustomerTool('cyberqp_list_customers', { directoryType: 'AD' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/CYBERQP_ACCESS_TOKEN/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
