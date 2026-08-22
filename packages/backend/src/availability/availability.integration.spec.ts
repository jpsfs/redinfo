import { PrismaClient } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService, RequestUser } from './availability.service';
import { AvailabilityWindowsService } from './availability-windows.service';
import { HolidaysService } from './holidays.service';
import { ShiftScheduleService } from './shift-schedule.service';
import {
  AvailabilityWindowCategory,
  AvailabilityWindowStatus,
  toMinuteOfDay,
  UserRole,
} from '@redinfo/shared';

/** Minutes from midnight, so the expectations read in wall-clock hours. */
const at = (hour: number, minute = 0) => toMinuteOfDay(hour, minute);

const { EMERGENCY, LOCAL_SUPPORT, SALOP_SUPPORT } = AvailabilityWindowCategory;

/**
 * Integration coverage for the availability module, run against a real
 * Postgres (the CI `postgres` service, or a local `docker-compose` one).
 *
 * Skipped unless DATABASE_URL is set, which is how the backend-tests workflow
 * separates the unit job (no database) from the integration job.
 *
 * Every test name contains "integration" via the outer describe, which is what
 * `pnpm --filter backend test -- -t "integration"` selects on.
 */
/**
 * Runs against a real Postgres, and so does every other `*.integration.spec.ts`
 * — the same one. Some of what they exercise is global to that database: there
 * is only ever one open availability window per category, and `getMine`
 * resolves it without being told which suite asked. Two suites cannot both own
 * it, which is why `jest.maxWorkers` is 1 in this package's config. Each suite
 * still cleans up after itself in `afterAll`, so serial runs are independent.
 * Do not raise the worker count without giving each suite its own schema.
 */
const describeIntegration = process.env.DATABASE_URL ? describe : describe.skip;

/** Unique per run so parallel runs against a shared database cannot collide. */
const RUN = `it-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const email = (local: string) => `${local}.${RUN}@availability.test`;

describeIntegration('Availability module (integration)', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;

  let holidaysService: HolidaysService;
  let shiftSchedule: ShiftScheduleService;
  let windowsService: AvailabilityWindowsService;
  let availability: AvailabilityService;

  // Roster: two drivers, two non-drivers, one deactivated, one logistics-only.
  let ana: { id: string };
  let bruno: { id: string };
  let carla: { id: string };
  let rui: { id: string };
  let marta: { id: string };
  let inactive: { id: string };
  let logistics: { id: string };
  let coordinator: { id: string };
  let systemAdmin: { id: string };

  let volunteer: RequestUser;
  let coordinatorUser: RequestUser;

  const HOLIDAY_DATE = '2026-10-05';
  const WINDOW_START = '2026-09-28'; // Monday
  const WINDOW_END = '2026-10-05'; // Monday, a holiday

  const createdWindowIds: string[] = [];
  /** Set when this run created the holiday, so cleanup only removes its own. */
  let createdHolidayId: string | null = null;

  async function createUser(
    firstName: string,
    lastName: string,
    role: UserRole,
    options: { isDriver?: boolean; isActive?: boolean } = {},
  ) {
    return prisma.user.create({
      data: {
        email: email(`${firstName}.${lastName}`.toLowerCase()),
        firstName,
        lastName,
        role,
        isDriver: options.isDriver ?? false,
        isActive: options.isActive ?? true,
      },
      select: { id: true },
    });
  }

  /**
   * Close the windows *this run* left open, so the next `open` in the same test
   * is not refused by one of its own.
   *
   * Deliberately scoped to `createdWindowIds`: closing a window is irreversible,
   * and a developer's own open window in a shared dev database is not this
   * suite's to close. If one overlaps these dates the suite fails with the
   * conflict message, which says exactly what is in the way.
   */
  async function closeOpenWindows() {
    for (const window of await windowsService.findOpen()) {
      if (createdWindowIds.includes(window.id)) {
        await windowsService.close(window.id, coordinator.id);
      }
    }
  }

  /**
   * Open a fresh window, closing any left open by a previous test.
   *
   * Tests reuse the same dates over and over, which the "a closed window
   * already covers these dates" warning exists to catch — so the helper
   * acknowledges it, as a coordinator would.
   */
  async function openWindow(
    start = WINDOW_START,
    end = WINDOW_END,
    options: { category?: AvailabilityWindowCategory; name?: string } = {},
  ) {
    await closeOpenWindows();
    const window = await windowsService.open(
      {
        startDate: start,
        endDate: end,
        category: options.category ?? EMERGENCY,
        name: options.name,
        acknowledgeOverlap: true,
      },
      coordinator.id,
    );
    createdWindowIds.push(window.id);
    return window;
  }

  /** A window with per-day shifts, over dates earlier tests may have used. */
  async function openCustomWindow(
    dto: Omit<Parameters<AvailabilityWindowsService['open']>[0], 'category'>,
    category: AvailabilityWindowCategory = EMERGENCY,
  ) {
    await closeOpenWindows();
    const window = await windowsService.open(
      { ...dto, category, acknowledgeOverlap: true },
      coordinator.id,
    );
    createdWindowIds.push(window.id);
    return window;
  }

  beforeAll(async () => {
    await prisma.$connect();

    holidaysService = new HolidaysService(prisma);
    shiftSchedule = new ShiftScheduleService(holidaysService, prisma);
    windowsService = new AvailabilityWindowsService(prisma, shiftSchedule);
    availability = new AvailabilityService(prisma, windowsService, shiftSchedule);

    [ana, bruno, carla, rui, marta, inactive, logistics, coordinator, systemAdmin] =
      await Promise.all([
        createUser('Ana', 'Silva', UserRole.EMERGENCY_OPERATIONAL, { isDriver: true }),
        createUser('Bruno', 'Costa', UserRole.EMERGENCY_OPERATIONAL, { isDriver: true }),
        createUser('Carla', 'Ferreira', UserRole.EMERGENCY_OPERATIONAL),
        createUser('Rui', 'Nunes', UserRole.EMERGENCY_OPERATIONAL),
        createUser('Marta', 'Oliveira', UserRole.EMERGENCY_OPERATIONAL),
        createUser('Zoe', 'Inactive', UserRole.EMERGENCY_OPERATIONAL, { isActive: false }),
        createUser('Luis', 'Logistica', UserRole.LOGISTICS_COORDINATOR),
        createUser('Maria', 'Santos', UserRole.EMERGENCY_COORDINATOR),
        createUser('Sara', 'Admin', UserRole.SYSTEM_ADMIN, { isDriver: true }),
      ]);

    volunteer = { id: ana.id, role: UserRole.EMERGENCY_OPERATIONAL };
    coordinatorUser = { id: coordinator.id, role: UserRole.EMERGENCY_COORDINATOR };

    // The window deliberately covers a holiday Monday so the 1-shift/2-shift
    // split is exercised end to end.
    const existingHoliday = await prisma.holiday.findUnique({
      where: { date: new Date(`${HOLIDAY_DATE}T00:00:00.000Z`) },
    });
    if (!existingHoliday) {
      const created = await holidaysService.create({
        date: HOLIDAY_DATE,
        name: 'Implantação da República',
      });
      createdHolidayId = created.id;
    }
  });

  afterAll(async () => {
    const userIds = [
      ana?.id,
      bruno?.id,
      carla?.id,
      rui?.id,
      marta?.id,
      inactive?.id,
      logistics?.id,
      coordinator?.id,
      systemAdmin?.id,
    ].filter(Boolean) as string[];

    // Submissions and responses cascade from both windows and users.
    if (createdWindowIds.length) {
      await prisma.availabilityWindow.deleteMany({ where: { id: { in: createdWindowIds } } });
    }
    if (userIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (createdHolidayId) {
      await prisma.holiday.deleteMany({ where: { id: createdHolidayId } });
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    if (createdWindowIds.length) {
      await prisma.availabilityWindow.deleteMany({ where: { id: { in: createdWindowIds } } });
      createdWindowIds.length = 0;
    }
  });

  // ── windows ────────────────────────────────────────────────────────────────

  describe('window lifecycle', () => {
    it('persists an opened window as the single active one', async () => {
      const window = await openWindow();

      expect(window.status).toBe(AvailabilityWindowStatus.OPEN);
      expect(window.startDate).toBe(WINDOW_START);
      expect(window.endDate).toBe(WINDOW_END);

      const active = await windowsService.findActive();
      expect(active?.id).toBe(window.id);
      expect(active?.openedBy).toMatchObject({ firstName: 'Maria', lastName: 'Santos' });
    });

    it('rejects a second open window over the same dates in the same category', async () => {
      await openWindow('2026-10-12', '2026-10-19');

      await expect(
        windowsService.open(
          { startDate: '2026-10-15', endDate: '2026-10-22', category: EMERGENCY },
          coordinator.id,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('allows opening the next window once the current one is closed', async () => {
      const first = await openWindow();
      await windowsService.close(first.id, coordinator.id);

      const second = await windowsService.open(
        { startDate: '2026-10-12', endDate: '2026-10-19', category: EMERGENCY },
        coordinator.id,
      );
      createdWindowIds.push(second.id);

      expect(second.status).toBe(AvailabilityWindowStatus.OPEN);
      const closedFirst = await windowsService.findOne(first.id);
      expect(closedFirst.status).toBe(AvailabilityWindowStatus.CLOSED);
      expect(closedFirst.closedBy).toMatchObject({ firstName: 'Maria' });
      expect(closedFirst.closedAt).not.toBeNull();
    });

    it('round-trips window dates without timezone drift', async () => {
      const window = await openWindow('2026-03-28', '2026-03-30'); // DST change in between
      const reloaded = await windowsService.findOne(window.id);

      expect(reloaded.startDate).toBe('2026-03-28');
      expect(reloaded.endDate).toBe('2026-03-30');
    });
  });

  // ── categories ─────────────────────────────────────────────────────────────

  describe('categories', () => {
    /** Open one window per category over exactly the same dates. */
    async function openEachCategory() {
      await closeOpenWindows();
      const windows = [];
      for (const category of [EMERGENCY, LOCAL_SUPPORT, SALOP_SUPPORT]) {
        const window = await windowsService.open(
          { startDate: '2026-10-12', endDate: '2026-10-18', category },
          coordinator.id,
        );
        createdWindowIds.push(window.id);
        windows.push(window);
      }
      return windows;
    }

    it('lets windows of different categories cover the same dates at once', async () => {
      const windows = await openEachCategory();

      expect(windows.map((window) => window.category)).toEqual([
        EMERGENCY,
        LOCAL_SUPPORT,
        SALOP_SUPPORT,
      ]);
      const open = await windowsService.findOpen();
      expect(open).toHaveLength(3);
    });

    it('stores a name, and reports no name as null', async () => {
      const named = await openWindow(WINDOW_START, WINDOW_END, {
        category: LOCAL_SUPPORT,
        name: 'Marathon cover',
      });
      expect(await windowsService.findOne(named.id)).toMatchObject({
        name: 'Marathon cover',
        category: LOCAL_SUPPORT,
      });

      const nameless = await openWindow('2026-11-16', '2026-11-20', { category: SALOP_SUPPORT });
      expect(await windowsService.findOne(nameless.id)).toMatchObject({ name: null });
    });

    it('refuses an overlapping open window of the same category', async () => {
      await openEachCategory();

      await expect(
        windowsService.open(
          { startDate: '2026-10-18', endDate: '2026-10-25', category: LOCAL_SUPPORT },
          coordinator.id,
        ),
      ).rejects.toThrow(/window for Local Support is already open/);
    });

    it('allows two open windows of one category over dates that do not meet', async () => {
      await closeOpenWindows();
      const first = await windowsService.open(
        { startDate: '2026-10-01', endDate: '2026-10-15', category: EMERGENCY },
        coordinator.id,
      );
      const second = await windowsService.open(
        { startDate: '2026-10-16', endDate: '2026-10-31', category: EMERGENCY },
        coordinator.id,
      );
      createdWindowIds.push(first.id, second.id);

      expect(second.status).toBe(AvailabilityWindowStatus.OPEN);
    });

    it('warns about a closed window over the same dates, then opens once told to', async () => {
      const first = await openWindow('2026-10-12', '2026-10-18');
      await windowsService.close(first.id, coordinator.id);

      const dto = {
        startDate: '2026-10-14',
        endDate: '2026-10-20',
        category: EMERGENCY,
      };
      await expect(windowsService.open(dto, coordinator.id)).rejects.toThrow(
        /closed availability window for Emergency already covers these dates/,
      );

      const second = await windowsService.open(
        { ...dto, acknowledgeOverlap: true },
        coordinator.id,
      );
      createdWindowIds.push(second.id);
      expect(second.status).toBe(AvailabilityWindowStatus.OPEN);
    });

    it('reports overlaps for a proposed range, split by status', async () => {
      const closed = await openWindow('2026-10-12', '2026-10-18');
      await windowsService.close(closed.id, coordinator.id);
      const stillOpen = await windowsService.open(
        { startDate: '2026-10-19', endDate: '2026-10-25', category: EMERGENCY },
        coordinator.id,
      );
      createdWindowIds.push(stillOpen.id);

      const overlaps = await windowsService.findOverlaps(
        EMERGENCY,
        '2026-10-15',
        '2026-10-20',
      );

      expect(overlaps.closed.map((window) => window.id)).toEqual([closed.id]);
      expect(overlaps.open.map((window) => window.id)).toEqual([stillOpen.id]);
    });

    it('reports no overlap for another category, or for dates just outside', async () => {
      await openWindow('2026-10-12', '2026-10-18');

      await expect(
        windowsService.findOverlaps(LOCAL_SUPPORT, '2026-10-12', '2026-10-18'),
      ).resolves.toEqual({ open: [], closed: [] });
      await expect(
        windowsService.findOverlaps(EMERGENCY, '2026-10-19', '2026-10-25'),
      ).resolves.toEqual({ open: [], closed: [] });
    });

    it('names an emergency month window after its month', async () => {
      await closeOpenWindows();
      const window = await windowsService.openMonth({ year: 2026, month: 7 }, coordinator.id);
      createdWindowIds.push(window.id);

      expect(window).toMatchObject({
        category: EMERGENCY,
        name: 'Emergency - July',
        startDate: '2026-07-01',
        endDate: '2026-07-31',
      });
    });
  });

  // ── several windows open at once ───────────────────────────────────────────

  describe('submitting with more than one window open', () => {
    /** Emergency and Local Support, both open over the same single day. */
    async function openTwo() {
      await closeOpenWindows();
      const emergency = await windowsService.open(
        { startDate: '2026-10-12', endDate: '2026-10-12', category: EMERGENCY },
        coordinator.id,
      );
      const local = await windowsService.open(
        {
          startDate: '2026-10-12',
          endDate: '2026-10-12',
          category: LOCAL_SUPPORT,
          name: 'Marathon cover',
        },
        coordinator.id,
      );
      createdWindowIds.push(emergency.id, local.id);
      return { emergency, local };
    }

    it('offers both windows on the submission screen', async () => {
      const { emergency, local } = await openTwo();

      const mine = await availability.getMine(ana.id);

      expect(mine.windows.map((window) => window.id).sort()).toEqual(
        [emergency.id, local.id].sort(),
      );
    });

    it('refuses to guess which window a submission is for', async () => {
      await openTwo();

      await expect(
        availability.submitMine(volunteer, {
          entries: [{ date: '2026-10-12', slots: [1] }],
        }),
      ).rejects.toThrow(/More than one availability window is open/);
    });

    it('keeps the same day’s answers apart per window', async () => {
      const { emergency, local } = await openTwo();

      await availability.submitMine(volunteer, {
        windowId: emergency.id,
        entries: [{ date: '2026-10-12', slots: [1] }],
      });
      await availability.submitMine(volunteer, {
        windowId: local.id,
        entries: [],
      });

      await expect(availability.getMine(ana.id, emergency.id)).resolves.toMatchObject({
        entries: [{ date: '2026-10-12', slots: [1] }],
      });
      await expect(availability.getMine(ana.id, local.id)).resolves.toMatchObject({
        entries: [],
      });
    });

    it('counts coverage per window, not across them', async () => {
      const { emergency, local } = await openTwo();
      await availability.submitMine(volunteer, {
        windowId: emergency.id,
        entries: [{ date: '2026-10-12', slots: [1] }],
      });

      const emergencyMatrix = await availability.getMatrix(emergency.id);
      const localMatrix = await availability.getMatrix(local.id);

      expect(emergencyMatrix.days[0].shifts[0].availableCount).toBe(1);
      expect(localMatrix.days[0].shifts[0].availableCount).toBe(0);
      expect(localMatrix.window.name).toBe('Marathon cover');
    });
  });

  // ── the window's shift grid ────────────────────────────────────────────────

  describe('shift grid', () => {
    it('materialises the default grid, one row per day and shift', async () => {
      const window = await openWindow();

      const rows = await prisma.availabilityWindowShift.findMany({
        where: { windowId: window.id },
        orderBy: [{ date: 'asc' }, { slot: 'asc' }],
      });

      // 5 workdays × 1 shift + Sat, Sun and the holiday Monday × 2.
      expect(rows).toHaveLength(11);
      expect(rows.filter((row) => row.date.toISOString().startsWith('2026-09-28'))).toEqual([
        expect.objectContaining({ slot: 1, startMinute: at(20), endMinute: at(24) }),
      ]);
      expect(
        rows
          .filter((row) => row.date.toISOString().startsWith('2026-10-05'))
          .map((row) => [row.slot, row.startMinute, row.endMinute]),
      ).toEqual([
        [1, at(8), at(16)],
        [2, at(16), at(24)],
      ]);
    });

    it('stores per-day shifts a coordinator defined, and reads them back', async () => {
      const window = await openCustomWindow(
        {
          startDate: '2026-09-28',
          endDate: '2026-09-30',
          days: [
            // Out of order, and with hours the default grid has no notion of.
            {
              date: '2026-09-28',
              shifts: [
                { startMinute: at(18), endMinute: at(22) },
                { startMinute: at(6), endMinute: at(10) },
              ],
            },
            { date: '2026-09-29', shifts: [{ startMinute: at(10), endMinute: at(14) }] },
            { date: '2026-09-30', shifts: [] },
          ],
        },
      );

      const calendar = await windowsService.getCalendar(window.id);

      expect(calendar.map((day) => day.shifts.map((shift) => shift.label))).toEqual([
        ['06:00–10:00', '18:00–22:00'],
        ['10:00–14:00'],
        [],
      ]);
    });

    it('accepts availability against a custom shift and shows it in the matrix', async () => {
      const window = await openCustomWindow(
        {
          startDate: '2026-09-28',
          endDate: '2026-09-28',
          days: [
            {
              date: '2026-09-28',
              shifts: [
                { startMinute: at(6), endMinute: at(12) },
                { startMinute: at(12), endMinute: at(18) },
              ],
            },
          ],
        },
      );

      await availability.submitMine(volunteer, {
        entries: [{ date: '2026-09-28', slots: [2] }],
      });

      const matrix = await availability.getMatrix(window.id);
      const [day] = matrix.days;

      expect(day.shifts.map((shift) => shift.label)).toEqual([
        '06:00–12:00',
        '12:00–18:00',
      ]);
      expect(day.shifts[0].availableUserIds).toEqual([]);
      expect(day.shifts[1].availableUserIds).toEqual([ana.id]);
      expect(day.shifts[1]).toMatchObject({ availableCount: 1, driverCount: 1 });
    });

    it('refuses a slot that does not exist in this window', async () => {
      const window = await openCustomWindow(
        {
          startDate: '2026-10-03', // a Saturday, two shifts by default
          endDate: '2026-10-03',
          days: [{ date: '2026-10-03', shifts: [{ startMinute: at(9), endMinute: at(13) }] }],
        },
      );

      await expect(
        availability.submitMine(volunteer, {
          entries: [{ date: '2026-10-03', slots: [2] }],
        }),
      ).rejects.toThrow(/Shift 2 does not exist on 2026-10-03/);
    });

    it('stores the vehicles each shift needs, and defaults them to one', async () => {
      const window = await openCustomWindow({
        startDate: '2026-09-28',
        endDate: '2026-09-29',
        days: [
          {
            date: '2026-09-28',
            shifts: [
              { startMinute: at(8), endMinute: at(16), vehiclesNeeded: 3 },
              { startMinute: at(16), endMinute: at(24), vehiclesNeeded: 0 },
            ],
          },
          // No count given: the ordinary case of one vehicle.
          { date: '2026-09-29', shifts: [{ startMinute: at(20), endMinute: at(24) }] },
        ],
      });

      const rows = await prisma.availabilityWindowShift.findMany({
        where: { windowId: window.id },
        orderBy: [{ date: 'asc' }, { slot: 'asc' }],
      });

      expect(rows.map((row) => row.vehiclesNeeded)).toEqual([3, 0, 1]);
    });

    it('gives every shift of a default-grid window one vehicle', async () => {
      const window = await openWindow();

      const rows = await prisma.availabilityWindowShift.findMany({
        where: { windowId: window.id },
      });

      expect(rows).toHaveLength(11);
      expect(rows.every((row) => row.vehiclesNeeded === 1)).toBe(true);
    });

    it('drops a window’s shift rows with the window', async () => {
      const window = await openWindow();
      await prisma.availabilityWindow.delete({ where: { id: window.id } });

      await expect(
        prisma.availabilityWindowShift.count({ where: { windowId: window.id } }),
      ).resolves.toBe(0);
      createdWindowIds.length = 0;
    });
  });

  // ── roles ──────────────────────────────────────────────────────────────────

  describe('window roles', () => {
    /** A window opened with the roles given, over dates nothing else uses. */
    async function openWithRoles(
      category: AvailabilityWindowCategory,
      roles?: Array<{ name: string; maxPeople: number }>,
    ) {
      await closeOpenWindows();
      const window = await windowsService.open(
        {
          startDate: '2026-12-01',
          endDate: '2026-12-02',
          category,
          roles,
          acknowledgeOverlap: true,
        },
        coordinator.id,
      );
      createdWindowIds.push(window.id);
      return window;
    }

    const storedRoles = (windowId: string) =>
      prisma.availabilityWindowRole.findMany({
        where: { windowId },
        orderBy: { order: 'asc' },
      });

    it('gives an Emergency window the default crew, with the driver flagged', async () => {
      const window = await openWithRoles(EMERGENCY);

      expect(
        (await storedRoles(window.id)).map((role) => [
          role.name,
          role.maxPeople,
          role.requiresDriverCertification,
        ]),
      ).toEqual([
        ['Driver', 1, true],
        ['Team Leader', 1, false],
        ['Team Member', 1, false],
      ]);
      expect(window.roles?.map((role) => role.name)).toEqual([
        'Driver',
        'Team Leader',
        'Team Member',
      ]);
    });

    it('opens another category with no roles until it asks for some', async () => {
      const window = await openWithRoles(LOCAL_SUPPORT);
      expect(await storedRoles(window.id)).toEqual([]);
      expect(window.roles).toEqual([]);
    });

    it('stores roles a coordinator defined, unlimited ones included', async () => {
      const window = await openWithRoles(SALOP_SUPPORT, [
        { name: 'Driver', maxPeople: 2 },
        { name: 'Stretcher bearer', maxPeople: 0 },
      ]);

      const reloaded = await windowsService.findOne(window.id);
      expect(reloaded.roles).toEqual([
        expect.objectContaining({
          name: 'Driver',
          maxPeople: 2,
          requiresDriverCertification: true,
          order: 0,
        }),
        expect.objectContaining({
          name: 'Stretcher bearer',
          maxPeople: 0,
          requiresDriverCertification: false,
          order: 1,
        }),
      ]);
    });

    it('refuses two roles a schedule could not tell apart, writing no window', async () => {
      await closeOpenWindows();
      const before = await prisma.availabilityWindow.count();

      await expect(
        openWithRoles(LOCAL_SUPPORT, [
          { name: 'Driver', maxPeople: 1 },
          { name: 'driver', maxPeople: 1 },
        ]),
      ).rejects.toThrow(BadRequestException);

      expect(await prisma.availabilityWindow.count()).toBe(before);
    });

    it('refuses a duplicate name at the database level too', async () => {
      const window = await openWithRoles(LOCAL_SUPPORT, [{ name: 'Radio', maxPeople: 1 }]);

      await expect(
        prisma.availabilityWindowRole.create({
          data: { windowId: window.id, name: 'Radio', maxPeople: 2, order: 1 },
        }),
      ).rejects.toThrow();
    });

    it('drops a window’s roles with the window', async () => {
      const window = await openWithRoles(EMERGENCY);
      await prisma.availabilityWindow.delete({ where: { id: window.id } });

      await expect(
        prisma.availabilityWindowRole.count({ where: { windowId: window.id } }),
      ).resolves.toBe(0);
      createdWindowIds.length = 0;
    });

    it('leaves roles out of what a volunteer is asked for', async () => {
      // Availability is collected without them: the coordinator assigns roles
      // when the schedule is built, so nothing here should depend on them.
      const window = await openWithRoles(EMERGENCY);

      const mine = await availability.getMine(ana.id, window.id);

      expect(mine.calendar.every((day) => !('roles' in day))).toBe(true);
      expect(mine.canSubmit).toBe(true);
    });
  });

  // ── whole-month windows ────────────────────────────────────────────────────

  describe('month windows', () => {
    it('spans the 1st to the last day of the month on the default grid', async () => {
      await closeOpenWindows();

      const window = await windowsService.openMonth({ year: 2026, month: 11 }, coordinator.id);
      createdWindowIds.push(window.id);

      expect(window.startDate).toBe('2026-11-01');
      expect(window.endDate).toBe('2026-11-30');

      const calendar = await windowsService.getCalendar(window.id);
      expect(calendar).toHaveLength(30);
      // 1 Nov 2026 is a Sunday; 2 Nov a Monday.
      expect(calendar[0].shifts.map((shift) => shift.label)).toEqual([
        '08:00–16:00',
        '16:00–24:00',
      ]);
      expect(calendar[1].shifts.map((shift) => shift.label)).toEqual(['20:00–24:00']);
    });

    it('is blocked by an open Emergency window inside that month', async () => {
      await openWindow('2026-12-14', '2026-12-20');

      await expect(
        windowsService.openMonth({ year: 2026, month: 12 }, coordinator.id),
      ).rejects.toThrow(ConflictException);
    });

    it('is not blocked by an open window of another category', async () => {
      await openWindow('2026-12-14', '2026-12-20', { category: LOCAL_SUPPORT });

      const window = await windowsService.openMonth({ year: 2026, month: 12 }, coordinator.id);
      createdWindowIds.push(window.id);

      expect(window).toMatchObject({ category: EMERGENCY, name: 'Emergency - December' });
    });
  });

  // ── submission ─────────────────────────────────────────────────────────────

  describe('submission', () => {
    it('persists one row per selected day and shift', async () => {
      const window = await openWindow();

      await availability.submitMine(volunteer, {
        entries: [
          { date: '2026-09-28', slots: [1] },
          { date: '2026-10-03', slots: [1, 2] },
          { date: HOLIDAY_DATE, slots: [1] },
        ],
      });

      const rows = await prisma.availabilitySubmission.findMany({
        where: { windowId: window.id, userId: ana.id },
        orderBy: [{ date: 'asc' }, { slot: 'asc' }],
      });

      expect(rows).toHaveLength(4);
      expect(rows.map((row) => row.date.toISOString().slice(0, 10))).toEqual([
        '2026-09-28',
        '2026-10-03',
        '2026-10-03',
        HOLIDAY_DATE,
      ]);
    });

    it('rejects a duplicate row at the database level', async () => {
      const window = await openWindow();
      await availability.submitMine(volunteer, {
        entries: [{ date: '2026-09-28', slots: [1] }],
      });

      await expect(
        prisma.availabilitySubmission.create({
          data: {
            userId: ana.id,
            windowId: window.id,
            date: new Date('2026-09-28T00:00:00.000Z'),
            slot: 1,
          },
        }),
      ).rejects.toThrow(/Unique constraint/);
    });

    it('amends a submission: removed shifts go, added shifts arrive, kept shifts stay', async () => {
      await openWindow();

      await availability.submitMine(volunteer, {
        entries: [
          { date: '2026-09-28', slots: [1] },
          { date: '2026-09-29', slots: [1] },
        ],
      });
      const before = await availability.getMine(ana.id);
      const keptId = (
        await prisma.availabilitySubmission.findFirst({
          where: { userId: ana.id, date: new Date('2026-09-28T00:00:00.000Z') },
        })
      )?.id;

      await availability.submitMine(volunteer, {
        entries: [
          { date: '2026-09-28', slots: [1] }, // kept
          { date: '2026-09-30', slots: [1] }, // added
        ],
      });
      const after = await availability.getMine(ana.id);

      expect(before.entries.map((entry) => entry.date)).toEqual(['2026-09-28', '2026-09-29']);
      expect(after.entries.map((entry) => entry.date)).toEqual(['2026-09-28', '2026-09-30']);

      // The untouched row keeps its identity rather than being deleted and re-created.
      const stillThere = await prisma.availabilitySubmission.findFirst({
        where: { userId: ana.id, date: new Date('2026-09-28T00:00:00.000Z') },
      });
      expect(stillThere?.id).toBe(keptId);
    });

    it('rejects a shift that does not exist on that day', async () => {
      await openWindow();

      // A workday has one shift, so slot 2 is not a thing there.
      await expect(
        availability.submitMine(volunteer, {
          entries: [{ date: '2026-09-28', slots: [2] }],
        }),
      ).rejects.toThrow(/does not exist on 2026-09-28/);

      const rows = await prisma.availabilitySubmission.count({ where: { userId: ana.id } });
      expect(rows).toBe(0);
    });

    it('rejects a date outside the window', async () => {
      await openWindow();

      await expect(
        availability.submitMine(volunteer, {
          entries: [{ date: '2026-10-06', slots: [1] }],
        }),
      ).rejects.toThrow(/outside the availability window/);
    });

    it('blocks submissions once the window is closed, and writes nothing', async () => {
      const window = await openWindow();
      await availability.submitMine(volunteer, {
        entries: [{ date: '2026-09-28', slots: [1] }],
      });
      await windowsService.close(window.id, coordinator.id);

      await expect(
        availability.submitMine(volunteer, {
          entries: [{ date: '2026-09-29', slots: [1] }],
        }),
      ).rejects.toThrow(ForbiddenException);

      const rows = await prisma.availabilitySubmission.findMany({
        where: { windowId: window.id, userId: ana.id },
      });
      expect(rows).toHaveLength(1); // the pre-close submission, unchanged
    });

    it('still shows a volunteer their final submissions after close, read-only', async () => {
      const window = await openWindow();
      await availability.submitMine(volunteer, {
        entries: [{ date: '2026-09-28', slots: [1] }],
      });
      await windowsService.close(window.id, coordinator.id);

      const mine = await availability.getMine(ana.id);

      expect(mine.window?.id).toBe(window.id);
      expect(mine.canSubmit).toBe(false);
      expect(mine.entries).toEqual([
        { date: '2026-09-28', slots: [1] },
      ]);
    });
  });

  // ── decline ────────────────────────────────────────────────────────────────

  describe('decline', () => {
    it('clears submitted shifts and records the decline', async () => {
      const window = await openWindow();
      await availability.submitMine(volunteer, {
        entries: [{ date: '2026-09-28', slots: [1] }],
      });

      const result = await availability.declineMine(volunteer);

      expect(result.declined).toBe(true);
      expect(result.entries).toEqual([]);
      await expect(
        prisma.availabilitySubmission.count({ where: { windowId: window.id, userId: ana.id } }),
      ).resolves.toBe(0);
      await expect(
        prisma.availabilityResponse.findUnique({
          where: { windowId_userId: { windowId: window.id, userId: ana.id } },
        }),
      ).resolves.toMatchObject({ status: 'DECLINED' });
    });

    it('is idempotent', async () => {
      await openWindow();

      await availability.declineMine(volunteer);
      await expect(availability.declineMine(volunteer)).resolves.toMatchObject({
        declined: true,
      });
    });

    it('is undone by submitting a shift again', async () => {
      const window = await openWindow();
      await availability.declineMine(volunteer);

      const result = await availability.submitMine(volunteer, {
        entries: [{ date: '2026-09-28', slots: [1] }],
      });

      expect(result.declined).toBe(false);
      await expect(
        prisma.availabilityResponse.count({ where: { windowId: window.id, userId: ana.id } }),
      ).resolves.toBe(0);
    });

    it('is undone explicitly, returning to "not yet responded"', async () => {
      const window = await openWindow();
      await availability.declineMine(volunteer);

      const result = await availability.undeclineMine(volunteer);

      expect(result.declined).toBe(false);
      await expect(
        prisma.availabilityResponse.count({ where: { windowId: window.id, userId: ana.id } }),
      ).resolves.toBe(0);
    });
  });

  // ── coverage matrix ────────────────────────────────────────────────────────

  describe('coverage matrix', () => {
    /**
     * Sat 2026-10-03 morning  → Ana(D), Bruno(D), Carla         → 3/2 → green
     * Sat 2026-10-03 afternoon→ Carla                            → 1/0 → red
     * Sun 2026-10-04 morning  → Ana(D), Carla                    → 2/1 → yellow
     * Mon 2026-09-28 evening  → Ana(D), Bruno(D), Carla, Rui      → 4/2 → green
     */
    async function seedSubmissions() {
      await openWindow();
      await availability.submitMine(
        { id: ana.id, role: UserRole.EMERGENCY_OPERATIONAL },
        {
          entries: [
            { date: '2026-09-28', slots: [1] },
            { date: '2026-10-03', slots: [1] },
            { date: '2026-10-04', slots: [1] },
          ],
        },
      );
      await availability.submitMine(
        { id: bruno.id, role: UserRole.EMERGENCY_OPERATIONAL },
        {
          entries: [
            { date: '2026-09-28', slots: [1] },
            { date: '2026-10-03', slots: [1] },
          ],
        },
      );
      await availability.submitMine(
        { id: carla.id, role: UserRole.EMERGENCY_OPERATIONAL },
        {
          entries: [
            { date: '2026-09-28', slots: [1] },
            { date: '2026-10-03', slots: [1, 2] },
            { date: '2026-10-04', slots: [1] },
          ],
        },
      );
      await availability.submitMine(
        { id: rui.id, role: UserRole.EMERGENCY_OPERATIONAL },
        { entries: [{ date: '2026-09-28', slots: [1] }] },
      );
      // Marta declines; the inactive user and the logistics coordinator submit
      // nothing and must not appear on the roster at all.
      await availability.declineMine({ id: marta.id, role: UserRole.EMERGENCY_OPERATIONAL });
    }

    it('counts availability and drivers per shift with the right coverage colour', async () => {
      await seedSubmissions();

      const matrix = await availability.getMatrix();
      const byDate = Object.fromEntries(matrix.days.map((day) => [day.date, day]));

      expect(byDate['2026-09-28'].shifts[0]).toMatchObject({
        slot: 1,
        availableCount: 4,
        driverCount: 2,
        coverageLevel: 'green',
      });
      expect(byDate['2026-10-03'].shifts[0]).toMatchObject({
        availableCount: 3,
        driverCount: 2,
        coverageLevel: 'green',
      });
      expect(byDate['2026-10-03'].shifts[1]).toMatchObject({
        availableCount: 1,
        driverCount: 0,
        coverageLevel: 'red',
      });
      expect(byDate['2026-10-04'].shifts[0]).toMatchObject({
        availableCount: 2,
        driverCount: 1,
        coverageLevel: 'yellow',
      });
    });

    it('applies the 1-shift/2-shift split across weekdays, weekend and holiday', async () => {
      await seedSubmissions();

      const matrix = await availability.getMatrix();

      expect(matrix.days.map((day) => day.shifts.length)).toEqual([1, 1, 1, 1, 1, 2, 2, 2]);
      const holiday = matrix.days.find((day) => day.date === HOLIDAY_DATE);
      expect(holiday).toMatchObject({ isHoliday: true, isWeekend: false });
      expect(holiday?.shifts).toHaveLength(2);
    });

    it('tracks submitted / declined / not-yet-responded per person', async () => {
      await seedSubmissions();

      const matrix = await availability.getMatrix();
      const statusById = Object.fromEntries(
        matrix.personnel.map((person) => [person.id, person.responseStatus]),
      );

      expect(statusById[ana.id]).toBe('submitted');
      expect(statusById[carla.id]).toBe('submitted');
      expect(statusById[marta.id]).toBe('declined');
      expect(statusById[coordinator.id]).toBe('pending');
      expect(matrix.responseStats.submitted).toBeGreaterThanOrEqual(4);
      expect(matrix.responseStats.declined).toBeGreaterThanOrEqual(1);
      expect(
        matrix.responseStats.submitted +
          matrix.responseStats.declined +
          matrix.responseStats.pending,
      ).toBe(matrix.responseStats.total);
    });

    it('excludes deactivated users and roles that cannot submit', async () => {
      await seedSubmissions();

      const matrix = await availability.getMatrix();
      const ids = matrix.personnel.map((person) => person.id);

      expect(ids).toContain(ana.id);
      expect(ids).toContain(coordinator.id); // coordinators submit their own too
      expect(ids).toContain(systemAdmin.id); // admins can submit, so they count
      expect(ids).not.toContain(inactive.id);
      expect(ids).not.toContain(logistics.id);
    });

    it('shows a system admin their own saved availability in the matrix', async () => {
      await openWindow();
      await availability.submitMine(
        { id: systemAdmin.id, role: UserRole.SYSTEM_ADMIN },
        { entries: [{ date: '2026-09-28', slots: [1] }] },
      );

      const matrix = await availability.getMatrix();
      const monday = matrix.days.find((day) => day.date === '2026-09-28')!;

      expect(monday.shifts[0].availableUserIds).toContain(systemAdmin.id);
      expect(monday.shifts[0].availableCount).toBe(1);
      expect(monday.shifts[0].driverCount).toBe(1);
      expect(
        matrix.personnel.find((person) => person.id === systemAdmin.id)?.responseStatus,
      ).toBe('submitted');
    });

    it('needs a driver per vehicle before a shift counts as covered', async () => {
      // Same three people on both shifts of one day; the shifts differ only in
      // how many vehicles they need.
      const window = await openCustomWindow({
        startDate: '2026-10-12',
        endDate: '2026-10-12',
        days: [
          {
            date: '2026-10-12',
            shifts: [
              { startMinute: at(8), endMinute: at(16), vehiclesNeeded: 2 },
              { startMinute: at(16), endMinute: at(24), vehiclesNeeded: 3 },
            ],
          },
        ],
      });
      for (const person of [ana, bruno, carla]) {
        await availability.submitMine(
          { id: person.id, role: UserRole.EMERGENCY_OPERATIONAL },
          { windowId: window.id, entries: [{ date: '2026-10-12', slots: [1, 2] }] },
        );
      }

      const [day] = (await availability.getMatrix(window.id)).days;

      // Ana and Bruno drive, Carla does not: two vehicles are covered, three are not.
      expect(day.shifts[0]).toMatchObject({
        vehiclesNeeded: 2,
        availableCount: 3,
        driverCount: 2,
        coverageLevel: 'green',
      });
      expect(day.shifts[1]).toMatchObject({
        vehiclesNeeded: 3,
        driverCount: 2,
        coverageLevel: 'yellow',
      });
    });

    it('exports the same numbers as CSV', async () => {
      await seedSubmissions();

      const csv = await availability.getMatrixCsv();
      const lines = csv.split('\n');

      expect(lines[0]).toBe(
        'date,dayType,holiday,shift,vehiclesNeeded,availableCount,driverCount,coverage,available',
      );
      expect(
        lines.some((line) =>
          line.startsWith('2026-09-28,workday,,20:00–24:00,1,4,2,green,'),
        ),
      ).toBe(true);
      expect(
        lines.some((line) =>
          line.startsWith(`${HOLIDAY_DATE},holiday,Implantação da República,`),
        ),
      ).toBe(true);
    });

    it('reads a closed window as a historical view', async () => {
      await seedSubmissions();
      const active = await windowsService.findActive();
      await windowsService.close(active!.id, coordinator.id);

      const matrix = await availability.getMatrix(active!.id);

      expect(matrix.window.status).toBe(AvailabilityWindowStatus.CLOSED);
      expect(matrix.days).toHaveLength(8);
    });

    it('throws when no window has ever been opened', async () => {
      // beforeEach removed every window this suite created; any window from
      // other data in the database would make this assertion meaningless, so
      // only run the check when the table is genuinely empty.
      const remaining = await prisma.availabilityWindow.count();
      if (remaining > 0) return;

      await expect(availability.getMatrix()).rejects.toThrow(NotFoundException);
    });
  });

  // ── ownership ──────────────────────────────────────────────────────────────

  describe('ownership', () => {
    it('lets a coordinator read a volunteer’s availability', async () => {
      await openWindow();
      await availability.submitMine(volunteer, {
        entries: [{ date: '2026-09-28', slots: [1] }],
      });

      const seen = await availability.getForUser(ana.id, coordinatorUser);

      expect(seen.entries).toEqual([{ date: '2026-09-28', slots: [1] }]);
    });

    it('stops a volunteer reading another volunteer’s availability', async () => {
      await openWindow();

      await expect(availability.getForUser(bruno.id, volunteer)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lets a volunteer read their own', async () => {
      await openWindow();

      await expect(availability.getForUser(ana.id, volunteer)).resolves.toMatchObject({
        canSubmit: true,
      });
    });
  });

  // ── holidays ───────────────────────────────────────────────────────────────

  describe('holidays', () => {
    it('turns a plain weekday into a two-shift day by default, and back when removed', async () => {
      const target = '2026-11-11'; // a Wednesday
      const EVENING = [{ startMinute: at(20), endMinute: at(24), vehiclesNeeded: 1 }];
      const SPECIAL = [
        { startMinute: at(8), endMinute: at(16), vehiclesNeeded: 1 },
        { startMinute: at(16), endMinute: at(24), vehiclesNeeded: 1 },
      ];

      await expect(shiftSchedule.getDefaultShiftsForDate(target)).resolves.toEqual(EVENING);

      const holiday = await holidaysService.create({ date: target, name: `Test ${RUN}` });
      await expect(shiftSchedule.getDefaultShiftsForDate(target)).resolves.toEqual(SPECIAL);

      await holidaysService.remove(holiday.id);
      await expect(shiftSchedule.getDefaultShiftsForDate(target)).resolves.toEqual(EVENING);
    });

    it('does not change the shifts of a window already open', async () => {
      // The window materialises its grid when it opens, so a holiday declared
      // afterwards cannot invalidate availability people already submitted.
      const target = '2026-11-11'; // a Wednesday inside the window below
      const window = await openWindow('2026-11-09', '2026-11-13');
      await availability.submitMine(volunteer, { entries: [{ date: target, slots: [1] }] });

      const holiday = await holidaysService.create({ date: target, name: `Test ${RUN}` });
      try {
        const calendar = await windowsService.getCalendar(window.id);
        const day = calendar.find((entry) => entry.date === target)!;

        expect(day.shifts.map((shift) => shift.label)).toEqual(['20:00–24:00']);
        // The day is still flagged as a holiday for display purposes.
        expect(day.isHoliday).toBe(true);
        await expect(availability.getMine(ana.id)).resolves.toMatchObject({
          entries: [{ date: target, slots: [1] }],
        });
      } finally {
        await holidaysService.remove(holiday.id);
      }
    });

    it('rejects a second holiday on the same date', async () => {
      const target = '2026-11-12';
      const holiday = await holidaysService.create({ date: target, name: `Test ${RUN}` });

      try {
        await expect(
          holidaysService.create({ date: target, name: 'Duplicate' }),
        ).rejects.toThrow(ConflictException);
      } finally {
        await holidaysService.remove(holiday.id);
      }
    });
  });
});
