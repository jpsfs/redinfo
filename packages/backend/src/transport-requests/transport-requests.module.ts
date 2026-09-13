import { Module } from '@nestjs/common';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { FacilitiesModule } from '../facilities/facilities.module';
import { StaffAbsencesModule } from '../staff-absences/staff-absences.module';
import { VehicleOccupancyModule } from '../vehicle-occupancy/vehicle-occupancy.module';
import { TransportRequestsService } from './transport-requests.service';
import { TransportRequestsController } from './transport-requests.controller';

/**
 * Imports `StaffAbsencesModule` and `VehicleOccupancyModule` for the
 * feasibility endpoint (#229) — not `SchedulesModule`: the roster half of
 * that answer is a plain `Schedule`/`ScheduleAssignment` query, and pulling
 * in `SchedulesService`'s full window/shift reconstruction (plus its own
 * `AvailabilityModule`/`PaidStaffScheduleModule`/`VolunteerHoursModule`
 * imports) for a "who's on this day" list would be a lot of graph for a
 * question this module can answer on its own.
 */
@Module({
  imports: [FacilitiesModule, StaffAbsencesModule, VehicleOccupancyModule],
  providers: [TransportRequestsService, AuditInterceptor],
  controllers: [TransportRequestsController],
  exports: [TransportRequestsService],
})
export class TransportRequestsModule {}
