import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleJitTool, JIT_TOOLS } from '../tools/jit.js';
import { runWithCredentials } from '../client.js';
import { jsonResponse, textOf } from './test-helpers.js';

describe('handleJitTool', () => {
  const fetchMock = vi.fn();
  const creds = { accessToken: 'token-1' };

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Hard scope boundary: this connector must NEVER expose a password/OTP/
  // provisioning JIT tool. Pin the exact tool set so an accidental addition
  // (e.g. a copy-pasted "enable"/"disable"/"create"/"delete"/password/otp
  // tool) fails this test immediately rather than silently shipping.
  it('exposes exactly the 4 read-only JIT tools - no password/OTP/provisioning tool', () => {
    const names = JIT_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual([
      'cyberqp_check_jit_account_exists',
      'cyberqp_get_customer_jit_status',
      'cyberqp_get_jit_policies',
      'cyberqp_get_tenant_jit_status',
    ]);
    for (const n of names) {
      expect(n).not.toMatch(/password|otp|enable|disable|create|delete/i);
    }
  });

  it('cyberqp_get_jit_policies requires both customerId and accountType', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ maxDurationMinutes: 60 }], maxCount: 1 }));

    const result = await runWithCredentials(creds, () =>
      handleJitTool('cyberqp_get_jit_policies', { customerId: 'c1', accountType: 'HYBRID' })
    );

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/api/v1/jit-policies/account');
    expect(url.searchParams.get('customerId')).toBe('c1');
    expect(url.searchParams.get('accountType')).toBe('HYBRID');
    expect(result.isError).toBeUndefined();
  });

  it('cyberqp_get_customer_jit_status hits the per-customer status endpoint and never returns a password field', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ id: 'jit1', username: 'svc-admin', enabled: true }], maxCount: 1 })
    );

    const result = await runWithCredentials(creds, () =>
      handleJitTool('cyberqp_get_customer_jit_status', { customerId: 'c1', searchText: 'svc' })
    );

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/api/v1/jit/customer/c1');
    expect(url.searchParams.get('searchText')).toBe('svc');
    expect(textOf(result)).not.toMatch(/"password"|"otp"/i);
  });

  it('cyberqp_check_jit_account_exists checks existence only, forwarding userType and optional agentId', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ account: null }));

    await runWithCredentials(creds, () =>
      handleJitTool('cyberqp_check_jit_account_exists', { customerId: 'c1', userType: 'LOCAL', agentId: 'agent-9' })
    );

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/api/v1/jit/customer/c1/account/check');
    expect(url.searchParams.get('userType')).toBe('LOCAL');
    expect(url.searchParams.get('agentId')).toBe('agent-9');
  });

  it('cyberqp_get_tenant_jit_status hits the tenant-wide status endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [], maxCount: 0 }));

    await runWithCredentials(creds, () => handleJitTool('cyberqp_get_tenant_jit_status', {}));

    expect(new URL(fetchMock.mock.calls[0][0] as string).pathname).toBe('/api/v1/jit/tenant');
  });
});
