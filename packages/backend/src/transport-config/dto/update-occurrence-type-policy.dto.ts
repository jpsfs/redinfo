import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class UpdateOccurrenceTypePolicyDto {
  @ApiProperty({ example: 30 })
  @IsInt()
  @Min(1)
  minimumDurationMinutes: number;

  @ApiProperty({ example: 45 })
  @IsInt()
  @Min(1)
  defaultDurationMinutes: number;
}
