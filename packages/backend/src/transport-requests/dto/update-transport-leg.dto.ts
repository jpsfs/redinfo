import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsLatitude, IsLongitude, IsOptional, IsString, MaxLength } from 'class-validator';
import { EstimatedEndSource, MAX_LEG_ADDRESS_LENGTH } from '@redinfo/shared';

/**
 * The editable slice of a leg (#230) — address/facility/time detail and,
 * per a reschedule, `date` itself. Cancelling and marking no-show go
 * through their own dedicated actions instead — see
 * `CancelTransportLegDto`/`TransportLegsController`'s `no-show` route.
 */
export class UpdateTransportLegDto {
  @ApiPropertyOptional({ description: 'ISO date — rescheduling the leg' })
  @IsOptional()
  @IsISO8601()
  date?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LEG_ADDRESS_LENGTH)
  originAddress?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsLatitude()
  originLatitude?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsLongitude()
  originLongitude?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  originFacilityId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LEG_ADDRESS_LENGTH)
  destinationAddress?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsLatitude()
  destinationLatitude?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsLongitude()
  destinationLongitude?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  destinationFacilityId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'ISO datetime' })
  @IsOptional()
  @IsISO8601()
  plannedPickupAt?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'ISO datetime' })
  @IsOptional()
  @IsISO8601()
  plannedDropoffAt?: string | null;

  /**
   * When the facility said, or the coordinator judged, the occurrence will
   * end (#233) — always given together with `estimatedEndSource`, or not at
   * all; see `validateUpdateTransportLeg`.
   */
  @ApiPropertyOptional({ nullable: true, description: 'ISO datetime' })
  @IsOptional()
  @IsISO8601()
  estimatedEndAt?: string | null;

  @ApiPropertyOptional({ enum: EstimatedEndSource, nullable: true })
  @IsOptional()
  @IsEnum(EstimatedEndSource)
  estimatedEndSource?: EstimatedEndSource | null;
}
