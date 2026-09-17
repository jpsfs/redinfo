import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CertificationType } from '@redinfo/shared';

export const MAX_CERTIFICATION_NOTES_LENGTH = 500;

/**
 * Recording a certification a person actually holds. Shape checks only —
 * whether one already exists for this `(userId, type)` is
 * `UserCertificationsService`'s job, since that needs a database read.
 */
export class CreateCertificationDto {
  @ApiProperty({ enum: CertificationType })
  @IsEnum(CertificationType)
  type: CertificationType;

  @ApiPropertyOptional({
    example: '2029-03-14',
    description: 'ISO date, YYYY-MM-DD. Omit for "no known expiry" — counts as valid.',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  validUntil?: string | null;

  @ApiPropertyOptional({ example: '2024-03-14', description: 'ISO date, YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  issuedOn?: string | null;

  @ApiPropertyOptional({ example: 'Curso CVP Braga, turma de março' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CERTIFICATION_NOTES_LENGTH)
  notes?: string;
}
