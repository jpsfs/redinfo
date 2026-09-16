import {
  ArrivalWindowThresholds,
  EstimatedEndSource,
  LegCancellationSource,
  LegDirection,
  LegStatus,
  OccurrenceTypePolicyInput,
  TransportLeg,
  TransportRequestOccurrenceType,
  TreatmentPlan,
  arrivalWindowWarning,
  resolveArrivalWindowThresholds,
  resolveEstimatedEnd,
} from '@redinfo/shared';
import { toIsoDate } from '../utils/date.util';
import { shiftBoundaryToInstant } from '../utils/timezone.util';
import { FacilityRow, serializeFacilityRef } from './transport-request.serializer';

export const TREATMENT_PLAN_INCLUDE = { destinationFacility: true } as const;

export type TreatmentPlanRow = {
  id: string;
  transportRequestId: string;
  destinationFacilityId: string;
  destinationFacility?: FacilityRow | null;
  daysOfWeek: number[];
  treatmentStartTime: string;
  treatmentEndTime: string | null;
  validFrom: Date;
  validTo: Date;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeTreatmentPlan(row: TreatmentPlanRow): TreatmentPlan {
  return {
    id: row.id,
    transportRequestId: row.transportRequestId,
    destinationFacilityId: row.destinationFacilityId,
    ...(row.destinationFacility ? { destinationFacility: serializeFacilityRef(row.destinationFacility) } : {}),
    daysOfWeek: row.daysOfWeek,
    treatmentStartTime: row.treatmentStartTime,
    treatmentEndTime: row.treatmentEndTime,
    validFrom: toIsoDate(row.validFrom),
    validTo: toIsoDate(row.validTo),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const TRANSPORT_LEG_INCLUDE = {
  originFacility: true,
  destinationFacility: true,
  transportRequest: { select: { occurrenceType: true, appointmentAt: true } },
  treatmentPlan: { select: { treatmentStartTime: true } },
} as const;

export type TransportLegRow = {
  id: string;
  transportRequestId: string;
  treatmentPlanId: string | null;
  date: Date;
  generatedForDate: Date;
  direction: string;
  originAddress: string | null;
  originLatitude: number | null;
  originLongitude: number | null;
  originFacilityId: string | null;
  originFacility?: FacilityRow | null;
  destinationAddress: string | null;
  destinationLatitude: number | null;
  destinationLongitude: number | null;
  destinationFacilityId: string | null;
  destinationFacility?: FacilityRow | null;
  plannedPickupAt: Date | null;
  plannedDropoffAt: Date | null;
  actualPickupAt: Date | null;
  actualDropoffAt: Date | null;
  status: string;
  cancellationReason: string | null;
  cancellationSource: string | null;
  estimatedEndAt: Date | null;
  estimatedEndSource: string | null;
  createdAt: Date;
  updatedAt: Date;
  transportRequest: { occurrenceType: string; appointmentAt: Date };
  treatmentPlan?: { treatmentStartTime: string } | null;
};

/** A leg's own appointment instant (#233) — `TreatmentPlan.treatmentStartTime`
 * (a recurring `HH:mm` wall clock) combined with the leg's own `date` for a
 * plan-generated leg, or the referral's `appointmentAt` directly for a
 * one-off. `shiftBoundaryToInstant` is DST-aware the same way a shift
 * boundary is — see its own doc comment. */
function resolveAppointmentInstant(row: TransportLegRow): string {
  if (row.treatmentPlan) {
    const [hours, minutes] = row.treatmentPlan.treatmentStartTime.split(':').map(Number);
    return shiftBoundaryToInstant(toIsoDate(row.date), hours * 60 + minutes).toISOString();
  }
  return row.transportRequest.appointmentAt.toISOString();
}

/** The config a leg needs to resolve its own effective policy — batch-loaded
 * once by the caller (`TransportRequestLegsService`), never per row. */
export interface LegPolicyContext {
  policies: Record<TransportRequestOccurrenceType, OccurrenceTypePolicyInput>;
  thresholds: ArrivalWindowThresholds;
}

export function serializeTransportLeg(row: TransportLegRow, context: LegPolicyContext): TransportLeg {
  const estimatedEndAt = row.estimatedEndAt ? row.estimatedEndAt.toISOString() : null;
  const plannedDropoffAt = row.plannedDropoffAt ? row.plannedDropoffAt.toISOString() : null;
  const occurrenceType = row.transportRequest.occurrenceType as TransportRequestOccurrenceType;
  const appointmentAt = resolveAppointmentInstant(row);
  const effectiveThresholds = resolveArrivalWindowThresholds(context.thresholds, row.destinationFacility);

  return {
    id: row.id,
    transportRequestId: row.transportRequestId,
    treatmentPlanId: row.treatmentPlanId,
    date: toIsoDate(row.date),
    generatedForDate: toIsoDate(row.generatedForDate),
    direction: row.direction as LegDirection,
    originAddress: row.originAddress,
    originLatitude: row.originLatitude,
    originLongitude: row.originLongitude,
    originFacilityId: row.originFacilityId,
    ...(row.originFacility ? { originFacility: serializeFacilityRef(row.originFacility) } : {}),
    destinationAddress: row.destinationAddress,
    destinationLatitude: row.destinationLatitude,
    destinationLongitude: row.destinationLongitude,
    destinationFacilityId: row.destinationFacilityId,
    ...(row.destinationFacility ? { destinationFacility: serializeFacilityRef(row.destinationFacility) } : {}),
    plannedPickupAt: row.plannedPickupAt ? row.plannedPickupAt.toISOString() : null,
    plannedDropoffAt,
    actualPickupAt: row.actualPickupAt ? row.actualPickupAt.toISOString() : null,
    actualDropoffAt: row.actualDropoffAt ? row.actualDropoffAt.toISOString() : null,
    status: row.status as LegStatus,
    cancellationReason: row.cancellationReason,
    cancellationSource: row.cancellationSource as LegCancellationSource | null,
    estimatedEndAt,
    estimatedEndSource: row.estimatedEndSource as EstimatedEndSource | null,
    appointmentAt,
    effectiveEstimatedEndAt: resolveEstimatedEnd(appointmentAt, occurrenceType, context.policies, { estimatedEndAt }),
    arrivalWindowWarning:
      row.direction === LegDirection.OUTBOUND && plannedDropoffAt
        ? arrivalWindowWarning(plannedDropoffAt, appointmentAt, effectiveThresholds)
        : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
