import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Action } from '@redinfo/shared';
import { SchedulesService } from '../../schedules/schedules.service';
import { MCP_READ_SCOPE, MCP_WRITE_SCOPE } from '../../oauth/oauth-scopes';
import type { McpToolDefinition, McpToolProvider } from '../mcp-tool.types';

/**
 * Schedules & duties — mirrors `SchedulesController`'s own gating exactly:
 * the three read tools are ungated there (visibility is a row-level question
 * the service already answers for `findAll`/`getBoard`/`getMyDuties`), the
 * two write tools require `MANAGE_SCHEDULES`, same as `PUT :id/shifts/...`
 * and `POST :id/publish`.
 */
@Injectable()
export class SchedulesToolsProvider implements McpToolProvider {
  constructor(private readonly schedules: SchedulesService) {}

  getTools(): McpToolDefinition[] {
    return [
      {
        name: 'list_schedules',
        title: 'List schedules',
        description:
          'Lists published schedules (drafts too, for a coordinator), optionally filtered by ' +
          'availability window, category, or status. Paginated.',
        scope: MCP_READ_SCOPE,
        requiredActions: [],
        inputSchema: {
          page: z.number().int().min(1).default(1),
          perPage: z.number().int().min(1).max(100).default(25),
          windowId: z.string().optional(),
          category: z.string().optional(),
          status: z.string().optional(),
        },
        annotations: { readOnlyHint: true },
        handler: async (args, ctx) =>
          this.schedules.findAll(ctx.user as never, args.page, args.perPage, {
            windowId: args.windowId,
            category: args.category,
            status: args.status,
          }),
      },
      {
        name: 'get_schedule_board',
        title: 'Get a schedule board',
        description: 'The full board for one schedule: days, shifts, assignments, gaps and conflicts.',
        scope: MCP_READ_SCOPE,
        requiredActions: [],
        inputSchema: { scheduleId: z.string() },
        annotations: { readOnlyHint: true },
        handler: async (args, ctx) => this.schedules.getBoard(args.scheduleId, ctx.user as never),
      },
      {
        name: 'get_my_duties',
        title: 'Get my upcoming duties',
        description: "The caller's own published upcoming shifts.",
        scope: MCP_READ_SCOPE,
        requiredActions: [],
        inputSchema: {},
        annotations: { readOnlyHint: true },
        handler: async (_args, ctx) => this.schedules.getMyDuties(ctx.user.id),
      },
      {
        name: 'adjust_shift',
        title: 'Adjust a shift',
        description:
          "Corrects one day's shift hours for one schedule (a clock-time correction, not a " +
          're-crewing). Requires schedule-management permission.',
        scope: MCP_WRITE_SCOPE,
        requiredActions: [Action.MANAGE_SCHEDULES],
        inputSchema: {
          scheduleId: z.string(),
          date: z.string().describe('ISO date, YYYY-MM-DD'),
          slot: z.number().int().min(1),
          startMinute: z.number().int().min(0).max(1439).describe('Minutes from midnight, e.g. 480 = 08:00'),
          endMinute: z.number().int().min(1).max(1440).describe('Minutes from midnight, e.g. 1440 = midnight'),
        },
        annotations: { destructiveHint: false, idempotentHint: true },
        handler: async (args, ctx) =>
          this.schedules.adjustShift(
            args.scheduleId,
            args.date,
            args.slot,
            { startMinute: args.startMinute, endMinute: args.endMinute },
            ctx.user.id,
          ),
      },
      {
        name: 'publish_schedule',
        title: 'Publish a schedule',
        description: 'Publishes a draft schedule, making it visible to everyone. Requires schedule-management permission.',
        scope: MCP_WRITE_SCOPE,
        requiredActions: [Action.MANAGE_SCHEDULES],
        inputSchema: { scheduleId: z.string() },
        annotations: { destructiveHint: false, idempotentHint: true },
        handler: async (args, ctx) => this.schedules.publish(args.scheduleId, ctx.user.id),
      },
    ];
  }
}
