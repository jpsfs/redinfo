import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleType } from '@redinfo/shared';

export class CreateInventoryTemplateDto {
  @ApiPropertyOptional({ enum: VehicleType })
  @IsEnum(VehicleType)
  vehicleType: VehicleType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
