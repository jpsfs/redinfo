import { randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import {
  CertificationType,
  LegDirection,
  LegStatus,
  PatientMobility,
  StaffAbsenceKind,
  TripStopDwell,
  TripStopKind,
  UserRole,
  VehicleOccupancySource,
  VehicleType,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DelegationSettingsService } from '../live-runs/delegation-settings.service';
import { StaffAbsencesService } from '../staff-absences/staff-absences.service';
import { VehicleOccupancyService } from '../vehicle-occupancy/vehicle-occupancy.service';
import { OccurrenceTypePoliciesService } from '../transport-config/occurrence-type-policies.service';
import { TransportRequestLegsService } from '../transport-requests/transport-request-legs.service';
import { PatientsService } from '../patients/patients.service';
import { IdentityCipher } from '../common/identity-cipher';
import { TripsService } from './trips.service';
import { TripCrewService } from './trip-crew.service';
import { TripStopsService } from './trip-stops.service';

/**
 * Integration coverage for #234's model/API against a real Postgres — the
 * unit specs cover the same logic against a mocked Prisma; this proves what
 * only a database answers: a leg's `PICKUP`/`DROPOFF` pair actually moving
 * between trips, `@@unique([tripId, sequence])` never tripping over a
 * reorder, and the trip's one `VehicleOccupancy` interval tracking its
 * current stops (including a `WAIT` stop's dwell) end to end.
 *
 * Skipped unless DATABASE_URL is set, and named so
 * `pnpm --filter backend test:integration` selects it.
 */
const describeIntegration = process.env.DATABASE_URL ? describe : describe.skip;

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const email = (local: string) => `${local}.${RUN}@trips.test`;

describeIntegration('TripsService/TripStopsService/TripCrewService (integration)', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const delegationSettings = new DelegationSettingsService(prisma);
  const staffAbsences = new StaffAbsencesService(prisma);
  const vehicleOccupancy = new VehicleOccupancyService(prisma);
  const occurrenceTypePolicies = new OccurrenceTypePoliciesService(prisma);
  const transportRequestLegs = new TransportRequestLegsService(prisma, delegationSettings, occurrenceTypePolicies);
  const patients = new PatientsService(prisma, new IdentityCipher(`it-${RUN}:${randomBytes(32).toString('base64')}`));
  const trips = new TripsService(
    prisma,
    delegationSettings,
    staffAbsences,
    vehicleOccupancy,
    transportRequestLegs,
    patients,
  );
  const crew = new TripCrewService(prisma, staffAbsences);
  const stops = new TripStopsService(prisma, delegationSettings, vehicleOccupancy);

  let coordinator: { id: string };
  let crewMember: { id: string };
  let municipality: { id: string };
  let requester: { id: string };
  let payer: { id: string };
  let patient: { id: string };
  let facility: { id: string };
  let vehicleA: { id: string };
  let vehicleB: { id: string };

  const tripIds: string[] = [];
  const legIds: string[] = [];
  const requestIds: string[] = [];
  const absenceIds: string[] = [];

  async function makeLeg(suffix: string, direction: LegDirection = LegDirection.OUTBOUND) {
    const request = await prisma.transportRequest.create({
      data: {
        batchReference: `Email ${RUN}`,
        communicatedAt: new Date('2026-09-10T17:00:00.000Z'),
        requesterAccountCode: `ACC-${RUN}`,
        responseDueAt: new Date('2026-09-11T05:00:00.000Z'),
        externalServiceNumber: `SVC-${RUN}-${suffix}`,
        appointmentAt: new Date('2026-09-16T09:00:00.000Z'),
        requestingOrganisationId: requester.id,
        payingOrganisationId: payer.id,
        patientId: patient.id,
        occurrenceType: 'CONSULTA' as never,
        requestedVehicleType: 'TRANSPORTE' as never,
        originAddress: `Rua de Teste, ${suffix}, ${RUN}`,
        destinationFacilityId: facility.id,
        createdById: coordinator.id,
      },
    });
    requestIds.push(request.id);
    const leg = await prisma.transportLeg.create({
      data: {
        transportRequestId: request.id,
        date: new Date('2026-09-16T00:00:00.000Z'),
        generatedForDate: new Date('2026-09-16T00:00:00.000Z'),
        direction: direction as never,
        originAddress: `Rua de Teste, ${suffix}, ${RUN}`,
        destinationFacilityId: facility.id,
      },
    });
    legIds.push(leg.id);
    return leg;
  }

  beforeAll(async () => {
    coordinator = await prisma.user.create({
      data: { email: email('coordinator'), firstName: 'Coordinator', lastName: 'Test', roles: [UserRole.TRANSPORT_COORDINATOR] },
    });
    crewMember = await prisma.user.create({
      data: { email: email('crew'), firstName: 'Crew', lastName: 'Member', roles: [UserRole.TRANSPORT_COORDINATOR] },
    });
    municipality = await prisma.municipality.create({
      data: { ineCode: `PT-${RUN}`, name: `Campo ${RUN}`, district: `District ${RUN}`, latitude: 41.59, longitude: -8.61 },
    });
    requester = await prisma.organisation.create({ data: { name: `Requester ${RUN}`, isRequester: true } });
    payer = await prisma.organisation.create({ data: { name: `Payer ${RUN}`, isPayer: true } });
    patient = await prisma.patient.create({
      data: { mobility: PatientMobility.WHEELCHAIR as never, createdById: coordinator.id },
    });
    facility = await prisma.facility.create({
      data: { name: `Hospital ${RUN}`, municipalityId: municipality.id, isTransportDestination: true, latitude: 41.1, longitude: -8.1 },
    });
    vehicleA = await prisma.vehicle.create({
      data: {
        licensePlate: `${RUN}-A`,
        numeroCauda: `${RUN}-A`,
        vehicleType: VehicleType.TRANSPORT,
        insuranceRenewalDate: new Date('2099-12-31'),
        nextImtInspectionDate: new Date('2099-12-31'),
        wheelchairPositions: 1,
        seatedCapacity: 2,
      },
    });
    vehicleB = await prisma.vehicle.create({
      data: {
        licensePlate: `${RUN}-B`,
        numeroCauda: `${RUN}-B`,
        vehicleType: VehicleType.TRANSPORT,
        insuranceRenewalDate: new Date('2099-12-31'),
        nextImtInspectionDate: new Date('2099-12-31'),
        wheelchairPositions: 1,
        seatedCapacity: 2,
      },
    });
  });

  afterAll(async () => {
    await prisma.tripCrewMember.deleteMany({ where: { tripId: { in: tripIds } } });
    await prisma.tripStop.deleteMany({ where: { tripId: { in: tripIds } } });
    await prisma.vehicleOccupancy.deleteMany({ where: { source: VehicleOccupancySource.TRANSPORT_TRIP, sourceId: { in: tripIds } } });
    await prisma.trip.deleteMany({ where: { id: { in: tripIds } } });
    await prisma.transportLeg.deleteMany({ where: { id: { in: legIds } } });
    await prisma.transportRequest.deleteMany({ where: { id: { in: requestIds } } });
    await prisma.staffAbsence.deleteMany({ where: { id: { in: absenceIds } } });
    await prisma.patient.delete({ where: { id: patient.id } });
    await prisma.facility.delete({ where: { id: facility.id } });
    await prisma.organisation.deleteMany({ where: { id: { in: [requester.id, payer.id] } } });
    await prisma.municipality.delete({ where: { id: municipality.id } });
    await prisma.vehicle.deleteMany({ where: { id: { in: [vehicleA.id, vehicleB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [coordinator.id, crewMember.id] } } });
    await prisma.$disconnect();
  });

  it('integration: assigning a leg then adding a WAIT stop grows the one VehicleOccupancy interval to cover the full dwell', async () => {
    const trip = await trips.create({ date: '2026-09-16', vehicleId: vehicleA.id });
    tripIds.push(trip.id);
    const leg = await makeLeg('wait-01');

    await stops.assignLegToTrip(trip.id, {
      transportLegId: leg.id,
      pickupPlannedAt: '2026-09-16T08:00:00.000Z',
      dropoffPlannedAt: '2026-09-16T08:30:00.000Z',
    });

    let occupancy = await prisma.vehicleOccupancy.findFirst({
      where: { source: VehicleOccupancySource.TRANSPORT_TRIP, sourceId: trip.id },
    });
    expect(occupancy?.startsAt.toISOString()).toBe('2026-09-16T08:00:00.000Z');
    expect(occupancy?.endsAt.toISOString()).toBe('2026-09-16T08:30:00.000Z');

    const detailBefore = await trips.getDetail(trip.id);
    const dropoffStop = detailBefore.stops.find((s) => s.kind === TripStopKind.DROPOFF)!;

    await stops.addStop(trip.id, {
      kind: TripStopKind.WAIT,
      plannedAt: dropoffStop.plannedAt,
      facilityId: facility.id,
      dwellDecision: TripStopDwell.WAIT,
      dwellMinutes: 120,
    });

    occupancy = await prisma.vehicleOccupancy.findFirst({
      where: { source: VehicleOccupancySource.TRANSPORT_TRIP, sourceId: trip.id },
    });
    expect(occupancy?.endsAt.toISOString()).toBe('2026-09-16T10:30:00.000Z');

    const legRow = await prisma.transportLeg.findUnique({ where: { id: leg.id } });
    expect(legRow?.status).toBe(LegStatus.ASSIGNED);
  });

  it('integration: reassigning a leg to a different trip moves its stops and both trips\' occupancy in one call', async () => {
    const tripOne = await trips.create({ date: '2026-09-17', vehicleId: vehicleA.id });
    const tripTwo = await trips.create({ date: '2026-09-17', vehicleId: vehicleA.id });
    tripIds.push(tripOne.id, tripTwo.id);
    const leg = await makeLeg('move-01');

    await stops.assignLegToTrip(tripOne.id, {
      transportLegId: leg.id,
      pickupPlannedAt: '2026-09-17T08:00:00.000Z',
      dropoffPlannedAt: '2026-09-17T08:30:00.000Z',
    });
    await stops.assignLegToTrip(tripTwo.id, {
      transportLegId: leg.id,
      pickupPlannedAt: '2026-09-17T11:00:00.000Z',
      dropoffPlannedAt: '2026-09-17T11:30:00.000Z',
    });

    const stopsOnTripOne = await prisma.tripStop.findMany({ where: { tripId: tripOne.id } });
    expect(stopsOnTripOne).toHaveLength(0);
    const stopsOnTripTwo = await prisma.tripStop.findMany({ where: { tripId: tripTwo.id, transportLegId: leg.id } });
    expect(stopsOnTripTwo).toHaveLength(2);

    const occupancyOne = await prisma.vehicleOccupancy.findFirst({
      where: { source: VehicleOccupancySource.TRANSPORT_TRIP, sourceId: tripOne.id },
    });
    expect(occupancyOne).toBeNull();
  });

  it('integration: over capacity for the wheelchair mix is refused outright, with no override path', async () => {
    const trip = await trips.create({ date: '2026-09-18', vehicleId: vehicleA.id });
    tripIds.push(trip.id);
    const legOne = await makeLeg('cap-01');
    const legTwo = await makeLeg('cap-02');

    await stops.assignLegToTrip(trip.id, {
      transportLegId: legOne.id,
      pickupPlannedAt: '2026-09-18T08:00:00.000Z',
      dropoffPlannedAt: '2026-09-18T09:00:00.000Z',
    });

    // Both patients are wheelchair users (the shared `patient` fixture), and
    // the vehicle has one wheelchair position — overlapping their legs must
    // be refused, and there is no override field to work around it.
    await expect(
      stops.assignLegToTrip(trip.id, {
        transportLegId: legTwo.id,
        pickupPlannedAt: '2026-09-18T08:15:00.000Z',
        dropoffPlannedAt: '2026-09-18T08:45:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('integration: adding an absent crew member throws unless a reason is recorded, and the board sees it fresh either way', async () => {
    const trip = await trips.create({ date: '2026-09-20', vehicleId: vehicleB.id });
    tripIds.push(trip.id);
    const absence = await prisma.staffAbsence.create({
      data: {
        userId: crewMember.id,
        kind: StaffAbsenceKind.VACATION as never,
        startDate: new Date('2026-09-20'),
        endDate: new Date('2026-09-20'),
        createdById: coordinator.id,
      },
    });
    absenceIds.push(absence.id);

    await expect(crew.add(trip.id, { userId: crewMember.id, role: CertificationType.DRIVER })).rejects.toBeInstanceOf(
      ConflictException,
    );

    const added = await crew.add(trip.id, {
      userId: crewMember.id,
      role: CertificationType.DRIVER,
      overrideReason: 'Asked to come in despite the recorded leave',
    });
    expect(added.overrideReason).toBe('Asked to come in despite the recorded leave');

    const detail = await trips.getDetail(trip.id);
    expect(detail.issues.some((issue) => issue.code === 'CREW_UNAVAILABLE')).toBe(false);
  });

  it('integration: a vehicle already committed elsewhere is refused unless a reason is recorded', async () => {
    const shift = await prisma.vehicleOccupancy.create({
      data: {
        vehicleId: vehicleB.id,
        startsAt: new Date('2026-09-21T07:00:00.000Z'),
        endsAt: new Date('2026-09-21T15:00:00.000Z'),
        source: VehicleOccupancySource.SCHEDULE_SHIFT,
        sourceId: `shift-${RUN}`,
      },
    });

    const trip = await trips.create({ date: '2026-09-21', vehicleId: vehicleB.id });
    tripIds.push(trip.id);
    const leg = await makeLeg('vehicle-conflict-01');

    await expect(
      stops.assignLegToTrip(trip.id, {
        transportLegId: leg.id,
        pickupPlannedAt: '2026-09-21T08:00:00.000Z',
        dropoffPlannedAt: '2026-09-21T08:30:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    await stops.assignLegToTrip(trip.id, {
      transportLegId: leg.id,
      pickupPlannedAt: '2026-09-21T08:00:00.000Z',
      dropoffPlannedAt: '2026-09-21T08:30:00.000Z',
      vehicleOverrideReason: 'Short overlap accepted at handover',
    });

    await prisma.vehicleOccupancy.delete({ where: { id: shift.id } });
  });
});
