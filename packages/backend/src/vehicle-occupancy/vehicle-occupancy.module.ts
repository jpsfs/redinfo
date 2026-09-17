import { Module } from '@nestjs/common';
import { VehicleOccupancyService } from './vehicle-occupancy.service';
import { VehicleOccupancyController } from './vehicle-occupancy.controller';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';

/**
 * Shared vehicle occupancy (#222) — forward commitment of a named vehicle,
 * whatever the source. Deliberately outside `transports`: the fleet is one
 * pool, so `schedules`, a future transports module, and `vehicles` (via
 * `MaintenanceEntry` write-through) all depend on this module, not the other
 * way around.
 */
@Module({
  providers: [VehicleOccupancyService, AuditInterceptor],
  controllers: [VehicleOccupancyController],
  exports: [VehicleOccupancyService],
})
export class VehicleOccupancyModule {}
