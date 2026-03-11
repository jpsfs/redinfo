import {
  IsString,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateMaintenanceEntryDto {
  @ApiProperty({ description: 'Vehicle ID this entry belongs to' })
  @IsString()
  @IsNotEmpty()
  vehicleId: string;

  @ApiProperty({ example: '2025-03-01', description: 'Date of maintenance (YYYY-MM-DD)' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: 'Oil change and filter replacement' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 'Auto Service Lda' })
  @IsString()
  @IsNotEmpty()
  serviceProvider: string;

  @ApiProperty({ example: 250.0, description: 'Total cost (EUR)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cost: number;

  @ApiPropertyOptional({ example: 57.5, description: 'VAT amount if available (EUR)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  vatAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
