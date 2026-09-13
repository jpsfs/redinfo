import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { MAX_TRANSPORT_REQUEST_REJECTION_REASON_LENGTH, TransportRequestDecision } from '@redinfo/shared';

/** Accepting or rejecting a referral — see `TransportRequestsService.decide`. */
export class DecideTransportRequestDto {
  @ApiProperty({
    enum: [TransportRequestDecision.ACCEPTED, TransportRequestDecision.REJECTED],
  })
  @IsEnum(TransportRequestDecision)
  @IsIn([TransportRequestDecision.ACCEPTED, TransportRequestDecision.REJECTED])
  decision: TransportRequestDecision.ACCEPTED | TransportRequestDecision.REJECTED;

  @ApiPropertyOptional({ nullable: true, description: 'Required when rejecting' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TRANSPORT_REQUEST_REJECTION_REASON_LENGTH)
  rejectionReason?: string | null;
}
