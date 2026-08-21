import { PrismaClient } from '@prisma/client';
import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  AvailabilityWindowCategory,
  ScheduleStatus,
  toMinuteOfDay,
  UserRole,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService, RequestUser } from '../availability/availability.service';
import { AvailabilityWindowsService } from '../availability/availability-windows.service';
import { HolidaysService } from '../availability/holidays.service';
import { ShiftScheduleService } from '../availability/shift-schedule.service';
import { SchedulesService } from './schedules.service';
import { ScheduleAssignmentsService } from './schedule-assignments.service';
import { ScheduleAutofillService } from './schedule-autofill.service';

/** Minutes from midnight, so expectations read in wall-clock hours. */
const at = (hour: number, minute = 0) => toMinuteOfDay(hour, minute);

const { EMERGENCY, SALOP_SUPPORT } = AvailabilityWindowCategory;

/**
 * Integration coverage for building a schedule from availability (ADO #161),
 * against a real Postgres — the CI `postgres` service or a local compose one.
 *
 * Skipped unless DATABASE_URL is set, and named so
 * `pnpm --filter backend test -- -t "integration"` selects it.
 */
const describeIntegration = process.env.DATABASE_URL ? describe : describe.skip;

const RUN = `it-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const email = (local: string) => `${local}.${RUN}@schedules.test`;

describeIntegration('Schedules module (integration)', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;

  let holidays: HolidaysService;
  let shiftSchedule: ShiftScheduleService;
  let windows: AvailabilityWindowsService;
  let availability: AvailabilityService;
  let schedules: SchedulesService;
  let assignments: ScheduleAssignmentsService;
  let autofill: ScheduleAutofillService;

  // Two certified drivers, two who are not, and one outside the field roster.
  let ana: { id: string };
  let bruno: { id: string };
  let carla: { id: string };
  let rui: { id: string };
  let logistics: { id: string };
  let coordinator: { id: string };

  const START = '2026-11-02'; // Monday
  const END = '2026-11-03';

  const createdWindowIds: string[] = [];

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
   * A window with one 08:00–16:00 shift per day, the second day crewing two
   * vehicles — the case where the Driver post alone cannot supply the drivers.
   */
  async function openWindow(
    category: AvailabilityWindowCategory = EMERGENCY,
    name = 'November 2026',
  ) {
    const window = await windows.open(
      {
        startDate: START,
        endDate: END,
        category,
        name,
        acknowledgeOverlap: true,
        days: [
          {
            date: START,
            shifts: [{ startMinute: at(8), endMinute: at(16), vehiclesNeeded: 1 }],
          },
          {
            date: END,
            shifts: [{ startMinute: at(8), endMinute: at(16), vehiclesNeeded: 2 }],
          },
        ],
      },
      coordinator.id,
    );
    createdWindowIds.push(window.id);
    return window;
  }

  const submit = (user: { id: string }, windowId: string, dates: string[]) =>
    availability.submitMine(
      { id: user.id, role: UserRole.EMERGENCY_OPERATIONAL } as RequestUser,
      { windowId, entries: dates.map((date) => ({ date, slots: [1] })) },
    );

  const roleId = (window: { roles?: Array<{ id: string; name: string }> }, name: string) =>
    window.roles!.find((role) => role.name === name)!.id;

  beforeAll(async () => {
    await prisma.$connect();

    holidays = new HolidaysService(prisma);
    shiftSchedule = new ShiftScheduleService(holidays, prisma);
    windows = new AvailabilityWindowsService(prisma, shiftSchedule);
    availability = new AvailabilityService(prisma, windows, shiftSchedule);
    schedules = new SchedulesService(prisma, shiftSchedule);
    assignments = new ScheduleAssignmentsService(prisma, schedules, shiftSchedule);
    autofill = new ScheduleAutofillService(prisma, schedules);

    [ana, bruno, carla, rui, logistics, coordinator] = await Promise.all([
      createUser('Ana', 'Silva', UserRole.EMERGENCY_OPERATIONAL, { isDriver: true }),
      createUser('Bruno', 'Costa', UserRole.EMERGENCY_OPERATIONAL, { isDriver: true }),
      createUser('Carla', 'Ferreira', UserRole.EMERGENCY_OPERATIONAL),
      createUser('Rui', 'Nunes', UserRole.EMERGENCY_OPERATIONAL),
      createUser('Luis', 'Logistica', UserRole.LOGISTICS_COORDINATOR),
      createUser('Maria', 'Santos', UserRole.EMERGENCY_COORDINATOR),
    ]);
  });

  afterAll(async () => {
    const userIds = [ana, bruno, carla, rui, logistics, coordinator]
      .map((user) => user?.id)
      .filter(Boolean) as string[];

    // Schedules and assignments cascade from the window and from the users.
    if (createdWindowIds.length) {
      await prisma.availabilityWindow.deleteMany({ where: { id: { in: createdWindowIds } } });
    }
    if (userIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    if (createdWindowIds.length) {
      await prisma.availabilityWindow.deleteMany({ where: { id: { in: createdWindowIds } } });
      createdWindowIds.length = 0;
    }
  });

  // ── The whole journey ────────────────────────────────────────────────────────

  it('integration: builds, adjusts and publishes a schedule from submitted availability', async () => {
    const window = await openWindow();
    await submit(ana, window.id, [START, END]);
    await submit(bruno, window.id, [END]);
    await submit(carla, window.id, [START, END]);

    // A window may be scheduled while it is still open.
    expect(window.status).toBe('OPEN');
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);
    expect(schedule.status).toBe(ScheduleStatus.DRAFT);

    const report = await autofill.autofill(schedule.id, {}, coordinator.id);
    expect(report.placed).toBeGreaterThan(0);

    const board = await schedules.getBoard(schedule.id);
    expect(board.days).toHaveLength(2);

    // Day one: Ana drives, Carla takes a crew role, nobody is left for the third.
    const dayOne = board.days[0].shifts[0];
    expect(dayOne.assignments.map((a) => a.user.firstName).sort()).toEqual(['Ana', 'Carla']);
    expect(dayOne.driverCount).toBe(1);
    expect(dayOne.gaps.map((gap) => gap.kind)).toEqual(['ROLE_SHORT']);

    // Day two crews two vehicles: both certified people are placed, one of them
    // outside the Driver post, and the shift is not driver-short.
    const dayTwo = board.days[1].shifts[0];
    expect(dayTwo.driverCount).toBe(2);
    expect(dayTwo.gaps.map((gap) => gap.kind)).not.toContain('MISSING_DRIVER');

    // Everything the generator wrote came from availability.
    expect(board.stats.overrideCount).toBe(0);

    const published = await schedules.publish(schedule.id, coordinator.id);
    expect(published.status).toBe(ScheduleStatus.PUBLISHED);
    expect(published.publishedById).toBe(coordinator.id);

    // The people on it can now see their duties, labelled with role and window.
    const duties = await schedules.getMyDuties(ana.id, START);
    expect(duties.upcoming.length).toBeGreaterThan(0);
    expect(duties.upcoming[0]).toMatchObject({
      windowLabel: 'November 2026',
      windowCategory: EMERGENCY,
      label: '08:00–16:00',
    });
    expect(duties.upcoming[0].roleName).toBeTruthy();
  });

  // ── Availability guides, it does not constrain ───────────────────────────────

  it('integration: schedules someone who never submitted, recording it as an override', async () => {
    const window = await openWindow();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);

    const assignment = await assignments.assign(
      schedule.id,
      { date: START, slot: 1, userId: rui.id, roleId: roleId(window, 'Team Member') },
      coordinator.id,
    );

    expect(assignment.isOverride).toBe(true);
    expect(assignment.availability).toBe('pending');
    expect(assignment.assignedById).toBe(coordinator.id);
  });

  it('integration: schedules someone who declared no availability, as an override', async () => {
    const window = await openWindow();
    await availability.declineMine(
      { id: rui.id, role: UserRole.EMERGENCY_OPERATIONAL } as RequestUser,
      window.id,
    );
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);

    const assignment = await assignments.assign(
      schedule.id,
      { date: START, slot: 1, userId: rui.id, roleId: roleId(window, 'Team Member') },
      coordinator.id,
    );

    expect(assignment.isOverride).toBe(true);
    expect(assignment.availability).toBe('declined');
  });

  it('integration: does not mark an assignment backed by a submission as an override', async () => {
    const window = await openWindow();
    await submit(carla, window.id, [START]);
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);

    const assignment = await assignments.assign(
      schedule.id,
      { date: START, slot: 1, userId: carla.id, roleId: roleId(window, 'Team Member') },
      coordinator.id,
    );

    expect(assignment.isOverride).toBe(false);
    expect(assignment.availability).toBe('submitted');
  });

  // ── The rules that do bind ───────────────────────────────────────────────────

  it('integration: refuses an uncertified person on the Driver role', async () => {
    const window = await openWindow();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);

    await expect(
      assignments.assign(
        schedule.id,
        { date: START, slot: 1, userId: carla.id, roleId: roleId(window, 'Driver') },
        coordinator.id,
      ),
    ).rejects.toThrow(/driver certification/i);
  });

  it('integration: refuses the same person twice on one shift', async () => {
    const window = await openWindow();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);
    await assignments.assign(
      schedule.id,
      { date: START, slot: 1, userId: ana.id, roleId: roleId(window, 'Driver') },
      coordinator.id,
    );

    await expect(
      assignments.assign(
        schedule.id,
        { date: START, slot: 1, userId: ana.id, roleId: roleId(window, 'Team Member') },
        coordinator.id,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('integration: refuses to fill a role past its headcount', async () => {
    const window = await openWindow();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);
    const member = roleId(window, 'Team Member');
    await assignments.assign(
      schedule.id,
      { date: START, slot: 1, userId: carla.id, roleId: member },
      coordinator.id,
    );

    await expect(
      assignments.assign(
        schedule.id,
        { date: START, slot: 1, userId: rui.id, roleId: member },
        coordinator.id,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('integration: refuses someone outside the field roster', async () => {
    const window = await openWindow();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);

    await expect(
      assignments.assign(
        schedule.id,
        { date: START, slot: 1, userId: logistics.id, roleId: roleId(window, 'Team Member') },
        coordinator.id,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('integration: refuses a shift the window does not have that day', async () => {
    const window = await openWindow();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);

    await expect(
      assignments.assign(
        schedule.id,
        { date: START, slot: 2, userId: carla.id, roleId: roleId(window, 'Team Member') },
        coordinator.id,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('integration: allows only one schedule per window', async () => {
    const window = await openWindow();
    await schedules.create({ windowId: window.id }, coordinator.id);

    await expect(
      schedules.create({ windowId: window.id }, coordinator.id),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  // ── Candidates ───────────────────────────────────────────────────────────────

  it('integration: offers the people who submitted for the shift first', async () => {
    const window = await openWindow();
    await submit(carla, window.id, [START]);
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);

    const candidates = await assignments.getCandidates(
      schedule.id,
      START,
      1,
      roleId(window, 'Team Member'),
    );

    expect(candidates.available.map((person) => person.id)).toEqual([carla.id]);
    expect(candidates.available[0].submittedForShift).toBe(true);
    // Everyone else eligible is still offered — availability is guidance.
    expect(candidates.others.map((person) => person.id)).toEqual(
      expect.arrayContaining([ana.id, bruno.id, rui.id]),
    );
    expect(candidates.others.map((person) => person.id)).not.toContain(logistics.id);
  });

  it('integration: leaves uncertified people out of the Driver role entirely', async () => {
    const window = await openWindow();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);

    const candidates = await assignments.getCandidates(
      schedule.id,
      START,
      1,
      roleId(window, 'Driver'),
    );

    // Asserted by membership, not by an exact set: the roster is every active
    // field member in the database, which other suites also add to.
    const everyone = [...candidates.available, ...candidates.others].map((p) => p.id);
    expect(everyone).toEqual(expect.arrayContaining([ana.id, bruno.id]));
    expect(everyone).not.toContain(carla.id);
    expect(everyone).not.toContain(rui.id);
    expect(everyone.every((id) => id !== logistics.id)).toBe(true);
  });

  // ── Across windows ───────────────────────────────────────────────────────────

  // AC: double-booking "including across two different windows whose dates
  // overlap" — the case a single window cannot see.
  it('integration: detects the same person double-booked across two overlapping windows', async () => {
    const emergency = await openWindow(EMERGENCY, 'November 2026');
    const salop = await openWindow(SALOP_SUPPORT, 'Rally Serra da Estrela');

    const first = await schedules.create({ windowId: emergency.id }, coordinator.id);
    const second = await schedules.create({ windowId: salop.id }, coordinator.id);

    await assignments.assign(
      first.id,
      { date: START, slot: 1, userId: ana.id, roleId: roleId(emergency, 'Driver') },
      coordinator.id,
    );
    // A SALOP window starts with no roles, so people go on it without one.
    await assignments.assign(
      second.id,
      { date: START, slot: 1, userId: ana.id },
      coordinator.id,
    );

    const board = await schedules.getBoard(first.id);

    expect(board.conflicts).toHaveLength(1);
    expect(board.conflicts[0]).toMatchObject({
      userId: ana.id,
      date: START,
      crossWindow: true,
      otherWindowId: salop.id,
      otherWindowLabel: 'Rally Serra da Estrela',
    });
  });

  it('integration: schedules onto a window with no roles at all', async () => {
    const salop = await openWindow(SALOP_SUPPORT, 'Rally Serra da Estrela');
    expect(salop.roles).toEqual([]);
    const schedule = await schedules.create({ windowId: salop.id }, coordinator.id);

    // Ana drives: the shift still needs a driver for its vehicle even though
    // the window names no roles — the two rules are independent.
    const assignment = await assignments.assign(
      schedule.id,
      { date: START, slot: 1, userId: ana.id },
      coordinator.id,
    );

    expect(assignment.roleId).toBeNull();
    const board = await schedules.getBoard(schedule.id);
    expect(board.days[0].shifts[0].gaps).toEqual([]);
  });

  it('integration: still wants a driver on a role-less window that needs a vehicle', async () => {
    const salop = await openWindow(SALOP_SUPPORT, 'Rally Serra da Estrela');
    const schedule = await schedules.create({ windowId: salop.id }, coordinator.id);
    await assignments.assign(
      schedule.id,
      { date: START, slot: 1, userId: carla.id },
      coordinator.id,
    );

    const board = await schedules.getBoard(schedule.id);
    expect(board.days[0].shifts[0].gaps).toEqual([{ kind: 'MISSING_DRIVER', missing: 1 }]);
  });

  // ── History and export ───────────────────────────────────────────────────────

  it('integration: lists schedules per window with their fill figures', async () => {
    const window = await openWindow();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);
    await assignments.assign(
      schedule.id,
      { date: START, slot: 1, userId: ana.id, roleId: roleId(window, 'Driver') },
      coordinator.id,
    );

    const listed = await schedules.findAll(1, 25, { windowId: window.id });

    expect(listed.total).toBe(1);
    expect(listed.data[0].stats).toMatchObject({
      // Two shifts × three Emergency roles.
      requiredSlots: 6,
      filledSlots: 1,
      overrideCount: 1,
    });
    expect(listed.data[0].window?.name).toBe('November 2026');
  });

  it('integration: exports the roster with its holes visible', async () => {
    const window = await openWindow();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);
    await assignments.assign(
      schedule.id,
      { date: START, slot: 1, userId: ana.id, roleId: roleId(window, 'Driver') },
      coordinator.id,
    );

    const csv = await schedules.getCsv(schedule.id);

    expect(csv).toContain('Ana Silva');
    expect(csv).toContain('unfilled');
  });

  it('integration: keeps a draft out of the personal view until it is published', async () => {
    const window = await openWindow();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);
    await assignments.assign(
      schedule.id,
      { date: START, slot: 1, userId: ana.id, roleId: roleId(window, 'Driver') },
      coordinator.id,
    );

    await expect(schedules.getMyDuties(ana.id, START)).resolves.toEqual({
      upcoming: [],
      past: [],
    });

    await schedules.publish(schedule.id, coordinator.id);

    const duties = await schedules.getMyDuties(ana.id, START);
    expect(duties.upcoming).toHaveLength(1);
  });

  it('integration: a published schedule stays editable — cover changes daily', async () => {
    const window = await openWindow();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);
    await schedules.publish(schedule.id, coordinator.id);

    const added = await assignments.assign(
      schedule.id,
      { date: START, slot: 1, userId: ana.id, roleId: roleId(window, 'Driver') },
      coordinator.id,
    );
    await expect(assignments.unassign(schedule.id, added.id)).resolves.toEqual({ id: added.id });

    // And it cannot be deleted out from under the people on it.
    await expect(schedules.remove(schedule.id)).rejects.toBeInstanceOf(ConflictException);
  });
});
