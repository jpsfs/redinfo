import { Module } from '@nestjs/common';
import { VolunteerHoursModule } from '../volunteer-hours/volunteer-hours.module';
import { InemModule } from '../inem/inem.module';
import { StatisticsController } from './statistics.controller';
import { StatisticsPeopleService } from './statistics-people.service';
import { StatisticsActivityService } from './statistics-activity.service';
import { StatisticsFleetService } from './statistics-fleet.service';
import { StatisticsInemService } from './statistics-inem.service';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';

/**
 * Imports VolunteerHoursModule for `VolunteerHoursService.refreshGeneration()`
 * — tab 1's hours must be as fresh as `/volunteer-hours/summary`'s — and
 * InemModule so tab 4 can resolve an `inopCode` to its display label via
 * `InemService.getInopReasonLabels()`, the same source `GET /inem/status`
 * reads its own labels from.
 */
@Module({
  imports: [VolunteerHoursModule, InemModule],
  providers: [StatisticsPeopleService, StatisticsActivityService, StatisticsFleetService, StatisticsInemService, AuditInterceptor],
  controllers: [StatisticsController],
})
export class StatisticsModule {}
