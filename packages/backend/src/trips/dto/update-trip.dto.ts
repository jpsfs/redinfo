import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { MAX_TRIP_NOTES_LENGTH, TripStatus } from '@redinfo/shared';

/** Notes and status only — the vehicle and date are fixed once stops start
 * being planned against them; re-planning onto a different vehicle is a new
 * trip, not an edit. */
export class UpdateTripDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TRIP_NOTES_LENGTH)
  notes?: string | null;

  @ApiPropertyOptional({ enum: TripStatus })
  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;
}
