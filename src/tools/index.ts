import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { CUSTOMER_TOOLS, handleCustomerTool, isCustomerTool } from './customers.js';
import { EVENT_TOOLS, handleEventTool, isEventTool } from './events.js';
import { TENANT_TOOLS, handleTenantTool, isTenantTool } from './tenant.js';
import { JIT_TOOLS, handleJitTool, isJitTool } from './jit.js';
import type { CallToolResult } from './types.js';

export const ALL_TOOLS: Tool[] = [...CUSTOMER_TOOLS, ...EVENT_TOOLS, ...TENANT_TOOLS, ...JIT_TOOLS];

export async function dispatchToolCall(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  if (isCustomerTool(name)) return handleCustomerTool(name, args);
  if (isEventTool(name)) return handleEventTool(name, args);
  if (isTenantTool(name)) return handleTenantTool(name, args);
  if (isJitTool(name)) return handleJitTool(name, args);
  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
}
