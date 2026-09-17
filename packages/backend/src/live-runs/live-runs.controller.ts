import { Body, Controller, Get, Param, Post, Put, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Action } from '@redinfo/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Actions } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { RequestUser } from '../event-reports/event-reports.service';
import { LiveRunsService } from './live-runs.service';
import { DelegationSettingsService } from './delegation-settings.service';
import { SyncLiveRunDto, UpdateDelegationSettingsDto } from './dto/live-run.dto';

@ApiTags('Live runs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('live-runs')
export class LiveRunsController {
  constructor(
    private readonly runs: LiveRunsService,
    private readonly settings: DelegationSettingsService,
  ) {}

  // ── Collection routes ──────────────────────────────────────────────────────
  // Every fixed path is declared before `:id`, so "me" and "settings" are never
  // read as run ids.

  /**
   * The coordinator's board — the emergencies being run right now.
   *
   * Oversight only, and through a projection that never selects the identity
   * column at all: a board request cannot leak a victim's name by accident,
   * because it never loads one.
   */
  @Get()
  @Actions(Action.VIEW_LIVE_RUNS)
  board() {
    return this.runs.board();
  }

  /**
   * The delegation's own configuration.
   *
   * Ungated: every crew running a call needs the CODU Dados number to dial and
   * the base to route from, and neither is a secret — the freephone line is on
   * the back of the vehicle.
   */
  @Get('settings')
  delegationSettings() {
    return this.settings.get();
  }

  @Put('settings')
  @Actions(Action.MANAGE_EMERGENCY_CONFIG)
  updateDelegationSettings(@Body() dto: UpdateDelegationSettingsDto) {
    return this.settings.update(dto);
  }

  /**
   * The caller's own runs — what a phone asks for when it comes back online.
   *
   * Ungated and scoped in the service, following `GET /event-reports/me`: someone
   * who cannot read the board can always read the run they are on.
   */
  @Get('me')
  findMine(@CurrentUser() user: RequestUser) {
    return this.runs.findMine(user);
  }

  // ── Single run ─────────────────────────────────────────────────────────────

  /** Ungated here because the answer depends on the row: `assertCanReadRun`. */
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.runs.findOne(id, user);
  }

  /**
   * The whole document, replacing whatever the server held.
   *
   * The id in the path and the id in the body are the same value; the body's is
   * the one used, and the DTO pins its charset. `CREATE_EVENT_REPORT` is the
   * gate because a live run is the report before it is finished — there is no
   * separate "write live runs" capability to grant or forget.
   */
  @Put(':id')
  @Actions(Action.CREATE_EVENT_REPORT)
  sync(
    @Param('id') id: string,
    @Body() dto: SyncLiveRunDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.runs.sync({ ...dto, id }, user);
  }

  /**
   * Closes the run and returns the draft report it became.
   *
   * A `POST` and not part of the sync, deliberately: closing creates a report,
   * which is a great deal more than a field change, and it must not be able to
   * happen as a side effect of a queued PUT replaying on reconnect.
   */
  @Post(':id/close')
  @Actions(Action.CREATE_EVENT_REPORT)
  close(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.runs.close(id, user);
  }
}
