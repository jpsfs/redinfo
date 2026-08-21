import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MAX_SHIFTS_PER_DAY } from '@redinfo/shared';

/**
 * Putting one person on one shift.
 *
 * There is deliberately no `isOverride` field: whether an assignment
 * contradicts submitted availability is the server's finding, not the caller's
 * claim, so it is computed from the submission table and stamped here.
 */
export class CreateScheduleAssignmentDto {
  @ApiProperty({ example: '2026-10-03', description: 'Day of the window (YYYY-MM-DD)' })
  @IsDateString()
  date: string;

  @ApiProperty({
    example: 1,
    minimum: 1,
    maximum: MAX_SHIFTS_PER_DAY,
    description: "Shift slot within that day of the window's own grid",
  })
  @IsInt()
  @Min(1)
  @Max(MAX_SHIFTS_PER_DAY)
  slot: number;

  @ApiProperty({ example: 'clx8w2k9c0000abcd1234efgh' })
  @IsString()
  @MaxLength(40)
  userId: string;

  @ApiPropertyOptional({
    example: 'clx8w2k9c0001abcd1234efgh',
    description:
      "Role from the window's own list. Required when the window defines roles, " +
      'rejected when it defines none.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  roleId?: string;
}
