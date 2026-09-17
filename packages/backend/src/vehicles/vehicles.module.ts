import { Module } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { VehiclesController, MaintenanceController } from './vehicles.controller';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { VehicleOccupancyModule } from '../vehicle-occupancy/vehicle-occupancy.module';

@Module({
  imports: [VehicleOccupancyModule],
  providers: [VehiclesService, AuditInterceptor],
  controllers: [VehiclesController, MaintenanceController],
})
export class VehiclesModule {}
