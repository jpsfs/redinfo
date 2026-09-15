import { Module } from '@nestjs/common';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { FacilitiesModule } from '../facilities/facilities.module';
import { StaffAbsencesModule } from '../staff-absences/staff-absences.module';
import { VehicleOccupancyModule } from '../vehicle-occupancy/vehicle-occupancy.module';
import { LiveRunsModule } from '../live-runs/live-runs.module';
import { TransportConfigModule } from '../transport-config/transport-config.module';
import { TransportRequestsService } from './transport-requests.service';
import { TransportRequestTreatmentPlansService } from './transport-request-treatment-plans.service';
import { TransportRequestLegsService } from './transport-request-legs.service';
import { TransportRequestsController } from './transport-requests.controller';

/**
 * Imports `StaffAbsencesModule` and `VehicleOccupancyModule` for the
 * feasibility endpoint (#229) — not `SchedulesModule`: the roster half of
 * that answer is a plain `Schedule`/`ScheduleAssignment` query, and pulling
 * in `SchedulesService`'s full window/shift reconstruction (plus its own
 * `AvailabilityModule`/`PaidStaffScheduleModule`/`VolunteerHoursModule`
 * imports) for a "who's on this day" list would be a lot of graph for a
 * question this module can answer on its own.
 *
 * `LiveRunsModule` (`DelegationSettingsService`) and `TransportConfigModule`
 * (`OccurrenceTypePoliciesService`) feed `TransportRequestLegsService`'s
 * `effectiveEstimatedEndAt`/`arrivalWindowWarning` computation (#233).
 */
@Module({
  imports: [FacilitiesModule, StaffAbsencesModule, VehicleOccupancyModule, LiveRunsModule, TransportConfigModule],
  providers: [TransportRequestsService, TransportRequestTreatmentPlansService, TransportRequestLegsService, AuditInterceptor],
  controllers: [TransportRequestsController],
  // `TransportRequestLegsService` is also exported for `TripsModule`'s
  // planning board (#235), which needs its unassigned-legs-by-date query.
  exports: [TransportRequestsService, TransportRequestLegsService],
})
export class TransportRequestsModule {}
