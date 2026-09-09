import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Action, EventLocationType, EventReportType, Gender, VictimDestinationKind } from '@redinfo/shared';
import { EventReportsService } from '../../event-reports/event-reports.service';
import { LiveRunsService } from '../../live-runs/live-runs.service';
import { MCP_READ_SCOPE, MCP_WRITE_SCOPE } from '../../oauth/oauth-scopes';
import type { McpToolDefinition, McpToolProvider } from '../mcp-tool.types';

/**
 * Event reports & live runs — gating mirrors the two controllers:
 * `search_event_reports` requires `VIEW_EVENT_REPORTS`, `create_event_report`
 * requires `CREATE_EVENT_REPORT`, and `get_live_run_board` requires
 * `VIEW_LIVE_RUNS` (oversight only — there is deliberately no live-run write
 * tool, the same reason there is no write route: closing a run is a report
 * being filed, which is `create_event_report`'s job). The "my" tools are
 * ungated, the row itself decides what the caller may see.
 *
 * `create_event_report`'s schema covers the fields every report needs
 * (crew, vehicles, victims, the operational narrative) but not the fuller
 * clinical record (assessments, ABCDE, CHAMU) or materials — a report
 * started here can still be finished in the app, same as any draft.
 */
@Injectable()
export class ReportsRunsToolsProvider implements McpToolProvider {
  constructor(
    private readonly eventReports: EventReportsService,
    private readonly liveRuns: LiveRunsService,
  ) {}

  getTools(): McpToolDefinition[] {
    return [
      {
        name: 'search_event_reports',
        title: 'Search event reports',
        description: 'Searches the filed/draft report archive, org-wide. Requires the event-reports view permission.',
        scope: MCP_READ_SCOPE,
        requiredActions: [Action.VIEW_EVENT_REPORTS],
        inputSchema: {
          type: z.nativeEnum(EventReportType).optional(),
          from: z.string().optional().describe('ISO date, inclusive'),
          to: z.string().optional().describe('ISO date, inclusive'),
          q: z.string().optional().describe('Matched against the report code, locality and crew names'),
          page: z.number().int().min(1).default(1),
          perPage: z.number().int().min(1).max(100).default(25),
        },
        annotations: { readOnlyHint: true },
        handler: async (args) =>
          this.eventReports.findAll({ type: args.type, from: args.from, to: args.to, q: args.q }, args.page, args.perPage),
      },
      {
        name: 'get_my_event_reports',
        title: 'Get my event reports',
        description: "The caller's own filed and draft reports.",
        scope: MCP_READ_SCOPE,
        requiredActions: [],
        inputSchema: {
          page: z.number().int().min(1).default(1),
          perPage: z.number().int().min(1).max(100).default(25),
        },
        annotations: { readOnlyHint: true },
        handler: async (args, ctx) => this.eventReports.findMine(ctx.user.id, {}, args.page, args.perPage),
      },
      {
        name: 'get_event_report',
        title: 'Get an event report',
        description: 'One report in full.',
        scope: MCP_READ_SCOPE,
        requiredActions: [],
        inputSchema: { reportId: z.string() },
        annotations: { readOnlyHint: true },
        handler: async (args, ctx) => this.eventReports.findOne(args.reportId, ctx.user as never),
      },
      {
        name: 'create_event_report',
        title: 'File an event report',
        description:
          'Files a new event report. Requires the create-event-report permission. Covers the core ' +
          'fields; a clinical record or materials can be added afterward in the app.',
        scope: MCP_WRITE_SCOPE,
        requiredActions: [Action.CREATE_EVENT_REPORT],
        inputSchema: {
          type: z.nativeEnum(EventReportType),
          occurredOn: z.string().describe('ISO date, YYYY-MM-DD — the day the activity happened'),
          startedAt: z.string().describe('ISO datetime'),
          endedAt: z.string().optional().describe('ISO datetime'),
          externalReference: z.string().optional(),
          locationType: z.nativeEnum(EventLocationType),
          localityId: z.string(),
          operationalReport: z.string().describe('Rich text (HTML). Sanitized server-side.'),
          crew: z.array(z.object({ userId: z.string(), roleName: z.string().optional() })),
          vehicles: z.array(z.object({ vehicleId: z.string(), kilometres: z.number().min(0) })),
          victims: z.array(
            z.object({
              gender: z.nativeEnum(Gender),
              age: z.number().int().min(0).max(130),
              destinationKind: z.nativeEnum(VictimDestinationKind),
              destinationHospitalId: z.string().optional(),
            }),
          ),
        },
        annotations: { destructiveHint: false },
        handler: async (args, ctx) =>
          this.eventReports.create(args as never, ctx.user.id, { actor: ctx.user as never }),
      },
      {
        name: 'get_live_run_board',
        title: 'Get the live-run board',
        description: 'The board of emergencies currently being run, delegation-wide. Oversight only — requires the live-runs view permission.',
        scope: MCP_READ_SCOPE,
        requiredActions: [Action.VIEW_LIVE_RUNS],
        inputSchema: {},
        annotations: { readOnlyHint: true },
        handler: async () => this.liveRuns.board(),
      },
      {
        name: 'get_my_live_runs',
        title: 'Get my live runs',
        description: "The caller's own live runs, open or recently closed.",
        scope: MCP_READ_SCOPE,
        requiredActions: [],
        inputSchema: {},
        annotations: { readOnlyHint: true },
        handler: async (_args, ctx) => this.liveRuns.findMine(ctx.user as never),
      },
    ];
  }
}
