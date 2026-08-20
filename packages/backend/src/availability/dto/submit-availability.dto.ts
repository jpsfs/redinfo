import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShiftCode } from '@redinfo/shared';

export class AvailabilityEntryDto {
  @ApiProperty({ example: '2026-10-03', description: 'Day being declared (YYYY-MM-DD)' })
  @IsDateString()
  date: string;

  @ApiProperty({
    isArray: true,
    enum: ShiftCode,
    description:
      'Shifts the user is available for on that day. Must be valid for the ' +
      'day type (1 shift on workdays, 2 on weekends/holidays).',
  })
  @IsArray()
  @ArrayUnique()
  @IsEnum(ShiftCode, { each: true })
  shiftCodes: ShiftCode[];
}

export class SubmitAvailabilityDto {
  @ApiProperty({ type: [AvailabilityEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AvailabilityEntryDto)
  entries: AvailabilityEntryDto[];

  @ApiPropertyOptional({
    description:
      'Window being submitted for. Defaults to the currently open window; ' +
      'supplying a different window is rejected once that window is closed.',
  })
  @IsOptional()
  @IsString()
  windowId?: string;
}
