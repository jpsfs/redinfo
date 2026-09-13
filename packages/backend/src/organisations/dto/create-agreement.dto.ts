import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { MAX_AGREEMENT_NAME_LENGTH } from '@redinfo/shared';

export class CreateAgreementDto {
  @ApiProperty({ description: 'The organisation paying under this agreement' })
  @IsString()
  @IsNotEmpty()
  payerOrganisationId: string;

  @ApiProperty({ example: 'SNS — Serviço Nacional de Saúde' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_AGREEMENT_NAME_LENGTH)
  name: string;

  @ApiPropertyOptional({ example: 'CTT-2026-004', nullable: true })
  @IsOptional()
  @IsString()
  externalReference?: string | null;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  validFrom: string;

  @ApiPropertyOptional({ example: '2026-12-31', nullable: true })
  @IsOptional()
  @IsDateString()
  validTo?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
