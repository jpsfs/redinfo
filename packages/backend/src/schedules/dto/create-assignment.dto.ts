import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MAX_SHIFTS_PER_DAY } from '@redinfo/shared';

/** A reason typed by hand; long enough to say something, short enough for a chip. */
export const MAX_OVERRIDE_REASON_LENGTH = 500;

/**
 * Putting one person on one shift.
 *
 * There is deliberately no `isOverride` field: whether an assignment
 * contradicts submitted availability is the server's finding, not the caller's
 * claim, so it is computed from the submission table and stamped here.
 */
/**
 * Someone adding themselves to a published schedule.
 *
 * Carries no `userId` on purpose: the caller is the subject, which is what
 * makes the endpoint safe to offer to every member rather than to coordinators
 * alone. Nobody can be volunteered by somebody else.
 */
export class SelfAssignDto {
  @ApiProperty({ example: '2026-10-03', description: 'Day of the window (YYYY-MM-DD)' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: MAX_SHIFTS_PER_DAY })
  @IsInt()
  @Min(1)
  @Max(MAX_SHIFTS_PER_DAY)
  slot: number;

  @ApiPropertyOptional({
    example: 'clx8w2k9c0001abcd1234efgh',
    description:
      "Role from the window's own list. Required when the window defines roles.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  roleId?: string;
}

/**
 * Self-assignment has no override path for a certification requirement — see
 * `selfAssignBlockedReason` (shared): a volunteer who lacks a post's
 * `requiredCertification` is refused outright, not offered an exception.
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

  @ApiPropertyOptional({
    example: 'TAS de serviço em formação; assume chefia com apoio do coordenador.',
    description:
      "Required exactly when the person does not hold the role's requiredCertification. " +
      'Ignored otherwise.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_OVERRIDE_REASON_LENGTH)
  overrideReason?: string;
}
