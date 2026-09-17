import { Prisma } from '@prisma/client';
import { Patient, PatientIdentity, PatientMobility } from '@redinfo/shared';
import { serializeLocality } from '../geography/geography.service';

const PERSON_SELECT = { select: { id: true, firstName: true, lastName: true } } as const;

/**
 * Every column except the sealed blob — what a caller without
 * `VIEW_PATIENT_IDENTITY` is read with, so there is nothing to leak by
 * accident: not through a log line, not through a debugger, not through a
 * future serializer that forgets. The type is what enforces it; this list is
 * why. Mirrors `LIVE_RUN_BOARD_SELECT`'s "omitted by construction" precedent.
 */
export const PATIENT_SELECT = {
  id: true,
  identityPurgedAt: true,
  mobility: true,
  needsOxygen: true,
  escortRequired: true,
  isBariatric: true,
  defaultLatitude: true,
  defaultLongitude: true,
  localityId: true,
  locality: { include: { municipality: true } },
  referenceContactIsOrganisation: true,
  contactAuthorisationRecorded: true,
  contactAuthorisationNote: true,
  isActive: true,
  createdById: true,
  createdBy: PERSON_SELECT,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PatientSelect;

/** `PATIENT_SELECT` plus the ciphertext column, for a caller who holds `VIEW_PATIENT_IDENTITY`. */
export const PATIENT_SELECT_WITH_IDENTITY = {
  ...PATIENT_SELECT,
  identity: true,
} satisfies Prisma.PatientSelect;

export type PatientRow = Prisma.PatientGetPayload<{ select: typeof PATIENT_SELECT }>;
export type PatientRowWithIdentity = Prisma.PatientGetPayload<{
  select: typeof PATIENT_SELECT_WITH_IDENTITY;
}>;

const iso = (value: Date | null): string | null => value?.toISOString() ?? null;

/**
 * What the sealed blob turned into, if it was opened at all — same three
 * normal outcomes as `OpenedIdentity` (live-runs): never had it, present but
 * unreadable (`identityUnavailable`, a state and not an exception), or opened.
 */
export interface OpenedPatientIdentity {
  identity?: PatientIdentity | null;
  identityUnavailable?: boolean;
}

/**
 * A patient as `MANAGE_PATIENTS` reads it.
 *
 * `identity` and `identityUnavailable` are passed in rather than decrypted
 * here — opening the blob needs a key, and a serializer must stay a pure
 * function of a row, the same reason `serializeLiveRun` takes `opened` rather
 * than resolving it. Both keys are omitted from the object entirely — not
 * merely `null` — when `canSeeIdentity` is false, so a caller without
 * `VIEW_PATIENT_IDENTITY` cannot tell a purged patient from one who was never
 * sealed in the first place, let alone see the blob itself.
 */
export function serializePatient(
  row: PatientRow | PatientRowWithIdentity,
  canSeeIdentity: boolean,
  opened: OpenedPatientIdentity = {},
): Patient {
  return {
    id: row.id,
    mobility: row.mobility as PatientMobility,
    needsOxygen: row.needsOxygen,
    escortRequired: row.escortRequired,
    isBariatric: row.isBariatric,
    defaultLatitude: row.defaultLatitude,
    defaultLongitude: row.defaultLongitude,
    localityId: row.localityId,
    ...(row.locality ? { locality: serializeLocality(row.locality) } : {}),
    referenceContactIsOrganisation: row.referenceContactIsOrganisation,
    contactAuthorisationRecorded: row.contactAuthorisationRecorded,
    contactAuthorisationNote: row.contactAuthorisationNote,
    isActive: row.isActive,
    ...(canSeeIdentity ? { identity: opened.identity ?? null } : {}),
    ...(canSeeIdentity && opened.identityUnavailable ? { identityUnavailable: true } : {}),
    identityPurgedAt: iso(row.identityPurgedAt),
    createdById: row.createdById,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
