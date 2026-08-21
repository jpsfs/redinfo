import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MAX_SHIFTS_PER_DAY } from '@redinfo/shared';

export class ShiftTimesDto {
  @ApiProperty({ example: 8, minimum: 0, maximum: 23, description: 'Start hour (0–23)' })
  @IsInt()
  @Min(0)
  @Max(23)
  startHour: number;

  @ApiProperty({
    example: 16,
    minimum: 1,
    maximum: 24,
    description: 'End hour (1–24; 24 means midnight)',
  })
  @IsInt()
  @Min(1)
  @Max(24)
  endHour: number;
}

export class AvailabilityWindowDayDto {
  @ApiProperty({ example: '2026-10-03', description: 'Day being defined (YYYY-MM-DD)' })
  @IsDateString()
  date: string;

  @ApiProperty({
    type: [ShiftTimesDto],
    description:
      'Shifts for that day, in any order. May be empty to leave the day with ' +
      'no shifts at all. Shifts must not overlap.',
  })
  @IsArray()
  @ArrayMaxSize(MAX_SHIFTS_PER_DAY)
  @ValidateNested({ each: true })
  @Type(() => ShiftTimesDto)
  shifts: ShiftTimesDto[];
}

export class CreateAvailabilityWindowDto {
  @ApiProperty({ example: '2026-09-28', description: 'First day of the window (YYYY-MM-DD)' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-10-05', description: 'Last day of the window, inclusive (YYYY-MM-DD)' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({
    type: [AvailabilityWindowDayDto],
    description:
      'Per-day shifts. When present it must cover every day of the range ' +
      'exactly once; omit it to use the default grid (one 20:00–24:00 shift on ' +
      'workdays, 08:00–16:00 and 16:00–24:00 on weekends and holidays).',
  })
  @IsOptional()
  @IsArray()
  // A window is capped at MAX_WINDOW_DAYS days; this only stops an absurd payload.
  @ArrayMaxSize(400)
  @ValidateNested({ each: true })
  @Type(() => AvailabilityWindowDayDto)
  days?: AvailabilityWindowDayDto[];
}

/** A whole calendar month on the default grid — the "emergency" shortcut. */
export class CreateMonthlyAvailabilityWindowDto {
  @ApiProperty({ example: 2026, minimum: 2020, maximum: 2100 })
  @IsInt()
  @Min(2020)
  @Max(2100)
  year: number;

  @ApiProperty({ example: 10, minimum: 1, maximum: 12, description: 'Calendar month, 1–12' })
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;
}
