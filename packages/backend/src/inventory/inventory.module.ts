import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { MaterialItemsService } from './material-items.service';
import { StockMovementsService } from './stock-movements.service';
import {
  InventoryTemplateController,
  InventoryTemplateItemController,
  VehicleInventoryController,
  LowStockController,
  MaterialItemController,
} from './inventory.controller';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';

@Module({
  providers: [InventoryService, MaterialItemsService, StockMovementsService, AuditInterceptor],
  controllers: [
    InventoryTemplateController,
    InventoryTemplateItemController,
    VehicleInventoryController,
    LowStockController,
    MaterialItemController,
  ],
  // `#204` (event-report consumption lines) calls `applyReportConsumption`/
  // `reverseReportConsumption` from its submit/delete hooks.
  exports: [StockMovementsService],
})
export class InventoryModule {}
