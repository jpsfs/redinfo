import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  AvdsLevel,
  EventLocationType,
  EventReportType,
  Gender,
  INEM_SUPPORT_UNIT_TYPES,
  InemSupportUnitType,
  InventoryItemType,
  MAX_ASSESSMENTS_PER_REPORT,
  MAX_ASSESSMENT_POSITION_LENGTH,
  MAX_CHAMU_LENGTH,
  MAX_CREW_PER_REPORT,
  MAX_EXTERNAL_REFERENCE_LENGTH,
  MAX_HOSPITAL_EPISODE_NUMBER_LENGTH,
  MAX_INEM_SUPPORT_UNITS_PER_TYPE,
  MAX_MATERIALS_PER_REPORT,
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

export class RouteLegDto {
  @ApiProperty({ example: 'Base' })
  @IsString()
  @MaxLength(200)
  from: string;

  @ApiProperty({ example: 'Hospital de Braga' })
  @IsString()
  @MaxLength(200)
  to: string;

  @ApiProperty({ example: 18, minimum: 0, maximum: MAX_VEHICLE_KILOMETRES })
  @IsNumber()
  @Min(0)
  @Max(MAX_VEHICLE_KILOMETRES)
  kilometres: number;
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

  @ApiPropertyOptional({
    type: [RouteLegDto],
    nullable: true,
    description: 'The legs the distance was computed from. Never typed by the crew.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => RouteLegDto)
  routeLegs?: RouteLegDto[] | null;

  @ApiPropertyOptional({ description: 'The crew edited the computed distance.' })
  @IsOptional()
  @IsBoolean()
  isOverridden?: boolean;
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

  @ApiPropertyOptional({
    nullable: true,
    description: 'The "número de episódio de urgência" the ER issued on admission.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_HOSPITAL_EPISODE_NUMBER_LENGTH)
  hospitalEpisodeNumber?: string | null;
}

export class EventReportInemSupportUnitDto {
  @ApiProperty({ enum: InemSupportUnitType })
  @IsEnum(InemSupportUnitType)
  unitType: InemSupportUnitType;

  @ApiProperty({ description: 'The base the unit was dispatched from.' })
  @IsString()
  @IsNotEmpty()
  hospitalId: string;
}

/**
 * One set of vitals.
 *
 * The bounds live in `VITALS_RANGES` and are enforced by `validateAssessment`
 * and by a CHECK constraint per column — not repeated here. A third copy in
 * decorators would be the one that drifts, and the DB is the copy that cannot
 * be bypassed. What this class is for is refusing a *string* where a number
 * belongs, which the domain rules assume has already been settled.
 */
export class EventReportAssessmentDto {
  @ApiProperty({ example: '2026-08-22T20:31:00.000Z' })
  @IsDateString()
  takenAt: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'How the victim was found or placed, e.g. "decúbito dorsal".',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_ASSESSMENT_POSITION_LENGTH)
  bodyPosition?: string | null;

  @ApiPropertyOptional({ example: 97, nullable: true })
  @IsOptional()
  @IsNumber()
  spo2?: number | null;

  @ApiPropertyOptional({ example: 16, nullable: true })
  @IsOptional()
  @IsNumber()
  respiratoryRate?: number | null;

  @ApiPropertyOptional({ example: 78, nullable: true })
  @IsOptional()
  @IsNumber()
  heartRate?: number | null;

  @ApiPropertyOptional({ example: 130, nullable: true })
  @IsOptional()
  @IsNumber()
  systolic?: number | null;

  @ApiPropertyOptional({ example: 85, nullable: true })
  @IsOptional()
  @IsNumber()
  diastolic?: number | null;

  @ApiPropertyOptional({ example: 104, nullable: true })
  @IsOptional()
  @IsNumber()
  bloodGlucose?: number | null;

  @ApiPropertyOptional({ example: 36.8, nullable: true })
  @IsOptional()
  @IsNumber()
  temperature?: number | null;

  @ApiPropertyOptional({ enum: AvdsLevel, nullable: true })
  @IsOptional()
  @IsEnum(AvdsLevel)
  avds?: AvdsLevel | null;

  @ApiPropertyOptional({ example: 4, nullable: true })
  @IsOptional()
  @IsNumber()
  painScore?: number | null;
}

export class EventReportMaterialDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  materialItemId: string;

  @ApiProperty({
    enum: InventoryItemType,
    description: "The item's type as the picker had it — decides whether `quantity` is required.",
  })
  @IsEnum(InventoryItemType)
  itemType: InventoryItemType;

  @ApiPropertyOptional({
    nullable: true,
    description: "Defaults to the report's first vehicle when omitted.",
  })
  @IsOptional()
  @IsString()
  vehicleId?: string | null;

  @ApiPropertyOptional({ example: 4, nullable: true, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number | null;
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

  // ── INEM support units ─────────────────────────────────────────────────────
  // Emergency reports only. `validateEventReport` refuses these on a type whose
  // rules say `hasInemSupportUnits: false`. The cap here is the permissive
  // outer bound (3 per type, 3 types); the real per-type cap is enforced there.

  @ApiPropertyOptional({ type: [EventReportInemSupportUnitDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_INEM_SUPPORT_UNITS_PER_TYPE * INEM_SUPPORT_UNIT_TYPES.length)
  @ValidateNested({ each: true })
  @Type(() => EventReportInemSupportUnitDto)
  inemSupportUnits?: EventReportInemSupportUnitDto[];

  // ── Materials ───────────────────────────────────────────────────────────────
  // Allowed on every report type, unlike INEM support units above.

  @ApiPropertyOptional({ type: [EventReportMaterialDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MATERIALS_PER_REPORT)
  @ValidateNested({ each: true })
  @Type(() => EventReportMaterialDto)
  materials?: EventReportMaterialDto[];

  // ── Clinical record ────────────────────────────────────────────────────────
  // Emergency reports only. `validateEventReport` refuses these on a type whose
  // rules say `hasClinicalRecord: false`, so a support report cannot smuggle a
  // blood glucose in through the API.

  @ApiPropertyOptional({ nullable: true, description: 'CHAMU — C: circumstances.' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CHAMU_LENGTH)
  chamuCircumstances?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'CHAMU — H: history.' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CHAMU_LENGTH)
  chamuHistory?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'CHAMU — A: allergies.' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CHAMU_LENGTH)
  chamuAllergies?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'CHAMU — M: medication.' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CHAMU_LENGTH)
  chamuMedication?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'CHAMU — U: last meal.' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CHAMU_LENGTH)
  chamuLastMeal?: string | null;

  /**
   * `{ A: { status, note }, … }` — a keyed record, not a list.
   *
   * Checked as a plain object here and validated for real by
   * `validateEventReport`: the band names, the three statuses and the
   * MAX_ABCDE_NOTE_LENGTH note cap all live in `@redinfo/shared`,
   * where the wizard reads them too. A `@ValidateNested` on a `Partial<Record>`
   * would need a class per band to say the same thing worse.
   */
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    example: { A: { status: 'NORMAL' }, C: { status: 'ALTERED', note: 'Hemorragia' } },
  })
  @IsOptional()
  @IsObject()
  abcde?: Record<string, { status: string; note?: string | null }> | null;

  @ApiPropertyOptional({ type: [EventReportAssessmentDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ASSESSMENTS_PER_REPORT)
  @ValidateNested({ each: true })
  @Type(() => EventReportAssessmentDto)
  assessments?: EventReportAssessmentDto[];
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
