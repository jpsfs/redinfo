import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MINUTES_PER_DAY } from '@redinfo/shared';

/** How long a hand-typed override note may be. */
export const MAX_OVERRIDE_NOTES_LENGTH = 500;

/**
 * A one-off exception to the recurring pattern for a single date (#245). Sent
 * to `POST /paid-staff-schedule/:userId/overrides`, which upserts by date —
 * one override per person per date, a correction replaces rather than adds.
 */
export class CreatePaidStaffScheduleOverrideDto {
  @ApiProperty({ example: '2026-10-03' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: false, description: 'True = off entirely this date, ignoring both the pattern and startMinute/endMinute below.' })
  @IsBoolean()
  isOff: boolean;

  @ApiPropertyOptional({ example: 1140, minimum: 0, maximum: MINUTES_PER_DAY - 1, description: 'Required, and only used, when isOff is false.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MINUTES_PER_DAY - 1)
  startMinute?: number;

  @ApiPropertyOptional({ example: MINUTES_PER_DAY, minimum: 1, maximum: MINUTES_PER_DAY })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MINUTES_PER_DAY)
  endMinute?: number;

  @ApiPropertyOptional({ example: 'Trocou o turno da manhã pelo da noite.' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_OVERRIDE_NOTES_LENGTH)
  notes?: string;
}
