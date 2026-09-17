import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { MAX_OVERRIDE_REASON_LENGTH } from '@redinfo/shared';

/**
 * `POST /trips/:id/legs` — creates or **moves** the leg's `PICKUP`+`DROPOFF`
 * pair onto this trip in one call. Re-assigning an already-assigned leg to a
 * different trip is this same call, not a delete-and-recreate (#219).
 *
 * `vehicleOverrideReason` only matters when the resulting stop window
 * overlaps another commitment for this trip's vehicle — see
 * `VehicleOccupancyService.rebookForSource`.
 */
export class AssignTransportLegDto {
  @ApiProperty()
  @IsString()
  transportLegId: string;

  @ApiProperty({ description: 'ISO datetime' })
  @IsISO8601()
  pickupPlannedAt: string;

  @ApiProperty({ description: 'ISO datetime' })
  @IsISO8601()
  dropoffPlannedAt: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_OVERRIDE_REASON_LENGTH)
  vehicleOverrideReason?: string | null;
}
