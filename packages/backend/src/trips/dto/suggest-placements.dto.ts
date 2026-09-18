import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

/** `{ legIds[] }` — the unplanned rail's own group asking "where could this
 * go" (`SuggestPlacementsRequest` in shared). */
export class SuggestPlacementsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  legIds: string[];
}
