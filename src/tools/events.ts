import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCredentials, getEventTypes, getEvents } from '../client.js';
import type { CallToolResult } from './types.js';
import { CURSOR_PAGE_PARAMS_PROPERTIES, errorResult, requireCredentials, textResult } from './shared.js';

export const EVENT_TOOLS: Tool[] = [
  {
    name: 'cyberqp_get_events',
    description:
      "Get the tenant's event log (technician/account activity, e.g. self-serve resets, admin actions), filterable by customer, account, event type, status, and date range. Never returns account passwords or OTP codes.",
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'string', description: 'Filter events by customer ID.' },
        accountId: { type: 'string', description: 'Filter events by account ID.' },
        eventType: {
          type: 'string',
          description:
            'Filter by event type (e.g. SELF-SERVE, ACCOUNT-MANAGEMENT-END-USER). Call cyberqp_get_event_types for the full, current set of values.',
        },
        status: {
          type: 'string',
          enum: ['Success', 'Failed'],
          description: 'Filter by event outcome.',
        },
        startDate: { type: 'string', description: 'Only return events created at or after this ISO 8601 date.' },
        endDate: { type: 'string', description: 'Only return events created at or before this ISO 8601 date.' },
        ...CURSOR_PAGE_PARAMS_PROPERTIES,
      },
    },
  },
  {
    name: 'cyberqp_get_event_types',
    description: 'Get the full set of event-type values usable in cyberqp_get_events\' eventType filter.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const TOOL_NAMES = new Set(EVENT_TOOLS.map((t) => t.name));
export function isEventTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleEventTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'cyberqp_get_events') {
      return textResult(
        await getEvents(creds!, {
          customerId: args.customerId as string | undefined,
          accountId: args.accountId as string | undefined,
          eventType: args.eventType as string | undefined,
          status: args.status as 'Success' | 'Failed' | undefined,
          startDate: args.startDate as string | undefined,
          endDate: args.endDate as string | undefined,
          limit: args.limit as number | undefined,
          page: args.page as number | undefined,
          cursor: args.cursor as string | undefined,
        })
      );
    }

    if (name === 'cyberqp_get_event_types') {
      return textResult(await getEventTypes(creds!));
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
