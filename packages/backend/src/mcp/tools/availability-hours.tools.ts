import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Action } from '@redinfo/shared';
import { AvailabilityService } from '../../availability/availability.service';
import { AvailabilityWindowsService } from '../../availability/availability-windows.service';
import { VolunteerHoursService } from '../../volunteer-hours/volunteer-hours.service';
import { MCP_READ_SCOPE, MCP_WRITE_SCOPE } from '../../oauth/oauth-scopes';
import type { McpToolDefinition, McpToolProvider } from '../mcp-tool.types';

/**
 * Availability & volunteer hours — gating mirrors `AvailabilityController`
 * and `VolunteerHoursController`: `list_open_availability_windows` is
 * ungated there (`GET availability-windows/open`), the "my" tools require
 * `SUBMIT_AVAILABILITY` the same way `availability/me` does, and the review
 * tools require `VIEW_VOLUNTEER_HOURS`/`MANAGE_VOLUNTEER_HOURS` the same way
 * `volunteer-hours/review` and `.../:id/approve` do.
 */
@Injectable()
export class AvailabilityHoursToolsProvider implements McpToolProvider {
  constructor(
    private readonly availability: AvailabilityService,
    private readonly availabilityWindows: AvailabilityWindowsService,
    private readonly volunteerHours: VolunteerHoursService,
  ) {}

  getTools(): McpToolDefinition[] {
    return [
      {
        name: 'list_open_availability_windows',
        title: 'List open availability windows',
        description: 'The availability windows currently accepting submissions.',
        scope: MCP_READ_SCOPE,
        requiredActions: [],
        inputSchema: {},
        annotations: { readOnlyHint: true },
        handler: async () => this.availabilityWindows.findOpen(),
      },
      {
        name: 'get_my_availability',
        title: 'Get my declared availability',
        description: "The caller's own declared availability for a window (defaults to the currently open one).",
        scope: MCP_READ_SCOPE,
        requiredActions: [Action.SUBMIT_AVAILABILITY],
        inputSchema: { windowId: z.string().optional() },
        annotations: { readOnlyHint: true },
        handler: async (args, ctx) => this.availability.getMine(ctx.user.id, args.windowId),
      },
      {
        name: 'submit_my_availability',
        title: 'Submit my availability',
        description:
          'Declares the days and shift slots the caller is available for in a window. Replaces any ' +
          'previous submission for that window.',
        scope: MCP_WRITE_SCOPE,
        requiredActions: [Action.SUBMIT_AVAILABILITY],
        inputSchema: {
          entries: z.array(
            z.object({
              date: z.string().describe('ISO date, YYYY-MM-DD'),
              slots: z.array(z.number().int().min(1)).describe('Shift slot numbers on that day'),
            }),
          ),
          windowId: z.string().optional().describe('Defaults to the currently open window'),
        },
        annotations: { destructiveHint: false, idempotentHint: true },
        handler: async (args, ctx) =>
          this.availability.submitMine(ctx.user as never, { entries: args.entries, windowId: args.windowId }),
      },
      {
        name: 'get_my_hours',
        title: 'Get my volunteer hours',
        description: "The caller's own logged volunteer hours, with approved/pending totals.",
        scope: MCP_READ_SCOPE,
        requiredActions: [],
        inputSchema: {},
        annotations: { readOnlyHint: true },
        handler: async (_args, ctx) => this.volunteerHours.getMyHours(ctx.user.id),
      },
      {
        name: 'log_my_hours',
        title: 'Log volunteer hours',
        description:
          'Logs hours for something the schedule never captured (a shift worked off-rota, a meeting, ' +
          'training, ...). Always lands pending a coordinator review.',
        scope: MCP_WRITE_SCOPE,
        requiredActions: [],
        inputSchema: {
          activityType: z.string(),
          date: z.string().describe('ISO date, YYYY-MM-DD'),
          minutes: z.number().int().min(1),
          startMinute: z.number().int().min(0).max(1439).optional(),
          endMinute: z.number().int().min(1).max(1440).optional(),
          description: z.string().max(1000).optional(),
        },
        annotations: { destructiveHint: false },
        handler: async (args, ctx) => this.volunteerHours.createManualEntry(ctx.user.id, args as never),
      },
      {
        name: 'list_hours_for_review',
        title: 'List volunteer hours awaiting review',
        description: "The coordinator review queue — defaults to pending entries. Requires the volunteer-hours view permission.",
        scope: MCP_READ_SCOPE,
        requiredActions: [Action.VIEW_VOLUNTEER_HOURS],
        inputSchema: {
          status: z.string().optional(),
          search: z.string().optional(),
          from: z.string().optional().describe('ISO date, inclusive'),
          to: z.string().optional().describe('ISO date, inclusive'),
          page: z.number().int().min(1).default(1),
          perPage: z.number().int().min(1).max(100).default(25),
        },
        annotations: { readOnlyHint: true },
        handler: async (args) => this.volunteerHours.getReviewQueue(args as never),
      },
      {
        name: 'approve_hours_entry',
        title: 'Approve a volunteer hours entry',
        description:
          'Approves an entry as proposed, or with the minutes corrected (a reason is required when ' +
          'correcting). Requires volunteer-hours management permission.',
        scope: MCP_WRITE_SCOPE,
        requiredActions: [Action.MANAGE_VOLUNTEER_HOURS],
        inputSchema: {
          entryId: z.string(),
          minutes: z.number().int().min(0).optional().describe('Omit to approve the proposed minutes unchanged'),
          correctionReason: z.string().max(500).optional().describe('Required exactly when minutes is set'),
        },
        annotations: { destructiveHint: false, idempotentHint: true },
        handler: async (args, ctx) =>
          this.volunteerHours.approve(args.entryId, ctx.user.id, {
            minutes: args.minutes,
            correctionReason: args.correctionReason,
          }),
      },
    ];
  }
}
