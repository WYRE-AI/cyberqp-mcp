import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  checkJitAccountExists,
  getCredentials,
  getCustomerJitStatus,
  getJitPolicies,
  getTenantJitStatus,
} from '../client.js';
import type { CallToolResult } from './types.js';
import { errorResult, requireCredentials, textResult } from './shared.js';

/**
 * JIT (Just-In-Time) tools - READ-ONLY STATUS/POLICY SURFACE ONLY.
 *
 * By deliberate design this connector exposes none of CyberQP's JIT
 * mutation endpoints (create/enable/disable/delete a JIT account) and none
 * of its credential-exposing endpoints (account password, JIT account
 * password, JIT OTP get/save/delete). Those are hard-excluded from v1 - see
 * the README's Scope section for the full list of excluded operationIds.
 * Every tool below returns account/policy metadata (status, existence,
 * approval requirements) and never a secret value.
 */
export const JIT_TOOLS: Tool[] = [
  {
    name: 'cyberqp_get_jit_policies',
    description:
      "Get the configured JIT policy (approval requirements, max session duration) for a customer + account type. Policy configuration only - never returns credential material.",
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'string', description: 'Customer ID.' },
        accountType: {
          type: 'string',
          enum: ['AD', 'OFFICE', 'LOCAL', 'HYBRID'],
          description: 'Account type the policy applies to.',
        },
      },
      required: ['customerId', 'accountType'],
    },
  },
  {
    name: 'cyberqp_get_customer_jit_status',
    description:
      "Get JIT account status (existence, enabled/disabled state, metadata) for a specific customer. Never returns a password or OTP code - use this to check the current state of JIT accounts, not to retrieve credentials.",
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'string', description: 'Customer ID.' },
        searchText: { type: 'string', description: 'Optional search text to filter accounts by username.' },
        limit: { type: 'number', description: 'Number of items per page.' },
        page: { type: 'number', description: 'Page number (1-based).' },
      },
      required: ['customerId'],
    },
  },
  {
    name: 'cyberqp_check_jit_account_exists',
    description:
      "Check whether a JIT account exists for a customer + directory type (existence check only - returns account metadata if present, never a password or OTP code).",
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'string', description: 'Customer ID.' },
        userType: {
          type: 'string',
          enum: ['AD', 'OFFICE', 'LOCAL'],
          description: 'Directory type to check.',
        },
        agentId: { type: 'string', description: 'Agent ID, required for LOCAL accounts.' },
      },
      required: ['customerId', 'userType'],
    },
  },
  {
    name: 'cyberqp_get_tenant_jit_status',
    description:
      "Get JIT account status (existence, enabled/disabled state, metadata) across the entire tenant. Never returns a password or OTP code.",
    inputSchema: {
      type: 'object',
      properties: {
        searchText: { type: 'string', description: 'Optional search text to filter accounts by username.' },
        limit: { type: 'number', description: 'Number of items per page.' },
        page: { type: 'number', description: 'Page number (1-based).' },
      },
    },
  },
];

const TOOL_NAMES = new Set(JIT_TOOLS.map((t) => t.name));
export function isJitTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleJitTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'cyberqp_get_jit_policies') {
      return textResult(
        await getJitPolicies(creds!, {
          customerId: args.customerId as string,
          accountType: args.accountType as 'AD' | 'OFFICE' | 'LOCAL' | 'HYBRID',
        })
      );
    }

    if (name === 'cyberqp_get_customer_jit_status') {
      return textResult(
        await getCustomerJitStatus(creds!, args.customerId as string, {
          searchText: args.searchText as string | undefined,
          limit: args.limit as number | undefined,
          page: args.page as number | undefined,
        })
      );
    }

    if (name === 'cyberqp_check_jit_account_exists') {
      return textResult(
        await checkJitAccountExists(creds!, args.customerId as string, {
          userType: args.userType as 'AD' | 'OFFICE' | 'LOCAL',
          agentId: args.agentId as string | undefined,
        })
      );
    }

    if (name === 'cyberqp_get_tenant_jit_status') {
      return textResult(
        await getTenantJitStatus(creds!, {
          searchText: args.searchText as string | undefined,
          limit: args.limit as number | undefined,
          page: args.page as number | undefined,
        })
      );
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
