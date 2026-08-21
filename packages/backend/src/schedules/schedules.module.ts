import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { SchedulesService } from './schedules.service';
import { ScheduleAssignmentsService } from './schedule-assignments.service';
import { ScheduleAutofillService } from './schedule-autofill.service';
import { SchedulesController } from './schedules.controller';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';

/**
 * Imports AvailabilityModule for `ShiftScheduleService`: which shifts a window
 * has on a given day is that module's answer to give, and re-deriving it here
 * is exactly the drift it was built to prevent.
 */
@Module({
  imports: [AvailabilityModule],
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
