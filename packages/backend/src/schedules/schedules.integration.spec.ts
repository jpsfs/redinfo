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

const { EMERGENCY, CNE_SUPPORT } = AvailabilityWindowCategory;

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

  // Who is asking: a coordinator sees drafts, a member only sees what has been
  // published — and can add themselves to it.
  let coordinatorUser: { id: string; roles: UserRole[] };
  let anaUser: { id: string; roles: UserRole[] };
  let carlaUser: { id: string; roles: UserRole[] };

  const createdWindowIds: string[] = [];

  async function createUser(
    firstName: string,
    lastName: string,
    role: UserRole,
    options: { isDriver?: boolean; isActive?: boolean } = {},
  ) {
    const user = await prisma.user.create({
      data: {
        email: email(`${firstName}.${lastName}`.toLowerCase()),
        firstName,
        lastName,
        roles: [role],
        isActive: options.isActive ?? true,
      },
      select: { id: true },
    });
    // isDriver is no longer a column — a certified driver is someone who
    // holds a DRIVER certification. Self-attributed: there is no coordinator
    // actor in these fixtures, same as the isDriver migration's backfill.
    if (options.isDriver) {
      await prisma.userCertification.create({
        data: { userId: user.id, type: 'DRIVER', validUntil: null, createdById: user.id },
      });
    }
    return user;
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
        // Explicit for EMERGENCY, rather than the category defaults (which
        // now also require TAS/TAT on Team Leader/Team Member): this suite's
        // fixture users hold no certifications beyond DRIVER, and most of its
        // tests are about assignment/override/headcount mechanics unrelated
        // to certifications — only the Driver post should be a bar here,
        // exactly as before certifications generalised beyond it. Other
        // categories keep taking their default (none), which some tests here
        // rely on explicitly.
        ...(category === EMERGENCY
          ? {
              roles: [
                { name: 'Driver', maxPeople: 1 },
                { name: 'Team Leader', maxPeople: 1 },
                { name: 'Team Member', maxPeople: 1 },
              ],
            }
          : {}),
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
      { id: user.id, roles: [UserRole.EMERGENCY_OPERATIONAL] } as RequestUser,
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

    coordinatorUser = { id: coordinator.id, roles: [UserRole.EMERGENCY_COORDINATOR] };
    anaUser = { id: ana.id, roles: [UserRole.EMERGENCY_OPERATIONAL] };
    carlaUser = { id: carla.id, roles: [UserRole.EMERGENCY_OPERATIONAL] };
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

    const board = await schedules.getBoard(schedule.id, coordinatorUser);
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
      { id: rui.id, roles: [UserRole.EMERGENCY_OPERATIONAL] } as RequestUser,
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

  // Reversed from the old "driver is a bar" behaviour (ADO #163): every
  // requirement is now overridable, so the picker lists everyone eligible by
  // role — certified or not — and the assign dialog flags the ones who lack
  // the post's requirement rather than hiding them.
  it('integration: lists uncertified people for the Driver role too, rather than excluding them', async () => {
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
    expect(everyone).toEqual(expect.arrayContaining([ana.id, bruno.id, carla.id, rui.id]));
    expect(everyone.every((id) => id !== logistics.id)).toBe(true);

    const carlaCandidate = [...candidates.available, ...candidates.others].find(
      (p) => p.id === carla.id,
    );
    expect(carlaCandidate?.isDriver).toBe(false);
    expect(carlaCandidate?.certifications).toEqual([]);
  });

  // ── Across windows ───────────────────────────────────────────────────────────

  // AC: double-booking "including across two different windows whose dates
  // overlap" — the case a single window cannot see.
  it('integration: detects the same person double-booked across two overlapping windows', async () => {
    const emergency = await openWindow(EMERGENCY, 'November 2026');
    const cne = await openWindow(CNE_SUPPORT, 'Rally Serra da Estrela');

    const first = await schedules.create({ windowId: emergency.id }, coordinator.id);
    const second = await schedules.create({ windowId: cne.id }, coordinator.id);

    await assignments.assign(
      first.id,
      { date: START, slot: 1, userId: ana.id, roleId: roleId(emergency, 'Driver') },
      coordinator.id,
    );
    // A CNE window starts with no roles, so people go on it without one.
    await assignments.assign(
      second.id,
      { date: START, slot: 1, userId: ana.id },
      coordinator.id,
    );

    const board = await schedules.getBoard(first.id, coordinatorUser);

    expect(board.conflicts).toHaveLength(1);
    expect(board.conflicts[0]).toMatchObject({
      userId: ana.id,
      date: START,
      crossWindow: true,
      otherWindowId: cne.id,
      otherWindowLabel: 'Rally Serra da Estrela',
    });
  });

  // ── Shift adjustments ─────────────────────────────────────────────────────

  it("integration: adjusts one day's shift without touching the window", async () => {
    const window = await openWindow();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);
    await assignments.assign(
      schedule.id,
      { date: START, slot: 1, userId: ana.id, roleId: roleId(window, 'Driver') },
      coordinator.id,
    );

    const adjusted = await schedules.adjustShift(
      schedule.id,
      START,
      1,
      { startMinute: at(19), endMinute: at(24) },
      coordinator.id,
    );
    expect(adjusted.shift.label).toBe('19:00–24:00');
    expect(adjusted.shift.adjustment?.original).toEqual({ startMinute: at(8), endMinute: at(16) });

    // The board reflects it...
    const board = await schedules.getBoard(schedule.id, coordinatorUser);
    expect(board.days[0].shifts[0].label).toBe('19:00–24:00');
    expect(board.days[0].shifts[0].adjustment?.original).toEqual({
      startMinute: at(8),
      endMinute: at(16),
    });

    // ...but the window's own grid never moves, since submissions were made
    // against it — the guarantee the whole feature rests on.
    const pattern = await shiftSchedule.getPatternForWindow(window);
    expect(pattern[0].shifts[0].label).toBe('08:00–16:00');

    // Nor does what a volunteer's own calendar shows.
    const calendar = await availability.getCalendar(START, END, window.id);
    expect(calendar[0].shifts[0].label).toBe('08:00–16:00');

    // The export reflects the adjustment.
    const csv = await schedules.getCsv(schedule.id, coordinatorUser);
    expect(csv).toContain('19:00–24:00');

    // Allowed on a published schedule too, and a volunteer's own duties show
    // the adjusted hours, not the window's.
    await schedules.publish(schedule.id, coordinator.id);
    await schedules.adjustShift(
      schedule.id,
      START,
      1,
      { startMinute: at(18), endMinute: at(23) },
      coordinator.id,
    );
    const duties = await schedules.getMyDuties(ana.id, START);
    expect(duties.upcoming[0]).toMatchObject({
      startMinute: at(18),
      endMinute: at(23),
      label: '18:00–23:00',
    });

    // Reset restores the window's own hours.
    const reset = await schedules.resetShift(schedule.id, START, 1);
    expect(reset.shift.label).toBe('08:00–16:00');
    expect(reset.shift.adjustment).toBeNull();
  });

  it("integration: refuses an adjustment that overlaps the day's other shift", async () => {
    const twoShiftDay = await windows.open(
      {
        startDate: START,
        endDate: START,
        category: EMERGENCY,
        name: 'Two-shift day',
        acknowledgeOverlap: true,
        roles: [{ name: 'Driver', maxPeople: 1 }],
        days: [
          {
            date: START,
            shifts: [
              { startMinute: at(8), endMinute: at(12) },
              { startMinute: at(12), endMinute: at(16) },
            ],
          },
        ],
      },
      coordinator.id,
    );
    createdWindowIds.push(twoShiftDay.id);
    const schedule = await schedules.create({ windowId: twoShiftDay.id }, coordinator.id);

    await expect(
      schedules.adjustShift(
        schedule.id,
        START,
        1,
        { startMinute: at(8), endMinute: at(13) },
        coordinator.id,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('integration: reports a cross-window conflict created only by an adjustment', async () => {
    const emergency = await openWindow(EMERGENCY, 'November 2026'); // 08:00–16:00 on START
    const cne = await windows.open(
      {
        startDate: START,
        endDate: START,
        category: CNE_SUPPORT,
        name: 'Rally Serra da Estrela',
        acknowledgeOverlap: true,
        days: [{ date: START, shifts: [{ startMinute: at(20), endMinute: at(24) }] }],
      },
      coordinator.id,
    );
    createdWindowIds.push(cne.id);

    const first = await schedules.create({ windowId: emergency.id }, coordinator.id);
    const second = await schedules.create({ windowId: cne.id }, coordinator.id);

    await assignments.assign(
      first.id,
      { date: START, slot: 1, userId: ana.id, roleId: roleId(emergency, 'Driver') },
      coordinator.id,
    );
    // A CNE window starts with no roles, so people go on it without one.
    await assignments.assign(second.id, { date: START, slot: 1, userId: ana.id }, coordinator.id);

    // At their own hours, 08:00–16:00 and 20:00–24:00 do not clash.
    expect((await schedules.getBoard(first.id, coordinatorUser)).conflicts).toEqual([]);

    // Moving the CNE shift into the emergency one creates the clash.
    await schedules.adjustShift(
      second.id,
      START,
      1,
      { startMinute: at(14), endMinute: at(18) },
      coordinator.id,
    );

    const board = await schedules.getBoard(first.id, coordinatorUser);
    expect(board.conflicts).toHaveLength(1);
    expect(board.conflicts[0]).toMatchObject({
      userId: ana.id,
      crossWindow: true,
      otherWindowId: cne.id,
      otherLabel: '14:00–18:00',
    });
  });

  it('integration: schedules onto a window with no roles at all', async () => {
    const cne = await openWindow(CNE_SUPPORT, 'Rally Serra da Estrela');
    expect(cne.roles).toEqual([]);
    const schedule = await schedules.create({ windowId: cne.id }, coordinator.id);

    // Ana drives: the shift still needs a driver for its vehicle even though
    // the window names no roles — the two rules are independent.
    const assignment = await assignments.assign(
      schedule.id,
      { date: START, slot: 1, userId: ana.id },
      coordinator.id,
    );

    expect(assignment.roleId).toBeNull();
    const board = await schedules.getBoard(schedule.id, coordinatorUser);
    expect(board.days[0].shifts[0].gaps).toEqual([]);
  });

  it('integration: still wants a driver on a role-less window that needs a vehicle', async () => {
    const cne = await openWindow(CNE_SUPPORT, 'Rally Serra da Estrela');
    const schedule = await schedules.create({ windowId: cne.id }, coordinator.id);
    await assignments.assign(
      schedule.id,
      { date: START, slot: 1, userId: carla.id },
      coordinator.id,
    );

    const board = await schedules.getBoard(schedule.id, coordinatorUser);
    expect(board.days[0].shifts[0].gaps).toEqual([{ kind: 'MISSING_DRIVER', missing: 1 }]);
  });

  // ── History and export ───────────────────────────────────────────────────────

  it('integration: orders by the window it covers, not by when the schedule was created', async () => {
    // Built out of period order: the October schedule is created second, but
    // its window covers the earliest dates, and must still sort after
    // November's — same ordering `/availability-windows` already applies.
    const november = await windows.open(
      { startDate: '2026-11-01', endDate: '2026-11-02', category: EMERGENCY },
      coordinator.id,
    );
    const october = await windows.open(
      { startDate: '2026-10-01', endDate: '2026-10-02', category: CNE_SUPPORT },
      coordinator.id,
    );
    createdWindowIds.push(november.id, october.id);

    const octoberSchedule = await schedules.create({ windowId: october.id }, coordinator.id);
    const novemberSchedule = await schedules.create({ windowId: november.id }, coordinator.id);

    const { data } = await schedules.findAll(coordinatorUser, 1, 25, {});
    const ids = data.map((schedule) => schedule.id);

    expect(ids.indexOf(novemberSchedule.id)).toBeLessThan(ids.indexOf(octoberSchedule.id));
  });

  it('integration: lists schedules per window with their fill figures', async () => {
    const window = await openWindow();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);
    await assignments.assign(
      schedule.id,
      { date: START, slot: 1, userId: ana.id, roleId: roleId(window, 'Driver') },
      coordinator.id,
    );

    const listed = await schedules.findAll(coordinatorUser, 1, 25, { windowId: window.id });

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

    const csv = await schedules.getCsv(schedule.id, coordinatorUser);

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

  // ── A published rota belongs to everyone ─────────────────────────────────────

  it('integration: a member can read a published schedule but not a draft', async () => {
    const window = await openWindow();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);

    await expect(schedules.getBoard(schedule.id, anaUser)).rejects.toThrow(
      /not been published/i,
    );
    expect(await schedules.findAll(anaUser, 1, 25, { windowId: window.id })).toMatchObject({
      total: 0,
    });

    await schedules.publish(schedule.id, coordinator.id);

    const board = await schedules.getBoard(schedule.id, anaUser);
    expect(board.days).toHaveLength(2);
    expect(await schedules.findAll(anaUser, 1, 25, { windowId: window.id })).toMatchObject({
      total: 1,
    });
  });

  it('integration: a member adds themselves to an open place on a published rota', async () => {
    const window = await openWindow();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);
    await schedules.publish(schedule.id, coordinator.id);

    const assignment = await assignments.selfAssign(
      schedule.id,
      { date: START, slot: 1, roleId: roleId(window, 'Team Member') },
      carlaUser,
    );

    expect(assignment.userId).toBe(carla.id);
    expect(assignment.assignedById).toBe(carla.id);
    expect(assignment.selfAssigned).toBe(true);

    // And it shows on the board as their own doing, not as a coordinator's
    // override of them.
    const board = await schedules.getBoard(schedule.id, carlaUser);
    const placed = board.days[0].shifts[0].assignments[0];
    expect(placed.selfAssigned).toBe(true);
  });

  it('integration: a member cannot add themselves to a role they are not certified for', async () => {
    const window = await openWindow();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);
    await schedules.publish(schedule.id, coordinator.id);

    await expect(
      assignments.selfAssign(
        schedule.id,
        { date: START, slot: 1, roleId: roleId(window, 'Driver') },
        carlaUser,
      ),
    ).rejects.toThrow(/driver certification/i);

    // The certified one may.
    await expect(
      assignments.selfAssign(
        schedule.id,
        { date: START, slot: 1, roleId: roleId(window, 'Driver') },
        anaUser,
      ),
    ).resolves.toBeDefined();
  });

  it('integration: a member cannot take a place that is already filled', async () => {
    const window = await openWindow();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);
    await schedules.publish(schedule.id, coordinator.id);
    const member = roleId(window, 'Team Member');
    await assignments.selfAssign(schedule.id, { date: START, slot: 1, roleId: member }, carlaUser);

    await expect(
      assignments.selfAssign(schedule.id, { date: START, slot: 1, roleId: member }, anaUser),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('integration: a member cannot sign up to a draft', async () => {
    const window = await openWindow();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);

    await expect(
      assignments.selfAssign(
        schedule.id,
        { date: START, slot: 1, roleId: roleId(window, 'Team Member') },
        carlaUser,
      ),
    ).rejects.toThrow(/not been published/i);
  });

  it('integration: signing up is one way — only a coordinator takes someone off', async () => {
    const window = await openWindow();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);
    await schedules.publish(schedule.id, coordinator.id);
    const added = await assignments.selfAssign(
      schedule.id,
      { date: START, slot: 1, roleId: roleId(window, 'Team Member') },
      carlaUser,
    );

    // There is no member-facing removal at all: `unassign` is reachable only
    // from the coordinator-gated route.
    await expect(assignments.unassign(schedule.id, added.id)).resolves.toEqual({
      id: added.id,
    });
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

  // ── Who is on today (the Dashboard's first card) ─────────────────────────────
  //
  // Delegation-wide, so the rules that keep it honest have to hold against a
  // real database: published only, today only, and quorate only.

  /**
   * Like `openWindow`, but with the Driver post actually *mandatory* — the
   * shared `openWindow` leaves `mandatoryCount` at its default of 0, which
   * makes every shift trivially quorate and hides the rule under test.
   */
  async function openWindowWithMandatoryDriver(
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
        roles: [
          { name: 'Driver', maxPeople: 1, mandatoryCount: 1 },
          { name: 'Team Member', maxPeople: 2, mandatoryCount: 0 },
        ],
        days: [
          { date: START, shifts: [{ startMinute: at(8), endMinute: at(16), vehiclesNeeded: 1 }] },
          { date: END, shifts: [{ startMinute: at(8), endMinute: at(16), vehiclesNeeded: 2 }] },
        ],
      },
      coordinator.id,
    );
    createdWindowIds.push(window.id);
    return window;
  }

  it("integration: today's roster lists a quorate published shift with its crew", async () => {
    const window = await openWindowWithMandatoryDriver();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);
    await assignments.assign(
      schedule.id,
      { date: START, slot: 1, userId: ana.id, roleId: roleId(window, 'Driver') },
      coordinator.id,
    );
    await assignments.assign(
      schedule.id,
      { date: START, slot: 1, userId: carla.id, roleId: roleId(window, 'Team Member') },
      coordinator.id,
    );
    await schedules.publish(schedule.id, coordinator.id);

    const roster = await schedules.getTodayRoster(START);

    expect(roster.date).toBe(START);
    expect(roster.groups).toHaveLength(1);
    expect(roster.groups[0].category).toBe(EMERGENCY);
    expect(roster.groups[0].slots).toHaveLength(1);
    expect(roster.groups[0].slots[0]).toMatchObject({
      scheduleId: schedule.id,
      windowId: window.id,
      label: '08:00–16:00',
      vehiclesNeeded: 1,
    });
    expect(
      roster.groups[0].slots[0].crew.map((member) => `${member.firstName} ${member.roleName}`).sort(),
    ).toEqual(['Ana Driver', 'Carla Team Member']);
  });

  it("integration: today's roster keeps a draft schedule out", async () => {
    const window = await openWindowWithMandatoryDriver();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);
    await assignments.assign(
      schedule.id,
      { date: START, slot: 1, userId: ana.id, roleId: roleId(window, 'Driver') },
      coordinator.id,
    );

    await expect(schedules.getTodayRoster(START)).resolves.toEqual({ date: START, groups: [] });

    await schedules.publish(schedule.id, coordinator.id);

    expect((await schedules.getTodayRoster(START)).groups).toHaveLength(1);
  });

  // The rule the card exists for: a shift short of its mandatory posts most
  // likely will not run, and listing it would tell the delegation there is
  // cover when there is none.
  it("integration: today's roster drops a shift short of its mandatory posts", async () => {
    const window = await openWindowWithMandatoryDriver();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);
    await assignments.assign(
      schedule.id,
      { date: START, slot: 1, userId: carla.id, roleId: roleId(window, 'Team Member') },
      coordinator.id,
    );
    await schedules.publish(schedule.id, coordinator.id);

    await expect(schedules.getTodayRoster(START)).resolves.toEqual({ date: START, groups: [] });

    // Filling the Driver post is what brings it back.
    await assignments.assign(
      schedule.id,
      { date: START, slot: 1, userId: ana.id, roleId: roleId(window, 'Driver') },
      coordinator.id,
    );

    expect((await schedules.getTodayRoster(START)).groups[0].slots[0].crew).toHaveLength(2);
  });

  it("integration: today's roster shows only today, not the rest of the window", async () => {
    const window = await openWindowWithMandatoryDriver();
    const schedule = await schedules.create({ windowId: window.id }, coordinator.id);
    await assignments.assign(
      schedule.id,
      { date: END, slot: 1, userId: ana.id, roleId: roleId(window, 'Driver') },
      coordinator.id,
    );
    await schedules.publish(schedule.id, coordinator.id);

    await expect(schedules.getTodayRoster(START)).resolves.toEqual({ date: START, groups: [] });
    expect((await schedules.getTodayRoster(END)).groups).toHaveLength(1);
  });

  it("integration: today's roster groups two categories separately", async () => {
    const emergency = await openWindowWithMandatoryDriver();
    const cne = await openWindowWithMandatoryDriver(CNE_SUPPORT, 'Rally Serra da Estrela');

    for (const window of [emergency, cne]) {
      const schedule = await schedules.create({ windowId: window.id }, coordinator.id);
      await assignments.assign(
        schedule.id,
        {
          date: START,
          slot: 1,
          userId: window === emergency ? ana.id : bruno.id,
          roleId: roleId(window, 'Driver'),
        },
        coordinator.id,
      );
      await schedules.publish(schedule.id, coordinator.id);
    }

    const roster = await schedules.getTodayRoster(START);

    expect(roster.groups.map((group) => group.category)).toEqual([EMERGENCY, CNE_SUPPORT]);
    expect(roster.groups.every((group) => group.slots.length === 1)).toBe(true);
  });
});
