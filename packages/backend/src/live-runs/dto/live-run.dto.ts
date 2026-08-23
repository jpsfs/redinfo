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
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  EventLocationType,
  Gender,
  LiveRunState,
  MAX_CREW_PER_REPORT,
  MAX_EXTERNAL_REFERENCE_LENGTH,
  MAX_LIVE_RUN_ADDRESS_LENGTH,
  MAX_LIVE_RUN_COMPLAINT_LENGTH,
  MAX_LIVE_RUN_NAME_LENGTH,
  MAX_VICTIM_AGE,
  MIN_VICTIM_AGE,
  VictimDestinationKind,
} from '@redinfo/shared';
import { EventReportCrewMemberDto, EventReportShiftDto } from '../../event-reports/dto/event-report.dto';

/**
 * The identity fields, which live only while the run does.
 *
 * Sealed into one AES-256-GCM column and destroyed when the report is filed or
 * 48 hours after the run closes, whichever comes first. They are declared here,
 * in one class, precisely so that "what counts as identity" is a list somebody
 * can read rather than a judgement made field by field.
 */
export class LiveRunIdentityDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LIVE_RUN_NAME_LENGTH)
  victimName?: string | null;

  @ApiPropertyOptional({ example: '1948-03-17', nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'A date of birth is a calendar date (YYYY-MM-DD).' })
  victimDateOfBirth?: string | null;

  @ApiPropertyOptional({ example: '123456789', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  victimSnsNumber?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LIVE_RUN_ADDRESS_LENGTH)
  occurrenceAddress?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'How to find it — "porta azul ao lado do café".',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LIVE_RUN_ADDRESS_LENGTH)
  referencePoints?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LIVE_RUN_ADDRESS_LENGTH)
  victimHomeAddress?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Where the victim lives, when that differs from the occurrence.',
  })
  @IsOptional()
  @IsString()
  victimHomeLocalityId?: string | null;
}

/**
 * One phone's whole run document.
 *
 * `PUT` rather than `PATCH`, and the whole document rather than a diff, because
 * the device is the source of truth: the server's copy is a mirror it replaces.
 * That is what makes the outbox able to retry blindly — a queued whole-document
 * PUT supersedes every mutation queued before it.
 *
 * `id` is **client-supplied**, so that a run started in a dead spot syncs an
 * hour later into the row it would have created at the time. The charset is
 * pinned rather than free, because a client-owned primary key that can be any
 * string is a key that will one day be a path fragment or a log injection.
 */
export class SyncLiveRunDto {
  @ApiProperty({ description: 'Device-generated id. Kept for the run’s whole life.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'A run id may only contain letters, digits, hyphens and underscores.',
  })
  id: string;

  @ApiProperty({
    example: 7,
    minimum: 0,
    description: 'The device’s own counter. The only ordering the server trusts.',
  })
  @IsInt()
  @Min(0)
  revision: number;

  @ApiProperty({ enum: LiveRunState })
  @IsEnum(LiveRunState)
  state: LiveRunState;

  @ApiProperty({ example: '2026-08-22T20:11:00.000Z' })
  @IsDateString()
  startedAt: string;

  @ApiPropertyOptional({ example: '2608 4471', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_EXTERNAL_REFERENCE_LENGTH)
  externalReference?: string | null;

  @ApiPropertyOptional({ example: 'Queda com traumatismo', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LIVE_RUN_COMPLAINT_LENGTH)
  chiefComplaint?: string | null;

  @ApiPropertyOptional({ enum: EventLocationType, nullable: true })
  @IsOptional()
  @IsEnum(EventLocationType)
  locationType?: EventLocationType | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  localityId?: string | null;

  @ApiPropertyOptional({ enum: Gender, nullable: true })
  @IsOptional()
  @IsEnum(Gender)
  victimGender?: Gender | null;

  @ApiPropertyOptional({ example: 67, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(MIN_VICTIM_AGE)
  @Max(MAX_VICTIM_AGE)
  victimAge?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  vehicleId?: string | null;

  @ApiPropertyOptional({ type: [EventReportCrewMemberDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CREW_PER_REPORT)
  @ValidateNested({ each: true })
  @Type(() => EventReportCrewMemberDto)
  crew?: EventReportCrewMemberDto[];

  @ApiPropertyOptional({ type: EventReportShiftDto, nullable: true })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => EventReportShiftDto)
  shift?: EventReportShiftDto | null;

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

  @ApiPropertyOptional({ enum: VictimDestinationKind, nullable: true })
  @IsOptional()
  @IsEnum(VictimDestinationKind)
  destinationKind?: VictimDestinationKind | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  destinationHospitalId?: string | null;

  @ApiPropertyOptional({ type: LiveRunIdentityDto, nullable: true })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LiveRunIdentityDto)
  identity?: LiveRunIdentityDto | null;

  /**
   * Vitals, CHAMU, ABCDE and the narrative in progress.
   *
   * Deliberately unstructured here: the server never edits a field of it, it
   * replaces the whole thing, and giving it a class would mean a DTO change every
   * time the phone's form gains a box. `validateLiveRun` still checks the
   * clinical part of it through `validateClinicalRecord`, which is where those
   * rules live for the report too.
   */
  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true })
  @IsOptional()
  @IsObject()
  capture?: Record<string, unknown> | null;

  /**
   * Accepted and ignored.
   *
   * `LiveRunInput` — the whole document a phone holds — always carries this
   * field, so a sync PUT always sends it even though closing is a different
   * route. Declaring it here is what lets the global `ValidationPipe`'s
   * `forbidNonWhitelisted` accept the document instead of rejecting every
   * sync with "property closedAt should not exist"; `LiveRunsService.toColumns`
   * is what actually keeps it from being written.
   */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  closedAt?: string | null;
}

/** The delegation's own configuration, as a coordinator may change it. */
export class UpdateDelegationSettingsDto {
  @ApiProperty({ example: 'Cruz Vermelha Portuguesa — Delegação de Campo' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  baseName: string;

  @ApiProperty({ example: 41.5923783 })
  @Min(-90)
  @Max(90)
  baseLatitude: number;

  @ApiProperty({ example: -8.6117829 })
  @Min(-180)
  @Max(180)
  baseLongitude: number;

  @ApiProperty({ example: '+351800203264' })
  @IsString()
  @Matches(/^\+?[0-9 ]{6,20}$/, { message: 'That is not a dialable phone number.' })
  coduDadosPhone: string;
}
