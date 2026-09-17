import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MAX_APPROVE_BATCH_SIZE, MAX_MANUAL_HOURS_MINUTES } from '@redinfo/shared';
import { MAX_CORRECTION_REASON_LENGTH } from './approve-hours.dto';

export class ApproveVolunteerHoursBatchItemDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: MAX_MANUAL_HOURS_MINUTES,
    description: "Omit to approve the entry's own proposed minutes.",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_MANUAL_HOURS_MINUTES)
  minutes?: number;

  @ApiPropertyOptional({
    description: 'Required exactly when minutes differs from the entry proposed value.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CORRECTION_REASON_LENGTH)
  correctionReason?: string;
}

/** `POST /volunteer-hours/approve-batch`. */
export class ApproveVolunteerHoursBatchDto {
  @ApiProperty({ type: [ApproveVolunteerHoursBatchItemDto] })
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_APPROVE_BATCH_SIZE)
  @ValidateNested({ each: true })
  @Type(() => ApproveVolunteerHoursBatchItemDto)
  entries: ApproveVolunteerHoursBatchItemDto[];
}
