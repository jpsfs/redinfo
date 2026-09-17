import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

/** Per-field `@IsInt`/`@Min` here; shared's `validatePatientHandlingThresholds`
 * has no cross-field rule to add, unlike the arrival window thresholds'
 * earliest-vs-latest check — kept anyway, called from the service, so a
 * future rule lands in one place. */
export class UpdatePatientHandlingThresholdsDto {
  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(0)
  pickupHandlingMinutes: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(0)
  dropoffHandlingMinutes: number;
}
