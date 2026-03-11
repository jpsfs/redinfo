import { IsString, IsNotEmpty, IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpsertVehicleInventoryItemDto {
  @ApiProperty({ description: 'Vehicle ID' })
  @IsString()
  @IsNotEmpty()
  vehicleId: string;

  @ApiProperty({ description: 'Template item ID' })
  @IsString()
  @IsNotEmpty()
  templateItemId: string;

  @ApiPropertyOptional({ example: 3, description: 'Actual quantity (null for UNLIMITED items)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  actualQuantity?: number | null;
}

export class UpdateVehicleInventoryItemDto {
  @ApiPropertyOptional({ example: 3, description: 'Actual quantity (null for UNLIMITED items)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  actualQuantity?: number | null;
}
