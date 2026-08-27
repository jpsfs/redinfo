import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { VolunteerHoursService } from './volunteer-hours.service';
import { VolunteerHoursSummaryService } from './volunteer-hours-summary.service';
import { VolunteerHoursController } from './volunteer-hours.controller';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';

/**
 * Imports AvailabilityModule for `ShiftScheduleService`, the same reason
 * `SchedulesModule` does — a shift's clock times are that module's answer to
 * give.
 */
@Module({
  imports: [AvailabilityModule],
  providers: [VolunteerHoursService, VolunteerHoursSummaryService, AuditInterceptor],
  controllers: [VolunteerHoursController],
  exports: [VolunteerHoursService],
})
export class VolunteerHoursModule {}
