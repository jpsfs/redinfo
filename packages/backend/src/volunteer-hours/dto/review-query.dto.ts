import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  VOLUNTEER_HOURS_REVIEW_MAX_PER_PAGE,
  VolunteerHoursSource,
  VolunteerHoursStatus,
} from '@redinfo/shared';

const FLAG_FILTER_VALUES = ['RAN_OVER', 'POSSIBLY_LEFT_EARLY', 'NONE'] as const;

/**
 * `GET /volunteer-hours/review` query — the filterable, paginated queue that
 * replaced the old flat `/pending` list.
 */
export class ReviewVolunteerHoursQueryDto {
  @ApiPropertyOptional({ enum: VolunteerHoursStatus, default: VolunteerHoursStatus.PENDING })
  @IsOptional()
  @IsEnum(VolunteerHoursStatus)
  status?: VolunteerHoursStatus;

  @ApiPropertyOptional({ enum: FLAG_FILTER_VALUES })
  @IsOptional()
  @IsIn(FLAG_FILTER_VALUES)
  flag?: (typeof FLAG_FILTER_VALUES)[number];

  @ApiPropertyOptional({ enum: VolunteerHoursSource })
  @IsOptional()
  @IsEnum(VolunteerHoursSource)
  source?: VolunteerHoursSource;

  @ApiPropertyOptional({ description: "Matches the volunteer's name or the entry description." })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ example: '2026-07-01', description: 'ISO date, inclusive.' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-07-31', description: 'ISO date, inclusive.' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: VOLUNTEER_HOURS_REVIEW_MAX_PER_PAGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(VOLUNTEER_HOURS_REVIEW_MAX_PER_PAGE)
  perPage?: number;

  @ApiPropertyOptional({ enum: ['date', 'person', 'minutes'], default: 'date' })
  @IsOptional()
  @IsIn(['date', 'person', 'minutes'])
  sort?: 'date' | 'person' | 'minutes';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}
