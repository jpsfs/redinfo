import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  Action,
  Patient,
  PatientIdentity,
  PatientMobility,
  UserRole,
  hasPermission,
  validatePatient,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { IdentityCipher, UnknownIdentityKeyError } from '../common/identity-cipher';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import {
  OpenedPatientIdentity,
  PATIENT_SELECT,
  PATIENT_SELECT_WITH_IDENTITY,
  PatientRowWithIdentity,
  serializePatient,
} from './patient.serializer';

export interface RequestUser {
  id: string;
  roles: UserRole[];
}

/** The table this identity blob is bound to, in `IdentityCipher`'s AAD — see that file's doc comment. */
const IDENTITY_SCOPE = 'patient';

/**
 * Whether this viewer may open a patient's sealed identity blob.
 *
 * Deliberately narrower than `MANAGE_PATIENTS` — see `Action.VIEW_PATIENT_IDENTITY`'s
 * doc comment (shared) — and exported so the controller/tests can compute the
 * same answer rather than guessing at it, the same `canSeeCompensation` precedent
 * `schedules.service.ts` uses for its own narrower-than-its-neighbour capability.
 */
export const canSeeIdentity = (user: RequestUser): boolean =>
  hasPermission(user.roles, Action.VIEW_PATIENT_IDENTITY);

export interface PatientPage {
  data: Patient[];
  total: number;
  page: number;
  perPage: number;
}

/**
 * Non-urgent transport patients (#219, #226) — a durable, months-long
 * relationship, unlike `EventReportVictim`.
 *
 * `MANAGE_PATIENTS` reaches every method here; `VIEW_PATIENT_IDENTITY` is
 * checked again inside each one, because it gates a column, not a route —
 * the same reason `LiveRunsController` gates a run by row rather than only
 * at the controller.
 */
@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly identityCipher: IdentityCipher,
  ) {}

  /**
   * Opens the sealed blob, or says why it could not — same shape as
   * `LiveRunsService.openIdentity`. A key this process does not have yields
   * `identityUnavailable: true` rather than a 500, since a key retired an
   * hour early must not take a patient record down; anything else (a blob
   * copied across rows, corruption) is logged and treated the same way
   * rather than thrown — the unsealed profile is still worth reading when
   * its name field is not.
   */
  private openIdentity(row: { id: string; identity: Uint8Array | null }): OpenedPatientIdentity {
    if (!row.identity) return {};
    try {
      const identity = this.identityCipher.open<PatientIdentity>(
        IDENTITY_SCOPE,
        row.id,
        Buffer.from(row.identity),
      );
      return { identity };
    } catch (cause) {
      if (!(cause instanceof UnknownIdentityKeyError)) {
        this.logger.error(
          `Identity blob on patient ${row.id} could not be opened: ${(cause as Error).message}`,
        );
      }
      return { identityUnavailable: true };
    }
  }

  async findManaged(
    user: RequestUser,
    page = 1,
    perPage = 50,
    includeInactive = true,
  ): Promise<PatientPage> {
    const skip = (page - 1) * perPage;
    const where = includeInactive ? {} : { isActive: true };
    const orderBy = { updatedAt: 'desc' } as const;

    if (canSeeIdentity(user)) {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.patient.findMany({
          where,
          skip,
          take: perPage,
          orderBy,
          select: PATIENT_SELECT_WITH_IDENTITY,
        }),
        this.prisma.patient.count({ where }),
      ]);
      return {
        data: rows.map((row) => serializePatient(row, true, this.openIdentity(row))),
        total,
        page,
        perPage,
      };
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.patient.findMany({ where, skip, take: perPage, orderBy, select: PATIENT_SELECT }),
      this.prisma.patient.count({ where }),
    ]);
    return { data: rows.map((row) => serializePatient(row, false)), total, page, perPage };
  }

  async findOne(id: string, user: RequestUser): Promise<Patient> {
    if (canSeeIdentity(user)) {
      const row = await this.prisma.patient.findUnique({
        where: { id },
        select: PATIENT_SELECT_WITH_IDENTITY,
      });
      if (!row) throw new NotFoundException(`Patient ${id} not found`);
      return serializePatient(row, true, this.openIdentity(row));
    }

    const row = await this.prisma.patient.findUnique({ where: { id }, select: PATIENT_SELECT });
    if (!row) throw new NotFoundException(`Patient ${id} not found`);
    return serializePatient(row, false);
  }

  async create(dto: CreatePatientDto, user: RequestUser): Promise<Patient> {
    const seeIdentity = canSeeIdentity(user);
    if (dto.identity !== undefined && dto.identity !== null && !seeIdentity) {
      throw new ForbiddenException(
        'Only a holder of VIEW_PATIENT_IDENTITY may record a patient’s identity.',
      );
    }

    const input = this.normalize(dto);
    const error = validatePatient({ ...input, identity: dto.identity ?? null });
    if (error) throw new BadRequestException(error);

    if (input.localityId) await this.assertLocalityExists(input.localityId);

    // `as never` on the enum: Prisma generates its own `PatientMobility`,
    // nominally distinct from `@redinfo/shared`'s despite identical members —
    // the same cast `LiveRunsService`/`IdentityPurgeService` use for `state`.
    const baseData: Prisma.PatientUncheckedCreateInput = {
      ...input,
      mobility: input.mobility as never,
      createdById: user.id,
    };

    if (!dto.identity) {
      const created = await this.prisma.patient.create({
        data: baseData,
        select: seeIdentity ? PATIENT_SELECT_WITH_IDENTITY : PATIENT_SELECT,
      });
      return serializePatient(created, seeIdentity, {});
    }

    // Sealing needs the row id as additional authenticated data, so the row
    // has to exist first — one transaction, so a failure between the two
    // never leaves a patient with a half-written blob.
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.patient.create({ data: baseData, select: { id: true } });
      const blob = this.identityCipher.seal(IDENTITY_SCOPE, created.id, dto.identity!);
      const full = await tx.patient.update({
        where: { id: created.id },
        data: { identity: blob },
        select: seeIdentity ? PATIENT_SELECT_WITH_IDENTITY : PATIENT_SELECT,
      });
      // Already have the plaintext we just sealed — no need to decrypt it
      // straight back out, the same shortcut `LiveRunsService.sync` takes.
      return serializePatient(full, seeIdentity, { identity: dto.identity! });
    });
  }

  async update(id: string, dto: UpdatePatientDto, user: RequestUser): Promise<Patient> {
    const seeIdentity = canSeeIdentity(user);
    if (dto.identity !== undefined && !seeIdentity) {
      throw new ForbiddenException(
        'Only a holder of VIEW_PATIENT_IDENTITY may change a patient’s identity.',
      );
    }

    const current = await this.prisma.patient.findUnique({ where: { id }, select: PATIENT_SELECT });
    if (!current) throw new NotFoundException(`Patient ${id} not found`);

    const merged = this.normalize({
      mobility: (dto.mobility ?? current.mobility) as PatientMobility,
      needsOxygen: dto.needsOxygen !== undefined ? dto.needsOxygen : current.needsOxygen,
      escortRequired: dto.escortRequired !== undefined ? dto.escortRequired : current.escortRequired,
      isBariatric: dto.isBariatric !== undefined ? dto.isBariatric : current.isBariatric,
      defaultLatitude:
        dto.defaultLatitude !== undefined ? dto.defaultLatitude : current.defaultLatitude,
      defaultLongitude:
        dto.defaultLongitude !== undefined ? dto.defaultLongitude : current.defaultLongitude,
      localityId: dto.localityId !== undefined ? dto.localityId : current.localityId,
      referenceContactIsOrganisation:
        dto.referenceContactIsOrganisation !== undefined
          ? dto.referenceContactIsOrganisation
          : current.referenceContactIsOrganisation,
      contactAuthorisationRecorded:
        dto.contactAuthorisationRecorded !== undefined
          ? dto.contactAuthorisationRecorded
          : current.contactAuthorisationRecorded,
      contactAuthorisationNote:
        dto.contactAuthorisationNote !== undefined
          ? dto.contactAuthorisationNote
          : current.contactAuthorisationNote,
      isActive: dto.isActive !== undefined ? dto.isActive : current.isActive,
    });

    const error = validatePatient({ ...merged, identity: null });
    if (error) throw new BadRequestException(error);

    if (merged.localityId && merged.localityId !== current.localityId) {
      await this.assertLocalityExists(merged.localityId);
    }

    const data: Prisma.PatientUncheckedUpdateInput = { ...merged, mobility: merged.mobility as never };

    // `identity` is whole-document or untouched, never a field-by-field PATCH
    // — see `PatientIdentity`'s doc comment. `undefined` leaves the existing
    // blob alone; an explicit object reseals it; an explicit `null` is a
    // deliberate erasure, so it stamps `identityPurgedAt` the same as the
    // sweep would, rather than leaving that fact unrecorded.
    if (dto.identity !== undefined) {
      if (dto.identity === null) {
        data.identity = null;
        data.identityPurgedAt = new Date();
      } else {
        data.identity = this.identityCipher.seal(IDENTITY_SCOPE, id, dto.identity);
        data.identityPurgedAt = null;
      }
    }

    const updated = await this.prisma.patient.update({
      where: { id },
      data,
      select: seeIdentity ? PATIENT_SELECT_WITH_IDENTITY : PATIENT_SELECT,
    });

    if (dto.identity !== undefined) {
      return serializePatient(
        updated,
        seeIdentity,
        dto.identity === null ? {} : { identity: dto.identity },
      );
    }
    if (seeIdentity) {
      return serializePatient(updated, true, this.openIdentity(updated as PatientRowWithIdentity));
    }
    return serializePatient(updated, false);
  }

  /**
   * Deletes the record outright.
   *
   * No retention/references check yet, unlike `FacilitiesService.remove`:
   * nothing names a `Patient` from another table in #226 — treatment plans
   * and trips arrive in later stories. Revisit this once one of them does;
   * at that point "delete" likely needs to become "retire", same as a
   * facility a report has named.
   */
  async remove(id: string, user: RequestUser): Promise<Patient> {
    const exists = await this.prisma.patient.count({ where: { id } });
    if (exists === 0) throw new NotFoundException(`Patient ${id} not found`);

    const seeIdentity = canSeeIdentity(user);
    const deleted = await this.prisma.patient.delete({
      where: { id },
      select: seeIdentity ? PATIENT_SELECT_WITH_IDENTITY : PATIENT_SELECT,
    });
    return serializePatient(
      deleted,
      seeIdentity,
      seeIdentity ? this.openIdentity(deleted as PatientRowWithIdentity) : {},
    );
  }

  private normalize(input: {
    mobility: Patient['mobility'];
    needsOxygen?: boolean;
    escortRequired?: boolean;
    isBariatric?: boolean;
    defaultLatitude?: number | null;
    defaultLongitude?: number | null;
    localityId?: string | null;
    referenceContactIsOrganisation?: boolean;
    contactAuthorisationRecorded?: boolean;
    contactAuthorisationNote?: string | null;
    isActive?: boolean;
  }) {
    return {
      mobility: input.mobility,
      needsOxygen: input.needsOxygen ?? false,
      escortRequired: input.escortRequired ?? false,
      isBariatric: input.isBariatric ?? false,
      defaultLatitude: input.defaultLatitude ?? null,
      defaultLongitude: input.defaultLongitude ?? null,
      localityId: input.localityId?.trim() || null,
      referenceContactIsOrganisation: input.referenceContactIsOrganisation ?? false,
      contactAuthorisationRecorded: input.contactAuthorisationRecorded ?? false,
      contactAuthorisationNote: input.contactAuthorisationNote?.trim() || null,
      isActive: input.isActive ?? true,
    };
  }

  private async assertLocalityExists(localityId: string): Promise<void> {
    const found = await this.prisma.locality.count({ where: { id: localityId } });
    if (found === 0) throw new BadRequestException(`Locality ${localityId} not found`);
  }
}
