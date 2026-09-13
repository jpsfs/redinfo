import { IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Dating when a contract stopped (`PATCH /employment-contracts/:userId/:contractId`)
 * — see `EndEmploymentContractRequest` (shared) for why this is an edit, not
 * a delete.
 */
export class EndEmploymentContractDto {
  @ApiProperty({ example: '2026-10-31', description: 'ISO date, inclusive.' })
  @IsDateString()
  endDate: string;
}
