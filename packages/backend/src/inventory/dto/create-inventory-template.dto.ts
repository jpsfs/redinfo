import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleType } from '@redinfo/shared';

export class CreateInventoryTemplateDto {
  @ApiProperty({ enum: VehicleType })
  @IsEnum(VehicleType)
  vehicleType: VehicleType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
