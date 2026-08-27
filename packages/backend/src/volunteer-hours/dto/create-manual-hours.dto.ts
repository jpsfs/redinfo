import { IsDateString, IsEnum, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  MANUAL_VOLUNTEER_ACTIVITY_TYPES,
  MAX_MANUAL_HOURS_DESCRIPTION_LENGTH,
  MAX_MANUAL_HOURS_MINUTES,
  VolunteerActivityType,
} from '@redinfo/shared';

/**
 * Logging hours for something that never had a shift — a meeting, training,
 * or anything else. Always lands `PENDING` and always needs a coordinator,
 * per `validateManualVolunteerHours` (shared): there is no schedule to
 * auto-validate it against.
 */
export class CreateManualVolunteerHoursDto {
  @ApiProperty({ enum: MANUAL_VOLUNTEER_ACTIVITY_TYPES, example: VolunteerActivityType.MEETING })
  @IsEnum(VolunteerActivityType)
  activityType: VolunteerActivityType;

  @ApiProperty({ example: '2026-10-03', description: 'Day the activity happened (YYYY-MM-DD)' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: 90, minimum: 1, maximum: MAX_MANUAL_HOURS_MINUTES })
  @IsInt()
  @Min(1)
  @Max(MAX_MANUAL_HOURS_MINUTES)
  minutes: number;

  @ApiProperty({ example: 'Monthly coordination meeting at the delegation.' })
  @IsString()
  @MaxLength(MAX_MANUAL_HOURS_DESCRIPTION_LENGTH)
  description: string;
}
