import { IsDateString, IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StaffAbsenceKind } from '@redinfo/shared';

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIME_OF_DAY_MESSAGE = 'Time must be HH:mm, 24-hour.';

/**
 * `POST /staff-absences` — a coordinator recording a durable HR fact.
 * `MANAGE_PERSONNEL` only, the same split as `EmploymentContractsController`:
 * this is a coordinator's record, not something a person edits about
 * themselves. The range is inclusive; overlap and ordering are checked in
 * the service, not here (they depend on the person's other rows).
 */
export class CreateStaffAbsenceDto {
  @ApiProperty({ example: 'clx1234567890', description: 'Who this absence is for.' })
  @IsString()
  userId: string;

  @ApiProperty({ enum: StaffAbsenceKind, example: StaffAbsenceKind.VACATION })
  @IsEnum(StaffAbsenceKind)
  kind: StaffAbsenceKind;

  @ApiProperty({ example: '2026-08-01', description: 'ISO date.' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-08-14', description: 'ISO date, inclusive.' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({
    example: '09:00',
    description:
      'Partial day only — a medical appointment, say. OTHER_PAID_LEAVE only, on a single-day range, set together with endTime.',
  })
  @IsOptional()
  @Matches(TIME_OF_DAY, { message: TIME_OF_DAY_MESSAGE })
  startTime?: string;

  @ApiPropertyOptional({ example: '11:00', description: 'Partial day only — set together with startTime.' })
  @IsOptional()
  @Matches(TIME_OF_DAY, { message: TIME_OF_DAY_MESSAGE })
  endTime?: string;

  @ApiPropertyOptional({ example: 'Two weeks in the Algarve' })
  @IsOptional()
  @IsString()
  notes?: string;
}
