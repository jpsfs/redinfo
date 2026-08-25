import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CertificationType, ScheduleStatus, UserRole } from '@redinfo/shared';
import { SchedulesService } from './schedules.service';

// ── The schedule itself (ADO #161) ─────────────────────────────────────────────
//
// One schedule per availability window; drafts are the coordinator's working
// copy and published ones are what people turn up on. The board is where the
// window's shifts, the assignments and the gap rules meet.

const DRIVER_ROLE = {
  id: 'r-driver',
  windowId: 'w1',
  name: 'Driver',
  maxPeople: 1,
  requiredCertification: CertificationType.DRIVER,
  order: 0,
};
const MEMBER_ROLE = {
  id: 'r-member',
  windowId: 'w1',
  name: 'Team Member',
  maxPeople: 1,
  requiredCertification: null,
  order: 1,
};

const ACTOR = { id: 'u-coord', firstName: 'Ana', lastName: 'Ferreira' };

/** A coordinator sees drafts; a volunteer sees only what is published. */
const COORDINATOR = { id: ACTOR.id, role: UserRole.EMERGENCY_COORDINATOR };
const VOLUNTEER = { id: 'u-ana', role: UserRole.EMERGENCY_OPERATIONAL };
const ANA = {
  id: 'u-ana',
  firstName: 'Ana',
  lastName: 'Silva',
  certifications: [{ type: CertificationType.DRIVER, validUntil: null }],
};
const JOANA = {
  id: 'u-joana',
  firstName: 'Joana',
  lastName: 'Pinto',
  certifications: [] as Array<{ type: CertificationType; validUntil: string | null }>,
};

const windowRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'w1',
  startDate: new Date('2026-10-03T00:00:00.000Z'),
  endDate: new Date('2026-10-04T00:00:00.000Z'),
  category: 'EMERGENCY',
  name: 'October 2026',
  status: 'OPEN',
  openedById: ACTOR.id,
  openedBy: ACTOR,
  openedAt: new Date('2026-09-01T00:00:00.000Z'),
  closedById: null,
  closedBy: null,
  closedAt: null,
  roles: [DRIVER_ROLE, MEMBER_ROLE],
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  ...overrides,
});

const scheduleRow = (overrides: Record<string, unknown> = {}) => ({
  id: 's1',
  windowId: 'w1',
  status: ScheduleStatus.DRAFT,
  createdById: ACTOR.id,
  createdBy: ACTOR,
  createdAt: new Date('2026-09-10T00:00:00.000Z'),
  publishedById: null,
  publishedBy: null,
  publishedAt: null,
  updatedAt: new Date('2026-09-10T00:00:00.000Z'),
  window: windowRow(),
  ...overrides,
});

const assignmentRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'a1',
  scheduleId: 's1',
  date: new Date('2026-10-03T00:00:00.000Z'),
  slot: 1,
  userId: ANA.id,
  user: ANA,
  roleId: DRIVER_ROLE.id,
  role: DRIVER_ROLE,
  isOverride: false,
  assignedById: ACTOR.id,
  assignedBy: ACTOR,
  assignedAt: new Date('2026-09-18T14:20:00.000Z'),
  // The conflict sweep reads the same rows back with their schedule and window,
  // so the fixture carries what both queries include.
  schedule: { windowId: 'w1', window: windowRow() },
  ...overrides,
});

/** Two days, one 08:00–16:00 shift each, the second needing two vehicles. */
const PATTERN = [
  {
    date: '2026-10-03',
    isWeekend: true,
    isHoliday: false,
    holidayName: null,
    shifts: [
      { slot: 1, startMinute: 480, endMinute: 960, vehiclesNeeded: 1, label: '08:00–16:00' },
    ],
  },
  {
    date: '2026-10-04',
    isWeekend: true,
    isHoliday: false,
    holidayName: null,
    shifts: [
      { slot: 1, startMinute: 480, endMinute: 960, vehiclesNeeded: 2, label: '08:00–16:00' },
    ],
  },
];

function buildPrismaStub(overrides: Record<string, unknown> = {}) {
  return {
    schedule: {
      findUnique: jest.fn().mockResolvedValue(scheduleRow()),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(() => Promise.resolve(scheduleRow())),
      update: jest
        .fn()
        .mockImplementation((args) => Promise.resolve(scheduleRow({ ...args.data }))),
      delete: jest.fn().mockResolvedValue({ id: 's1' }),
    },
    availabilityWindow: { findUnique: jest.fn().mockResolvedValue(windowRow()) },
    availabilityWindowShift: { findMany: jest.fn().mockResolvedValue([]) },
    scheduleAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    availabilitySubmission: { findMany: jest.fn().mockResolvedValue([]) },
    availabilityResponse: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
    ...overrides,
  };
}

function makeService(prisma = buildPrismaStub()) {
  const shiftSchedule = {
    getPatternForWindow: jest.fn().mockResolvedValue(PATTERN),
  };
  return {
    service: new SchedulesService(prisma as never, shiftSchedule as never),
    prisma,
    shiftSchedule,
  };
}

describe('SchedulesService lifecycle', () => {
  beforeEach(() => jest.clearAllMocks());

  // AC: "the schedule process can start before" the window closes.
  it('starts a schedule for a window that is still open', async () => {
    const { service, prisma } = makeService();
    prisma.schedule.findUnique.mockResolvedValue(null);

    const created = await service.create({ windowId: 'w1' }, ACTOR.id);

    expect(created.windowId).toBe('w1');
    expect(created.status).toBe(ScheduleStatus.DRAFT);
  });

  it('refuses a second schedule for the same window', async () => {
    const { service } = makeService();
    await expect(service.create({ windowId: 'w1' }, ACTOR.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('404s a window that does not exist', async () => {
    const { service, prisma } = makeService();
    prisma.availabilityWindow.findUnique.mockResolvedValue(null);
    await expect(service.create({ windowId: 'nope' }, ACTOR.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('publishes a draft, recording who and when', async () => {
    const { service, prisma } = makeService();

    await service.publish('s1', ACTOR.id);

    expect(prisma.schedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ScheduleStatus.PUBLISHED,
          publishedById: ACTOR.id,
        }),
      }),
    );
  });

  it('refuses to publish twice', async () => {
    const { service, prisma } = makeService();
    prisma.schedule.findUnique.mockResolvedValue(
      scheduleRow({ status: ScheduleStatus.PUBLISHED }),
    );
    await expect(service.publish('s1', ACTOR.id)).rejects.toBeInstanceOf(ConflictException);
  });

  it('deletes a draft', async () => {
    const { service, prisma } = makeService();
    await expect(service.remove('s1')).resolves.toEqual({ id: 's1' });
    expect(prisma.schedule.delete).toHaveBeenCalled();
  });

  it('refuses to delete a published schedule people are turning up on', async () => {
    const { service, prisma } = makeService();
    prisma.schedule.findUnique.mockResolvedValue(
      scheduleRow({ status: ScheduleStatus.PUBLISHED }),
    );
    await expect(service.remove('s1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.schedule.delete).not.toHaveBeenCalled();
  });
});

// ── Who may see a schedule ─────────────────────────────────────────────────────
//
// A published schedule is the rota the whole delegation works from, so everyone
// can read it. A draft is a coordinator's working copy.

describe('SchedulesService visibility', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lets any member read a published schedule', async () => {
    const { service, prisma } = makeService();
    prisma.schedule.findUnique.mockResolvedValue(
      scheduleRow({ status: ScheduleStatus.PUBLISHED }),
    );

    await expect(service.findOne('s1', VOLUNTEER)).resolves.toMatchObject({ id: 's1' });
    await expect(service.getBoard('s1', VOLUNTEER)).resolves.toBeDefined();
  });

  it('keeps a draft from anyone without the schedules permission', async () => {
    const { service } = makeService();

    await expect(service.findOne('s1', VOLUNTEER)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getBoard('s1', VOLUNTEER)).rejects.toThrow(/not been published/i);
  });

  it('lets a coordinator read a draft', async () => {
    const { service } = makeService();
    await expect(service.findOne('s1', COORDINATOR)).resolves.toMatchObject({ id: 's1' });
  });

  it('lists only published schedules to a member', async () => {
    const { service, prisma } = makeService();

    await service.findAll(VOLUNTEER);

    expect(prisma.schedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: ScheduleStatus.PUBLISHED } }),
    );
  });

  it('will not let a member widen the list back to drafts with a filter', async () => {
    const { service, prisma } = makeService();

    await service.findAll(VOLUNTEER, 1, 25, { status: ScheduleStatus.DRAFT });

    expect(prisma.schedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: ScheduleStatus.PUBLISHED } }),
    );
  });

  it('lists drafts and published alike to a coordinator', async () => {
    const { service, prisma } = makeService();

    await service.findAll(COORDINATOR);

    expect(prisma.schedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });
});

describe('SchedulesService.getBoard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lays assignments on the shifts of the window itself', async () => {
    const { service, prisma, shiftSchedule } = makeService();
    prisma.scheduleAssignment.findMany.mockResolvedValue([assignmentRow()]);

    const board = await service.getBoard('s1', COORDINATOR);

    expect(shiftSchedule.getPatternForWindow).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'w1' }),
    );
    expect(board.days).toHaveLength(2);
    expect(board.days[0].shifts[0].assignments).toHaveLength(1);
    expect(board.days[0].shifts[0].driverCount).toBe(1);
    expect(board.roles.map((role) => role.name)).toEqual(['Driver', 'Team Member']);
  });

  it('flags the roles and drivers a shift is short of', async () => {
    const { service, prisma } = makeService();
    prisma.scheduleAssignment.findMany.mockResolvedValue([assignmentRow()]);

    const board = await service.getBoard('s1', COORDINATOR);

    // Day one has its driver but no Team Member.
    expect(board.days[0].shifts[0].gaps).toEqual([
      { kind: 'ROLE_SHORT', roleId: MEMBER_ROLE.id, roleName: 'Team Member', missing: 1 },
    ]);
    // Day two is empty and crews two vehicles.
    expect(board.days[1].shifts[0].gaps).toEqual([
      { kind: 'MISSING_DRIVER', missing: 2 },
      { kind: 'ROLE_SHORT', roleId: DRIVER_ROLE.id, roleName: 'Driver', missing: 1 },
      { kind: 'ROLE_SHORT', roleId: MEMBER_ROLE.id, roleName: 'Team Member', missing: 1 },
    ]);
  });

  // AC: "Any assignment that contradicts submitted availability is flagged as
  // an override … recording who made it and when."
  // Someone who put themselves forward is not someone a coordinator overrode.
  it('tells a self-signup apart from a coordinator placing someone', async () => {
    const { service, prisma } = makeService();
    prisma.scheduleAssignment.findMany.mockResolvedValue([
      assignmentRow(),
      assignmentRow({ id: 'a2', userId: JOANA.id, user: JOANA, assignedById: JOANA.id }),
    ]);

    const board = await service.getBoard('s1', COORDINATOR);
    const [placed, signedUp] = board.days[0].shifts[0].assignments;

    expect(placed.selfAssigned).toBe(false);
    expect(signedUp.selfAssigned).toBe(true);
  });

  it('carries the override stamp and who made it', async () => {
    const { service, prisma } = makeService();
    prisma.scheduleAssignment.findMany.mockResolvedValue([
      assignmentRow({ isOverride: true }),
    ]);

    const board = await service.getBoard('s1', COORDINATOR);
    const assignment = board.days[0].shifts[0].assignments[0];

    expect(assignment.isOverride).toBe(true);
    expect(assignment.assignedBy).toEqual(ACTOR);
    expect(assignment.assignedAt).toBe('2026-09-18T14:20:00.000Z');
  });

  it('reads availability live, so a later withdrawal shows on the board', async () => {
    const { service, prisma } = makeService();
    // Assigned as a submitter, but the submission is gone and they have since
    // declared no availability. `isOverride` stays as the historical record.
    prisma.scheduleAssignment.findMany.mockResolvedValue([assignmentRow()]);
    prisma.availabilityResponse.findMany.mockResolvedValue([{ userId: ANA.id }]);

    const board = await service.getBoard('s1', COORDINATOR);
    const assignment = board.days[0].shifts[0].assignments[0];

    expect(assignment.isOverride).toBe(false);
    expect(assignment.availability).toBe('declined');
  });

  it('marks an assignment backed by a submission as submitted', async () => {
    const { service, prisma } = makeService();
    prisma.scheduleAssignment.findMany.mockResolvedValue([assignmentRow()]);
    prisma.availabilitySubmission.findMany.mockResolvedValue([
      { userId: ANA.id, date: new Date('2026-10-03T00:00:00.000Z'), slot: 1 },
    ]);

    const board = await service.getBoard('s1', COORDINATOR);

    expect(board.days[0].shifts[0].assignments[0].availability).toBe('submitted');
  });

  it('totals the board the same way the list does', async () => {
    const { service, prisma } = makeService();
    prisma.scheduleAssignment.findMany.mockResolvedValue([
      assignmentRow(),
      assignmentRow({ id: 'a2', userId: JOANA.id, user: JOANA, roleId: MEMBER_ROLE.id, role: MEMBER_ROLE, isOverride: true }),
    ]);

    const board = await service.getBoard('s1', COORDINATOR);

    expect(board.stats).toEqual({
      requiredSlots: 4,
      filledSlots: 2,
      shiftsWithGaps: 1,
      overrideCount: 1,
      certificationExceptionCount: 0,
      lapsedCertificationCount: 0,
    });
  });
});

describe('SchedulesService double-booking detection', () => {
  beforeEach(() => jest.clearAllMocks());

  // AC: "including across two different windows whose dates overlap".
  it('reports the same person on an overlapping shift of another window', async () => {
    const { service, prisma, shiftSchedule } = makeService();
    const salopWindow = windowRow({
      id: 'w2',
      category: 'SALOP_SUPPORT',
      name: 'Rally Serra da Estrela',
    });

    prisma.scheduleAssignment.findMany
      // The board's own assignments.
      .mockResolvedValueOnce([assignmentRow()])
      // Every duty those people hold over these dates, this window and others.
      .mockResolvedValueOnce([
        { ...assignmentRow(), schedule: { windowId: 'w1', window: windowRow() } },
        {
          ...assignmentRow({ id: 'a-other', scheduleId: 's2' }),
          schedule: { windowId: 'w2', window: salopWindow },
        },
      ]);

    shiftSchedule.getPatternForWindow.mockResolvedValue(PATTERN);

    const board = await service.getBoard('s1', COORDINATOR);

    expect(board.conflicts).toHaveLength(1);
    expect(board.conflicts[0]).toMatchObject({
      userId: ANA.id,
      userName: 'Ana Silva',
      date: '2026-10-03',
      crossWindow: true,
      otherWindowId: 'w2',
      otherWindowLabel: 'Rally Serra da Estrela',
    });
  });

  it('reports nothing when the only other duty is the same assignment', async () => {
    const { service, prisma } = makeService();
    prisma.scheduleAssignment.findMany
      .mockResolvedValueOnce([assignmentRow()])
      .mockResolvedValueOnce([
        { ...assignmentRow(), schedule: { windowId: 'w1', window: windowRow() } },
      ]);

    const board = await service.getBoard('s1', COORDINATOR);

    expect(board.conflicts).toEqual([]);
  });
});

describe('SchedulesService.getCsv', () => {
  beforeEach(() => jest.clearAllMocks());

  it('exports assigned people and says which slots are still open', async () => {
    const { service, prisma } = makeService();
    prisma.scheduleAssignment.findMany.mockResolvedValue([
      assignmentRow({ isOverride: true }),
    ]);

    const csv = await service.getCsv('s1', COORDINATOR);
    const lines = csv.trim().split('\n');

    expect(lines[0]).toBe(
      'date,dayType,holiday,shift,vehiclesNeeded,role,person,driver,source',
    );
    expect(lines[1]).toBe('2026-10-03,weekend,,08:00–16:00,1,Driver,Ana Silva,yes,override');
    // The empty shift is a row of its own — a roster that hid its holes would
    // be worse than no export.
    expect(lines[2]).toBe('2026-10-04,weekend,,08:00–16:00,2,,,,unfilled');
  });
});

describe('SchedulesService.getMyDuties', () => {
  beforeEach(() => jest.clearAllMocks());

  const dutyRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'a1',
    scheduleId: 's1',
    date: new Date('2026-10-03T00:00:00.000Z'),
    slot: 1,
    role: DRIVER_ROLE,
    schedule: { window: windowRow() },
    ...overrides,
  });

  it('labels each duty with its role and the window it belongs to', async () => {
    const { service, prisma } = makeService();
    prisma.scheduleAssignment.findMany.mockResolvedValue([dutyRow()]);

    const duties = await service.getMyDuties(ANA.id, '2026-10-01');

    expect(duties.upcoming).toHaveLength(1);
    expect(duties.upcoming[0]).toMatchObject({
      date: '2026-10-03',
      label: '08:00–16:00',
      roleName: 'Driver',
      windowLabel: 'October 2026',
      windowCategory: 'EMERGENCY',
      vehiclesNeeded: 1,
    });
  });

  it('only ever reads published schedules', async () => {
    const { service, prisma } = makeService();
    await service.getMyDuties(ANA.id);

    expect(prisma.scheduleAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: ANA.id,
          schedule: { status: ScheduleStatus.PUBLISHED },
        }),
      }),
    );
  });

  it('splits around today, most recent first in the past', async () => {
    const { service, prisma } = makeService();
    prisma.scheduleAssignment.findMany.mockResolvedValue([
      dutyRow({ id: 'a1', date: new Date('2026-10-03T00:00:00.000Z') }),
      dutyRow({ id: 'a2', date: new Date('2026-10-04T00:00:00.000Z') }),
    ]);

    const duties = await service.getMyDuties(ANA.id, '2026-10-04');

    expect(duties.upcoming.map((duty) => duty.date)).toEqual(['2026-10-04']);
    expect(duties.past.map((duty) => duty.date)).toEqual(['2026-10-03']);
  });

  it('is empty for someone with no duties', async () => {
    const { service } = makeService();
    await expect(service.getMyDuties('u-nobody')).resolves.toEqual({ upcoming: [], past: [] });
  });
});
