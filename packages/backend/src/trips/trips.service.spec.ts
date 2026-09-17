import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  CertificationType,
  DEFAULT_ARRIVAL_WINDOW_THRESHOLDS,
  LegDirection,
  PatientMobility,
  TripStatus,
  TripStopKind,
  VehicleType,
} from '@redinfo/shared';
import { TripsService } from './trips.service';

// ── Trip CRUD + read-time ranked validation (#234) ──────────────────────────
//
// `getDetail` is the "ranked warnings for the board" half of the story:
// capacity (hard, unoverridable), crew/vehicle availability (hard but
// overridable — rechecked fresh, unlike the write-time throw in
// `TripStopsService`/`TripCrewService`), and arrival timing (soft, never
// blocks). See the shared banner comment above `walkTripStops`.

const VEHICLE = {
  seatedCapacity: 3,
  wheelchairPositions: 1,
  stretcherPositions: 0,
  vehicleType: VehicleType.TRANSPORT,
};

/** A crew row as `TRIP_INCLUDE` yields it, paired with the `user` row
 * `loadCrew` joins to it. */
function crewMember(overrides: Record<string, unknown> = {}) {
  return { id: 'cm1', tripId: 'trip-1', userId: 'u1', role: 'DRIVER', overrideReason: null, createdAt: new Date(), ...overrides };
}

function crewUser(id: string, certifications: { type: CertificationType; validUntil: Date | null }[] = []) {
  return { id, firstName: 'Ana', lastName: 'Dias', certifications };
}

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
  const defaultTrip = {
    findUnique: jest.fn().mockResolvedValue(buildTripRow()),
    // Doubles as `getDetail`'s sibling-journey-number lookup (#247 stage 3)
    // — empty by default, same as a trip whose own row wasn't in its
    // result, which only affects `journeyNumber` and not the fields these
    // tests assert on.
    findMany: jest.fn().mockResolvedValue([]),
    create: jest
      .fn()
      .mockImplementation((args) =>
        Promise.resolve({ id: 'trip-1', createdAt: new Date(), updatedAt: new Date(), ...args.data }),
      ),
    update: jest.fn().mockImplementation((args) => Promise.resolve({ ...buildTripRow(), ...args.data })),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  return {
    vehicle: { count: jest.fn().mockResolvedValue(1) },
    transportLeg: { findMany: jest.fn().mockResolvedValue([]) },
    // Only reached once a stop actually carries a `transportLegId` — most
    // `getDetail` fixtures below have none, so this default is never hit;
    // the tests that do set one legIds's worth of stops resolve to no
    // matching request, same as a leg the loader can't join.
    transportRequest: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findMany: jest.fn().mockResolvedValue([crewUser('u1')]) },
    ...overrides,
    // Merged rather than replaced: a test overriding only `trip.findUnique`
    // must not silently lose `trip.findMany` underneath it.
    trip: { ...defaultTrip, ...((overrides.trip as object) ?? {}) },
  };
}

const USER = { id: 'user-1', roles: [] as never[] };

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
      await expect(service.getDetail('nope', USER)).rejects.toThrow(NotFoundException);
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
      const result = await service.getDetail('trip-1', USER);
      expect(result.issues).toContainEqual(expect.objectContaining({ level: 'ERROR', code: 'OVER_CAPACITY_WHEELCHAIR' }));
    });

    it('flags an absent crew member with no override as an ERROR, by name', async () => {
      const prisma = buildPrismaStub({
        trip: { findUnique: jest.fn().mockResolvedValue(buildTripRow({ crewMembers: [crewMember()] })) },
      });
      const deps = buildDeps({ staffAbsences: { findOverlapping: jest.fn().mockResolvedValue([{ userId: 'u1' }]) } });
      const service = makeService(prisma, deps);
      const result = await service.getDetail('trip-1', USER);
      expect(result.issues).toContainEqual(
        expect.objectContaining({ level: 'ERROR', code: 'CREW_UNAVAILABLE', message: expect.stringContaining('Ana Dias') }),
      );
    });

    it('suppresses the crew-unavailable ERROR once an override reason is on file', async () => {
      const prisma = buildPrismaStub({
        trip: {
          findUnique: jest
            .fn()
            .mockResolvedValue(buildTripRow({ crewMembers: [crewMember({ overrideReason: 'Asked to come in' })] })),
        },
      });
      const deps = buildDeps({ staffAbsences: { findOverlapping: jest.fn().mockResolvedValue([{ userId: 'u1' }]) } });
      const service = makeService(prisma, deps);
      const result = await service.getDetail('trip-1', USER);
      expect(result.issues.some((i) => i.code === 'CREW_UNAVAILABLE')).toBe(false);
    });

    // ── Crew composition (#235) ─────────────────────────────────────────────
    //
    // A "maca" transport — a `PatientMobility.STRETCHER` passenger — needs an
    // emergency vehicle and two crew at TAT or above; anything else needs one
    // with a valid SBV. Ranked on read, never thrown: a `Trip` is created
    // empty and crewed a person at a time, so a write-time check would reject
    // the first crew member for not yet being the second.

    /** A trip actually carrying `mobility`'s patient, pickup through dropoff. */
    function carryingTrip(mobility: PatientMobility, tripOverrides: Record<string, unknown> = {}) {
      return {
        trip: {
          findUnique: jest.fn().mockResolvedValue(
            buildTripRow({
              stops: [
                stop({ id: 's1', sequence: 1, kind: TripStopKind.PICKUP, transportLegId: 'leg-1' }),
                stop({
                  id: 's2',
                  sequence: 2,
                  kind: TripStopKind.DROPOFF,
                  transportLegId: 'leg-1',
                  plannedAt: new Date('2026-09-15T09:00:00.000Z'),
                }),
              ],
              ...tripOverrides,
            }),
          ),
        },
        transportLeg: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'leg-1', transportRequest: { escortTravels: false, patient: { mobility } } }]),
        },
      };
    }

    const validTat = [{ type: CertificationType.TAT, validUntil: new Date('2027-01-01T00:00:00.000Z') }];
    const validSbv = [{ type: CertificationType.SBV, validUntil: new Date('2027-01-01T00:00:00.000Z') }];

    it('demands an emergency vehicle for a stretcher patient', async () => {
      const prisma = buildPrismaStub(
        carryingTrip(PatientMobility.STRETCHER, { vehicle: { ...VEHICLE, stretcherPositions: 1 } }),
      );
      const service = makeService(prisma);
      const result = await service.getDetail('trip-1', USER);
      expect(result.issues).toContainEqual(expect.objectContaining({ level: 'ERROR', code: 'VEHICLE_NOT_EMERGENCY' }));
      expect(result.crewRequirement).toMatchObject({ minimumCrew: 2, minimumCertification: CertificationType.TAT });
    });

    it('demands a second TAT for a stretcher patient', async () => {
      const prisma = buildPrismaStub({
        ...carryingTrip(PatientMobility.STRETCHER, {
          vehicle: { ...VEHICLE, stretcherPositions: 1, vehicleType: VehicleType.EMERGENCY },
          crewMembers: [crewMember()],
        }),
        user: { findMany: jest.fn().mockResolvedValue([crewUser('u1', validTat)]) },
      });
      const service = makeService(prisma);
      const result = await service.getDetail('trip-1', USER);
      expect(result.issues).toContainEqual(expect.objectContaining({ code: 'CREW_TOO_FEW' }));
      expect(result.issues.some((i) => i.code === 'VEHICLE_NOT_EMERGENCY')).toBe(false);
    });

    it('accepts two TAS on an emergency vehicle for a stretcher patient', async () => {
      const prisma = buildPrismaStub({
        ...carryingTrip(PatientMobility.STRETCHER, {
          vehicle: { ...VEHICLE, stretcherPositions: 1, vehicleType: VehicleType.EMERGENCY },
          crewMembers: [crewMember(), crewMember({ id: 'cm2', userId: 'u2' })],
        }),
        user: {
          // TAS implies TAT — a fully-qualified crew must not read as short.
          findMany: jest.fn().mockResolvedValue([
            crewUser('u1', [{ type: CertificationType.TAS, validUntil: null }]),
            crewUser('u2', [{ type: CertificationType.TAS, validUntil: null }]),
          ]),
        },
      });
      const service = makeService(prisma);
      const result = await service.getDetail('trip-1', USER);
      expect(result.issues.filter((i) => i.code.startsWith('CREW_') || i.code === 'VEHICLE_NOT_EMERGENCY')).toEqual([]);
    });

    it('needs only one SBV for a non-stretcher patient', async () => {
      const prisma = buildPrismaStub({
        ...carryingTrip(PatientMobility.AMBULATORY, { crewMembers: [crewMember()] }),
        user: { findMany: jest.fn().mockResolvedValue([crewUser('u1', validSbv)]) },
      });
      const service = makeService(prisma);
      const result = await service.getDetail('trip-1', USER);
      expect(result.issues.filter((i) => i.code.startsWith('CREW_'))).toEqual([]);
      expect(result.crewRequirement).toMatchObject({
        minimumCrew: 1,
        minimumCertification: CertificationType.SBV,
        requiresEmergencyVehicle: false,
      });
    });

    it('does not count a DRIVER-only crew member towards the SBV the journey needs', async () => {
      const prisma = buildPrismaStub({
        ...carryingTrip(PatientMobility.AMBULATORY, { crewMembers: [crewMember()] }),
        user: { findMany: jest.fn().mockResolvedValue([crewUser('u1', [{ type: CertificationType.DRIVER, validUntil: null }])]) },
      });
      const service = makeService(prisma);
      const result = await service.getDetail('trip-1', USER);
      expect(result.issues).toContainEqual(expect.objectContaining({ code: 'CREW_TOO_FEW' }));
    });

    it('accepts a driver riding along once the SBV requirement is already met', async () => {
      const prisma = buildPrismaStub({
        ...carryingTrip(PatientMobility.AMBULATORY, {
          crewMembers: [crewMember(), crewMember({ id: 'cm2', userId: 'u2' })],
        }),
        // One SBV and one driver-only. The rule is "at least one SBV", not
        // "everyone must hold SBV" — the second person must not be flagged.
        user: {
          findMany: jest.fn().mockResolvedValue([
            crewUser('u1', validSbv),
            crewUser('u2', [{ type: CertificationType.DRIVER, validUntil: null }]),
          ]),
        },
      });
      const service = makeService(prisma);
      const result = await service.getDetail('trip-1', USER);
      expect(result.issues.filter((i) => i.code.startsWith('CREW_'))).toEqual([]);
    });

    it("checks certifications against the trip's date, not today", async () => {
      const prisma = buildPrismaStub({
        ...carryingTrip(PatientMobility.AMBULATORY, { crewMembers: [crewMember()] }),
        // Valid as this is written, lapsed by the trip on 2026-09-15.
        user: {
          findMany: jest
            .fn()
            .mockResolvedValue([crewUser('u1', [{ type: CertificationType.SBV, validUntil: new Date('2026-09-01T00:00:00.000Z') }])]),
        },
      });
      const service = makeService(prisma);
      const result = await service.getDetail('trip-1', USER);
      expect(result.issues).toContainEqual(expect.objectContaining({ code: 'CREW_TOO_FEW' }));
    });

    it('says nothing about crew for a journey with nothing aboard yet', async () => {
      const prisma = buildPrismaStub();
      const service = makeService(prisma);
      const result = await service.getDetail('trip-1', USER);
      expect(result.issues.filter((i) => i.code.startsWith('CREW_'))).toEqual([]);
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
      const result = await service.getDetail('trip-1', USER);
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
      const result = await service.getDetail('trip-1', USER);
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
      const result = await service.getDetail('trip-1', USER);
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
      const result = await service.getDetail('trip-1', USER);
      expect(result.issues.filter((i) => i.code.startsWith('ARRIVAL_'))).toHaveLength(0);
    });

    it('computes the occupancy window and empty legs, and is null/empty with no stops', async () => {
      const prisma = buildPrismaStub();
      const service = makeService(prisma);
      const result = await service.getDetail('trip-1', USER);
      expect(result.occupancyWindow).toBeNull();
      expect(result.emptyLegs).toEqual([]);
    });

    // ── The standalone journey page (#247 stage 3) ──────────────────────────

    it('serves the vehicle and this trip’s own legsById, which the board gets for free but a single trip does not', async () => {
      const stops = [
        stop({ id: 's1', sequence: 1, kind: TripStopKind.PICKUP, transportLegId: 'leg-1' }),
        stop({ id: 's2', sequence: 2, kind: TripStopKind.DROPOFF, transportLegId: 'leg-1' }),
      ];
      const prisma = buildPrismaStub({
        trip: {
          findUnique: jest.fn().mockResolvedValue(
            buildTripRow({ vehicle: { ...VEHICLE, licensePlate: 'AA-11-BB', numeroCauda: '101' }, stops }),
          ),
        },
        transportRequest: { findMany: jest.fn().mockResolvedValue([{ id: 'req-1', patientId: 'pat-1' }]) },
      });
      const deps = buildDeps({
        transportRequestLegs: {
          findByIds: jest.fn().mockResolvedValue([{ id: 'leg-1', transportRequestId: 'req-1', direction: LegDirection.OUTBOUND }]),
          findUnassignedForDate: jest.fn().mockResolvedValue([]),
        },
        patients: {
          findManyForDisplay: jest
            .fn()
            .mockResolvedValue(new Map([['pat-1', { mobility: PatientMobility.WHEELCHAIR, fullName: 'Ana Reis' }]])),
        },
      });
      const service = makeService(prisma, deps);
      const result = await service.getDetail('trip-1', USER);

      expect(result.vehicle).toMatchObject({ licensePlate: 'AA-11-BB', numeroCauda: '101' });
      expect(result.legsById['leg-1']).toMatchObject({ patientId: 'pat-1', patientName: 'Ana Reis' });
      // Only this trip's own legs — never the whole date's, unlike the board.
      expect(deps.transportRequestLegs.findByIds).toHaveBeenCalledWith(['leg-1']);
    });

    it('numbers this journey the same way the board would, off its siblings on the same vehicle and date', async () => {
      const prisma = buildPrismaStub({
        trip: {
          findUnique: jest.fn().mockResolvedValue(
            buildTripRow({ id: 'trip-2', stops: [stop({ plannedAt: new Date('2026-09-15T10:00:00.000Z') })] }),
          ),
          findMany: jest.fn().mockResolvedValue([
            { id: 'trip-1', stops: [{ plannedAt: new Date('2026-09-15T08:00:00.000Z') }] },
            { id: 'trip-2', stops: [{ plannedAt: new Date('2026-09-15T10:00:00.000Z') }] },
          ]),
        },
      });
      const service = makeService(prisma);
      const result = await service.getDetail('trip-2', USER);
      expect(result.journeyNumber).toBe(2);
    });
  });

  // ── Planning board (#235) ─────────────────────────────────────────────────

  describe('getBoard', () => {
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

    it('numbers each vehicle’s own journeys from 1, independently of the other vehicles on the board', async () => {
      const prisma = buildPrismaStub({
        trip: {
          findMany: jest.fn().mockResolvedValue([
            buildTripRow({ id: 'v1-early', vehicleId: 'v1', stops: [stop({ plannedAt: new Date('2026-09-15T08:00:00.000Z') })] }),
            buildTripRow({ id: 'v1-late', vehicleId: 'v1', stops: [stop({ plannedAt: new Date('2026-09-15T12:00:00.000Z') })] }),
            buildTripRow({ id: 'v2-only', vehicleId: 'v2', stops: [stop({ plannedAt: new Date('2026-09-15T09:00:00.000Z') })] }),
          ]),
        },
      });
      const service = makeService(prisma);

      const board = await service.getBoard('2026-09-15', USER);

      const numberById = new Map(board.lanes.map((lane) => [lane.trip.id, lane.journeyNumber]));
      expect(numberById.get('v1-early')).toBe(1);
      expect(numberById.get('v1-late')).toBe(2);
      // A different vehicle's first journey is also 1 — the colour ramp
      // deliberately repeats across vehicles (#247 stage 1's decision table).
      expect(numberById.get('v2-only')).toBe(1);
    });
  });
});
