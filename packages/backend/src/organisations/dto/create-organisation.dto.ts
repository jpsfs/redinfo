import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MAX_ORGANISATION_NAME_LENGTH, MAX_ORGANISATION_REFERENCE_CODE_LENGTH } from '@redinfo/shared';

export class OrganisationReferenceDto {
  @ApiProperty({ example: 'AZP', description: "The organisation's own reference code" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_ORGANISATION_REFERENCE_CODE_LENGTH)
  code: string;

  @ApiPropertyOptional({ example: 'Envelope-level account code' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateOrganisationDto {
  @ApiProperty({ example: 'AXA Assistance' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_ORGANISATION_NAME_LENGTH)
  name: string;

  @ApiPropertyOptional({ example: '500123456', nullable: true })
  @IsOptional()
  @IsString()
  taxId?: string | null;

  @ApiPropertyOptional({ example: 'contas@axa-assistance.pt', nullable: true })
  @IsOptional()
  @IsEmail()
  contactEmail?: string | null;

  @ApiPropertyOptional({ example: '+351210000000', nullable: true })
  @IsOptional()
  @IsString()
  contactPhone?: string | null;

  @ApiPropertyOptional({ default: false, description: 'Sends transports for others to pay' })
  @IsOptional()
  @IsBoolean()
  isRequester?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Pays for transports, its own or another\'s' })
  @IsOptional()
  @IsBoolean()
  isPayer?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /**
   * Whole-set replace, same contract as `MaterialItemBarcodeDto` — an
   * organisation's reference codes are a collection, not columns, since the
   * worked example carries two at once (an envelope-level account code and a
   * per-row insurer code).
   */
  @ApiPropertyOptional({
    type: [OrganisationReferenceDto],
    description: "Replaces the organisation's whole reference-code set. Omit to leave it untouched.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OrganisationReferenceDto)
  references?: OrganisationReferenceDto[];
}
