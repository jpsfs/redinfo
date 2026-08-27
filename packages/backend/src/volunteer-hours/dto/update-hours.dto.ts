import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MANUAL_VOLUNTEER_ACTIVITY_TYPES,
  MAX_MANUAL_HOURS_DESCRIPTION_LENGTH,
  MAX_MANUAL_HOURS_MINUTES,
  VolunteerActivityType,
} from '@redinfo/shared';

/**
 * `PATCH /volunteer-hours/:id` — the owner correcting their own entry while
 * it is still PENDING. `activityType`/`date` are accepted but only take
 * effect for a MANUAL entry; see `VolunteerHoursService.updateMine`.
 */
export class UpdateVolunteerHoursDto {
  @ApiPropertyOptional({ enum: MANUAL_VOLUNTEER_ACTIVITY_TYPES, example: VolunteerActivityType.MEETING })
  @IsOptional()
  @IsEnum(VolunteerActivityType)
  activityType?: VolunteerActivityType;

  @ApiPropertyOptional({ example: '2026-10-03', description: 'Day the activity happened (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiProperty({ example: 90, minimum: 1, maximum: MAX_MANUAL_HOURS_MINUTES })
  @IsInt()
  @Min(1)
  @Max(MAX_MANUAL_HOURS_MINUTES)
  minutes: number;

  @ApiPropertyOptional({ example: 'Monthly coordination meeting at the delegation.' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_MANUAL_HOURS_DESCRIPTION_LENGTH)
  description?: string;
}
