import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { LOCALES, Locale } from '@redinfo/shared';
import {
  MAX_ADDRESS_LINE_LENGTH,
  MAX_EMERGENCY_CONTACT_NAME_LENGTH,
  MAX_PHONE_LENGTH,
  MAX_POSTAL_CODE_LENGTH,
} from './create-user.dto';

/**
 * What a person may change about their own profile: contact details and
 * emergency contact. Everything else on `User` — identity numbers, role, the
 * active flag, certifications — is coordinator/admin-only, via `UsersService`.
 * Photo is a separate multipart endpoint; it cannot travel in a JSON body.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: '+351 917 445 200' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PHONE_LENGTH)
  phone?: string;

  @ApiPropertyOptional({ example: '1988-04-17', description: 'ISO date, YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ example: 'Rua de São Pedro 118' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_ADDRESS_LINE_LENGTH)
  addressLine?: string;

  @ApiPropertyOptional({ example: '4755-462' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_POSTAL_CODE_LENGTH)
  postalCode?: string;

  @ApiPropertyOptional({ example: 'clx8w2k9c0000abcd1234efgh' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  localityId?: string;

  @ApiPropertyOptional({ example: 'Sónia Costa' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_EMERGENCY_CONTACT_NAME_LENGTH)
  emergencyContactName?: string;

  @ApiPropertyOptional({ example: '+351 933 110 908' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PHONE_LENGTH)
  emergencyContactPhone?: string;

  /**
   * The UI language, changed from the switcher on the profile page. Not a
   * personnel detail, so it is excluded from the profile audit trail — see
   * `SELF_AUDITED_FIELDS` in `user-profile.service.ts`.
   */
  @ApiPropertyOptional({ example: 'pt', enum: LOCALES })
  @IsOptional()
  @IsIn(LOCALES)
  locale?: Locale;
}
