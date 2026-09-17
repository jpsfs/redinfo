import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { LegCancellationSource, MAX_LEG_CANCELLATION_REASON_LENGTH } from '@redinfo/shared';

/** Cancelling a leg (#230) never touches the plan above it — see
 * `TransportRequestLegsService.cancel`. */
export class CancelTransportLegDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_LEG_CANCELLATION_REASON_LENGTH)
  reason: string;

  @ApiProperty({ enum: LegCancellationSource })
  @IsEnum(LegCancellationSource)
  source: LegCancellationSource;
}
