import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import {
  AbcdeBand,
  AvailabilityWindowCategory,
  AvdsLevel,
  BloodType,
  CertificationType,
  DEFAULT_DELEGATION_SETTINGS,
  DRIVER_ROLE_NAME,
  EmploymentContractKind,
  EstimatedEndSource,
  EventLocationType,
  EventReportType,
  Gender,
  InemSupportUnitType,
  LegCancellationSource,
  LegDirection,
  LegStatus,
  LiveRunState,
  PatientMobility,
  StaffAbsenceKind,
  TransportRequestDecision,
  TransportRequestOccurrenceType,
  TransportRequestVehicleType,
  TripStatus,
  TripStopKind,
  UserRole,
  VehicleOccupancySource,
  VehicleType,
  VictimDestinationKind,
  VolunteerActivityType,
  computeTripOccupancyWindow,
  emergencyWindowName,
  foldForSearch,
  toMinuteOfDay,
} from '@redinfo/shared';
import { PrismaService } from '../src/prisma/prisma.service';
import { addDays, isoDateRange, isoDayOfWeek, parseIsoDate, toIsoDate } from '../src/utils/date.util';
import { HolidaysService } from '../src/availability/holidays.service';
import { ShiftScheduleService } from '../src/availability/shift-schedule.service';
import { AvailabilityWindowsService } from '../src/availability/availability-windows.service';
import { AvailabilityService, RequestUser } from '../src/availability/availability.service';
import { SchedulesService } from '../src/schedules/schedules.service';
import { ScheduleAssignmentsService } from '../src/schedules/schedule-assignments.service';
import { ScheduleAutofillService } from '../src/schedules/schedule-autofill.service';
import { VolunteerHoursService } from '../src/volunteer-hours/volunteer-hours.service';
import { PaidStaffScheduleService } from '../src/paid-staff-schedule/paid-staff-schedule.service';
import { EmploymentContractsService } from '../src/employment-contracts/employment-contracts.service';
import { StaffAbsencesService } from '../src/staff-absences/staff-absences.service';
import { EventReportsService } from '../src/event-reports/event-reports.service';
import { EventReportNumbering } from '../src/event-reports/event-report-numbering';
import { StockMovementsService } from '../src/inventory/stock-movements.service';
import { IdentityCipher } from '../src/common/identity-cipher';
import { PatientsService } from '../src/patients/patients.service';
import { CreatePatientDto } from '../src/patients/dto/create-patient.dto';
import { DelegationSettingsService } from '../src/live-runs/delegation-settings.service';
import { OccurrenceTypePoliciesService } from '../src/transport-config/occurrence-type-policies.service';
import { GeographyService } from '../src/geography/geography.service';
import { FacilitiesService } from '../src/facilities/facilities.service';
import { VehicleOccupancyService } from '../src/vehicle-occupancy/vehicle-occupancy.service';
import { OrganisationsService } from '../src/organisations/organisations.service';
import { AgreementsService } from '../src/organisations/agreements.service';
import { CreateOrganisationDto } from '../src/organisations/dto/create-organisation.dto';
import { CreateAgreementDto } from '../src/organisations/dto/create-agreement.dto';
import { TransportRequestsService } from '../src/transport-requests/transport-requests.service';
import { CreateTransportRequestDto } from '../src/transport-requests/dto/create-transport-request.dto';
import { TransportRequestLegsService } from '../src/transport-requests/transport-request-legs.service';
import { TransportRequestTreatmentPlansService } from '../src/transport-requests/transport-request-treatment-plans.service';
import { CreateTreatmentPlanDto } from '../src/transport-requests/dto/create-treatment-plan.dto';
import { TripCrewService } from '../src/trips/trip-crew.service';
import { TripStopsService } from '../src/trips/trip-stops.service';
import { shiftBoundaryToInstant } from '../src/utils/timezone.util';

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
  return prisma.facility.findFirstOrThrow({ where: { name } });
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
      // Third dual-role dev fixture: logistics, and now non-urgent transport
      // too — the delegation's transports coordinator, exercising
      // `MANAGE_TRANSPORT_REQUESTS`/`MANAGE_PATIENTS`/`VIEW_PATIENT_IDENTITY`/
      // `MANAGE_TRANSPORT_CONFIG` for the fixtures built below.
      roles: [UserRole.LOGISTICS_COORDINATOR, UserRole.TRANSPORT_COORDINATOR],
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
      // The delegation's one contracted driver, for manual QA of the
      // employment-contract/volunteer-hours gate — see the `EmploymentContract`
      // and `PaidStaffSchedule` block created for him below.
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
      // Standard SIB layout: driver + one crew seat, one stretcher, no
      // wheelchair position or ramp — a plain emergency ambulance.
      seatedCapacity: 2,
      wheelchairPositions: 0,
      stretcherPositions: 1,
      hasRampOrLift: false,
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
      // Same class of vehicle, deliberately identical configuration — the
      // chip shouldn't need per-unit variation to be legible.
      seatedCapacity: 2,
      wheelchairPositions: 0,
      stretcherPositions: 1,
      hasRampOrLift: false,
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
      // Transport layout instead: more ambulatory seats, a wheelchair
      // position and a ramp, no stretcher — exercises the other half of the
      // chip's badge combinations against the emergency pair above.
      seatedCapacity: 6,
      wheelchairPositions: 1,
      stretcherPositions: 0,
      hasRampOrLift: true,
    },
    {
      key: 'transport2',
      licensePlate: 'AA-44-EE',
      numeroCauda: '04',
      vehicleType: VehicleType.TRANSPORT,
      manufacturer: 'Renault',
      model: 'Master',
      notes: 'Ambulância de Transporte — configuração de cadeiras de rodas.',
      insuranceRenewalDate: isoAhead(120),
      nextImtInspectionDate: isoAhead(260),
      template: transportTemplate,
      shortfallItem: null as string | null,
      unchecked: null as string | null,
      // Two wheelchair positions and fewer seats: the delegation's dialysis
      // rounds routinely carry two wheelchair patients at once, which a
      // single-position vehicle can never do — a real constraint the planner
      // has to route around, not a cosmetic difference.
      seatedCapacity: 4,
      wheelchairPositions: 2,
      stretcherPositions: 0,
      hasRampOrLift: true,
    },
    {
      key: 'transport3',
      licensePlate: 'AA-55-FF',
      numeroCauda: '05',
      vehicleType: VehicleType.TRANSPORT,
      manufacturer: 'Ford',
      model: 'Transit',
      notes: 'Carrinha de transporte de doentes — deslocações longas.',
      insuranceRenewalDate: isoAhead(210),
      nextImtInspectionDate: isoAhead(95),
      template: transportTemplate,
      shortfallItem: null as string | null,
      unchecked: null as string | null,
      // The long-haul vehicle: all seats, no wheelchair position, so the
      // Porto runs land here and the wheelchair rounds cannot.
      seatedCapacity: 8,
      wheelchairPositions: 0,
      stretcherPositions: 0,
      hasRampOrLift: false,
    },
    {
      key: 'transport4',
      licensePlate: 'AA-66-GG',
      numeroCauda: '06',
      vehicleType: VehicleType.TRANSPORT,
      manufacturer: 'Mercedes-Benz',
      model: 'Vito',
      notes: 'Ambulância de Transporte.',
      insuranceRenewalDate: isoAhead(170),
      nextImtInspectionDate: isoAhead(140),
      template: transportTemplate,
      shortfallItem: null as string | null,
      unchecked: null as string | null,
      // A second everyday transport van, on the road most of the week
      // alongside transport1/transport2 — this is the delegation growing its
      // fleet, not a special-purpose unit.
      seatedCapacity: 5,
      wheelchairPositions: 1,
      stretcherPositions: 0,
      hasRampOrLift: true,
    },
    {
      key: 'transport5',
      licensePlate: 'AA-77-HH',
      numeroCauda: '07',
      vehicleType: VehicleType.TRANSPORT,
      manufacturer: 'Citroën',
      model: 'Jumper',
      notes: 'Carrinha de transporte de doentes — deslocações longas.',
      insuranceRenewalDate: isoAhead(230),
      nextImtInspectionDate: isoAhead(110),
      template: transportTemplate,
      shortfallItem: null as string | null,
      unchecked: null as string | null,
      // A second long-haul van, alongside transport3 — the busiest days send
      // more than one vehicle up to Porto and still need capacity left over
      // for the local rounds.
      seatedCapacity: 7,
      wheelchairPositions: 0,
      stretcherPositions: 0,
      hasRampOrLift: false,
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
        seatedCapacity: fixture.seatedCapacity,
        wheelchairPositions: fixture.wheelchairPositions,
        stretcherPositions: fixture.stretcherPositions,
        hasRampOrLift: fixture.hasRampOrLift,
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
  const staffAbsences = new StaffAbsencesService(prisma);
  const schedules = new SchedulesService(prisma, shiftSchedule, staffAbsences);
  const paidStaffSchedule = new PaidStaffScheduleService(prisma);
  const volunteerHours = new VolunteerHoursService(prisma, shiftSchedule);
  const assignments = new ScheduleAssignmentsService(
    prisma,
    schedules,
    shiftSchedule,
    paidStaffSchedule,
    volunteerHours,
  );
  const autofill = new ScheduleAutofillService(prisma, schedules);
  const employmentContracts = new EmploymentContractsService(prisma);

  // Tiago's employment contract, so a shift that falls inside its contracted
  // hours generates nothing while one outside them still credits him like
  // any volunteer — exercises the salary path in manual QA. Open-ended,
  // Monday–Friday, office hours.
  const tiagoContract = await employmentContracts.create(
    tiago.id,
    { kind: EmploymentContractKind.FULL_TIME, startDate: '2020-01-01' },
    admin.id,
  );
  for (let dayOfWeek = 1; dayOfWeek <= 5; dayOfWeek += 1) {
    await paidStaffSchedule.addBlock(
      tiago.id,
      {
        contractId: tiagoContract.id,
        dayOfWeek,
        startMinute: toMinuteOfDay(8),
        endMinute: toMinuteOfDay(16),
        effectiveFrom: '2020-01-01',
      },
      admin.id,
    );
  }

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

  // ── Staff absences (#224) ─────────────────────────────────────────────────
  // Tiago's vacation overlaps day 7 of next month, one of the days his
  // `rhythm` entry (cycle 3, offset 2) makes him eligible for a shift on —
  // exactly the case the roster board's absence warning exists for. The
  // other two exercise the remaining kinds and colours on the calendar
  // without needing to land on a rostered day at all.
  await staffAbsences.create(
    {
      userId: tiago.id,
      kind: StaffAbsenceKind.VACATION,
      startDate: `${nextMonth.year}-${pad2(nextMonth.month)}-06`,
      endDate: `${nextMonth.year}-${pad2(nextMonth.month)}-08`,
      notes: 'Férias de verão.',
    },
    mariana.id,
  );
  await staffAbsences.create(
    {
      userId: beatriz.id,
      kind: StaffAbsenceKind.SICK_LEAVE,
      startDate: isoAgo(4),
      endDate: isoAgo(3),
      notes: 'Baixa médica — gripe.',
    },
    mariana.id,
  );
  await staffAbsences.create(
    {
      userId: ines.id,
      kind: StaffAbsenceKind.OTHER_PAID_LEAVE,
      startDate: `${nextMonth.year}-${pad2(nextMonth.month)}-20`,
      endDate: `${nextMonth.year}-${pad2(nextMonth.month)}-20`,
      // Partial day — the rare case: a couple of hours off, not the whole day.
      startTime: '09:00',
      endTime: '11:00',
      notes: 'Doação de sangue.',
    },
    mariana.id,
  );
  console.log('✅ Staff absences recorded (vacation, sick leave, other paid leave, one partial day).');

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
  const eventReports = new EventReportsService(
    prisma,
    shiftSchedule,
    new EventReportNumbering(),
    new StockMovementsService(prisma),
  );

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
          avds: AvdsLevel.A,
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
          destinationFacilityId: hospitalBraga.id,
        },
      ],
      inemSupportUnits: [{ unitType: InemSupportUnitType.VMER, facilityId: hospitalBraga.id }],
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

  // ── Non-urgent transport (#219, #226-231) ────────────────────────────────
  // Ricardo (now also TRANSPORT_COORDINATOR, see his fixture above) plays
  // the transports coordinator throughout: he creates the destinations,
  // parties, patients and referrals below, the same way one real person
  // would work the queue.
  const transportsCoordinator = users.ricardo;

  // Two transport destinations: `Hospital de Braga` already exists as an
  // emergency destination (seed-geography) and gains the second flag plus
  // the coordinates/address a transport destination requires; the dialysis
  // clinic is transport-only and dev-only, so it is created here rather than
  // in the base seed.
  await prisma.facility.update({
    where: { id: hospitalBraga.id },
    data: {
      isTransportDestination: true,
      addressLine: 'Sete Fontes, São Victor',
      postalCode: '4710-243',
      latitude: 41.5669,
      longitude: -8.4003,
    },
  });
  const dialysisClinic = await prisma.facility.create({
    data: {
      name: 'Clínica de Hemodiálise de Barcelos',
      municipalityId: barcelos.municipalityId,
      addressLine: 'Avenida Dr. Sidónio Pais, 210',
      postalCode: '4750-333',
      latitude: 41.5305,
      longitude: -8.618,
      isTransportDestination: true,
    },
  });
  // The local hospital, a door away from most of the pool's addresses — the
  // short hop that makes the long ones legible by contrast.
  const hospitalBarcelos = await hospital('Hospital Santa Maria Maior');
  await prisma.facility.update({
    where: { id: hospitalBarcelos.id },
    data: {
      isTransportDestination: true,
      addressLine: 'Campo da República',
      postalCode: '4750-269',
      latitude: 41.5314,
      longitude: -8.6205,
    },
  });

  // Porto: an hour each way from Barcelos, which is the whole point of
  // seeding it. A referral to São João or the IPO ties one vehicle up for
  // most of a morning, so it is the case where "which vehicle can still take
  // this?" stops being obvious — exactly what the planning board is for, and
  // what a Barcelos-only fixture set could never show.
  const saoJoao = await hospital('Centro Hospitalar Universitário de São João');
  await prisma.facility.update({
    where: { id: saoJoao.id },
    data: {
      isTransportDestination: true,
      addressLine: 'Alameda Prof. Hernâni Monteiro',
      postalCode: '4200-319',
      latitude: 41.1812,
      longitude: -8.6008,
    },
  });
  const santoAntonio = await hospital('Centro Hospitalar Universitário de Santo António');
  await prisma.facility.update({
    where: { id: santoAntonio.id },
    data: {
      isTransportDestination: true,
      addressLine: 'Largo do Prof. Abel Salazar',
      postalCode: '4099-001',
      latitude: 41.1494,
      longitude: -8.6181,
    },
  });
  const portoMunicipality = await prisma.municipality.findFirstOrThrow({ where: { name: 'Porto' } });
  const ipoPorto = await prisma.facility.create({
    data: {
      name: 'IPO Porto — Instituto Português de Oncologia',
      municipalityId: portoMunicipality.id,
      addressLine: 'Rua Dr. António Bernardino de Almeida, 865',
      postalCode: '4200-072',
      latitude: 41.1797,
      longitude: -8.5945,
      isTransportDestination: true,
    },
  });
  console.log(
    '✅ Six transport destinations: Hospital de Braga, the dialysis clinic, Santa Maria Maior (Barcelos), ' +
      'and three in Porto (São João, Santo António, IPO).',
  );

  // Organisations: a requesting health unit, the SNS as payer, and an
  // insurer that both requests and pays for its own referrals — the same
  // "one body, two roles" case the schema's own banner comment calls out.
  const identityCipher = new IdentityCipher();
  const patients = new PatientsService(prisma, identityCipher);
  const organisations = new OrganisationsService(prisma);
  const agreements = new AgreementsService(prisma);
  const delegationSettingsForFacilities = new DelegationSettingsService(prisma);
  const geography = new GeographyService(prisma, delegationSettingsForFacilities);
  const facilitiesForTransport = new FacilitiesService(prisma, geography);
  const vehicleOccupancy = new VehicleOccupancyService(prisma);
  const transportRequests = new TransportRequestsService(
    prisma,
    facilitiesForTransport,
    staffAbsences,
    vehicleOccupancy,
  );
  const occurrenceTypePolicies = new OccurrenceTypePoliciesService(prisma);
  const transportLegs = new TransportRequestLegsService(
    prisma,
    delegationSettingsForFacilities,
    occurrenceTypePolicies,
  );
  const treatmentPlans = new TransportRequestTreatmentPlansService(prisma, transportLegs);

  const orgUls = await organisations.create({
    name: 'ULS de Braga',
    taxId: '509876543',
    contactEmail: 'transportes@ulsbraga.min-saude.pt',
    contactPhone: '+351253027000',
    isRequester: true,
    references: [{ code: 'ULSB-0007', description: 'Código de cliente — envelope de referenciação' }],
  } satisfies CreateOrganisationDto);
  const orgArsNorte = await organisations.create({
    name: 'ARS Norte — Serviço Nacional de Saúde',
    taxId: '600054979',
    contactEmail: 'transportenaourgente@arsnorte.min-saude.pt',
    isPayer: true,
    references: [{ code: 'SNS-NORTE', description: 'Acordo de transporte não urgente' }],
  } satisfies CreateOrganisationDto);
  const orgAxa = await organisations.create({
    name: 'AXA Assistance',
    taxId: '980123456',
    contactEmail: 'transportes.pt@axa-assistance.com',
    contactPhone: '+351210000000',
    isRequester: true,
    isPayer: true,
    references: [{ code: 'AXA-PT-778', description: 'Código de conta — apólices Portugal' }],
  } satisfies CreateOrganisationDto);
  console.log('✅ Three organisations: ULS de Braga (requester), ARS Norte (payer), AXA Assistance (both).');

  const agreementSns = await agreements.create({
    payerOrganisationId: orgArsNorte.id,
    name: 'SNS — Serviço Nacional de Saúde',
    externalReference: 'ARSN-2026-014',
    validFrom: '2026-01-01',
    notes: 'Acordo-quadro de transporte não urgente, doentes crónicos.',
  } satisfies CreateAgreementDto);
  const agreementAxa = await agreements.create({
    payerOrganisationId: orgAxa.id,
    name: 'AXA Assistance — Transporte Não Urgente',
    externalReference: 'AXA-PT-2025-778',
    validFrom: '2025-09-01',
    validTo: '2026-12-31',
  } satisfies CreateAgreementDto);
  console.log('✅ Two agreements, one per payer.');

  // Patients: one of each mobility, so the vehicle-type/feasibility logic has
  // something to actually discriminate on, plus two more so the referral
  // queue and planning board aren't all leaning on the same three people.
  // Identity is sealed for three of the five, exercising
  // `VIEW_PATIENT_IDENTITY` in the patients list/detail.
  const airo = await locality('Airó', 'Barcelos');
  const manhente = await locality('Manhente', 'Barcelos');
  const barcelinhos = await locality('Barcelinhos', 'Barcelos');
  const arcozelo = await locality('Arcozelo', 'Barcelos');

  const patientAna = await patients.create(
    {
      mobility: PatientMobility.WHEELCHAIR,
      defaultLatitude: aldreu.latitude ?? undefined,
      defaultLongitude: aldreu.longitude ?? undefined,
      localityId: aldreu.id,
      contactAuthorisationRecorded: true,
      contactAuthorisationNote: 'Autorizado pelo doente em ficha de admissão.',
      identity: {
        fullName: 'Ana Beatriz Fonseca',
        telephone: '+351917123456',
        homeAddressLine: 'Rua de Aldreu, 118',
        homePostalCode: '4750-215',
        homeLocality: 'Aldreu',
        referenceContactName: 'Rui Fonseca',
        referenceContactRelationship: 'Filho',
        referenceContactTelephone: '+351917123457',
      },
    } satisfies CreatePatientDto,
    transportsCoordinator,
  );
  const patientCarlos = await patients.create(
    {
      mobility: PatientMobility.STRETCHER,
      needsOxygen: true,
      escortRequired: true,
      defaultLatitude: airo.latitude ?? undefined,
      defaultLongitude: airo.longitude ?? undefined,
      localityId: airo.id,
      referenceContactIsOrganisation: true,
      contactAuthorisationRecorded: false,
      contactAuthorisationNote: 'Aguarda autorização do doente para contactar o lar.',
      identity: {
        fullName: 'Carlos Manuel Oliveira',
        telephone: '+351918234567',
        homeAddressLine: 'Rua de Airó, 60',
        homePostalCode: '4750-222',
        homeLocality: 'Airó',
        referenceContactName: 'Lar de Santa Rita',
        referenceContactRelationship: 'Instituição de acolhimento',
        referenceContactTelephone: '+351253987654',
      },
    } satisfies CreatePatientDto,
    transportsCoordinator,
  );
  const patientFernanda = await patients.create(
    {
      mobility: PatientMobility.AMBULATORY,
      defaultLatitude: manhente.latitude ?? undefined,
      defaultLongitude: manhente.longitude ?? undefined,
      localityId: manhente.id,
    } satisfies CreatePatientDto,
    transportsCoordinator,
  );
  const patientJoaquim = await patients.create(
    {
      mobility: PatientMobility.AMBULATORY,
      defaultLatitude: barcelinhos.latitude ?? undefined,
      defaultLongitude: barcelinhos.longitude ?? undefined,
      localityId: barcelinhos.id,
      contactAuthorisationRecorded: true,
      contactAuthorisationNote: 'Autorizado pelo doente em ficha de admissão.',
      identity: {
        fullName: 'Joaquim Pereira Costa',
        telephone: '+351919345678',
        homeAddressLine: 'Rua de Santo António, 40',
        homePostalCode: '4750-011',
        homeLocality: 'Barcelinhos',
        referenceContactName: 'Marta Costa',
        referenceContactRelationship: 'Esposa',
        referenceContactTelephone: '+351919345679',
      },
    } satisfies CreatePatientDto,
    transportsCoordinator,
  );
  const patientRosa = await patients.create(
    {
      mobility: PatientMobility.WHEELCHAIR,
      escortRequired: true,
      defaultLatitude: arcozelo.latitude ?? undefined,
      defaultLongitude: arcozelo.longitude ?? undefined,
      localityId: arcozelo.id,
    } satisfies CreatePatientDto,
    transportsCoordinator,
  );
  console.log(
    '✅ Five patients: wheelchair, stretcher + oxygen + escort, ambulatory, and two more (ambulatory, wheelchair + escort) for referral variety.',
  );

  // Four referrals, covering every decision state plus the recurring plan:
  // pending, accepted-awaiting-external-registration, rejected, and
  // accepted-and-registered-with-a-treatment-plan.
  await transportRequests.create(
    {
      batchReference: 'EMAIL-2026-0341',
      communicatedAt: `${isoAgo(3)}T09:00:00.000Z`,
      requesterAccountCode: 'ULSB-0007',
      responseDueAt: `${isoAhead(4)}T17:00:00.000Z`,
      externalServiceNumber: 'ULSB-0341-01',
      appointmentAt: `${isoAhead(6)}T10:00:00.000Z`,
      requestingOrganisationId: orgUls.id,
      payingOrganisationId: orgArsNorte.id,
      agreementId: agreementSns.id,
      patientId: patientFernanda.id,
      occurrenceType: TransportRequestOccurrenceType.CONSULTA,
      requestedVehicleType: TransportRequestVehicleType.TRANSPORTE,
      originAddress: 'Rua de Manhente, 41, 4750-241 Manhente',
      originLatitude: manhente.latitude,
      originLongitude: manhente.longitude,
      destinationFacilityId: hospitalBraga.id,
      freeTextMessage: 'Consulta de cardiologia, 1ª vez.',
    } satisfies CreateTransportRequestDto,
    transportsCoordinator,
  );

  const requestAwaitingRegistration = await transportRequests.create(
    {
      batchReference: 'AXA-OUT-2026-0119',
      communicatedAt: `${isoAgo(2)}T14:30:00.000Z`,
      requesterAccountCode: 'AXA-PT-778',
      responseDueAt: `${isoAhead(1)}T12:00:00.000Z`,
      externalServiceNumber: 'AXA-0119-07',
      appointmentAt: `${isoAhead(2)}T08:00:00.000Z`,
      requestingOrganisationId: orgAxa.id,
      payingOrganisationId: orgAxa.id,
      agreementId: agreementAxa.id,
      patientId: patientCarlos.id,
      occurrenceType: TransportRequestOccurrenceType.ALTA,
      requestedVehicleType: TransportRequestVehicleType.AMBULANCIA,
      escortTravels: true,
      originAddress: 'Hospital de Braga — Serviço de Ortopedia',
      destinationFacilityId: hospitalBraga.id,
      freeTextMessage: 'Alta hospitalar, doente acamado, precisa de oxigénio durante o transporte.',
    } satisfies CreateTransportRequestDto,
    transportsCoordinator,
  );
  await transportRequests.decide(
    requestAwaitingRegistration.id,
    { decision: TransportRequestDecision.ACCEPTED },
    transportsCoordinator,
  );
  await transportLegs.generateOneOff(requestAwaitingRegistration.id);

  const requestRejected = await transportRequests.create(
    {
      batchReference: 'EMAIL-2026-0298',
      communicatedAt: `${isoAgo(10)}T09:00:00.000Z`,
      requesterAccountCode: 'ULSB-0007',
      responseDueAt: `${isoAgo(1)}T17:00:00.000Z`,
      externalServiceNumber: 'ULSB-0298-04',
      appointmentAt: `${isoAhead(3)}T09:30:00.000Z`,
      requestingOrganisationId: orgUls.id,
      payingOrganisationId: orgArsNorte.id,
      agreementId: agreementSns.id,
      patientId: patientFernanda.id,
      occurrenceType: TransportRequestOccurrenceType.EXAME,
      requestedVehicleType: TransportRequestVehicleType.TRANSPORTE,
      originAddress: 'Rua de Manhente, 41, 4750-241 Manhente',
      originLatitude: manhente.latitude,
      originLongitude: manhente.longitude,
      destinationFacilityId: hospitalBraga.id,
    } satisfies CreateTransportRequestDto,
    transportsCoordinator,
  );
  await transportRequests.decide(
    requestRejected.id,
    {
      decision: TransportRequestDecision.REJECTED,
      rejectionReason: 'Doente foi transportado por um familiar antes de recebermos resposta.',
    },
    transportsCoordinator,
  );

  const requestDialysis = await transportRequests.create(
    {
      batchReference: 'EMAIL-2026-0250',
      communicatedAt: `${isoAgo(20)}T09:00:00.000Z`,
      requesterAccountCode: 'ULSB-0007',
      responseDueAt: `${isoAgo(15)}T17:00:00.000Z`,
      externalServiceNumber: 'ULSB-0250-02',
      appointmentAt: `${isoAgo(14)}T08:30:00.000Z`,
      requestingOrganisationId: orgUls.id,
      payingOrganisationId: orgArsNorte.id,
      agreementId: agreementSns.id,
      patientId: patientAna.id,
      occurrenceType: TransportRequestOccurrenceType.TRATAMENTO,
      requestedVehicleType: TransportRequestVehicleType.TRANSPORTE,
      isRoundTrip: true,
      originAddress: 'Rua de Aldreu, 118, 4750-215 Aldreu',
      originLatitude: aldreu.latitude,
      originLongitude: aldreu.longitude,
      destinationFacilityId: dialysisClinic.id,
      freeTextMessage: 'Hemodiálise, 3x/semana até indicação em contrário.',
    } satisfies CreateTransportRequestDto,
    transportsCoordinator,
  );
  await transportRequests.decide(
    requestDialysis.id,
    { decision: TransportRequestDecision.ACCEPTED },
    transportsCoordinator,
  );
  await transportRequests.registerExternally(requestDialysis.id);
  console.log(
    '✅ Four referrals: pending, accepted (awaiting external registration), rejected, and accepted+registered.',
  );

  // Three more one-off referrals, spread out to (and just short of) the
  // 30-day planning horizon — a second pending one, a second accepted+
  // registered one (its leg left unassigned, so the planning board's
  // unassigned rail has something in it too), and one exercising the
  // otherwise-untouched `OUTRO` occurrence/vehicle type.
  await transportRequests.create(
    {
      batchReference: 'EMAIL-2026-0410',
      communicatedAt: `${isoAgo(1)}T09:00:00.000Z`,
      requesterAccountCode: 'ULSB-0007',
      responseDueAt: `${isoAhead(6)}T17:00:00.000Z`,
      externalServiceNumber: 'ULSB-0410-06',
      appointmentAt: `${isoAhead(9)}T10:00:00.000Z`,
      requestingOrganisationId: orgUls.id,
      payingOrganisationId: orgArsNorte.id,
      agreementId: agreementSns.id,
      patientId: patientRosa.id,
      occurrenceType: TransportRequestOccurrenceType.CONSULTA,
      requestedVehicleType: TransportRequestVehicleType.TRANSPORTE,
      originAddress: 'Rua de Arcozelo, 22, 4750-201 Arcozelo',
      originLatitude: arcozelo.latitude,
      originLongitude: arcozelo.longitude,
      destinationFacilityId: hospitalBraga.id,
      freeTextMessage: 'Consulta de ortopedia, seguimento.',
    } satisfies CreateTransportRequestDto,
    transportsCoordinator,
  );

  const requestFutureExame = await transportRequests.create(
    {
      batchReference: 'AXA-OUT-2026-0142',
      communicatedAt: `${isoAgo(1)}T11:00:00.000Z`,
      requesterAccountCode: 'AXA-PT-778',
      responseDueAt: `${isoAhead(10)}T12:00:00.000Z`,
      externalServiceNumber: 'AXA-0142-03',
      appointmentAt: `${isoAhead(16)}T09:30:00.000Z`,
      requestingOrganisationId: orgAxa.id,
      payingOrganisationId: orgAxa.id,
      agreementId: agreementAxa.id,
      patientId: patientRosa.id,
      occurrenceType: TransportRequestOccurrenceType.EXAME,
      requestedVehicleType: TransportRequestVehicleType.TRANSPORTE,
      originAddress: 'Rua de Arcozelo, 22, 4750-201 Arcozelo',
      originLatitude: arcozelo.latitude,
      originLongitude: arcozelo.longitude,
      destinationFacilityId: hospitalBraga.id,
      freeTextMessage: 'Ressonância magnética.',
    } satisfies CreateTransportRequestDto,
    transportsCoordinator,
  );
  await transportRequests.decide(
    requestFutureExame.id,
    { decision: TransportRequestDecision.ACCEPTED },
    transportsCoordinator,
  );
  await transportRequests.registerExternally(requestFutureExame.id);
  await transportLegs.generateOneOff(requestFutureExame.id);

  await transportRequests.create(
    {
      batchReference: 'EMAIL-2026-0455',
      communicatedAt: `${isoAgo(1)}T15:00:00.000Z`,
      requesterAccountCode: 'ULSB-0007',
      responseDueAt: `${isoAhead(25)}T17:00:00.000Z`,
      externalServiceNumber: 'ULSB-0455-01',
      appointmentAt: `${isoAhead(28)}T09:00:00.000Z`,
      requestingOrganisationId: orgUls.id,
      payingOrganisationId: orgArsNorte.id,
      agreementId: agreementSns.id,
      patientId: patientAna.id,
      occurrenceType: TransportRequestOccurrenceType.OUTRO,
      requestedVehicleType: TransportRequestVehicleType.OUTRO,
      originAddress: 'Rua de Aldreu, 118, 4750-215 Aldreu',
      originLatitude: aldreu.latitude,
      originLongitude: aldreu.longitude,
      destinationFacilityId: hospitalBraga.id,
      freeTextMessage: 'Transporte para levantamento de material ortopédico.',
    } satisfies CreateTransportRequestDto,
    transportsCoordinator,
  );
  console.log(
    '✅ Three more referrals out to the 30-day horizon: pending, accepted+registered (leg left unassigned), and OUTRO/OUTRO.',
  );

  // A second recurring series — weekly wound care, Tuesdays, a different
  // patient/destination/time-of-day than the dialysis plan below, so the
  // legs list and planning board see more than one recurrence shape.
  const requestWoundCare = await transportRequests.create(
    {
      batchReference: 'EMAIL-2026-0388',
      communicatedAt: `${isoAgo(8)}T09:00:00.000Z`,
      requesterAccountCode: 'ULSB-0007',
      responseDueAt: `${isoAgo(3)}T17:00:00.000Z`,
      externalServiceNumber: 'ULSB-0388-01',
      appointmentAt: `${isoAgo(7)}T09:00:00.000Z`,
      requestingOrganisationId: orgUls.id,
      payingOrganisationId: orgArsNorte.id,
      agreementId: agreementSns.id,
      patientId: patientJoaquim.id,
      occurrenceType: TransportRequestOccurrenceType.TRATAMENTO,
      requestedVehicleType: TransportRequestVehicleType.TRANSPORTE,
      isRoundTrip: true,
      originAddress: 'Rua de Santo António, 40, 4750-011 Barcelinhos',
      originLatitude: barcelinhos.latitude,
      originLongitude: barcelinhos.longitude,
      destinationFacilityId: hospitalBraga.id,
      freeTextMessage: 'Penso semanal, ferida cirúrgica, consulta de cirurgia geral.',
    } satisfies CreateTransportRequestDto,
    transportsCoordinator,
  );
  await transportRequests.decide(
    requestWoundCare.id,
    { decision: TransportRequestDecision.ACCEPTED },
    transportsCoordinator,
  );
  await transportRequests.registerExternally(requestWoundCare.id);
  await treatmentPlans.create(requestWoundCare.id, {
    destinationFacilityId: hospitalBraga.id,
    daysOfWeek: [2], // Tuesday
    treatmentStartTime: '09:00',
    treatmentEndTime: '09:30',
    validFrom: isoAgo(7),
    validTo: isoAhead(30),
    notes: 'Penso semanal, ferida cirúrgica, HB.',
  } satisfies CreateTreatmentPlanDto);
  console.log('✅ Second recurring series: weekly wound care, Tuesdays, Hospital de Braga.');

  // The dialysis referral's recurring series — `treatmentPlans.create`
  // materialises every leg the validity period + `daysOfWeek` implies, past
  // and future alike, the same call the plan's own edit screen makes.
  await treatmentPlans.create(requestDialysis.id, {
    destinationFacilityId: dialysisClinic.id,
    daysOfWeek: [1, 3, 5], // Monday, Wednesday, Friday
    treatmentStartTime: '08:30',
    treatmentEndTime: '12:30',
    validFrom: isoAgo(14),
    validTo: isoAhead(30),
    notes: 'Hemodiálise, 3x/semana, HD Barcelos.',
  } satisfies CreateTreatmentPlanDto);

  // A little history on the generated legs, through the same actions a
  // coordinator would actually take — never `status` written by hand.
  const dialysisLegs = await transportLegs.findAllForRequest(requestDialysis.id);
  const today = toIsoDate(now);
  // Sorted date, then direction (OUTBOUND before RETURN) — so index 0/1 are
  // one day's pair and index 2/3 the next day's, keeping the cancelled day
  // and the no-show day distinct rather than the same round trip.
  const pastLegs = dialysisLegs.filter((leg) => leg.date < today).sort((a, b) => a.date.localeCompare(b.date));
  if (pastLegs[0]) {
    await transportLegs.cancel(pastLegs[0].id, {
      reason: 'Doente hospitalizado nesse dia.',
      source: LegCancellationSource.PATIENT,
    });
  }
  if (pastLegs[2]) {
    await transportLegs.markNoShow(pastLegs[2].id);
  }
  console.log('✅ Treatment plan generated its legs; one cancelled, one no-show, for the legs list to show history.');

  // ── Transport volume: five to fifteen people a day (#219) ────────────────
  //
  // Everything above exercises the *states* a referral can be in. None of it
  // produces a day's *work* — and a planning board carrying three legs looks
  // solved whatever shape it has. The questions the board exists to answer
  // ("which vehicle can still take this?", "what does the run to Porto cost
  // the rest of the morning?", "who could share this journey?") only appear
  // at the volume a delegation this size actually moves: five to fifteen
  // people a day, every day, with the occasional long haul out of district.
  //
  // So below: a pool of chronic patients around Barcelos, the recurring
  // series that fill a normal week, and then a per-date top-up of one-off
  // referrals that brings every date in the horizon up to a target between
  // five and fifteen people — at least one of whom travels to Porto.
  // 15 days back, 15 days ahead — a month either side of today, always.
  const horizonFrom = isoAgo(15);
  const horizonTo = isoAhead(15);
  const horizonDates = isoDateRange(horizonFrom, horizonTo);

  /** A wall-clock time-of-day on `date`, resolved to a real instant the same
   * way `TripsService.checkArrivalTiming` does. */
  const instantAt = (date: string, time: string): Date => {
    const [hours, minutes] = time.split(':').map(Number);
    return shiftBoundaryToInstant(date, hours * 60 + minutes);
  };
  const plusMinutes = (instant: Date, minutes: number): string =>
    new Date(instant.getTime() + minutes * 60_000).toISOString();

  /**
   * A stable number per date, so the daily targets vary the way real demand
   * does without the fixtures changing shape between two seed runs. A seed
   * that reshuffles itself is a seed nobody can report a bug against.
   */
  const hashOf = (value: string): number => {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash);
  };

  const poolFixtures: Array<{
    fullName: string;
    telephone: string;
    addressLine: string;
    postalCode: string;
    localityName: string;
    mobility: PatientMobility;
    needsOxygen?: boolean;
    escortRequired?: boolean;
  }> = [
    { fullName: 'Amélia Sousa Braga', telephone: '+351915000101', addressLine: 'Rua da Igreja, 14', postalCode: '4750-021', localityName: 'Aborim', mobility: PatientMobility.WHEELCHAIR },
    { fullName: 'Adelino Faria Lopes', telephone: '+351915000102', addressLine: 'Rua de Abade de Neiva, 210', postalCode: '4750-021', localityName: 'Abade de Neiva', mobility: PatientMobility.AMBULATORY },
    { fullName: 'Belmira Antunes Cruz', telephone: '+351915000103', addressLine: 'Travessa do Cruzeiro, 3', postalCode: '4755-005', localityName: 'Alvelos', mobility: PatientMobility.AMBULATORY },
    { fullName: 'Custódio Neves Pinheiro', telephone: '+351915000104', addressLine: 'Rua das Areias, 96', postalCode: '4750-101', localityName: 'Areias', mobility: PatientMobility.WHEELCHAIR },
    { fullName: 'Deolinda Ramos Barros', telephone: '+351915000105', addressLine: 'Rua de Balugães, 7', postalCode: '4755-011', localityName: 'Balugães', mobility: PatientMobility.AMBULATORY },
    { fullName: 'Eduardo Machado Lima', telephone: '+351915000106', addressLine: 'Rua de Carapeços, 88', postalCode: '4750-051', localityName: 'Carapeços', mobility: PatientMobility.AMBULATORY },
    { fullName: 'Fátima Nogueira Dias', telephone: '+351915000107', addressLine: 'Rua Nova de Cristelo, 22', postalCode: '4750-061', localityName: 'Cristelo', mobility: PatientMobility.WHEELCHAIR },
    { fullName: 'Gustavo Teixeira Moreira', telephone: '+351915000108', addressLine: 'Rua de Fornelos, 150', postalCode: '4755-070', localityName: 'Fornelos', mobility: PatientMobility.AMBULATORY },
    { fullName: 'Helena Barbosa Sampaio', telephone: '+351915000109', addressLine: 'Rua do Facho, 31', postalCode: '4750-081', localityName: 'Fragoso', mobility: PatientMobility.AMBULATORY },
    { fullName: 'Isidro Carvalho Maia', telephone: '+351915000110', addressLine: 'Rua de Gilmonde, 44', postalCode: '4755-081', localityName: 'Gilmonde', mobility: PatientMobility.AMBULATORY },
    { fullName: 'Júlia Mendes Vieira', telephone: '+351915000111', addressLine: 'Rua de Lijó, 505', postalCode: '4750-461', localityName: 'Lijó', mobility: PatientMobility.AMBULATORY },
    { fullName: 'Lucínio Pires Rego', telephone: '+351915000112', addressLine: 'Rua de Martim, 18', postalCode: '4750-471', localityName: 'Martim', mobility: PatientMobility.STRETCHER, needsOxygen: true, escortRequired: true },
    { fullName: 'Manuela Cardoso Torres', telephone: '+351915000113', addressLine: 'Rua de Palme, 260', postalCode: '4750-541', localityName: 'Palme', mobility: PatientMobility.AMBULATORY },
    { fullName: 'Norberto Silva Amorim', telephone: '+351915000114', addressLine: 'Rua de Pereira, 12', postalCode: '4750-551', localityName: 'Pereira', mobility: PatientMobility.AMBULATORY },
    { fullName: 'Olívia Gomes Rodrigues', telephone: '+351915000115', addressLine: 'Rua do Perelhal, 77', postalCode: '4750-561', localityName: 'Perelhal', mobility: PatientMobility.WHEELCHAIR },
    { fullName: 'Paulo Jorge Ferreira', telephone: '+351915000116', addressLine: 'Rua de Roriz, 133', postalCode: '4750-591', localityName: 'Roriz', mobility: PatientMobility.AMBULATORY },
    { fullName: 'Quitéria Lopes Marques', telephone: '+351915000117', addressLine: 'Rua da Silva, 9', postalCode: '4750-601', localityName: 'Silva', mobility: PatientMobility.AMBULATORY },
    { fullName: 'Rogério Martins Abreu', telephone: '+351915000118', addressLine: 'Rua de Ucha, 402', postalCode: '4750-631', localityName: 'Ucha', mobility: PatientMobility.AMBULATORY },
  ];

  interface PoolPatient {
    id: string;
    name: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
    mobility: PatientMobility;
  }

  const pool: PoolPatient[] = [];
  for (const fixture of poolFixtures) {
    const home = await locality(fixture.localityName, 'Barcelos');
    // Identity recorded for all of them, unlike the three hand-written
    // patients above: the planning board prints the patient's name on every
    // block, and a board of eleven unnamed blocks tells a planner nothing.
    // The `VIEW_PATIENT_IDENTITY` degrade is still exercised — by the sealed
    // patients above, and by logging in as someone without it.
    const created = await patients.create(
      {
        mobility: fixture.mobility,
        needsOxygen: fixture.needsOxygen,
        escortRequired: fixture.escortRequired,
        defaultLatitude: home.latitude ?? undefined,
        defaultLongitude: home.longitude ?? undefined,
        localityId: home.id,
        contactAuthorisationRecorded: true,
        identity: {
          fullName: fixture.fullName,
          telephone: fixture.telephone,
          homeAddressLine: fixture.addressLine,
          homePostalCode: fixture.postalCode,
          homeLocality: fixture.localityName,
          referenceContactName: 'Contacto de referência',
          referenceContactRelationship: 'Familiar',
          referenceContactTelephone: fixture.telephone,
        },
      } satisfies CreatePatientDto,
      transportsCoordinator,
    );
    pool.push({
      id: created.id,
      name: fixture.fullName,
      address: `${fixture.addressLine}, ${fixture.postalCode} ${fixture.localityName}`,
      latitude: home.latitude,
      longitude: home.longitude,
      mobility: fixture.mobility,
    });
  }
  console.log(`✅ ${pool.length} more patients across ${pool.length} Barcelos freguesias, for transport volume.`);

  /** The Porto destinations, as a set — "did this date already send someone
   * to Porto?" is asked once per date below. */
  const portoFacilityIds = new Set([saoJoao.id, santoAntonio.id, ipoPorto.id]);

  let referralCounter = 0;
  /** A referral, accepted and registered unless asked otherwise, with its
   * legs materialised — the state a transport is in by the time it reaches
   * the planning board. */
  async function seedReferral(input: {
    patient: PoolPatient;
    appointmentAt: string;
    occurrenceType: TransportRequestOccurrenceType;
    destinationFacilityId: string;
    isRoundTrip?: boolean;
    originAddress?: string;
    message?: string;
    /** Materialise the referral's own leg(s) — a one-off with no recurrence
     * above it. Left off for a referral a `TreatmentPlan` is about to be
     * hung on. */
    oneOff?: boolean;
    /** Left `PENDING` — no legs, so it only ever shows in the referral queue. */
    pending?: boolean;
  }) {
    referralCounter += 1;
    const viaAxa = referralCounter % 3 === 0;
    const isStretcher = input.patient.mobility === PatientMobility.STRETCHER;
    const appointmentDate = input.appointmentAt.slice(0, 10);
    const request = await transportRequests.create(
      {
        batchReference: viaAxa ? `AXA-OUT-${appointmentDate}` : `EMAIL-${appointmentDate}`,
        communicatedAt: `${toIsoDate(addDays(parseIsoDate(appointmentDate), -5))}T09:00:00.000Z`,
        requesterAccountCode: viaAxa ? 'AXA-PT-778' : 'ULSB-0007',
        responseDueAt: `${toIsoDate(addDays(parseIsoDate(appointmentDate), -2))}T17:00:00.000Z`,
        externalServiceNumber: `${viaAxa ? 'AXA' : 'ULSB'}-${appointmentDate.replace(/-/g, '')}-${referralCounter}`,
        appointmentAt: input.appointmentAt,
        requestingOrganisationId: viaAxa ? orgAxa.id : orgUls.id,
        payingOrganisationId: viaAxa ? orgAxa.id : orgArsNorte.id,
        agreementId: viaAxa ? agreementAxa.id : agreementSns.id,
        patientId: input.patient.id,
        occurrenceType: input.occurrenceType,
        requestedVehicleType: isStretcher
          ? TransportRequestVehicleType.AMBULANCIA
          : TransportRequestVehicleType.TRANSPORTE,
        escortTravels: isStretcher,
        isRoundTrip: input.isRoundTrip ?? true,
        originAddress: input.originAddress ?? input.patient.address,
        // An origin the patient was collected *from* a hospital at (a
        // discharge) has no home coordinates to carry — the facility's own
        // are what routing will use.
        originLatitude: input.originAddress ? undefined : (input.patient.latitude ?? undefined),
        originLongitude: input.originAddress ? undefined : (input.patient.longitude ?? undefined),
        destinationFacilityId: input.destinationFacilityId,
        freeTextMessage: input.message,
      } satisfies CreateTransportRequestDto,
      transportsCoordinator,
    );
    if (input.pending) return request;
    await transportRequests.decide(request.id, { decision: TransportRequestDecision.ACCEPTED }, transportsCoordinator);
    await transportRequests.registerExternally(request.id);
    // A referral that carries its own recurrence gets its legs from
    // `treatmentPlans.create` instead — calling both would add a stray
    // one-off leg on the appointment date alongside the generated series.
    if (input.oneOff) await transportLegs.generateOneOff(request.id);
    return request;
  }

  // The recurring series that make up a normal week. Weekday-heavy and
  // weekend-light on purpose: a planner's Saturday genuinely is quieter, and
  // a board that looks identical seven days a week teaches them nothing.
  const seriesFixtures: Array<{
    patients: number[];
    daysOfWeek: number[];
    start: string;
    end: string;
    destinationFacilityId: string;
    occurrenceType: TransportRequestOccurrenceType;
    notes: string;
  }> = [
    { patients: [0, 1, 2], daysOfWeek: [1, 3, 5], start: '08:00', end: '12:00', destinationFacilityId: dialysisClinic.id, occurrenceType: TransportRequestOccurrenceType.TRATAMENTO, notes: 'Hemodiálise — turno da manhã, 2ª/4ª/6ª.' },
    { patients: [3, 4], daysOfWeek: [1, 3, 5], start: '13:30', end: '17:30', destinationFacilityId: dialysisClinic.id, occurrenceType: TransportRequestOccurrenceType.TRATAMENTO, notes: 'Hemodiálise — turno da tarde, 2ª/4ª/6ª.' },
    { patients: [5, 6, 7], daysOfWeek: [2, 4, 6], start: '08:00', end: '12:00', destinationFacilityId: dialysisClinic.id, occurrenceType: TransportRequestOccurrenceType.TRATAMENTO, notes: 'Hemodiálise — turno da manhã, 3ª/5ª/sábado.' },
    // The daily Porto run: radiotherapy is a short session at the end of a
    // long drive, which is precisely the journey that cannot be shared and
    // still ties a vehicle up for half a day.
    { patients: [8], daysOfWeek: [1, 2, 3, 4, 5], start: '10:30', end: '11:00', destinationFacilityId: ipoPorto.id, occurrenceType: TransportRequestOccurrenceType.TRATAMENTO, notes: 'Radioterapia diária — IPO Porto, doente sozinho na viatura.' },
    { patients: [9], daysOfWeek: [2, 4], start: '09:00', end: '13:00', destinationFacilityId: saoJoao.id, occurrenceType: TransportRequestOccurrenceType.TRATAMENTO, notes: 'Hospital de dia — oncologia, São João.' },
    { patients: [10, 13], daysOfWeek: [1, 3, 5], start: '15:00', end: '16:00', destinationFacilityId: hospitalBarcelos.id, occurrenceType: TransportRequestOccurrenceType.TRATAMENTO, notes: 'Fisioterapia — Santa Maria Maior.' },
    { patients: [12], daysOfWeek: [4], start: '09:30', end: '10:30', destinationFacilityId: hospitalBraga.id, occurrenceType: TransportRequestOccurrenceType.CONSULTA, notes: 'Consulta de seguimento semanal — Hospital de Braga.' },
  ];

  for (const series of seriesFixtures) {
    for (const index of series.patients) {
      const patient = pool[index];
      const request = await seedReferral({
        patient,
        appointmentAt: `${horizonFrom}T${series.start}:00.000Z`,
        occurrenceType: series.occurrenceType,
        destinationFacilityId: series.destinationFacilityId,
        isRoundTrip: true,
        message: series.notes,
      });
      await treatmentPlans.create(request.id, {
        destinationFacilityId: series.destinationFacilityId,
        daysOfWeek: series.daysOfWeek,
        treatmentStartTime: series.start,
        treatmentEndTime: series.end,
        validFrom: horizonFrom,
        validTo: horizonTo,
        notes: series.notes,
      } satisfies CreateTreatmentPlanDto);

      // A plan's `treatmentEndTime` deliberately doesn't flow into the legs
      // it generates — a leg carries its own end time, which is the thing
      // that can differ on the day. Without one, every leg falls back to the
      // occurrence type's 30-minute floor, and a four-hour dialysis session
      // would show a patient ready to come home half an hour after arriving.
      // So the fixture records what the unit told the delegation, the same
      // edit a coordinator makes on the leg itself.
      for (const leg of await transportLegs.findAllForRequest(request.id)) {
        await prisma.transportLeg.update({
          where: { id: leg.id },
          data: {
            estimatedEndAt: instantAt(leg.date, series.end),
            estimatedEndSource: EstimatedEndSource.FACILITY_SUPPLIED as never,
          },
        });
      }
    }
  }
  console.log(`✅ ${seriesFixtures.length} recurring series (dialysis, radiotherapy, day hospital, physiotherapy).`);

  // Top-up: whatever the series already put on a date, bring it up to that
  // date's target, and never leave a date without a Porto run.
  const legsInHorizon = await prisma.transportLeg.findMany({
    where: {
      date: { gte: parseIsoDate(horizonFrom), lte: parseIsoDate(horizonTo) },
      status: { notIn: [LegStatus.CANCELLED as never, LegStatus.NO_SHOW as never] },
    },
    select: {
      date: true,
      originFacilityId: true,
      destinationFacilityId: true,
      transportRequest: { select: { patientId: true } },
    },
  });

  const peopleByDate = new Map<string, Set<string>>();
  const portoByDate = new Set<string>();
  for (const leg of legsInHorizon) {
    const date = toIsoDate(leg.date);
    const people = peopleByDate.get(date) ?? new Set<string>();
    people.add(leg.transportRequest.patientId);
    peopleByDate.set(date, people);
    if (
      (leg.destinationFacilityId && portoFacilityIds.has(leg.destinationFacilityId)) ||
      (leg.originFacilityId && portoFacilityIds.has(leg.originFacilityId))
    ) {
      portoByDate.add(date);
    }
  }

  // Weighted towards the two local hospitals on purpose: the Porto runs are
  // the exception a planner works around, and a day with eight of them would
  // be a fixture nobody recognises.
  const topUpDestinations = [hospitalBraga.id, hospitalBarcelos.id, hospitalBraga.id, hospitalBarcelos.id, saoJoao.id];
  // Consultations and exams only. A discharge (`ALTA`) is a hospital-to-home
  // journey, and an outbound leg runs address → *facility* — so modelling one
  // properly means editing the generated leg's destination afterwards, which
  // the hand-written `requestAwaitingRegistration` above already demonstrates
  // once. Repeating it a hundred times here would only put a hundred
  // hospital-to-the-same-hospital lines on the planner's map.
  const topUpOccurrences = [
    TransportRequestOccurrenceType.CONSULTA,
    TransportRequestOccurrenceType.EXAME,
    TransportRequestOccurrenceType.CONSULTA,
    TransportRequestOccurrenceType.EXAME,
  ];

  let topUpCount = 0;
  let pendingCount = 0;
  for (const date of horizonDates) {
    const people = peopleByDate.get(date) ?? new Set<string>();
    peopleByDate.set(date, people);
    // Five to fifteen, stable per date. A day already busier than its target
    // is left alone — the series are the floor, never trimmed to fit.
    const target = 5 + (hashOf(date) % 11);
    // Each pool patient is offered this date at most once, in an order that
    // is stable per date but different between dates — so the same four
    // people aren't the ones travelling every single day.
    const candidates = [...pool].sort((a, b) => hashOf(`${date}:${a.id}`) - hashOf(`${date}:${b.id}`));
    let attempt = 0;
    for (const patient of candidates) {
      if (people.size >= target && portoByDate.has(date)) break;
      attempt += 1;
      if (people.has(patient.id)) continue;

      // Porto first, until the date has one — then whatever the rotation
      // says. The guarantee is per date, not per horizon: the long run is
      // the constraint a planner faces *every* morning.
      const needsPorto = !portoByDate.has(date);
      const destinationFacilityId = needsPorto
        ? [ipoPorto.id, saoJoao.id, santoAntonio.id][hashOf(date) % 3]
        : topUpDestinations[attempt % topUpDestinations.length];
      const occurrenceType = needsPorto
        ? TransportRequestOccurrenceType.CONSULTA
        : topUpOccurrences[attempt % topUpOccurrences.length];
      // Shared per destination, not per patient: 08:30 through 16:30,
      // half-hour apart, but everyone topped up onto the same facility on
      // the same date leaves at the same time — so the planning board gets
      // journeys of several people through several localities, rather than
      // one patient alone in every timeslot.
      const minutes = 8 * 60 + 30 + ((hashOf(`${date}:${destinationFacilityId}`) % 17) * 30);
      const appointmentAt =
        `${date}T${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}:00.000Z`;

      // One in nine is left pending, so the referral queue keeps a working
      // backlog instead of being empty the moment the seed finishes.
      const pending = referralCounter % 9 === 8;
      await seedReferral({
        patient,
        appointmentAt,
        occurrenceType,
        destinationFacilityId,
        isRoundTrip: true,
        message: needsPorto ? 'Consulta externa no Porto.' : undefined,
        oneOff: true,
        pending,
      });
      if (pending) {
        pendingCount += 1;
        continue;
      }
      people.add(patient.id);
      if (portoFacilityIds.has(destinationFacilityId)) portoByDate.add(date);
      topUpCount += 1;
    }
  }

  const dailyCounts = horizonDates.map((date) => peopleByDate.get(date)?.size ?? 0);
  console.log(
    `✅ ${topUpCount} one-off referrals topped every date up to its target: ` +
      `${Math.min(...dailyCounts)}–${Math.max(...dailyCounts)} people a day across ${horizonDates.length} days, ` +
      `each with at least one Porto run (${pendingCount} more left pending in the queue).`,
  );

  // ── Trip planning board (#234-236) ───────────────────────────────────────
  // Gives the board actual lanes to look at: one COMPLETED run from before
  // today (trip history), and several PLANNED ones spread through the next
  // 30 days — the two recurring series above plus the AMBULANCIA referral,
  // each on the vehicle class its patient's mobility actually calls for.
  // Several future legs are deliberately left off a trip, so the board's
  // unassigned-legs rail has something in it too.
  const tripCrewService = new TripCrewService(prisma, staffAbsences);
  const tripStopsService = new TripStopsService(prisma, delegationSettingsForFacilities, vehicleOccupancy);

  async function buildTrip(input: {
    vehicleId: string;
    date: string;
    status?: TripStatus;
    notes?: string;
    crew: { userId: string; role: CertificationType }[];
    legs: { legId: string; pickupPlannedAt: string; dropoffPlannedAt: string }[];
  }): Promise<string> {
    const trip = await prisma.trip.create({
      data: {
        date: parseIsoDate(input.date),
        vehicleId: input.vehicleId,
        notes: input.notes ?? null,
        status: input.status ?? TripStatus.PLANNED,
      },
    });
    for (const member of input.crew) {
      try {
        await tripCrewService.add(trip.id, { userId: member.userId, role: member.role });
      } catch {
        // The only reason `add` refuses is a recorded absence on the date,
        // and that is a warning a coordinator overrides by hand every week —
        // so the fixture takes the same route rather than silently dropping
        // the crew member and leaving an uncrewed journey behind.
        await tripCrewService.add(trip.id, {
          userId: member.userId,
          role: member.role,
          overrideReason: 'Ausência registada; disponibilidade confirmada com a coordenação.',
        });
      }
    }
    for (const leg of input.legs) {
      await tripStopsService.assignLegToTrip(trip.id, {
        transportLegId: leg.legId,
        pickupPlannedAt: leg.pickupPlannedAt,
        dropoffPlannedAt: leg.dropoffPlannedAt,
      });
    }
    return trip.id;
  }

  /** A request's `OUTBOUND`+`RETURN` legs, grouped by date, keeping only
   * dates where both are still active — a cancelled/no-show day is never
   * half-planned onto a trip. */
  async function activeRoundTripsByDate(requestId: string) {
    const legs = await transportLegs.findAllForRequest(requestId);
    const byDate = new Map<string, typeof legs>();
    for (const leg of legs) {
      if (leg.status === LegStatus.CANCELLED || leg.status === LegStatus.NO_SHOW) continue;
      byDate.set(leg.date, [...(byDate.get(leg.date) ?? []), leg]);
    }
    return [...byDate.entries()]
      .filter(([, dateLegs]) => dateLegs.length === 2)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, [outbound, returnLeg]]) => ({ date, outbound, return: returnLeg }));
  }

  const dialysisCrew = [
    { userId: transportsCoordinator.id, role: CertificationType.DRIVER },
    { userId: diogo.id, role: CertificationType.TAS },
  ];
  const dialysisRoundTrips = await activeRoundTripsByDate(requestDialysis.id);
  const pastDialysis = dialysisRoundTrips.filter((rt) => rt.date < today);
  const futureDialysis = dialysisRoundTrips.filter((rt) => rt.date >= today);

  if (pastDialysis[0]) {
    const { date, outbound, return: ret } = pastDialysis[0];
    const arrival = instantAt(date, '08:30');
    const departure = instantAt(date, '12:30');
    await buildTrip({
      vehicleId: vehicles.transport1.id,
      date,
      status: TripStatus.COMPLETED,
      notes: 'Hemodiálise — HD Barcelos.',
      crew: dialysisCrew,
      legs: [
        { legId: outbound.id, pickupPlannedAt: plusMinutes(arrival, -45), dropoffPlannedAt: plusMinutes(arrival, -15) },
        { legId: ret.id, pickupPlannedAt: plusMinutes(departure, 0), dropoffPlannedAt: plusMinutes(departure, 30) },
      ],
    });
  }
  for (const { date, outbound, return: ret } of futureDialysis.slice(0, 2)) {
    const arrival = instantAt(date, '08:30');
    const departure = instantAt(date, '12:30');
    await buildTrip({
      vehicleId: vehicles.transport1.id,
      date,
      notes: 'Hemodiálise — HD Barcelos.',
      crew: dialysisCrew,
      legs: [
        { legId: outbound.id, pickupPlannedAt: plusMinutes(arrival, -45), dropoffPlannedAt: plusMinutes(arrival, -15) },
        { legId: ret.id, pickupPlannedAt: plusMinutes(departure, 0), dropoffPlannedAt: plusMinutes(departure, 30) },
      ],
    });
  }

  const woundCareRoundTrips = await activeRoundTripsByDate(requestWoundCare.id);
  const nextWoundCare = woundCareRoundTrips.find((rt) => rt.date >= today);
  if (nextWoundCare) {
    const { date, outbound, return: ret } = nextWoundCare;
    const arrival = instantAt(date, '09:00');
    const departure = instantAt(date, '09:30');
    await buildTrip({
      vehicleId: vehicles.transport1.id,
      date,
      notes: 'Penso semanal — Hospital de Braga.',
      crew: dialysisCrew,
      legs: [
        { legId: outbound.id, pickupPlannedAt: plusMinutes(arrival, -45), dropoffPlannedAt: plusMinutes(arrival, -15) },
        { legId: ret.id, pickupPlannedAt: plusMinutes(departure, 0), dropoffPlannedAt: plusMinutes(departure, 30) },
      ],
    });
  }

  const [carlosLeg] = await transportLegs.findAllForRequest(requestAwaitingRegistration.id);
  if (carlosLeg) {
    const arrival = new Date(`${isoAhead(2)}T08:00:00.000Z`);
    await buildTrip({
      vehicleId: vehicles.ambulance2.id,
      date: carlosLeg.date,
      notes: 'Alta hospitalar — doente acamado, com escolta.',
      crew: [
        { userId: joaoP.id, role: CertificationType.TAT },
        { userId: mariana.id, role: CertificationType.TAS },
      ],
      legs: [{ legId: carlosLeg.id, pickupPlannedAt: plusMinutes(arrival, -45), dropoffPlannedAt: plusMinutes(arrival, -15) }],
    });
  }

  const plannedTripCount = Math.min(futureDialysis.length, 2) + (nextWoundCare ? 1 : 0) + (carlosLeg ? 1 : 0);
  const unassignedDialysisCount = Math.max(futureDialysis.length - 2, 0);
  console.log(
    `✅ Planning board: ${pastDialysis[0] ? 1 : 0} completed run, ${plannedTripCount} planned trips, and ` +
      `${unassignedDialysisCount} more future dialysis round trips (plus the EXAME referral's leg) left ` +
      'unassigned for the board\'s rail.',
  );

  // ── Whole days planned onto the board (#235) ─────────────────────────────
  //
  // The volume block leaves every leg it creates unassigned, which is the
  // honest starting state and a poor fixture: the board only shows what it
  // is for once journeys exist on it. So four dates are planned end to end —
  // yesterday (completed), today, and the two after — and everything past
  // that stays in the rail, which is also what a real planner's week looks
  // like: the near days settled, the far ones still loose.
  //
  // This is deliberately the dumbest possible planner: group by destination
  // and arrival time, split into vehicle-sized chunks, take the first
  // vehicle whose capacity fits and whose day is still free. It is not a
  // preview of an optimiser — it exists so the screens have something real
  // to draw, and a chunk it can't place simply stays unplanned.
  const fleet = await prisma.vehicle.findMany({
    select: {
      id: true,
      numeroCauda: true,
      vehicleType: true,
      seatedCapacity: true,
      wheelchairPositions: true,
      stretcherPositions: true,
    },
    orderBy: { numeroCauda: 'asc' },
  });

  /**
   * Straight-line kilometres between two points, with a 1.3 detour factor —
   * the same crude-on-purpose approximation `travelMinutesBetween` turns
   * into a duration; also used on its own to decide whether two groups'
   * destinations are close enough to chain onto one journey (below). Null
   * when either point isn't geocoded, since "close enough" can't be judged
   * without both doors.
   */
  const beelineKm = (
    from: { latitude: number | null; longitude: number | null },
    to: { latitude: number | null; longitude: number | null },
  ): number | null => {
    if (from.latitude == null || from.longitude == null || to.latitude == null || to.longitude == null) return null;
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const meanLatitude = toRadians((from.latitude + to.latitude) / 2);
    const dx = toRadians(to.longitude - from.longitude) * Math.cos(meanLatitude) * 6371;
    const dy = toRadians(to.latitude - from.latitude) * 6371;
    return Math.hypot(dx, dy) * 1.3;
  };

  /**
   * Minutes on the road between two points, straight-line at 55 km/h.
   *
   * Crude on purpose: the real number comes from OSRM at read time
   * (`TripLegTravelService`), and a seed that called it would need the
   * routing container up to produce fixtures. All this has to get right is
   * the order of magnitude — that Aldreu to the Barcelos clinic is fifteen
   * minutes and Barcelos to the IPO is an hour — because that difference is
   * what makes a day's plan feasible or not.
   */
  const travelMinutesBetween = (
    from: { latitude: number | null; longitude: number | null },
    to: { latitude: number | null; longitude: number | null },
  ): number => {
    const kilometres = beelineKm(from, to);
    if (kilometres == null) return 20;
    return Math.max(10, Math.round((kilometres / 55) * 60));
  };

  // Only these vehicles are offered to the planner below, each with the crew
  // that works it: a vehicle with nobody to crew it is not a lane, and
  // `ambulance1` is deliberately held back as the emergency reserve. Most of
  // these journeys are a single driver — non-urgent transport, unlike an
  // emergency crew, routinely rolls with just the one person — so only the
  // stretcher vehicle keeps a second crew member, for the medical escort a
  // bedridden patient actually needs.
  const crewByVehicleId: Record<string, { userId: string; role: CertificationType }[]> = {
    [vehicles.transport1.id]: [{ userId: ines.id, role: CertificationType.DRIVER }],
    [vehicles.transport2.id]: [{ userId: diogo.id, role: CertificationType.DRIVER }],
    [vehicles.transport3.id]: [{ userId: transportsCoordinator.id, role: CertificationType.DRIVER }],
    [vehicles.transport4.id]: [{ userId: hugo.id, role: CertificationType.DRIVER }],
    [vehicles.transport5.id]: [{ userId: tiago.id, role: CertificationType.DRIVER }],
    [vehicles.ambulance2.id]: [
      { userId: joaoP.id, role: CertificationType.TAT },
      { userId: mariana.id, role: CertificationType.TAS },
    ],
  };

  /** `order`, rotated by a stable amount derived from `seed` — so which
   * vehicle a group prefers first varies by date/facility/direction instead
   * of every non-overlapping journey of the day piling onto the same first
   * pick. That's what puts several vehicles on the road on a single busy
   * day rather than one vehicle working the whole day's local rounds. */
  const rotate = (order: string[], seed: string): string[] => {
    const offset = hashOf(seed) % order.length;
    return [...order.slice(offset), ...order.slice(0, offset)];
  };

  const destinations = new Map(
    (
      await prisma.facility.findMany({
        where: { isTransportDestination: true },
        select: { id: true, name: true, latitude: true, longitude: true },
      })
    ).map((facility) => [facility.id, facility]),
  );

  // Fetched once and reused across every date below — the same base
  // `DEPART_FROM_BASE`/`RETURN_TO_BASE` target every day's first and last
  // journey, so there is no reason to re-read `DelegationSettings` per date.
  const base = await delegationSettingsForFacilities.get();
  const basePoint = { latitude: base.baseLatitude, longitude: base.baseLongitude };

  /** Everything a chunk needs to know about one leg, resolved once. */
  interface PlannableLeg {
    id: string;
    facilityId: string;
    /** The instant the plan is built around: the appointment for an outbound
     * leg, the estimated end of treatment for a return one. */
    anchorAt: Date;
    mobility: PatientMobility;
    /** The patient's own end of the journey — their door, whichever
     * direction the leg runs in. */
    door: { latitude: number | null; longitude: number | null };
  }

  /** One already-built chunk trip, kept around after `buildTrip` so the
   * merge pass below can chain a same-vehicle, same-direction, nearby-in-
   * time-and-space trip onto it instead of leaving the vehicle's day as a
   * pile of separate single-destination journeys — see the "Whole days
   * planned onto the board" banner comment for why that matters. */
  interface BuiltTripMeta {
    tripId: string;
    vehicleId: string;
    direction: LegDirection;
    /** A stretcher or a Porto-bound run — never a merge candidate, on either
     * side of the pair, for the same reason it was built solo to begin with. */
    solo: boolean;
    legTimes: { legId: string; pickupPlannedAt: string; dropoffPlannedAt: string }[];
    firstPickupAt: number;
    lastStopAt: number;
    /** Where the vehicle actually is right after its first pickup / right
     * before its last stop — the two ends a `DEPART_FROM_BASE`/
     * `RETURN_TO_BASE` stop or a merge candidate's distance is judged
     * against. */
    firstDoor: { latitude: number | null; longitude: number | null };
    lastAnchor: { latitude: number | null; longitude: number | null };
    demand: { seated: number; wheelchairs: number; stretchers: number };
  }

  // Two groups chain onto one journey only when the gap between them is a
  // plausible in-between drive, not a lunch break or a different round
  // entirely, and their destinations are close enough that the detour reads
  // as "on the way" rather than a cross-district special trip.
  const MERGE_MAX_GAP_MINUTES = 45;
  const MERGE_MAX_DISTANCE_KM = 20;

  async function planDay(date: string, status: TripStatus): Promise<{ journeys: number; vehicleIds: Set<string> }> {
    const unassigned = await transportLegs.findUnassignedForDate(date);
    if (!unassigned.length) return { journeys: 0, vehicleIds: new Set() };

    const requests = await prisma.transportRequest.findMany({
      where: { id: { in: [...new Set(unassigned.map((leg) => leg.transportRequestId))] } },
      select: { id: true, patient: { select: { mobility: true } } },
    });
    const mobilityByRequest = new Map(requests.map((row) => [row.id, row.patient.mobility as PatientMobility]));

    // Every existing commitment of every vehicle that day, from one place:
    // shifts, maintenance and the journeys already built above all land in
    // `VehicleOccupancy`, and overlapping it is exactly what `assignLegToTrip`
    // refuses without an override.
    const dayStart = parseIsoDate(date);
    const dayEnd = addDays(dayStart, 1);
    const busy = new Map<string, Array<{ from: number; to: number }>>();
    for (const block of await prisma.vehicleOccupancy.findMany({
      where: { startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
      select: { vehicleId: true, startsAt: true, endsAt: true },
    })) {
      busy.set(block.vehicleId, [
        ...(busy.get(block.vehicleId) ?? []),
        { from: block.startsAt.getTime(), to: block.endsAt.getTime() },
      ]);
    }
    const isFree = (vehicleId: string, from: number, to: number) =>
      !(busy.get(vehicleId) ?? []).some((block) => block.from < to && block.to > from);

    // One group per "this vehicle is at this facility at this moment" — the
    // only thing that makes two patients shareable at all.
    const groups = new Map<string, { direction: LegDirection; facilityId: string; anchorAt: Date; legs: PlannableLeg[] }>();
    for (const leg of unassigned) {
      const outbound = leg.direction === LegDirection.OUTBOUND;
      const facilityId = outbound ? leg.destinationFacilityId : leg.originFacilityId;
      const mobility = mobilityByRequest.get(leg.transportRequestId);
      if (!facilityId || !mobility) continue;
      const anchorAt = new Date(outbound ? leg.appointmentAt : leg.effectiveEstimatedEndAt);
      const door = outbound
        ? { latitude: leg.originLatitude, longitude: leg.originLongitude }
        : { latitude: leg.destinationLatitude, longitude: leg.destinationLongitude };
      const key = `${leg.direction}|${facilityId}|${anchorAt.toISOString()}`;
      const group = groups.get(key) ?? { direction: leg.direction, facilityId, anchorAt, legs: [] };
      group.legs.push({ id: leg.id, facilityId, anchorAt, mobility, door });
      groups.set(key, group);
    }

    let journeys = 0;
    const vehicleIds = new Set<string>();
    // One entry per trip actually built below — fed to the merge pass and
    // the base depart/return pass once every group's chunks are placed.
    const builtTrips: BuiltTripMeta[] = [];
    const ordered = [...groups.values()].sort((a, b) => a.anchorAt.getTime() - b.anchorAt.getTime());
    for (const group of ordered) {
      // Porto is an hour each way: that patient travels alone, because
      // nobody else's appointment survives the detour. A stretcher is alone
      // for the physical reason instead — it is the whole vehicle.
      const soloRun = portoFacilityIds.has(group.facilityId);
      const chunks: PlannableLeg[][] = [];
      for (const leg of group.legs) {
        const solo = soloRun || leg.mobility === PatientMobility.STRETCHER;
        const last = chunks[chunks.length - 1];
        // Up to five to a chunk — a normal transport round picking up
        // several people bound for the same place through several
        // localities on the way, not a one-patient-per-vehicle taxi service.
        const canShare =
          !solo &&
          last &&
          last.length < 5 &&
          !last.some((member) => member.mobility === PatientMobility.STRETCHER);
        if (canShare) last.push(leg);
        else chunks.push([leg]);
      }

      for (const chunk of chunks) {
        const outbound = group.direction === LegDirection.OUTBOUND;
        const anchor = group.anchorAt.getTime();
        const at = (minutes: number) => new Date(anchor + minutes * 60_000).toISOString();

        // Times built around the drive itself, not a flat guess: the last
        // patient is collected a journey's-length before the appointment,
        // everyone earlier ten minutes apart before that. It is the
        // difference between a fifteen-minute hop to the Barcelos clinic and
        // an hour down to the IPO that makes a day's plan hold together.
        const facility = destinations.get(group.facilityId);
        const legTravel = chunk.map((leg) => (facility ? travelMinutesBetween(leg.door, facility) : 20));
        const longestTravel = Math.max(...legTravel);
        const legTimes = chunk.map((leg, index) =>
          outbound
            ? {
                legId: leg.id,
                pickupPlannedAt: at(-10 - longestTravel - (chunk.length - 1 - index) * 10),
                dropoffPlannedAt: at(-10),
              }
            : {
                legId: leg.id,
                pickupPlannedAt: at(5),
                dropoffPlannedAt: at(5 + legTravel[index] + index * 10),
              },
        );
        const from = new Date(legTimes[0].pickupPlannedAt).getTime() - 15 * 60_000;
        const to = new Date(legTimes[legTimes.length - 1].dropoffPlannedAt).getTime() + 15 * 60_000;

        const seated = chunk.filter((leg) => leg.mobility === PatientMobility.AMBULATORY).length;
        const wheelchairs = chunk.filter((leg) => leg.mobility === PatientMobility.WHEELCHAIR).length;
        const stretchers = chunk.filter((leg) => leg.mobility === PatientMobility.STRETCHER).length;
        // Preference order, not just capacity: an emergency ambulance may
        // physically seat an ambulatory patient, but sending one on a
        // dialysis round is how a delegation ends up with no ambulance when
        // it is called for. Stretcher work is the only thing that claims one;
        // the long-haul vans take the out-of-district runs; everything else
        // rotates through the rest of the transport fleet, which is what
        // spreads a busy day across several vehicles instead of stacking
        // them all onto the first one that fits.
        const groupSeed = `${date}|${group.facilityId}|${group.direction}`;
        const preferredOrder = stretchers
          ? [vehicles.ambulance2.id]
          : soloRun
            ? rotate([vehicles.transport3.id, vehicles.transport5.id, vehicles.transport1.id, vehicles.transport4.id, vehicles.transport2.id], groupSeed)
            : wheelchairs > 1
              ? rotate([vehicles.transport2.id, vehicles.transport1.id, vehicles.transport4.id, vehicles.transport3.id, vehicles.transport5.id], groupSeed)
              : rotate([vehicles.transport1.id, vehicles.transport4.id, vehicles.transport2.id, vehicles.transport5.id, vehicles.transport3.id], groupSeed);
        const vehicle = preferredOrder
          .map((id) => fleet.find((candidate) => candidate.id === id))
          .find(
            (candidate) =>
              candidate &&
              crewByVehicleId[candidate.id] &&
              candidate.seatedCapacity >= seated &&
              candidate.wheelchairPositions >= wheelchairs &&
              candidate.stretcherPositions >= stretchers &&
              isFree(candidate.id, from, to),
          );
        // Nothing fits: the chunk stays in the rail, which is a real outcome
        // and a more useful fixture than a journey forced onto a vehicle
        // that was never free.
        if (!vehicle) continue;

        const tripId = await buildTrip({
          vehicleId: vehicle.id,
          date,
          status,
          notes: `${facility?.name ?? ''} — ${outbound ? 'ida' : 'volta'}`.trim(),
          crew: crewByVehicleId[vehicle.id],
          legs: legTimes,
        });
        busy.set(vehicle.id, [...(busy.get(vehicle.id) ?? []), { from, to }]);
        vehicleIds.add(vehicle.id);
        journeys += 1;

        // Where the vehicle actually is right after its first stop and right
        // before its last: an outbound chunk's first stop is the earliest
        // patient's own door and its last is the shared destination facility
        // (every leg in the group drops off there); a return chunk runs the
        // other way — first stop is that same shared facility, and the last
        // is whichever patient's own door the latest dropoff belongs to.
        const facilityPoint = facility ? { latitude: facility.latitude, longitude: facility.longitude } : { latitude: null, longitude: null };
        const dropoffTimes = legTimes.map((legTime) => new Date(legTime.dropoffPlannedAt).getTime());
        const lastDropoffIndex = dropoffTimes.indexOf(Math.max(...dropoffTimes));
        builtTrips.push({
          tripId,
          vehicleId: vehicle.id,
          direction: group.direction,
          solo: soloRun || stretchers > 0,
          legTimes,
          firstPickupAt: Math.min(...legTimes.map((legTime) => new Date(legTime.pickupPlannedAt).getTime())),
          lastStopAt: dropoffTimes[lastDropoffIndex],
          firstDoor: outbound ? chunk[0].door : facilityPoint,
          lastAnchor: outbound ? facilityPoint : chunk[lastDropoffIndex].door,
          demand: { seated, wheelchairs, stretchers },
        });
      }
    }

    const mergedCount = await mergeChainedTrips(builtTrips);
    await addBaseStops(builtTrips);
    return { journeys: journeys - mergedCount, vehicleIds };
  }

  /**
   * Chains a vehicle's next single-destination journey directly onto its
   * previous one when the two are close enough in time and space to read as
   * "picked up a few more people along the way to a second destination"
   * rather than two unrelated rounds — see #219's own worked example (a run
   * that starts in one locality, collects several people, and drops some at
   * one facility and the rest at another). Reuses `assignLegToTrip`'s own
   * move semantics rather than a bespoke SQL move: the absorbed trip ends up
   * with no stops left, which is exactly the condition `syncOccupancy`
   * already tears its `VehicleOccupancy` interval down for, and it is then
   * deleted outright.
   *
   * Deliberately only chains *adjacent* pairs, never re-scans further ahead
   * — a modest three-journey vehicle-day is exactly the target, not an
   * aggressive route optimiser trying every combination.
   */
  async function mergeChainedTrips(builtTrips: BuiltTripMeta[]): Promise<number> {
    const byVehicle = new Map<string, BuiltTripMeta[]>();
    for (const trip of builtTrips) byVehicle.set(trip.vehicleId, [...(byVehicle.get(trip.vehicleId) ?? []), trip]);

    let mergedCount = 0;
    for (const [vehicleId, trips] of byVehicle) {
      trips.sort((a, b) => a.firstPickupAt - b.firstPickupAt);
      const vehicle = fleet.find((candidate) => candidate.id === vehicleId);
      if (!vehicle) continue;

      let current = trips[0];
      for (let index = 1; index < trips.length; index++) {
        const next = trips[index];
        const gapMinutes = (next.firstPickupAt - current.lastStopAt) / 60_000;
        const distanceKm = beelineKm(current.lastAnchor, next.firstDoor);
        const combinedDemand = {
          seated: current.demand.seated + next.demand.seated,
          wheelchairs: current.demand.wheelchairs + next.demand.wheelchairs,
          stretchers: current.demand.stretchers + next.demand.stretchers,
        };
        const canChain =
          !current.solo &&
          !next.solo &&
          current.direction === next.direction &&
          gapMinutes >= 0 &&
          gapMinutes <= MERGE_MAX_GAP_MINUTES &&
          distanceKm != null &&
          distanceKm <= MERGE_MAX_DISTANCE_KM &&
          combinedDemand.seated <= vehicle.seatedCapacity &&
          combinedDemand.wheelchairs <= vehicle.wheelchairPositions &&
          combinedDemand.stretchers <= vehicle.stretcherPositions;

        if (!canChain) {
          current = next;
          continue;
        }

        // A raw stop move, not `assignLegToTrip`-per-leg: moving one leg at
        // a time would widen `current`'s occupancy window before `next`'s
        // own shrinks back down, and since every dropoff in an outbound
        // chunk shares one identical instant (the whole group's shared
        // appointment time, minus ten minutes), that transient state
        // reliably self-conflicts with the vehicle's own still-there `next`
        // booking — a false "double booking" `assignLegToTrip`'s public
        // per-leg contract has no way to see past. Moving every stop in one
        // transaction and recomputing `current`'s occupancy once, only after
        // `next`'s own booking is gone, never passes through that state.
        const nextStops = await prisma.tripStop.findMany({ where: { tripId: next.tripId }, orderBy: { sequence: 'asc' } });
        const currentMaxSequence = (await prisma.tripStop.aggregate({ where: { tripId: current.tripId }, _max: { sequence: true } }))._max.sequence ?? 0;
        await prisma.$transaction(
          nextStops.map((stop, index) =>
            prisma.tripStop.update({ where: { id: stop.id }, data: { tripId: current.tripId, sequence: currentMaxSequence + index + 1 } }),
          ),
        );
        await vehicleOccupancy.removeForSource(VehicleOccupancySource.TRANSPORT_TRIP, next.tripId);
        const currentStops = await prisma.tripStop.findMany({ where: { tripId: current.tripId } });
        const window = computeTripOccupancyWindow(
          currentStops.map((stop) => ({ plannedAt: stop.plannedAt.toISOString(), dwellMinutes: stop.dwellMinutes })),
        );
        await vehicleOccupancy.rebookForSource(VehicleOccupancySource.TRANSPORT_TRIP, current.tripId, {
          vehicleId: current.vehicleId,
          startsAt: new Date(window.startsAt),
          endsAt: new Date(window.endsAt),
        });
        await prisma.trip.delete({ where: { id: next.tripId } });
        mergedCount += 1;

        current.legTimes = [...current.legTimes, ...next.legTimes];
        current.lastStopAt = next.lastStopAt;
        current.lastAnchor = next.lastAnchor;
        current.demand = combinedDemand;
        // `next`'s trip row is gone — empty its own record so `addBaseStops`
        // (which shares this same `builtTrips` array) skips it rather than
        // adding a base stop to a deleted trip.
        next.legTimes = [];
        // `current` absorbed `next` and keeps scanning for a third journey
        // to chain on — `current` itself doesn't advance.
      }
    }
    return mergedCount;
  }

  /**
   * The day's first journey leaves base to reach its first stop, and the
   * last one returns to it afterwards (#247's own seed-realism ask) — never
   * every journey in between, since a vehicle routinely goes straight from
   * dropping people off at one facility to the next journey's first pickup
   * without swinging back to Campo in the middle of the day. Scoped to each
   * vehicle's own **surviving** trips, so a trip `mergeChainedTrips` deleted
   * is never targeted.
   */
  async function addBaseStops(builtTrips: BuiltTripMeta[]): Promise<void> {
    const byVehicle = new Map<string, BuiltTripMeta[]>();
    for (const trip of builtTrips) byVehicle.set(trip.vehicleId, [...(byVehicle.get(trip.vehicleId) ?? []), trip]);

    for (const trips of byVehicle.values()) {
      // A trip `mergeChainedTrips` absorbed into another has its own
      // `legTimes` emptied out — see that function's own comment — which is
      // what excludes it here without needing a second, parallel "was this
      // one deleted" flag.
      const surviving = trips.filter((trip) => trip.legTimes.length > 0);
      if (surviving.length === 0) continue;
      surviving.sort((a, b) => a.firstPickupAt - b.firstPickupAt);
      const first = surviving[0];
      const last = surviving[surviving.length - 1];

      // `addStop` has no override-reason parameter to fall back on (unlike
      // `buildTrip`'s crew add above) — widening a boundary trip's own
      // occupancy window by a plausible base-to-door travel time almost
      // never collides with anything else on a fixture vehicle's day, but a
      // conflict here is a missing base stop, not a reason to abort the
      // whole date's plan.
      try {
        await tripStopsService.addStop(first.tripId, {
          kind: TripStopKind.DEPART_FROM_BASE,
          plannedAt: new Date(first.firstPickupAt - travelMinutesBetween(basePoint, first.firstDoor) * 60_000).toISOString(),
        });
      } catch (cause) {
        console.warn(`  (skipped DEPART_FROM_BASE for trip ${first.tripId}: ${String(cause)})`);
      }
      try {
        await tripStopsService.addStop(last.tripId, {
          kind: TripStopKind.RETURN_TO_BASE,
          plannedAt: new Date(last.lastStopAt + travelMinutesBetween(last.lastAnchor, basePoint) * 60_000).toISOString(),
        });
      } catch (cause) {
        console.warn(`  (skipped RETURN_TO_BASE for trip ${last.tripId}: ${String(cause)})`);
      }
    }
  }

  // Every work day in the horizon gets a real plan, not just a handful of
  // days near today — Sunday is the delegation's one day off, so it is the
  // only date left entirely to the rail.
  let plannedJourneys = 0;
  let plannedDayCount = 0;
  const vehicleCountsByDate: number[] = [];
  const plannedDates = horizonDates.filter((date) => isoDayOfWeek(date) !== 0);
  for (const date of plannedDates) {
    const { journeys, vehicleIds } = await planDay(date, date < today ? TripStatus.COMPLETED : TripStatus.PLANNED);
    plannedJourneys += journeys;
    if (journeys > 0) {
      plannedDayCount += 1;
      vehicleCountsByDate.push(vehicleIds.size);
    }
  }
  const stillUnassigned = await prisma.transportLeg.count({
    where: {
      date: { gte: parseIsoDate(today), lte: parseIsoDate(horizonTo) },
      status: { notIn: [LegStatus.CANCELLED as never, LegStatus.NO_SHOW as never] },
      tripStops: { none: {} },
    },
  });
  console.log(
    `✅ ${plannedJourneys} journeys planned across ${plannedDayCount} work days ` +
      `(${Math.min(...vehicleCountsByDate)}–${Math.max(...vehicleCountsByDate)} vehicles a day); ` +
      `${stillUnassigned} legs from today onwards left unassigned for the board's rail.`,
  );

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
