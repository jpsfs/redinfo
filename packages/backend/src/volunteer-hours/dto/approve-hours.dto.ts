import { IsInt, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MAX_MANUAL_HOURS_MINUTES } from '@redinfo/shared';

/** A reason typed by hand; long enough to say something, short enough for a chip. */
export const MAX_CORRECTION_REASON_LENGTH = 500;

/**
 * Approve an entry as proposed, or approve it with the number corrected.
 * There is no separate "reject" — disputing an entry entirely is a
 * correction to zero, with a reason (see `ApproveVolunteerHoursRequest`,
 * shared).
 */
export class ApproveVolunteerHoursDto {
  @ApiPropertyOptional({
    example: 300,
    minimum: 0,
    maximum: MAX_MANUAL_HOURS_MINUTES,
    description: "Omit to approve the entry's own proposed minutes unchanged.",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_MANUAL_HOURS_MINUTES)
  minutes?: number;

  @ApiPropertyOptional({
    example: 'Crew confirmed they left before the report says.',
    description: 'Required exactly when minutes differs from the proposed value.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CORRECTION_REASON_LENGTH)
  correctionReason?: string;
}
