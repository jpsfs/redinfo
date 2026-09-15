import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { TripStopDwell, TripStopKind } from '@redinfo/shared';

/** `POST /trips/:id/stops` — a `WAIT` or `RETURN_TO_BASE` stop, the only two
 * kinds ever added directly; `PICKUP`/`DROPOFF` only ever arrive as a pair,
 * via `AssignTransportLegDto`. Always appended at the end of the current
 * sequence — see `PUT /trips/:id/stops/order` for reordering. */
export class CreateTripStopDto {
  @ApiProperty({ enum: [TripStopKind.WAIT, TripStopKind.RETURN_TO_BASE] })
  @IsEnum(TripStopKind)
  kind: TripStopKind.WAIT | TripStopKind.RETURN_TO_BASE;

  @ApiProperty({ description: 'ISO datetime' })
  @IsISO8601()
  plannedAt: string;

  @ApiPropertyOptional({ description: 'Required for WAIT — the facility being waited at.' })
  @IsOptional()
  @IsString()
  facilityId?: string;

  @ApiPropertyOptional({ enum: TripStopDwell })
  @IsOptional()
  @IsEnum(TripStopDwell)
  dwellDecision?: TripStopDwell;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  dwellMinutes?: number;
}
