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
import { CreateAvailabilityWindowDto } from './dto/create-availability-window.dto';
import {
  AvailabilityWindowCategory,
  AvailabilityWindowStatus,
  CertificationType,
  formatShiftLabel,
  toMinuteOfDay,
} from '@redinfo/shared';

// ── helpers ────────────────────────────────────────────────────────────────────

const COORDINATOR = { id: 'user-coord', firstName: 'Maria', lastName: 'Santos' };

const { EMERGENCY, LOCAL_SUPPORT } = AvailabilityWindowCategory;
const { TAS } = CertificationType;

/** Mon 5 Oct 2026 is a holiday, so it gets the two-shift default. */
const HOLIDAYS: Record<string, string> = { '2026-10-05': 'Implantação da República' };

/** Minutes from midnight, so the tests read in wall-clock hours. */
const at = (hour: number, minute = 0) => toMinuteOfDay(hour, minute);

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
    category: EMERGENCY,
    name: 'Emergency - October',
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
      create: jest.fn().mockImplementation((args) => {
        // Roles are written as a nested create; mirror what Prisma hands back
        // for one, so the service's own serialisation is what gets exercised.
        const { roles, ...data } = args.data as {
          roles?: { create: Array<Record<string, unknown>> };
        };
        return Promise.resolve(
          windowRow({
            id: 'win-new',
            ...data,
            openedBy: COORDINATOR,
            roles: (roles?.create ?? []).map((role, index) => ({
              id: `role-${index + 1}`,
              windowId: 'win-new',
              ...role,
            })),
          }),
        );
      }),
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used only in a `typeof` type position
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

/** The roles a call to `open` asked Prisma to create, in the order given. */
function createdRoles(prisma: ReturnType<typeof buildStubShape>) {
  const { data } = prisma.availabilityWindow.create.mock.calls[0][0] as {
    data: { roles?: { create: Array<Record<string, unknown>> } };
  };
  return data.roles?.create ?? [];
}

/** The shift rows a call to `open` materialised, flattened. */
function createdShiftRows(prisma: ReturnType<typeof buildStubShape>) {
  return prisma.availabilityWindowShift.createMany.mock.calls.flatMap(
    (call) => (call[0] as { data: Array<Record<string, unknown>> }).data,
  );
}

/** Shift rows for one date, as labels in slot order. */
function shiftsOn(prisma: ReturnType<typeof buildStubShape>, date: string) {
  return createdShiftRows(prisma)
    .filter((row) => (row.date as Date).toISOString().startsWith(date))
    .sort((a, b) => (a.slot as number) - (b.slot as number))
    .map((row) =>
      formatShiftLabel({
        startMinute: row.startMinute as number,
        endMinute: row.endMinute as number,
      }),
    );
}

describe('AvailabilityWindowsService', () => {
  let service: AvailabilityWindowsService;
  let prisma: ReturnType<typeof buildStubShape>;

  /** `open` with the required fields filled in, so tests state only what matters. */
  const open = (overrides: Partial<CreateAvailabilityWindowDto> = {}) =>
    service.open(
      {
        startDate: '2026-09-28',
        endDate: '2026-10-05',
        category: EMERGENCY,
        ...overrides,
      } as CreateAvailabilityWindowDto,
      COORDINATOR.id,
    );

  beforeEach(() => {
    prisma = buildPrismaStub();
    const shiftSchedule = new ShiftScheduleService(
      buildHolidaysStub() as unknown as HolidaysService,
      prisma as unknown as PrismaService,
    );
    service = new AvailabilityWindowsService(prisma as never, shiftSchedule);
  });

  // ── open ─────────────────────────────────────────────────────────────────────

  describe('open', () => {
    it('creates a window when nothing overlaps', async () => {
      const result = await open();

      expect(prisma.availabilityWindow.create).toHaveBeenCalledTimes(1);
      const { data } = prisma.availabilityWindow.create.mock.calls[0][0];
      expect(data.startDate.toISOString()).toBe('2026-09-28T00:00:00.000Z');
      expect(data.endDate.toISOString()).toBe('2026-10-05T00:00:00.000Z');
      expect(data.status).toBe(AvailabilityWindowStatus.OPEN);
      expect(data.openedById).toBe(COORDINATOR.id);
      expect(result.startDate).toBe('2026-09-28');
      expect(result.endDate).toBe('2026-10-05');
    });

    it('throws BadRequestException when the end date precedes the start date', async () => {
      await expect(
        open({ startDate: '2026-10-12', endDate: '2026-10-08' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.availabilityWindow.create).not.toHaveBeenCalled();
    });

    it('accepts a single-day window', async () => {
      const result = await open({ startDate: '2026-10-05', endDate: '2026-10-05' });
      expect(result.startDate).toBe(result.endDate);
    });

    it('rejects a window longer than the allowed maximum', async () => {
      await expect(
        open({ startDate: '2026-01-01', endDate: '2026-12-31' }),
      ).rejects.toThrow(new RegExp(`at most ${MAX_WINDOW_DAYS} days`));
    });

    it.each(['2026-13-01', '28/09/2026', 'soon'])(
      'rejects malformed start date %s',
      async (value) => {
        await expect(open({ startDate: value })).rejects.toThrow(BadRequestException);
      },
    );

    it('normalises a full timestamp down to its calendar day', async () => {
      await open({ startDate: '2026-09-28T22:30:00.000Z' });
      const { data } = prisma.availabilityWindow.create.mock.calls[0][0];
      expect(data.startDate.toISOString()).toBe('2026-09-28T00:00:00.000Z');
    });
  });

  // ── category and name ────────────────────────────────────────────────────────

  describe('open — category and name', () => {
    it('stores the category it was given', async () => {
      const result = await open({ category: LOCAL_SUPPORT });

      const { data } = prisma.availabilityWindow.create.mock.calls[0][0];
      expect(data.category).toBe(LOCAL_SUPPORT);
      expect(result.category).toBe(LOCAL_SUPPORT);
    });

    it('rejects a category that is not one of the known ones', async () => {
      await expect(
        open({ category: 'PARADE_SUPPORT' as AvailabilityWindowCategory }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.availabilityWindow.create).not.toHaveBeenCalled();
    });

    it('stores a trimmed name', async () => {
      await open({ name: '  Marathon cover  ' });
      const { data } = prisma.availabilityWindow.create.mock.calls[0][0];
      expect(data.name).toBe('Marathon cover');
    });

    it.each([undefined, '', '   '])('stores %p as no name at all', async (name) => {
      await open({ name });
      const { data } = prisma.availabilityWindow.create.mock.calls[0][0];
      expect(data.name).toBeNull();
    });

    it('rejects a name longer than the limit', async () => {
      await expect(open({ name: 'x'.repeat(200) })).rejects.toThrow(BadRequestException);
    });
  });

  // ── roles ────────────────────────────────────────────────────────────────────

  describe('open — roles', () => {
    it('gives an Emergency window the default crew, one person each', async () => {
      const result = await open();

      expect(createdRoles(prisma)).toEqual([
        {
          name: 'Driver',
          maxPeople: 1,
          mandatoryCount: 1,
          order: 0,
          requiredCertification: 'DRIVER',
        },
        {
          name: 'Team Leader',
          maxPeople: 1,
          mandatoryCount: 1,
          order: 1,
          requiredCertification: 'TAS',
        },
        {
          name: 'Team Member',
          maxPeople: 1,
          mandatoryCount: 0,
          order: 2,
          requiredCertification: 'TAT',
        },
      ]);
      expect(result.roles?.map((role) => role.name)).toEqual([
        'Driver',
        'Team Leader',
        'Team Member',
      ]);
    });

    it('leaves another category with no roles unless it asks for some', async () => {
      await open({ category: LOCAL_SUPPORT });
      expect(createdRoles(prisma)).toEqual([]);
    });

    it('stores the roles it was given, in the order they arrived', async () => {
      await open({
        category: LOCAL_SUPPORT,
        roles: [
          { name: 'Radio operator', maxPeople: 2 },
          { name: 'Stretcher bearer', maxPeople: 0 },
        ],
      });

      expect(createdRoles(prisma)).toEqual([
        {
          name: 'Radio operator',
          maxPeople: 2,
          mandatoryCount: 0,
          order: 0,
          requiredCertification: null,
        },
        {
          name: 'Stretcher bearer',
          maxPeople: 0,
          mandatoryCount: 0,
          order: 1,
          requiredCertification: null,
        },
      ]);
    });

    it('suggests DRIVER for a Driver role however it was typed, when left unset', async () => {
      await open({ category: LOCAL_SUPPORT, roles: [{ name: '  driver ', maxPeople: 1 }] });

      expect(createdRoles(prisma)).toEqual([
        {
          name: 'driver',
          maxPeople: 1,
          mandatoryCount: 0,
          order: 0,
          requiredCertification: 'DRIVER',
        },
      ]);
    });

    it("keeps a coordinator's explicit choice, suggestion or not", async () => {
      await open({
        category: LOCAL_SUPPORT,
        roles: [{ name: 'Team Leader', maxPeople: 1, requiredCertification: TAS }],
      });

      expect(createdRoles(prisma)).toEqual([
        {
          name: 'Team Leader',
          maxPeople: 1,
          mandatoryCount: 0,
          order: 0,
          requiredCertification: 'TAS',
        },
      ]);
    });

    it('keeps an explicit null — deliberately no requirement — even for a role named "Driver"', async () => {
      await open({
        category: LOCAL_SUPPORT,
        roles: [{ name: 'Driver', maxPeople: 1, requiredCertification: null }],
      });

      expect(createdRoles(prisma)).toEqual([
        {
          name: 'Driver',
          maxPeople: 1,
          mandatoryCount: 0,
          order: 0,
          requiredCertification: null,
        },
      ]);
    });

    it('honours an explicitly empty list rather than falling back to the defaults', async () => {
      await open({ roles: [] });
      expect(createdRoles(prisma)).toEqual([]);
    });

    it('rejects two roles whose names differ only in case', async () => {
      await expect(
        open({ roles: [{ name: 'Driver', maxPeople: 1 }, { name: 'driver', maxPeople: 1 }] }),
      ).rejects.toThrow(/both called "driver"/);
      expect(prisma.availabilityWindow.create).not.toHaveBeenCalled();
    });

    it.each([
      ['a blank name', [{ name: '   ', maxPeople: 1 }], /needs a name/],
      ['a negative headcount', [{ name: 'Driver', maxPeople: -1 }], /whole number/],
      ['a headcount beyond the limit', [{ name: 'Driver', maxPeople: 99 }], /at most 20 people/],
    ])('rejects %s', async (_label, roles, message) => {
      await expect(open({ roles })).rejects.toThrow(message);
      expect(prisma.availabilityWindow.create).not.toHaveBeenCalled();
    });

    it('rejects more roles than a window may have', async () => {
      const roles = Array.from({ length: 13 }, (_, index) => ({
        name: `Role ${index}`,
        maxPeople: 1,
      }));
      await expect(open({ roles })).rejects.toThrow(/at most 12 roles/);
    });

    it('writes the roles in the same transaction as the window', async () => {
      await open({ endDate: '2026-09-29' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  // ── the overlap rules ────────────────────────────────────────────────────────

  describe('open — overlapping windows', () => {
    /** What `findOverlaps` will see: the query already filters by category. */
    const overlapping = (...rows: Array<Record<string, unknown>>) =>
      prisma.availabilityWindow.findMany.mockResolvedValue(rows);

    it('refuses an open window of the same category over the same dates', async () => {
      overlapping(windowRow());

      await expect(open()).rejects.toThrow(ConflictException);
      expect(prisma.availabilityWindow.create).not.toHaveBeenCalled();
    });

    it('names the blocking window, and its category, in the message', async () => {
      overlapping(windowRow());

      await expect(open()).rejects.toThrow(
        /window for Emergency is already open.*Emergency - October, 2026-09-28 – 2026-10-05/,
      );
    });

    it('only looks at windows of the category being opened', async () => {
      await open({ category: LOCAL_SUPPORT });

      expect(prisma.availabilityWindow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: LOCAL_SUPPORT }),
        }),
      );
    });

    it('queries by inclusive-range overlap rather than exact dates', async () => {
      await open({ startDate: '2026-10-01', endDate: '2026-10-31' });

      const { where } = prisma.availabilityWindow.findMany.mock.calls[0][0];
      expect(where.startDate.lte.toISOString()).toBe('2026-10-31T00:00:00.000Z');
      expect(where.endDate.gte.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    });

    it('warns rather than refuses when the overlap is a closed window', async () => {
      overlapping(windowRow({ status: AvailabilityWindowStatus.CLOSED }));

      await expect(open()).rejects.toThrow(
        /closed availability window for Emergency already covers these dates/,
      );
      expect(prisma.availabilityWindow.create).not.toHaveBeenCalled();
    });

    it('opens over a closed window once the warning is acknowledged', async () => {
      overlapping(windowRow({ status: AvailabilityWindowStatus.CLOSED }));

      const result = await open({ acknowledgeOverlap: true });

      expect(result.id).toBe('win-new');
      expect(prisma.availabilityWindow.create).toHaveBeenCalledTimes(1);
    });

    it('never lets an acknowledgement override a window that is still open', async () => {
      overlapping(windowRow());

      await expect(open({ acknowledgeOverlap: true })).rejects.toThrow(
        /already open over these dates/,
      );
      expect(prisma.availabilityWindow.create).not.toHaveBeenCalled();
    });

    it('allows an overlap when the open window belongs to another category', async () => {
      // findOverlaps filters by category in SQL, so a Local Support query finds
      // nothing even though an Emergency window covers the same days.
      prisma.availabilityWindow.findMany.mockResolvedValue([]);

      await expect(open({ category: LOCAL_SUPPORT })).resolves.toMatchObject({
        category: LOCAL_SUPPORT,
      });
    });
  });

  describe('findOverlaps', () => {
    it('splits the overlapping windows by status', async () => {
      prisma.availabilityWindow.findMany.mockResolvedValue([
        windowRow({ id: 'win-open' }),
        windowRow({ id: 'win-closed', status: AvailabilityWindowStatus.CLOSED }),
      ]);

      const result = await service.findOverlaps(EMERGENCY, '2026-09-28', '2026-10-05');

      expect(result.open.map((window) => window.id)).toEqual(['win-open']);
      expect(result.closed.map((window) => window.id)).toEqual(['win-closed']);
    });

    it('rejects an unknown category', async () => {
      await expect(
        service.findOverlaps('WHATEVER', '2026-09-28', '2026-10-05'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a backwards range', async () => {
      await expect(
        service.findOverlaps(EMERGENCY, '2026-10-05', '2026-09-28'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── materialising the shift grid ─────────────────────────────────────────────

  describe('open — default grid', () => {
    it('writes one shift row per day and shift when no days are supplied', async () => {
      await open();

      // Mon–Fri × 1 shift + Sat, Sun and the holiday Monday × 2 shifts.
      expect(createdShiftRows(prisma)).toHaveLength(5 * 1 + 3 * 2);
      expect(shiftsOn(prisma, '2026-09-28')).toEqual(['20:00–24:00']);
      expect(shiftsOn(prisma, '2026-10-03')).toEqual(['08:00–16:00', '16:00–24:00']);
      expect(shiftsOn(prisma, '2026-10-05')).toEqual(['08:00–16:00', '16:00–24:00']);
    });

    it('points every shift row at the window it just created', async () => {
      await open({ endDate: '2026-09-29' });
      expect(
        createdShiftRows(prisma).every((row) => row.windowId === 'win-new'),
      ).toBe(true);
    });

    it('creates the window and its shifts in one transaction', async () => {
      await open({ endDate: '2026-09-29' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('open — per-day shifts', () => {
    const DAYS = [
      // A Monday given weekend-style cover, out of order on purpose.
      {
        date: '2026-09-28',
        shifts: [
          { startMinute: at(16), endMinute: at(24) },
          { startMinute: at(8), endMinute: at(16) },
        ],
      },
      // A Tuesday with times the default grid has no notion of, off the hour.
      { date: '2026-09-29', shifts: [{ startMinute: at(10, 30), endMinute: at(14, 15) }] },
      // A Wednesday nobody is needed on.
      { date: '2026-09-30', shifts: [] },
    ];

    const openWithDays = (
      days: CreateAvailabilityWindowDto['days'],
      overrides: Partial<CreateAvailabilityWindowDto> = {},
    ) => open({ endDate: '2026-09-30', days, ...overrides });

    it('stores the supplied times, sorted, with slots numbered from 1', async () => {
      await openWithDays(DAYS);

      expect(shiftsOn(prisma, '2026-09-28')).toEqual(['08:00–16:00', '16:00–24:00']);
      expect(createdShiftRows(prisma).filter((row) => row.slot === 1)).toHaveLength(2);
    });

    it('keeps times that fall part-way through an hour', async () => {
      await openWithDays(DAYS);

      expect(shiftsOn(prisma, '2026-09-29')).toEqual(['10:30–14:15']);
      const row = createdShiftRows(prisma).find((candidate) => candidate.slot === 1
        && (candidate.date as Date).toISOString().startsWith('2026-09-29'));
      expect(row).toMatchObject({ startMinute: 630, endMinute: 855 });
    });

    it('leaves a day with no shifts unrepresented rather than filling it in', async () => {
      await openWithDays(DAYS);
      expect(shiftsOn(prisma, '2026-09-30')).toEqual([]);
    });

    it('stores the vehicles each shift needs', async () => {
      await open({
        endDate: '2026-09-28',
        days: [
          {
            date: '2026-09-28',
            shifts: [
              { startMinute: at(8), endMinute: at(16), vehiclesNeeded: 3 },
              { startMinute: at(16), endMinute: at(24), vehiclesNeeded: 0 },
            ],
          },
        ],
      });

      expect(
        createdShiftRows(prisma)
          .sort((a, b) => (a.slot as number) - (b.slot as number))
          .map((row) => row.vehiclesNeeded),
      ).toEqual([3, 0]);
    });

    it('defaults a shift with no vehicle count to one', async () => {
      await open({
        endDate: '2026-09-28',
        days: [
          { date: '2026-09-28', shifts: [{ startMinute: at(8), endMinute: at(16) }] },
        ],
      });

      expect(createdShiftRows(prisma)[0].vehiclesNeeded).toBe(1);
    });

    it('rejects a vehicle count beyond the per-shift limit', async () => {
      await expect(
        open({
          endDate: '2026-09-28',
          days: [
            {
              date: '2026-09-28',
              shifts: [{ startMinute: at(8), endMinute: at(16), vehiclesNeeded: 99 }],
            },
          ],
        }),
      ).rejects.toThrow(/2026-09-28.*at most 10 vehicles/);
      expect(prisma.availabilityWindow.create).not.toHaveBeenCalled();
    });

    it('rejects a range with days missing, naming them', async () => {
      await expect(openWithDays(DAYS.slice(0, 1))).rejects.toThrow(
        /missing for 2026-09-29, 2026-09-30/,
      );
      expect(prisma.availabilityWindow.create).not.toHaveBeenCalled();
    });

    it('rejects a day outside the range', async () => {
      await expect(
        open({
          endDate: '2026-09-28',
          days: [DAYS[0], { date: '2026-10-20', shifts: [] }],
        }),
      ).rejects.toThrow(/2026-10-20 is outside the window/);
    });

    it('rejects the same day twice', async () => {
      await expect(
        open({ endDate: '2026-09-28', days: [DAYS[0], DAYS[0]] }),
      ).rejects.toThrow(/Duplicate shifts supplied for 2026-09-28/);
    });

    it('rejects overlapping shifts on a day', async () => {
      await expect(
        open({
          endDate: '2026-09-28',
          days: [
            {
              date: '2026-09-28',
              shifts: [
                { startMinute: at(8), endMinute: at(16) },
                { startMinute: at(12), endMinute: at(20) },
              ],
            },
          ],
        }),
      ).rejects.toThrow(/2026-09-28.*overlap/);
      expect(prisma.availabilityWindow.create).not.toHaveBeenCalled();
    });

    it('rejects shifts that overlap by a single minute', async () => {
      await expect(
        open({
          endDate: '2026-09-28',
          days: [
            {
              date: '2026-09-28',
              shifts: [
                { startMinute: at(8), endMinute: at(16, 1) },
                { startMinute: at(16), endMinute: at(20) },
              ],
            },
          ],
        }),
      ).rejects.toThrow(/overlap/);
    });

    it('rejects a shift that ends before it starts', async () => {
      await expect(
        open({
          endDate: '2026-09-28',
          days: [
            { date: '2026-09-28', shifts: [{ startMinute: at(20), endMinute: at(8) }] },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a window where every day is empty, and writes no shift rows', async () => {
      await open({
        endDate: '2026-09-29',
        days: [
          { date: '2026-09-28', shifts: [] },
          { date: '2026-09-29', shifts: [] },
        ],
      });
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

    it('is always an Emergency window named after its month', async () => {
      await service.openMonth({ year: 2026, month: 10 }, COORDINATOR.id);
      const { data } = prisma.availabilityWindow.create.mock.calls[0][0];

      expect(data.category).toBe(EMERGENCY);
      expect(data.name).toBe('Emergency - October');
    });

    it('uses the default grid, including for holidays inside the month', async () => {
      await service.openMonth({ year: 2026, month: 10 }, COORDINATOR.id);
      expect(shiftsOn(prisma, '2026-10-01')).toEqual(['20:00–24:00']);
      expect(shiftsOn(prisma, '2026-10-05')).toEqual(['08:00–16:00', '16:00–24:00']);
    });

    it('asks for one vehicle on every shift', async () => {
      await service.openMonth({ year: 2026, month: 10 }, COORDINATOR.id);

      const rows = createdShiftRows(prisma);
      expect(rows.length).toBeGreaterThan(30);
      expect(rows.every((row) => row.vehiclesNeeded === 1)).toBe(true);
    });

    it('gets the default emergency crew as its roles', async () => {
      await service.openMonth({ year: 2026, month: 10 }, COORDINATOR.id);

      expect(createdRoles(prisma).map((role) => [role.name, role.maxPeople])).toEqual([
        ['Driver', 1],
        ['Team Leader', 1],
        ['Team Member', 1],
      ]);
    });

    it('is blocked by an open Emergency window over the same month', async () => {
      prisma.availabilityWindow.findMany.mockResolvedValue([
        windowRow({
          startDate: new Date('2026-11-10T00:00:00.000Z'),
          endDate: new Date('2026-11-20T00:00:00.000Z'),
        }),
      ]);
      await expect(
        service.openMonth({ year: 2026, month: 11 }, COORDINATOR.id),
      ).rejects.toThrow(ConflictException);
    });

    it('passes the acknowledgement through for a closed overlap', async () => {
      prisma.availabilityWindow.findMany.mockResolvedValue([
        windowRow({ status: AvailabilityWindowStatus.CLOSED }),
      ]);

      await expect(
        service.openMonth({ year: 2026, month: 10, acknowledgeOverlap: true }, COORDINATOR.id),
      ).resolves.toMatchObject({ id: 'win-new' });
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
        {
          date: new Date('2026-09-28T00:00:00.000Z'),
          slot: 1,
          startMinute: at(10, 30),
          endMinute: at(14),
        },
      ]);

      const calendar = await service.getCalendar('win-1');

      expect(calendar.map((day) => day.shifts.map((shift) => shift.label))).toEqual([
        ['10:30–14:00'],
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

  describe('findOpen', () => {
    it('returns every open window, not just the latest', async () => {
      prisma.availabilityWindow.findMany.mockResolvedValue([
        windowRow({ id: 'win-emergency' }),
        windowRow({ id: 'win-local', category: LOCAL_SUPPORT, name: null }),
      ]);

      const result = await service.findOpen();

      expect(result.map((window) => window.id)).toEqual(['win-emergency', 'win-local']);
      expect(prisma.availabilityWindow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: AvailabilityWindowStatus.OPEN } }),
      );
    });

    it('groups them by category, then by date — the order a person picks from', async () => {
      await service.findOpen();

      expect(prisma.availabilityWindow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ category: 'asc' }, { startDate: 'asc' }],
        }),
      );
    });

    it('returns an empty list when nothing is open', async () => {
      prisma.availabilityWindow.findMany.mockResolvedValue([]);
      await expect(service.findOpen()).resolves.toEqual([]);
    });
  });

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

    it('carries the category and name through', async () => {
      prisma.availabilityWindow.findUnique.mockResolvedValue(
        windowRow({ category: LOCAL_SUPPORT, name: 'Marathon cover' }),
      );
      const result = await service.findOne('win-1');
      expect(result.category).toBe(LOCAL_SUPPORT);
      expect(result.name).toBe('Marathon cover');
    });

    it("carries the window's roles, in their own order", async () => {
      prisma.availabilityWindow.findUnique.mockResolvedValue(
        windowRow({
          roles: [
            {
              id: 'role-1',
              windowId: 'win-1',
              name: 'Driver',
              maxPeople: 1,
              requiredCertification: 'DRIVER',
              order: 0,
            },
          ],
        }),
      );

      const result = await service.findOne('win-1');

      expect(result.roles).toEqual([
        {
          id: 'role-1',
          windowId: 'win-1',
          name: 'Driver',
          maxPeople: 1,
          requiredCertification: 'DRIVER',
          order: 0,
        },
      ]);
    });

    it('reports roles as not-loaded rather than empty when they were not read', async () => {
      // Distinguishable on purpose: "this window has no roles" and "nobody
      // asked for them" are different answers to give the schedule screen.
      prisma.availabilityWindow.findUnique.mockResolvedValue(windowRow());
      await expect(service.findOne('win-1')).resolves.toMatchObject({
        roles: undefined,
      });
    });

    it('reports a nameless window as null rather than undefined', async () => {
      prisma.availabilityWindow.findUnique.mockResolvedValue(windowRow({ name: null }));
      await expect(service.findOne('win-1')).resolves.toMatchObject({ name: null });
    });
  });

  describe('findAll', () => {
    it('pages newest-first and reports the total', async () => {
      prisma.availabilityWindow.findMany.mockResolvedValue([windowRow()]);
      prisma.availabilityWindow.count.mockResolvedValue(3);

      const result = await service.findAll(2, 10);

      expect(prisma.availabilityWindow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
          orderBy: [{ startDate: 'desc' }, { openedAt: 'desc' }],
        }),
      );
      expect(result).toMatchObject({ total: 3, page: 2, perPage: 10 });
      expect(result.data).toHaveLength(1);
    });

    it('filters by category and status, counting the same subset', async () => {
      prisma.availabilityWindow.findMany.mockResolvedValue([]);

      await service.findAll(1, 25, {
        category: LOCAL_SUPPORT,
        status: AvailabilityWindowStatus.CLOSED,
      });

      const where = {
        category: LOCAL_SUPPORT,
        status: AvailabilityWindowStatus.CLOSED,
      };
      expect(prisma.availabilityWindow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where }),
      );
      expect(prisma.availabilityWindow.count).toHaveBeenCalledWith({ where });
    });

    it('applies no filter when none is given', async () => {
      await service.findAll();
      expect(prisma.availabilityWindow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('rejects a filter value that is not a category', async () => {
      await expect(service.findAll(1, 25, { category: 'NOPE' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('narrows to windows overlapping a from/to range', async () => {
      prisma.availabilityWindow.findMany.mockResolvedValue([]);

      await service.findAll(1, 25, { from: '2026-10-01', to: '2026-10-31' });

      const where = {
        startDate: { lte: new Date('2026-10-31') },
        endDate: { gte: new Date('2026-10-01') },
      };
      expect(prisma.availabilityWindow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where }),
      );
      expect(prisma.availabilityWindow.count).toHaveBeenCalledWith({ where });
    });

    it('applies only the given half of an open-ended date range', async () => {
      prisma.availabilityWindow.findMany.mockResolvedValue([]);

      await service.findAll(1, 25, { from: '2026-10-01' });

      expect(prisma.availabilityWindow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { endDate: { gte: new Date('2026-10-01') } },
        }),
      );
    });

    it('rejects a malformed date filter', async () => {
      await expect(service.findAll(1, 25, { from: 'not-a-date' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
