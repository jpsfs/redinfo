import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MINUTES_PER_DAY } from '@redinfo/shared';

/**
 * One recurring block of a paid staffer's on-the-clock hours (#245). A
 * contract change is a new block — see `PaidStaffSchedule`'s doc comment —
 * so there is no update endpoint, only create and delete.
 */
export class CreatePaidStaffScheduleBlockDto {
  @ApiProperty({ example: 1, minimum: 0, maximum: 6, description: "Date#getDay() convention: 0 = Sunday" })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiProperty({ example: 480, minimum: 0, maximum: MINUTES_PER_DAY - 1 })
  @IsInt()
  @Min(0)
  @Max(MINUTES_PER_DAY - 1)
  startMinute: number;

  @ApiProperty({ example: 960, minimum: 1, maximum: MINUTES_PER_DAY })
  @IsInt()
  @Min(1)
  @Max(MINUTES_PER_DAY)
  endMinute: number;

  @ApiProperty({ example: '2026-01-01', description: 'ISO date this block takes effect from' })
  @IsDateString()
  effectiveFrom: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'ISO date, inclusive. Omitted = still in effect.' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}
