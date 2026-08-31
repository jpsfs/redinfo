import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import {
  AbcdeBand,
  AvailabilityWindowCategory,
  BloodType,
  CertificationType,
  DEFAULT_DELEGATION_SETTINGS,
  DRIVER_ROLE_NAME,
  EventLocationType,
  EventReportType,
  Gender,
  InemSupportUnitType,
  LiveRunState,
  UserRole,
  VehicleType,
  VictimDestinationKind,
  VolunteerActivityType,
  emergencyWindowName,
  foldForSearch,
  toMinuteOfDay,
} from '@redinfo/shared';
import { PrismaService } from '../src/prisma/prisma.service';
import { addDays, isoDateRange, parseIsoDate, toIsoDate } from '../src/utils/date.util';
import { HolidaysService } from '../src/availability/holidays.service';
import { ShiftScheduleService } from '../src/availability/shift-schedule.service';
import { AvailabilityWindowsService } from '../src/availability/availability-windows.service';
import { AvailabilityService, RequestUser } from '../src/availability/availability.service';
import { SchedulesService } from '../src/schedules/schedules.service';
import { ScheduleAssignmentsService } from '../src/schedules/schedule-assignments.service';
import { ScheduleAutofillService } from '../src/schedules/schedule-autofill.service';
import { VolunteerHoursService } from '../src/volunteer-hours/volunteer-hours.service';
import { EventReportsService } from '../src/event-reports/event-reports.service';
import { EventReportNumbering } from '../src/event-reports/event-report-numbering';

/**
 * Rich fixtures for manual testing against the running dev stack — the
 * `docker compose up` database, and that one alone.
 *
 * `prisma/seed.ts` stays the deployable minimum (an admin, the inventory
 * templates, holidays, geography): it runs against every environment,
 * including a fresh production database, so it can only ever contain what a
 * real delegation would want there on day one. This script is the opposite —
 * a whole imagined delegation (Cruz Vermelha Portuguesa — Delegação de Campo,
 * per `DEFAULT_DELEGATION_SETTINGS`) with volunteers, a fleet, months of
 * availability and schedules, volunteer hours and filed reports — so that
 * every screen has something to look at without clicking through a wizard
 * first. Never run against the integration-test database or anywhere a real
 * delegation's data might end up.
 *
 * Run after the base seed: `pnpm prisma:seed:dev` runs both in order. Dates
 * are computed from whenever it actually runs (last/this/next calendar
 * month), not hardcoded, so the data still looks current a year from now.
 *
 * Idempotency is a single guard, not a per-row upsert: this is throwaway dev
 * data, not something a redeploy must reconcile. Re-seeding a database that
 * already has it is refused outright — reset the database first
 * (`prisma migrate reset`) if a clean slate is wanted.
 */

const prisma = new PrismaClient() as unknown as PrismaService;

const DEV_PASSWORD = 'Volunteer123!';

const pad2 = (n: number) => String(n).padStart(2, '0');

function emailFor(firstName: string, lastName: string): string {
  const local = `${foldForSearch(firstName)} ${foldForSearch(lastName)}`.trim().replace(/ /g, '.');
  return `${local}@redcross.local`;
}

/** The calendar month `delta` months from `base` — negative for the past. */
function shiftMonth(base: Date, delta: number): { year: number; month: number } {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/** Last day of a 1-based calendar month, as `YYYY-MM-DD`. */
function lastDayOfMonth(year: number, month: number): string {
  return toIsoDate(new Date(Date.UTC(year, month, 0)));
}

async function locality(name: string, municipalityName: string) {
  return prisma.locality.findFirstOrThrow({ where: { name, municipality: { name: municipalityName } } });
}

async function hospital(name: string) {
  return prisma.hospital.findFirstOrThrow({ where: { name } });
}

interface CertGrant {
  type: CertificationType;
  validUntil?: string | null;
  issuedOn?: string | null;
  notes?: string;
}

interface UserFixture {
  key: string;
  firstName: string;
  lastName: string;
  roles: UserRole[];
  isActive?: boolean;
  phone: string;
  birthDate: string;
  joinedOn: string;
  addressLine: string;
  postalCode: string;
  localityName: string;
  municipalityName: string;
  nif: string;
  redCrossNumber: string;
  volunteerNumber?: string;
  citizenCardNumber: string;
  bloodType?: BloodType;
  emergencyContactName: string;
  emergencyContactPhone: string;
  locale?: string;
  certs: CertGrant[];
}

async function main() {
  const admin = await prisma.user.findUnique({ where: { email: 'admin@redcross.local' } });
  if (!admin) {
    throw new Error(
      'admin@redcross.local not found — run `pnpm prisma:seed` (the base seed) before this script.',
    );
  }

  const already = await prisma.user.findUnique({ where: { email: emailFor('Mariana', 'Alves') } });
  if (already) {
    console.log('Dev fixtures already applied — skipping (Mariana Alves exists).');
    return;
  }

  const now = new Date();
  const isoAgo = (days: number) => toIsoDate(addDays(now, -days));
  const isoAhead = (days: number) => toIsoDate(addDays(now, days));

  // ── Delegation settings ──────────────────────────────────────────────────
  await prisma.delegationSettings.upsert({
    where: { id: 'delegation' },
    create: { id: 'delegation', ...DEFAULT_DELEGATION_SETTINGS },
    update: { ...DEFAULT_DELEGATION_SETTINGS },
  });
  console.log('✅ Delegation settings set (Cruz Vermelha Portuguesa — Delegação de Campo).');

  // ── Users ─────────────────────────────────────────────────────────────────
  // A small field roster around Barcelos (Braga), where the delegation's base
  // actually is per `DEFAULT_DELEGATION_SETTINGS` — Campo itself, plus the
  // neighbouring freguesias and Esposende volunteers commute from.
  const fixtures: UserFixture[] = [
    {
      key: 'mariana',
      firstName: 'Mariana',
      lastName: 'Alves',
      // Dual-role dev fixture: a coordinator who is also a System
      // Administrator — the exact "can do both" case multi-role exists for.
      roles: [UserRole.EMERGENCY_COORDINATOR, UserRole.SYSTEM_ADMIN],
      phone: '+351 912 345 678',
      birthDate: '1985-03-12',
      joinedOn: '2012-05-01',
      addressLine: 'Rua do Souto, 45',
      postalCode: '4750-329',
      localityName: 'União das Freguesias de Campo e Tamel (são Pedro Fins)',
      municipalityName: 'Barcelos',
      nif: '205111222',
      redCrossNumber: '100201',
      volunteerNumber: 'V-2012-01',
      citizenCardNumber: '10234567 8 ZZ4',
      bloodType: BloodType.O_POS,
      emergencyContactName: 'Carlos Alves',
      emergencyContactPhone: '+351 913 111 222',
      locale: 'pt',
      certs: [
        { type: CertificationType.DRIVER, issuedOn: '2012-06-01' },
        { type: CertificationType.TAS, issuedOn: '2013-01-10' },
      ],
    },
    {
      key: 'joaoP',
      firstName: 'João',
      lastName: 'Pinto',
      // Second dual-role dev fixture: a coordinator who is also field
      // personnel — the other "can do both" case from the same request.
      roles: [UserRole.EMERGENCY_COORDINATOR, UserRole.EMERGENCY_OPERATIONAL],
      phone: '+351 913 456 789',
      birthDate: '1988-07-22',
      joinedOn: '2014-02-15',
      addressLine: 'Rua de Santo António, 12',
      postalCode: '4750-011',
      localityName: 'Barcelinhos',
      municipalityName: 'Barcelos',
      nif: '206222333',
      redCrossNumber: '100202',
      volunteerNumber: 'V-2014-03',
      citizenCardNumber: '11234567 8 ZZ2',
      bloodType: BloodType.A_POS,
      emergencyContactName: 'Sofia Pinto',
      emergencyContactPhone: '+351 913 222 333',
      certs: [
        { type: CertificationType.DRIVER, issuedOn: '2014-03-01' },
        { type: CertificationType.TAT, issuedOn: '2024-02-15', validUntil: '2027-02-15' },
      ],
    },
    {
      key: 'ricardo',
      firstName: 'Ricardo',
      lastName: 'Gonçalves',
      roles: [UserRole.LOGISTICS_COORDINATOR],
      phone: '+351 914 567 890',
      birthDate: '1979-11-02',
      joinedOn: '2009-09-01',
      addressLine: 'Rua das Areias, 8',
      postalCode: '4750-101',
      localityName: 'Areias',
      municipalityName: 'Barcelos',
      nif: '207333444',
      redCrossNumber: '100203',
      volunteerNumber: 'V-2009-05',
      citizenCardNumber: '12234567 8 ZZ1',
      bloodType: BloodType.B_POS,
      emergencyContactName: 'Teresa Gonçalves',
      emergencyContactPhone: '+351 913 333 444',
      certs: [{ type: CertificationType.DRIVER, issuedOn: '2010-01-15' }],
    },
    {
      key: 'ines',
      firstName: 'Inês',
      lastName: 'Marques',
      roles: [UserRole.EMERGENCY_OPERATIONAL],
      phone: '+351 915 678 901',
      birthDate: '1996-04-18',
      joinedOn: '2019-03-01',
      addressLine: 'Rua de Arcozelo, 22',
      postalCode: '4750-201',
      localityName: 'Arcozelo',
      municipalityName: 'Barcelos',
      nif: '208444555',
      redCrossNumber: '100204',
      volunteerNumber: 'V-2019-11',
      citizenCardNumber: '13234567 8 ZZ0',
      bloodType: BloodType.A_NEG,
      emergencyContactName: 'Paulo Marques',
      emergencyContactPhone: '+351 913 444 555',
      certs: [
        { type: CertificationType.DRIVER, issuedOn: '2019-06-01' },
        { type: CertificationType.SBV, issuedOn: '2023-11-30', validUntil: '2026-11-30' },
      ],
    },
    {
      key: 'tiago',
      firstName: 'Tiago',
      lastName: 'Correia',
      roles: [UserRole.EMERGENCY_OPERATIONAL],
      phone: '+351 916 789 012',
      birthDate: '1993-09-09',
      joinedOn: '2017-06-10',
      addressLine: 'Rua de Aldreu, 3',
      postalCode: '4750-215',
      localityName: 'Aldreu',
      municipalityName: 'Barcelos',
      nif: '209555666',
      redCrossNumber: '100205',
      volunteerNumber: 'V-2017-07',
      citizenCardNumber: '14234567 8 ZZ9',
      bloodType: BloodType.O_NEG,
      emergencyContactName: 'Rita Correia',
      emergencyContactPhone: '+351 913 555 666',
      certs: [
        { type: CertificationType.DRIVER, issuedOn: '2017-09-01' },
        { type: CertificationType.TAT, issuedOn: '2024-06-10', validUntil: '2027-06-10' },
      ],
    },
    {
      key: 'beatriz',
      firstName: 'Beatriz',
      lastName: 'Lopes',
      roles: [UserRole.EMERGENCY_OPERATIONAL],
      phone: '+351 917 890 123',
      birthDate: '1999-12-30',
      joinedOn: '2021-01-20',
      addressLine: 'Rua de Airó, 60',
      postalCode: '4750-222',
      localityName: 'Airó',
      municipalityName: 'Barcelos',
      nif: '210666777',
      redCrossNumber: '100206',
      volunteerNumber: 'V-2021-02',
      citizenCardNumber: '15234567 8 ZZ8',
      emergencyContactName: 'Manuel Lopes',
      emergencyContactPhone: '+351 913 666 777',
      certs: [{ type: CertificationType.SBV, issuedOn: '2023-12-01', validUntil: '2026-12-01' }],
    },
    {
      key: 'diogo',
      firstName: 'Diogo',
      lastName: 'Ribeiro',
      roles: [UserRole.EMERGENCY_OPERATIONAL],
      phone: '+351 918 901 234',
      birthDate: '1982-02-14',
      joinedOn: '2008-04-01',
      addressLine: 'Rua da Silva, 17',
      postalCode: '4750-230',
      localityName: 'Silva',
      municipalityName: 'Barcelos',
      nif: '211777888',
      redCrossNumber: '100207',
      volunteerNumber: 'V-2008-02',
      citizenCardNumber: '16234567 8 ZZ7',
      bloodType: BloodType.AB_POS,
      emergencyContactName: 'Ana Ribeiro',
      emergencyContactPhone: '+351 913 777 888',
      certs: [
        { type: CertificationType.DRIVER, issuedOn: '2008-07-01' },
        { type: CertificationType.TAS, issuedOn: '2011-05-01' },
      ],
    },
    {
      key: 'sara',
      firstName: 'Sara',
      lastName: 'Teixeira',
      roles: [UserRole.EMERGENCY_OPERATIONAL],
      phone: '+351 919 012 345',
      birthDate: '1997-06-25',
      joinedOn: '2020-08-15',
      addressLine: 'Avenida da Praia, 5',
      postalCode: '4740-204',
      localityName: 'Esposende',
      municipalityName: 'Esposende',
      nif: '212888999',
      redCrossNumber: '100208',
      volunteerNumber: 'V-2020-09',
      citizenCardNumber: '17234567 8 ZZ6',
      emergencyContactName: 'Nuno Teixeira',
      emergencyContactPhone: '+351 913 888 999',
      // Expiring soon — inside the 183-day warning window from today, to
      // exercise the certifications screen's "expiring" state.
      certs: [{ type: CertificationType.SBV, issuedOn: '2023-08-15', validUntil: isoAhead(20) }],
    },
    {
      key: 'hugo',
      firstName: 'Hugo',
      lastName: 'Fernandes',
      roles: [UserRole.EMERGENCY_OPERATIONAL],
      phone: '+351 920 123 456',
      birthDate: '1990-01-05',
      joinedOn: '2015-05-05',
      addressLine: 'Rua de Fão, 30',
      postalCode: '4740-405',
      localityName: 'Fão',
      municipalityName: 'Esposende',
      nif: '213999000',
      redCrossNumber: '100209',
      volunteerNumber: 'V-2015-06',
      citizenCardNumber: '18234567 8 ZZ5',
      emergencyContactName: 'Marta Fernandes',
      emergencyContactPhone: '+351 913 999 000',
      // Lapsed DRIVER — his certifications page shows EXPIRED, and the
      // schedule fixtures below deliberately place him as Driver once anyway,
      // as a coordinator override with a recorded reason.
      certs: [{ type: CertificationType.DRIVER, issuedOn: '2015-08-01', validUntil: isoAgo(10) }],
    },
    {
      key: 'catarina',
      firstName: 'Catarina',
      lastName: 'Machado',
      roles: [UserRole.EMERGENCY_OPERATIONAL],
      phone: '+351 921 234 567',
      birthDate: '2001-10-10',
      joinedOn: isoAgo(45),
      addressLine: 'Rua de Manhente, 9',
      postalCode: '4750-241',
      localityName: 'Manhente',
      municipalityName: 'Barcelos',
      nif: '214000111',
      redCrossNumber: '100210',
      citizenCardNumber: '19234567 8 ZZ3',
      emergencyContactName: 'Jorge Machado',
      emergencyContactPhone: '+351 913 000 111',
      // A brand-new volunteer, awaiting her first certification — no rows.
      certs: [],
    },
    {
      key: 'nuno',
      firstName: 'Nuno',
      lastName: 'Barbosa',
      roles: [UserRole.EMERGENCY_OPERATIONAL],
      isActive: false,
      phone: '+351 922 345 678',
      birthDate: '1975-08-08',
      joinedOn: '2005-01-01',
      addressLine: 'Rua de Barcelos, 100',
      postalCode: '4750-001',
      localityName: 'Barcelos',
      municipalityName: 'Barcelos',
      nif: '215111222',
      redCrossNumber: '100211',
      volunteerNumber: 'V-2005-01',
      citizenCardNumber: '20234567 8 ZZ2',
      emergencyContactName: 'Elsa Barbosa',
      emergencyContactPhone: '+351 913 111 000',
      // Left the delegation — kept, deactivated, per the "never delete a
      // person" rule the schema documents throughout.
      certs: [
        { type: CertificationType.DRIVER, issuedOn: '2005-04-01' },
        { type: CertificationType.SBV, issuedOn: '2006-01-01' },
      ],
    },
  ];

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12);
  const users: Record<string, RequestUser> = {};

  for (const fixture of fixtures) {
    const loc = await locality(fixture.localityName, fixture.municipalityName);
    const created = await prisma.user.create({
      data: {
        email: emailFor(fixture.firstName, fixture.lastName),
        firstName: fixture.firstName,
        lastName: fixture.lastName,
        passwordHash,
        roles: fixture.roles,
        isActive: fixture.isActive ?? true,
        phone: fixture.phone,
        birthDate: parseIsoDate(fixture.birthDate),
        joinedOn: parseIsoDate(fixture.joinedOn),
        addressLine: fixture.addressLine,
        postalCode: fixture.postalCode,
        localityId: loc.id,
        nif: fixture.nif,
        redCrossNumber: fixture.redCrossNumber,
        volunteerNumber: fixture.volunteerNumber,
        citizenCardNumber: fixture.citizenCardNumber,
        bloodType: fixture.bloodType,
        emergencyContactName: fixture.emergencyContactName,
        emergencyContactPhone: fixture.emergencyContactPhone,
        locale: fixture.locale,
      },
      select: { id: true },
    });
    // Kept as the fixture's own roles rather than read back from `created`:
    // Prisma's generated enum type and `@redinfo/shared`'s are structurally
    // separate types, and every service call below wants the latter.
    users[fixture.key] = { id: created.id, roles: fixture.roles };

    for (const cert of fixture.certs) {
      await prisma.userCertification.create({
        data: {
          userId: created.id,
          type: cert.type,
          validUntil: cert.validUntil ? parseIsoDate(cert.validUntil) : null,
          issuedOn: cert.issuedOn ? parseIsoDate(cert.issuedOn) : null,
          notes: cert.notes,
          createdById: fixture.roles.includes(UserRole.EMERGENCY_OPERATIONAL) ? users.mariana.id : admin.id,
        },
      });
    }
  }
  console.log(`✅ ${fixtures.length} volunteers created (password for all: ${DEV_PASSWORD}).`);

  const { mariana, joaoP, ines, tiago, beatriz, diogo, sara, hugo, catarina } = users;

  // ── Vehicles + inventory ─────────────────────────────────────────────────
  const emergencyTemplate = await prisma.inventoryTemplate.findUniqueOrThrow({
    where: { vehicleType: VehicleType.EMERGENCY },
    include: { items: { where: { isDeleted: false } } },
  });
  const transportTemplate = await prisma.inventoryTemplate.findUniqueOrThrow({
    where: { vehicleType: VehicleType.TRANSPORT },
    include: { items: { where: { isDeleted: false } } },
  });

  const vehicleFixtures = [
    {
      key: 'ambulance1',
      licensePlate: 'AA-11-BB',
      numeroCauda: '01',
      vehicleType: VehicleType.EMERGENCY,
      manufacturer: 'Mercedes-Benz',
      model: 'Sprinter 316 CDI',
      notes: 'Ambulância de Socorro (SIB).',
      insuranceRenewalDate: isoAhead(150),
      nextImtInspectionDate: isoAhead(240),
      template: emergencyTemplate,
      shortfallItem: 'Oxygen Cylinder',
      unchecked: 'Pulse Oximeter' as string | null,
    },
    {
      key: 'ambulance2',
      licensePlate: 'AA-22-CC',
      numeroCauda: '02',
      vehicleType: VehicleType.EMERGENCY,
      manufacturer: 'Fiat',
      model: 'Ducato',
      notes: 'Ambulância de Socorro (SIB) — reserva.',
      // Due soon, deliberately: exercises the "upcoming inspection" alert.
      insuranceRenewalDate: isoAhead(200),
      nextImtInspectionDate: isoAhead(15),
      template: emergencyTemplate,
      shortfallItem: 'Bandages (assorted)',
      unchecked: null as string | null,
    },
    {
      key: 'transport1',
      licensePlate: 'AA-33-DD',
      numeroCauda: '03',
      vehicleType: VehicleType.TRANSPORT,
      manufacturer: 'Peugeot',
      model: 'Boxer',
      notes: 'Ambulância de Transporte.',
      insuranceRenewalDate: isoAhead(300),
      nextImtInspectionDate: isoAhead(180),
      template: transportTemplate,
      shortfallItem: 'Disposable Blanket',
      unchecked: null as string | null,
    },
  ];

  const vehicles: Record<string, { id: string }> = {};

  for (const fixture of vehicleFixtures) {
    const vehicle = await prisma.vehicle.create({
      data: {
        licensePlate: fixture.licensePlate,
        numeroCauda: fixture.numeroCauda,
        vehicleType: fixture.vehicleType,
        manufacturer: fixture.manufacturer,
        model: fixture.model,
        notes: fixture.notes,
        insuranceRenewalDate: parseIsoDate(fixture.insuranceRenewalDate),
        nextImtInspectionDate: parseIsoDate(fixture.nextImtInspectionDate),
      },
    });
    vehicles[fixture.key] = vehicle;

    for (const item of fixture.template.items) {
      const actualQuantity =
        item.name === fixture.unchecked
          ? null
          : item.name === fixture.shortfallItem && item.recommendedQuantity
            ? Math.max(item.recommendedQuantity - 1, 0)
            : item.recommendedQuantity;
      await prisma.vehicleInventoryItem.create({
        data: {
          vehicleId: vehicle.id,
          templateItemId: item.id,
          templateVersion: fixture.template.version,
          actualQuantity,
        },
      });
    }

    await prisma.maintenanceEntry.create({
      data: {
        vehicleId: vehicle.id,
        date: parseIsoDate(isoAgo(60)),
        description: 'Revisão periódica e mudança de óleo.',
        serviceProvider: 'Oficina Central de Barcelos, Lda.',
        cost: 185.5,
        vatAmount: 42.67,
      },
    });
  }
  console.log(`✅ ${vehicleFixtures.length} vehicles created, with inventory and a service history.`);

  // ── Availability, schedules, volunteer hours ─────────────────────────────
  const holidays = new HolidaysService(prisma);
  const shiftSchedule = new ShiftScheduleService(holidays, prisma);
  const windows = new AvailabilityWindowsService(prisma, shiftSchedule);
  const availability = new AvailabilityService(prisma, windows, shiftSchedule);
  const schedules = new SchedulesService(prisma, shiftSchedule);
  const assignments = new ScheduleAssignmentsService(prisma, schedules, shiftSchedule);
  const autofill = new ScheduleAutofillService(prisma, schedules);
  const volunteerHours = new VolunteerHoursService(prisma, shiftSchedule);

  // How often each person declares themselves available, as "every `cycle`th
  // day, offset by `offset`" — enough to leave some shifts short-staffed (a
  // coordinator always has gaps to look at) without anyone working every
  // single day of the month.
  const rhythm: Array<{ user: RequestUser; cycle: number; offset: number }> = [
    { user: mariana, cycle: 3, offset: 0 },
    { user: joaoP, cycle: 4, offset: 1 },
    { user: ines, cycle: 3, offset: 1 },
    { user: tiago, cycle: 3, offset: 2 },
    { user: beatriz, cycle: 4, offset: 0 },
    { user: diogo, cycle: 2, offset: 0 },
    { user: sara, cycle: 4, offset: 3 },
    { user: hugo, cycle: 5, offset: 2 },
    { user: catarina, cycle: 3, offset: 0 },
  ];

  async function submitRhythm(windowId: string, dates: string[]) {
    const perUser = new Map<string, { date: string; slots: number[] }[]>();
    for (const date of dates) {
      const dayOfMonth = Number(date.slice(8, 10));
      const [pattern] = await shiftSchedule.getDefaultPatternForRange(date, date);
      const slots = pattern.shifts.map((shift) => shift.slot);
      for (const { user, cycle, offset } of rhythm) {
        if ((dayOfMonth + offset) % cycle !== 0) continue;
        const entries = perUser.get(user.id) ?? [];
        entries.push({ date, slots });
        perUser.set(user.id, entries);
      }
    }
    for (const { user } of rhythm) {
      const entries = perUser.get(user.id);
      if (!entries?.length) continue;
      await availability.submitMine(user, { windowId, entries });
    }
  }

  // Last calendar month — closed and published, so volunteer-hours has real
  // history to review (some entries past the 30-day auto-approval grace
  // period, some still pending it, depending on when this actually runs).
  const pastMonth = shiftMonth(now, -1);
  const pastWindow = await windows.open(
    {
      startDate: `${pastMonth.year}-${pad2(pastMonth.month)}-01`,
      endDate: lastDayOfMonth(pastMonth.year, pastMonth.month),
      category: AvailabilityWindowCategory.EMERGENCY,
      name: emergencyWindowName(pastMonth.month),
      acknowledgeOverlap: true,
    },
    mariana.id,
  );
  console.log(`  … opened last month's Emergency window (${pastWindow.startDate} – ${pastWindow.endDate})`);
  const pastDates = isoDateRange(pastWindow.startDate, pastWindow.endDate);
  await submitRhythm(pastWindow.id, pastDates);
  const pastSchedule = await schedules.create({ windowId: pastWindow.id }, mariana.id);

  // A deliberate coordinator override: Hugo's DRIVER certification lapsed
  // (see his fixture above), so he cannot be auto-placed as Driver — but a
  // coordinator may still assign him, with a reason on record.
  const overrideDate = pastDates[Math.min(19, pastDates.length - 1)];
  const [overridePattern] = await shiftSchedule.getDefaultPatternForRange(overrideDate, overrideDate);
  const overrideShift = overridePattern.shifts[0];
  const driverRole = pastWindow.roles!.find((role) => role.name === DRIVER_ROLE_NAME)!;
  await assignments.assign(
    pastSchedule.id,
    {
      date: overrideDate,
      slot: overrideShift.slot,
      userId: hugo.id,
      roleId: driverRole.id,
      overrideReason: 'Certificação de condutor caducada; coordenadora autoriza este turno até à renovação.',
    },
    mariana.id,
  );
  await autofill.autofill(pastSchedule.id, {}, mariana.id);
  await windows.close(pastWindow.id, mariana.id);
  const publishedPastSchedule = await schedules.publish(pastSchedule.id, mariana.id);
  void publishedPastSchedule;
  console.log("  … built, adjusted and published last month's schedule");

  // One local-support day within that same past month — a market-day
  // fixture, since a Thursday "Feira de Barcelos" is exactly the kind of
  // standby the delegation actually covers.
  const localSupportDate = `${pastMonth.year}-${pad2(pastMonth.month)}-10`;
  const localSupportWindow = await windows.open(
    {
      startDate: localSupportDate,
      endDate: localSupportDate,
      category: AvailabilityWindowCategory.LOCAL_SUPPORT,
      name: 'Feira de Barcelos',
      acknowledgeOverlap: true,
      days: [
        {
          date: localSupportDate,
          shifts: [{ startMinute: toMinuteOfDay(9), endMinute: toMinuteOfDay(19), vehiclesNeeded: 1 }],
        },
      ],
    },
    mariana.id,
  );
  for (const person of [diogo, tiago, beatriz, catarina]) {
    await availability.submitMine(person, {
      windowId: localSupportWindow.id,
      entries: [{ date: localSupportDate, slots: [1] }],
    });
  }
  const localSupportSchedule = await schedules.create({ windowId: localSupportWindow.id }, mariana.id);
  await autofill.autofill(localSupportSchedule.id, {}, mariana.id);
  await windows.close(localSupportWindow.id, mariana.id);
  const publishedLocalSupport = await schedules.publish(localSupportSchedule.id, mariana.id);
  console.log('  … built and published the Feira de Barcelos local-support schedule');

  // Next calendar month — open and in progress, as a coordinator planning
  // ahead would actually leave it: only the first ten days have submissions,
  // and the draft schedule autofills only what has been submitted so far.
  const nextMonth = shiftMonth(now, 1);
  const nextWindow = await windows.openMonth({ year: nextMonth.year, month: nextMonth.month }, mariana.id);
  const nextDates = isoDateRange(nextWindow.startDate, nextWindow.endDate).slice(0, 10);
  await submitRhythm(nextWindow.id, nextDates);
  const nextSchedule = await schedules.create({ windowId: nextWindow.id }, mariana.id);
  await autofill.autofill(nextSchedule.id, {}, mariana.id);
  void nextSchedule;
  console.log("  … opened and partially planned next month's Emergency window (still a draft)");

  // Materialises SCHEDULED volunteer-hours entries for every past, published
  // assignment above, and auto-approves whichever are already past the
  // 30-day grace period — exactly what the first coordinator to open the
  // review queue would trigger, done here so the data is there from the start.
  await volunteerHours.refreshGeneration();

  await volunteerHours.createManualEntry(diogo.id, {
    activityType: VolunteerActivityType.MEETING,
    date: isoAgo(6),
    minutes: 90,
    description: 'Reunião mensal de coordenação da tripulação.',
  });
  const [lastMeetingEntry] = await prisma.volunteerHoursEntry.findMany({
    where: { userId: diogo.id, activityType: VolunteerActivityType.MEETING },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });
  await volunteerHours.approve(lastMeetingEntry.id, mariana.id, {});

  await volunteerHours.createManualEntry(sara.id, {
    activityType: VolunteerActivityType.TRAINING,
    date: isoAgo(2),
    minutes: 180,
    description: 'Formação de reciclagem em Suporte Básico de Vida.',
  });

  await volunteerHours.createManualEntry(tiago.id, {
    activityType: VolunteerActivityType.OTHER,
    date: isoAgo(3),
    minutes: 60,
    description: 'Manutenção preventiva da viatura 02 na oficina.',
  });

  console.log('✅ Volunteer hours generated from the published schedules, plus a few manual entries.');

  // ── Event reports ─────────────────────────────────────────────────────────
  const eventReports = new EventReportsService(prisma, shiftSchedule, new EventReportNumbering());

  const barcelos = await locality('Barcelos', 'Barcelos');
  const campo = await locality('União das Freguesias de Campo e Tamel (são Pedro Fins)', 'Barcelos');
  const hospitalBraga = await hospital('Hospital de Braga');

  const emgDate = isoAgo(6);
  await eventReports.create(
    {
      type: EventReportType.EMERGENCY,
      occurredOn: emgDate,
      startedAt: `${emgDate}T21:10:00.000Z`,
      endedAt: `${emgDate}T22:40:00.000Z`,
      externalReference: `${emgDate.replace(/-/g, '')}00312`,
      locationType: EventLocationType.ROAD,
      localityId: barcelos.id,
      activationAt: `${emgDate}T21:10:00.000Z`,
      sceneArrivalAt: `${emgDate}T21:22:00.000Z`,
      sceneDepartureAt: `${emgDate}T21:55:00.000Z`,
      hospitalArrivalAt: `${emgDate}T22:15:00.000Z`,
      availableAt: `${emgDate}T22:40:00.000Z`,
      operationalReport:
        '<p>Acidente de viação com um veículo ligeiro despistado na EN205, próximo de Barcelos. ' +
        'Vítima consciente e orientada, imobilizada com colar cervical e plano duro. Transportada ' +
        'para o Hospital de Braga em condição estável.</p>',
      chamuCircumstances: 'Despiste de viatura ligeira, sem colisão com terceiros.',
      chamuHistory: 'Hipertensão arterial medicada.',
      chamuAllergies: 'Sem alergias conhecidas.',
      chamuMedication: 'Losartan 50mg, uma vez ao dia.',
      chamuLastMeal: 'Há cerca de 3 horas.',
      abcde: {
        [AbcdeBand.A]: { status: 'NORMAL' },
        [AbcdeBand.B]: { status: 'NORMAL' },
        [AbcdeBand.C]: { status: 'ALTERED', note: 'Taquicárdico, sem hemorragia visível.' },
        [AbcdeBand.D]: { status: 'NORMAL' },
        [AbcdeBand.E]: { status: 'NORMAL' },
      },
      assessments: [
        {
          takenAt: `${emgDate}T21:25:00.000Z`,
          systolic: 130,
          diastolic: 85,
          heartRate: 98,
          respiratoryRate: 18,
          spo2: 97,
          glasgow: 15,
          painScore: 4,
          bodyPosition: 'Decúbito dorsal, imobilizado em plano duro',
        },
      ],
      crew: [
        { userId: diogo.id, roleName: 'Driver' },
        { userId: mariana.id, roleName: 'Team Leader' },
        { userId: tiago.id, roleName: 'Team Member' },
      ],
      vehicles: [{ vehicleId: vehicles.ambulance1.id, kilometres: 24 }],
      victims: [
        {
          gender: Gender.MALE,
          age: 47,
          destinationKind: VictimDestinationKind.HOSPITAL,
          destinationHospitalId: hospitalBraga.id,
        },
      ],
      inemSupportUnits: [{ unitType: InemSupportUnitType.VMER, hospitalId: hospitalBraga.id }],
    },
    mariana.id,
    { submit: true, actor: mariana },
  );

  const draftDate = isoAgo(1);
  await eventReports.create(
    {
      type: EventReportType.EMERGENCY,
      occurredOn: draftDate,
      startedAt: `${draftDate}T18:05:00.000Z`,
      externalReference: `${draftDate.replace(/-/g, '')}00098`,
      locationType: EventLocationType.HOME,
      localityId: campo.id,
      operationalReport: '<p>Queda em casa. Relatório por finalizar pela equipa.</p>',
      crew: [{ userId: ines.id, roleName: 'Driver' }],
      vehicles: [],
      victims: [],
    },
    ines.id,
    { submit: false },
  );
  console.log('✅ Filed one Emergency report, left one as a draft (Pendentes).');

  const localSupportAssignments = await prisma.scheduleAssignment.findMany({
    where: { scheduleId: publishedLocalSupport.id },
    include: { role: true },
  });
  await eventReports.create(
    {
      type: EventReportType.LOCAL_SUPPORT,
      occurredOn: localSupportDate,
      startedAt: `${localSupportDate}T09:00:00.000Z`,
      endedAt: `${localSupportDate}T19:00:00.000Z`,
      locationType: EventLocationType.PUBLIC_SPACE,
      localityId: barcelos.id,
      operationalReport:
        '<p>Apoio sanitário à Feira de Barcelos. Equipa de prevenção presente durante todo o dia, ' +
        'sem intercorrências de maior.</p>',
      shift: { scheduleId: publishedLocalSupport.id, date: localSupportDate, slot: 1 },
      crew: localSupportAssignments.map((a) => ({ userId: a.userId, roleName: a.role?.name ?? null })),
      vehicles: [{ vehicleId: vehicles.transport1.id, kilometres: 9 }],
      victims: [{ gender: Gender.FEMALE, age: 68, destinationKind: VictimDestinationKind.TREATED_ON_SCENE }],
    },
    joaoP.id,
    { submit: true, actor: joaoP },
  );
  console.log('✅ Filed the Feira de Barcelos local-support report.');

  // ── One live run in progress ──────────────────────────────────────────────
  const aldreu = await locality('Aldreu', 'Barcelos');
  await prisma.liveRun.create({
    data: {
      id: randomUUID(),
      state: LiveRunState.EN_ROUTE,
      startedAt: new Date(Date.now() - 6 * 60_000),
      externalReference: `${toIsoDate(now).replace(/-/g, '')}00417`,
      chiefComplaint: 'Dor torácica súbita, doente consciente.',
      locationType: EventLocationType.HOME,
      localityId: aldreu.id,
      victimGender: Gender.FEMALE,
      victimAge: 71,
      vehicleId: vehicles.ambulance1.id,
      activationAt: new Date(Date.now() - 5 * 60_000),
      createdById: diogo.id,
      crew: {
        create: [
          { userId: diogo.id, roleName: 'Driver', position: 0 },
          { userId: mariana.id, roleName: 'Team Leader', position: 1 },
        ],
      },
    },
  });
  console.log('✅ One live run in progress, for the coordinator board.');

  console.log(`\n🎉 Dev fixtures loaded. Everyone above logs in with the password: ${DEV_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
