import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

/** Per-field `@IsInt`/`@Min` here; the earliest-vs-latest cross-field rule
 * (and the same shape's reuse as a facility override) lives in shared's
 * `validateArrivalWindowThresholds`, called from the service. */
export class UpdateArrivalWindowThresholdsDto {
  @ApiProperty({ example: 30 })
  @IsInt()
  @Min(0)
  arrivalWindowEarliestMinutes: number;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(0)
  arrivalWindowLatestMinutes: number;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(0)
  arrivalToleranceMinutes: number;
}
