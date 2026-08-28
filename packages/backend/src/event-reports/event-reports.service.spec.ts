import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  EventLocationType,
  EventReportInput,
  EventReportType,
  Gender,
  InemSupportUnitType,
  InventoryItemType,
  UserRole,
  VictimDestinationKind,
} from '@redinfo/shared';
import { EventReportsService, RequestUser } from './event-reports.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShiftScheduleService } from '../availability/shift-schedule.service';
import { StockMovementsService } from '../inventory/stock-movements.service';

// ── Filing, reading and changing a report ──────────────────────────────────────
//
// The governing rules: a report is readable by the crew that was there and by
// coordinators; it is *finishable* by the same crew, because the end time and
// the narrative are routinely added the next morning; and deleting one is a
// coordinator's act because it leaves a gap in the year's numbering.

const OPERATIONAL: RequestUser = { id: 'user-tiago', role: UserRole.EMERGENCY_OPERATIONAL };
const OTHER_OPERATIONAL: RequestUser = {
  id: 'user-outsider',
  role: UserRole.EMERGENCY_OPERATIONAL,
};
const COORDINATOR: RequestUser = { id: 'user-ana', role: UserRole.EMERGENCY_COORDINATOR };
const LOGISTICS: RequestUser = { id: 'user-log', role: UserRole.LOGISTICS_COORDINATOR };

/**
 * A stored row, complete enough to be serialized.
 *
 * Not trimmed to just the fields under test: `create` and `update` serialize
 * whatever they hand back, so a partial row would fail for a reason that has
 * nothing to do with the rule being asserted.
 */
const row = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'rep-1',
    type: EventReportType.EMERGENCY,
    number: 128,
    year: 2026,
    occurredOn: new Date('2026-08-22T00:00:00.000Z'),
    startedAt: new Date('2026-08-22T20:14:00.000Z'),
    endedAt: new Date('2026-08-22T22:05:00.000Z'),
    externalReference: '2608 4471',
    locationType: EventLocationType.HOME,
    localityId: 'loc-taveiro',
    locality: null,
    activationAt: null,
    sceneArrivalAt: null,
    sceneDepartureAt: null,
    hospitalArrivalAt: null,
    availableAt: null,
    operationalReport: '<p>Relato.</p>',
    crew: [{ id: 'c1', userId: 'user-tiago', roleName: 'Driver', position: 0, user: null }],
    vehicles: [],
    victims: [],
    inemSupportUnits: [],
    materials: [],
    attachments: [],
    assessments: [],
    legacyNumber: null,
    chamuCircumstances: null,
    chamuHistory: null,
    chamuAllergies: null,
    chamuMedication: null,
    chamuLastMeal: null,
    abcde: null,
    submittedAt: new Date('2026-08-22T22:11:00.000Z'),
    submittedById: 'user-filer',
    submittedBy: null,
    liveRun: null,
    createdById: 'user-filer',
    createdBy: null,
    createdAt: new Date('2026-08-22T22:11:00.000Z'),
    updatedAt: new Date('2026-08-22T22:11:00.000Z'),
    shiftDate: null,
    shiftSlot: null,
    scheduleId: null,
    schedule: null,
    ...overrides,
  }) as never;

const input = (overrides: Partial<EventReportInput> = {}): EventReportInput => ({
  type: EventReportType.EMERGENCY,
  occurredOn: '2026-08-22',
  startedAt: '2026-08-22T20:14:00.000Z',
  endedAt: '2026-08-22T22:05:00.000Z',
  externalReference: '2608 4471',
  locationType: EventLocationType.HOME,
  localityId: 'loc-taveiro',
  operationalReport: '<p>Relato.</p>',
  crew: [{ userId: 'user-tiago', roleName: 'Driver' }],
  vehicles: [{ vehicleId: 'veh-1', kilometres: 42 }],
  victims: [
    {
      gender: Gender.FEMALE,
      age: 67,
      destinationKind: VictimDestinationKind.HOSPITAL,
      destinationHospitalId: 'hosp-1',
    },
  ],
  ...overrides,
});

/**
 * A Prisma stand-in that records what it was asked, so the tests can assert on
 * the `where` a filter produced without a database in the loop.
 */
function makePrisma(overrides: Record<string, unknown> = {}) {
  const calls: { findMany: unknown[]; count: unknown[]; groupBy: unknown[] } = {
    findMany: [],
    count: [],
    groupBy: [],
  };

  // Annotated because `$transaction` hands the fake back to its own callback,
  // which TypeScript cannot infer through.
  const prisma: Record<string, any> = {
    calls,
    eventReport: {
      findMany: jest.fn((args: unknown) => {
        calls.findMany.push(args);
        return Promise.resolve([]);
      }),
      count: jest.fn((args: unknown) => {
        calls.count.push(args);
        return Promise.resolve(0);
      }),
      groupBy: jest.fn((args: unknown) => {
        calls.groupBy.push(args);
        return Promise.resolve([
          { type: EventReportType.EMERGENCY, _count: { _all: 9 } },
          { type: EventReportType.LOCAL_SUPPORT, _count: { _all: 4 } },
        ]);
      }),
      findUnique: jest.fn(() => Promise.resolve(null)),
      findUniqueOrThrow: jest.fn(() => Promise.resolve(row())),
      delete: jest.fn(() => Promise.resolve({ id: 'rep-1' })),
      create: jest.fn(() => Promise.resolve(row())),
      update: jest.fn(() => Promise.resolve(row())),
    },
    locality: { count: jest.fn(() => Promise.resolve(1)) },
    vehicle: { findMany: jest.fn(() => Promise.resolve([{ id: 'veh-1' }])) },
    user: { findMany: jest.fn(() => Promise.resolve([{ id: 'user-tiago' }])) },
    hospital: { findMany: jest.fn(() => Promise.resolve([{ id: 'hosp-1' }])) },
    materialItem: { findMany: jest.fn(() => Promise.resolve([{ id: 'item-gauze' }])) },
    schedule: { count: jest.fn(() => Promise.resolve(1)) },
    liveRun: { updateMany: jest.fn(() => Promise.resolve({ count: 0 })) },
    eventReportCrewMember: { deleteMany: jest.fn(() => Promise.resolve({ count: 1 })) },
    eventReportAssessment: { deleteMany: jest.fn(() => Promise.resolve({ count: 0 })) },
    eventReportVehicle: { deleteMany: jest.fn(() => Promise.resolve({ count: 1 })) },
    eventReportVictim: { deleteMany: jest.fn(() => Promise.resolve({ count: 1 })) },
    eventReportInemSupportUnit: { deleteMany: jest.fn(() => Promise.resolve({ count: 0 })) },
    eventReportMaterial: { deleteMany: jest.fn(() => Promise.resolve({ count: 0 })) },
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => unknown)(prisma)
        : Promise.all(arg as Promise<unknown>[]),
    ),
    ...overrides,
  };

  return prisma as unknown as PrismaService & { calls: typeof calls };
}

const shiftSchedule = {
  getPatternForWindow: jest.fn(() => Promise.resolve([])),
} as unknown as ShiftScheduleService;

/**
 * A numbering stand-in.
 *
 * Stubbed rather than real because the real one is three raw SQL statements:
 * what they compute is proved by `event-report-numbering.spec.ts` against
 * `orderForNumbering`, and that they compute it in Postgres is proved by the
 * integration suite. What these tests are about is *when* the service reaches
 * for it.
 */
function makeNumbering() {
  return {
    lockPartition: jest.fn(() => Promise.resolve()),
    countDisplaced: jest.fn(() => Promise.resolve(0)),
    resequence: jest.fn(() => Promise.resolve([])),
  };
}

/**
 * A stock-movements stand-in.
 *
 * Stubbed rather than real for the same reason `numbering` is: what
 * `applyReportConsumption`/`reverseReportConsumption` actually do is proved
 * by `stock-movements.service.spec.ts` and the inventory integration suite.
 * What these tests are about is *when* `EventReportsService` reaches for it.
 */
function makeStockMovements() {
  return {
    applyReportConsumption: jest.fn(() => Promise.resolve()),
    reverseReportConsumption: jest.fn(() => Promise.resolve()),
  };
}

function makeService(
  prisma = makePrisma(),
  numbering = makeNumbering(),
  stockMovements = makeStockMovements(),
) {
  return {
    service: new EventReportsService(prisma, shiftSchedule, numbering as never, stockMovements as never),
    prisma,
    numbering,
    stockMovements,
  };
}

describe('reading a report', () => {
  it('lets a coordinator read any report', () => {
    const { service } = makeService();
    expect(() => service.assertCanRead(row(), COORDINATOR)).not.toThrow();
  });

  it('lets someone on the crew read it', () => {
    const { service } = makeService();
    expect(() => service.assertCanRead(row(), OPERATIONAL)).not.toThrow();
  });

  it('lets whoever filed it read it, even if they were not on the crew', () => {
    const { service } = makeService();
    const filer: RequestUser = { id: 'user-filer', role: UserRole.EMERGENCY_OPERATIONAL };
    expect(() => service.assertCanRead(row({ crew: [] }), filer)).not.toThrow();
  });

  it('refuses an operational who was neither', () => {
    const { service } = makeService();
    expect(() => service.assertCanRead(row(), OTHER_OPERATIONAL)).toThrow(ForbiddenException);
  });

  it('is 404, not 403, for a report that does not exist', async () => {
    const { service } = makeService();
    await expect(service.findOne('nope', COORDINATOR)).rejects.toThrow(NotFoundException);
  });
});

describe('changing a report', () => {
  it('lets the crew finish their own report the next morning', () => {
    const { service } = makeService();
    expect(() => service.assertCanWrite(row(), OPERATIONAL)).not.toThrow();
  });

  it('lets a coordinator change anyone’s', () => {
    const { service } = makeService();
    expect(() => service.assertCanWrite(row(), COORDINATOR)).not.toThrow();
  });

  it('refuses an operational who was not there', () => {
    const { service } = makeService();
    expect(() => service.assertCanWrite(row(), OTHER_OPERATIONAL)).toThrow(ForbiddenException);
  });

  it('refuses someone who cannot file reports at all, crew or not', () => {
    const { service } = makeService();
    // Logistics has no report permission; being named on the crew must not
    // grant one by the back door.
    expect(() =>
      service.assertCanWrite(row({ crew: [{ userId: LOGISTICS.id }] }), LOGISTICS),
    ).toThrow(ForbiddenException);
  });

  it('keeps the stored type, ignoring whatever the payload claims', async () => {
    const prisma = makePrisma();
    prisma.eventReport.findUnique = jest.fn(() =>
      Promise.resolve(row({ type: EventReportType.LOCAL_SUPPORT, crew: [] })),
    ) as never;
    prisma.vehicle.findMany = jest.fn(() =>
      Promise.resolve([{ id: 'veh-1' }, { id: 'veh-2' }]),
    ) as never;
    const { service } = makeService(prisma);

    // Two vehicles would be refused on an emergency and are fine on a support
    // report — so accepting this proves the stored type won.
    await service.update(
      'rep-1',
      input({
        type: EventReportType.EMERGENCY,
        externalReference: null,
        vehicles: [
          { vehicleId: 'veh-1', kilometres: 10 },
          { vehicleId: 'veh-2', kilometres: 20 },
        ],
      }),
      COORDINATOR,
    );

    expect(prisma.eventReport.update).toHaveBeenCalled();
  });

  it('replaces the crew, vehicles and victims rather than merging them', async () => {
    const prisma = makePrisma();
    prisma.eventReport.findUnique = jest.fn(() => Promise.resolve(row())) as never;
    const { service } = makeService(prisma);

    await service.update('rep-1', input(), COORDINATOR);

    expect(prisma.eventReportCrewMember.deleteMany).toHaveBeenCalledWith({
      where: { reportId: 'rep-1' },
    });
    expect(prisma.eventReportVehicle.deleteMany).toHaveBeenCalledWith({
      where: { reportId: 'rep-1' },
    });
    expect(prisma.eventReportVictim.deleteMany).toHaveBeenCalledWith({
      where: { reportId: 'rep-1' },
    });
    expect(prisma.eventReportInemSupportUnit.deleteMany).toHaveBeenCalledWith({
      where: { reportId: 'rep-1' },
    });
    expect(prisma.eventReportMaterial.deleteMany).toHaveBeenCalledWith({
      where: { reportId: 'rep-1' },
    });
  });

  it('replaces the materials wholesale, defaulting an omitted vehicle to the report’s first one', async () => {
    const prisma = makePrisma();
    prisma.eventReport.findUnique = jest.fn(() => Promise.resolve(row())) as never;
    const { service } = makeService(prisma);

    await service.update(
      'rep-1',
      input({
        vehicles: [{ vehicleId: 'veh-1', kilometres: 42 }],
        materials: [
          { materialItemId: 'item-gauze', itemType: InventoryItemType.COUNTABLE, quantity: 4 },
        ],
      }),
      COORDINATOR,
    );

    expect(prisma.eventReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          materials: {
            create: [{ materialItemId: 'item-gauze', vehicleId: 'veh-1', quantity: 4, position: 0 }],
          },
        }),
      }),
    );
  });

  it('applies stock consumption when an already-filed report is edited', async () => {
    const prisma = makePrisma();
    prisma.eventReport.findUnique = jest.fn(() => Promise.resolve(row())) as never; // submittedAt set
    const { service, stockMovements } = makeService(prisma);

    await service.update(
      'rep-1',
      input({
        vehicles: [{ vehicleId: 'veh-1', kilometres: 42 }],
        materials: [
          { materialItemId: 'item-gauze', itemType: InventoryItemType.COUNTABLE, quantity: 4 },
        ],
      }),
      COORDINATOR,
    );

    expect(stockMovements.applyReportConsumption).toHaveBeenCalledWith(
      'rep-1',
      [{ materialItemId: 'item-gauze', vehicleId: 'veh-1', quantity: 4 }],
      COORDINATOR.id,
      expect.anything(),
    );
  });

  it('leaves stock alone when a draft is edited', async () => {
    const prisma = makePrisma();
    prisma.eventReport.findUnique = jest.fn(() =>
      Promise.resolve(row({ submittedAt: null, submittedById: null })),
    ) as never;
    const { service, stockMovements } = makeService(prisma);

    await service.update('rep-1', input(), COORDINATOR);

    expect(stockMovements.applyReportConsumption).not.toHaveBeenCalled();
  });

  it('replaces the INEM support units wholesale rather than merging them', async () => {
    const prisma = makePrisma();
    prisma.eventReport.findUnique = jest.fn(() => Promise.resolve(row())) as never;
    const { service } = makeService(prisma);

    await service.update(
      'rep-1',
      input({ inemSupportUnits: [{ unitType: InemSupportUnitType.VMER, hospitalId: 'hosp-1' }] }),
      COORDINATOR,
    );

    expect(prisma.eventReportInemSupportUnit.deleteMany).toHaveBeenCalledWith({
      where: { reportId: 'rep-1' },
    });
    expect(prisma.eventReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inemSupportUnits: {
            create: [{ position: 0, unitType: InemSupportUnitType.VMER, hospitalId: 'hosp-1' }],
          },
        }),
      }),
    );
  });

  it('refuses INEM support units on a report type with no CODU involvement', async () => {
    const prisma = makePrisma();
    prisma.eventReport.findUnique = jest.fn(() =>
      Promise.resolve(row({ type: EventReportType.LOCAL_SUPPORT, crew: [] })),
    ) as never;
    const { service } = makeService(prisma);

    await expect(
      service.update(
        'rep-1',
        input({
          type: EventReportType.LOCAL_SUPPORT,
          externalReference: null,
          inemSupportUnits: [{ unitType: InemSupportUnitType.SIV, hospitalId: 'hosp-1' }],
        }),
        COORDINATOR,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a payload naming a hospital that does not exist', async () => {
    const prisma = makePrisma();
    prisma.eventReport.findUnique = jest.fn(() => Promise.resolve(row())) as never;
    prisma.hospital.findMany = jest.fn(() => Promise.resolve([])) as never;
    const { service } = makeService(prisma);

    await expect(
      service.update(
        'rep-1',
        input({
          inemSupportUnits: [{ unitType: InemSupportUnitType.VMER, hospitalId: 'hosp-ghost' }],
        }),
        COORDINATOR,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('deleting a report', () => {
  it('is refused to the crew, because it renumbers everything after it', async () => {
    const prisma = makePrisma();
    prisma.eventReport.findUnique = jest.fn(() => Promise.resolve(row())) as never;
    const { service } = makeService(prisma);

    await expect(service.remove('rep-1', OPERATIONAL)).rejects.toThrow(ForbiddenException);
    expect(prisma.eventReport.delete).not.toHaveBeenCalled();
  });

  it('closes the gap it leaves, and says what moved', async () => {
    const prisma = makePrisma();
    prisma.eventReport.findUnique = jest.fn(() => Promise.resolve(row())) as never;
    const numbering = makeNumbering();
    numbering.resequence = jest.fn(() =>
      Promise.resolve([{ reportId: 'rep-2', from: 129, to: 128 }]),
    ) as never;
    const { service } = makeService(prisma, numbering);

    // Numbering is gap-free by construction now, so deleting 128 pulls 129 down
    // into its place. The caller is handed the list rather than left to discover
    // it: every move is a report whose printed identity has changed.
    await expect(service.remove('rep-1', COORDINATOR)).resolves.toEqual({
      id: 'rep-1',
      renumbered: [{ reportId: 'rep-2', from: 129, to: 128 }],
    });
    expect(prisma.eventReport.delete).toHaveBeenCalledWith({ where: { id: 'rep-1' } });
  });

  it('reverses stock consumption before deleting a filed report', async () => {
    const prisma = makePrisma();
    prisma.eventReport.findUnique = jest.fn(() => Promise.resolve(row())) as never; // submittedAt set
    const { service, stockMovements } = makeService(prisma);

    await service.remove('rep-1', COORDINATOR);

    expect(stockMovements.reverseReportConsumption).toHaveBeenCalledWith(
      'rep-1',
      expect.anything(),
    );
  });

  it('leaves stock alone when the deleted report was only ever a draft', async () => {
    const prisma = makePrisma();
    prisma.eventReport.findUnique = jest.fn(() =>
      Promise.resolve(row({ submittedAt: null, submittedById: null })),
    ) as never;
    const { service, stockMovements } = makeService(prisma);

    await service.remove('rep-1', COORDINATOR);

    expect(stockMovements.reverseReportConsumption).not.toHaveBeenCalled();
  });
});

describe('filing a draft', () => {
  const draft = (overrides: Record<string, unknown> = {}) =>
    row({ number: null, submittedAt: null, submittedById: null, ...overrides });

  it('marks it filed and resequences the partition', async () => {
    const prisma = makePrisma();
    prisma.eventReport.findUnique = jest.fn(() => Promise.resolve(draft())) as never;
    const { service, numbering } = makeService(prisma);

    const result = await service.submit('rep-1', OPERATIONAL);

    expect((prisma.eventReport.update as jest.Mock).mock.calls[0][0].data.submittedAt).toBeInstanceOf(
      Date,
    );
    expect(numbering.resequence).toHaveBeenCalled();
    expect(result.renumbered).toEqual([]);
  });

  it('destroys the run’s identity in the same transaction', async () => {
    const prisma = makePrisma();
    prisma.eventReport.findUnique = jest.fn(() => Promise.resolve(draft())) as never;
    const { service } = makeService(prisma);

    await service.submit('rep-1', OPERATIONAL);

    // Filing is the moment identity stops being needed, so it is destroyed then
    // — not on the next sweep, which would leave a window where a filed report
    // and a live victim name coexist.
    expect(prisma.liveRun.updateMany).toHaveBeenCalledWith({
      where: { reportId: 'rep-1', identity: { not: null } },
      data: { identity: null, identityPurgedAt: expect.any(Date) },
    });
  });

  it('refuses to file the same report twice', async () => {
    const prisma = makePrisma();
    prisma.eventReport.findUnique = jest.fn(() => Promise.resolve(row())) as never;
    const { service } = makeService(prisma);

    await expect(service.submit('rep-1', OPERATIONAL)).rejects.toThrow(/already been filed/i);
  });

  it('validates what is stored, not what was posted', async () => {
    const prisma = makePrisma();
    // A draft closed out of a live run in a dead spot: no CODU number, which an
    // emergency report cannot be filed without.
    prisma.eventReport.findUnique = jest.fn(() =>
      Promise.resolve(draft({ externalReference: null })),
    ) as never;
    const { service } = makeService(prisma);

    await expect(service.submit('rep-1', OPERATIONAL)).rejects.toThrow(BadRequestException);
    expect(prisma.eventReport.update).not.toHaveBeenCalled();
  });

  it('applies the stored materials’ stock consumption in the same transaction as filing', async () => {
    const prisma = makePrisma();
    prisma.eventReport.findUnique = jest.fn(() =>
      Promise.resolve(
        draft({
          vehicles: [
            {
              id: 'ev-1',
              vehicleId: 'veh-1',
              vehicle: null,
              kilometres: 42,
              position: 0,
              routeLegs: null,
              isOverridden: false,
            },
          ],
          materials: [
            {
              id: 'm1',
              materialItemId: 'item-gauze',
              materialItem: {
                id: 'item-gauze',
                namePt: 'Compressas',
                nameEn: null,
                unit: 'pcs',
                type: InventoryItemType.COUNTABLE,
              },
              vehicleId: 'veh-1',
              vehicle: null,
              quantity: 4,
              position: 0,
            },
          ],
        }),
      ),
    ) as never;
    const { service, stockMovements } = makeService(prisma);

    await service.submit('rep-1', OPERATIONAL);

    expect(stockMovements.applyReportConsumption).toHaveBeenCalledWith(
      'rep-1',
      [{ materialItemId: 'item-gauze', vehicleId: 'veh-1', quantity: 4 }],
      OPERATIONAL.id,
      expect.anything(),
    );
  });
});

describe('filing a report', () => {
  it('sanitizes the narrative before storing it', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);

    await service.create(
      input({ operationalReport: '<p>Queda</p><script>alert(1)</script>' }),
      'user-filer',
    );

    const data = (prisma.eventReport.create as jest.Mock).mock.calls[0][0].data;
    expect(data.operationalReport).toBe('<p>Queda</p>');
  });

  it('refuses markup that is only a script, rather than storing an empty report', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);

    // Sanitizing happens *before* validation, so this is judged on what would
    // actually be stored — nothing — and stored as nothing rather than
    // sneaking past a length check.
    await service.create(input({ operationalReport: '<script>alert(1)</script>' }), 'u');
    const data = (prisma.eventReport.create as jest.Mock).mock.calls[0][0].data;
    expect(data.operationalReport).toBe('');
  });

  it('inserts with no number and lets the resequence assign one', async () => {
    const prisma = makePrisma();
    const { service, numbering } = makeService(prisma);

    await service.create(input({ occurredOn: '2026-08-22' }), 'user-filer');

    // A number is a *position* in the year's activation-ordered sequence, so it
    // is never written by the insert — the insert says "this is filed", and the
    // resequence works out where it lands.
    const data = (prisma.eventReport.create as jest.Mock).mock.calls[0][0].data;
    expect(data).toMatchObject({ number: null, year: 2026 });
    expect(data.submittedAt).toBeInstanceOf(Date);
    expect(numbering.resequence).toHaveBeenCalledWith(
      expect.anything(),
      EventReportType.EMERGENCY,
      2026,
    );
  });

  it('locks the partition before the insert, not after it', async () => {
    const prisma = makePrisma();
    const numbering = makeNumbering();
    const order: string[] = [];
    numbering.lockPartition = jest.fn(() => {
      order.push('lock');
      return Promise.resolve();
    }) as never;
    (prisma.eventReport.create as jest.Mock).mockImplementation(() => {
      order.push('insert');
      return Promise.resolve(row());
    });
    const { service } = makeService(prisma, numbering);

    await service.create(input(), 'user-filer');

    // The other way round, a concurrent filing could slip between the insert and
    // the resequence and compute the same position.
    expect(order).toEqual(['lock', 'insert']);
  });

  it('leaves a draft unnumbered and unfiled', async () => {
    const prisma = makePrisma();
    const { service, numbering } = makeService(prisma);

    await service.create(input(), 'user-filer', { submit: false });

    const data = (prisma.eventReport.create as jest.Mock).mock.calls[0][0].data;
    expect(data.number).toBeNull();
    expect(data.submittedAt).toBeUndefined();
    expect(numbering.lockPartition).not.toHaveBeenCalled();
    expect(numbering.resequence).not.toHaveBeenCalled();
  });

  it('applies stock consumption when a report is created already filed', async () => {
    const prisma = makePrisma();
    const { service, stockMovements } = makeService(prisma);

    await service.create(
      input({
        vehicles: [{ vehicleId: 'veh-1', kilometres: 42 }],
        materials: [
          { materialItemId: 'item-gauze', itemType: InventoryItemType.COUNTABLE, quantity: 4 },
        ],
      }),
      'user-filer',
    );

    expect(stockMovements.applyReportConsumption).toHaveBeenCalledWith(
      'rep-1',
      [{ materialItemId: 'item-gauze', vehicleId: 'veh-1', quantity: 4 }],
      'user-filer',
      expect.anything(),
    );
  });

  it('leaves stock alone when a report is created as a draft', async () => {
    const prisma = makePrisma();
    const { service, stockMovements } = makeService(prisma);

    await service.create(input(), 'user-filer', { submit: false });

    expect(stockMovements.applyReportConsumption).not.toHaveBeenCalled();
  });

  it('refuses a filing that would renumber reports already on paper', async () => {
    const numbering = makeNumbering();
    numbering.countDisplaced = jest.fn(() => Promise.resolve(4)) as never;
    const { service } = makeService(makePrisma(), numbering);

    // An operational cannot rewrite four numbers that are already in a binder;
    // a coordinator can be told and decide.
    await expect(
      service.create(input(), 'user-filer', { actor: OPERATIONAL }),
    ).rejects.toThrow(/4 report/);
    await expect(
      service.create(input(), 'user-ana', { actor: COORDINATOR }),
    ).resolves.toBeDefined();
  });

  it('scopes the year to the day the activity happened, not to today', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);

    // A report for New Year's Eve, filed in January, belongs to the old year.
    await service.create(
      input({
        occurredOn: '2026-12-31',
        startedAt: '2026-12-31T23:30:00.000Z',
        endedAt: '2027-01-01T01:00:00.000Z',
      }),
      'user-filer',
    );

    expect(prisma.eventReport.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ year: 2026 }) }),
    );
  });

  it('numbers and inserts in one transaction, so a failure burns no number', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);

    await service.create(input(), 'user-filer');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(typeof (prisma.$transaction as jest.Mock).mock.calls[0][0]).toBe('function');
  });

  it('drops occurrence times a support report cannot have', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);

    await service.create(
      input({ type: EventReportType.LOCAL_SUPPORT, externalReference: null }),
      'user-filer',
    );

    const data = (prisma.eventReport.create as jest.Mock).mock.calls[0][0].data;
    expect(data).toMatchObject({
      activationAt: null,
      sceneArrivalAt: null,
      sceneDepartureAt: null,
      hospitalArrivalAt: null,
      availableAt: null,
    });
  });

  it('numbers crew, vehicles and victims by their order in the payload', async () => {
    const prisma = makePrisma();
    prisma.user.findMany = jest.fn(() =>
      Promise.resolve([{ id: 'user-a' }, { id: 'user-b' }]),
    ) as never;
    prisma.vehicle.findMany = jest.fn(() =>
      Promise.resolve([{ id: 'veh-1' }, { id: 'veh-2' }]),
    ) as never;
    const { service } = makeService(prisma);

    await service.create(
      input({
        type: EventReportType.LOCAL_SUPPORT,
        externalReference: null,
        crew: [{ userId: 'user-a' }, { userId: 'user-b' }],
        vehicles: [
          { vehicleId: 'veh-1', kilometres: 51 },
          { vehicleId: 'veh-2', kilometres: 36 },
        ],
        victims: [
          { gender: Gender.MALE, age: 14, destinationKind: VictimDestinationKind.CANCELLED },
          { gender: Gender.FEMALE, age: 40, destinationKind: VictimDestinationKind.CANCELLED },
        ],
      }),
      'user-filer',
    );

    const data = (prisma.eventReport.create as jest.Mock).mock.calls[0][0].data;
    expect(data.crew.create.map((entry: { position: number }) => entry.position)).toEqual([
      0, 1,
    ]);
    expect(data.vehicles.create.map((entry: { position: number }) => entry.position)).toEqual([
      0, 1,
    ]);
    expect(data.victims.create.map((entry: { position: number }) => entry.position)).toEqual([
      0, 1,
    ]);
  });

  it('refuses an incoherent payload before touching the database', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);

    await expect(
      service.create(input({ externalReference: null }), 'user-filer'),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.eventReport.create).not.toHaveBeenCalled();
  });

  it('names the missing thing rather than leaking a foreign-key error', async () => {
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [{ locality: { count: jest.fn(() => Promise.resolve(0)) } }, /locality/i],
      [{ vehicle: { findMany: jest.fn(() => Promise.resolve([])) } }, /vehicles/i],
      [{ user: { findMany: jest.fn(() => Promise.resolve([])) } }, /crew/i],
      [{ hospital: { findMany: jest.fn(() => Promise.resolve([])) } }, /hospitals/i],
    ];

    for (const [override, message] of cases) {
      const prisma = makePrisma(override);
      const { service } = makeService(prisma);
      await expect(service.create(input(), 'user-filer')).rejects.toThrow(message);
    }
  });

  it('refuses a material line naming an item that does not exist', async () => {
    const prisma = makePrisma({ materialItem: { findMany: jest.fn(() => Promise.resolve([])) } });
    const { service } = makeService(prisma);

    await expect(
      service.create(
        input({
          vehicles: [{ vehicleId: 'veh-1', kilometres: 42 }],
          materials: [
            { materialItemId: 'item-ghost', itemType: InventoryItemType.COUNTABLE, quantity: 1 },
          ],
        }),
        'user-filer',
      ),
    ).rejects.toThrow(/materials/i);
  });

  it('checks a shift reference points at a real schedule', async () => {
    const prisma = makePrisma({ schedule: { count: jest.fn(() => Promise.resolve(0)) } });
    const { service } = makeService(prisma);

    await expect(
      service.create(
        input({ shift: { scheduleId: 'sch-gone', date: '2026-08-22', slot: 1 } }),
        'user-filer',
      ),
    ).rejects.toThrow(/schedule/i);
  });
});

describe('filtering the list', () => {
  const whereOf = (prisma: ReturnType<typeof makePrisma>) =>
    (prisma.calls.findMany[0] as { where: Record<string, unknown> }).where;

  it('reads a typed report code as an exact lookup', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);

    await service.findAll({ q: 'EMG 128/2026' });

    // `legacyNumber` as well, because renumbering rewrites the identity of
    // reports that are already printed: someone holding "EMG 128/2026" has to be
    // able to find what it became.
    expect(whereOf(prisma)).toEqual({
      AND: [
        {
          type: EventReportType.EMERGENCY,
          year: 2026,
          OR: [{ number: 128 }, { legacyNumber: 128 }],
        },
      ],
    });
  });

  it('falls back to a text search when the query is not a code', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);

    await service.findAll({ q: 'Taveiro' });

    const where = whereOf(prisma) as { AND: Array<{ OR?: unknown[] }> };
    expect(where.AND[0].OR).toHaveLength(3);
    expect(JSON.stringify(where)).toContain('Taveiro');
  });

  it('filters by type and inclusive date range', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);

    await service.findAll({
      type: EventReportType.LOCAL_SUPPORT,
      from: '2026-08-01',
      to: '2026-08-31',
    });

    expect(whereOf(prisma)).toEqual({
      AND: [
        { type: EventReportType.LOCAL_SUPPORT },
        {
          occurredOn: {
            gte: new Date('2026-08-01T00:00:00.000Z'),
            lte: new Date('2026-08-31T00:00:00.000Z'),
          },
        },
      ],
    });
  });

  it('refuses a date that is not a calendar date', async () => {
    const { service } = makeService();
    await expect(service.findAll({ from: '31-08-2026' })).rejects.toThrow(BadRequestException);
  });

  it('has no where at all when nothing was asked for', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);

    await service.findAll();

    expect(whereOf(prisma)).toEqual({});
  });

  it('scopes "mine" to the crew and the filer', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);

    await service.findMine('user-tiago');

    expect(JSON.stringify(whereOf(prisma))).toContain('user-tiago');
    expect(whereOf(prisma)).toMatchObject({
      AND: expect.arrayContaining([
        {
          OR: [{ createdById: 'user-tiago' }, { crew: { some: { userId: 'user-tiago' } } }],
        },
      ]),
    });
  });
});

describe('counts for the filter tabs', () => {
  it('carries every type, including the ones with nothing in them', async () => {
    const { service } = makeService();

    await expect(service.counts({}, COORDINATOR)).resolves.toEqual({
      ALL: 13,
      [EventReportType.EMERGENCY]: 9,
      [EventReportType.LOCAL_SUPPORT]: 4,
      [EventReportType.SALOP_SUPPORT]: 0,
    });
  });

  it('ignores the type filter, so the tabs do not renumber when one is clicked', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);

    await service.counts({ type: EventReportType.EMERGENCY }, COORDINATOR);

    const where = (prisma.calls.groupBy[0] as { where: unknown }).where;
    expect(JSON.stringify(where)).not.toContain('EMERGENCY');
  });

  it('scopes the tabs to what an operational may actually read', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);

    await service.counts({}, OPERATIONAL);

    expect(JSON.stringify((prisma.calls.groupBy[0] as { where: unknown }).where)).toContain(
      OPERATIONAL.id,
    );
  });
});
