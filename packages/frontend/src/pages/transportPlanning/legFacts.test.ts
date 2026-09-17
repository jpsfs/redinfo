import { describe, expect, it } from 'vitest';
import { LegDirection, PatientMobility, TransportPlanningLeg, TripStopKind } from '@redinfo/shared';
import { stopLocationLabel } from './legFacts';

const FACILITY = { id: 'fac-1', name: 'Clínica de Hemodiálise de Barcelos' };
const HOME_ADDRESS = 'Rua das Flores, 12, Barcelos';

function leg(overrides: Partial<TransportPlanningLeg> = {}): TransportPlanningLeg {
  return {
    id: 'leg-1',
    transportRequestId: 'req-1',
    treatmentPlanId: null,
    date: '2026-09-16',
    generatedForDate: '2026-09-16',
    direction: LegDirection.OUTBOUND,
    originAddress: HOME_ADDRESS,
    originLatitude: 41.53,
    originLongitude: -8.62,
    originFacilityId: null,
    originFacility: null,
    destinationAddress: null,
    destinationLatitude: null,
    destinationLongitude: null,
    destinationFacilityId: FACILITY.id,
    destinationFacility: FACILITY as never,
    plannedPickupAt: null,
    plannedDropoffAt: null,
    actualPickupAt: null,
    actualDropoffAt: null,
    status: 'PLANNED' as never,
    cancellationReason: null,
    cancellationSource: null,
    estimatedEndAt: null,
    estimatedEndSource: null,
    appointmentAt: '2026-09-16T09:00:00.000Z',
    effectiveEstimatedEndAt: '2026-09-16T10:30:00.000Z',
    arrivalWindowWarning: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    patientId: 'pat-1',
    patientMobility: PatientMobility.AMBULATORY,
    travelMinutes: 30,
    travelEstimated: false,
    travelDistanceMeters: 12_000,
    suggested: { pickupAt: null, dropoffAt: null },
    door: { origin: null, destination: null },
    ...overrides,
  };
}

const stop = (overrides: Partial<{ kind: TripStopKind }> = {}) =>
  ({
    id: 'stop-1',
    tripId: 'trip-1',
    sequence: 1,
    kind: TripStopKind.PICKUP,
    transportLegId: 'leg-1',
    facilityId: null,
    address: null,
    latitude: null,
    longitude: null,
    plannedAt: '2026-09-16T08:00:00.000Z',
    actualAt: null,
    dwellDecision: null,
    dwellMinutes: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }) as never;

describe('stopLocationLabel', () => {
  it('names the patient\'s own home for an outbound leg\'s pickup, not the facility it is bound for', () => {
    const outbound = leg();
    expect(stopLocationLabel(stop({ kind: TripStopKind.PICKUP }), outbound)).toBe(HOME_ADDRESS);
  });

  it('names the facility for an outbound leg\'s dropoff', () => {
    const outbound = leg();
    expect(stopLocationLabel(stop({ kind: TripStopKind.DROPOFF }), outbound)).toBe(FACILITY.name);
  });

  it('names the facility for a return leg\'s pickup — the patient is collected there, not at home', () => {
    const inbound = leg({
      direction: LegDirection.RETURN,
      originFacilityId: FACILITY.id,
      originFacility: FACILITY as never,
      originAddress: null,
      destinationFacilityId: null,
      destinationFacility: null,
      destinationAddress: HOME_ADDRESS,
    });
    expect(stopLocationLabel(stop({ kind: TripStopKind.PICKUP }), inbound)).toBe(FACILITY.name);
  });

  it('names the patient\'s own home for a return leg\'s dropoff', () => {
    const inbound = leg({
      direction: LegDirection.RETURN,
      originFacilityId: FACILITY.id,
      originFacility: FACILITY as never,
      originAddress: null,
      destinationFacilityId: null,
      destinationFacility: null,
      destinationAddress: HOME_ADDRESS,
    });
    expect(stopLocationLabel(stop({ kind: TripStopKind.DROPOFF }), inbound)).toBe(HOME_ADDRESS);
  });

  it('is blank for a WAIT/RETURN_TO_BASE stop or a stop with no leg', () => {
    expect(stopLocationLabel(stop({ kind: TripStopKind.WAIT }), leg())).toBeNull();
    expect(stopLocationLabel(stop({ kind: TripStopKind.PICKUP }), undefined)).toBeNull();
  });
});
