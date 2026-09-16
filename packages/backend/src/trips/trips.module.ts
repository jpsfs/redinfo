import { Module } from '@nestjs/common';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { LiveRunsModule } from '../live-runs/live-runs.module';
import { StaffAbsencesModule } from '../staff-absences/staff-absences.module';
import { VehicleOccupancyModule } from '../vehicle-occupancy/vehicle-occupancy.module';
import { TransportConfigModule } from '../transport-config/transport-config.module';
import { RoutingModule } from '../routing/routing.module';
import { TransportRequestsModule } from '../transport-requests/transport-requests.module';
import { PatientsModule } from '../patients/patients.module';
import { TripsService } from './trips.service';
import { TripCrewService } from './trip-crew.service';
import { TripStopsService } from './trip-stops.service';
import { TripBreakEvenService } from './trip-break-even.service';
import { TripCrewManifestService } from './trip-crew-manifest.service';
import { TripLegTravelService } from './trip-leg-travel.service';
import { TripsController } from './trips.controller';

/**
 * The model and API behind the planning board (#234) — the board itself is
 * #235. `LiveRunsModule` for `DelegationSettingsService` (arrival window
 * thresholds, the base for `RETURN_TO_BASE`/break-even), `StaffAbsencesModule`
 * for crew-availability checks, `VehicleOccupancyModule` for the trip's own
 * occupancy interval, `TransportConfigModule` for the occurrence-type
 * duration floors the break-even helper resolves a leg's estimated end
 * against, `RoutingModule` for that same helper's travel-to-base call.
 * `TransportRequestsModule` (`TransportRequestLegsService`) and
 * `PatientsModule` feed `getBoard` (#235) — the planning board's leg cards,
 * assigned and unassigned alike. `RoutingModule` serves `TripLegTravelService`
 * on that same path, for the pickup and home-arrival times the board suggests.
 */
@Module({
  imports: [
    LiveRunsModule,
    StaffAbsencesModule,
    VehicleOccupancyModule,
    TransportConfigModule,
    RoutingModule,
    TransportRequestsModule,
    PatientsModule,
  ],
  providers: [
    TripsService,
    TripCrewService,
    TripStopsService,
    TripBreakEvenService,
    TripCrewManifestService,
    TripLegTravelService,
    AuditInterceptor,
  ],
  controllers: [TripsController],
})
export class TripsModule {}
