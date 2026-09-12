import { IsDateString, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** `GET /vehicle-occupancy` query — an interval, optionally narrowed to one vehicle. */
export class QueryVehicleOccupancyDto {
  @ApiProperty({ example: '2026-09-01T00:00:00.000Z', description: 'ISO datetime, inclusive.' })
  @IsDateString()
  from: string;

  @ApiProperty({ example: '2026-09-08T00:00:00.000Z', description: 'ISO datetime, exclusive.' })
  @IsDateString()
  to: string;

  @ApiPropertyOptional({ description: 'Narrow the interval to a single vehicle.' })
  @IsOptional()
  @IsString()
  vehicleId?: string;
}
