import { PrismaClient } from '@prisma/client';
import { AvailabilityWindowCategory, UserRole, VolunteerHoursStatus } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../availability/holidays.service';
import { ShiftScheduleService } from '../availability/shift-schedule.service';
import { AvailabilityWindowsService } from '../availability/availability-windows.service';
import { SchedulesService } from '../schedules/schedules.service';
import { ScheduleAssignmentsService } from '../schedules/schedule-assignments.service';
import { VolunteerHoursService } from './volunteer-hours.service';
import { VolunteerHoursSummaryService } from './volunteer-hours-summary.service';

/**
 * Integration coverage for volunteer-hours generation (#164), against a real
 * Postgres — the same DB the rest of the suite shares.
 *
 * Skipped unless DATABASE_URL is set, and named so `test:integration` selects
 * it. Exception detection's own DST-aware timestamp math and the pure
 * generation rules are covered by unit tests against a fake Prisma; this
 * suite is about the parts only a real database proves: the `mandatoryCount`
 * migration round-trips, and generation/review actually persist through the
 * real schema.
 */
const describeIntegration = process.env.DATABASE_URL ? describe : describe.skip;

const RUN = `it-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const email = (local: string) => `${local}.${RUN}@volunteer-hours.test`;

/**
 * Days before today, as `YYYY-MM-DD`. Computed relative to the real clock
 * rather than a literal date: generation needs these in the past, but the
 * 30-day auto-approve grace period (`VOLUNTEER_HOURS_AUTO_APPROVE_GRACE_DAYS`)
 * needs them to stay well short of that, however long from now this suite
 * happens to run.
 */
function daysAgo(n: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - n);
  return date.toISOString().slice(0, 10);
}

const DAY_ONE = daysAgo(10);
const DAY_TWO = daysAgo(9);

describeIntegration('Volunteer hours module (integration)', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;

  let holidays: HolidaysService;
  let shiftSchedule: ShiftScheduleService;
  let windows: AvailabilityWindowsService;
  let schedules: SchedulesService;
  let assignments: ScheduleAssignmentsService;
  let volunteerHours: VolunteerHoursService;
  let summary: VolunteerHoursSummaryService;

  let ana: { id: string };
  let bruno: { id: string };
  let carla: { id: string };
  let coordinator: { id: string };

  const createdWindowIds: string[] = [];

  async function createUser(firstName: string, lastName: string, role: UserRole) {
    return prisma.user.create({
      data: { email: email(`${firstName}.${lastName}`.toLowerCase()), firstName, lastName, role },
      select: { id: true },
    });
  }

  async function openWindow() {
    const window = await windows.open(
      {
        startDate: DAY_ONE,
        endDate: DAY_TWO,
        category: AvailabilityWindowCategory.EMERGENCY,
        name: `Volunteer hours ${RUN}`,
        acknowledgeOverlap: true,
        // Certification requirements are unrelated to what this suite is
        // testing — explicitly none, rather than giving every fixture user a
        // matching certification just to be assignable.
        roles: [
          { name: 'Driver', maxPeople: 1, mandatoryCount: 1, requiredCertification: null },
          { name: 'Team Leader', maxPeople: 1, mandatoryCount: 1, requiredCertification: null },
          { name: 'Team Member', maxPeople: 1, mandatoryCount: 0, requiredCertification: null },
        ],
        days: [
          { date: DAY_ONE, shifts: [{ startMinute: 1200, endMinute: 1440, vehiclesNeeded: 1 }] },
          { date: DAY_TWO, shifts: [{ startMinute: 1200, endMinute: 1440, vehiclesNeeded: 1 }] },
        ],
      },
      coordinator.id,
    );
    createdWindowIds.push(window.id);
    return window;
  }

  const roleId = (window: { roles?: Array<{ id: string; name: string }> }, name: string) =>
    window.roles!.find((role) => role.name === name)!.id;

  beforeAll(async () => {
    await prisma.$connect();

    holidays = new HolidaysService(prisma);
    shiftSchedule = new ShiftScheduleService(holidays, prisma);
    windows = new AvailabilityWindowsService(prisma, shiftSchedule);
    schedules = new SchedulesService(prisma, shiftSchedule);
    assignments = new ScheduleAssignmentsService(prisma, schedules, shiftSchedule);
    volunteerHours = new VolunteerHoursService(prisma, shiftSchedule);
    summary = new VolunteerHoursSummaryService(prisma, volunteerHours);

    [ana, bruno, carla, coordinator] = await Promise.all([
      createUser('Ana', 'Silva', UserRole.EMERGENCY_OPERATIONAL),
      createUser('Bruno', 'Costa', UserRole.EMERGENCY_OPERATIONAL),
      createUser('Carla', 'Ferreira', UserRole.EMERGENCY_OPERATIONAL),
      createUser('Maria', 'Santos', UserRole.EMERGENCY_COORDINATOR),
    ]);
  });

  function volunteerIds(): string[] {
    return [ana, bruno, carla, coordinator].map((u) => u?.id).filter(Boolean) as string[];
  }

  /**
   * Each test opens its own window over the same two dates; an OPEN window
   * blocks another one over overlapping dates in the same category
   * regardless of `acknowledgeOverlap` (see `AvailabilityWindow.open`'s own
   * doc comment), so every test starts from a clean slate. Volunteer-hours
   * entries are `SetNull`, not cascaded, from the assignment/schedule they
   * came from — deleting the window alone would leave a previous test's
   * entries around with the link merely cleared, still visible to
   * `getMyHours` and contaminating the next test's counts.
   */
  async function cleanup() {
    const userIds = volunteerIds();
    if (userIds.length) {
      await prisma.volunteerHoursEntry.deleteMany({ where: { userId: { in: userIds } } });
    }
    if (createdWindowIds.length) {
      await prisma.availabilityWindow.deleteMany({ where: { id: { in: createdWindowIds } } });
      createdWindowIds.length = 0;
    }
  }

  beforeEach(cleanup);

  afterAll(async () => {
    await cleanup();
    const userIds = volunteerIds();
    if (userIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.$disconnect();
  });

  it('integration: persists mandatoryCount through the schema, distinct per role', async () => {
    const window = await openWindow();
    expect(window.roles!.find((r) => r.name === 'Driver')!.mandatoryCount).toBe(1);
    expect(window.roles!.find((r) => r.name === 'Team Leader')!.mandatoryCount).toBe(1);
    expect(window.roles!.find((r) => r.name === 'Team Member')!.mandatoryCount).toBe(0);
  });

  it('integration: generates a clean entry per person once mandatory posts are filled, pool seat included', async () => {
    const window = await openWindow();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);

    await assignments.assign(
      schedule.id,
      { date: DAY_ONE, slot: 1, userId: ana.id, roleId: roleId(window, 'Driver') },
      coordinator.id,
    );
    await assignments.assign(
      schedule.id,
      { date: DAY_ONE, slot: 1, userId: bruno.id, roleId: roleId(window, 'Team Leader') },
      coordinator.id,
    );
    await assignments.assign(
      schedule.id,
      { date: DAY_ONE, slot: 1, userId: carla.id, roleId: roleId(window, 'Team Member') },
      coordinator.id,
    );
    await schedules.publish(schedule.id, coordinator.id);

    const [anaHours, brunoHours, carlaHours] = await Promise.all([
      volunteerHours.getMyHours(ana.id),
      volunteerHours.getMyHours(bruno.id),
      volunteerHours.getMyHours(carla.id),
    ]);

    for (const hours of [anaHours, brunoHours, carlaHours]) {
      expect(hours.entries).toHaveLength(1);
      expect(hours.entries[0]).toMatchObject({
        source: 'SCHEDULED',
        activityType: 'EMERGENCY',
        baselineMinutes: 240,
        proposedMinutes: 240,
        minutes: 240,
        flags: [],
        status: VolunteerHoursStatus.PENDING,
      });
    }
  });

  it('integration: generates nothing at all for a shift missing a mandatory post', async () => {
    const window = await openWindow();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);

    // Only the Driver post filled on day two — Team Leader is mandatory and
    // empty, so the shift most likely did not run.
    await assignments.assign(
      schedule.id,
      { date: DAY_TWO, slot: 1, userId: ana.id, roleId: roleId(window, 'Driver') },
      coordinator.id,
    );
    await schedules.publish(schedule.id, coordinator.id);

    const { entries } = await volunteerHours.getMyHours(ana.id);
    expect(entries).toHaveLength(0);
  });

  it('integration: a coordinator reviews the queue and corrects an entry', async () => {
    const window = await openWindow();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);
    await assignments.assign(
      schedule.id,
      { date: DAY_ONE, slot: 1, userId: ana.id, roleId: roleId(window, 'Driver') },
      coordinator.id,
    );
    await assignments.assign(
      schedule.id,
      { date: DAY_ONE, slot: 1, userId: bruno.id, roleId: roleId(window, 'Team Leader') },
      coordinator.id,
    );
    await schedules.publish(schedule.id, coordinator.id);

    const { data: pending } = await volunteerHours.getReviewQueue({});
    const anaEntry = pending.find((e) => e.userId === ana.id)!;
    expect(anaEntry).toBeDefined();

    const approved = await volunteerHours.approve(anaEntry.id, coordinator.id, {
      minutes: 180,
      correctionReason: 'Left an hour early, confirmed by phone.',
    });
    expect(approved.status).toBe(VolunteerHoursStatus.APPROVED);
    expect(approved.minutes).toBe(180);
    expect(approved.correctionReason).toBe('Left an hour early, confirmed by phone.');

    const { data: stillPending } = await volunteerHours.getReviewQueue({});
    expect(stillPending.find((e) => e.id === anaEntry.id)).toBeUndefined();
  });

  it('integration: logs and retrieves a manual entry, always pending review', async () => {
    const entry = await volunteerHours.createManualEntry(ana.id, {
      activityType: 'MEETING' as never,
      date: DAY_ONE,
      minutes: 90,
      description: 'Monthly coordination meeting.',
    });
    expect(entry.status).toBe(VolunteerHoursStatus.PENDING);

    const { entries } = await volunteerHours.getMyHours(ana.id);
    expect(entries.find((e) => e.id === entry.id)).toMatchObject({
      source: 'MANUAL',
      activityType: 'MEETING',
      minutes: 90,
    });
  });

  it('integration: the summary aggregates approved and pending minutes per volunteer', async () => {
    const window = await openWindow();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);
    await assignments.assign(
      schedule.id,
      { date: DAY_ONE, slot: 1, userId: ana.id, roleId: roleId(window, 'Driver') },
      coordinator.id,
    );
    await assignments.assign(
      schedule.id,
      { date: DAY_ONE, slot: 1, userId: bruno.id, roleId: roleId(window, 'Team Leader') },
      coordinator.id,
    );
    await schedules.publish(schedule.id, coordinator.id);

    const { data: pending } = await volunteerHours.getReviewQueue({});
    const anaEntry = pending.find((e) => e.userId === ana.id && e.scheduleId === schedule.id)!;
    await volunteerHours.approve(anaEntry.id, coordinator.id, {});

    const result = await summary.getSummary(DAY_ONE, DAY_ONE);
    const anaRow = result.rows.find((r) => r.userId === ana.id)!;
    expect(anaRow.approvedMinutes).toBeGreaterThanOrEqual(240);
    expect(anaRow.byActivityType.EMERGENCY).toBeGreaterThanOrEqual(240);
  });
});
