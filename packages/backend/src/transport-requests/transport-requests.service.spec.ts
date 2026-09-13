import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  StaffAbsenceKind,
  TransportRequestDecision,
  TransportRequestOccurrenceType,
  TransportRequestVehicleType,
  VehicleOccupancySource,
  VehicleType,
  mapTransportRequestVehicleType,
} from '@redinfo/shared';
import { TransportRequestsService } from './transport-requests.service';
import { PrismaService } from '../prisma/prisma.service';
import { FacilitiesService } from '../facilities/facilities.service';
import { StaffAbsencesService } from '../staff-absences/staff-absences.service';
import { VehicleOccupancyService } from '../vehicle-occupancy/vehicle-occupancy.service';

// ── Referral intake (#228) ──────────────────────────────────────────────────
//
// Entered by hand from the source referral, field order and grouping mirror
// the referral's own layout — a private hospital in Porto will not be in a
// table seeded with emergency rooms, so the destination facility has a
// create-if-missing path (`FacilitiesService.findOrCreateTransportDestination`).
// `externalServiceNumber` is unique per requesting organisation, never
// globally, since two requesters can reuse the same numbering. A decision is
// terminal — `decide` refuses a request already accepted or rejected — and
// accepting one never sets `externallyRegisteredAt`, which only the
// requester's own platform can (AB#228).

const REQUESTER = { id: 'org-requester', name: 'AXA Assistance', isRequester: true, isPayer: false };
const PAYER = { id: 'org-payer', name: 'Allianz', isRequester: false, isPayer: true };
const AGREEMENT = { id: 'agr-1', payerOrganisationId: PAYER.id, name: 'AXA/Allianz terms' };

const transportRequest = (
  overrides: Partial<{
    id: string;
    batchReference: string;
    communicatedAt: Date;
    requesterAccountCode: string;
    responseDueAt: Date;
    externalServiceNumber: string;
    appointmentAt: Date;
    requestingOrganisationId: string;
    payingOrganisationId: string;
    agreementId: string | null;
    patientId: string;
    occurrenceType: string;
    requestedVehicleType: string;
    escortTravels: boolean;
    isRoundTrip: boolean;
    originAddress: string;
    originLatitude: number | null;
    originLongitude: number | null;
    destinationFacilityId: string;
    freeTextMessage: string | null;
    coordColumnValue: string | null;
    decision: string;
    decidedByUserId: string | null;
    decidedAt: Date | null;
    rejectionReason: string | null;
    externallyRegisteredAt: Date | null;
    createdById: string;
  }> = {},
) => ({
  id: 'tr-1',
  batchReference: 'Email 12345',
  communicatedAt: new Date('2026-09-10T17:00:00.000Z'),
  requesterAccountCode: 'AZP',
  responseDueAt: new Date('2026-09-11T05:00:00.000Z'),
  externalServiceNumber: 'SVC-001',
  appointmentAt: new Date('2026-09-12T09:00:00.000Z'),
  requestingOrganisationId: REQUESTER.id,
  payingOrganisationId: PAYER.id,
  agreementId: null,
  patientId: 'pat-1',
  occurrenceType: TransportRequestOccurrenceType.CONSULTA,
  requestedVehicleType: TransportRequestVehicleType.TRANSPORTE,
  escortTravels: false,
  isRoundTrip: true,
  originAddress: 'Rua das Flores, 10',
  originLatitude: null,
  originLongitude: null,
  destinationFacilityId: 'fac-1',
  freeTextMessage: null,
  coordColumnValue: null,
  decision: TransportRequestDecision.PENDING,
  decidedByUserId: null,
  decidedAt: null,
  rejectionReason: null,
  externallyRegisteredAt: null,
  createdById: 'user-1',
  createdAt: new Date('2026-09-10T17:05:00.000Z'),
  updatedAt: new Date('2026-09-10T17:05:00.000Z'),
  ...overrides,
});

const validInput = () => ({
  batchReference: 'Email 12345',
  communicatedAt: '2026-09-10T17:00:00.000Z',
  requesterAccountCode: 'AZP',
  responseDueAt: '2026-09-11T05:00:00.000Z',
  externalServiceNumber: 'SVC-001',
  appointmentAt: '2026-09-12T09:00:00.000Z',
  requestingOrganisationId: REQUESTER.id,
  payingOrganisationId: PAYER.id,
  patientId: 'pat-1',
  occurrenceType: TransportRequestOccurrenceType.CONSULTA,
  requestedVehicleType: TransportRequestVehicleType.TRANSPORTE,
  escortTravels: false,
  isRoundTrip: true,
  originAddress: 'Rua das Flores, 10',
  destinationFacilityId: 'fac-1',
});

function makeService(
  prismaOverrides: Record<string, unknown> = {},
  facilitiesOverrides: Record<string, unknown> = {},
  staffAbsencesOverrides: Record<string, unknown> = {},
  vehicleOccupancyOverrides: Record<string, unknown> = {},
) {
  const prisma = {
    transportRequest: {
      findMany: jest.fn(() => Promise.resolve([])),
      findUnique: jest.fn(() => Promise.resolve(transportRequest())),
      findFirst: jest.fn(() => Promise.resolve(null)),
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(transportRequest(args.data as never)),
      ),
      update: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(transportRequest(args.data as never)),
      ),
      delete: jest.fn(() => Promise.resolve(transportRequest())),
      count: jest.fn(() => Promise.resolve(0)),
    },
    organisation: {
      findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) =>
        Promise.resolve(id === REQUESTER.id ? REQUESTER : id === PAYER.id ? PAYER : null),
      ),
    },
    agreement: { findUnique: jest.fn(() => Promise.resolve(AGREEMENT)) },
    patient: { count: jest.fn(() => Promise.resolve(1)) },
    facility: { count: jest.fn(() => Promise.resolve(1)) },
    scheduleAssignment: { findMany: jest.fn(() => Promise.resolve([])) },
    vehicle: { findMany: jest.fn(() => Promise.resolve([])) },
    user: { findMany: jest.fn(() => Promise.resolve([])) },
    $transaction: jest.fn((arg: unknown) => Promise.all(arg as Promise<unknown>[])),
    ...prismaOverrides,
  } as unknown as PrismaService;

  const facilities = {
    findOrCreateTransportDestination: jest.fn(() =>
      Promise.resolve({ id: 'fac-new', isTransportDestination: true }),
    ),
    ...facilitiesOverrides,
  } as unknown as FacilitiesService;

  const staffAbsences = {
    findOverlapping: jest.fn(() => Promise.resolve([])),
    ...staffAbsencesOverrides,
  } as unknown as StaffAbsencesService;

  const vehicleOccupancy = {
    findInRange: jest.fn(() => Promise.resolve([])),
    ...vehicleOccupancyOverrides,
  } as unknown as VehicleOccupancyService;

  return {
    service: new TransportRequestsService(prisma, facilities, staffAbsences, vehicleOccupancy),
    prisma,
    facilities,
    staffAbsences,
    vehicleOccupancy,
  };
}

describe('creating a referral', () => {
  it('creates one matching a valid referral end to end', async () => {
    const { service, prisma } = makeService();

    await service.create(validInput(), { id: 'user-1' });

    expect(prisma.transportRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          batchReference: 'Email 12345',
          externalServiceNumber: 'SVC-001',
          requestingOrganisationId: REQUESTER.id,
          payingOrganisationId: PAYER.id,
          createdById: 'user-1',
        }),
      }),
    );
  });

  it('refuses a requesting organisation not flagged as a requester', async () => {
    const { service } = makeService();

    await expect(
      service.create({ ...validInput(), requestingOrganisationId: PAYER.id }, { id: 'user-1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a paying organisation not flagged as a payer', async () => {
    const { service } = makeService();

    await expect(
      service.create({ ...validInput(), payingOrganisationId: REQUESTER.id }, { id: 'user-1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows the requesting and paying organisation to differ', async () => {
    const { service, prisma } = makeService();

    await service.create(validInput(), { id: 'user-1' });

    expect(prisma.transportRequest.create).toHaveBeenCalled();
  });

  it('refuses an agreement not scoped to the paying organisation', async () => {
    const { service } = makeService({
      agreement: { findUnique: jest.fn(() => Promise.resolve({ ...AGREEMENT, payerOrganisationId: 'someone-else' })) },
    });

    await expect(
      service.create({ ...validInput(), agreementId: AGREEMENT.id }, { id: 'user-1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a duplicate externalServiceNumber for the same requester', async () => {
    const { service } = makeService({
      transportRequest: { findFirst: jest.fn(() => Promise.resolve(transportRequest())) },
    });

    await expect(service.create(validInput(), { id: 'user-1' })).rejects.toThrow(ConflictException);
  });

  it('uses the create-if-missing path when no destinationFacilityId is given', async () => {
    const { service, prisma, facilities } = makeService();
    const { destinationFacilityId, ...withoutId } = validInput();
    void destinationFacilityId;

    await service.create(
      { ...withoutId, destinationFacility: { name: 'Hospital Privado', municipalityId: 'mun-1' } },
      { id: 'user-1' },
    );

    expect(facilities.findOrCreateTransportDestination).toHaveBeenCalledWith(
      'Hospital Privado',
      'mun-1',
      undefined,
      undefined,
    );
    expect(prisma.transportRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ destinationFacilityId: 'fac-new' }) }),
    );
  });

  it('rejects a payload naming both a destination id and a new one', async () => {
    const { service } = makeService();

    await expect(
      service.create(
        { ...validInput(), destinationFacility: { name: 'X', municipalityId: 'mun-1' } },
        { id: 'user-1' },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('the ageing query', () => {
  it('orders by responseDueAt and computes minutes remaining', async () => {
    const { service, prisma } = makeService({
      transportRequest: {
        findMany: jest.fn(() => Promise.resolve([transportRequest()])),
        count: jest.fn(() => Promise.resolve(1)),
      },
    });

    const page = await service.findManaged(1, 50);

    expect(prisma.transportRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { responseDueAt: 'asc' } }),
    );
    expect(typeof page.data[0].minutesUntilResponseDue).toBe('number');
  });
});

describe('deciding a referral', () => {
  it('accepting does not set externallyRegisteredAt', async () => {
    const { service, prisma } = makeService();

    const result = await service.decide('tr-1', { decision: TransportRequestDecision.ACCEPTED }, { id: 'user-2' });

    expect(prisma.transportRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          decision: TransportRequestDecision.ACCEPTED,
          decidedByUserId: 'user-2',
        }),
      }),
    );
    const updateCall = (prisma.transportRequest.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data).not.toHaveProperty('externallyRegisteredAt');
    expect(result.externallyRegisteredAt).toBeFalsy();
  });

  it('rejecting requires a reason', async () => {
    const { service } = makeService();

    await expect(
      service.decide('tr-1', { decision: TransportRequestDecision.REJECTED }, { id: 'user-2' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses to re-decide an already-decided referral', async () => {
    const { service } = makeService({
      transportRequest: {
        findUnique: jest.fn(() => Promise.resolve(transportRequest({ decision: TransportRequestDecision.ACCEPTED }))),
      },
    });

    await expect(
      service.decide('tr-1', { decision: TransportRequestDecision.REJECTED, rejectionReason: 'Too late' }, { id: 'user-2' }),
    ).rejects.toThrow(ConflictException);
  });

  it('404s on an unknown id', async () => {
    const { service } = makeService({ transportRequest: { findUnique: jest.fn(() => Promise.resolve(null)) } });

    await expect(
      service.decide('missing', { decision: TransportRequestDecision.ACCEPTED }, { id: 'user-2' }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('editing a referral', () => {
  it('refuses to edit one already decided', async () => {
    const { service } = makeService({
      transportRequest: {
        findUnique: jest.fn(() => Promise.resolve(transportRequest({ decision: TransportRequestDecision.ACCEPTED }))),
      },
    });

    await expect(service.update('tr-1', { batchReference: 'New ref' })).rejects.toThrow(ConflictException);
  });
});

describe('the undispatched section (awaitingExternalRegistration)', () => {
  it('overrides decision with ACCEPTED + externallyRegisteredAt null, ordered by decidedAt', async () => {
    const { service, prisma } = makeService({
      transportRequest: {
        findMany: jest.fn(() => Promise.resolve([transportRequest({ decision: TransportRequestDecision.ACCEPTED })])),
        count: jest.fn(() => Promise.resolve(1)),
      },
    });

    await service.findManaged(1, 50, TransportRequestDecision.PENDING, true);

    expect(prisma.transportRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { decision: TransportRequestDecision.ACCEPTED, externallyRegisteredAt: null },
        orderBy: { decidedAt: 'asc' },
      }),
    );
  });
});

describe('marking external registration', () => {
  it('stamps externallyRegisteredAt on an accepted referral', async () => {
    const { service, prisma } = makeService({
      transportRequest: {
        findUnique: jest.fn(() => Promise.resolve(transportRequest({ decision: TransportRequestDecision.ACCEPTED }))),
        update: jest.fn((args: { data: Record<string, unknown> }) =>
          Promise.resolve(
            transportRequest({ decision: TransportRequestDecision.ACCEPTED, ...args.data } as never),
          ),
        ),
      },
    });

    await service.registerExternally('tr-1');

    expect(prisma.transportRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ externallyRegisteredAt: expect.any(Date) }) }),
    );
  });

  it('refuses a referral that was never accepted', async () => {
    const { service } = makeService();

    await expect(service.registerExternally('tr-1')).rejects.toThrow(ConflictException);
  });

  it('refuses a referral already marked as externally registered', async () => {
    const { service } = makeService({
      transportRequest: {
        findUnique: jest.fn(() =>
          Promise.resolve(
            transportRequest({ decision: TransportRequestDecision.ACCEPTED, externallyRegisteredAt: new Date() }),
          ),
        ),
      },
    });

    await expect(service.registerExternally('tr-1')).rejects.toThrow(ConflictException);
  });

  it('404s on an unknown id', async () => {
    const { service } = makeService({ transportRequest: { findUnique: jest.fn(() => Promise.resolve(null)) } });

    await expect(service.registerExternally('missing')).rejects.toThrow(NotFoundException);
  });
});

describe('the feasibility snapshot (#229)', () => {
  const vehicleFree = {
    id: 'veh-free',
    licensePlate: 'AA-00-BB',
    numeroCauda: '01',
    vehicleType: VehicleType.TRANSPORT,
    isDeleted: false,
  };
  const vehicleCommitted = {
    id: 'veh-busy',
    licensePlate: 'CC-11-DD',
    numeroCauda: '02',
    vehicleType: VehicleType.TRANSPORT,
    isDeleted: false,
  };

  it('joins the roster, absences and vehicle occupancy for the appointment date', async () => {
    const { service } = makeService(
      {
        vehicle: { findMany: jest.fn(() => Promise.resolve([vehicleFree, vehicleCommitted])) },
        user: { findMany: jest.fn(() => Promise.resolve([{ id: 'u-2', firstName: 'Bruno', lastName: 'Costa' }])) },
        scheduleAssignment: {
          findMany: jest.fn(() =>
            Promise.resolve([
              { user: { id: 'u-1', firstName: 'Ana', lastName: 'Silva' }, role: { name: 'Driver', order: 0 } },
            ]),
          ),
        },
      },
      {},
      {
        findOverlapping: jest.fn(() =>
          Promise.resolve([
            { id: 'abs-1', userId: 'u-2', kind: StaffAbsenceKind.VACATION, startDate: '2026-09-12', endDate: '2026-09-14' },
          ]),
        ),
      },
      {
        findInRange: jest.fn(() =>
          Promise.resolve([
            {
              id: 'occ-1',
              vehicleId: vehicleCommitted.id,
              startsAt: new Date('2026-09-12T08:00:00.000Z'),
              endsAt: new Date('2026-09-12T12:00:00.000Z'),
              source: VehicleOccupancySource.SCHEDULE_SHIFT,
              sourceId: 'sched-1',
            },
          ]),
        ),
      },
    );

    const feasibility = await service.getFeasibility('tr-1');

    expect(feasibility.date).toBe('2026-09-12');
    expect(feasibility.roster).toEqual([
      { userId: 'u-1', firstName: 'Ana', lastName: 'Silva', roleName: 'Driver' },
    ]);
    expect(feasibility.absentStaff).toEqual([
      { userId: 'u-2', userName: 'Bruno Costa', kind: StaffAbsenceKind.VACATION, startDate: '2026-09-12', endDate: '2026-09-14' },
    ]);
    expect(feasibility.committedVehicles).toEqual([
      expect.objectContaining({ vehicleId: vehicleCommitted.id, source: VehicleOccupancySource.SCHEDULE_SHIFT }),
    ]);
    const transportGroup = feasibility.freeVehiclesByType.find((g) => g.vehicleType === VehicleType.TRANSPORT)!;
    expect(transportGroup.vehicles.map((v) => v.id)).toEqual([vehicleFree.id]);
    // requestedVehicleType on the default fixture is TRANSPORTE → TRANSPORT, and it's free.
    expect(feasibility.requestedVehicleTypeFree).toBe(true);
  });

  it('is null when the requested vehicle type has no physical counterpart (OUTRO)', async () => {
    const { service } = makeService({
      transportRequest: {
        findUnique: jest.fn(() =>
          Promise.resolve(transportRequest({ requestedVehicleType: TransportRequestVehicleType.OUTRO })),
        ),
      },
    });

    const feasibility = await service.getFeasibility('tr-1');

    expect(feasibility.requestedVehicleTypeFree).toBeNull();
  });

  it('404s on an unknown id', async () => {
    const { service } = makeService({ transportRequest: { findUnique: jest.fn(() => Promise.resolve(null)) } });

    await expect(service.getFeasibility('missing')).rejects.toThrow(NotFoundException);
  });
});

describe('mapTransportRequestVehicleType', () => {
  it('maps the referral vocabulary onto the fleet\'s physical types, OUTRO onto neither', () => {
    expect(mapTransportRequestVehicleType(TransportRequestVehicleType.AMBULANCIA)).toBe(VehicleType.EMERGENCY);
    expect(mapTransportRequestVehicleType(TransportRequestVehicleType.TRANSPORTE)).toBe(VehicleType.TRANSPORT);
    expect(mapTransportRequestVehicleType(TransportRequestVehicleType.OUTRO)).toBeNull();
  });
});
