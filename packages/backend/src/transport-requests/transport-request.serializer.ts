import {
  Agreement,
  Facility,
  Organisation,
  TransportRequest,
  TransportRequestDecision,
  TransportRequestOccurrenceType,
  TransportRequestVehicleType,
  minutesUntilResponseDue,
} from '@redinfo/shared';

const ORGANISATION_SELECT = {
  select: {
    id: true,
    name: true,
    taxId: true,
    contactEmail: true,
    contactPhone: true,
    isRequester: true,
    isPayer: true,
    notes: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
  },
} as const;

export const TRANSPORT_REQUEST_INCLUDE = {
  requestingOrganisation: ORGANISATION_SELECT,
  payingOrganisation: ORGANISATION_SELECT,
  agreement: true,
  destinationFacility: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

type OrganisationRow = {
  id: string;
  name: string;
  taxId: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  isRequester: boolean;
  isPayer: boolean;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function serializeOrganisationRef(row: OrganisationRow): Organisation {
  return {
    id: row.id,
    name: row.name,
    taxId: row.taxId,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    isRequester: row.isRequester,
    isPayer: row.isPayer,
    notes: row.notes,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type AgreementRow = {
  id: string;
  payerOrganisationId: string;
  name: string;
  externalReference: string | null;
  validFrom: Date;
  validTo: Date | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function serializeAgreementRef(row: AgreementRow): Agreement {
  return {
    id: row.id,
    payerOrganisationId: row.payerOrganisationId,
    name: row.name,
    externalReference: row.externalReference,
    validFrom: row.validFrom.toISOString().slice(0, 10),
    validTo: row.validTo ? row.validTo.toISOString().slice(0, 10) : null,
    notes: row.notes,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type FacilityRow = {
  id: string;
  name: string;
  municipalityId: string;
  addressLine: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  isEmergencyDestination: boolean;
  isTransportDestination: boolean;
  isActive: boolean;
  arrivalWindowEarliestMinutesOverride: number | null;
  arrivalWindowLatestMinutesOverride: number | null;
  arrivalToleranceMinutesOverride: number | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Exported so `treatment-plan-leg.serializer.ts` (#230) doesn't duplicate
 * this shape — a leg/plan reuses the same `Facility` reference-serialization
 * this module already had for `TransportRequest.destinationFacility`. Also
 * `resolveArrivalWindowThresholds`'s override input (#233): its 3 fields are
 * a subset of this one, read straight off the row. */
export function serializeFacilityRef(row: FacilityRow): Facility {
  return {
    id: row.id,
    name: row.name,
    municipalityId: row.municipalityId,
    addressLine: row.addressLine,
    postalCode: row.postalCode,
    latitude: row.latitude,
    longitude: row.longitude,
    isEmergencyDestination: row.isEmergencyDestination,
    isTransportDestination: row.isTransportDestination,
    isActive: row.isActive,
    arrivalWindowEarliestMinutesOverride: row.arrivalWindowEarliestMinutesOverride,
    arrivalWindowLatestMinutesOverride: row.arrivalWindowLatestMinutesOverride,
    arrivalToleranceMinutesOverride: row.arrivalToleranceMinutesOverride,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type TransportRequestRow = {
  id: string;
  batchReference: string;
  communicatedAt: Date;
  requesterAccountCode: string;
  responseDueAt: Date;
  externalServiceNumber: string;
  appointmentAt: Date;
  requestingOrganisationId: string;
  requestingOrganisation?: OrganisationRow | null;
  payingOrganisationId: string;
  payingOrganisation?: OrganisationRow | null;
  agreementId: string | null;
  agreement?: AgreementRow | null;
  patientId: string;
  occurrenceType: string;
  requestedVehicleType: string;
  escortTravels: boolean;
  isRoundTrip: boolean;
  originAddress: string;
  originLatitude: number | null;
  originLongitude: number | null;
  destinationFacilityId: string;
  destinationFacility?: FacilityRow | null;
  freeTextMessage: string | null;
  coordColumnValue: string | null;
  decision: string;
  decidedByUserId: string | null;
  decidedAt: Date | null;
  rejectionReason: string | null;
  externallyRegisteredAt: Date | null;
  createdById: string;
  createdBy?: { id: string; firstName: string; lastName: string } | null;
  createdAt: Date;
  updatedAt: Date;
};

/** `now` is a parameter, not `new Date()` inline, so a test can pin it and
 * assert `minutesUntilResponseDue` deterministically. */
export function serializeTransportRequest(row: TransportRequestRow, now: Date = new Date()): TransportRequest {
  return {
    id: row.id,
    batchReference: row.batchReference,
    communicatedAt: row.communicatedAt.toISOString(),
    requesterAccountCode: row.requesterAccountCode,
    responseDueAt: row.responseDueAt.toISOString(),
    externalServiceNumber: row.externalServiceNumber,
    appointmentAt: row.appointmentAt.toISOString(),
    requestingOrganisationId: row.requestingOrganisationId,
    ...(row.requestingOrganisation ? { requestingOrganisation: serializeOrganisationRef(row.requestingOrganisation) } : {}),
    payingOrganisationId: row.payingOrganisationId,
    ...(row.payingOrganisation ? { payingOrganisation: serializeOrganisationRef(row.payingOrganisation) } : {}),
    agreementId: row.agreementId,
    ...(row.agreement ? { agreement: serializeAgreementRef(row.agreement) } : {}),
    patientId: row.patientId,
    occurrenceType: row.occurrenceType as TransportRequestOccurrenceType,
    requestedVehicleType: row.requestedVehicleType as TransportRequestVehicleType,
    escortTravels: row.escortTravels,
    isRoundTrip: row.isRoundTrip,
    originAddress: row.originAddress,
    originLatitude: row.originLatitude,
    originLongitude: row.originLongitude,
    destinationFacilityId: row.destinationFacilityId,
    ...(row.destinationFacility ? { destinationFacility: serializeFacilityRef(row.destinationFacility) } : {}),
    freeTextMessage: row.freeTextMessage,
    coordColumnValue: row.coordColumnValue,
    decision: row.decision as TransportRequestDecision,
    decidedByUserId: row.decidedByUserId,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    rejectionReason: row.rejectionReason,
    externallyRegisteredAt: row.externallyRegisteredAt ? row.externallyRegisteredAt.toISOString() : null,
    minutesUntilResponseDue: minutesUntilResponseDue(row.responseDueAt.toISOString(), now),
    createdById: row.createdById,
    ...(row.createdBy ? { createdBy: row.createdBy } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
