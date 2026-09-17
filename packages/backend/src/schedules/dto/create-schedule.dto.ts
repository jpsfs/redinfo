import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * A schedule is always started from a window, never from dates: the window is
 * what supplies the days, the shifts and the roles it will be built against.
 */
export class CreateScheduleDto {
  @ApiProperty({
    example: 'clx8w2k9c0000abcd1234efgh',
    description:
      'Availability window this schedule belongs to. It may still be open — ' +
      'coordinators start arranging cover before submissions close.',
  })
  @IsString()
  @MaxLength(40)
  windowId: string;
}
