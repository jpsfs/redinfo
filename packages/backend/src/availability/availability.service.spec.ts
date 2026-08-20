import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AvailabilityService, RequestUser } from './availability.service';
import { AvailabilityWindowsService } from './availability-windows.service';
import { ShiftScheduleService } from './shift-schedule.service';
import { HolidaysService } from './holidays.service';
import {
  AvailabilityWindow,
  AvailabilityWindowStatus,
  ShiftCode,
  UserRole,
} from '@redinfo/shared';

// ── fixtures ───────────────────────────────────────────────────────────────────
//
// One window, Mon 2026-09-28 → Mon 2026-10-05, which deliberately spans:
//   5 workdays (1 shift each), a Sat + Sun (2 shifts each), and a holiday
//   Monday (2 shifts) — every day type the shift grid knows about.

const HOLIDAYS: Record<string, string> = {
  '2026-10-05': 'Implantação da República',
};

const OPEN_WINDOW: AvailabilityWindow = {
  id: 'win-1',
  startDate: '2026-09-28',
  endDate: '2026-10-05',
  status: AvailabilityWindowStatus.OPEN,
  openedById: 'coord-1',
  openedBy: { id: 'coord-1', firstName: 'Maria', lastName: 'Santos' },
  openedAt: '2026-09-26T09:14:00.000Z',
  closedById: null,
  closedBy: null,
  closedAt: null,
  createdAt: '2026-09-26T09:14:00.000Z',
  updatedAt: '2026-09-26T09:14:00.000Z',
};

const CLOSED_WINDOW: AvailabilityWindow = {
  ...OPEN_WINDOW,
  status: AvailabilityWindowStatus.CLOSED,
  closedById: 'coord-1',
  closedAt: '2026-10-05T23:59:00.000Z',
};

const ANA = { id: 'u-ana', firstName: 'Ana', lastName: 'Silva', isDriver: true };
const BRUNO = { id: 'u-bruno', firstName: 'Bruno', lastName: 'Costa', isDriver: true };
const CARLA = { id: 'u-carla', firstName: 'Carla', lastName: 'Ferreira', isDriver: false };
const RUI = { id: 'u-rui', firstName: 'Rui', lastName: 'Nunes', isDriver: false };
const MARTA = { id: 'u-marta', firstName: 'Marta', lastName: 'Oliveira', isDriver: false };

const ROSTER = [ANA, BRUNO, CARLA, MARTA, RUI];

const VOLUNTEER: RequestUser = { id: ANA.id, role: UserRole.EMERGENCY_OPERATIONAL };
const COORDINATOR: RequestUser = { id: 'coord-1', role: UserRole.EMERGENCY_COORDINATOR };

function submissionRow(userId: string, date: string, shiftCode: ShiftCode, id = `${userId}-${date}-${shiftCode}`) {
  return {
    id,
    userId,
    windowId: OPEN_WINDOW.id,
    date: new Date(`${date}T00:00:00.000Z`),
    shiftCode,
    createdAt: new Date('2026-09-27T10:00:00.000Z'),
    updatedAt: new Date('2026-09-27T10:00:00.000Z'),
  };
}

// ── stubs ──────────────────────────────────────────────────────────────────────

function buildPrismaStub(overrides: Record<string, unknown> = {}) {
  return {
    availabilitySubmission: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    availabilityResponse: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({ id: 'resp-1' }),
    },
    user: {
      findMany: jest.fn().mockResolvedValue(ROSTER),
      findUnique: jest.fn().mockResolvedValue(ANA),
    },
    $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
    ...overrides,
  };
}

function buildWindowsStub(active: AvailabilityWindow | null = OPEN_WINDOW) {
  return {
    findActive: jest.fn().mockResolvedValue(active),
    findActiveOrLatest: jest.fn().mockResolvedValue(active),
    findOne: jest.fn().mockImplementation((id: string) => {
      if (id === OPEN_WINDOW.id) return Promise.resolve(OPEN_WINDOW);
      return Promise.reject(new NotFoundException(`Availability window ${id} not found`));
    }),
  };
}

function buildService(options: {
  prisma?: ReturnType<typeof buildPrismaStub>;
  windows?: ReturnType<typeof buildWindowsStub>;
  holidays?: Record<string, string>;
} = {}) {
  const prisma = options.prisma ?? buildPrismaStub();
  const windows = options.windows ?? buildWindowsStub();
  const holidayTable = options.holidays ?? HOLIDAYS;
  const holidays = {
    findBetween: jest.fn(async (from: string, to: string) =>
      new Map(Object.entries(holidayTable).filter(([date]) => date >= from && date <= to)),
    ),
    isHoliday: jest.fn(async (date: string) => date in holidayTable),
  };
  const shiftSchedule = new ShiftScheduleService(holidays as unknown as HolidaysService);
  const service = new AvailabilityService(
    prisma as never,
    windows as unknown as AvailabilityWindowsService,
    shiftSchedule,
  );
  return { service, prisma, windows, shiftSchedule };
}

/** The (date|shift) pairs a createMany call would insert. */
function createdKeys(prisma: ReturnType<typeof buildPrismaStub>): string[] {
  const call = prisma.availabilitySubmission.createMany.mock.calls[0];
  if (!call) return [];
  return call[0].data
    .map((row: { date: Date; shiftCode: string }) => `${row.date.toISOString().slice(0, 10)}|${row.shiftCode}`)
    .sort();
}

// ── getMine ────────────────────────────────────────────────────────────────────

describe('AvailabilityService.getMine', () => {
  it('reports no window when none has ever been opened', async () => {
    const { service } = buildService({ windows: buildWindowsStub(null) });

    await expect(service.getMine(ANA.id)).resolves.toEqual({
      window: null,
      canSubmit: false,
      declined: false,
      calendar: [],
      entries: [],
    });
  });

  it('returns the window calendar with the applicable shifts per day', async () => {
    const { service } = buildService();

    const result = await service.getMine(ANA.id);

    expect(result.window?.id).toBe(OPEN_WINDOW.id);
    expect(result.canSubmit).toBe(true);
    expect(result.calendar).toHaveLength(8);
    expect(result.calendar.map((day) => day.shifts.length)).toEqual([1, 1, 1, 1, 1, 2, 2, 2]);
    expect(result.calendar[7]).toMatchObject({
      date: '2026-10-05',
      isHoliday: true,
      holidayName: 'Implantação da República',
    });
  });

  it('groups the user’s rows into one entry per day, ordered by date and shift start', async () => {
    const prisma = buildPrismaStub();
    prisma.availabilitySubmission.findMany.mockResolvedValue([
      submissionRow(ANA.id, '2026-10-03', ShiftCode.AFTERNOON),
      submissionRow(ANA.id, '2026-09-28', ShiftCode.EVENING),
      submissionRow(ANA.id, '2026-10-03', ShiftCode.MORNING),
    ]);
    const { service } = buildService({ prisma });

    const result = await service.getMine(ANA.id);

    expect(result.entries).toEqual([
      { date: '2026-09-28', shiftCodes: [ShiftCode.EVENING] },
      { date: '2026-10-03', shiftCodes: [ShiftCode.MORNING, ShiftCode.AFTERNOON] },
    ]);
  });

  it('scopes the lookup to the caller and the window', async () => {
    const prisma = buildPrismaStub();
    const { service } = buildService({ prisma });

    await service.getMine(ANA.id);

    expect(prisma.availabilitySubmission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { windowId: OPEN_WINDOW.id, userId: ANA.id } }),
    );
  });

  it('reports canSubmit false for a closed window but still returns the submissions', async () => {
    const prisma = buildPrismaStub();
    prisma.availabilitySubmission.findMany.mockResolvedValue([
      submissionRow(ANA.id, '2026-09-28', ShiftCode.EVENING),
    ]);
    const { service } = buildService({
      prisma,
      windows: buildWindowsStub(CLOSED_WINDOW),
    });

    const result = await service.getMine(ANA.id);

    expect(result.canSubmit).toBe(false);
    expect(result.entries).toHaveLength(1);
  });

  it('surfaces an explicit decline', async () => {
    const prisma = buildPrismaStub();
    prisma.availabilityResponse.findUnique.mockResolvedValue({ id: 'resp-1' });
    const { service } = buildService({ prisma });

    await expect(service.getMine(ANA.id)).resolves.toMatchObject({ declined: true });
  });
});

// ── submitMine ─────────────────────────────────────────────────────────────────

describe('AvailabilityService.submitMine', () => {
  it('creates rows for newly selected shifts', async () => {
    const prisma = buildPrismaStub();
    const { service } = buildService({ prisma });

    await service.submitMine(VOLUNTEER, {
      entries: [
        { date: '2026-09-28', shiftCodes: [ShiftCode.EVENING] },
        { date: '2026-10-03', shiftCodes: [ShiftCode.MORNING, ShiftCode.AFTERNOON] },
      ],
    });

    expect(createdKeys(prisma)).toEqual([
      '2026-09-28|EVENING',
      '2026-10-03|AFTERNOON',
      '2026-10-03|MORNING',
    ]);
    expect(prisma.availabilitySubmission.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes de-selected shifts, keeps unchanged ones, and adds new ones', async () => {
    const prisma = buildPrismaStub();
    prisma.availabilitySubmission.findMany.mockResolvedValue([
      submissionRow(ANA.id, '2026-09-28', ShiftCode.EVENING, 'keep-me'),
      submissionRow(ANA.id, '2026-09-29', ShiftCode.EVENING, 'drop-me'),
    ]);
    const { service } = buildService({ prisma });

    await service.submitMine(VOLUNTEER, {
      entries: [
        { date: '2026-09-28', shiftCodes: [ShiftCode.EVENING] }, // unchanged
        { date: '2026-09-30', shiftCodes: [ShiftCode.EVENING] }, // added
        // 2026-09-29 dropped
      ],
    });

    expect(prisma.availabilitySubmission.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['drop-me'] } },
    });
    expect(createdKeys(prisma)).toEqual(['2026-09-30|EVENING']);
  });

  it('clears everything when an empty selection is submitted', async () => {
    const prisma = buildPrismaStub();
    prisma.availabilitySubmission.findMany.mockResolvedValue([
      submissionRow(ANA.id, '2026-09-28', ShiftCode.EVENING, 'row-a'),
      submissionRow(ANA.id, '2026-10-04', ShiftCode.MORNING, 'row-b'),
    ]);
    const { service } = buildService({ prisma });

    await service.submitMine(VOLUNTEER, { entries: [] });

    expect(prisma.availabilitySubmission.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['row-a', 'row-b'] } },
    });
    expect(prisma.availabilitySubmission.createMany).not.toHaveBeenCalled();
  });

  it('writes nothing at all when the selection is unchanged', async () => {
    const prisma = buildPrismaStub();
    prisma.availabilitySubmission.findMany.mockResolvedValue([
      submissionRow(ANA.id, '2026-09-28', ShiftCode.EVENING, 'row-a'),
    ]);
    const { service } = buildService({ prisma });

    await service.submitMine(VOLUNTEER, {
      entries: [{ date: '2026-09-28', shiftCodes: [ShiftCode.EVENING] }],
    });

    expect(prisma.availabilitySubmission.deleteMany).not.toHaveBeenCalled();
    expect(prisma.availabilitySubmission.createMany).not.toHaveBeenCalled();
  });

  it('supersedes a previous decline in the same transaction', async () => {
    const prisma = buildPrismaStub();
    const { service } = buildService({ prisma });

    await service.submitMine(VOLUNTEER, {
      entries: [{ date: '2026-09-28', shiftCodes: [ShiftCode.EVENING] }],
    });

    expect(prisma.availabilityResponse.deleteMany).toHaveBeenCalledWith({
      where: { windowId: OPEN_WINDOW.id, userId: ANA.id },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  // ── close blocks submissions at the API, not just in the UI ─────────────────

  it('throws ForbiddenException when no window is open', async () => {
    const prisma = buildPrismaStub();
    const { service } = buildService({ prisma, windows: buildWindowsStub(null) });

    await expect(
      service.submitMine(VOLUNTEER, {
        entries: [{ date: '2026-09-28', shiftCodes: [ShiftCode.EVENING] }],
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when the named window is closed', async () => {
    const prisma = buildPrismaStub();
    const windows = buildWindowsStub(OPEN_WINDOW);
    windows.findOne.mockResolvedValue(CLOSED_WINDOW);
    const { service } = buildService({ prisma, windows });

    await expect(
      service.submitMine(VOLUNTEER, {
        windowId: CLOSED_WINDOW.id,
        entries: [{ date: '2026-09-28', shiftCodes: [ShiftCode.EVENING] }],
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ── validation ──────────────────────────────────────────────────────────────

  it('rejects a date outside the window range', async () => {
    const prisma = buildPrismaStub();
    const { service } = buildService({ prisma });

    await expect(
      service.submitMine(VOLUNTEER, {
        entries: [{ date: '2026-10-06', shiftCodes: [ShiftCode.EVENING] }],
      }),
    ).rejects.toThrow(/outside the availability window/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a weekend shift submitted for a workday', async () => {
    const { service } = buildService();

    await expect(
      service.submitMine(VOLUNTEER, {
        entries: [{ date: '2026-09-28', shiftCodes: [ShiftCode.MORNING] }],
      }),
    ).rejects.toThrow(/does not exist on 2026-09-28/);
  });

  it('rejects a workday shift submitted for a weekend day', async () => {
    const { service } = buildService();

    await expect(
      service.submitMine(VOLUNTEER, {
        entries: [{ date: '2026-10-04', shiftCodes: [ShiftCode.EVENING] }],
      }),
    ).rejects.toThrow(/does not exist on 2026-10-04/);
  });

  it('accepts both weekend shifts on a holiday that falls on a weekday', async () => {
    const prisma = buildPrismaStub();
    const { service } = buildService({ prisma });

    await service.submitMine(VOLUNTEER, {
      entries: [{ date: '2026-10-05', shiftCodes: [ShiftCode.MORNING, ShiftCode.AFTERNOON] }],
    });

    expect(createdKeys(prisma)).toEqual(['2026-10-05|AFTERNOON', '2026-10-05|MORNING']);
  });

  it('rejects duplicate entries for the same day', async () => {
    const { service } = buildService();

    await expect(
      service.submitMine(VOLUNTEER, {
        entries: [
          { date: '2026-09-28', shiftCodes: [ShiftCode.EVENING] },
          { date: '2026-09-28', shiftCodes: [] },
        ],
      }),
    ).rejects.toThrow(/Duplicate entry for 2026-09-28/);
  });

  it.each(['2026-09-31', 'yesterday', '28-09-2026'])(
    'rejects malformed date %s',
    async (date) => {
      const { service } = buildService();
      await expect(
        service.submitMine(VOLUNTEER, { entries: [{ date, shiftCodes: [] }] }),
      ).rejects.toThrow(BadRequestException);
    },
  );
});

// ── decline / undecline ────────────────────────────────────────────────────────

describe('AvailabilityService.declineMine', () => {
  it('records the decline and clears any selected shifts atomically', async () => {
    const prisma = buildPrismaStub();
    const { service } = buildService({ prisma });

    await service.declineMine(VOLUNTEER);

    expect(prisma.availabilitySubmission.deleteMany).toHaveBeenCalledWith({
      where: { windowId: OPEN_WINDOW.id, userId: ANA.id },
    });
    expect(prisma.availabilityResponse.create).toHaveBeenCalledWith({
      data: { windowId: OPEN_WINDOW.id, userId: ANA.id, status: 'DECLINED' },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — declining twice does not raise a unique violation', async () => {
    const prisma = buildPrismaStub();
    const { service } = buildService({ prisma });

    await service.declineMine(VOLUNTEER);
    await service.declineMine(VOLUNTEER);

    // Each decline deletes the previous response row before inserting.
    expect(prisma.availabilityResponse.deleteMany).toHaveBeenCalledTimes(2);
    expect(prisma.availabilityResponse.create).toHaveBeenCalledTimes(2);
  });

  it('is refused once the window is closed', async () => {
    const { service } = buildService({ windows: buildWindowsStub(null) });
    await expect(service.declineMine(VOLUNTEER)).rejects.toThrow(ForbiddenException);
  });
});

describe('AvailabilityService.undeclineMine', () => {
  it('removes the decline, returning the user to "not yet responded"', async () => {
    const prisma = buildPrismaStub();
    const { service } = buildService({ prisma });

    await service.undeclineMine(VOLUNTEER);

    expect(prisma.availabilityResponse.deleteMany).toHaveBeenCalledWith({
      where: { windowId: OPEN_WINDOW.id, userId: ANA.id },
    });
    expect(prisma.availabilitySubmission.deleteMany).not.toHaveBeenCalled();
  });

  it('is refused once the window is closed', async () => {
    const { service } = buildService({ windows: buildWindowsStub(null) });
    await expect(service.undeclineMine(VOLUNTEER)).rejects.toThrow(ForbiddenException);
  });
});

// ── ownership ──────────────────────────────────────────────────────────────────

describe('AvailabilityService.assertOwnerOrCoordinator', () => {
  it('allows a user to read their own availability', () => {
    const { service } = buildService();
    expect(() => service.assertOwnerOrCoordinator(ANA.id, VOLUNTEER)).not.toThrow();
  });

  it('denies a volunteer reading someone else’s availability', () => {
    const { service } = buildService();
    expect(() => service.assertOwnerOrCoordinator(BRUNO.id, VOLUNTEER)).toThrow(
      ForbiddenException,
    );
  });

  it('allows a coordinator reading someone else’s availability', () => {
    const { service } = buildService();
    expect(() => service.assertOwnerOrCoordinator(ANA.id, COORDINATOR)).not.toThrow();
  });

  it('allows a system admin, who holds every action', () => {
    const { service } = buildService();
    expect(() =>
      service.assertOwnerOrCoordinator(ANA.id, { id: 'admin', role: UserRole.SYSTEM_ADMIN }),
    ).not.toThrow();
  });

  it('denies a logistics coordinator — availability is an emergency-domain view', () => {
    const { service } = buildService();
    expect(() =>
      service.assertOwnerOrCoordinator(ANA.id, {
        id: 'log-1',
        role: UserRole.LOGISTICS_COORDINATOR,
      }),
    ).toThrow(ForbiddenException);
  });
});

describe('AvailabilityService.getForUser', () => {
  it('throws NotFoundException for an unknown user', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findUnique.mockResolvedValue(null);
    const { service } = buildService({ prisma });

    await expect(service.getForUser('ghost', COORDINATOR)).rejects.toThrow(NotFoundException);
  });

  it('checks ownership before touching the database', async () => {
    const prisma = buildPrismaStub();
    const { service } = buildService({ prisma });

    await expect(service.getForUser(BRUNO.id, VOLUNTEER)).rejects.toThrow(ForbiddenException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

// ── matrix ─────────────────────────────────────────────────────────────────────

describe('AvailabilityService.getMatrix', () => {
  /**
   * Sat 2026-10-03 morning: Ana (driver), Bruno (driver), Carla  → 3 avail, 2 drivers → green
   * Sat 2026-10-03 afternoon: Carla                              → 1 avail, 0 drivers → red
   * Sun 2026-10-04 morning: Ana (driver), Carla                   → 2 avail, 1 driver  → yellow
   * Mon 2026-09-28 evening: nobody                                → 0 avail, 0 drivers → red
   */
  const SUBMISSIONS = [
    submissionRow(ANA.id, '2026-10-03', ShiftCode.MORNING),
    submissionRow(BRUNO.id, '2026-10-03', ShiftCode.MORNING),
    submissionRow(CARLA.id, '2026-10-03', ShiftCode.MORNING),
    submissionRow(CARLA.id, '2026-10-03', ShiftCode.AFTERNOON),
    submissionRow(ANA.id, '2026-10-04', ShiftCode.MORNING),
    submissionRow(CARLA.id, '2026-10-04', ShiftCode.MORNING),
  ];

  function matrixService() {
    const prisma = buildPrismaStub();
    prisma.availabilitySubmission.findMany.mockResolvedValue(SUBMISSIONS);
    prisma.availabilityResponse.findMany.mockResolvedValue([{ userId: MARTA.id }]);
    return { ...buildService({ prisma }), prisma };
  }

  it('throws NotFoundException when no window exists', async () => {
    const { service } = buildService({ windows: buildWindowsStub(null) });
    await expect(service.getMatrix()).rejects.toThrow(NotFoundException);
  });

  it('builds one row per day with the day’s applicable shifts', async () => {
    const { service } = matrixService();

    const matrix = await service.getMatrix();

    expect(matrix.days).toHaveLength(8);
    expect(matrix.days[0]).toMatchObject({ date: '2026-09-28', isWeekend: false });
    expect(matrix.days[0].shifts.map((s) => s.shiftCode)).toEqual([ShiftCode.EVENING]);
    expect(matrix.days[5].shifts.map((s) => s.shiftCode)).toEqual([
      ShiftCode.MORNING,
      ShiftCode.AFTERNOON,
    ]);
    expect(matrix.days[7]).toMatchObject({
      isHoliday: true,
      holidayName: 'Implantação da República',
    });
  });

  it('counts available people and drivers per shift, and colours the cell', async () => {
    const { service } = matrixService();

    const matrix = await service.getMatrix();
    const saturday = matrix.days.find((day) => day.date === '2026-10-03')!;
    const sunday = matrix.days.find((day) => day.date === '2026-10-04')!;
    const monday = matrix.days.find((day) => day.date === '2026-09-28')!;

    expect(saturday.shifts[0]).toMatchObject({
      availableCount: 3,
      driverCount: 2,
      coverageLevel: 'green',
    });
    expect(saturday.shifts[1]).toMatchObject({
      availableCount: 1,
      driverCount: 0,
      coverageLevel: 'red',
    });
    expect(sunday.shifts[0]).toMatchObject({
      availableCount: 2,
      driverCount: 1,
      coverageLevel: 'yellow',
    });
    expect(monday.shifts[0]).toMatchObject({
      availableCount: 0,
      driverCount: 0,
      coverageLevel: 'red',
      availableUserIds: [],
    });
  });

  it('lists the available user ids in roster order for the drill-down', async () => {
    const { service } = matrixService();

    const matrix = await service.getMatrix();
    const saturday = matrix.days.find((day) => day.date === '2026-10-03')!;

    expect(saturday.shifts[0].availableUserIds).toEqual([ANA.id, BRUNO.id, CARLA.id]);
  });

  it('labels each cell with the shift hours', async () => {
    const { service } = matrixService();

    const matrix = await service.getMatrix();

    expect(matrix.days[0].shifts[0].label).toBe('20:00–24:00');
    expect(matrix.days[5].shifts.map((s) => s.label)).toEqual(['08:00–16:00', '16:00–24:00']);
  });

  // ── tri-state response tracking ────────────────────────────────────────────

  it('tags each person submitted / declined / pending', async () => {
    const { service } = matrixService();

    const matrix = await service.getMatrix();
    const statusById = Object.fromEntries(
      matrix.personnel.map((person) => [person.id, person.responseStatus]),
    );

    expect(statusById[ANA.id]).toBe('submitted');
    expect(statusById[BRUNO.id]).toBe('submitted');
    expect(statusById[CARLA.id]).toBe('submitted');
    expect(statusById[MARTA.id]).toBe('declined');
    expect(statusById[RUI.id]).toBe('pending');
  });

  it('reports response stats that account for the whole roster', async () => {
    const { service } = matrixService();

    const matrix = await service.getMatrix();

    expect(matrix.responseStats).toEqual({
      submitted: 3,
      declined: 1,
      pending: 1,
      total: ROSTER.length,
    });
    const { submitted, declined, pending, total } = matrix.responseStats;
    expect(submitted + declined + pending).toBe(total);
  });

  it('carries the driver flag through for every person', async () => {
    const { service } = matrixService();

    const matrix = await service.getMatrix();

    expect(matrix.personnel.find((p) => p.id === ANA.id)?.isDriver).toBe(true);
    expect(matrix.personnel.find((p) => p.id === CARLA.id)?.isDriver).toBe(false);
  });

  // ── roster scope ───────────────────────────────────────────────────────────

  it('only counts active personnel in roles allowed to submit availability', async () => {
    const { service, prisma } = matrixService();

    await service.getMatrix();

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          role: {
            in: [
              // SYSTEM_ADMIN can submit, so it must be counted too — otherwise
              // an admin's own availability never shows up in the matrix.
              UserRole.SYSTEM_ADMIN,
              UserRole.EMERGENCY_OPERATIONAL,
              UserRole.EMERGENCY_COORDINATOR,
            ],
          },
        },
      }),
    );
  });

  it('ignores submissions from users outside the roster', async () => {
    const { service, prisma } = matrixService();

    await service.getMatrix();

    expect(prisma.availabilitySubmission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          windowId: OPEN_WINDOW.id,
          userId: { in: ROSTER.map((person) => person.id) },
        },
      }),
    );
  });

  it('reads a specific window when one is named', async () => {
    const { service, windows } = matrixService();

    await service.getMatrix(OPEN_WINDOW.id);

    expect(windows.findOne).toHaveBeenCalledWith(OPEN_WINDOW.id);
    expect(windows.findActiveOrLatest).not.toHaveBeenCalled();
  });

  it('works for a closed window (historical view)', async () => {
    const prisma = buildPrismaStub();
    prisma.availabilitySubmission.findMany.mockResolvedValue(SUBMISSIONS);
    const { service } = buildService({ prisma, windows: buildWindowsStub(CLOSED_WINDOW) });

    const matrix = await service.getMatrix();

    expect(matrix.window.status).toBe(AvailabilityWindowStatus.CLOSED);
    expect(matrix.days).toHaveLength(8);
  });
});

// ── CSV export ─────────────────────────────────────────────────────────────────

describe('AvailabilityService.getMatrixCsv', () => {
  it('emits one row per day and shift with counts, coverage and names', async () => {
    const prisma = buildPrismaStub();
    prisma.availabilitySubmission.findMany.mockResolvedValue([
      submissionRow(ANA.id, '2026-10-03', ShiftCode.MORNING),
      submissionRow(BRUNO.id, '2026-10-03', ShiftCode.MORNING),
      submissionRow(CARLA.id, '2026-10-03', ShiftCode.MORNING),
    ]);
    const { service } = buildService({ prisma });

    const csv = await service.getMatrixCsv();
    const lines = csv.split('\n');

    expect(lines[0]).toBe(
      'date,dayType,holiday,shift,availableCount,driverCount,coverage,available',
    );
    // 5 workdays × 1 shift + 3 two-shift days × 2 = 11 data rows.
    expect(lines).toHaveLength(12);
    expect(lines).toContain('2026-09-28,workday,,20:00–24:00,0,0,red,');
    // Names are joined with "; " precisely so the column never needs quoting.
    expect(lines).toContain(
      '2026-10-03,weekend,,08:00–16:00,3,2,green,Ana Silva (driver); Bruno Costa (driver); Carla Ferreira',
    );
  });

  it('marks the day type and holiday name per row', async () => {
    const { service } = buildService();

    const csv = await service.getMatrixCsv();

    expect(csv).toContain('2026-10-05,holiday,Implantação da República,08:00–16:00,0,0,red,');
    expect(csv).toContain('2026-10-04,weekend,,08:00–16:00,0,0,red,');
  });

  it('quotes a holiday name containing a comma', async () => {
    const { service } = buildService({
      holidays: { '2026-10-05': 'Implantação, teste' },
    });

    const csv = await service.getMatrixCsv();

    expect(csv).toContain('2026-10-05,holiday,"Implantação, teste",08:00–16:00,0,0,red,');
  });
});
