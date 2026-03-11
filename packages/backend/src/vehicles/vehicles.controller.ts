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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { CreateMaintenanceEntryDto } from './dto/create-maintenance-entry.dto';
import { UpdateMaintenanceEntryDto } from './dto/update-maintenance-entry.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Actions } from '../auth/decorators/roles.decorator';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { Action, VehicleType } from '@redinfo/shared';

@ApiTags('Vehicles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  @Actions(Action.VIEW_VEHICLES)
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'perPage', required: false, type: Number })
  @ApiQuery({ name: 'vehicleType', required: false, enum: VehicleType })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(25), ParseIntPipe) perPage: number,
    @Query('vehicleType') vehicleType?: VehicleType,
  ) {
    return this.vehiclesService.findAll(page, perPage, vehicleType);
  }

  @Get('upcoming')
  @Actions(Action.VIEW_VEHICLES)
  @ApiQuery({ name: 'days', required: false, type: Number })
  findUpcoming(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number) {
    return this.vehiclesService.findUpcoming(days);
  }

  @Get(':id')
  @Actions(Action.VIEW_VEHICLES)
  findOne(@Param('id') id: string) {
    return this.vehiclesService.findOne(id);
  }

  @Post()
  @Actions(Action.MANAGE_VEHICLES)
  create(@Body() dto: CreateVehicleDto) {
    return this.vehiclesService.create(dto);
  }

  @Patch(':id')
  @Actions(Action.MANAGE_VEHICLES)
  update(@Param('id') id: string, @Body() dto: UpdateVehicleDto) {
    return this.vehiclesService.update(id, dto);
  }

  @Delete(':id')
  @Actions(Action.MANAGE_VEHICLES)
  remove(@Param('id') id: string) {
    return this.vehiclesService.remove(id);
  }
}

@ApiTags('Maintenance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  @Actions(Action.VIEW_VEHICLES)
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'perPage', required: false, type: Number })
  @ApiQuery({ name: 'vehicleId', required: false, type: String })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(25), ParseIntPipe) perPage: number,
    @Query('vehicleId') vehicleId?: string,
  ) {
    return this.vehiclesService.findAllEntries(page, perPage, vehicleId);
  }

  @Get(':id')
  @Actions(Action.VIEW_VEHICLES)
  findOne(@Param('id') id: string) {
    return this.vehiclesService.findOneEntry(id);
  }

  @Post()
  @Actions(Action.MANAGE_VEHICLES)
  create(@Body() dto: CreateMaintenanceEntryDto) {
    return this.vehiclesService.createEntry(dto);
  }

  @Patch(':id')
  @Actions(Action.MANAGE_VEHICLES)
  update(@Param('id') id: string, @Body() dto: UpdateMaintenanceEntryDto) {
    return this.vehiclesService.updateEntry(id, dto);
  }

  @Delete(':id')
  @Actions(Action.MANAGE_VEHICLES)
  remove(@Param('id') id: string) {
    return this.vehiclesService.removeEntry(id);
  }
}
