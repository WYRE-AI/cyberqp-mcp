/**
 * HTTP transport fail-closed auth.
 *
 * Startup requires a real CONDUIT_S2S_SECRET unless MCP_ALLOW_INSECURE_DEV=1.
 * Known placeholder secrets are rejected even with that flag. The flag binds
 * 127.0.0.1 only. /mcp rejects a missing or invalid X-Gateway-S2S header.
 * AUTH_MODE=gateway rejects requests that omit X-CyberQP-Access-Token and
 * must not fall back to CYBERQP_ACCESS_TOKEN in process.env.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac } from 'node:crypto';
import type { Server } from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CyberQpCredentials } from '../types.js';

const credStore = new AsyncLocalStorage<CyberQpCredentials>();

const { getCredentialsMock, runWithCredentialsMock } = vi.hoisted(() => {
  return {
    getCredentialsMock: vi.fn(),
    runWithCredentialsMock: vi.fn(),
  };
});

vi.mock('../client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../client.js')>();
  return {
    ...actual,
    getCredentials: () => getCredentialsMock(),
    runWithCredentials: <T>(creds: CyberQpCredentials, fn: () => T): T => runWithCredentialsMock(creds, fn),
  };
});

import { startHttpTransport } from '../http.js';

const S2S_SECRET = 'test-s2s-secret-do-not-log';
const ENV_ACCESS_TOKEN = 'env-access-token-must-not-be-used';
const HEADER_ACCESS_TOKEN = 'header-access-token-from-gateway';

const ENV_KEYS = [
  'CONDUIT_S2S_SECRET',
  'MCP_ALLOW_INSECURE_DEV',
  'MCP_HTTP_PORT',
  'MCP_HTTP_HOST',
  'AUTH_MODE',
  'CYBERQP_ACCESS_TOKEN',
  'LOG_LEVEL',
  'MCP_TRANSPORT',
] as const;

const savedEnv = new Map<string, string | undefined>();
const servers: Server[] = [];

function mintS2sHeader(secret: string, unixSeconds = Math.floor(Date.now() / 1000)): string {
  const message = `t=${unixSeconds}`;
  const hex = createHmac('sha256', secret).update(message).digest('hex');
  return `${message},v1=${hex}`;
}

function silenceLogs(): { errors: string[] } {
  const errors: string[] = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
  });
  return { errors };
}

function assertNoSecrets(logged: string, extra: string[] = []): void {
  expect(logged).not.toContain(S2S_SECRET);
  expect(logged).not.toContain(ENV_ACCESS_TOKEN);
  expect(logged).not.toContain(HEADER_ACCESS_TOKEN);
  for (const value of extra) {
    expect(logged).not.toContain(value);
  }
}

function mcpHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    ...extra,
  };
}

const companyCall = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: 'cyberqp_get_tenant_company_data', arguments: {} },
});

async function listen(): Promise<{ port: number; address: string; server: Server }> {
  const server = await startHttpTransport();
  servers.push(server);
  const bound = server.address();
  if (!bound || typeof bound === 'string') {
    throw new Error('HTTP server did not bind a TCP port');
  }
  return { port: bound.port, address: bound.address, server };
}

function exitSpy(): void {
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit:${String(code)}`);
  }) as typeof process.exit);
}

beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv.set(key, process.env[key]);
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

beforeEach(() => {
  process.env.MCP_HTTP_PORT = '0';
  process.env.MCP_HTTP_HOST = '127.0.0.1';
  process.env.LOG_LEVEL = 'info';
  delete process.env.CONDUIT_S2S_SECRET;
  delete process.env.MCP_ALLOW_INSECURE_DEV;
  delete process.env.AUTH_MODE;
  delete process.env.CYBERQP_ACCESS_TOKEN;
  delete process.env.MCP_TRANSPORT;

  credStore.disable();
  getCredentialsMock.mockReset();
  getCredentialsMock.mockImplementation(() => credStore.getStore() ?? null);
  runWithCredentialsMock.mockReset();
  runWithCredentialsMock.mockImplementation(<T>(creds: CyberQpCredentials, fn: () => T): T => {
    return credStore.run(creds, fn);
  });

  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify({ name: 'Acme' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
  );
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  while (servers.length > 0) {
    const server = servers.pop();
    if (!server) continue;
    await new Promise<void>((resolve, reject) => {
      if (!server.listening) {
        resolve();
        return;
      }
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

describe('HTTP startup', () => {
  it('refuses to start when CONDUIT_S2S_SECRET is empty', async () => {
    const { errors } = silenceLogs();
    exitSpy();

    await expect(startHttpTransport()).rejects.toThrow('process.exit:1');
    const logged = errors.join('\n');
    expect(logged).toContain('Refusing to start HTTP transport');
    expect(logged).toContain('CONDUIT_S2S_SECRET is empty');
    assertNoSecrets(logged);
  });

  it('still refuses when MCP_ALLOW_INSECURE_DEV is not exactly 1', async () => {
    process.env.MCP_ALLOW_INSECURE_DEV = 'true';
    const { errors } = silenceLogs();
    exitSpy();

    await expect(startHttpTransport()).rejects.toThrow('process.exit:1');
    expect(errors.join('\n')).toContain('Refusing to start HTTP transport');
  });

  it.each(['changeme', 'ChangeMe', 'your-s2s-secret', 'placeholder', '  secret  '])(
    'refuses known placeholder secret %j and does not log it',
    async (value) => {
      process.env.CONDUIT_S2S_SECRET = value;
      const { errors } = silenceLogs();
      exitSpy();

      await expect(startHttpTransport()).rejects.toThrow('process.exit:1');
      const logged = errors.join('\n');
      expect(logged).toContain('known placeholder');
      expect(logged).not.toContain('SECURITY WARNING');
      const distinctive = value.trim().toLowerCase();
      // The static error text contains the words "placeholder" and "SECRET".
      if (distinctive !== 'secret' && distinctive !== 'placeholder') {
        expect(logged.toLowerCase()).not.toContain(distinctive);
      }
    }
  );

  it('refuses a placeholder even when MCP_ALLOW_INSECURE_DEV=1', async () => {
    process.env.CONDUIT_S2S_SECRET = 'changeme';
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    const { errors } = silenceLogs();
    exitSpy();

    await expect(startHttpTransport()).rejects.toThrow('process.exit:1');
    const logged = errors.join('\n');
    expect(logged).toContain('known placeholder');
    expect(logged).not.toContain('changeme');
    expect(logged).not.toContain('SECURITY WARNING');
  });

  it('allows startup with a warning when MCP_ALLOW_INSECURE_DEV=1 and binds 127.0.0.1', async () => {
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    delete process.env.MCP_HTTP_HOST;
    const { errors } = silenceLogs();

    const server = await listen();
    const logged = errors.join('\n');
    expect(server.address).toBe('127.0.0.1');
    expect(logged).toContain('SECURITY WARNING');
    expect(logged).toContain('CONDUIT_S2S_SECRET');
    expect(logged).toContain('MCP_ALLOW_INSECURE_DEV=1');
    expect(logged).toContain('127.0.0.1');
    expect(logged).not.toContain('is not 127.0.0.1');
    assertNoSecrets(logged);
  });

  it.each(['0.0.0.0', '10.1.2.3', 'localhost', '::1'])(
    'forces 127.0.0.1 when insecure dev is set and MCP_HTTP_HOST is %s',
    async (host) => {
      process.env.MCP_ALLOW_INSECURE_DEV = '1';
      process.env.MCP_HTTP_HOST = host;
      const { errors } = silenceLogs();

      const server = await listen();
      const logged = errors.join('\n');
      expect(server.address).toBe('127.0.0.1');
      expect(logged).toContain(`MCP_HTTP_HOST=${host} is not 127.0.0.1`);
      expect(logged).toContain('Binding 127.0.0.1 only');
      assertNoSecrets(logged);
    }
  );

  it('honors a non-loopback MCP_HTTP_HOST when CONDUIT_S2S_SECRET is set', async () => {
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    process.env.MCP_HTTP_HOST = '0.0.0.0';
    const { errors } = silenceLogs();

    const server = await listen();
    expect(server.address).toBe('0.0.0.0');
    expect(errors.join('\n')).not.toContain('is not 127.0.0.1');
    assertNoSecrets(errors.join('\n'));
  });

  it('binds 127.0.0.1 when MCP_HTTP_HOST is unset and a secret is configured', async () => {
    delete process.env.MCP_HTTP_HOST;
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    const { errors } = silenceLogs();

    const server = await listen();
    expect(server.address).toBe('127.0.0.1');
    assertNoSecrets(errors.join('\n'));
  });
});

describe('HTTP /mcp authentication', () => {
  beforeEach(() => {
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    process.env.AUTH_MODE = 'gateway';
    process.env.CYBERQP_ACCESS_TOKEN = ENV_ACCESS_TOKEN;
  });

  it('returns 401 when the S2S header is missing or invalid and does not log the secret', async () => {
    const { errors } = silenceLogs();
    const server = await listen();

    const missing = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: 'POST',
      headers: mcpHeaders({ 'x-cyberqp-access-token': HEADER_ACCESS_TOKEN }),
      body: companyCall,
    });
    const invalid = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: 'POST',
      headers: mcpHeaders({
        'x-gateway-s2s': mintS2sHeader('wrong-secret'),
        'x-cyberqp-access-token': HEADER_ACCESS_TOKEN,
      }),
      body: companyCall,
    });

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    const missingBody = await missing.text();
    const invalidBody = await invalid.text();
    expect(missingBody).toContain('X-Gateway-S2S');
    expect(invalidBody).toContain('X-Gateway-S2S');
    expect(missingBody).not.toContain(S2S_SECRET);
    expect(invalidBody).not.toContain(S2S_SECRET);
    expect(missingBody).not.toContain(ENV_ACCESS_TOKEN);
    expect(missingBody).not.toContain(HEADER_ACCESS_TOKEN);
    assertNoSecrets(errors.join('\n'));
    expect(getCredentialsMock).not.toHaveBeenCalled();
    expect(runWithCredentialsMock).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 401 in gateway mode without credential headers and does not use env credentials', async () => {
    silenceLogs();
    const server = await listen();

    const response = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: 'POST',
      headers: mcpHeaders({ 'x-gateway-s2s': mintS2sHeader(S2S_SECRET) }),
      body: companyCall,
    });
    const body = await response.text();

    expect(response.status).toBe(401);
    expect(body).toContain('X-CyberQP-Access-Token');
    expect(body).not.toContain(ENV_ACCESS_TOKEN);
    expect(body).not.toContain(S2S_SECRET);
    expect(getCredentialsMock).not.toHaveBeenCalled();
    expect(runWithCredentialsMock).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();

    const empty = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: 'POST',
      headers: mcpHeaders({
        'x-gateway-s2s': mintS2sHeader(S2S_SECRET),
        'x-cyberqp-access-token': '',
      }),
      body: companyCall,
    });
    expect(empty.status).toBe(401);
    expect(runWithCredentialsMock).not.toHaveBeenCalled();
  });

  it('accepts a valid S2S header plus the access-token header and uses that credential', async () => {
    const { errors } = silenceLogs();
    const server = await listen();

    const response = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: 'POST',
      headers: mcpHeaders({
        'x-gateway-s2s': mintS2sHeader(S2S_SECRET),
        'x-cyberqp-access-token': HEADER_ACCESS_TOKEN,
      }),
      body: companyCall,
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).not.toContain(S2S_SECRET);
    expect(body).not.toContain(ENV_ACCESS_TOKEN);
    const payload = JSON.parse(body) as { result?: { content?: Array<{ text?: string }> } };
    const text = payload.result?.content?.[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ name: 'Acme' });
    expect(runWithCredentialsMock).toHaveBeenCalledWith(
      { accessToken: HEADER_ACCESS_TOKEN },
      expect.any(Function)
    );
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalled();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${HEADER_ACCESS_TOKEN}`);
    assertNoSecrets(errors.join('\n'));
  });

  it('serves /health without authentication and without reading credentials', async () => {
    silenceLogs();
    const server = await listen();

    const response = await fetch(`http://127.0.0.1:${server.port}/health`);
    const body = (await response.json()) as { status?: string; mode?: string; credentials?: unknown };

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.mode).toBe('gateway');
    expect(body).not.toHaveProperty('credentials');
    expect(JSON.stringify(body)).not.toContain(ENV_ACCESS_TOKEN);
    expect(JSON.stringify(body)).not.toContain(S2S_SECRET);
    expect(getCredentialsMock).not.toHaveBeenCalled();
    expect(runWithCredentialsMock).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('skips S2S in the insecure-dev bypass and still requires the gateway credential header', async () => {
    delete process.env.CONDUIT_S2S_SECRET;
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    process.env.MCP_HTTP_HOST = '0.0.0.0';
    silenceLogs();
    const server = await listen();
    expect(server.address).toBe('127.0.0.1');

    const missingToken = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: 'POST',
      headers: mcpHeaders(),
      body: companyCall,
    });
    expect(missingToken.status).toBe(401);
    expect(await missingToken.text()).toContain('X-CyberQP-Access-Token');
    expect(runWithCredentialsMock).not.toHaveBeenCalled();

    const accepted = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: 'POST',
      headers: mcpHeaders({ 'x-cyberqp-access-token': HEADER_ACCESS_TOKEN }),
      body: companyCall,
    });
    expect(accepted.status).toBe(200);
    expect(runWithCredentialsMock).toHaveBeenCalledWith(
      { accessToken: HEADER_ACCESS_TOKEN },
      expect.any(Function)
    );
  });
});
