import {
  DEFAULT_ARRIVAL_WINDOW_THRESHOLDS,
  LegDirection,
  TransportLeg,
  suggestLegTimes,
  targetArrivalAt,
} from '@redinfo/shared';
import { TripLegTravelService } from './trip-leg-travel.service';

const THRESHOLDS = DEFAULT_ARRIVAL_WINDOW_THRESHOLDS;

/** The patient's own geocoded home point and the locality its corridor is
 * keyed by — both unsealed columns on `Patient`. */
const PATIENT = { localityId: 'loc-1', latitude: 41.53, longitude: -8.62 };

const leg = (overrides: Partial<TransportLeg> = {}): TransportLeg =>
  ({
    id: 'leg-1',
    transportRequestId: 'req-1',
    treatmentPlanId: null,
    date: '2026-09-15',
    generatedForDate: '2026-09-15',
    direction: LegDirection.OUTBOUND,
    originAddress: 'Rua A, 1',
    originLatitude: 41.53,
    originLongitude: -8.62,
    originFacilityId: null,
    destinationAddress: null,
    destinationLatitude: 41.18,
    destinationLongitude: -8.6,
    destinationFacilityId: 'fac-1',
    plannedPickupAt: null,
    plannedDropoffAt: null,
    actualPickupAt: null,
    actualDropoffAt: null,
    status: 'PLANNED',
    cancellationReason: null,
    cancellationSource: null,
    estimatedEndAt: null,
    estimatedEndSource: null,
    appointmentAt: '2026-09-15T09:00:00.000Z',
    effectiveEstimatedEndAt: '2026-09-15T10:30:00.000Z',
    arrivalWindowWarning: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }) as TransportLeg;

function serviceWith(plan: jest.Mock) {
  return new TripLegTravelService({ planBetweenPoints: plan } as never);
}

const planned = (durationSeconds: number, estimated = false) => ({
  durationSeconds,
  distanceMeters: 30_000,
  estimated,
  corridorFactor: 1,
  corridorFactorSource: null,
});

describe('targetArrivalAt', () => {
  it('aims at the midpoint of the preferred window, not at either bound', () => {
    // Defaults are 30 and 5 minutes before, so the midpoint is 17.5.
    expect(targetArrivalAt('2026-09-15T09:00:00.000Z', THRESHOLDS)).toBe('2026-09-15T08:42:30.000Z');
  });

  it('leaves slack on both sides, so a small delay is not instantly a late arrival', () => {
    const arrival = new Date(targetArrivalAt('2026-09-15T09:00:00.000Z', THRESHOLDS));
    const minutesBefore = (new Date('2026-09-15T09:00:00.000Z').getTime() - arrival.getTime()) / 60_000;
    expect(minutesBefore).toBeLessThan(THRESHOLDS.arrivalWindowEarliestMinutes);
    expect(minutesBefore).toBeGreaterThan(THRESHOLDS.arrivalWindowLatestMinutes);
  });
});

describe('suggestLegTimes', () => {
  it('builds an outbound backwards from the appointment — the hard constraint', () => {
    const times = suggestLegTimes({
      direction: LegDirection.OUTBOUND,
      appointmentAt: '2026-09-15T09:00:00.000Z',
      effectiveEstimatedEndAt: '2026-09-15T10:30:00.000Z',
      travelMinutes: 45,
      thresholds: THRESHOLDS,
    });
    expect(times.dropoffAt).toBe('2026-09-15T08:42:30.000Z');
    expect(times.pickupAt).toBe('2026-09-15T07:57:30.000Z');
  });

  it('builds a return forwards from the estimated end — the patient cannot leave before they are ready', () => {
    const times = suggestLegTimes({
      direction: LegDirection.RETURN,
      appointmentAt: '2026-09-15T09:00:00.000Z',
      effectiveEstimatedEndAt: '2026-09-15T10:30:00.000Z',
      travelMinutes: 45,
      thresholds: THRESHOLDS,
    });
    expect(times.pickupAt).toBe('2026-09-15T10:30:00.000Z');
    expect(times.dropoffAt).toBe('2026-09-15T11:15:00.000Z');
  });

  it('returns nothing rather than a fabricated time when the leg cannot be routed', () => {
    expect(
      suggestLegTimes({
        direction: LegDirection.OUTBOUND,
        appointmentAt: '2026-09-15T09:00:00.000Z',
        effectiveEstimatedEndAt: '2026-09-15T10:30:00.000Z',
        travelMinutes: null,
        thresholds: THRESHOLDS,
      }),
    ).toEqual({ pickupAt: null, dropoffAt: null });
  });
});

describe('TripLegTravelService', () => {
  it('routes between the leg’s own precise points, but factors traffic over public geography only', async () => {
    const plan = jest.fn().mockResolvedValue(planned(45 * 60));
    const result = await serviceWith(plan).estimateMany(
      [leg()],
      new Map([['leg-1', PATIENT]]),
      THRESHOLDS,
    );

    const [origin, destination] = plan.mock.calls[0];
    expect(origin.coordinates).toEqual({ latitude: 41.53, longitude: -8.62 });
    expect(destination.coordinates).toEqual({ latitude: 41.18, longitude: -8.6 });
    // A locality centroid and a facility — never the patient's own address.
    expect(origin.corridor).toEqual({ kind: 'locality', localityId: 'loc-1' });
    expect(destination.corridor).toEqual({ kind: 'facility', facilityId: 'fac-1' });
    expect(result.get('leg-1')?.travelMinutes).toBe(45);
    // `planBetweenPoints` already computed this; carried through rather than
    // discarded, for #247 stage 3's journey page distance column.
    expect(result.get('leg-1')?.travelDistanceMeters).toBe(30_000);
  });

  it('puts the facility at the origin end of a return leg, where it actually is', async () => {
    const plan = jest.fn().mockResolvedValue(planned(45 * 60));
    await serviceWith(plan).estimateMany(
      [leg({ direction: LegDirection.RETURN, originFacilityId: 'fac-1', destinationFacilityId: null })],
      new Map([['leg-1', PATIENT]]),
      THRESHOLDS,
    );

    const [origin, destination] = plan.mock.calls[0];
    expect(origin.corridor).toEqual({ kind: 'facility', facilityId: 'fac-1' });
    expect(destination.corridor).toEqual({ kind: 'locality', localityId: 'loc-1' });
  });

  it('falls back to the facility’s own point and the patient’s own home, which is the normal shape of a leg', async () => {
    const plan = jest.fn().mockResolvedValue(planned(45 * 60));
    // A real referral names a facility and leaves the home end to the patient
    // record; almost no leg carries coordinates in its own columns.
    await serviceWith(plan).estimateMany(
      [
        leg({
          originLatitude: null,
          originLongitude: null,
          destinationLatitude: null,
          destinationLongitude: null,
          destinationFacility: { latitude: 41.18, longitude: -8.6 } as never,
        }),
      ],
      new Map([['leg-1', PATIENT]]),
      THRESHOLDS,
    );

    const [origin, destination] = plan.mock.calls[0];
    expect(origin.coordinates).toEqual({ latitude: PATIENT.latitude, longitude: PATIENT.longitude });
    expect(destination.coordinates).toEqual({ latitude: 41.18, longitude: -8.6 });
  });

  it('prefers the leg’s own coordinates over the referenced row, since a leg may name its own address', async () => {
    const plan = jest.fn().mockResolvedValue(planned(45 * 60));
    await serviceWith(plan).estimateMany(
      [leg({ originLatitude: 41.9, originLongitude: -8.9 })],
      new Map([['leg-1', PATIENT]]),
      THRESHOLDS,
    );

    expect(plan.mock.calls[0][0].coordinates).toEqual({ latitude: 41.9, longitude: -8.9 });
  });

  it('skips routing entirely when an endpoint has no coordinates anywhere', async () => {
    const plan = jest.fn();
    const result = await serviceWith(plan).estimateMany([leg({ originLatitude: null })], new Map(), THRESHOLDS);

    expect(plan).not.toHaveBeenCalled();
    expect(result.get('leg-1')).toEqual({
      travelMinutes: null,
      travelEstimated: false,
      travelDistanceMeters: null,
      suggested: { pickupAt: null, dropoffAt: null },
      // The origin genuinely has no coordinates anywhere (no leg column, no
      // patient in the map); the destination's own columns still resolve —
      // door is per-end, never all-or-nothing (#247 stage 4).
      door: { origin: null, destination: { latitude: 41.18, longitude: -8.6 } },
    });
  });

  it('carries the door through even when routing itself fails, since both endpoints were already known', async () => {
    const plan = jest.fn().mockRejectedValue(new Error('OSRM unreachable'));
    const result = await serviceWith(plan).estimateMany([leg()], new Map([['leg-1', PATIENT]]), THRESHOLDS);

    expect(result.get('leg-1')?.door).toEqual({
      origin: { latitude: 41.53, longitude: -8.62 },
      destination: { latitude: 41.18, longitude: -8.6 },
    });
  });

  it('carries the door through on a routed leg too', async () => {
    const plan = jest.fn().mockResolvedValue(planned(45 * 60));
    const result = await serviceWith(plan).estimateMany([leg()], new Map([['leg-1', PATIENT]]), THRESHOLDS);

    expect(result.get('leg-1')?.door).toEqual({
      origin: { latitude: 41.53, longitude: -8.62 },
      destination: { latitude: 41.18, longitude: -8.6 },
    });
  });

  it('degrades to no estimate rather than failing the whole day’s board when routing is down', async () => {
    const plan = jest.fn().mockRejectedValue(new Error('OSRM unreachable'));
    const result = await serviceWith(plan).estimateMany(
      [leg()],
      new Map([['leg-1', PATIENT]]),
      THRESHOLDS,
    );

    expect(result.get('leg-1')?.travelMinutes).toBeNull();
    expect(result.get('leg-1')?.suggested).toEqual({ pickupAt: null, dropoffAt: null });
  });

  it('carries the straight-line flag through, so the board can say the estimate is coarse', async () => {
    const plan = jest.fn().mockResolvedValue(planned(70 * 60, true));
    const result = await serviceWith(plan).estimateMany(
      [leg()],
      new Map([['leg-1', PATIENT]]),
      THRESHOLDS,
    );

    expect(result.get('leg-1')?.travelEstimated).toBe(true);
    expect(result.get('leg-1')?.travelMinutes).toBe(70);
  });

  it('leaves the factor unapplied, rather than guessing, when the patient has no locality', async () => {
    const plan = jest.fn().mockResolvedValue(planned(45 * 60));
    await serviceWith(plan).estimateMany([leg()], new Map([['leg-1', { ...PATIENT, localityId: null }]]), THRESHOLDS);

    expect(plan.mock.calls[0][0].corridor).toBeNull();
  });
});
