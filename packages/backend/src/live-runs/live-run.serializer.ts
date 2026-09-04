import { Prisma } from '@prisma/client';
import {
  EventLocationType,
  Gender,
  LiveRun,
  LiveRunBoardEntry,
  LiveRunCapture,
  LiveRunCrewMember,
  LiveRunState,
  VictimDestinationKind,
} from '@redinfo/shared';
import { toIsoDate } from '../utils/date.util';
import { serializeLocality } from '../geography/geography.service';

const PERSON_SELECT = { select: { id: true, firstName: true, lastName: true } } as const;

/**
 * Everything a run is read with — **including** the ciphertext column.
 *
 * Used by the two paths where one person reads one run of their own. The
 * coordinator's board deliberately does not use this: see
 * `LIVE_RUN_BOARD_SELECT`.
 */
export const LIVE_RUN_INCLUDE = {
  locality: { include: { municipality: true } },
  destinationHospital: { select: { id: true, name: true } },
  crew: {
    include: { user: PERSON_SELECT },
    orderBy: { position: 'asc' },
  },
  createdBy: PERSON_SELECT,
} satisfies Prisma.LiveRunInclude;

export type LiveRunRow = Prisma.LiveRunGetPayload<{ include: typeof LIVE_RUN_INCLUDE }>;

/**
 * The board's projection, which **omits `identity` entirely**.
 *
 * A `select` rather than an `include` with the column nulled afterwards: a board
 * request never loads the ciphertext, so there is nothing to leak by accident —
 * not through a log line, not through a debugger, not through a future
 * `serialize` that forgets. The type is what enforces it; this list is why.
 */
export const LIVE_RUN_BOARD_SELECT = {
  id: true,
  state: true,
  startedAt: true,
  externalReference: true,
  chiefComplaint: true,
  victimGender: true,
  victimAge: true,
  vehicleId: true,
  activationAt: true,
  sceneArrivalAt: true,
  sceneDepartureAt: true,
  hospitalArrivalAt: true,
  availableAt: true,
  destinationKind: true,
  updatedAt: true,
  locality: { select: { id: true, name: true } },
  destinationHospital: { select: { id: true, name: true } },
  crew: {
    select: { userId: true, roleName: true, position: true, user: PERSON_SELECT },
    orderBy: { position: 'asc' },
  },
} satisfies Prisma.LiveRunSelect;

export type LiveRunBoardRow = Prisma.LiveRunGetPayload<{
  select: typeof LIVE_RUN_BOARD_SELECT;
}>;

const iso = (value: Date | null): string | null => value?.toISOString() ?? null;

function serializeCrewMember(row: {
  userId: string;
  roleName: string | null;
  position: number;
  user?: { id: string; firstName: string; lastName: string } | null;
}): LiveRunCrewMember {
  return {
    userId: row.userId,
    ...(row.user ? { user: row.user } : {}),
    roleName: row.roleName,
    position: row.position,
  };
}

/**
 * What the identity blob turned into, if anything.
 *
 * Three outcomes, all of them normal: the run never had identity, it had it and
 * it was purged, or it has it and we could open it. The fourth — the blob is
 * there and no key opens it — is `identityUnavailable`, not an exception: a key
 * retired an hour early must not take the board down.
 */
export interface OpenedIdentity {
  identity?: LiveRun['identity'];
  identityUnavailable?: boolean;
}

/**
 * A run as its own crew reads it.
 *
 * `identity` is passed in rather than decrypted here, because opening the blob
 * needs a key and a serializer must stay a pure function of a row — the same
 * reason `serializeEventReport` takes `shiftLabel` rather than resolving it.
 */
export function serializeLiveRun(row: LiveRunRow, opened: OpenedIdentity = {}): LiveRun {
  return {
    id: row.id,
    revision: row.revision,
    state: row.state as LiveRunState,
    startedAt: row.startedAt.toISOString(),

    externalReference: row.externalReference,
    chiefComplaint: row.chiefComplaint,
    locationType: (row.locationType as EventLocationType | null) ?? null,
    localityId: row.localityId,
    ...(row.locality ? { locality: serializeLocality(row.locality) } : {}),
    victimGender: (row.victimGender as Gender | null) ?? null,
    victimAge: row.victimAge,
    vehicleId: row.vehicleId,

    crew: row.crew.map(serializeCrewMember),
    shift:
      row.scheduleId && row.shiftDate && row.shiftSlot !== null
        ? {
            scheduleId: row.scheduleId,
            date: toIsoDate(row.shiftDate),
            slot: row.shiftSlot,
          }
        : null,

    activationAt: iso(row.activationAt),
    sceneArrivalAt: iso(row.sceneArrivalAt),
    sceneDepartureAt: iso(row.sceneDepartureAt),
    hospitalArrivalAt: iso(row.hospitalArrivalAt),
    availableAt: iso(row.availableAt),

    destinationKind: (row.destinationKind as VictimDestinationKind | null) ?? null,
    destinationHospitalId: row.destinationHospitalId,
    destinationHospital: row.destinationHospital,
    hospitalEpisodeNumber: row.hospitalEpisodeNumber,

    capture: (row.capture as LiveRunCapture | null) ?? null,
    identity: opened.identity ?? null,
    ...(opened.identityUnavailable ? { identityUnavailable: true } : {}),
    identityPurgedAt: iso(row.identityPurgedAt),

    closedAt: iso(row.closedAt),
    reportId: row.reportId,

    createdById: row.createdById,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** A run as the coordinator's board reads it. No identity, by construction. */
export function serializeLiveRunBoardEntry(row: LiveRunBoardRow): LiveRunBoardEntry {
  return {
    id: row.id,
    state: row.state as LiveRunState,
    startedAt: row.startedAt.toISOString(),
    externalReference: row.externalReference,
    chiefComplaint: row.chiefComplaint,
    locality: row.locality,
    victimGender: (row.victimGender as Gender | null) ?? null,
    victimAge: row.victimAge,
    crew: row.crew.map(serializeCrewMember),
    vehicleId: row.vehicleId,
    activationAt: iso(row.activationAt),
    sceneArrivalAt: iso(row.sceneArrivalAt),
    sceneDepartureAt: iso(row.sceneDepartureAt),
    hospitalArrivalAt: iso(row.hospitalArrivalAt),
    availableAt: iso(row.availableAt),
    destinationKind: (row.destinationKind as VictimDestinationKind | null) ?? null,
    destinationHospital: row.destinationHospital,
    updatedAt: row.updatedAt.toISOString(),
  };
}
