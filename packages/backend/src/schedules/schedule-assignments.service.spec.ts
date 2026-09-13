import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  AssignmentCompensationKind,
  AvailabilityWindowCategory,
  AvailabilityWindowStatus,
  CertificationType,
  UserRole,
} from '@redinfo/shared';
import * as certificationsUtil from '../users/certifications.util';
import { ScheduleAssignmentsService } from './schedule-assignments.service';
import { ScheduleContext } from './schedules.service';

// ── Assigning people to shifts (ADO #161, generalised for ADO #163) ────────────
//
// The governing rule: availability guides the schedule, it does not constrain
// it. A coordinator may place anyone — cover is agreed by phone too — and the
// platform's job is to record that honestly rather than refuse it. Every
// post's `requiredCertification` is enforceable but not absolute: assigning
// someone who lacks it needs a reason, recorded as
// `certificationOverrideReason`, but is never refused outright.

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
  maxPeople: 2,
  requiredCertification: null,
  order: 1,
};

const WINDOW = {
  id: 'w1',
  startDate: '2026-10-01',
  endDate: '2026-10-03',
  category: AvailabilityWindowCategory.EMERGENCY,
  name: 'October 2026',
  status: AvailabilityWindowStatus.OPEN,
  openedById: 'u-coord',
  openedAt: '2026-09-01T00:00:00.000Z',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  roles: [DRIVER_ROLE, MEMBER_ROLE],
} as never;

function makeContext(roles = [DRIVER_ROLE, MEMBER_ROLE]): ScheduleContext {
  const shift = {
    slot: 1,
    startMinute: 480,
    endMinute: 960,
    vehiclesNeeded: 1,
    label: '08:00–16:00',
  };
  const late = {
    slot: 2,
    startMinute: 900,
    endMinute: 1440,
    vehiclesNeeded: 1,
    label: '15:00–24:00',
  };
  return {
    scheduleId: 's1',
    status: 'DRAFT' as never,
    window: { ...(WINDOW as object), roles } as never,
    roles: roles as never,
    pattern: [
      {
        date: '2026-10-01',
        isWeekend: false,
        isHoliday: false,
        holidayName: null,
        shifts: [shift, late],
      },
    ],
    shifts: new Map([
      ['2026-10-01#1', { ...shift, date: '2026-10-01' }],
      ['2026-10-01#2', { ...late, date: '2026-10-01' }],
    ]),
    overrides: new Map(),
  };
}

const ANA = {
  id: 'u-ana',
  firstName: 'Ana',
  lastName: 'Silva',
  certifications: [{ type: CertificationType.DRIVER, validUntil: null }],
  isActive: true,
  roles: [UserRole.EMERGENCY_OPERATIONAL],
};
const JOANA = {
  id: 'u-joana',
  firstName: 'Joana',
  lastName: 'Pinto',
  certifications: [] as Array<{ type: CertificationType; validUntil: string | null }>,
  isActive: true,
  roles: [UserRole.EMERGENCY_OPERATIONAL],
};

function buildPrismaStub(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(ANA),
      findMany: jest.fn().mockResolvedValue([]),
    },
    scheduleAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation((args) =>
          Promise.resolve({
            id: 'a1',
            ...args.data,
            user: ANA,
            role: args.data.roleId === DRIVER_ROLE.id ? DRIVER_ROLE : MEMBER_ROLE,
            assignedBy: { id: 'u-coord', firstName: 'Ana', lastName: 'Ferreira' },
            assignedAt: new Date('2026-09-18T14:20:00.000Z'),
          }),
        ),
      delete: jest.fn().mockResolvedValue({ id: 'a1' }),
      update: jest.fn().mockImplementation((args) =>
        Promise.resolve({
          id: args.where.id,
          scheduleId: 's1',
          date: new Date('2026-10-01T00:00:00.000Z'),
          slot: 1,
          userId: ANA.id,
          roleId: DRIVER_ROLE.id,
          isOverride: false,
          certificationOverrideReason: null,
          ...args.data,
          user: ANA,
          role: DRIVER_ROLE,
          assignedBy: { id: 'u-coord', firstName: 'Ana', lastName: 'Ferreira' },
          assignedById: 'u-coord',
          assignedAt: new Date('2026-09-18T14:20:00.000Z'),
        }),
      ),
    },
    availabilitySubmission: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    availabilityResponse: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  };
}

function buildSchedulesStub(context = makeContext()) {
  return {
    loadContext: jest.fn().mockResolvedValue(context),
    loadDeclinedUserIds: jest.fn().mockResolvedValue(new Set<string>()),
  };
}

const shiftScheduleStub = {
  assertSlotValidForPattern: jest.fn((pattern: { shifts: Array<{ slot: number }> }, slot: number) => {
    if (!pattern.shifts.some((shift) => shift.slot === slot)) {
      throw new BadRequestException(`Shift ${slot} does not exist`);
    }
  }),
};

/** Nobody is on a contract's clock unless a test says otherwise. */
function buildPaidStaffScheduleStub(onClock = false) {
  return {
    isOnClock: jest.fn().mockResolvedValue(onClock),
    loadClockContext: jest.fn().mockResolvedValue(new Map()),
  };
}

function buildVolunteerHoursStub() {
  return { reconcileEntryForCompensation: jest.fn().mockResolvedValue(undefined) };
}

function makeService(
  prisma = buildPrismaStub(),
  schedules = buildSchedulesStub(),
  paidStaffSchedule = buildPaidStaffScheduleStub(),
  volunteerHours = buildVolunteerHoursStub(),
) {
  return {
    service: new ScheduleAssignmentsService(
      prisma as never,
      schedules as never,
      shiftScheduleStub as never,
      paidStaffSchedule as never,
      volunteerHours as never,
    ),
    prisma,
    schedules,
    paidStaffSchedule,
    volunteerHours,
  };
}

const dto = (overrides: Record<string, unknown> = {}) => ({
  date: '2026-10-01',
  slot: 1,
  userId: ANA.id,
  roleId: DRIVER_ROLE.id,
  ...overrides,
});

describe('ScheduleAssignmentsService.assign', () => {
  beforeEach(() => jest.clearAllMocks());

  it('places someone who submitted for the shift, without marking an override', async () => {
    const prisma = buildPrismaStub();
    prisma.availabilitySubmission.findFirst.mockResolvedValue({ id: 'sub1' });
    const { service } = makeService(prisma);

    const result = await service.assign('s1', dto(), 'u-coord');

    expect(prisma.scheduleAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isOverride: false }) }),
    );
    expect(result.isOverride).toBe(false);
    expect(result.availability).toBe('submitted');
  });

  // AC: "Coordinators can assign a person who did not submit availability for
  // that shift … the platform must not block the assignment."
  it('places someone who never submitted, and records it as an override', async () => {
    const prisma = buildPrismaStub();
    prisma.availabilitySubmission.findFirst.mockResolvedValue(null);
    const { service } = makeService(prisma);

    const result = await service.assign('s1', dto(), 'u-coord');

    expect(result.isOverride).toBe(true);
    expect(result.availability).toBe('pending');
    expect(result.assignedById).toBe('u-coord');
  });

  it('places someone who declared no availability, as an override', async () => {
    const prisma = buildPrismaStub();
    const schedules = buildSchedulesStub();
    schedules.loadDeclinedUserIds.mockResolvedValue(new Set([ANA.id]));
    const { service } = makeService(prisma, schedules);

    const result = await service.assign('s1', dto(), 'u-coord');

    expect(result.isOverride).toBe(true);
    expect(result.availability).toBe('declined');
  });

  it('never lets the caller declare its own assignment non-override', async () => {
    const prisma = buildPrismaStub();
    const { service } = makeService(prisma);

    await service.assign('s1', dto({ isOverride: false }) as never, 'u-coord');

    // Whatever the body said, the flag came from the submission lookup.
    expect(prisma.availabilitySubmission.findFirst).toHaveBeenCalled();
    expect(prisma.scheduleAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isOverride: true }) }),
    );
  });

  // A colleague's paid-vs-volunteer status is a coordinator's business, not
  // the rota's — see the privacy fix in `schedules.service.ts`
  // (`canSeeCompensation`). `compensation` must be *absent*, not present as
  // some placeholder, when the caller may not see it (D5).
  it('omits compensation from the response when the caller cannot see it', async () => {
    const prisma = buildPrismaStub();
    const { service } = makeService(prisma);

    const result = await service.assign(
      's1',
      dto({ compensation: AssignmentCompensationKind.PAID }),
      'u-coord',
      false,
    );

    expect(result).not.toHaveProperty('compensation');
  });

  it('includes compensation in the response when the caller may see it', async () => {
    const prisma = buildPrismaStub();
    const { service } = makeService(prisma);

    const result = await service.assign(
      's1',
      dto({ compensation: AssignmentCompensationKind.PAID }),
      'u-coord',
      true,
    );

    expect(result).toHaveProperty('compensation', AssignmentCompensationKind.PAID);
  });

  it('defaults to VOLUNTEER off the clock with no explicit call', async () => {
    const { service } = makeService(buildPrismaStub(), buildSchedulesStub(), buildPaidStaffScheduleStub(false));

    const result = await service.assign('s1', dto(), 'u-coord', true);

    expect(result.compensation).toBe(AssignmentCompensationKind.VOLUNTEER);
  });

  it('D2: resolves SALARY on the contract clock, even overriding an explicit PAID call', async () => {
    const { service } = makeService(buildPrismaStub(), buildSchedulesStub(), buildPaidStaffScheduleStub(true));

    const result = await service.assign(
      's1',
      dto({ compensation: AssignmentCompensationKind.PAID }),
      'u-coord',
      true,
    );

    expect(result.compensation).toBe(AssignmentCompensationKind.SALARY);
  });

  it('refuses an explicit SALARY call — it is resolved, never chosen', async () => {
    const { service } = makeService();
    await expect(
      service.assign('s1', dto({ compensation: AssignmentCompensationKind.SALARY }), 'u-coord'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only stamps compensationSetById/At when an explicit call was made', async () => {
    const prisma = buildPrismaStub();
    const { service } = makeService(prisma);

    await service.assign('s1', dto(), 'u-coord');
    expect(prisma.scheduleAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ compensationSetById: expect.anything() }),
      }),
    );

    await service.assign('s1', dto({ compensation: AssignmentCompensationKind.PAID }), 'u-coord');
    expect(prisma.scheduleAssignment.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ compensationSetById: 'u-coord' }),
      }),
    );
  });

  // AC: every requirement is overridable, the driver post included, but never
  // without a reason.
  it('refuses an uncertified person on the driver role without a reason', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findUnique.mockResolvedValue(JOANA);
    const { service } = makeService(prisma);

    await expect(service.assign('s1', dto({ userId: JOANA.id }), 'u-coord')).rejects.toThrow(
      /needs a reason/i,
    );
    expect(prisma.scheduleAssignment.create).not.toHaveBeenCalled();
  });

  it('assigns an uncertified person to the driver role given a reason, recorded on the assignment', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findUnique.mockResolvedValue(JOANA);
    const { service } = makeService(prisma);

    await service.assign(
      's1',
      dto({ userId: JOANA.id, overrideReason: 'Only driver available tonight' }),
      'u-coord',
    );

    expect(prisma.scheduleAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          certificationOverrideReason: 'Only driver available tonight',
        }),
      }),
    );
  });

  it('a blank reason does not count as a reason', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findUnique.mockResolvedValue(JOANA);
    const { service } = makeService(prisma);

    await expect(
      service.assign('s1', dto({ userId: JOANA.id, overrideReason: '   ' }), 'u-coord'),
    ).rejects.toThrow(/needs a reason/i);
  });

  it('ignores a reason nobody needed — the certified driver needs none', async () => {
    const prisma = buildPrismaStub();
    const { service } = makeService(prisma);

    await service.assign('s1', dto({ overrideReason: 'not needed' }), 'u-coord');

    expect(prisma.scheduleAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ certificationOverrideReason: null }) }),
    );
  });

  it('allows an uncertified person on a role that does not require it', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findUnique.mockResolvedValue(JOANA);
    const { service } = makeService(prisma);

    await expect(
      service.assign('s1', dto({ userId: JOANA.id, roleId: MEMBER_ROLE.id }), 'u-coord'),
    ).resolves.toBeDefined();
  });

  it('refuses to fill a role past its headcount', async () => {
    const prisma = buildPrismaStub();
    prisma.scheduleAssignment.findMany.mockResolvedValue([
      { userId: 'u-other', roleId: DRIVER_ROLE.id, role: DRIVER_ROLE, user: JOANA },
    ]);
    const { service } = makeService(prisma);

    await expect(service.assign('s1', dto(), 'u-coord')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('lets an unlimited role take as many people as the coordinator assigns', async () => {
    const pool = { ...MEMBER_ROLE, id: 'r-pool', name: 'Helper', maxPeople: 0 };
    const prisma = buildPrismaStub();
    prisma.scheduleAssignment.findMany.mockResolvedValue([
      { userId: 'u-a', roleId: pool.id, role: pool, user: JOANA },
      { userId: 'u-b', roleId: pool.id, role: pool, user: JOANA },
      { userId: 'u-c', roleId: pool.id, role: pool, user: JOANA },
    ]);
    const { service } = makeService(prisma, buildSchedulesStub(makeContext([pool] as never)));

    await expect(
      service.assign('s1', dto({ roleId: pool.id }), 'u-coord'),
    ).resolves.toBeDefined();
  });

  // AC: double-booking "including the same person in two roles on one shift".
  it('refuses the same person twice on one shift', async () => {
    const prisma = buildPrismaStub();
    prisma.scheduleAssignment.findMany.mockResolvedValue([
      { userId: ANA.id, roleId: MEMBER_ROLE.id, role: MEMBER_ROLE, user: ANA },
    ]);
    const { service } = makeService(prisma);

    await expect(service.assign('s1', dto(), 'u-coord')).rejects.toThrow(
      /already on this shift/i,
    );
  });

  it('refuses a shift the window does not have that day', async () => {
    const { service } = makeService();
    await expect(service.assign('s1', dto({ slot: 6 }), 'u-coord')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses a date outside the window', async () => {
    const { service } = makeService();
    await expect(
      service.assign('s1', dto({ date: '2026-11-15' }), 'u-coord'),
    ).rejects.toThrow(/outside/i);
  });

  it('refuses a role belonging to another window', async () => {
    const { service } = makeService();
    await expect(
      service.assign('s1', dto({ roleId: 'r-elsewhere' }), 'u-coord'),
    ).rejects.toThrow(/does not belong/i);
  });

  it('requires a role when the window defines them', async () => {
    const { service } = makeService();
    await expect(service.assign('s1', dto({ roleId: undefined }), 'u-coord')).rejects.toThrow(
      /roleId is required/i,
    );
  });

  // AC: "a window with no roles schedules people without one".
  it('schedules without a role when the window defines none', async () => {
    const prisma = buildPrismaStub();
    const { service } = makeService(prisma, buildSchedulesStub(makeContext([] as never)));

    await service.assign('s1', dto({ roleId: undefined }), 'u-coord');

    expect(prisma.scheduleAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ roleId: null }) }),
    );
  });

  it('rejects a role on a window that defines none', async () => {
    const { service } = makeService(buildPrismaStub(), buildSchedulesStub(makeContext([] as never)));
    await expect(service.assign('s1', dto(), 'u-coord')).rejects.toThrow(/defines no roles/i);
  });

  it('refuses someone who is no longer active', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findUnique.mockResolvedValue({ ...ANA, isActive: false });
    const { service } = makeService(prisma);

    await expect(service.assign('s1', dto(), 'u-coord')).rejects.toThrow(/not an active member/i);
  });

  it('refuses someone outside the field roster', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findUnique.mockResolvedValue({
      ...ANA,
      roles: [UserRole.LOGISTICS_COORDINATOR],
    });
    const { service } = makeService(prisma);

    await expect(service.assign('s1', dto(), 'u-coord')).rejects.toThrow(/not field personnel/i);
  });

  it('a dual-role person is assignable if any held role is field-eligible', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findUnique.mockResolvedValue({
      ...ANA,
      roles: [UserRole.LOGISTICS_COORDINATOR, UserRole.EMERGENCY_OPERATIONAL],
    });
    const { service } = makeService(prisma);

    await expect(service.assign('s1', dto(), 'u-coord')).resolves.toBeDefined();
  });

  it('404s an unknown person', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findUnique.mockResolvedValue(null);
    const { service } = makeService(prisma);

    await expect(service.assign('s1', dto(), 'u-coord')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

// ── Members adding themselves to a published rota ──────────────────────────────
//
// A published schedule is posted to the whole platform and anyone may take an
// open place on it. They cannot vacate one: coming off a rota other people are
// relying on goes through a coordinator, who can find the replacement.

describe('ScheduleAssignmentsService.selfAssign', () => {
  /**
   * The day this suite is judged against. `today()` reads the real clock, and
   * whether a shift is in the past is now a rule the service enforces — so
   * without freezing it, every fixture date here would quietly become "past"
   * the moment the wall clock caught up with it, and this suite would start
   * failing on a date rather than on a change.
   */
  const FROZEN_TODAY = '2026-09-15';
  const PAST_DATE = '2026-08-01';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(certificationsUtil, 'today').mockReturnValue(FROZEN_TODAY);
  });

  afterAll(() => jest.restoreAllMocks());

  const published = (roles = [DRIVER_ROLE, MEMBER_ROLE]) => {
    const context = makeContext(roles);
    return { ...context, status: 'PUBLISHED' as never };
  };

  const selfDto = (overrides: Record<string, unknown> = {}) => ({
    date: '2026-10-01',
    slot: 1,
    roleId: MEMBER_ROLE.id,
    ...overrides,
  });

  /** An ordinary field member — no `MANAGE_SCHEDULES`, so every rule below applies to them. */
  const member = (id: string) => ({ id, roles: [UserRole.EMERGENCY_OPERATIONAL] });

  /** Someone who may correct a past rota: `MANAGE_SCHEDULES` is the only key that opens it. */
  const coordinator = (id: string) => ({ id, roles: [UserRole.EMERGENCY_COORDINATOR] });

  /** The published context plus one day that has already been and gone. */
  const publishedWithPastDay = () => {
    const context = published();
    const shift = context.shifts.get('2026-10-01#1')!;
    return {
      ...context,
      pattern: [
        ...context.pattern,
        {
          date: PAST_DATE,
          isWeekend: false,
          isHoliday: false,
          holidayName: null,
          shifts: context.pattern[0].shifts,
        },
      ],
      shifts: new Map([...context.shifts, [`${PAST_DATE}#1`, { ...shift, date: PAST_DATE }]]),
    } as ScheduleContext;
  };

  it('puts the caller on the shift, stamped as their own doing', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findUnique.mockResolvedValue(JOANA);
    const { service } = makeService(prisma, buildSchedulesStub(published()));

    const result = await service.selfAssign('s1', selfDto(), member(JOANA.id));

    expect(prisma.scheduleAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: JOANA.id, assignedById: JOANA.id }),
      }),
    );
    expect(result.userId).toBe(JOANA.id);
  });

  it('cannot be used to volunteer somebody else', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findUnique.mockResolvedValue(JOANA);
    const { service } = makeService(prisma, buildSchedulesStub(published()));

    // A userId in the body is not part of the DTO and is ignored outright.
    await service.selfAssign('s1', selfDto({ userId: ANA.id }) as never, member(JOANA.id));

    expect(prisma.scheduleAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: JOANA.id }) }),
    );
  });

  it('refuses a shift that has already happened', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findUnique.mockResolvedValue(JOANA);
    const { service } = makeService(prisma, buildSchedulesStub(publishedWithPastDay()));

    await expect(
      service.selfAssign('s1', selfDto({ date: PAST_DATE }), member(JOANA.id)),
    ).rejects.toThrow(/already passed/i);
    expect(prisma.scheduleAssignment.create).not.toHaveBeenCalled();
  });

  it('lets an emergency coordinator correct a past rota — MANAGE_SCHEDULES is the door', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findUnique.mockResolvedValue(JOANA);
    const { service } = makeService(prisma, buildSchedulesStub(publishedWithPastDay()));

    await service.selfAssign('s1', selfDto({ date: PAST_DATE }), coordinator(JOANA.id));

    expect(prisma.scheduleAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: JOANA.id }) }),
    );
  });

  it('leaves today’s own shift open — "past" means before today, not earlier today', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findUnique.mockResolvedValue(JOANA);
    const context = published();
    const shift = context.shifts.get('2026-10-01#1')!;
    const withToday = {
      ...context,
      pattern: [
        ...context.pattern,
        {
          date: FROZEN_TODAY,
          isWeekend: false,
          isHoliday: false,
          holidayName: null,
          shifts: context.pattern[0].shifts,
        },
      ],
      shifts: new Map([...context.shifts, [`${FROZEN_TODAY}#1`, { ...shift, date: FROZEN_TODAY }]]),
    } as ScheduleContext;
    const { service } = makeService(prisma, buildSchedulesStub(withToday));

    await service.selfAssign('s1', selfDto({ date: FROZEN_TODAY }), member(JOANA.id));

    expect(prisma.scheduleAssignment.create).toHaveBeenCalled();
  });

  it('refuses a schedule that is still a draft', async () => {
    const { service } = makeService(buildPrismaStub(), buildSchedulesStub(makeContext()));

    await expect(service.selfAssign('s1', selfDto(), member(JOANA.id))).rejects.toThrow(
      /not been published/i,
    );
  });

  // Self-assignment has no override path — see `SelfAssignDto`, which carries
  // no `overrideReason` field at all. The rule holds however the request
  // arrives: it just surfaces as "needs a reason" here too, since nothing
  // supplies one.
  it('refuses an uncertified person on the driver role', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findUnique.mockResolvedValue(JOANA);
    const { service } = makeService(prisma, buildSchedulesStub(published()));

    await expect(
      service.selfAssign('s1', selfDto({ roleId: DRIVER_ROLE.id }), member(JOANA.id)),
    ).rejects.toThrow(/needs a reason/i);
    expect(prisma.scheduleAssignment.create).not.toHaveBeenCalled();
  });

  it('lets a certified driver take the driver role', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findUnique.mockResolvedValue(ANA);
    const { service } = makeService(prisma, buildSchedulesStub(published()));

    await expect(
      service.selfAssign('s1', selfDto({ roleId: DRIVER_ROLE.id }), member(ANA.id)),
    ).resolves.toBeDefined();
  });

  it('refuses a role that is already full', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findUnique.mockResolvedValue(ANA);
    prisma.scheduleAssignment.findMany.mockResolvedValue([
      {
        userId: 'u-other',
        date: new Date('2026-10-01T00:00:00.000Z'),
        slot: 1,
        roleId: DRIVER_ROLE.id,
        role: DRIVER_ROLE,
        user: ANA,
      },
    ]);
    const { service } = makeService(prisma, buildSchedulesStub(published()));

    await expect(
      service.selfAssign('s1', selfDto({ roleId: DRIVER_ROLE.id }), member(ANA.id)),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses someone already on the shift in another role', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findUnique.mockResolvedValue(ANA);
    prisma.scheduleAssignment.findMany.mockResolvedValue([
      {
        userId: ANA.id,
        date: new Date('2026-10-01T00:00:00.000Z'),
        slot: 1,
        roleId: DRIVER_ROLE.id,
        role: DRIVER_ROLE,
        user: ANA,
      },
    ]);
    const { service } = makeService(prisma, buildSchedulesStub(published()));

    await expect(service.selfAssign('s1', selfDto(), member(ANA.id))).rejects.toThrow(
      /already on this shift/i,
    );
  });

  // A coordinator may knowingly create a clash mid-swap; nobody should be able
  // to double-book themselves by accident.
  it('refuses a shift overlapping one the caller already holds', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findUnique.mockResolvedValue(ANA);
    // Slot 2 is 15:00–24:00, which overlaps slot 1's 08:00–16:00.
    prisma.scheduleAssignment.findMany.mockResolvedValue([
      { userId: ANA.id, date: new Date('2026-10-01T00:00:00.000Z'), slot: 2 },
    ]);
    const { service } = makeService(prisma, buildSchedulesStub(published()));

    await expect(service.selfAssign('s1', selfDto(), member(ANA.id))).rejects.toThrow(
      /already on 15:00–24:00/i,
    );
  });

  // Same guard, but the overlap exists only because a coordinator moved slot
  // 2 earlier for this schedule — the window's own 15:00–24:00 never would
  // have clashed. `loadContext` bakes an adjustment straight into
  // `context.shifts`, so this is what it hands the guard once one is made.
  it('refuses a shift that only overlaps because the other one was adjusted', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findUnique.mockResolvedValue(ANA);
    prisma.scheduleAssignment.findMany.mockResolvedValue([
      { userId: ANA.id, date: new Date('2026-10-01T00:00:00.000Z'), slot: 2 },
    ]);
    const context = published();
    context.shifts.set('2026-10-01#2', {
      ...context.shifts.get('2026-10-01#2')!,
      startMinute: 720,
      endMinute: 1200,
      label: '12:00–20:00',
    });
    const { service } = makeService(prisma, buildSchedulesStub(context));

    await expect(service.selfAssign('s1', selfDto(), member(ANA.id))).rejects.toThrow(
      /already on 12:00–20:00/i,
    );
  });

  it('refuses someone outside the field roster', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findUnique.mockResolvedValue({
      ...JOANA,
      roles: [UserRole.LOGISTICS_COORDINATOR],
    });
    const { service } = makeService(prisma, buildSchedulesStub(published()));

    await expect(service.selfAssign('s1', selfDto(), member(JOANA.id))).rejects.toThrow(
      /not field personnel/i,
    );
  });

  it('refuses a shift the window does not have that day', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findUnique.mockResolvedValue(JOANA);
    const { service } = makeService(prisma, buildSchedulesStub(published()));

    await expect(
      service.selfAssign('s1', selfDto({ slot: 6 }), member(JOANA.id)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('signs on to a window with no roles without one', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findUnique.mockResolvedValue(JOANA);
    const { service } = makeService(prisma, buildSchedulesStub(published([] as never)));

    await service.selfAssign('s1', selfDto({ roleId: undefined }), member(JOANA.id));

    expect(prisma.scheduleAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ roleId: null }) }),
    );
  });
});

describe('ScheduleAssignmentsService.unassign', () => {
  beforeEach(() => jest.clearAllMocks());

  it('removes an assignment from its own schedule', async () => {
    const prisma = buildPrismaStub();
    prisma.scheduleAssignment.findUnique.mockResolvedValue({ id: 'a1', scheduleId: 's1' });
    const { service } = makeService(prisma);

    await expect(service.unassign('s1', 'a1')).resolves.toEqual({ id: 'a1' });
    expect(prisma.scheduleAssignment.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
  });

  it('refuses to remove an assignment belonging to another schedule', async () => {
    const prisma = buildPrismaStub();
    prisma.scheduleAssignment.findUnique.mockResolvedValue({ id: 'a1', scheduleId: 's2' });
    const { service } = makeService(prisma);

    await expect(service.unassign('s1', 'a1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.scheduleAssignment.delete).not.toHaveBeenCalled();
  });
});

describe('ScheduleAssignmentsService.setCompensation', () => {
  beforeEach(() => jest.clearAllMocks());

  const assignmentRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'a1',
    scheduleId: 's1',
    date: new Date('2026-10-01T00:00:00.000Z'),
    slot: 1,
    userId: ANA.id,
    roleId: DRIVER_ROLE.id,
    isOverride: false,
    certificationOverrideReason: null,
    compensation: 'VOLUNTEER',
    assignedById: 'u-coord',
    assignedAt: new Date('2026-09-18T14:20:00.000Z'),
    user: ANA,
    role: DRIVER_ROLE,
    assignedBy: { id: 'u-coord', firstName: 'Ana', lastName: 'Ferreira' },
    ...overrides,
  });

  it('404s when an assignment does not belong to this shift', async () => {
    const prisma = buildPrismaStub();
    prisma.scheduleAssignment.findMany.mockResolvedValue([]);
    const { service } = makeService(prisma);

    await expect(
      service.setCompensation(
        's1',
        '2026-10-01',
        1,
        { assignments: [{ assignmentId: 'a1', compensation: AssignmentCompensationKind.PAID }] },
        'u-coord',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses an explicit SALARY entry', async () => {
    const prisma = buildPrismaStub();
    prisma.scheduleAssignment.findMany.mockResolvedValue([assignmentRow()]);
    const { service } = makeService(prisma);

    await expect(
      service.setCompensation(
        's1',
        '2026-10-01',
        1,
        { assignments: [{ assignmentId: 'a1', compensation: AssignmentCompensationKind.SALARY }] },
        'u-coord',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.scheduleAssignment.update).not.toHaveBeenCalled();
  });

  it("D2: rejects reclassifying someone who is on their contract's clock for this shift", async () => {
    const prisma = buildPrismaStub();
    prisma.scheduleAssignment.findMany.mockResolvedValue([assignmentRow()]);
    const paidStaffSchedule = buildPaidStaffScheduleStub();
    paidStaffSchedule.loadClockContext.mockResolvedValue(
      new Map([
        [
          ANA.id,
          {
            contracts: [{ startDate: '2020-01-01', endDate: null }],
            blocks: [{ id: 'b1', userId: ANA.id, dayOfWeek: 4, startMinute: 0, endMinute: 1440, effectiveFrom: '2020-01-01', effectiveTo: null }],
            overrides: [],
          },
        ],
      ]),
    );
    const { service } = makeService(prisma, buildSchedulesStub(), paidStaffSchedule);

    await expect(
      service.setCompensation(
        's1',
        '2026-10-01',
        1,
        { assignments: [{ assignmentId: 'a1', compensation: AssignmentCompensationKind.PAID }] },
        'u-coord',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.scheduleAssignment.update).not.toHaveBeenCalled();
  });

  it('classifies an off-clock assignee PAID and reconciles the volunteer-hours entry', async () => {
    const prisma = buildPrismaStub();
    prisma.scheduleAssignment.findMany.mockResolvedValue([assignmentRow()]);
    const { service, volunteerHours } = makeService(prisma);

    const result = await service.setCompensation(
      's1',
      '2026-10-01',
      1,
      { assignments: [{ assignmentId: 'a1', compensation: AssignmentCompensationKind.PAID }] },
      'u-coord',
    );

    expect(prisma.scheduleAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a1' },
        data: expect.objectContaining({ compensation: AssignmentCompensationKind.PAID, compensationSetById: 'u-coord' }),
      }),
    );
    expect(volunteerHours.reconcileEntryForCompensation).toHaveBeenCalledWith(
      expect.objectContaining({ assignmentId: 'a1', newCompensation: AssignmentCompensationKind.PAID, actorId: 'u-coord' }),
    );
    expect(result[0]).toHaveProperty('compensation', AssignmentCompensationKind.PAID);
  });

  it('validates every entry before writing any of them — a batch veto leaves nothing half-applied', async () => {
    const prisma = buildPrismaStub();
    prisma.scheduleAssignment.findMany.mockResolvedValue([
      assignmentRow({ id: 'a1', userId: ANA.id }),
      assignmentRow({ id: 'a2', userId: JOANA.id }),
    ]);
    const paidStaffSchedule = buildPaidStaffScheduleStub();
    paidStaffSchedule.loadClockContext.mockResolvedValue(
      new Map([
        [ANA.id, { contracts: [], blocks: [], overrides: [] }],
        [
          JOANA.id,
          {
            contracts: [{ startDate: '2020-01-01', endDate: null }],
            blocks: [{ id: 'b1', userId: JOANA.id, dayOfWeek: 4, startMinute: 0, endMinute: 1440, effectiveFrom: '2020-01-01', effectiveTo: null }],
            overrides: [],
          },
        ],
      ]),
    );
    const { service } = makeService(prisma, buildSchedulesStub(), paidStaffSchedule);

    await expect(
      service.setCompensation(
        's1',
        '2026-10-01',
        1,
        {
          assignments: [
            { assignmentId: 'a1', compensation: AssignmentCompensationKind.PAID },
            { assignmentId: 'a2', compensation: AssignmentCompensationKind.PAID },
          ],
        },
        'u-coord',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.scheduleAssignment.update).not.toHaveBeenCalled();
  });
});

describe('ScheduleAssignmentsService.getCandidates', () => {
  beforeEach(() => jest.clearAllMocks());

  const roster = [ANA, JOANA, { ...JOANA, id: 'u-luisa', firstName: 'Luísa', lastName: 'Rocha' }];

  // AC: "the people who submitted availability for it are surfaced first,
  // marked as available, and assignable in one action".
  it('splits submitters from everyone else', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findMany.mockResolvedValue(roster);
    prisma.availabilitySubmission.findMany.mockResolvedValue([{ userId: ANA.id }]);
    const { service } = makeService(prisma);

    const result = await service.getCandidates('s1', '2026-10-01', 1, MEMBER_ROLE.id);

    expect(result.available.map((c) => c.id)).toEqual([ANA.id]);
    expect(result.available[0].availability).toBe('submitted');
    expect(result.others.map((c) => c.id)).toEqual(['u-joana', 'u-luisa']);
  });

  it('marks who declined the window, so it can be said out loud', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findMany.mockResolvedValue([JOANA]);
    const schedules = buildSchedulesStub();
    schedules.loadDeclinedUserIds.mockResolvedValue(new Set([JOANA.id]));
    const { service } = makeService(prisma, schedules);

    const result = await service.getCandidates('s1', '2026-10-01', 1, MEMBER_ROLE.id);

    expect(result.others[0].availability).toBe('declined');
  });

  // Reversed from the old "driver is a bar" behaviour: every requirement is
  // now overridable, so uncertified people are listed — flagged via their own
  // `certifications`, which the assign dialog checks against the role's
  // `requiredCertification` — rather than hidden from the picker entirely.
  it('lists uncertified people for a driver role too, rather than excluding them', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findMany.mockResolvedValue(roster);
    const { service } = makeService(prisma);

    const result = await service.getCandidates('s1', '2026-10-01', 1, DRIVER_ROLE.id);

    const ids = [...result.available, ...result.others].map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([ANA.id, JOANA.id, 'u-luisa']));
    const joana = result.others.find((c) => c.id === JOANA.id);
    expect(joana?.certifications).toEqual([]);
    const ana = [...result.available, ...result.others].find((c) => c.id === ANA.id);
    expect(ana?.isDriver).toBe(true);
  });

  it('orders each group by fewest duties, then by name', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findMany.mockResolvedValue(roster);
    prisma.scheduleAssignment.findMany.mockResolvedValue([
      { userId: JOANA.id, date: new Date('2026-10-02T00:00:00.000Z'), slot: 1, role: null },
      { userId: JOANA.id, date: new Date('2026-10-03T00:00:00.000Z'), slot: 1, role: null },
    ]);
    const { service } = makeService(prisma);

    const result = await service.getCandidates('s1', '2026-10-01', 1, MEMBER_ROLE.id);

    // Rocha (0 duties) before Pinto (2), despite the alphabet.
    expect(result.others.map((c) => c.lastName)).toEqual(['Rocha', 'Silva', 'Pinto']);
  });

  it('says when someone is already on this shift, and in what', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findMany.mockResolvedValue([ANA]);
    prisma.scheduleAssignment.findMany.mockResolvedValue([
      {
        userId: ANA.id,
        date: new Date('2026-10-01T00:00:00.000Z'),
        slot: 1,
        role: { name: 'Driver' },
      },
    ]);
    const { service } = makeService(prisma);

    const result = await service.getCandidates('s1', '2026-10-01', 1, MEMBER_ROLE.id);

    expect(result.others[0].alreadyOnShift).toBe(true);
    expect(result.others[0].currentRoleName).toBe('Driver');
  });

  it('warns about an overlapping duty the same day', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findMany.mockResolvedValue([ANA]);
    // Slot 2 is 15:00–24:00, which overlaps slot 1's 08:00–16:00.
    prisma.scheduleAssignment.findMany.mockResolvedValue([
      { userId: ANA.id, date: new Date('2026-10-01T00:00:00.000Z'), slot: 2, role: null },
    ]);
    const { service } = makeService(prisma);

    const result = await service.getCandidates('s1', '2026-10-01', 1, MEMBER_ROLE.id);

    expect(result.others[0].conflictLabel).toMatch(/15:00–24:00/);
  });
});
