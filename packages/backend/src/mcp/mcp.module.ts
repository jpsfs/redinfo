import { Module } from '@nestjs/common';
import { SchedulesModule } from '../schedules/schedules.module';
import { AvailabilityModule } from '../availability/availability.module';
import { VolunteerHoursModule } from '../volunteer-hours/volunteer-hours.module';
import { EventReportsModule } from '../event-reports/event-reports.module';
import { LiveRunsModule } from '../live-runs/live-runs.module';
import { UsersModule } from '../users/users.module';
import { SchedulesToolsProvider } from './tools/schedules.tools';
import { AvailabilityHoursToolsProvider } from './tools/availability-hours.tools';
import { ReportsRunsToolsProvider } from './tools/reports-runs.tools';
import { ToolRegistryService } from './tool-registry.service';
import { McpServerFactory } from './mcp-server.factory';
import { McpAuditService } from './mcp-audit.service';
import { MCP_TOOL_DEFINITIONS } from './mcp.tokens';
import type { McpToolDefinition } from './mcp-tool.types';

/**
 * The `/mcp` resource server's tool surface. `main.ts` does the actual
 * mounting (`mountMcpServer`) — this module only supplies what that needs:
 * `McpServerFactory`, `UsersModule` (for a fresh per-request user lookup),
 * and every v1 domain module for its tool provider to call straight into
 * (`ReportsRunsToolsProvider` etc.) — see the plan's "no internal HTTP"
 * principle in each tool file's doc comment.
 *
 * Adding a domain: write a new `<domain>.tools.ts` `McpToolProvider`, list
 * its module in `imports`, list the provider in `providers`, and add it to
 * the `MCP_TOOL_DEFINITIONS` factory below.
 */
@Module({
  imports: [SchedulesModule, AvailabilityModule, VolunteerHoursModule, EventReportsModule, LiveRunsModule, UsersModule],
  providers: [
    SchedulesToolsProvider,
    AvailabilityHoursToolsProvider,
    ReportsRunsToolsProvider,
    {
      provide: MCP_TOOL_DEFINITIONS,
      useFactory: (
        schedules: SchedulesToolsProvider,
        availabilityHours: AvailabilityHoursToolsProvider,
        reportsRuns: ReportsRunsToolsProvider,
      ): McpToolDefinition[] => [...schedules.getTools(), ...availabilityHours.getTools(), ...reportsRuns.getTools()],
      inject: [SchedulesToolsProvider, AvailabilityHoursToolsProvider, ReportsRunsToolsProvider],
    },
    ToolRegistryService,
    McpAuditService,
    McpServerFactory,
  ],
  exports: [McpServerFactory],
})
export class McpModule {}
