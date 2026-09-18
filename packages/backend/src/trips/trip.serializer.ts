import { Trip, TripCrewMember, TripStatus, TripStop, TripStopDwell, TripStopKind, TripStopWalkInput } from '@redinfo/shared';
import { CertificationType } from '@prisma/client';
import { toIsoDate } from '../utils/date.util';

export type TripRow = {
  id: string;
  date: Date;
  vehicleId: string;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeTrip(row: TripRow): Trip {
  return {
    id: row.id,
    date: toIsoDate(row.date),
    vehicleId: row.vehicleId,
    status: row.status as TripStatus,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type TripCrewMemberRow = {
  id: string;
  tripId: string;
  userId: string;
  role: CertificationType;
  overrideReason: string | null;
  createdAt: Date;
};

export function serializeTripCrewMember(row: TripCrewMemberRow): TripCrewMember {
  return {
    id: row.id,
    tripId: row.tripId,
    userId: row.userId,
    role: row.role as never,
    overrideReason: row.overrideReason,
    createdAt: row.createdAt.toISOString(),
  };
}

export type TripStopRow = {
  id: string;
  tripId: string;
  sequence: number;
  kind: string;
  transportLegId: string | null;
  facilityId: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  plannedAt: Date;
  actualAt: Date | null;
  dwellDecision: string | null;
  dwellMinutes: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeTripStop(row: TripStopRow): TripStop {
  return {
    id: row.id,
    tripId: row.tripId,
    sequence: row.sequence,
    kind: row.kind as TripStopKind,
    transportLegId: row.transportLegId,
    facilityId: row.facilityId,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    plannedAt: row.plannedAt.toISOString(),
    actualAt: row.actualAt ? row.actualAt.toISOString() : null,
    dwellDecision: row.dwellDecision as TripStopDwell | null,
    dwellMinutes: row.dwellMinutes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** A stop row reduced to what `walkTripStops`/`checkTripCapacity` need —
 * shared by `TripStopsService` (checking a candidate stop set before
 * committing it) and `TripPlacementSuggestionsService` (checking one it will
 * never commit at all). */
export function toWalkInput(stop: TripStopRow): TripStopWalkInput {
  return {
    id: stop.id,
    sequence: stop.sequence,
    kind: stop.kind as TripStopKind,
    transportLegId: stop.transportLegId,
    plannedAt: stop.plannedAt.toISOString(),
    dwellMinutes: stop.dwellMinutes,
  };
}
