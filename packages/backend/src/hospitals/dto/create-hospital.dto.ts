import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { MAX_HOSPITAL_NAME_LENGTH } from '@redinfo/shared';

export class CreateHospitalDto {
  @ApiProperty({ example: 'CHUC — Hospital Geral (Covões)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_HOSPITAL_NAME_LENGTH)
  name: string;

  @ApiProperty({ description: 'Municipality the hospital is in' })
  @IsString()
  @IsNotEmpty()
  municipalityId: string;

  /**
   * Optional, and null-able rather than merely absent: a coordinator who
   * mistyped a coordinate needs a way to take it back out, which `undefined`
   * cannot express through a PATCH.
   */
  @ApiPropertyOptional({ example: 40.1976, nullable: true })
  @IsOptional()
  @IsLatitude()
  latitude?: number | null;

  @ApiPropertyOptional({ example: -8.4392, nullable: true })
  @IsOptional()
  @IsLongitude()
  longitude?: number | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
