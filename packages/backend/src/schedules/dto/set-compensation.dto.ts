import { Type } from 'class-transformer';
import { ArrayMinSize, IsEnum, IsString, MaxLength, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AssignmentCompensationKind } from '@redinfo/shared';

class ShiftCompensationEntryDto {
  @ApiProperty({ example: 'clx8w2k9c0000abcd1234efgh' })
  @IsString()
  @MaxLength(40)
  assignmentId: string;

  @ApiProperty({
    enum: AssignmentCompensationKind,
    description: 'VOLUNTEER or PAID — SALARY is resolved from the contract clock, never chosen.',
  })
  @IsEnum(AssignmentCompensationKind)
  compensation: AssignmentCompensationKind;
}

/**
 * `PUT /schedules/:id/shifts/:date/:slot/compensation` — a coordinator's
 * classification for a whole shift's crew in one call. An assignment left
 * out of `assignments` is untouched; there is no "clear back to default"
 * here, only an explicit re-classification.
 */
export class SetShiftCompensationDto {
  @ValidateNested({ each: true })
  @Type(() => ShiftCompensationEntryDto)
  @ArrayMinSize(1)
  assignments: ShiftCompensationEntryDto[];
}
