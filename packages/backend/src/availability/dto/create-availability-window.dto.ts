import { IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAvailabilityWindowDto {
  @ApiProperty({ example: '2026-09-28', description: 'First day of the window (YYYY-MM-DD)' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-10-05', description: 'Last day of the window, inclusive (YYYY-MM-DD)' })
  @IsDateString()
  endDate: string;
}
