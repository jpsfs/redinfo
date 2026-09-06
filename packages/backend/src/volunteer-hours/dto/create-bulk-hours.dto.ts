import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MANUAL_VOLUNTEER_ACTIVITY_TYPES,
  MAX_BULK_HOURS_ENTRIES,
  MAX_MANUAL_HOURS_DESCRIPTION_LENGTH,
  MAX_MANUAL_HOURS_MINUTES,
  MINUTES_PER_DAY,
  VolunteerActivityType,
} from '@redinfo/shared';

/** One volunteer on a bulk report. Omitted fields fall back to the shared span. */
export class BulkVolunteerHoursEntryDto {
  @ApiProperty()
  @IsString()
  userId: string;

  @ApiPropertyOptional({ example: 1140, description: 'Overrides the shared start time for this person.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MINUTES_PER_DAY - 1)
  startMinute?: number;

  @ApiPropertyOptional({ example: 1200, description: 'Overrides the shared end time for this person.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MINUTES_PER_DAY)
  endMinute?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_MANUAL_HOURS_MINUTES,
    description: 'Overrides the shared duration for this person.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_MANUAL_HOURS_MINUTES)
  minutes?: number;
}

/**
 * `POST /volunteer-hours/bulk` — a coordinator reporting the same activity
 * for several volunteers at once. See `validateBulkVolunteerHours` (shared)
 * for the cross-field rules and `VolunteerHoursService.createBulkEntries` for
 * why every resulting entry lands APPROVED rather than PENDING.
 */
export class CreateBulkVolunteerHoursDto {
  @ApiProperty({ enum: MANUAL_VOLUNTEER_ACTIVITY_TYPES, example: VolunteerActivityType.MEETING })
  @IsEnum(VolunteerActivityType)
  activityType: VolunteerActivityType;

  @ApiProperty({ example: '2026-10-03', description: 'Day the activity happened (YYYY-MM-DD)' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ example: 1140, description: 'The shared start time, used by any entry that omits its own.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MINUTES_PER_DAY - 1)
  startMinute?: number;

  @ApiPropertyOptional({ example: 1200 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MINUTES_PER_DAY)
  endMinute?: number;

  @ApiProperty({ example: 60, minimum: 1, maximum: MAX_MANUAL_HOURS_MINUTES })
  @IsInt()
  @Min(1)
  @Max(MAX_MANUAL_HOURS_MINUTES)
  minutes: number;

  @ApiPropertyOptional({
    example: 'Monthly coordination meeting at the delegation.',
    description: 'Required only when activityType is OTHER.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_MANUAL_HOURS_DESCRIPTION_LENGTH)
  description?: string;

  @ApiProperty({ type: [BulkVolunteerHoursEntryDto] })
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BULK_HOURS_ENTRIES)
  @ValidateNested({ each: true })
  @Type(() => BulkVolunteerHoursEntryDto)
  entries: BulkVolunteerHoursEntryDto[];
}
