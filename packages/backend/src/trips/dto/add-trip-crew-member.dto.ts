import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CertificationType, MAX_OVERRIDE_REASON_LENGTH } from '@redinfo/shared';

/** Adding a crew member unavailable per a `StaffAbsence` throws unless
 * `overrideReason` is given in the same call — the same recorded-reason
 * precedent as `ScheduleAssignment.certificationOverrideReason`. */
export class AddTripCrewMemberDto {
  @ApiProperty()
  @IsString()
  userId: string;

  @ApiProperty({ enum: CertificationType, description: "The role they're filling on this trip." })
  @IsEnum(CertificationType)
  role: CertificationType;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_OVERRIDE_REASON_LENGTH)
  overrideReason?: string | null;
}
