import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { VehicleOccupancyService } from './vehicle-occupancy.service';
import { QueryVehicleOccupancyDto } from './dto/query-vehicle-occupancy.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Actions } from '../auth/decorators/roles.decorator';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { Action } from '@redinfo/shared';

@ApiTags('Vehicle occupancy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('vehicle-occupancy')
export class VehicleOccupancyController {
  constructor(private readonly vehicleOccupancyService: VehicleOccupancyService) {}

  @Get()
  @Actions(Action.VIEW_VEHICLES)
  findInRange(@Query() query: QueryVehicleOccupancyDto) {
    return this.vehicleOccupancyService.findInRange(
      new Date(query.from),
      new Date(query.to),
      query.vehicleId,
    );
  }
}
