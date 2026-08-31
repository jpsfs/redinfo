import { PrismaClient } from '@prisma/client';
import {
  EventLocationType,
  EventReportInput,
  EventReportType,
  Gender,
  UserRole,
  VictimDestinationKind,
  VolunteerHoursSource,
  VolunteerHoursStatus,
  foldForSearch,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ShiftScheduleService } from '../availability/shift-schedule.service';
import { HolidaysService } from '../availability/holidays.service';
import { EventReportsService } from '../event-reports/event-reports.service';
import { EventReportNumbering } from '../event-reports/event-report-numbering';
import { StockMovementsService } from '../inventory/stock-movements.service';
import { VolunteerHoursService } from '../volunteer-hours/volunteer-hours.service';
import { StatisticsPeopleService } from './statistics-people.service';
import { StatisticsActivityService } from './statistics-activity.service';
import { StatisticsFleetService } from './statistics-fleet.service';

/**
 * Integration coverage for the `/statistics/*` aggregations, against a real
 * Postgres. What only a real database proves — and every unit spec in this
 * module (mocked Prisma) cannot: the joins through `Locality`→`Municipality`
 * and `EventReportVictim`→`Hospital` resolve, the raw field names match the
 * schema, and the three services agree on the one report this suite files.
 */
const describeIntegration = process.env.DATABASE_URL ? describe : describe.skip;

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const email = (local: string) => `${local}.${RUN}@statistics.test`;

describeIntegration('Statistics module (integration)', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;

  let reports: EventReportsService;
  let people: StatisticsPeopleService;
  let activity: StatisticsActivityService;
  let fleet: StatisticsFleetService;

  let ana: { id: string };
  let bruno: { id: string };
  let municipality: { id: string };
  let locality: { id: string };
  let hospital: { id: string };
  let vehicle: { id: string };

  const createdReportIds: string[] = [];
  const createdEntryIds: string[] = [];

  const FROM = '2029-01-01';
  const TO = '2029-01-31';

  beforeAll(async () => {
    const holidays = new HolidaysService(prisma);
    const shiftSchedule = new ShiftScheduleService(holidays, prisma);
    reports = new EventReportsService(prisma, shiftSchedule, new EventReportNumbering(), new StockMovementsService(prisma));

    const noopVolunteerHours = { refreshGeneration: async () => undefined } as unknown as VolunteerHoursService;
    people = new StatisticsPeopleService(prisma, noopVolunteerHours);
    activity = new StatisticsActivityService(prisma);
    fleet = new StatisticsFleetService(prisma);

    const makeUser = async (local: string) =>
      prisma.user.create({
        data: {
          email: email(local),
          firstName: local[0].toUpperCase() + local.slice(1),
          lastName: 'Test',
          roles: [UserRole.EMERGENCY_OPERATIONAL],
          isActive: true,
        },
      });
    ana = await makeUser('ana');
    bruno = await makeUser('bruno');

    municipality = await prisma.municipality.create({
      data: { ineCode: `IT-${RUN}`, name: `Statistics ${RUN}`, district: `District ${RUN}`, latitude: 40.2, longitude: -8.4 },
    });
    locality = await prisma.locality.create({
      data: { name: 'Taveiro', searchName: foldForSearch('Taveiro'), municipalityId: municipality.id },
    });
    hospital = await prisma.hospital.create({
      data: { name: `Hospital ${RUN}`, municipalityId: municipality.id },
    });
    vehicle = await prisma.vehicle.create({
      data: {
        licensePlate: `IT-${RUN}`,
        numeroCauda: `IT-${RUN}`,
        vehicleType: 'EMERGENCY',
        insuranceRenewalDate: new Date('2030-01-01T00:00:00.000Z'),
        nextImtInspectionDate: new Date('2030-01-01T00:00:00.000Z'),
      },
    });

    const input: EventReportInput = {
      type: EventReportType.EMERGENCY,
      occurredOn: '2029-01-15',
      startedAt: '2029-01-15T10:00:00.000Z',
      endedAt: '2029-01-15T11:00:00.000Z',
      activationAt: '2029-01-15T10:00:00.000Z',
      sceneArrivalAt: '2029-01-15T10:12:00.000Z',
      sceneDepartureAt: '2029-01-15T10:30:00.000Z',
      hospitalArrivalAt: '2029-01-15T10:45:00.000Z',
      availableAt: '2029-01-15T11:00:00.000Z',
      externalReference: `CODU-${RUN}`,
      locationType: EventLocationType.HOME,
      localityId: locality.id,
      operationalReport: '<p>Fixture report.</p>',
      crew: [{ userId: ana.id, roleName: 'Driver' }],
      vehicles: [{ vehicleId: vehicle.id, kilometres: 30 }],
      victims: [
        {
          gender: Gender.FEMALE,
          age: 40,
          destinationKind: VictimDestinationKind.HOSPITAL,
          destinationHospitalId: hospital.id,
        },
      ],
    };
    const created = await reports.create(input, ana.id);
    createdReportIds.push(created.id);

    const entry = await prisma.volunteerHoursEntry.create({
      data: {
        userId: bruno.id,
        source: VolunteerHoursSource.MANUAL,
        activityType: 'TRAINING',
        date: new Date('2029-01-10T00:00:00.000Z'),
        proposedMinutes: 90,
        minutes: 90,
        status: VolunteerHoursStatus.APPROVED,
        loggedById: bruno.id,
      },
    });
    createdEntryIds.push(entry.id);
  });

  afterAll(async () => {
    if (createdEntryIds.length) {
      await prisma.volunteerHoursEntry.deleteMany({ where: { id: { in: createdEntryIds } } });
    }
    if (createdReportIds.length) {
      await prisma.eventReport.deleteMany({ where: { id: { in: createdReportIds } } });
    }
    await prisma.hospital.deleteMany({ where: { name: { contains: RUN } } });
    await prisma.vehicle.deleteMany({ where: { id: vehicle.id } });
    await prisma.municipality.deleteMany({ where: { district: `District ${RUN}` } });
    await prisma.user.deleteMany({ where: { email: { contains: RUN } } });
  });

  it('reports the manually-logged hours and the crewed event on the roster', async () => {
    const stats = await people.getStatistics({ from: FROM, to: TO }, bruno.id);
    expect(stats.totalApprovedHours).toBeGreaterThanOrEqual(1.5);
    const brunoRow = stats.roster.find((r) => r.userId === bruno.id);
    const anaRow = stats.roster.find((r) => r.userId === ana.id);
    expect(brunoRow).toMatchObject({ hours: 1.5 });
    expect(anaRow).toMatchObject({ events: 1, emergencyEvents: 1 });
    expect(stats.viewer.hours).toBe(1.5);
  });

  it('resolves the report through Locality → Municipality and Victim → Hospital', async () => {
    const stats = await activity.getStatistics({ from: FROM, to: TO });
    expect(stats.totalEvents).toBeGreaterThanOrEqual(1);
    expect(stats.eventsByLocality.some((l) => l.id === locality.id)).toBe(true);
    expect(stats.eventsByMunicipality.some((m) => m.id === municipality.id)).toBe(true);
    expect(stats.destinationHospitals.some((h) => h.id === hospital.id)).toBe(true);
    expect(stats.activationHeatmap.reduce((sum, b) => sum + b.count, 0)).toBeGreaterThanOrEqual(1);
  });

  it('sums the vehicle kilometres and the chronology legs off the same report', async () => {
    const stats = await fleet.getStatistics({ from: FROM, to: TO });
    expect(stats.totalKilometres).toBeGreaterThanOrEqual(30);
    expect(stats.vehicles.some((v) => v.vehicleId === vehicle.id)).toBe(true);
    const activationLeg = stats.responseLegs.find((l) => l.leg === 'ACTIVATION_TO_SCENE')!;
    expect(activationLeg.medianMinutes).not.toBeNull();
    expect(stats.totalDurationMedianMinutes).not.toBeNull();
  });
});
