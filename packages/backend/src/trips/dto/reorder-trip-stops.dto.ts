import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

/** `PUT /trips/:id/stops/order` — the full ordered list of this trip's stop
 * ids, renumbered `1..N` in one transaction. The only way to reorder: this
 * is what lets every other write append at the end without ever colliding
 * on `@@unique([tripId, sequence])`. */
export class ReorderTripStopsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  stopIds: string[];
}
