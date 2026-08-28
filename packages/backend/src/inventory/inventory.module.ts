import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { MaterialItemsService } from './material-items.service';
import {
  InventoryTemplateController,
  InventoryTemplateItemController,
  VehicleInventoryController,
  LowStockController,
  MaterialItemController,
} from './inventory.controller';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';

@Module({
  providers: [InventoryService, MaterialItemsService, AuditInterceptor],
  controllers: [
    InventoryTemplateController,
    InventoryTemplateItemController,
    VehicleInventoryController,
    LowStockController,
    MaterialItemController,
  ],
})
export class InventoryModule {}
