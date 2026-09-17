import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompensationOfferKind } from '@redinfo/shared';

/**
 * `PATCH /schedules/:id/compensation` — the post-close escape hatch (D4): a
 * window's own offer freezes once it closes, so a rate correction (or an
 * explicit withdrawal, `kind: NONE`) after that point goes here instead,
 * replacing the window's offer as a whole unit
 * (`resolveCompensationOffer`). No `note` field — the window's own note is
 * what members read before submitting; this is a figures-only override.
 */
export class SetScheduleCompensationDto {
  @ApiProperty({ enum: CompensationOfferKind })
  @IsEnum(CompensationOfferKind)
  kind: CompensationOfferKind;

  @ApiPropertyOptional({ description: 'EUR cents per hour. Only for kind = HOURLY.', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  rateCents?: number;

  @ApiPropertyOptional({
    description: 'EUR cents per person, per shift. Only for kind = FIXED.',
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  amountCents?: number;
}
