import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsInt, IsOptional, Min } from 'class-validator';
import { TripStopDwell } from '@redinfo/shared';

/** `PATCH /trips/:id/stops/:stopId` — planned/actual times and the dwell
 * decision. Sequence is never touched here; see `PUT /trips/:id/stops/order`. */
export class UpdateTripStopDto {
  @ApiPropertyOptional({ description: 'ISO datetime' })
  @IsOptional()
  @IsISO8601()
  plannedAt?: string;

  @ApiPropertyOptional({ nullable: true, description: 'ISO datetime' })
  @IsOptional()
  @IsISO8601()
  actualAt?: string | null;

  @ApiPropertyOptional({ enum: TripStopDwell, nullable: true })
  @IsOptional()
  @IsEnum(TripStopDwell)
  dwellDecision?: TripStopDwell | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  dwellMinutes?: number | null;
}
