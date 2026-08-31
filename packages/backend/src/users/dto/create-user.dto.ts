import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuthProvider, BloodType, UserRole } from '@redinfo/shared';

/** Guards on free-text profile fields; not domain rules. */
export const MAX_PHONE_LENGTH = 30;
export const MAX_ADDRESS_LINE_LENGTH = 200;
export const MAX_POSTAL_CODE_LENGTH = 20;
export const MAX_IDENTITY_NUMBER_LENGTH = 40;
export const MAX_EMERGENCY_CONTACT_NAME_LENGTH = 120;

/**
 * Account plus the personnel-profile fields a coordinator may fill in at
 * creation time.
 *
 * `isDriver` has no field here — driving is a certification, added
 * afterwards via `POST /users/:id/certifications`, never a flag set at
 * account creation.
 */
export class CreateUserDto {
  @ApiProperty({ example: 'joao.silva@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'João' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Silva' })
  @IsString()
  lastName: string;

  @ApiPropertyOptional({ example: 'SecurePass1!' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.EMERGENCY_OPERATIONAL })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({
    enum: AuthProvider,
    default: AuthProvider.LOCAL,
    description:
      'How this person signs in. GOOGLE/MICROSOFT accounts never get a password — the ' +
      'first successful sign-in with that provider links it automatically; once linked, ' +
      'only an admin can move an account back to LOCAL.',
  })
  @IsOptional()
  @IsEnum(AuthProvider)
  provider?: AuthProvider;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // ── Personnel profile ──────────────────────────────────────────────────
  @ApiPropertyOptional({ example: '+351 917 445 200' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PHONE_LENGTH)
  phone?: string;

  @ApiPropertyOptional({ example: '1988-04-17', description: 'ISO date, YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ example: '2021-02-02', description: 'ISO date, YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  joinedOn?: string;

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

  @ApiPropertyOptional({
    example: '118342',
    description: 'Assigned by the delegation; not self-editable.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_IDENTITY_NUMBER_LENGTH)
  redCrossNumber?: string;

  @ApiPropertyOptional({
    example: '27',
    description: 'Optional, manually assigned; not self-editable.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_IDENTITY_NUMBER_LENGTH)
  volunteerNumber?: string;

  @ApiPropertyOptional({ example: '218442907' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_IDENTITY_NUMBER_LENGTH)
  nif?: string;

  @ApiPropertyOptional({ example: '14582207' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_IDENTITY_NUMBER_LENGTH)
  citizenCardNumber?: string;

  @ApiPropertyOptional({ enum: BloodType })
  @IsOptional()
  @IsEnum(BloodType)
  bloodType?: BloodType;

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
}
