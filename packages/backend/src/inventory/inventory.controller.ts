import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  ParseIntPipe,
  DefaultValuePipe,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery, ApiBody } from '@nestjs/swagger';
import { Response } from 'express';
import { InventoryService } from './inventory.service';
import { CreateInventoryTemplateDto } from './dto/create-inventory-template.dto';
import { UpdateInventoryTemplateDto } from './dto/update-inventory-template.dto';
import { CreateInventoryTemplateItemDto } from './dto/create-inventory-template-item.dto';
import { UpdateInventoryTemplateItemDto } from './dto/update-inventory-template-item.dto';
import {
  UpsertVehicleInventoryItemDto,
  UpdateVehicleInventoryItemDto,
} from './dto/vehicle-inventory-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Actions } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { Action, VehicleType } from '@redinfo/shared';

// ─── Inventory Templates ──────────────────────────────────────────────────────

@ApiTags('Inventory Templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('inventory-templates')
export class InventoryTemplateController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @Actions(Action.VIEW_VEHICLES)
  @ApiQuery({ name: 'vehicleType', required: false, enum: VehicleType })
  findAll(@Query('vehicleType') vehicleType?: VehicleType) {
    return this.inventoryService.findAllTemplates(vehicleType);
  }

  @Get(':id')
  @Actions(Action.VIEW_VEHICLES)
  findOne(@Param('id') id: string) {
    return this.inventoryService.findOneTemplate(id);
  }

  @Get(':id/csv')
  @Actions(Action.VIEW_VEHICLES)
  async exportCsv(@Param('id') id: string, @Res() res: Response) {
    const csv = await this.inventoryService.exportTemplateCsv(id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="template-${id}.csv"`);
    res.send(csv);
  }

  @Post(':id/csv')
  @Actions(Action.MANAGE_VEHICLES)
  @ApiBody({ schema: { type: 'object', properties: { csv: { type: 'string' } } } })
  importCsv(@Param('id') id: string, @Body('csv') csvContent: string) {
    return this.inventoryService.importTemplateCsv(id, csvContent);
  }

  @Post()
  @Actions(Action.MANAGE_VEHICLES)
  create(@Body() dto: CreateInventoryTemplateDto) {
    return this.inventoryService.createTemplate(dto);
  }

  @Patch(':id')
  @Actions(Action.MANAGE_VEHICLES)
  update(@Param('id') id: string, @Body() dto: UpdateInventoryTemplateDto) {
    return this.inventoryService.updateTemplate(id, dto);
  }

  @Delete(':id')
  @Actions(Action.MANAGE_VEHICLES)
  remove(@Param('id') id: string) {
    return this.inventoryService.removeTemplate(id);
  }
}

// ─── Inventory Template Items ─────────────────────────────────────────────────

@ApiTags('Inventory Template Items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('inventory-template-items')
export class InventoryTemplateItemController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @Actions(Action.VIEW_VEHICLES)
  @ApiQuery({ name: 'templateId', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'perPage', required: false, type: Number })
  findAll(
    @Query('templateId') templateId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('perPage', new DefaultValuePipe(100), ParseIntPipe) perPage?: number,
  ) {
    return this.inventoryService.findAllTemplateItems(templateId, page, perPage);
  }

  @Get(':id')
  @Actions(Action.VIEW_VEHICLES)
  findOne(@Param('id') id: string) {
    return this.inventoryService.findOneTemplateItem(id);
  }

  @Post()
  @Actions(Action.MANAGE_VEHICLES)
  create(@Body() dto: CreateInventoryTemplateItemDto) {
    return this.inventoryService.createTemplateItem(dto);
  }

  @Patch(':id')
  @Actions(Action.MANAGE_VEHICLES)
  update(@Param('id') id: string, @Body() dto: UpdateInventoryTemplateItemDto) {
    return this.inventoryService.updateTemplateItem(id, dto);
  }

  @Delete(':id')
  @Actions(Action.MANAGE_VEHICLES)
  remove(@Param('id') id: string) {
    return this.inventoryService.removeTemplateItem(id);
  }
}

// ─── Vehicle Inventory ────────────────────────────────────────────────────────

@ApiTags('Vehicle Inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('vehicle-inventory')
export class VehicleInventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @Actions(Action.VIEW_VEHICLES)
  @ApiQuery({ name: 'vehicleId', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'perPage', required: false, type: Number })
  findAll(
    @Query('vehicleId') vehicleId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('perPage', new DefaultValuePipe(100), ParseIntPipe) perPage?: number,
  ) {
    return this.inventoryService.findAllVehicleInventoryItems(vehicleId, page, perPage);
  }

  @Get('by-vehicle/:vehicleId')
  @Actions(Action.VIEW_VEHICLES)
  getVehicleInventory(@Param('vehicleId') vehicleId: string) {
    return this.inventoryService.getVehicleInventory(vehicleId);
  }

  @Get('by-vehicle/:vehicleId/csv')
  @Actions(Action.VIEW_VEHICLES)
  async exportCsv(@Param('vehicleId') vehicleId: string, @Res() res: Response) {
    const csv = await this.inventoryService.exportVehicleInventoryCsv(vehicleId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="inventory-${vehicleId}.csv"`);
    res.send(csv);
  }

  @Post('by-vehicle/:vehicleId/csv')
  @Actions(Action.MANAGE_VEHICLE_INVENTORY)
  @ApiBody({ schema: { type: 'object', properties: { csv: { type: 'string' } } } })
  importCsv(
    @Param('vehicleId') vehicleId: string,
    @Body('csv') csvContent: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.inventoryService.importVehicleInventoryCsv(vehicleId, csvContent, user?.id);
  }

  @Get(':id')
  @Actions(Action.VIEW_VEHICLES)
  findOne(@Param('id') id: string) {
    return this.inventoryService.findOneVehicleInventoryItem(id);
  }

  @Post()
  @Actions(Action.MANAGE_VEHICLE_INVENTORY)
  upsert(@Body() dto: UpsertVehicleInventoryItemDto, @CurrentUser() user: { id: string }) {
    return this.inventoryService.upsertVehicleInventoryItem(dto, user?.id);
  }

  @Patch(':id')
  @Actions(Action.MANAGE_VEHICLE_INVENTORY)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleInventoryItemDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.inventoryService.updateVehicleInventoryItem(id, dto, user?.id);
  }

  @Delete(':id')
  @Actions(Action.MANAGE_VEHICLES)
  remove(@Param('id') id: string) {
    return this.inventoryService.removeVehicleInventoryItem(id);
  }
}

// ─── Low Stock ────────────────────────────────────────────────────────────────

@ApiTags('Vehicle Inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('vehicles/low-stock')
export class LowStockController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @Actions(Action.VIEW_VEHICLES)
  @ApiQuery({ name: 'vehicleType', required: false, enum: VehicleType })
  findLowStock(@Query('vehicleType') vehicleType?: VehicleType) {
    return this.inventoryService.findLowStockVehicles(vehicleType);
  }
}
