import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MAX_TREATMENT_PLAN_NOTES_LENGTH } from '@redinfo/shared';

/**
 * A recurring treatment series to generate legs from (#230) — the generator,
 * never the durable record. `daysOfWeek` uses `Date#getDay()` convention
 * (0 = Sunday … 6 = Saturday), matching `PaidStaffSchedule.dayOfWeek`.
 */
export class CreateTreatmentPlanDto {
  @ApiProperty()
  @IsString()
  destinationFacilityId: string;

  @ApiProperty({ type: [Number], description: '0 = Sunday … 6 = Saturday' })
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek: number[];

  @ApiProperty({ example: '09:00', description: 'HH:mm, 24h, local time-of-day' })
  @IsString()
  treatmentStartTime: string;

  @ApiPropertyOptional({ nullable: true, example: '11:00' })
  @IsOptional()
  @IsString()
  treatmentEndTime?: string | null;

  @ApiProperty({ description: 'ISO date' })
  @IsISO8601()
  validFrom: string;

  @ApiProperty({ description: 'ISO date, inclusive' })
  @IsISO8601()
  validTo: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TREATMENT_PLAN_NOTES_LENGTH)
  notes?: string | null;
}
