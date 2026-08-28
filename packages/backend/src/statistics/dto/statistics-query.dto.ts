import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EventReportType } from '@redinfo/shared';

/** `GET /statistics/*` query — shared by all three tabs. */
export class StatisticsQueryDto {
  @ApiPropertyOptional({ example: '2025-09-01', description: 'ISO date, inclusive.' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31', description: 'ISO date, inclusive.' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    enum: EventReportType,
    description: 'Activity and fleet tabs only — narrows every count to one report type.',
  })
  @IsOptional()
  @IsEnum(EventReportType)
  type?: EventReportType;
}
