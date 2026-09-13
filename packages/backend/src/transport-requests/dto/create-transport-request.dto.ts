import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  MAX_TRANSPORT_REQUEST_ADDRESS_LENGTH,
  MAX_TRANSPORT_REQUEST_MESSAGE_LENGTH,
  MAX_TRANSPORT_REQUEST_REFERENCE_LENGTH,
  TransportRequestOccurrenceType,
  TransportRequestVehicleType,
} from '@redinfo/shared';

/** The create-if-missing alternative to `destinationFacilityId` — see
 * `FacilitiesService.findOrCreateTransportDestination`. */
export class DestinationFacilityDto {
  @ApiProperty({ example: 'Hospital Privado de Braga' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  municipalityId: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  addressLine?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  postalCode?: string | null;
}

/**
 * A referral, entered by hand — field order mirrors the source document's
 * own layout rather than an idealised one (#228).
 */
export class CreateTransportRequestDto {
  @ApiProperty({ description: "The communication's own reference (Email Nº)" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TRANSPORT_REQUEST_REFERENCE_LENGTH)
  batchReference: string;

  @ApiProperty({ description: 'Data Comunicação' })
  @IsISO8601()
  communicatedAt: string;

  @ApiProperty({ description: "The envelope-level Cliente account code" })
  @IsString()
  @IsNotEmpty()
  requesterAccountCode: string;

  @ApiProperty({ description: "The referral's stated deadline for a decision" })
  @IsISO8601()
  responseDueAt: string;

  @ApiProperty({ description: "The requester's own reference for this transport" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TRANSPORT_REQUEST_REFERENCE_LENGTH)
  externalServiceNumber: string;

  @ApiProperty({ description: 'Data — date and time of the appointment' })
  @IsISO8601()
  appointmentAt: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  requestingOrganisationId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  payingOrganisationId: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  agreementId?: string | null;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @ApiProperty({ enum: TransportRequestOccurrenceType, description: 'Ocorrência' })
  @IsEnum(TransportRequestOccurrenceType)
  occurrenceType: TransportRequestOccurrenceType;

  @ApiProperty({ enum: TransportRequestVehicleType, description: 'Transporte' })
  @IsEnum(TransportRequestVehicleType)
  requestedVehicleType: TransportRequestVehicleType;

  @ApiPropertyOptional({ default: false, description: 'Accom' })
  @IsOptional()
  @IsBoolean()
  escortTravels?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Ida-Volta' })
  @IsOptional()
  @IsBoolean()
  isRoundTrip?: boolean;

  @ApiProperty({ description: 'Pickup address — a door, not a locality' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TRANSPORT_REQUEST_ADDRESS_LENGTH)
  originAddress: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsLatitude()
  originLatitude?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsLongitude()
  originLongitude?: number | null;

  @ApiPropertyOptional({ description: 'An existing transport destination' })
  @IsOptional()
  @IsString()
  destinationFacilityId?: string;

  @ApiPropertyOptional({ type: DestinationFacilityDto, description: 'Create-if-missing alternative to destinationFacilityId' })
  @IsOptional()
  @ValidateNested()
  @Type(() => DestinationFacilityDto)
  destinationFacility?: DestinationFacilityDto;

  @ApiPropertyOptional({ nullable: true, description: 'Msg' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TRANSPORT_REQUEST_MESSAGE_LENGTH)
  freeTextMessage?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "The referral's unresolved Coord column, parked verbatim" })
  @IsOptional()
  @IsString()
  coordColumnValue?: string | null;
}
