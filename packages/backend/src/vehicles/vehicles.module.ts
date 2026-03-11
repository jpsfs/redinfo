import { Module } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { VehiclesController, MaintenanceController } from './vehicles.controller';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';

@Module({
  providers: [VehiclesService, AuditInterceptor],
  controllers: [VehiclesController, MaintenanceController],
})
export class VehiclesModule {}
