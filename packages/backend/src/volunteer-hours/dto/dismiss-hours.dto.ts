import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MAX_DISMISSAL_REASON_LENGTH } from '@redinfo/shared';

/** `POST /volunteer-hours/:id/dismiss` — a coordinator soft-deleting an entry that should not exist. */
export class DismissVolunteerHoursDto {
  @ApiProperty({ example: 'Duplicate of another entry for the same shift.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_DISMISSAL_REASON_LENGTH)
  reason: string;
}
