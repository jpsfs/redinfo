import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import {
  InventoryTemplateController,
  InventoryTemplateItemController,
  VehicleInventoryController,
  LowStockController,
} from './inventory.controller';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';

@Module({
  providers: [InventoryService, AuditInterceptor],
  controllers: [
    InventoryTemplateController,
    InventoryTemplateItemController,
    VehicleInventoryController,
    LowStockController,
  ],
})
export class InventoryModule {}
