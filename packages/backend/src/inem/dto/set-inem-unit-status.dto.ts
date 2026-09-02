import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * `PUT /inem/units/:unitId` body. `unitId` itself comes from the route, not
 * the body — matching `SetINEMUnitStatusRequest` in shared, minus the field
 * the URL already carries.
 *
 * `inopCode` is validated as a non-empty string rather than an enum of
 * `INEMInopCode`: the live `GET /api/INOP` map (surfaced through
 * `GET /inem/status`) is the runtime source of truth, and INEM can add a
 * reason code redinfo has no compile-time key for — rejecting it here would
 * make a legitimate live code un-settable until a redeploy.
 */
export class SetInemUnitStatusDto {
  @ApiProperty({ example: 'TEPH_Falta', description: '"00" for available, or a live INEM INOP reason code' })
  @IsString()
  @IsNotEmpty()
  inopCode: string;
}
