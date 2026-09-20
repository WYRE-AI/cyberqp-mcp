import type { CyberQpCredentials } from '../types.js';
import type { CallToolResult } from './types.js';

export function textResult(value: unknown): CallToolResult {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text', text }] };
}

export function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

/** Returns an error CallToolResult if credentials are missing, else null. */
export function requireCredentials(creds: CyberQpCredentials | null): CallToolResult | null {
  if (!creds) {
    return errorResult('No CyberQP credentials configured. Set CYBERQP_ACCESS_TOKEN.');
  }
  return null;
}

/** Shared input-schema fragment for the paginated list endpoints. */
export const PAGE_PARAMS_PROPERTIES = {
  limit: { type: 'number', description: 'Number of items per page.' },
  page: { type: 'number', description: 'Page number (1-based, offset pagination).' },
} as const;

/** Shared input-schema fragment for the cursor-paginated list endpoints. */
export const CURSOR_PAGE_PARAMS_PROPERTIES = {
  ...PAGE_PARAMS_PROPERTIES,
  cursor: { type: 'string', description: 'Opaque cursor from a previous response, for cursor-based pagination.' },
} as const;
