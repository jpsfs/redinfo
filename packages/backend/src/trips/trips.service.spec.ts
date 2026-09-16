import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DEFAULT_ARRIVAL_WINDOW_THRESHOLDS, LegDirection, PatientMobility, TripStatus, TripStopKind } from '@redinfo/shared';
import { TripsService } from './trips.service';

// ── Trip CRUD + read-time ranked validation (#234) ──────────────────────────
//
// `getDetail` is the "ranked warnings for the board" half of the story:
// capacity (hard, unoverridable), crew/vehicle availability (hard but
// overridable — rechecked fresh, unlike the write-time throw in
// `TripStopsService`/`TripCrewService`), and arrival timing (soft, never
// blocks). See the shared banner comment above `walkTripStops`.

const VEHICLE = { seatedCapacity: 3, wheelchairPositions: 1, stretcherPositions: 0 };

function buildTripRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'trip-1',
    date: new Date('2026-09-15T00:00:00.000Z'),
    vehicleId: 'v1',
    status: TripStatus.PLANNED,
    notes: null,
    createdAt: new Date('2026-09-14T00:00:00.000Z'),
    updatedAt: new Date('2026-09-14T00:00:00.000Z'),
    vehicle: VEHICLE,
    crewMembers: [],
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
    trip: {
      findUnique: jest.fn().mockResolvedValue(buildTripRow()),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockImplementation((args) =>
          Promise.resolve({ id: 'trip-1', createdAt: new Date(), updatedAt: new Date(), ...args.data }),
        ),
      update: jest.fn().mockImplementation((args) => Promise.resolve({ ...buildTripRow(), ...args.data })),
      delete: jest.fn().mockResolvedValue(undefined),
    },
    vehicle: { count: jest.fn().mockResolvedValue(1) },
    transportLeg: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  };
}

function buildDeps(overrides: Record<string, unknown> = {}) {
  return {
    delegationSettings: { get: jest.fn().mockResolvedValue(DEFAULT_ARRIVAL_WINDOW_THRESHOLDS) },
    staffAbsences: { findOverlapping: jest.fn().mockResolvedValue([]) },
    vehicleOccupancy: {
      findForSource: jest.fn().mockResolvedValue(null),
      findConflicts: jest.fn().mockResolvedValue([]),
      removeForSource: jest.fn().mockResolvedValue(undefined),
    },
    transportRequestLegs: {
      findByIds: jest.fn().mockResolvedValue([]),
      findUnassignedForDate: jest.fn().mockResolvedValue([]),
    },
    patients: { findManyForDisplay: jest.fn().mockResolvedValue(new Map()) },
    legTravel: { estimateMany: jest.fn().mockResolvedValue(new Map()) },
    ...overrides,
  };
}


function makeService(prisma: ReturnType<typeof buildPrismaStub>, deps: ReturnType<typeof buildDeps> = buildDeps()) {
  return new TripsService(
    prisma as never,
    deps.delegationSettings as never,
    deps.staffAbsences as never,
    deps.vehicleOccupancy as never,
    deps.transportRequestLegs as never,
    deps.patients as never,
    deps.legTravel as never,
  );
}

describe('TripsService', () => {
  describe('create', () => {
    it('rejects an unknown vehicle', async () => {
      const prisma = buildPrismaStub({ vehicle: { count: jest.fn().mockResolvedValue(0) } });
      const service = makeService(prisma);
      await expect(service.create({ date: '2026-09-15', vehicleId: 'nope' })).rejects.toThrow(BadRequestException);
    });

    it('creates a trip for a known vehicle', async () => {
      const prisma = buildPrismaStub();
      const service = makeService(prisma);
      const result = await service.create({ date: '2026-09-15', vehicleId: 'v1' });
      expect(result).toMatchObject({ vehicleId: 'v1', date: '2026-09-15' });
    });
  });

  describe('remove', () => {
    it('404s for an unknown trip', async () => {
      const prisma = buildPrismaStub({ trip: { findUnique: jest.fn().mockResolvedValue(null) } });
      const service = makeService(prisma);
      await expect(service.remove('nope')).rejects.toThrow(NotFoundException);
    });

    it('deletes the trip and releases its vehicle occupancy', async () => {
      const prisma = buildPrismaStub();
      const deps = buildDeps();
      const service = makeService(prisma, deps);
      await service.remove('trip-1');
      expect(prisma.trip.delete).toHaveBeenCalledWith({ where: { id: 'trip-1' } });
      expect(deps.vehicleOccupancy.removeForSource).toHaveBeenCalledWith('TRANSPORT_TRIP', 'trip-1');
    });
  });

  describe('getDetail', () => {
    it('404s for an unknown trip', async () => {
      const prisma = buildPrismaStub({ trip: { findUnique: jest.fn().mockResolvedValue(null) } });
      const service = makeService(prisma);
      await expect(service.getDetail('nope')).rejects.toThrow(NotFoundException);
    });

    it('flags over-capacity as an ERROR, unconditionally', async () => {
      const stops = [
        stop({ id: 's1', sequence: 1, kind: TripStopKind.PICKUP, transportLegId: 'leg-1' }),
        stop({ id: 's2', sequence: 2, kind: TripStopKind.PICKUP, transportLegId: 'leg-2' }),
      ];
      const prisma = buildPrismaStub({
        trip: { findUnique: jest.fn().mockResolvedValue(buildTripRow({ vehicle: { ...VEHICLE, wheelchairPositions: 1 }, stops })) },
        transportLeg: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'leg-1', transportRequest: { escortTravels: false, patient: { mobility: PatientMobility.WHEELCHAIR } } },
            { id: 'leg-2', transportRequest: { escortTravels: false, patient: { mobility: PatientMobility.WHEELCHAIR } } },
          ]),
        },
      });
      const service = makeService(prisma);
      const result = await service.getDetail('trip-1');
      expect(result.issues).toContainEqual(expect.objectContaining({ level: 'ERROR', code: 'OVER_CAPACITY_WHEELCHAIR' }));
    });

    it('flags an absent crew member with no override as an ERROR', async () => {
      const prisma = buildPrismaStub({
        trip: {
          findUnique: jest.fn().mockResolvedValue(
            buildTripRow({ crewMembers: [{ id: 'cm1', userId: 'u1', role: 'DRIVER', overrideReason: null, createdAt: new Date() }] }),
          ),
        },
      });
      const deps = buildDeps({ staffAbsences: { findOverlapping: jest.fn().mockResolvedValue([{ userId: 'u1' }]) } });
      const service = makeService(prisma, deps);
      const result = await service.getDetail('trip-1');
      expect(result.issues).toContainEqual(expect.objectContaining({ level: 'ERROR', code: 'CREW_UNAVAILABLE' }));
    });

    it('suppresses the crew-unavailable ERROR once an override reason is on file', async () => {
      const prisma = buildPrismaStub({
        trip: {
          findUnique: jest.fn().mockResolvedValue(
            buildTripRow({ crewMembers: [{ id: 'cm1', userId: 'u1', role: 'DRIVER', overrideReason: 'Asked to come in', createdAt: new Date() }] }),
          ),
        },
      });
      const deps = buildDeps({ staffAbsences: { findOverlapping: jest.fn().mockResolvedValue([{ userId: 'u1' }]) } });
      const service = makeService(prisma, deps);
      const result = await service.getDetail('trip-1');
      expect(result.issues.some((i) => i.code === 'CREW_UNAVAILABLE')).toBe(false);
    });

    it('flags a fresh vehicle conflict against a different booking as an ERROR', async () => {
      const prisma = buildPrismaStub({
        trip: { findUnique: jest.fn().mockResolvedValue(buildTripRow({ stops: [stop()] })) },
      });
      const deps = buildDeps({
        vehicleOccupancy: {
          findForSource: jest.fn().mockResolvedValue({ id: 'vo1', overrideReason: null }),
          findConflicts: jest.fn().mockResolvedValue([{ id: 'other' }]),
          removeForSource: jest.fn(),
        },
      });
      const service = makeService(prisma, deps);
      const result = await service.getDetail('trip-1');
      expect(result.issues).toContainEqual(expect.objectContaining({ level: 'ERROR', code: 'VEHICLE_UNAVAILABLE' }));
    });

    it('suppresses the vehicle-unavailable ERROR once this trip carries its own override', async () => {
      const prisma = buildPrismaStub({
        trip: { findUnique: jest.fn().mockResolvedValue(buildTripRow({ stops: [stop()] })) },
      });
      const deps = buildDeps({
        vehicleOccupancy: {
          findForSource: jest.fn().mockResolvedValue({ id: 'vo1', overrideReason: 'Short handover accepted' }),
          findConflicts: jest.fn(),
          removeForSource: jest.fn(),
        },
      });
      const service = makeService(prisma, deps);
      const result = await service.getDetail('trip-1');
      expect(result.issues.some((i) => i.code === 'VEHICLE_UNAVAILABLE')).toBe(false);
    });

    it('ranks an early arrival as a NOTE and a late arrival as a WARNING, never blocking', async () => {
      const stops = [
        stop({
          id: 'dropoff-early',
          sequence: 1,
          kind: TripStopKind.DROPOFF,
          transportLegId: 'leg-early',
          plannedAt: new Date('2026-09-15T08:00:00.000Z'),
        }),
      ];
      const prisma = buildPrismaStub({
        trip: { findUnique: jest.fn().mockResolvedValue(buildTripRow({ stops })) },
        transportLeg: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'leg-early',
              direction: LegDirection.OUTBOUND,
              date: new Date('2026-09-15T00:00:00.000Z'),
              destinationFacility: null,
              treatmentPlan: null,
              transportRequest: { occurrenceType: 'CONSULTA', appointmentAt: new Date('2026-09-15T09:00:00.000Z') },
            },
          ]),
        },
      });
      const service = makeService(prisma);
      const result = await service.getDetail('trip-1');
      expect(result.issues).toContainEqual(expect.objectContaining({ level: 'NOTE', code: 'ARRIVAL_TOO_EARLY' }));
    });

    it('never flags a return leg on arrival timing — there is no treatment start to be on time for', async () => {
      const stops = [
        stop({
          id: 'dropoff-return',
          sequence: 1,
          kind: TripStopKind.DROPOFF,
          transportLegId: 'leg-return',
          plannedAt: new Date('2026-09-15T08:00:00.000Z'),
        }),
      ];
      const prisma = buildPrismaStub({
        trip: { findUnique: jest.fn().mockResolvedValue(buildTripRow({ stops })) },
        transportLeg: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'leg-return',
              direction: LegDirection.RETURN,
              date: new Date('2026-09-15T00:00:00.000Z'),
              destinationFacility: null,
              treatmentPlan: null,
              transportRequest: { occurrenceType: 'CONSULTA', appointmentAt: new Date('2026-09-15T09:00:00.000Z') },
            },
          ]),
        },
      });
      const service = makeService(prisma);
      const result = await service.getDetail('trip-1');
      expect(result.issues.filter((i) => i.code.startsWith('ARRIVAL_'))).toHaveLength(0);
    });

    it('computes the occupancy window and empty legs, and is null/empty with no stops', async () => {
      const prisma = buildPrismaStub();
      const service = makeService(prisma);
      const result = await service.getDetail('trip-1');
      expect(result.occupancyWindow).toBeNull();
      expect(result.emptyLegs).toEqual([]);
    });
  });

  // ── Planning board (#235) ─────────────────────────────────────────────────

  describe('getBoard', () => {
    const USER = { id: 'user-1', roles: [] as never[] };

    it('composes lanes and a legsById map from batched leg/patient lookups', async () => {
      const laneStops = [stop({ id: 'pickup-1', kind: TripStopKind.PICKUP, transportLegId: 'leg-1' })];
      const prisma = buildPrismaStub({
        trip: {
          findMany: jest.fn().mockResolvedValue([
            buildTripRow({
              vehicle: { ...VEHICLE, licensePlate: 'AA-11-BB', numeroCauda: '101', vehicleType: 'AMBULANCE' },
              stops: laneStops,
            }),
          ]),
        },
        transportRequest: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { id: 'req-1', patientId: 'pat-1' },
              { id: 'req-2', patientId: 'pat-2' },
            ]),
        },
      });
      const deps = buildDeps({
        transportRequestLegs: {
          findByIds: jest.fn().mockResolvedValue([
            { id: 'leg-1', transportRequestId: 'req-1', direction: LegDirection.OUTBOUND },
          ]),
          findUnassignedForDate: jest
            .fn()
            .mockResolvedValue([{ id: 'leg-2', transportRequestId: 'req-2', direction: LegDirection.OUTBOUND }]),
        },
        patients: {
          findManyForDisplay: jest.fn().mockResolvedValue(
            new Map([
              ['pat-1', { mobility: PatientMobility.WHEELCHAIR, fullName: 'Ana Reis' }],
              ['pat-2', { mobility: PatientMobility.AMBULATORY, fullName: null }],
            ]),
          ),
        },
      });
      const service = makeService(prisma, deps);

      const board = await service.getBoard('2026-09-15', USER);

      expect(board.lanes).toHaveLength(1);
      expect(board.lanes[0].vehicle.licensePlate).toBe('AA-11-BB');
      expect(board.legsById['leg-1']).toMatchObject({ patientId: 'pat-1', patientMobility: PatientMobility.WHEELCHAIR, patientName: 'Ana Reis' });
      expect(board.legsById['leg-2']).toMatchObject({ patientId: 'pat-2', patientMobility: PatientMobility.AMBULATORY });
      expect(board.legsById['leg-2'].patientName).toBeUndefined();
      expect(board.unassignedLegIds).toEqual(['leg-2']);
      // The assigned leg is only ever looked up by id, never re-derived from the date.
      expect(deps.transportRequestLegs.findByIds).toHaveBeenCalledWith(['leg-1']);
    });
  });
});
