import { IsDateString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** `POST /volunteer-hours/approve-sweep` — the "no exceptions" quick action. */
export class SweepApproveVolunteerHoursDto {
  @ApiPropertyOptional({ example: '2026-07-01', description: 'ISO date, inclusive.' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-07-31', description: 'ISO date, inclusive.' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
