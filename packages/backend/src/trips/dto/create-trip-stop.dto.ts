import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { TripStopDwell, TripStopKind } from '@redinfo/shared';

/** `POST /trips/:id/stops` — a `WAIT`, `RETURN_TO_BASE` or `DEPART_FROM_BASE`
 * stop, the only three kinds ever added directly; `PICKUP`/`DROPOFF` only
 * ever arrive as a pair, via `AssignTransportLegDto`. `WAIT`/`RETURN_TO_BASE`
 * are appended at the end of the current sequence; `DEPART_FROM_BASE` is
 * prepended before the first — see `TripStopsService.addStop`. Either way,
 * see `PUT /trips/:id/stops/order` for reordering afterwards. */
export class CreateTripStopDto {
  @ApiProperty({ enum: [TripStopKind.WAIT, TripStopKind.RETURN_TO_BASE, TripStopKind.DEPART_FROM_BASE] })
  @IsEnum(TripStopKind)
  kind: TripStopKind.WAIT | TripStopKind.RETURN_TO_BASE | TripStopKind.DEPART_FROM_BASE;

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
