import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { PaidStaffScheduleModule } from '../paid-staff-schedule/paid-staff-schedule.module';
import { VolunteerHoursModule } from '../volunteer-hours/volunteer-hours.module';
import { StaffAbsencesModule } from '../staff-absences/staff-absences.module';
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
 * neither belongs duplicated here. Imports StaffAbsencesModule so the board
 * can warn on an assignment landing on a day the person is on file as
 * absent (#224) — the same override precedent as `ScheduleConflict`.
 */
@Module({
  imports: [AvailabilityModule, PaidStaffScheduleModule, VolunteerHoursModule, StaffAbsencesModule],
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
