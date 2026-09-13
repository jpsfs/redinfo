import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  MAX_PATIENT_ADDRESS_LENGTH,
  MAX_PATIENT_CONTACT_NOTE_LENGTH,
  MAX_PATIENT_NAME_LENGTH,
  MAX_PATIENT_TELEPHONE_LENGTH,
  PatientMobility,
} from '@redinfo/shared';

/**
 * The sealed identity payload, declared as one class — following
 * `LiveRunIdentityDto`'s precedent — so "what counts as identity" is a list
 * somebody can read rather than a judgement made field by field.
 *
 * Every field required: `PatientIdentity` is written and read as one unit,
 * never field-by-field — see that type's doc comment (shared).
 */
export class PatientIdentityDto {
  @ApiProperty({ example: 'Maria Fernanda Costa' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PATIENT_NAME_LENGTH)
  fullName: string;

  @ApiProperty({ example: '+351912345678' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PATIENT_TELEPHONE_LENGTH)
  telephone: string;

  @ApiProperty({ description: 'Street and number.', example: 'Rua do Castelo, 12' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PATIENT_ADDRESS_LENGTH)
  homeAddressLine: string;

  @ApiProperty({ example: '3000-123' })
  @IsString()
  @IsNotEmpty()
  homePostalCode: string;

  @ApiProperty({ description: 'Free text, as given at intake.', example: 'Coimbra' })
  @IsString()
  @IsNotEmpty()
  homeLocality: string;

  @ApiProperty({ example: 'Ana Costa' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PATIENT_NAME_LENGTH)
  referenceContactName: string;

  @ApiProperty({ example: 'Filha' })
  @IsString()
  @IsNotEmpty()
  referenceContactRelationship: string;

  @ApiProperty({ example: '+351913456789' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PATIENT_TELEPHONE_LENGTH)
  referenceContactTelephone: string;
}

export class CreatePatientDto {
  @ApiProperty({ enum: PatientMobility })
  @IsEnum(PatientMobility)
  mobility: PatientMobility;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  needsOxygen?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  escortRequired?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isBariatric?: boolean;

  /**
   * Optional, and null-able rather than merely absent — same reasoning as
   * `CreateFacilityDto.latitude`: a coordinate typed in error needs a way to
   * come back out, which `undefined` cannot express through a PATCH.
   */
  @ApiPropertyOptional({ example: 40.1976, nullable: true })
  @IsOptional()
  @IsLatitude()
  defaultLatitude?: number | null;

  @ApiPropertyOptional({ example: -8.4392, nullable: true })
  @IsOptional()
  @IsLongitude()
  defaultLongitude?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  localityId?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  referenceContactIsOrganisation?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  contactAuthorisationRecorded?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PATIENT_CONTACT_NOTE_LENGTH)
  contactAuthorisationNote?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /**
   * Accepted from any caller, so the global `ValidationPipe`'s
   * `forbidNonWhitelisted` doesn't reject the payload outright with "property
   * identity should not exist" — a DTO has no notion of the caller's roles.
   * Whether it is actually honoured is `PatientsService`'s call, gated on
   * `VIEW_PATIENT_IDENTITY`; a caller without it who sends this gets refused,
   * not silently ignored.
   *
   * `null` (as opposed to omitted) means "erase the sealed identity" — the
   * one way this API can act on an erasure request; see
   * `PatientsService.update`.
   */
  @ApiPropertyOptional({ type: PatientIdentityDto, nullable: true })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PatientIdentityDto)
  identity?: PatientIdentityDto | null;
}
