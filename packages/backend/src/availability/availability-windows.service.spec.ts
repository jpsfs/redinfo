import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  AvailabilityWindowsService,
  MAX_WINDOW_DAYS,
} from './availability-windows.service';
import { ShiftScheduleService } from './shift-schedule.service';
import { HolidaysService } from './holidays.service';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityWindowStatus } from '@redinfo/shared';

// ── helpers ────────────────────────────────────────────────────────────────────

const COORDINATOR = { id: 'user-coord', firstName: 'Maria', lastName: 'Santos' };

/** Mon 5 Oct 2026 is a holiday, so it gets the two-shift default. */
const HOLIDAYS: Record<string, string> = { '2026-10-05': 'Implantação da República' };

function buildHolidaysStub() {
  return {
    findBetween: jest.fn(async (from: string, to: string) => {
      return new Map(
        Object.entries(HOLIDAYS).filter(([date]) => date >= from && date <= to),
      );
    }),
    isHoliday: jest.fn(async (date: string) => date in HOLIDAYS),
  };
}

function windowRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'win-1',
    startDate: new Date('2026-09-28T00:00:00.000Z'),
    endDate: new Date('2026-10-05T00:00:00.000Z'),
    status: AvailabilityWindowStatus.OPEN,
    openedById: COORDINATOR.id,
    openedBy: COORDINATOR,
    openedAt: new Date('2026-09-26T09:14:00.000Z'),
    closedById: null,
    closedBy: null,
    closedAt: null,
    createdAt: new Date('2026-09-26T09:14:00.000Z'),
    updatedAt: new Date('2026-09-26T09:14:00.000Z'),
    ...overrides,
  };
}

function buildPrismaStub(overrides: Record<string, unknown> = {}) {
  const stub: Record<string, unknown> = {
    availabilityWindow: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation((args) =>
        Promise.resolve(windowRow({ id: 'win-new', ...args.data, openedBy: COORDINATOR })),
      ),
      update: jest.fn().mockImplementation((args) =>
        Promise.resolve(
          windowRow({
            id: args.where.id,
            ...args.data,
            openedBy: COORDINATOR,
            closedBy: COORDINATOR,
          }),
        ),
      ),
    },
    availabilityWindowShift: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    // Both forms: the array form for batched writes, and the callback form for
    // "create the window, then its shift rows".
    $transaction: jest.fn().mockImplementation((arg: unknown) =>
      Array.isArray(arg)
        ? Promise.all(arg)
        : (arg as (tx: unknown) => Promise<unknown>)(stub),
    ),
    ...overrides,
  };
  return stub as ReturnType<typeof buildStubShape>;
}

// Only for the return type above — keeps `prisma.availabilityWindow.create` typed.
function buildStubShape() {
  return {
    availabilityWindow: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    availabilityWindowShift: { findMany: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn(),
  };
}

/** The shift rows a call to `open` materialised, flattened. */
function createdShiftRows(prisma: ReturnType<typeof buildStubShape>) {
  return prisma.availabilityWindowShift.createMany.mock.calls.flatMap(
    (call) => (call[0] as { data: Array<Record<string, unknown>> }).data,
  );
}

/** Shift rows for one date, as `HH-HH` strings in slot order. */
function shiftsOn(prisma: ReturnType<typeof buildStubShape>, date: string) {
  return createdShiftRows(prisma)
    .filter((row) => (row.date as Date).toISOString().startsWith(date))
    .sort((a, b) => (a.slot as number) - (b.slot as number))
    .map((row) => `${row.startHour}-${row.endHour}`);
}

describe('AvailabilityWindowsService', () => {
  let service: AvailabilityWindowsService;
  let prisma: ReturnType<typeof buildStubShape>;

  beforeEach(() => {
    prisma = buildPrismaStub();
    const shiftSchedule = new ShiftScheduleService(
      buildHolidaysStub() as unknown as HolidaysService,
      prisma as unknown as PrismaService,
    );
    service = new AvailabilityWindowsService(prisma as never, shiftSchedule);
  });

  // ── open (AC: only one window open at a time) ────────────────────────────────

  describe('open', () => {
    it('creates a window when none is open', async () => {
      const result = await service.open(
        { startDate: '2026-09-28', endDate: '2026-10-05' },
        COORDINATOR.id,
      );

      expect(prisma.availabilityWindow.create).toHaveBeenCalledTimes(1);
      const { data } = prisma.availabilityWindow.create.mock.calls[0][0];
      expect(data.startDate.toISOString()).toBe('2026-09-28T00:00:00.000Z');
      expect(data.endDate.toISOString()).toBe('2026-10-05T00:00:00.000Z');
      expect(data.status).toBe(AvailabilityWindowStatus.OPEN);
      expect(data.openedById).toBe(COORDINATOR.id);
      expect(result.startDate).toBe('2026-09-28');
      expect(result.endDate).toBe('2026-10-05');
    });

    it('throws ConflictException when a window is already open', async () => {
      prisma.availabilityWindow.findFirst.mockResolvedValue(windowRow());

      await expect(
        service.open({ startDate: '2026-10-12', endDate: '2026-10-19' }, COORDINATOR.id),
      ).rejects.toThrow(ConflictException);
      expect(prisma.availabilityWindow.create).not.toHaveBeenCalled();
    });

    it('names the blocking window in the conflict message', async () => {
      prisma.availabilityWindow.findFirst.mockResolvedValue(windowRow());

      await expect(
        service.open({ startDate: '2026-10-12', endDate: '2026-10-19' }, COORDINATOR.id),
      ).rejects.toThrow(/2026-09-28 – 2026-10-05/);
    });

    it('throws BadRequestException when the end date precedes the start date', async () => {
      await expect(
        service.open({ startDate: '2026-10-12', endDate: '2026-10-08' }, COORDINATOR.id),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.availabilityWindow.create).not.toHaveBeenCalled();
    });

    it('accepts a single-day window', async () => {
      const result = await service.open(
        { startDate: '2026-10-05', endDate: '2026-10-05' },
        COORDINATOR.id,
      );
      expect(result.startDate).toBe(result.endDate);
    });

    it('rejects a window longer than the allowed maximum', async () => {
      await expect(
        service.open({ startDate: '2026-01-01', endDate: '2026-12-31' }, COORDINATOR.id),
      ).rejects.toThrow(new RegExp(`at most ${MAX_WINDOW_DAYS} days`));
    });

    it.each(['2026-13-01', '28/09/2026', 'soon'])(
      'rejects malformed start date %s',
      async (value) => {
        await expect(
          service.open({ startDate: value, endDate: '2026-10-05' }, COORDINATOR.id),
        ).rejects.toThrow(BadRequestException);
      },
    );

    it('normalises a full timestamp down to its calendar day', async () => {
      await service.open(
        { startDate: '2026-09-28T22:30:00.000Z', endDate: '2026-10-05' },
        COORDINATOR.id,
      );
      const { data } = prisma.availabilityWindow.create.mock.calls[0][0];
      expect(data.startDate.toISOString()).toBe('2026-09-28T00:00:00.000Z');
    });
  });

  // ── materialising the shift grid ─────────────────────────────────────────────

  describe('open — default grid', () => {
    it('writes one shift row per day and shift when no days are supplied', async () => {
      await service.open(
        { startDate: '2026-09-28', endDate: '2026-10-05' },
        COORDINATOR.id,
      );

      // Mon–Fri × 1 shift + Sat, Sun and the holiday Monday × 2 shifts.
      expect(createdShiftRows(prisma)).toHaveLength(5 * 1 + 3 * 2);
      expect(shiftsOn(prisma, '2026-09-28')).toEqual(['20-24']);
      expect(shiftsOn(prisma, '2026-10-03')).toEqual(['8-16', '16-24']);
      expect(shiftsOn(prisma, '2026-10-05')).toEqual(['8-16', '16-24']);
    });

    it('points every shift row at the window it just created', async () => {
      await service.open(
        { startDate: '2026-09-28', endDate: '2026-09-29' },
        COORDINATOR.id,
      );
      expect(
        createdShiftRows(prisma).every((row) => row.windowId === 'win-new'),
      ).toBe(true);
    });

    it('creates the window and its shifts in one transaction', async () => {
      await service.open(
        { startDate: '2026-09-28', endDate: '2026-09-29' },
        COORDINATOR.id,
      );
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('open — per-day shifts', () => {
    const DAYS = [
      // A Monday given weekend-style cover, out of order on purpose.
      { date: '2026-09-28', shifts: [{ startHour: 16, endHour: 24 }, { startHour: 8, endHour: 16 }] },
      // A Tuesday with hours the default grid has no notion of.
      { date: '2026-09-29', shifts: [{ startHour: 10, endHour: 14 }] },
      // A Wednesday nobody is needed on.
      { date: '2026-09-30', shifts: [] },
    ];

    it('stores the supplied times, sorted, with slots numbered from 1', async () => {
      await service.open(
        { startDate: '2026-09-28', endDate: '2026-09-30', days: DAYS },
        COORDINATOR.id,
      );

      expect(shiftsOn(prisma, '2026-09-28')).toEqual(['8-16', '16-24']);
      expect(shiftsOn(prisma, '2026-09-29')).toEqual(['10-14']);
      expect(createdShiftRows(prisma).filter((row) => row.slot === 1)).toHaveLength(2);
    });

    it('leaves a day with no shifts unrepresented rather than filling it in', async () => {
      await service.open(
        { startDate: '2026-09-28', endDate: '2026-09-30', days: DAYS },
        COORDINATOR.id,
      );
      expect(shiftsOn(prisma, '2026-09-30')).toEqual([]);
    });

    it('rejects a range with days missing, naming them', async () => {
      await expect(
        service.open(
          { startDate: '2026-09-28', endDate: '2026-09-30', days: DAYS.slice(0, 1) },
          COORDINATOR.id,
        ),
      ).rejects.toThrow(/missing for 2026-09-29, 2026-09-30/);
      expect(prisma.availabilityWindow.create).not.toHaveBeenCalled();
    });

    it('rejects a day outside the range', async () => {
      await expect(
        service.open(
          {
            startDate: '2026-09-28',
            endDate: '2026-09-28',
            days: [DAYS[0], { date: '2026-10-20', shifts: [] }],
          },
          COORDINATOR.id,
        ),
      ).rejects.toThrow(/2026-10-20 is outside the window/);
    });

    it('rejects the same day twice', async () => {
      await expect(
        service.open(
          { startDate: '2026-09-28', endDate: '2026-09-28', days: [DAYS[0], DAYS[0]] },
          COORDINATOR.id,
        ),
      ).rejects.toThrow(/Duplicate shifts supplied for 2026-09-28/);
    });

    it('rejects overlapping shifts on a day', async () => {
      await expect(
        service.open(
          {
            startDate: '2026-09-28',
            endDate: '2026-09-28',
            days: [
              {
                date: '2026-09-28',
                shifts: [
                  { startHour: 8, endHour: 16 },
                  { startHour: 12, endHour: 20 },
                ],
              },
            ],
          },
          COORDINATOR.id,
        ),
      ).rejects.toThrow(/2026-09-28.*overlap/);
      expect(prisma.availabilityWindow.create).not.toHaveBeenCalled();
    });

    it('rejects a shift that ends before it starts', async () => {
      await expect(
        service.open(
          {
            startDate: '2026-09-28',
            endDate: '2026-09-28',
            days: [{ date: '2026-09-28', shifts: [{ startHour: 20, endHour: 8 }] }],
          },
          COORDINATOR.id,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a window where every day is empty, and writes no shift rows', async () => {
      await service.open(
        {
          startDate: '2026-09-28',
          endDate: '2026-09-29',
          days: [
            { date: '2026-09-28', shifts: [] },
            { date: '2026-09-29', shifts: [] },
          ],
        },
        COORDINATOR.id,
      );
      expect(prisma.availabilityWindowShift.createMany).not.toHaveBeenCalled();
      expect(prisma.availabilityWindow.create).toHaveBeenCalledTimes(1);
    });
  });

  // ── the whole-month shortcut ─────────────────────────────────────────────────

  describe('openMonth', () => {
    it('spans the 1st to the last day of the month', async () => {
      const result = await service.openMonth({ year: 2026, month: 10 }, COORDINATOR.id);
      const { data } = prisma.availabilityWindow.create.mock.calls[0][0];

      expect(data.startDate.toISOString()).toBe('2026-10-01T00:00:00.000Z');
      expect(data.endDate.toISOString()).toBe('2026-10-31T00:00:00.000Z');
      expect(result.startDate).toBe('2026-10-01');
      expect(result.endDate).toBe('2026-10-31');
    });

    it('gets February right in a leap year', async () => {
      await service.openMonth({ year: 2028, month: 2 }, COORDINATOR.id);
      const { data } = prisma.availabilityWindow.create.mock.calls[0][0];
      expect(data.endDate.toISOString()).toBe('2028-02-29T00:00:00.000Z');
    });

    it('uses the default grid, including for holidays inside the month', async () => {
      await service.openMonth({ year: 2026, month: 10 }, COORDINATOR.id);
      expect(shiftsOn(prisma, '2026-10-01')).toEqual(['20-24']);
      expect(shiftsOn(prisma, '2026-10-05')).toEqual(['8-16', '16-24']);
    });

    it('is blocked by an already-open window like any other window', async () => {
      prisma.availabilityWindow.findFirst.mockResolvedValue(windowRow());
      await expect(
        service.openMonth({ year: 2026, month: 11 }, COORDINATOR.id),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a month outside 1–12', async () => {
      await expect(
        service.openMonth({ year: 2026, month: 13 }, COORDINATOR.id),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getCalendar', () => {
    it("returns the window's own shifts", async () => {
      prisma.availabilityWindow.findUnique.mockResolvedValue(
        windowRow({
          startDate: new Date('2026-09-28T00:00:00.000Z'),
          endDate: new Date('2026-09-29T00:00:00.000Z'),
        }),
      );
      prisma.availabilityWindowShift.findMany.mockResolvedValue([
        { date: new Date('2026-09-28T00:00:00.000Z'), slot: 1, startHour: 10, endHour: 14 },
      ]);

      const calendar = await service.getCalendar('win-1');

      expect(calendar.map((day) => day.shifts.map((shift) => shift.label))).toEqual([
        ['10:00–14:00'],
        [],
      ]);
    });

    it('throws NotFoundException for an unknown window', async () => {
      prisma.availabilityWindow.findUnique.mockResolvedValue(null);
      await expect(service.getCalendar('nope')).rejects.toThrow(NotFoundException);
    });
  });

  // ── close (AC: coordinators can close the active window) ─────────────────────

  describe('close', () => {
    it('marks the window closed and records who closed it', async () => {
      prisma.availabilityWindow.findUnique.mockResolvedValue(windowRow());

      const result = await service.close('win-1', COORDINATOR.id);

      const { data } = prisma.availabilityWindow.update.mock.calls[0][0];
      expect(data.status).toBe(AvailabilityWindowStatus.CLOSED);
      expect(data.closedById).toBe(COORDINATOR.id);
      expect(data.closedAt).toBeInstanceOf(Date);
      expect(result.status).toBe(AvailabilityWindowStatus.CLOSED);
    });

    it('throws NotFoundException for an unknown window', async () => {
      prisma.availabilityWindow.findUnique.mockResolvedValue(null);
      await expect(service.close('nope', COORDINATOR.id)).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the window is already closed', async () => {
      prisma.availabilityWindow.findUnique.mockResolvedValue(
        windowRow({ status: AvailabilityWindowStatus.CLOSED }),
      );
      await expect(service.close('win-1', COORDINATOR.id)).rejects.toThrow(ConflictException);
      expect(prisma.availabilityWindow.update).not.toHaveBeenCalled();
    });
  });

  // ── lookups ─────────────────────────────────────────────────────────────────

  describe('findActive', () => {
    it('returns null when no window is open', async () => {
      prisma.availabilityWindow.findFirst.mockResolvedValue(null);
      await expect(service.findActive()).resolves.toBeNull();
    });

    it('only ever looks for OPEN windows', async () => {
      prisma.availabilityWindow.findFirst.mockResolvedValue(windowRow());
      await service.findActive();
      expect(prisma.availabilityWindow.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: AvailabilityWindowStatus.OPEN } }),
      );
    });
  });

  describe('findActiveOrLatest', () => {
    it('falls back to the most recently opened window when none is open', async () => {
      prisma.availabilityWindow.findFirst
        .mockResolvedValueOnce(null) // no OPEN window
        .mockResolvedValueOnce(windowRow({ status: AvailabilityWindowStatus.CLOSED }));

      const result = await service.findActiveOrLatest();

      expect(result?.status).toBe(AvailabilityWindowStatus.CLOSED);
      expect(prisma.availabilityWindow.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({ orderBy: { openedAt: 'desc' } }),
      );
    });

    it('returns null when no window has ever been opened', async () => {
      prisma.availabilityWindow.findFirst.mockResolvedValue(null);
      await expect(service.findActiveOrLatest()).resolves.toBeNull();
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for an unknown id', async () => {
      prisma.availabilityWindow.findUnique.mockResolvedValue(null);
      await expect(service.findOne('nope')).rejects.toThrow(NotFoundException);
    });

    it('serialises dates as ISO calendar days and timestamps as ISO instants', async () => {
      prisma.availabilityWindow.findUnique.mockResolvedValue(windowRow());
      const result = await service.findOne('win-1');
      expect(result.startDate).toBe('2026-09-28');
      expect(result.openedAt).toBe('2026-09-26T09:14:00.000Z');
      expect(result.openedBy).toEqual(COORDINATOR);
      expect(result.closedAt).toBeNull();
    });
  });

  describe('findAll', () => {
    it('pages newest-first and reports the total', async () => {
      prisma.availabilityWindow.findMany.mockResolvedValue([windowRow()]);
      prisma.availabilityWindow.count.mockResolvedValue(3);

      const result = await service.findAll(2, 10);

      expect(prisma.availabilityWindow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10, orderBy: { openedAt: 'desc' } }),
      );
      expect(result).toMatchObject({ total: 3, page: 2, perPage: 10 });
      expect(result.data).toHaveLength(1);
    });
  });
});
