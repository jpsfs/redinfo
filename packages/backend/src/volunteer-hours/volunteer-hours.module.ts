import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { PaidStaffScheduleModule } from '../paid-staff-schedule/paid-staff-schedule.module';
import { VolunteerHoursService } from './volunteer-hours.service';
import { VolunteerHoursSummaryService } from './volunteer-hours-summary.service';
import { VolunteerHoursController } from './volunteer-hours.controller';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';

/**
 * Imports AvailabilityModule for `ShiftScheduleService`, the same reason
 * `SchedulesModule` does — a shift's clock times are that module's answer to
 * give. Imports PaidStaffScheduleModule (#245) for the same reason: whether
 * a paid-staff assignment was on the clock is that module's answer, not
 * something to duplicate here.
 */
@Module({
  imports: [AvailabilityModule, PaidStaffScheduleModule],
  providers: [VolunteerHoursService, VolunteerHoursSummaryService, AuditInterceptor],
  controllers: [VolunteerHoursController],
  exports: [VolunteerHoursService, VolunteerHoursSummaryService],
})
export class VolunteerHoursModule {}
