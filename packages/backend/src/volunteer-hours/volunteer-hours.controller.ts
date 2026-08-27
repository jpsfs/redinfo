import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Action } from '@redinfo/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Actions } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { VolunteerHoursService } from './volunteer-hours.service';
import { VolunteerHoursSummaryService } from './volunteer-hours-summary.service';
import { CreateManualVolunteerHoursDto } from './dto/create-manual-hours.dto';
import { UpdateVolunteerHoursDto } from './dto/update-hours.dto';
import { ApproveVolunteerHoursDto } from './dto/approve-hours.dto';
import { isIsoDate, toIsoDate } from '../utils/date.util';

@ApiTags('Volunteer hours')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('volunteer-hours')
export class VolunteerHoursController {
  constructor(
    private readonly volunteerHours: VolunteerHoursService,
    private readonly summary: VolunteerHoursSummaryService,
  ) {}

  /**
   * The caller's own entries — auto-generated ones and anything they logged
   * by hand. Ungated, like `GET /schedules/me`: scoped to the caller in the
   * service, not by capability.
   */
  @Get('me')
  getMyHours(@CurrentUser() user: { id: string }) {
    return this.volunteerHours.getMyHours(user.id);
  }

  /**
   * Log hours for something that never had a shift. Ungated for the same
   * reason `GET /me` is — the caller is always the subject.
   */
  @Post()
  createManualEntry(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateManualVolunteerHoursDto,
  ) {
    return this.volunteerHours.createManualEntry(user.id, dto);
  }

  /**
   * Correct your own entry — auto-generated or logged by hand — while it is
   * still pending. Ungated for the same reason `GET /me` and `POST /` are;
   * the service itself refuses anything not owned by the caller or no longer
   * PENDING.
   */
  @Patch(':id')
  updateMine(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateVolunteerHoursDto,
  ) {
    return this.volunteerHours.updateMine(id, user.id, dto);
  }

  @Get('pending')
  @Actions(Action.VIEW_VOLUNTEER_HOURS)
  getPendingQueue() {
    return this.volunteerHours.getPendingQueue();
  }

  @Post(':id/approve')
  @Actions(Action.MANAGE_VOLUNTEER_HOURS)
  approve(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ApproveVolunteerHoursDto,
  ) {
    return this.volunteerHours.approve(id, user.id, dto);
  }

  @Get('summary')
  @Actions(Action.VIEW_VOLUNTEER_HOURS)
  getSummary(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { resolvedFrom, resolvedTo } = resolveRange(from, to);
    return this.summary.getSummary(resolvedFrom, resolvedTo);
  }

  @Get('summary/csv')
  @Actions(Action.VIEW_VOLUNTEER_HOURS)
  async exportSummaryCsv(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res() res: Response,
  ) {
    const { resolvedFrom, resolvedTo } = resolveRange(from, to);
    const csv = await this.summary.getCsv(resolvedFrom, resolvedTo);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="volunteer-hours-${resolvedFrom}-to-${resolvedTo}.csv"`,
    );
    res.send(csv);
  }
}

/** Defaults to the calendar month to date when no range is given. */
function resolveRange(
  from?: string,
  to?: string,
): { resolvedFrom: string; resolvedTo: string } {
  if (from !== undefined && !isIsoDate(from)) {
    throw new BadRequestException('"from" must be a valid date (YYYY-MM-DD).');
  }
  if (to !== undefined && !isIsoDate(to)) {
    throw new BadRequestException('"to" must be a valid date (YYYY-MM-DD).');
  }
  const today = toIsoDate(new Date());
  const resolvedTo = to ?? today;
  const resolvedFrom = from ?? `${resolvedTo.slice(0, 7)}-01`;
  if (resolvedFrom > resolvedTo) {
    throw new BadRequestException('"from" must not be after "to".');
  }
  return { resolvedFrom, resolvedTo };
}
