import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCredentials, getTenantCompanyData } from '../client.js';
import type { CallToolResult } from './types.js';
import { errorResult, requireCredentials, textResult } from './shared.js';

export const TENANT_TOOLS: Tool[] = [
  {
    name: 'cyberqp_get_tenant_company_data',
    description: "Get the authenticated tenant's own company profile (name, address, timezone, contact phone).",
    inputSchema: { type: 'object', properties: {} },
  },
];

const TOOL_NAMES = new Set(TENANT_TOOLS.map((t) => t.name));
export function isTenantTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleTenantTool(name: string, _args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'cyberqp_get_tenant_company_data') {
      return textResult(await getTenantCompanyData(creds!));
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
