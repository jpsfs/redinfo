import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { PaidStaffScheduleModule } from '../paid-staff-schedule/paid-staff-schedule.module';
import { VolunteerHoursModule } from '../volunteer-hours/volunteer-hours.module';
import { SchedulesService } from './schedules.service';
import { ScheduleAssignmentsService } from './schedule-assignments.service';
import { ScheduleAutofillService } from './schedule-autofill.service';
import { SchedulesController } from './schedules.controller';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';

/**
 * Imports AvailabilityModule for `ShiftScheduleService`: which shifts a window
 * has on a given day is that module's answer to give, and re-deriving it here
 * is exactly the drift it was built to prevent. Imports PaidStaffScheduleModule
 * (whether an assignee is on their contract's clock) and VolunteerHoursModule
 * (keeping a generated entry in step with a reclassification) for the same
 * reason — `ScheduleAssignmentsService.setCompensation` needs both, and
 * neither belongs duplicated here.
 */
@Module({
  imports: [AvailabilityModule, PaidStaffScheduleModule, VolunteerHoursModule],
  providers: [
    SchedulesService,
    ScheduleAssignmentsService,
    ScheduleAutofillService,
    AuditInterceptor,
  ],
  controllers: [SchedulesController],
  exports: [SchedulesService],
})
export class SchedulesModule {}
