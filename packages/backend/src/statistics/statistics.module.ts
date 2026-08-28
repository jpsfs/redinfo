import { Module } from '@nestjs/common';
import { VolunteerHoursModule } from '../volunteer-hours/volunteer-hours.module';
import { StatisticsController } from './statistics.controller';
import { StatisticsPeopleService } from './statistics-people.service';
import { StatisticsActivityService } from './statistics-activity.service';
import { StatisticsFleetService } from './statistics-fleet.service';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';

/** Imports VolunteerHoursModule for `VolunteerHoursService.refreshGeneration()` — tab 1's hours must be as fresh as `/volunteer-hours/summary`'s. */
@Module({
  imports: [VolunteerHoursModule],
  providers: [StatisticsPeopleService, StatisticsActivityService, StatisticsFleetService, AuditInterceptor],
  controllers: [StatisticsController],
})
export class StatisticsModule {}
