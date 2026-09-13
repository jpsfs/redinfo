import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmploymentContractKind } from '@redinfo/shared';

/**
 * A dated fact that someone is on contract (Stage 1 of the paid-staff
 * rework, replacing #223's timeless `User.isPaidStaff` flag). `kind` is
 * descriptive only — no logic reads it.
 */
export class CreateEmploymentContractDto {
  @ApiProperty({ enum: EmploymentContractKind, example: EmploymentContractKind.FULL_TIME })
  @IsEnum(EmploymentContractKind)
  kind: EmploymentContractKind;

  @ApiProperty({ example: '2026-03-01', description: 'ISO date this contract starts.' })
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional({
    example: '2026-10-31',
    description: 'ISO date, inclusive. Omitted = still in effect.',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
