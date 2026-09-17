import {
  IsString,
  IsEnum,
  IsDateString,
  IsOptional,
  IsNotEmpty,
  IsInt,
  IsBoolean,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  VehicleType,
  PT_LICENSE_PLATE_REGEX,
  MAX_VEHICLE_SEATED_CAPACITY,
  MAX_VEHICLE_WHEELCHAIR_POSITIONS,
  MAX_VEHICLE_STRETCHER_POSITIONS,
} from '@redinfo/shared';

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

  @ApiPropertyOptional({
    example: 4,
    description: 'Seats for ambulatory passengers',
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_VEHICLE_SEATED_CAPACITY)
  seatedCapacity?: number;

  @ApiPropertyOptional({
    example: 1,
    description: '0, 1 or 2 depending on the vehicle',
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_VEHICLE_WHEELCHAIR_POSITIONS)
  wheelchairPositions?: number;

  @ApiPropertyOptional({ example: 1, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_VEHICLE_STRETCHER_POSITIONS)
  stretcherPositions?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hasRampOrLift?: boolean;
}
