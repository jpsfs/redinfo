import { IsInt, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MINUTES_PER_DAY } from '@redinfo/shared';

/**
 * The new hours for one shift of one schedule.
 *
 * No `vehiclesNeeded` — this is a clock-time correction, not a re-crewing.
 * Bounds mirror `ShiftSpecDto`
 * (`availability/dto/create-availability-window.dto.ts`), the same fields
 * validated the same way when a window's grid is first written.
 */
export class AdjustShiftDto {
  @ApiProperty({
    example: 480,
    minimum: 0,
    maximum: MINUTES_PER_DAY - 1,
    description: 'Start, as minutes from midnight (480 = 08:00)',
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
}
