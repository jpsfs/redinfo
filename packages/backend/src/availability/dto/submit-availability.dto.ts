import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AvailabilityEntryDto {
  @ApiProperty({ example: '2026-10-03', description: 'Day being declared (YYYY-MM-DD)' })
  @IsDateString()
  date: string;

  @ApiProperty({
    type: [Number],
    example: [1, 2],
    description:
      'Shift slots the user is available for on that day. Must exist on that ' +
      "day of the window — the window defines each day's shifts when it opens.",
  })
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  slots: number[];
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
