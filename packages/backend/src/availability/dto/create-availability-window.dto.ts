import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
  AvailabilityWindowCategory,
  DEFAULT_VEHICLES_NEEDED,
  DRIVER_ROLE_NAME,
  MAX_ROLE_NAME_LENGTH,
  MAX_ROLE_PEOPLE,
  MAX_ROLES_PER_WINDOW,
  MAX_SHIFTS_PER_DAY,
  MAX_VEHICLES_PER_SHIFT,
  MAX_WINDOW_NAME_LENGTH,
  MINUTES_PER_DAY,
  UNLIMITED_ROLE_PEOPLE,
} from '@redinfo/shared';

/** One shift: when it runs, and how many vehicles it needs crewed. */
export class ShiftSpecDto {
  @ApiProperty({
    example: 510,
    minimum: 0,
    maximum: MINUTES_PER_DAY - 1,
    description: 'Start, as minutes from midnight (510 = 08:30)',
  })
  @IsInt()
  @Min(0)
  @Max(MINUTES_PER_DAY - 1)
  startMinute: number;

  @ApiProperty({
    example: 960,
    minimum: 1,
    maximum: MINUTES_PER_DAY,
    description: 'End, as minutes from midnight (1440 = midnight)',
  })
  @IsInt()
  @Min(1)
  @Max(MINUTES_PER_DAY)
  endMinute: number;

  @ApiPropertyOptional({
    example: DEFAULT_VEHICLES_NEEDED,
    minimum: 0,
    maximum: MAX_VEHICLES_PER_SHIFT,
    description:
      'Vehicles to be crewed on this shift; each one needs its own driver, ' +
      `which is what the coverage colours are judged against. 0 means people ` +
      `only. Defaults to ${DEFAULT_VEHICLES_NEEDED}.`,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_VEHICLES_PER_SHIFT)
  vehiclesNeeded?: number;
}

/**
 * One role the window's schedule will be built from.
 *
 * `requiresDriverCertification` is deliberately not an input: it is derived from
 * the name, because "Driver" always requires the certification.
 */
export class WindowRoleDto {
  @ApiProperty({
    example: DRIVER_ROLE_NAME,
    maxLength: MAX_ROLE_NAME_LENGTH,
    description:
      'Role name, unique within the window (case-insensitively). A role named ' +
      `"${DRIVER_ROLE_NAME}" always requires the driver certification.`,
  })
  @IsString()
  @MaxLength(MAX_ROLE_NAME_LENGTH)
  name: string;

  @ApiProperty({
    example: 1,
    minimum: 0,
    maximum: MAX_ROLE_PEOPLE,
    description:
      'Most people the schedule may put in this role on one shift. ' +
      `${UNLIMITED_ROLE_PEOPLE} means unlimited.`,
  })
  @IsInt()
  @Min(0)
  @Max(MAX_ROLE_PEOPLE)
  maxPeople: number;
}

export class AvailabilityWindowDayDto {
  @ApiProperty({ example: '2026-10-03', description: 'Day being defined (YYYY-MM-DD)' })
  @IsDateString()
  date: string;

  @ApiProperty({
    type: [ShiftSpecDto],
    description:
      'Shifts for that day, in any order. May be empty to leave the day with ' +
      'no shifts at all. Shifts must not overlap.',
  })
  @IsArray()
  @ArrayMaxSize(MAX_SHIFTS_PER_DAY)
  @ValidateNested({ each: true })
  @Type(() => ShiftSpecDto)
  shifts: ShiftSpecDto[];
}

export class CreateAvailabilityWindowDto {
  @ApiProperty({ example: '2026-09-28', description: 'First day of the window (YYYY-MM-DD)' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-10-05', description: 'Last day of the window, inclusive (YYYY-MM-DD)' })
  @IsDateString()
  endDate: string;

  @ApiProperty({
    enum: AvailabilityWindowCategory,
    example: AvailabilityWindowCategory.EMERGENCY,
    description:
      'Which rota this window collects availability for. Windows of different ' +
      'categories may cover the same dates; two open ones of the same category ' +
      'may not.',
  })
  @IsEnum(AvailabilityWindowCategory)
  category: AvailabilityWindowCategory;

  @ApiPropertyOptional({
    example: 'Emergency - October',
    maxLength: MAX_WINDOW_NAME_LENGTH,
    description: 'Free-text title. Need not be unique; blank is stored as none.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_WINDOW_NAME_LENGTH)
  name?: string;

  @ApiPropertyOptional({
    type: [WindowRoleDto],
    description:
      'Roles the schedule for this window will be built from, in the order ' +
      'given. Omit to take the category defaults (Driver, Team Leader and Team ' +
      'Member, one person each, for Emergency; none for other categories); ' +
      'send an empty list for a window with no roles.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ROLES_PER_WINDOW)
  @ValidateNested({ each: true })
  @Type(() => WindowRoleDto)
  roles?: WindowRoleDto[];

  @ApiPropertyOptional({
    description:
      'Confirms the warning that a closed window of this category already ' +
      'covers these dates. Never overrides an open one.',
  })
  @IsOptional()
  @IsBoolean()
  acknowledgeOverlap?: boolean;

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

/**
 * A whole calendar month on the default grid — the "emergency" shortcut. The
 * window is always EMERGENCY, named after the month, so neither is an input.
 */
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

  @ApiPropertyOptional({
    description:
      'Confirms the warning that a closed Emergency window already covers this month.',
  })
  @IsOptional()
  @IsBoolean()
  acknowledgeOverlap?: boolean;
}
