import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { StatisticsPeopleService } from './statistics-people.service';
import { StatisticsActivityService } from './statistics-activity.service';
import { StatisticsFleetService } from './statistics-fleet.service';
import { StatisticsQueryDto } from './dto/statistics-query.dto';

/**
 * Aggregate, organisation-wide numbers (docs/plans/estatisticas-dashboards.md).
 * Every route is ungated beyond authentication — like `GET /volunteer-hours/me`,
 * self-scoped-and-public — because nothing here exposes a victim, a clinical
 * record or a report body, only counts and per-volunteer approved hours that
 * are already public per the delegation's own rule (§5 of the design doc).
 */
@ApiTags('Statistics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('statistics')
export class StatisticsController {
  constructor(
    private readonly people: StatisticsPeopleService,
    private readonly activity: StatisticsActivityService,
    private readonly fleet: StatisticsFleetService,
  ) {}

  @Get('people')
  getPeople(@Query() query: StatisticsQueryDto, @CurrentUser() user: { id: string }) {
    return this.people.getStatistics(query, user.id);
  }

  @Get('activity')
  getActivity(@Query() query: StatisticsQueryDto) {
    return this.activity.getStatistics(query);
  }

  @Get('fleet')
  getFleet(@Query() query: StatisticsQueryDto) {
    return this.fleet.getStatistics(query);
  }
}
