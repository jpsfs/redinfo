import { PrismaClient } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import {
  PatientMobility,
  StaffAbsenceKind,
  TransportRequestDecision,
  TransportRequestOccurrenceType,
  TransportRequestVehicleType,
  UserRole,
  VehicleOccupancySource,
  VehicleType,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { FacilitiesService } from '../facilities/facilities.service';
import { GeographyService } from '../geography/geography.service';
import { DelegationSettingsService } from '../live-runs/delegation-settings.service';
import { StaffAbsencesService } from '../staff-absences/staff-absences.service';
import { VehicleOccupancyService } from '../vehicle-occupancy/vehicle-occupancy.service';
import { TransportRequestsService } from './transport-requests.service';

/**
 * Integration coverage for referral intake (#228), against a real Postgres —
 * the unit spec (`transport-requests.service.spec.ts`) covers the same
 * behaviour against a mocked Prisma; this proves what only a real database
 * answers: the `[requestingOrganisationId, externalServiceNumber]` unique
 * constraint, the create-if-missing facility path actually landing a row,
 * and that a worked-example referral reads back identically end to end.
 *
 * Skipped unless DATABASE_URL is set, and named so
 * `pnpm --filter backend test:integration` selects it.
 */
const describeIntegration = process.env.DATABASE_URL ? describe : describe.skip;

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const email = (local: string) => `${local}.${RUN}@transport-requests.test`;

describeIntegration('TransportRequestsService (integration)', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const facilities = new FacilitiesService(
    prisma,
    new GeographyService(prisma, new DelegationSettingsService(prisma)),
  );
  const staffAbsences = new StaffAbsencesService(prisma);
  const vehicleOccupancy = new VehicleOccupancyService(prisma);
  const transportRequests = new TransportRequestsService(prisma, facilities, staffAbsences, vehicleOccupancy);

  let coordinator: { id: string };
  let municipality: { id: string };
  let requester: { id: string; name: string };
  let payer: { id: string; name: string };
  let patient: { id: string };

  const createdRequestIds: string[] = [];
  const createdFacilityIds: string[] = [];
  const createdAbsenceIds: string[] = [];
  const createdVehicleIds: string[] = [];

  const track = <T extends { id: string }>(row: T): T => {
    createdRequestIds.push(row.id);
    return row;
  };

  /** The one worked example available for a referral: the AXA/Cesapp email
   * (#228), reproduced here with synthesised — not real — patient data per
   * that story's handling note. */
  const workedExample = () => ({
    batchReference: `Email ${RUN}`,
    communicatedAt: '2026-09-10T17:00:00.000Z',
    requesterAccountCode: `AZP-${RUN}`,
    responseDueAt: '2026-09-11T05:00:00.000Z',
    externalServiceNumber: `SVC-${RUN}`,
    appointmentAt: '2026-09-12T09:00:00.000Z',
    requestingOrganisationId: requester.id,
    payingOrganisationId: payer.id,
    patientId: patient.id,
    occurrenceType: TransportRequestOccurrenceType.CONSULTA,
    requestedVehicleType: TransportRequestVehicleType.TRANSPORTE,
    escortTravels: true,
    isRoundTrip: true,
    originAddress: `Rua de Teste, 42, ${RUN}`,
    freeTextMessage: 'Doente com mobilidade reduzida.',
    coordColumnValue: 'X',
  });

  beforeAll(async () => {
    coordinator = await prisma.user.create({
      data: {
        email: email('coordinator'),
        firstName: 'Coordinator',
        lastName: 'Test',
        roles: [UserRole.TRANSPORT_COORDINATOR],
        isActive: true,
      },
    });

    municipality = await prisma.municipality.create({
      data: {
        ineCode: `PT-${RUN}`,
        name: `Campo ${RUN}`,
        district: `District ${RUN}`,
        latitude: 41.5923783,
        longitude: -8.6117829,
      },
    });

    requester = await prisma.organisation.create({
      data: { name: `AXA Assistance ${RUN}`, isRequester: true },
    });
    payer = await prisma.organisation.create({ data: { name: `Allianz ${RUN}`, isPayer: true } });
    patient = await prisma.patient.create({
      data: { mobility: PatientMobility.WHEELCHAIR as never, createdById: coordinator.id },
    });
  });

  afterAll(async () => {
    await prisma.transportRequest.deleteMany({ where: { id: { in: createdRequestIds } } });
    await prisma.patient.delete({ where: { id: patient.id } });
    await prisma.facility.deleteMany({ where: { id: { in: createdFacilityIds } } });
    await prisma.staffAbsence.deleteMany({ where: { id: { in: createdAbsenceIds } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: createdVehicleIds } } });
    await prisma.organisation.deleteMany({ where: { id: { in: [requester.id, payer.id] } } });
    await prisma.municipality.deleteMany({ where: { district: `District ${RUN}` } });
    await prisma.user.delete({ where: { id: coordinator.id } });
    await prisma.$disconnect();
  });

  it('integration: a referral matching the worked example reads back identically end to end', async () => {
    const facility = await facilities.findOrCreateTransportDestination(
      `Hospital Privado de Braga ${RUN}`,
      municipality.id,
    );
    createdFacilityIds.push(facility.id);

    const created = track(
      await transportRequests.create(
        { ...workedExample(), destinationFacilityId: facility.id },
        { id: coordinator.id },
      ),
    );

    const read = await transportRequests.findOne(created.id);
    expect(read.batchReference).toBe(workedExample().batchReference);
    expect(read.externalServiceNumber).toBe(workedExample().externalServiceNumber);
    expect(read.requestingOrganisation?.id).toBe(requester.id);
    expect(read.payingOrganisation?.id).toBe(payer.id);
    expect(read.patientId).toBe(patient.id);
    expect(read.destinationFacility?.id).toBe(facility.id);
    expect(read.escortTravels).toBe(true);
    expect(read.isRoundTrip).toBe(true);
    expect(read.coordColumnValue).toBe('X');
    expect(read.decision).toBe(TransportRequestDecision.PENDING);
  });

  it('integration: the create-if-missing path actually lands a new transport destination', async () => {
    const uniqueName = `Clínica Nova ${RUN}`;
    const facility = await facilities.findOrCreateTransportDestination(uniqueName, municipality.id, 'Rua X', '4700-000');
    createdFacilityIds.push(facility.id);

    const created = track(
      await transportRequests.create(
        {
          ...workedExample(),
          externalServiceNumber: `SVC-CREATE-${RUN}`,
          destinationFacilityId: undefined,
          destinationFacility: { name: uniqueName, municipalityId: municipality.id },
        },
        { id: coordinator.id },
      ),
    );

    const persisted = await prisma.facility.findFirst({ where: { name: uniqueName, municipalityId: municipality.id } });
    expect(persisted?.isTransportDestination).toBe(true);
    expect(created.destinationFacility?.name).toBe(uniqueName);
  });

  it('integration: externalServiceNumber is unique per requesting organisation, not globally', async () => {
    const facility = await facilities.findOrCreateTransportDestination(`Hosp A ${RUN}`, municipality.id);
    createdFacilityIds.push(facility.id);
    const otherRequester = await prisma.organisation.create({
      data: { name: `Cruz Vermelha ${RUN}`, isRequester: true },
    });

    const shared = `SHARED-${RUN}`;
    track(
      await transportRequests.create(
        { ...workedExample(), externalServiceNumber: shared, destinationFacilityId: facility.id },
        { id: coordinator.id },
      ),
    );

    // Refused for the same requester...
    await expect(
      transportRequests.create(
        { ...workedExample(), externalServiceNumber: shared, destinationFacilityId: facility.id },
        { id: coordinator.id },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    // ...but free to reuse under a different one.
    const reused = track(
      await transportRequests.create(
        {
          ...workedExample(),
          externalServiceNumber: shared,
          requestingOrganisationId: otherRequester.id,
          destinationFacilityId: facility.id,
        },
        { id: coordinator.id },
      ),
    );
    expect(reused.externalServiceNumber).toBe(shared);

    // The FK is `Restrict` — the referencing request has to go first.
    await prisma.transportRequest.delete({ where: { id: reused.id } });
    await prisma.organisation.delete({ where: { id: otherRequester.id } });
  });

  it('integration: is queryable ordered by responseDueAt with time remaining computed', async () => {
    const facility = await facilities.findOrCreateTransportDestination(`Hosp B ${RUN}`, municipality.id);
    createdFacilityIds.push(facility.id);

    const soon = track(
      await transportRequests.create(
        {
          ...workedExample(),
          externalServiceNumber: `SOON-${RUN}`,
          responseDueAt: new Date(Date.now() + 60_000).toISOString(),
          destinationFacilityId: facility.id,
        },
        { id: coordinator.id },
      ),
    );
    const later = track(
      await transportRequests.create(
        {
          ...workedExample(),
          externalServiceNumber: `LATER-${RUN}`,
          responseDueAt: new Date(Date.now() + 3_600_000).toISOString(),
          destinationFacilityId: facility.id,
        },
        { id: coordinator.id },
      ),
    );

    const page = await transportRequests.findManaged(1, 200);
    const ids = page.data.map((r) => r.id);
    expect(ids.indexOf(soon.id)).toBeLessThan(ids.indexOf(later.id));

    const soonRow = page.data.find((r) => r.id === soon.id)!;
    expect(soonRow.minutesUntilResponseDue).toBeGreaterThan(0);
    expect(soonRow.minutesUntilResponseDue).toBeLessThanOrEqual(1);
  });

  it('integration: accepting does not set externallyRegisteredAt', async () => {
    const facility = await facilities.findOrCreateTransportDestination(`Hosp C ${RUN}`, municipality.id);
    createdFacilityIds.push(facility.id);
    const created = track(
      await transportRequests.create(
        { ...workedExample(), externalServiceNumber: `ACCEPT-${RUN}`, destinationFacilityId: facility.id },
        { id: coordinator.id },
      ),
    );

    const decided = await transportRequests.decide(
      created.id,
      { decision: TransportRequestDecision.ACCEPTED },
      { id: coordinator.id },
    );

    expect(decided.decision).toBe(TransportRequestDecision.ACCEPTED);
    expect(decided.externallyRegisteredAt).toBeFalsy();

    const row = await prisma.transportRequest.findUnique({ where: { id: created.id } });
    expect(row?.externallyRegisteredAt).toBeNull();
  });

  it('integration: registering externally requires an accepted referral, and is a one-way stamp', async () => {
    const facility = await facilities.findOrCreateTransportDestination(`Hosp D ${RUN}`, municipality.id);
    createdFacilityIds.push(facility.id);
    const created = track(
      await transportRequests.create(
        { ...workedExample(), externalServiceNumber: `EXTREG-${RUN}`, destinationFacilityId: facility.id },
        { id: coordinator.id },
      ),
    );

    await expect(transportRequests.registerExternally(created.id)).rejects.toBeInstanceOf(ConflictException);

    await transportRequests.decide(created.id, { decision: TransportRequestDecision.ACCEPTED }, { id: coordinator.id });
    const registered = await transportRequests.registerExternally(created.id);
    expect(registered.externallyRegisteredAt).toBeTruthy();

    await expect(transportRequests.registerExternally(created.id)).rejects.toBeInstanceOf(ConflictException);
  });

  it('integration: the feasibility snapshot joins the real roster, absences and vehicle occupancy for the appointment date', async () => {
    const facility = await facilities.findOrCreateTransportDestination(`Hosp E ${RUN}`, municipality.id);
    createdFacilityIds.push(facility.id);

    const absentUser = await prisma.user.create({
      data: {
        email: email('absent'),
        firstName: 'Ausente',
        lastName: 'Teste',
        roles: [UserRole.TRANSPORT_COORDINATOR],
        isActive: true,
      },
    });

    const absence = await prisma.staffAbsence.create({
      data: {
        userId: absentUser.id,
        kind: StaffAbsenceKind.VACATION as never,
        startDate: new Date('2026-09-12T00:00:00.000Z'),
        endDate: new Date('2026-09-12T00:00:00.000Z'),
        createdById: coordinator.id,
      },
    });
    createdAbsenceIds.push(absence.id);

    const freeVehicle = await prisma.vehicle.create({
      data: {
        licensePlate: `FR-${RUN}`,
        numeroCauda: `FR-${RUN}`,
        vehicleType: VehicleType.TRANSPORT as never,
        insuranceRenewalDate: new Date('2027-01-01T00:00:00.000Z'),
        nextImtInspectionDate: new Date('2027-01-01T00:00:00.000Z'),
      },
    });
    const committedVehicle = await prisma.vehicle.create({
      data: {
        licensePlate: `CM-${RUN}`,
        numeroCauda: `CM-${RUN}`,
        vehicleType: VehicleType.TRANSPORT as never,
        insuranceRenewalDate: new Date('2027-01-01T00:00:00.000Z'),
        nextImtInspectionDate: new Date('2027-01-01T00:00:00.000Z'),
      },
    });
    createdVehicleIds.push(freeVehicle.id, committedVehicle.id);
    await prisma.vehicleOccupancy.create({
      data: {
        vehicleId: committedVehicle.id,
        startsAt: new Date('2026-09-12T08:00:00.000Z'),
        endsAt: new Date('2026-09-12T12:00:00.000Z'),
        source: VehicleOccupancySource.SCHEDULE_SHIFT as never,
        sourceId: 'sched-fixture',
      },
    });

    const created = track(
      await transportRequests.create(
        {
          ...workedExample(),
          externalServiceNumber: `FEAS-${RUN}`,
          appointmentAt: '2026-09-12T09:00:00.000Z',
          requestedVehicleType: TransportRequestVehicleType.TRANSPORTE,
          destinationFacilityId: facility.id,
        },
        { id: coordinator.id },
      ),
    );

    const feasibility = await transportRequests.getFeasibility(created.id);
    expect(feasibility.date).toBe('2026-09-12');
    expect(feasibility.absentStaff.some((a) => a.userId === absentUser.id)).toBe(true);
    expect(feasibility.committedVehicles.some((v) => v.vehicleId === committedVehicle.id)).toBe(true);
    const transportGroup = feasibility.freeVehiclesByType.find((g) => g.vehicleType === VehicleType.TRANSPORT)!;
    expect(transportGroup.vehicles.some((v) => v.id === freeVehicle.id)).toBe(true);
    expect(transportGroup.vehicles.some((v) => v.id === committedVehicle.id)).toBe(false);
    expect(feasibility.requestedVehicleTypeFree).toBe(true);

    await prisma.vehicleOccupancy.deleteMany({ where: { vehicleId: { in: [freeVehicle.id, committedVehicle.id] } } });
    await prisma.user.delete({ where: { id: absentUser.id } });
  });
});
