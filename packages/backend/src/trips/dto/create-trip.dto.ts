import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { MAX_TRIP_NOTES_LENGTH } from '@redinfo/shared';

/** A vehicle and (later) a crew on a date — the container a stop sequence
 * gets built onto. See the module banner comment for why crew and stops are
 * each their own endpoint rather than nested creation. */
export class CreateTripDto {
  @ApiProperty({ description: 'ISO date' })
  @IsISO8601()
  date: string;

  @ApiProperty()
  @IsString()
  vehicleId: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TRIP_NOTES_LENGTH)
  notes?: string | null;
}
