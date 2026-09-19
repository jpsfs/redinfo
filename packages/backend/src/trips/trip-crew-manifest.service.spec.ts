import { LegDirection, PatientMobility, TripStatus, TripStopKind, VehicleType } from '@redinfo/shared';
import { TripCrewManifestService } from './trip-crew-manifest.service';

// ── Crew manifest (#236) ─────────────────────────────────────────────────────
//
// `getMyTrips` filters to trips the caller is crewing (via the `where` clause
// itself — nothing here re-checks it, that's the point) and enriches each
// stop with the facility name, the patient and the treatment window, using
// `findManyForCrewManifest` rather than `findManyForDisplay` so a caller
// without `VIEW_PATIENT_IDENTITY` still sees the patient's name.

function buildTripRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'trip-1',
    date: new Date('2026-09-15T00:00:00.000Z'),
    vehicleId: 'v1',
    status: TripStatus.PLANNED,
    notes: null,
    createdAt: new Date('2026-09-14T00:00:00.000Z'),
    updatedAt: new Date('2026-09-14T00:00:00.000Z'),
    vehicle: { licensePlate: 'AA-00-AA', numeroCauda: 'CV-01', vehicleType: VehicleType.TRANSPORT },
    stops: [],
    ...overrides,
  };
}

function stop(overrides: Record<string, unknown> = {}) {
  return {
    id: 'stop-1',
    tripId: 'trip-1',
    sequence: 1,
    kind: TripStopKind.PICKUP,
    transportLegId: null,
    facilityId: null,
    facility: null,
    address: null,
    latitude: null,
    longitude: null,
    plannedAt: new Date('2026-09-15T08:00:00.000Z'),
    actualAt: null,
    dwellDecision: null,
    dwellMinutes: null,
    createdAt: new Date('2026-09-14T00:00:00.000Z'),
    updatedAt: new Date('2026-09-14T00:00:00.000Z'),
    ...overrides,
  };
}

function buildPrismaStub(overrides: Record<string, unknown> = {}) {
  return {
    trip: { findMany: jest.fn().mockResolvedValue([]) },
    transportRequest: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  };
}

function buildDeps(overrides: Record<string, unknown> = {}) {
  return {
    transportRequestLegs: { findByIds: jest.fn().mockResolvedValue([]) },
    patients: {
      findManyForCrewManifest: jest.fn().mockResolvedValue(new Map()),
      findManyForDisplay: jest.fn().mockResolvedValue(new Map()),
    },
    ...overrides,
  };
}

function makeService(prisma: ReturnType<typeof buildPrismaStub>, deps: ReturnType<typeof buildDeps> = buildDeps()) {
  return new TripCrewManifestService(prisma as never, deps.transportRequestLegs as never, deps.patients as never);
}

describe('TripCrewManifestService', () => {
  it('returns no trips, without touching legs/patients, when the caller crews none that day', async () => {
    const prisma = buildPrismaStub();
    const deps = buildDeps();
    const service = makeService(prisma, deps);

    const result = await service.getMyTrips('user-1', '2026-09-15');

    expect(result).toEqual({ date: '2026-09-15', trips: [] });
    expect(deps.transportRequestLegs.findByIds).not.toHaveBeenCalled();
    expect(deps.patients.findManyForCrewManifest).not.toHaveBeenCalled();
  });

  it("scopes the trip query to the caller's own crew membership", async () => {
    const prisma = buildPrismaStub();
    const service = makeService(prisma);

    await service.getMyTrips('user-1', '2026-09-15');

    expect(prisma.trip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ crewMembers: { some: { userId: 'user-1' } } }),
      }),
    );
  });

  it('enriches a pickup/dropoff stop with the leg, the patient and the treatment window', async () => {
    const pickupStop = stop({
      id: 'stop-pickup',
      kind: TripStopKind.PICKUP,
      transportLegId: 'leg-1',
      facility: { name: 'Hospital de Braga' },
    });
    const prisma = buildPrismaStub({
      trip: { findMany: jest.fn().mockResolvedValue([buildTripRow({ stops: [pickupStop] })]) },
      transportRequest: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'req-1', patientId: 'patient-1', appointmentAt: new Date('2026-09-15T09:00:00.000Z') },
          ]),
      },
    });
    const deps = buildDeps({
      transportRequestLegs: {
        findByIds: jest.fn().mockResolvedValue([
          {
            id: 'leg-1',
            transportRequestId: 'req-1',
            direction: LegDirection.OUTBOUND,
            effectiveEstimatedEndAt: '2026-09-15T09:30:00.000Z',
          },
        ]),
      },
      patients: {
        findManyForCrewManifest: jest
          .fn()
          .mockResolvedValue(new Map([['patient-1', { mobility: PatientMobility.WHEELCHAIR, fullName: 'Maria Silva' }]])),
      },
    });
    const service = makeService(prisma, deps);

    const result = await service.getMyTrips('user-1', '2026-09-15');

    expect(result.trips).toHaveLength(1);
    expect(result.trips[0].stops[0]).toMatchObject({
      id: 'stop-pickup',
      facilityName: 'Hospital de Braga',
      legDirection: LegDirection.OUTBOUND,
      patientId: 'patient-1',
      patientName: 'Maria Silva',
      patientMobility: PatientMobility.WHEELCHAIR,
      appointmentAt: '2026-09-15T09:00:00.000Z',
      treatmentEndAt: '2026-09-15T09:30:00.000Z',
    });
  });

  it('leaves the return-leg pickup stop reading "awaiting the ready call" until actualAt is set', async () => {
    const returnPickup = stop({
      id: 'stop-return-pickup',
      kind: TripStopKind.PICKUP,
      transportLegId: 'leg-return',
      actualAt: null,
    });
    const prisma = buildPrismaStub({
      trip: { findMany: jest.fn().mockResolvedValue([buildTripRow({ stops: [returnPickup] })]) },
      transportRequest: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'req-1', patientId: 'patient-1', appointmentAt: new Date('2026-09-15T09:00:00.000Z') }]),
      },
    });
    const deps = buildDeps({
      transportRequestLegs: {
        findByIds: jest
          .fn()
          .mockResolvedValue([
            { id: 'leg-return', transportRequestId: 'req-1', direction: LegDirection.RETURN, effectiveEstimatedEndAt: '2026-09-15T10:00:00.000Z' },
          ]),
      },
    });
    const service = makeService(prisma, deps);

    const result = await service.getMyTrips('user-1', '2026-09-15');

    // No new field for "ready" — the crew manifest reads it straight off the
    // stop's own `actualAt`, same as any other stop's observed time.
    expect(result.trips[0].stops[0].actualAt).toBeNull();
  });

  it('leaves a WAIT/RETURN_TO_BASE stop (no leg) with null patient/leg/treatment-window fields', async () => {
    const waitStop = stop({
      id: 'stop-wait',
      kind: TripStopKind.WAIT,
      transportLegId: null,
      facility: { name: 'Hospital de Braga' },
      dwellDecision: 'WAIT',
      dwellMinutes: 45,
    });
    const prisma = buildPrismaStub({
      trip: { findMany: jest.fn().mockResolvedValue([buildTripRow({ stops: [waitStop] })]) },
    });
    const service = makeService(prisma);

    const result = await service.getMyTrips('user-1', '2026-09-15');

    expect(result.trips[0].stops[0]).toMatchObject({
      facilityName: 'Hospital de Braga',
      legDirection: null,
      patientId: null,
      patientName: null,
      appointmentAt: null,
      treatmentEndAt: null,
    });
  });
});

// ── Planner-side crew day (#247 stage 6) ────────────────────────────────────
//
// `getForCrewMember` reuses the exact same trip/stop assembly `getMyTrips`
// does — same `build` — but calls `findManyForDisplay(ids, viewer)` instead
// of `findManyForCrewManifest`, so identity degrades per the *viewer's*
// `VIEW_PATIENT_IDENTITY` rather than the structural, always-on bypass a
// crew member reading their own day gets.

describe('TripCrewManifestService.getForCrewMember', () => {
  const pickupStop = stop({
    id: 'stop-pickup',
    kind: TripStopKind.PICKUP,
    transportLegId: 'leg-1',
    facility: { name: 'Hospital de Braga' },
  });

  function buildFixture() {
    return {
      prisma: buildPrismaStub({
        trip: { findMany: jest.fn().mockResolvedValue([buildTripRow({ stops: [pickupStop] })]) },
        transportRequest: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'req-1', patientId: 'patient-1', appointmentAt: new Date('2026-09-15T09:00:00.000Z') }]),
        },
      }),
      deps: buildDeps({
        transportRequestLegs: {
          findByIds: jest.fn().mockResolvedValue([
            {
              id: 'leg-1',
              transportRequestId: 'req-1',
              direction: LegDirection.OUTBOUND,
              effectiveEstimatedEndAt: '2026-09-15T09:30:00.000Z',
            },
          ]),
        },
      }),
    };
  }

  it('calls findManyForDisplay with the viewer, not findManyForCrewManifest', async () => {
    const { prisma, deps } = buildFixture();
    const viewer = { id: 'planner-1', roles: [] };
    const service = makeService(prisma, deps);

    await service.getForCrewMember('crew-member-1', '2026-09-15', viewer as never);

    expect(deps.patients.findManyForDisplay).toHaveBeenCalledWith(['patient-1'], viewer);
    expect(deps.patients.findManyForCrewManifest).not.toHaveBeenCalled();
  });

  it("scopes to the named crew member's own trips, not the viewer's", async () => {
    const { prisma, deps } = buildFixture();
    const service = makeService(prisma, deps);

    await service.getForCrewMember('crew-member-1', '2026-09-15', { id: 'planner-1', roles: [] } as never);

    expect(prisma.trip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ crewMembers: { some: { userId: 'crew-member-1' } } }),
      }),
    );
  });

  it("degrades the patient name when findManyForDisplay withholds it (viewer lacks VIEW_PATIENT_IDENTITY)", async () => {
    const { prisma, deps } = buildFixture();
    (deps.patients.findManyForDisplay as jest.Mock).mockResolvedValue(
      new Map([['patient-1', { mobility: PatientMobility.WHEELCHAIR, fullName: null }]]),
    );
    const service = makeService(prisma, deps);

    const result = await service.getForCrewMember('crew-member-1', '2026-09-15', { id: 'planner-1', roles: [] } as never);

    expect(result.trips[0].stops[0].patientName).toBeNull();
  });

  it('shows the patient name when findManyForDisplay grants it (viewer holds VIEW_PATIENT_IDENTITY)', async () => {
    const { prisma, deps } = buildFixture();
    (deps.patients.findManyForDisplay as jest.Mock).mockResolvedValue(
      new Map([['patient-1', { mobility: PatientMobility.WHEELCHAIR, fullName: 'Maria Silva' }]]),
    );
    const service = makeService(prisma, deps);

    const result = await service.getForCrewMember('crew-member-1', '2026-09-15', { id: 'planner-1', roles: [] } as never);

    expect(result.trips[0].stops[0].patientName).toBe('Maria Silva');
  });
});
