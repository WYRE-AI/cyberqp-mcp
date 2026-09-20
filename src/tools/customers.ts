import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCredentials, getCustomerAccounts, getCustomerAccountsCount, listCustomers } from '../client.js';
import type { CallToolResult } from './types.js';
import { CURSOR_PAGE_PARAMS_PROPERTIES, errorResult, requireCredentials, textResult } from './shared.js';

export const CUSTOMER_TOOLS: Tool[] = [
  {
    name: 'cyberqp_list_customers',
    description:
      "List customers visible to the authenticated CyberQP technician account, filterable by directory type and name. Metadata only (customer id, name, attributes) - never returns account passwords or OTP codes.",
    inputSchema: {
      type: 'object',
      properties: {
        directoryType: {
          type: 'string',
          enum: ['AD', 'OFFICE', 'LOCAL'],
          description: 'Directory type to filter customers by.',
        },
        name: { type: 'string', description: 'Filter by customer name.' },
        limit: { type: 'number', description: 'Number of items per page. Defaults to 25.' },
        page: { type: 'number', description: 'Page number. Defaults to 1.' },
      },
      required: ['directoryType'],
    },
  },
  {
    name: 'cyberqp_get_customer_accounts',
    description:
      "List account METADATA for a customer (id, username, type, status) - never returns passwords or OTP codes. Optionally filter by account type (enduser/admin/service/jit).",
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Customer ID.' },
        accountType: {
          type: 'string',
          enum: ['enduser', 'admin', 'service', 'jit'],
          description: 'Filter accounts by type.',
        },
        ...CURSOR_PAGE_PARAMS_PROPERTIES,
      },
      required: ['id'],
    },
  },
  {
    name: 'cyberqp_get_customer_accounts_count',
    description: 'Get counts of each account type (enduser/admin/service/jit) for a customer.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Customer ID.' },
      },
      required: ['id'],
    },
  },
];

const TOOL_NAMES = new Set(CUSTOMER_TOOLS.map((t) => t.name));
export function isCustomerTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleCustomerTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'cyberqp_list_customers') {
      return textResult(
        await listCustomers(creds!, {
          directoryType: args.directoryType as 'AD' | 'OFFICE' | 'LOCAL',
          name: args.name as string | undefined,
          limit: args.limit as number | undefined,
          page: args.page as number | undefined,
        })
      );
    }

    if (name === 'cyberqp_get_customer_accounts') {
      return textResult(
        await getCustomerAccounts(creds!, args.id as string, {
          accountType: args.accountType as 'enduser' | 'admin' | 'service' | 'jit' | undefined,
          limit: args.limit as number | undefined,
          page: args.page as number | undefined,
          cursor: args.cursor as string | undefined,
        })
      );
    }

    if (name === 'cyberqp_get_customer_accounts_count') {
      return textResult(await getCustomerAccountsCount(creds!, args.id as string));
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
