import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MAX_CERTIFICATION_NOTES_LENGTH } from './create-certification.dto';

/**
 * Editing a held certification — a renewal, a correction. `type` is not
 * here: it identifies the record (`@@unique([userId, type])`), so changing it
 * is deleting one certification and adding another, not editing this one.
 */
export class UpdateCertificationDto {
  @ApiPropertyOptional({
    example: '2029-03-14',
    description: 'ISO date, YYYY-MM-DD. Null clears it to "no known expiry".',
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
