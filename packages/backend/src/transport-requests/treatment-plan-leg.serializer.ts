import { LegCancellationSource, LegDirection, LegStatus, TransportLeg, TreatmentPlan } from '@redinfo/shared';
import { toIsoDate } from '../utils/date.util';
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

export const TRANSPORT_LEG_INCLUDE = { originFacility: true, destinationFacility: true } as const;

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
  tripStopId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeTransportLeg(row: TransportLegRow): TransportLeg {
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
    plannedDropoffAt: row.plannedDropoffAt ? row.plannedDropoffAt.toISOString() : null,
    actualPickupAt: row.actualPickupAt ? row.actualPickupAt.toISOString() : null,
    actualDropoffAt: row.actualDropoffAt ? row.actualDropoffAt.toISOString() : null,
    status: row.status as LegStatus,
    cancellationReason: row.cancellationReason,
    cancellationSource: row.cancellationSource as LegCancellationSource | null,
    tripStopId: row.tripStopId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
