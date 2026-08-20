import { PrismaClient } from '@prisma/client';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService, RequestUser } from './availability.service';
import { AvailabilityWindowsService } from './availability-windows.service';
import { HolidaysService } from './holidays.service';
import { ShiftScheduleService } from './shift-schedule.service';
import { AvailabilityWindowStatus, ShiftCode, UserRole } from '@redinfo/shared';

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

  /** Open a fresh window, closing any window left open by a previous test. */
  async function openWindow(start = WINDOW_START, end = WINDOW_END) {
    const stale = await windowsService.findActive();
    if (stale) await windowsService.close(stale.id, coordinator.id);
    const window = await windowsService.open(
      { startDate: start, endDate: end },
      coordinator.id,
    );
    createdWindowIds.push(window.id);
    return window;
  }

  beforeAll(async () => {
    await prisma.$connect();

    holidaysService = new HolidaysService(prisma);
    shiftSchedule = new ShiftScheduleService(holidaysService);
    windowsService = new AvailabilityWindowsService(prisma);
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

    it('rejects opening a second window while one is open', async () => {
      await openWindow();

      await expect(
        windowsService.open({ startDate: '2026-10-12', endDate: '2026-10-19' }, coordinator.id),
      ).rejects.toThrow(ConflictException);
    });

    it('allows opening the next window once the current one is closed', async () => {
      const first = await openWindow();
      await windowsService.close(first.id, coordinator.id);

      const second = await windowsService.open(
        { startDate: '2026-10-12', endDate: '2026-10-19' },
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

  // ── submission ─────────────────────────────────────────────────────────────

  describe('submission', () => {
    it('persists one row per selected day and shift', async () => {
      const window = await openWindow();

      await availability.submitMine(volunteer, {
        entries: [
          { date: '2026-09-28', shiftCodes: [ShiftCode.EVENING] },
          { date: '2026-10-03', shiftCodes: [ShiftCode.MORNING, ShiftCode.AFTERNOON] },
          { date: HOLIDAY_DATE, shiftCodes: [ShiftCode.MORNING] },
        ],
      });

      const rows = await prisma.availabilitySubmission.findMany({
        where: { windowId: window.id, userId: ana.id },
        orderBy: [{ date: 'asc' }, { shiftCode: 'asc' }],
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
        entries: [{ date: '2026-09-28', shiftCodes: [ShiftCode.EVENING] }],
      });

      await expect(
        prisma.availabilitySubmission.create({
          data: {
            userId: ana.id,
            windowId: window.id,
            date: new Date('2026-09-28T00:00:00.000Z'),
            shiftCode: ShiftCode.EVENING,
          },
        }),
      ).rejects.toThrow(/Unique constraint/);
    });

    it('amends a submission: removed shifts go, added shifts arrive, kept shifts stay', async () => {
      await openWindow();

      await availability.submitMine(volunteer, {
        entries: [
          { date: '2026-09-28', shiftCodes: [ShiftCode.EVENING] },
          { date: '2026-09-29', shiftCodes: [ShiftCode.EVENING] },
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
          { date: '2026-09-28', shiftCodes: [ShiftCode.EVENING] }, // kept
          { date: '2026-09-30', shiftCodes: [ShiftCode.EVENING] }, // added
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

      await expect(
        availability.submitMine(volunteer, {
          entries: [{ date: '2026-09-28', shiftCodes: [ShiftCode.MORNING] }],
        }),
      ).rejects.toThrow(/does not exist on 2026-09-28/);

      const rows = await prisma.availabilitySubmission.count({ where: { userId: ana.id } });
      expect(rows).toBe(0);
    });

    it('rejects a date outside the window', async () => {
      await openWindow();

      await expect(
        availability.submitMine(volunteer, {
          entries: [{ date: '2026-10-06', shiftCodes: [ShiftCode.EVENING] }],
        }),
      ).rejects.toThrow(/outside the availability window/);
    });

    it('blocks submissions once the window is closed, and writes nothing', async () => {
      const window = await openWindow();
      await availability.submitMine(volunteer, {
        entries: [{ date: '2026-09-28', shiftCodes: [ShiftCode.EVENING] }],
      });
      await windowsService.close(window.id, coordinator.id);

      await expect(
        availability.submitMine(volunteer, {
          entries: [{ date: '2026-09-29', shiftCodes: [ShiftCode.EVENING] }],
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
        entries: [{ date: '2026-09-28', shiftCodes: [ShiftCode.EVENING] }],
      });
      await windowsService.close(window.id, coordinator.id);

      const mine = await availability.getMine(ana.id);

      expect(mine.window?.id).toBe(window.id);
      expect(mine.canSubmit).toBe(false);
      expect(mine.entries).toEqual([
        { date: '2026-09-28', shiftCodes: [ShiftCode.EVENING] },
      ]);
    });
  });

  // ── decline ────────────────────────────────────────────────────────────────

  describe('decline', () => {
    it('clears submitted shifts and records the decline', async () => {
      const window = await openWindow();
      await availability.submitMine(volunteer, {
        entries: [{ date: '2026-09-28', shiftCodes: [ShiftCode.EVENING] }],
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
        entries: [{ date: '2026-09-28', shiftCodes: [ShiftCode.EVENING] }],
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
            { date: '2026-09-28', shiftCodes: [ShiftCode.EVENING] },
            { date: '2026-10-03', shiftCodes: [ShiftCode.MORNING] },
            { date: '2026-10-04', shiftCodes: [ShiftCode.MORNING] },
          ],
        },
      );
      await availability.submitMine(
        { id: bruno.id, role: UserRole.EMERGENCY_OPERATIONAL },
        {
          entries: [
            { date: '2026-09-28', shiftCodes: [ShiftCode.EVENING] },
            { date: '2026-10-03', shiftCodes: [ShiftCode.MORNING] },
          ],
        },
      );
      await availability.submitMine(
        { id: carla.id, role: UserRole.EMERGENCY_OPERATIONAL },
        {
          entries: [
            { date: '2026-09-28', shiftCodes: [ShiftCode.EVENING] },
            { date: '2026-10-03', shiftCodes: [ShiftCode.MORNING, ShiftCode.AFTERNOON] },
            { date: '2026-10-04', shiftCodes: [ShiftCode.MORNING] },
          ],
        },
      );
      await availability.submitMine(
        { id: rui.id, role: UserRole.EMERGENCY_OPERATIONAL },
        { entries: [{ date: '2026-09-28', shiftCodes: [ShiftCode.EVENING] }] },
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
        shiftCode: ShiftCode.EVENING,
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
        { entries: [{ date: '2026-09-28', shiftCodes: [ShiftCode.EVENING] }] },
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

    it('exports the same numbers as CSV', async () => {
      await seedSubmissions();

      const csv = await availability.getMatrixCsv();
      const lines = csv.split('\n');

      expect(lines[0]).toBe(
        'date,dayType,holiday,shift,availableCount,driverCount,coverage,available',
      );
      expect(lines.some((line) => line.startsWith('2026-09-28,workday,,20:00–24:00,4,2,green,'))).toBe(
        true,
      );
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
        entries: [{ date: '2026-09-28', shiftCodes: [ShiftCode.EVENING] }],
      });

      const seen = await availability.getForUser(ana.id, coordinatorUser);

      expect(seen.entries).toEqual([{ date: '2026-09-28', shiftCodes: [ShiftCode.EVENING] }]);
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
    it('turns a plain weekday into a two-shift day, and back when removed', async () => {
      const target = '2026-11-11'; // a Wednesday
      await expect(shiftSchedule.getShiftsForDate(target)).resolves.toEqual([
        ShiftCode.EVENING,
      ]);

      const holiday = await holidaysService.create({ date: target, name: `Test ${RUN}` });
      await expect(shiftSchedule.getShiftsForDate(target)).resolves.toEqual([
        ShiftCode.MORNING,
        ShiftCode.AFTERNOON,
      ]);

      await holidaysService.remove(holiday.id);
      await expect(shiftSchedule.getShiftsForDate(target)).resolves.toEqual([
        ShiftCode.EVENING,
      ]);
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
