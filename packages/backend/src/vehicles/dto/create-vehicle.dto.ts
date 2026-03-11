import {
  IsString,
  IsEnum,
  IsDateString,
  IsOptional,
  IsNotEmpty,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleType, PT_LICENSE_PLATE_REGEX } from '@redinfo/shared';

export class CreateVehicleDto {
  @ApiProperty({
    example: '55-AA-12',
    description: 'Portuguese licence plate (AA-99-99, 99-99-AA, 99-AA-99 or AA-99-AA)',
  })
  @IsString()
  @Matches(PT_LICENSE_PLATE_REGEX, {
    message:
      'licensePlate must be a valid Portuguese licence plate (e.g. 55-AA-12, AB-12-CD)',
  })
  licensePlate: string;

  @ApiProperty({ example: 'VIAT-01', description: 'Unique fleet identifier (número de cauda)' })
  @IsString()
  @IsNotEmpty()
  numeroCauda: string;

  @ApiProperty({ enum: VehicleType })
  @IsEnum(VehicleType)
  vehicleType: VehicleType;

  @ApiProperty({ example: '2025-12-31', description: 'Insurance renewal date (YYYY-MM-DD)' })
  @IsDateString()
  insuranceRenewalDate: string;

  @ApiProperty({ example: '2025-06-30', description: 'Next IMT inspection date (YYYY-MM-DD)' })
  @IsDateString()
  nextImtInspectionDate: string;

  @ApiPropertyOptional({ example: 'Toyota' })
  @IsOptional()
  @IsString()
  manufacturer?: string;

  @ApiPropertyOptional({ example: 'Land Cruiser' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
