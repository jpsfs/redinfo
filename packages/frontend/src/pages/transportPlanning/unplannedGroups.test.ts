import { describe, expect, it } from 'vitest';
import { LegDirection, PatientMobility, TransportPlanningLeg } from '@redinfo/shared';
import { groupDemand, groupFeasibility, groupUnplannedLegs } from './unplannedGroups';

const FACILITY_A = { id: 'fac-a', name: 'Clínica de Hemodiálise de Barcelos' };
const FACILITY_B = { id: 'fac-b', name: 'Hospital de Braga' };

const leg = (id: string, overrides: Record<string, unknown> = {}): TransportPlanningLeg =>
  ({
    id,
    transportRequestId: `req-${id}`,
    treatmentPlanId: null,
    date: '2026-09-16',
    generatedForDate: '2026-09-16',
    direction: LegDirection.OUTBOUND,
    originAddress: null,
    originLatitude: null,
    originLongitude: null,
    originFacilityId: null,
    originFacility: null,
    destinationAddress: null,
    destinationLatitude: null,
    destinationLongitude: null,
    destinationFacilityId: FACILITY_A.id,
    destinationFacility: FACILITY_A,
    plannedPickupAt: null,
    plannedDropoffAt: null,
    actualPickupAt: null,
    actualDropoffAt: null,
    status: 'PLANNED',
    cancellationReason: null,
    cancellationSource: null,
    estimatedEndAt: null,
    estimatedEndSource: null,
    appointmentAt: '2026-09-16T12:00:00.000Z',
    effectiveEstimatedEndAt: '2026-09-16T13:00:00.000Z',
    arrivalWindowWarning: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    patientId: `pat-${id}`,
    patientMobility: PatientMobility.AMBULATORY,
    travelMinutes: null,
    travelEstimated: false,
    travelDistanceMeters: null,
    suggested: { pickupAt: null, dropoffAt: null },
    ...overrides,
  }) as TransportPlanningLeg;

describe('groupUnplannedLegs', () => {
  it('groups two appointments at the same facility within 15 minutes of each other', () => {
    const legsById = {
      a: leg('a', { appointmentAt: '2026-09-16T12:00:00.000Z' }),
      b: leg('b', { appointmentAt: '2026-09-16T12:10:00.000Z' }),
    };
    const groups = groupUnplannedLegs(['a', 'b'], legsById);
    expect(groups).toHaveLength(1);
    expect(groups[0].legIds).toEqual(['a', 'b']);
  });

  it('keeps a different destination as its own group', () => {
    const legsById = {
      a: leg('a', { destinationFacility: FACILITY_A, destinationFacilityId: FACILITY_A.id }),
      b: leg('b', { destinationFacility: FACILITY_B, destinationFacilityId: FACILITY_B.id }),
    };
    const groups = groupUnplannedLegs(['a', 'b'], legsById);
    expect(groups).toHaveLength(2);
  });

  it('keeps outbound and return apart even at the same facility and time', () => {
    const legsById = {
      a: leg('a', { direction: LegDirection.OUTBOUND }),
      b: leg('b', { direction: LegDirection.RETURN, originFacility: FACILITY_A, originFacilityId: FACILITY_A.id }),
    };
    const groups = groupUnplannedLegs(['a', 'b'], legsById);
    expect(groups).toHaveLength(2);
  });

  it('sorts groups by their earliest arrival instant', () => {
    const legsById = {
      late: leg('late', { appointmentAt: '2026-09-16T14:00:00.000Z', destinationFacility: FACILITY_B, destinationFacilityId: FACILITY_B.id }),
      early: leg('early', { appointmentAt: '2026-09-16T08:00:00.000Z' }),
    };
    const groups = groupUnplannedLegs(['late', 'early'], legsById);
    expect(groups.map((g) => g.legIds[0])).toEqual(['early', 'late']);
  });

  it('skips a leg id the lookup does not know about', () => {
    const groups = groupUnplannedLegs(['missing'], {});
    expect(groups).toEqual([]);
  });
});

describe('groupDemand', () => {
  it('sums each mobility into its own position type', () => {
    const legsById = {
      a: leg('a', { patientMobility: PatientMobility.WHEELCHAIR }),
      b: leg('b', { patientMobility: PatientMobility.WHEELCHAIR }),
      c: leg('c', { patientMobility: PatientMobility.AMBULATORY }),
    };
    const group = groupUnplannedLegs(['a', 'b', 'c'], legsById)[0];
    expect(groupDemand(group, legsById)).toEqual({ seats: 1, wheelchairPositions: 2, stretcherPositions: 0 });
  });
});

describe('groupFeasibility', () => {
  const VEHICLE = { seatedCapacity: 3, wheelchairPositions: 1, stretcherPositions: 0 } as never;

  it('fits when at least one vehicle on the board could take the whole group empty', () => {
    expect(groupFeasibility({ seats: 2, wheelchairPositions: 1, stretcherPositions: 0 }, [VEHICLE])).toEqual({
      fits: true,
    });
  });

  it('flags the dimension nothing on the board can cover, by name', () => {
    expect(groupFeasibility({ seats: 0, wheelchairPositions: 2, stretcherPositions: 0 }, [VEHICLE])).toEqual({
      fits: false,
      reason: 'WHEELCHAIR',
    });
  });

  it('says nothing is wrong when there is no fleet on the board yet to check against', () => {
    expect(groupFeasibility({ seats: 1, wheelchairPositions: 0, stretcherPositions: 0 }, [])).toEqual({ fits: true });
  });
});
