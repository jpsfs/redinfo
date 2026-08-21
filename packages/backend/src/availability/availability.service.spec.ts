import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AvailabilityService, RequestUser } from './availability.service';
import { AvailabilityWindowsService } from './availability-windows.service';
import { ShiftScheduleService } from './shift-schedule.service';
import { HolidaysService } from './holidays.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AvailabilityWindow,
  AvailabilityWindowCategory,
  AvailabilityWindowStatus,
  DEFAULT_VEHICLES_NEEDED,
  toMinuteOfDay,
  UserRole,
} from '@redinfo/shared';

/** Minutes from midnight, so the expectations read in wall-clock hours. */
const at = (hour: number, minute = 0) => toMinuteOfDay(hour, minute);

// ── fixtures ───────────────────────────────────────────────────────────────────
//
// One window, Mon 2026-09-28 → Mon 2026-10-05, which deliberately spans:
//   5 workdays (1 shift each), a Sat + Sun (2 shifts each), and a holiday
//   Monday (2 shifts) — every day type the default grid knows about.
//
// Unless a test says otherwise the window has no stored shift rows, so it reads
// back as the default grid: slot 1 is a workday's 20:00–24:00 and a special
// day's 08:00–16:00, slot 2 the special day's 16:00–24:00.

const HOLIDAYS: Record<string, string> = {
  '2026-10-05': 'Implantação da República',
};

const OPEN_WINDOW: AvailabilityWindow = {
  id: 'win-1',
  startDate: '2026-09-28',
  endDate: '2026-10-05',
  category: AvailabilityWindowCategory.EMERGENCY,
  name: 'Emergency - October',
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

/** A second open window, so "which window?" has an answer worth testing. */
const LOCAL_WINDOW: AvailabilityWindow = {
  ...OPEN_WINDOW,
  id: 'win-2',
  category: AvailabilityWindowCategory.LOCAL_SUPPORT,
  name: null,
};

const ANA = { id: 'u-ana', firstName: 'Ana', lastName: 'Silva', isDriver: true };
const BRUNO = { id: 'u-bruno', firstName: 'Bruno', lastName: 'Costa', isDriver: true };
const CARLA = { id: 'u-carla', firstName: 'Carla', lastName: 'Ferreira', isDriver: false };
const RUI = { id: 'u-rui', firstName: 'Rui', lastName: 'Nunes', isDriver: false };
const MARTA = { id: 'u-marta', firstName: 'Marta', lastName: 'Oliveira', isDriver: false };

const ROSTER = [ANA, BRUNO, CARLA, MARTA, RUI];

const VOLUNTEER: RequestUser = { id: ANA.id, role: UserRole.EMERGENCY_OPERATIONAL };
const COORDINATOR: RequestUser = { id: 'coord-1', role: UserRole.EMERGENCY_COORDINATOR };

function submissionRow(userId: string, date: string, slot: number, id = `${userId}-${date}-${slot}`) {
  return {
    id,
    userId,
    windowId: OPEN_WINDOW.id,
    date: new Date(`${date}T00:00:00.000Z`),
    slot,
    createdAt: new Date('2026-09-27T10:00:00.000Z'),
    updatedAt: new Date('2026-09-27T10:00:00.000Z'),
  };
}

/** Hours in, minutes stored — the rows a window materialises. */
function shiftRow(
  date: string,
  slot: number,
  startHour: number,
  endHour: number,
  vehiclesNeeded = DEFAULT_VEHICLES_NEEDED,
) {
  return {
    date: new Date(`${date}T00:00:00.000Z`),
    slot,
    startMinute: at(startHour),
    endMinute: at(endHour),
    vehiclesNeeded,
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
    availabilityWindowShift: {
      findMany: jest.fn().mockResolvedValue([]),
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

function buildWindowsStub(
  active: AvailabilityWindow | null = OPEN_WINDOW,
  /** Every open window; defaults to whichever one `active` is. */
  open: AvailabilityWindow[] = active && active.status === AvailabilityWindowStatus.OPEN
    ? [active]
    : [],
) {
  const known = [active, ...open].filter(Boolean) as AvailabilityWindow[];
  return {
    findActive: jest.fn().mockResolvedValue(active),
    findActiveOrLatest: jest.fn().mockResolvedValue(active),
    findOpen: jest.fn().mockResolvedValue(open),
    findOne: jest.fn().mockImplementation((id: string) => {
      const match = known.find((window) => window.id === id);
      if (match) return Promise.resolve(match);
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
  const shiftSchedule = new ShiftScheduleService(
    holidays as unknown as HolidaysService,
    prisma as unknown as PrismaService,
  );
  const service = new AvailabilityService(
    prisma as never,
    windows as unknown as AvailabilityWindowsService,
    shiftSchedule,
  );
  return { service, prisma, windows, shiftSchedule };
}

/** The (date|slot) pairs a createMany call would insert. */
function createdKeys(prisma: ReturnType<typeof buildPrismaStub>): string[] {
  const call = prisma.availabilitySubmission.createMany.mock.calls[0];
  if (!call) return [];
  return call[0].data
    .map((row: { date: Date; slot: number }) => `${row.date.toISOString().slice(0, 10)}|${row.slot}`)
    .sort();
}

// ── getMine ────────────────────────────────────────────────────────────────────

describe('AvailabilityService.getMine', () => {
  it('reports no window when none has ever been opened', async () => {
    const { service } = buildService({ windows: buildWindowsStub(null) });

    await expect(service.getMine(ANA.id)).resolves.toEqual({
      window: null,
      windows: [],
      canSubmit: false,
      declined: false,
      calendar: [],
      entries: [],
    });
  });

  it('lists every open window, so the screen can offer a choice', async () => {
    const { service } = buildService({
      windows: buildWindowsStub(OPEN_WINDOW, [OPEN_WINDOW, LOCAL_WINDOW]),
    });

    const result = await service.getMine(ANA.id);

    expect(result.window?.id).toBe(OPEN_WINDOW.id);
    expect(result.windows.map((window) => window.id)).toEqual(['win-1', 'win-2']);
  });

  it('keeps a closed window on the list while it is the one being shown', async () => {
    // Otherwise the screen shows a window the selector cannot get back to.
    const { service } = buildService({ windows: buildWindowsStub(CLOSED_WINDOW, []) });

    const result = await service.getMine(ANA.id);

    expect(result.canSubmit).toBe(false);
    expect(result.windows.map((window) => window.id)).toEqual([CLOSED_WINDOW.id]);
  });

  it('does not list the shown window twice when it is itself open', async () => {
    const { service } = buildService();
    const result = await service.getMine(ANA.id);
    expect(result.windows).toHaveLength(1);
  });

  it('carries the category and name of the window through', async () => {
    const { service } = buildService();
    const result = await service.getMine(ANA.id);
    expect(result.window).toMatchObject({
      category: AvailabilityWindowCategory.EMERGENCY,
      name: 'Emergency - October',
    });
  });

  it('returns the window calendar with the shifts of each day', async () => {
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

  it("reads the window's own shifts rather than the default grid", async () => {
    const prisma = buildPrismaStub();
    prisma.availabilityWindowShift.findMany.mockResolvedValue([
      // A Monday the coordinator gave a single 10:00–14:00 shift.
      shiftRow('2026-09-28', 1, 10, 14),
    ]);
    const { service } = buildService({ prisma });

    const result = await service.getMine(ANA.id);

    expect(result.calendar[0].shifts).toEqual([
      {
        slot: 1,
        startMinute: at(10),
        endMinute: at(14),
        vehiclesNeeded: 1,
        label: '10:00–14:00',
      },
    ]);
    // Every other day of that window was left with no shifts.
    expect(result.calendar.slice(1).every((day) => day.shifts.length === 0)).toBe(true);
  });

  it('groups the user’s rows into one entry per day, ordered by date and slot', async () => {
    const prisma = buildPrismaStub();
    prisma.availabilitySubmission.findMany.mockResolvedValue([
      submissionRow(ANA.id, '2026-10-03', 2),
      submissionRow(ANA.id, '2026-09-28', 1),
      submissionRow(ANA.id, '2026-10-03', 1),
    ]);
    const { service } = buildService({ prisma });

    const result = await service.getMine(ANA.id);

    expect(result.entries).toEqual([
      { date: '2026-09-28', slots: [1] },
      { date: '2026-10-03', slots: [1, 2] },
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
      submissionRow(ANA.id, '2026-09-28', 1),
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
        { date: '2026-09-28', slots: [1] },
        { date: '2026-10-03', slots: [1, 2] },
      ],
    });

    expect(createdKeys(prisma)).toEqual([
      '2026-09-28|1',
      '2026-10-03|1',
      '2026-10-03|2',
    ]);
    expect(prisma.availabilitySubmission.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes de-selected shifts, keeps unchanged ones, and adds new ones', async () => {
    const prisma = buildPrismaStub();
    prisma.availabilitySubmission.findMany.mockResolvedValue([
      submissionRow(ANA.id, '2026-09-28', 1, 'keep-me'),
      submissionRow(ANA.id, '2026-09-29', 1, 'drop-me'),
    ]);
    const { service } = buildService({ prisma });

    await service.submitMine(VOLUNTEER, {
      entries: [
        { date: '2026-09-28', slots: [1] }, // unchanged
        { date: '2026-09-30', slots: [1] }, // added
        // 2026-09-29 dropped
      ],
    });

    expect(prisma.availabilitySubmission.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['drop-me'] } },
    });
    expect(createdKeys(prisma)).toEqual(['2026-09-30|1']);
  });

  it('clears everything when an empty selection is submitted', async () => {
    const prisma = buildPrismaStub();
    prisma.availabilitySubmission.findMany.mockResolvedValue([
      submissionRow(ANA.id, '2026-09-28', 1, 'row-a'),
      submissionRow(ANA.id, '2026-10-04', 1, 'row-b'),
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
      submissionRow(ANA.id, '2026-09-28', 1, 'row-a'),
    ]);
    const { service } = buildService({ prisma });

    await service.submitMine(VOLUNTEER, {
      entries: [{ date: '2026-09-28', slots: [1] }],
    });

    expect(prisma.availabilitySubmission.deleteMany).not.toHaveBeenCalled();
    expect(prisma.availabilitySubmission.createMany).not.toHaveBeenCalled();
  });

  it('supersedes a previous decline in the same transaction', async () => {
    const prisma = buildPrismaStub();
    const { service } = buildService({ prisma });

    await service.submitMine(VOLUNTEER, {
      entries: [{ date: '2026-09-28', slots: [1] }],
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
        entries: [{ date: '2026-09-28', slots: [1] }],
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses to guess which window when two are open', async () => {
    // Guessing would file the answer against the wrong rota, silently.
    const prisma = buildPrismaStub();
    const { service } = buildService({
      prisma,
      windows: buildWindowsStub(OPEN_WINDOW, [OPEN_WINDOW, LOCAL_WINDOW]),
    });

    await expect(
      service.submitMine(VOLUNTEER, {
        entries: [{ date: '2026-09-28', slots: [1] }],
      }),
    ).rejects.toThrow(/More than one availability window is open/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('names the open windows it could have meant', async () => {
    const { service } = buildService({
      windows: buildWindowsStub(OPEN_WINDOW, [OPEN_WINDOW, LOCAL_WINDOW]),
    });

    // The nameless one is identified by its category instead.
    await expect(
      service.submitMine(VOLUNTEER, { entries: [] }),
    ).rejects.toThrow(/Emergency - October \(win-1\), Local Support \(win-2\)/);
  });

  it('accepts a named window while another is also open', async () => {
    const prisma = buildPrismaStub();
    const { service } = buildService({
      prisma,
      windows: buildWindowsStub(OPEN_WINDOW, [OPEN_WINDOW, LOCAL_WINDOW]),
    });

    await service.submitMine(VOLUNTEER, {
      windowId: LOCAL_WINDOW.id,
      entries: [{ date: '2026-09-28', slots: [1] }],
    });

    expect(createdKeys(prisma)).toEqual(['2026-09-28|1']);
    expect(prisma.availabilitySubmission.createMany.mock.calls[0][0].data[0].windowId).toBe(
      LOCAL_WINDOW.id,
    );
  });

  it('throws ForbiddenException when the named window is closed', async () => {
    const prisma = buildPrismaStub();
    const windows = buildWindowsStub(OPEN_WINDOW);
    windows.findOne.mockResolvedValue(CLOSED_WINDOW);
    const { service } = buildService({ prisma, windows });

    await expect(
      service.submitMine(VOLUNTEER, {
        windowId: CLOSED_WINDOW.id,
        entries: [{ date: '2026-09-28', slots: [1] }],
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
        entries: [{ date: '2026-10-06', slots: [1] }],
      }),
    ).rejects.toThrow(/outside the availability window/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a second shift on a day that only has one', async () => {
    const { service } = buildService();

    await expect(
      service.submitMine(VOLUNTEER, {
        entries: [{ date: '2026-09-28', slots: [2] }],
      }),
    ).rejects.toThrow(/Shift 2 does not exist on 2026-09-28/);
  });

  it('validates against the shifts this window stores, not the day type', async () => {
    // A Sunday the coordinator cut down to a single shift: slot 2 is gone even
    // though the default grid would have given the day two.
    const prisma = buildPrismaStub();
    prisma.availabilityWindowShift.findMany.mockResolvedValue([
      shiftRow('2026-10-04', 1, 8, 16),
    ]);
    const { service } = buildService({ prisma });

    await expect(
      service.submitMine(VOLUNTEER, {
        entries: [{ date: '2026-10-04', slots: [2] }],
      }),
    ).rejects.toThrow(/Shift 2 does not exist on 2026-10-04/);
  });

  it('rejects any shift on a day the window left empty', async () => {
    const prisma = buildPrismaStub();
    prisma.availabilityWindowShift.findMany.mockResolvedValue([
      shiftRow('2026-09-28', 1, 20, 24),
    ]);
    const { service } = buildService({ prisma });

    await expect(
      service.submitMine(VOLUNTEER, {
        entries: [{ date: '2026-09-29', slots: [1] }],
      }),
    ).rejects.toThrow(/2026-09-29 has no shifts in this window/);
  });

  it('accepts both shifts on a holiday that falls on a weekday', async () => {
    const prisma = buildPrismaStub();
    const { service } = buildService({ prisma });

    await service.submitMine(VOLUNTEER, {
      entries: [{ date: '2026-10-05', slots: [1, 2] }],
    });

    expect(createdKeys(prisma)).toEqual(['2026-10-05|1', '2026-10-05|2']);
  });

  it('rejects duplicate entries for the same day', async () => {
    const { service } = buildService();

    await expect(
      service.submitMine(VOLUNTEER, {
        entries: [
          { date: '2026-09-28', slots: [1] },
          { date: '2026-09-28', slots: [] },
        ],
      }),
    ).rejects.toThrow(/Duplicate entry for 2026-09-28/);
  });

  it.each(['2026-09-31', 'yesterday', '28-09-2026'])(
    'rejects malformed date %s',
    async (date) => {
      const { service } = buildService();
      await expect(
        service.submitMine(VOLUNTEER, { entries: [{ date, slots: [] }] }),
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

// ── calendar preview ───────────────────────────────────────────────────────────

describe('AvailabilityService.getCalendar', () => {
  it('previews an arbitrary range on the default grid', async () => {
    const { service } = buildService();

    const calendar = await service.getCalendar('2026-10-02', '2026-10-05');

    expect(calendar.map((day) => day.shifts.length)).toEqual([1, 2, 2, 2]);
  });

  it("overlays a window's own shifts on the days it covers", async () => {
    const prisma = buildPrismaStub();
    prisma.availabilityWindowShift.findMany.mockResolvedValue([
      shiftRow('2026-09-28', 1, 10, 14),
    ]);
    const { service } = buildService({ prisma });

    // A whole month around a window that only runs 28 Sep – 5 Oct.
    const calendar = await service.getCalendar('2026-09-20', '2026-10-10', OPEN_WINDOW.id);
    const byDate = new Map(calendar.map((day) => [day.date, day]));

    // Inside the window: the window's own grid, empty days included.
    expect(byDate.get('2026-09-28')?.shifts.map((s) => s.label)).toEqual(['10:00–14:00']);
    expect(byDate.get('2026-09-29')?.shifts).toEqual([]);
    // Outside it: the default preview, so the month still reads as a calendar.
    expect(byDate.get('2026-09-21')?.shifts.map((s) => s.label)).toEqual(['20:00–24:00']);
    expect(byDate.get('2026-10-10')?.shifts.map((s) => s.label)).toEqual([
      '08:00–16:00',
      '16:00–24:00',
    ]);
  });
});

// ── matrix ─────────────────────────────────────────────────────────────────────

describe('AvailabilityService.getMatrix', () => {
  /**
   * Sat 2026-10-03 slot 1: Ana (driver), Bruno (driver), Carla → 3 avail, 2 drivers → green
   * Sat 2026-10-03 slot 2: Carla                              → 1 avail, 0 drivers → red
   * Sun 2026-10-04 slot 1: Ana (driver), Carla                → 2 avail, 1 driver  → yellow
   * Mon 2026-09-28 slot 1: nobody                             → 0 avail, 0 drivers → red
   */
  const SUBMISSIONS = [
    submissionRow(ANA.id, '2026-10-03', 1),
    submissionRow(BRUNO.id, '2026-10-03', 1),
    submissionRow(CARLA.id, '2026-10-03', 1),
    submissionRow(CARLA.id, '2026-10-03', 2),
    submissionRow(ANA.id, '2026-10-04', 1),
    submissionRow(CARLA.id, '2026-10-04', 1),
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

  it('builds one row per day with that day’s shifts', async () => {
    const { service } = matrixService();

    const matrix = await service.getMatrix();

    expect(matrix.days).toHaveLength(8);
    expect(matrix.days[0]).toMatchObject({ date: '2026-09-28', isWeekend: false });
    expect(matrix.days[0].shifts.map((s) => s.slot)).toEqual([1]);
    expect(matrix.days[5].shifts.map((s) => s.slot)).toEqual([1, 2]);
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

  it('labels each cell with the shift hours and carries the times through', async () => {
    const { service } = matrixService();

    const matrix = await service.getMatrix();

    expect(matrix.days[0].shifts[0]).toMatchObject({
      label: '20:00–24:00',
      startMinute: at(20),
      endMinute: at(24),
      vehiclesNeeded: 1,
    });
    expect(matrix.days[5].shifts.map((s) => s.label)).toEqual(['08:00–16:00', '16:00–24:00']);
  });

  it("carries each shift's vehicle count into the cell", async () => {
    const prisma = buildPrismaStub();
    prisma.availabilityWindowShift.findMany.mockResolvedValue([
      shiftRow('2026-09-28', 1, 8, 16, 3),
      shiftRow('2026-09-28', 2, 16, 24, 0),
    ]);
    const { service } = buildService({ prisma });

    const matrix = await service.getMatrix();

    expect(matrix.days[0].shifts.map((shift) => shift.vehiclesNeeded)).toEqual([3, 0]);
  });

  it('colours a cell against the vehicles that shift needs', async () => {
    // Three people, two of them drivers — enough for two vehicles, not three.
    const prisma = buildPrismaStub();
    prisma.availabilitySubmission.findMany.mockResolvedValue([
      submissionRow(ANA.id, '2026-09-28', 1),
      submissionRow(BRUNO.id, '2026-09-28', 1),
      submissionRow(CARLA.id, '2026-09-28', 1),
      submissionRow(ANA.id, '2026-09-28', 2),
      submissionRow(BRUNO.id, '2026-09-28', 2),
      submissionRow(CARLA.id, '2026-09-28', 2),
    ]);
    prisma.availabilityWindowShift.findMany.mockResolvedValue([
      shiftRow('2026-09-28', 1, 8, 16, 2),
      shiftRow('2026-09-28', 2, 16, 24, 3),
    ]);
    const { service } = buildService({ prisma });

    const matrix = await service.getMatrix();
    const [twoVehicles, threeVehicles] = matrix.days[0].shifts;

    expect(twoVehicles).toMatchObject({ driverCount: 2, coverageLevel: 'green' });
    expect(threeVehicles).toMatchObject({ driverCount: 2, coverageLevel: 'yellow' });
  });

  it('needs no driver at all for a shift that needs no vehicle', async () => {
    const prisma = buildPrismaStub();
    prisma.availabilitySubmission.findMany.mockResolvedValue([
      submissionRow(CARLA.id, '2026-09-28', 1),
      submissionRow(MARTA.id, '2026-09-28', 1),
      submissionRow(RUI.id, '2026-09-28', 1),
    ]);
    prisma.availabilityWindowShift.findMany.mockResolvedValue([
      shiftRow('2026-09-28', 1, 8, 16, 0),
    ]);
    const { service } = buildService({ prisma });

    const matrix = await service.getMatrix();

    expect(matrix.days[0].shifts[0]).toMatchObject({
      driverCount: 0,
      coverageLevel: 'green',
    });
  });

  it("uses the window's own shift times when it has them", async () => {
    const prisma = buildPrismaStub();
    prisma.availabilitySubmission.findMany.mockResolvedValue([
      submissionRow(ANA.id, '2026-09-28', 1),
      submissionRow(BRUNO.id, '2026-09-28', 1),
    ]);
    prisma.availabilityWindowShift.findMany.mockResolvedValue([
      shiftRow('2026-09-28', 1, 6, 12),
      shiftRow('2026-09-28', 2, 12, 18),
    ]);
    const { service } = buildService({ prisma });

    const matrix = await service.getMatrix();
    const monday = matrix.days.find((day) => day.date === '2026-09-28')!;

    expect(monday.shifts.map((shift) => shift.label)).toEqual([
      '06:00–12:00',
      '12:00–18:00',
    ]);
    // The submissions land on slot 1, i.e. the 06:00–12:00 shift.
    expect(monday.shifts[0]).toMatchObject({ availableCount: 2, driverCount: 2 });
    expect(monday.shifts[1].availableCount).toBe(0);
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
      submissionRow(ANA.id, '2026-10-03', 1),
      submissionRow(BRUNO.id, '2026-10-03', 1),
      submissionRow(CARLA.id, '2026-10-03', 1),
    ]);
    const { service } = buildService({ prisma });

    const csv = await service.getMatrixCsv();
    const lines = csv.split('\n');

    expect(lines[0]).toBe(
      'date,dayType,holiday,shift,vehiclesNeeded,availableCount,driverCount,coverage,available',
    );
    // 5 workdays × 1 shift + 3 two-shift days × 2 = 11 data rows.
    expect(lines).toHaveLength(12);
    expect(lines).toContain('2026-09-28,workday,,20:00–24:00,1,0,0,red,');
    // Names are joined with "; " precisely so the column never needs quoting.
    expect(lines).toContain(
      '2026-10-03,weekend,,08:00–16:00,1,3,2,green,Ana Silva (driver); Bruno Costa (driver); Carla Ferreira',
    );
  });

  it('marks the day type and holiday name per row', async () => {
    const { service } = buildService();

    const csv = await service.getMatrixCsv();

    expect(csv).toContain('2026-10-05,holiday,Implantação da República,08:00–16:00,1,0,0,red,');
    expect(csv).toContain('2026-10-04,weekend,,08:00–16:00,1,0,0,red,');
  });

  it('quotes a holiday name containing a comma', async () => {
    const { service } = buildService({
      holidays: { '2026-10-05': 'Implantação, teste' },
    });

    const csv = await service.getMatrixCsv();

    expect(csv).toContain('2026-10-05,holiday,"Implantação, teste",08:00–16:00,1,0,0,red,');
  });

  it("exports the window's own shift times", async () => {
    const prisma = buildPrismaStub();
    prisma.availabilityWindowShift.findMany.mockResolvedValue([
      shiftRow('2026-09-28', 1, 6, 12),
    ]);
    const { service } = buildService({ prisma });

    const csv = await service.getMatrixCsv();
    const lines = csv.split('\n');

    // One shift on one day, and nothing for the days left empty.
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('2026-09-28,workday,,06:00–12:00,1,0,0,red,');
  });
});
