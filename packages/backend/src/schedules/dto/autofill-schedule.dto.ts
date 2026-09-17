import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AutofillMode } from '@redinfo/shared';

const MODES: AutofillMode[] = ['EMPTY', 'REPLACE'];

export class AutofillScheduleDto {
  @ApiPropertyOptional({
    enum: MODES,
    default: 'EMPTY',
    description:
      'EMPTY keeps everyone already placed, overrides included; REPLACE clears ' +
      'the schedule first and fills it from availability alone.',
  })
  @IsOptional()
  @IsIn(MODES)
  mode?: AutofillMode;

  @ApiPropertyOptional({
    default: true,
    description:
      'Prefer whoever has fewest duties so far in this window, so a willing few ' +
      'do not absorb the whole rota.',
  })
  @IsOptional()
  @IsBoolean()
  fairness?: boolean;
}
