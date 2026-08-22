import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  EventLocationType,
  EventReportType,
  Gender,
  MAX_CREW_PER_REPORT,
  MAX_EXTERNAL_REFERENCE_LENGTH,
  MAX_OPERATIONAL_REPORT_LENGTH,
  MAX_ROLE_NAME_ON_REPORT,
  MAX_VEHICLE_KILOMETRES,
  MAX_VEHICLES_PER_REPORT,
  MAX_VICTIMS_PER_REPORT,
  MAX_VICTIM_AGE,
  MIN_VICTIM_AGE,
  VictimDestinationKind,
} from '@redinfo/shared';

/**
 * Shape checks only.
 *
 * Whether a payload *makes sense* — one vehicle on an emergency, a hospital
 * only when the victim was transported, times in order — is
 * `validateEventReport` in `@redinfo/shared`, which the service calls and the
 * wizard calls too. Duplicating those rules in decorators would give two
 * places for them to disagree; the array caps here are the permissive outer
 * bound, so a fat payload is refused before it reaches the domain rules.
 */

export class EventReportCrewMemberDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiPropertyOptional({ example: 'Driver', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_ROLE_NAME_ON_REPORT)
  roleName?: string | null;
}

export class EventReportVehicleDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  vehicleId: string;

  @ApiProperty({ example: 42, minimum: 0, maximum: MAX_VEHICLE_KILOMETRES })
  @IsInt()
  @Min(0)
  @Max(MAX_VEHICLE_KILOMETRES)
  kilometres: number;
}

export class EventReportVictimDto {
  @ApiProperty({ enum: Gender })
  @IsEnum(Gender)
  gender: Gender;

  @ApiProperty({ example: 67, minimum: MIN_VICTIM_AGE, maximum: MAX_VICTIM_AGE })
  @IsInt()
  @Min(MIN_VICTIM_AGE)
  @Max(MAX_VICTIM_AGE)
  age: number;

  @ApiProperty({ enum: VictimDestinationKind })
  @IsEnum(VictimDestinationKind)
  destinationKind: VictimDestinationKind;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  destinationHospitalId?: string | null;
}

export class EventReportShiftDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  scheduleId: string;

  @ApiProperty({ example: '2026-08-22' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  slot: number;
}

export class CreateEventReportDto {
  @ApiProperty({ enum: EventReportType })
  @IsEnum(EventReportType)
  type: EventReportType;

  @ApiProperty({ example: '2026-08-22', description: 'The day the activity happened' })
  @IsDateString()
  occurredOn: string;

  @ApiProperty({ example: '2026-08-22T20:14:00.000Z' })
  @IsDateString()
  startedAt: string;

  @ApiPropertyOptional({ example: '2026-08-22T22:05:00.000Z', nullable: true })
  @IsOptional()
  @IsDateString()
  endedAt?: string | null;

  @ApiPropertyOptional({ example: '2608 4471', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_EXTERNAL_REFERENCE_LENGTH)
  externalReference?: string | null;

  @ApiProperty({ enum: EventLocationType })
  @IsEnum(EventLocationType)
  locationType: EventLocationType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  localityId: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  activationAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  sceneArrivalAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  sceneDepartureAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  hospitalArrivalAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  availableAt?: string | null;

  @ApiPropertyOptional({ type: EventReportShiftDto, nullable: true })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => EventReportShiftDto)
  shift?: EventReportShiftDto | null;

  @ApiProperty({ description: 'Rich text (HTML). Sanitized server-side.' })
  @IsString()
  @MaxLength(MAX_OPERATIONAL_REPORT_LENGTH)
  operationalReport: string;

  @ApiProperty({ type: [EventReportCrewMemberDto] })
  @IsArray()
  @ArrayMaxSize(MAX_CREW_PER_REPORT)
  @ValidateNested({ each: true })
  @Type(() => EventReportCrewMemberDto)
  crew: EventReportCrewMemberDto[];

  @ApiProperty({ type: [EventReportVehicleDto] })
  @IsArray()
  @ArrayMaxSize(MAX_VEHICLES_PER_REPORT)
  @ValidateNested({ each: true })
  @Type(() => EventReportVehicleDto)
  vehicles: EventReportVehicleDto[];

  @ApiProperty({ type: [EventReportVictimDto] })
  @IsArray()
  @ArrayMaxSize(MAX_VICTIMS_PER_REPORT)
  @ValidateNested({ each: true })
  @Type(() => EventReportVictimDto)
  victims: EventReportVictimDto[];
}

/**
 * An update carries the whole report, not a patch.
 *
 * A report is one form: the crew opens it, changes what was wrong, and saves
 * it. Accepting partial payloads would mean deciding what an absent `victims`
 * means — "no victims" or "leave them alone" — and there is no answer to that
 * a caller could rely on. So the shape is identical to create, and `type` is
 * read from the stored row and ignored here: a filed report keeps its kind.
 */
export class UpdateEventReportDto extends CreateEventReportDto {}
