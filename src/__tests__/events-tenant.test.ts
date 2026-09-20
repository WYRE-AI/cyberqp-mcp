import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleEventTool } from '../tools/events.js';
import { handleTenantTool } from '../tools/tenant.js';
import { runWithCredentials } from '../client.js';
import { jsonResponse, textOf } from './test-helpers.js';

describe('handleEventTool', () => {
  const fetchMock = vi.fn();
  const creds = { accessToken: 'token-1' };

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('cyberqp_get_events forwards every filter param', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [], totalItems: 0, limit: 50, hasMore: false, nextCursor: null })
    );

    await runWithCredentials(creds, () =>
      handleEventTool('cyberqp_get_events', {
        customerId: 'c1',
        status: 'Failed',
        startDate: '2026-09-01T00:00:00Z',
        endDate: '2026-09-20T00:00:00Z',
      })
    );

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/api/v1/event');
    expect(url.searchParams.get('customerId')).toBe('c1');
    expect(url.searchParams.get('status')).toBe('Failed');
    expect(url.searchParams.get('startDate')).toBe('2026-09-01T00:00:00Z');
  });

  it('cyberqp_get_event_types fetches with no params', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: ['SELF-SERVE'], totalItems: 1 }));

    const result = await runWithCredentials(creds, () => handleEventTool('cyberqp_get_event_types', {}));

    expect(fetchMock.mock.calls[0][0]).toBe('https://us.getquickpass.com/api/v1/event/types');
    expect(JSON.parse(textOf(result)).data).toEqual(['SELF-SERVE']);
  });
});

describe('handleTenantTool', () => {
  const fetchMock = vi.fn();
  const creds = { accessToken: 'token-1' };

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('cyberqp_get_tenant_company_data fetches the tenant profile', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { name: 'Acme MSP', timeZone: 'America/New_York' } }));

    const result = await runWithCredentials(creds, () => handleTenantTool('cyberqp_get_tenant_company_data', {}));

    expect(fetchMock.mock.calls[0][0]).toBe('https://us.getquickpass.com/api/v1/tenants/company-data');
    expect(JSON.parse(textOf(result)).data.name).toBe('Acme MSP');
  });
});
