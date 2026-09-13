import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StaffAbsenceKind } from '@redinfo/shared';

/**
 * `PATCH /staff-absences/:id` — a correction to an existing block. Whole-row
 * replace, not a partial patch of individual fields: `kind`/`startDate`/
 * `endDate` are re-validated together the same way `create` does, since a
 * change to one can make the others invalid (e.g. `endDate` before a new,
 * later `startDate`).
 */
export class UpdateStaffAbsenceDto {
  @ApiProperty({ enum: StaffAbsenceKind, example: StaffAbsenceKind.VACATION })
  @IsEnum(StaffAbsenceKind)
  kind: StaffAbsenceKind;

  @ApiProperty({ example: '2026-08-01', description: 'ISO date.' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-08-14', description: 'ISO date, inclusive.' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ example: 'Two weeks in the Algarve' })
  @IsOptional()
  @IsString()
  notes?: string;
}
