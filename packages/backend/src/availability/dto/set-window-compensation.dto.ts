import { IsEnum, IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompensationOfferKind } from '@redinfo/shared';

/**
 * `PATCH /availability-windows/:id` — the window's own compensation offer.
 * The only field this route edits; the cross-field rule (`HOURLY` needs a
 * rate and no amount, `FIXED` the mirror, `NONE` needs neither) is enforced
 * in the service via the shared `validateCompensationOffer`, not here, so
 * the message a coordinator sees matches the one the DB CHECK constraint
 * would otherwise produce.
 */
export class SetWindowCompensationDto {
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

  @ApiPropertyOptional({ description: 'Free-text context, e.g. "paid by the client".' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
