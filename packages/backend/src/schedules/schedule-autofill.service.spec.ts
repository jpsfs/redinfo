import {
  AvailabilityWindowCategory,
  AvailabilityWindowStatus,
  CertificationType,
} from '@redinfo/shared';
import { ScheduleAutofillService } from './schedule-autofill.service';
import { ScheduleContext } from './schedules.service';

// ── Generating a first draft from availability (ADO #161, generalised #163) ────
//
// AC: "Coordinators can manually adjust the generated schedule before
// publishing." The generator only ever places people who submitted for the
// shift — an override is a human decision — and it is deterministic, so
// re-running it does not reshuffle a rota someone has already read. Autofill
// never overrides a `requiredCertification` either: unlike a coordinator
// assigning by hand, a person who lacks a post's requirement is simply not a
// candidate for it.

const DRIVER_ROLE = {
  id: 'r-driver',
  windowId: 'w1',
  name: 'Driver',
  maxPeople: 1,
  requiredCertification: CertificationType.DRIVER,
  order: 0,
};
const LEADER_ROLE = {
  id: 'r-leader',
  windowId: 'w1',
  name: 'Team Leader',
  maxPeople: 1,
  requiredCertification: null,
  order: 1,
};
const MEMBER_ROLE = {
  id: 'r-member',
  windowId: 'w1',
  name: 'Team Member',
  maxPeople: 1,
  requiredCertification: null,
  order: 2,
};

const driverCert = [{ type: CertificationType.DRIVER, validUntil: null }];
const noCerts: Array<{ type: CertificationType; validUntil: string | null }> = [];

const ANA = { id: 'u-ana', firstName: 'Ana', lastName: 'Silva', certifications: driverCert };
const PEDRO = { id: 'u-pedro', firstName: 'Pedro', lastName: 'Neves', certifications: driverCert };
const JOANA = { id: 'u-joana', firstName: 'Joana', lastName: 'Pinto', certifications: noCerts };
const LUISA = { id: 'u-luisa', firstName: 'Luísa', lastName: 'Rocha', certifications: noCerts };
const ROSTER = [ANA, PEDRO, JOANA, LUISA];

function makeContext({
  roles = [DRIVER_ROLE, LEADER_ROLE, MEMBER_ROLE],
  days = [{ date: '2026-10-03', vehiclesNeeded: 1 }],
}: {
  roles?: Array<{
    id: string;
    windowId: string;
    name: string;
    maxPeople: number;
    requiredCertification: CertificationType | null;
    order: number;
  }>;
  days?: Array<{ date: string; vehiclesNeeded: number }>;
} = {}): ScheduleContext {
  const shifts = new Map<string, never>();
  const pattern = days.map((day) => {
    const shift = {
      slot: 1,
      startMinute: 480,
      endMinute: 960,
      vehiclesNeeded: day.vehiclesNeeded,
      label: '08:00–16:00',
    };
    shifts.set(`${day.date}#1`, { ...shift, date: day.date } as never);
    return {
      date: day.date,
      isWeekend: true,
      isHoliday: false,
      holidayName: null,
      shifts: [shift],
    };
  });

  return {
    scheduleId: 's1',
    status: 'DRAFT' as never,
    window: {
      id: 'w1',
      startDate: days[0].date,
      endDate: days[days.length - 1].date,
      category: AvailabilityWindowCategory.EMERGENCY,
      name: 'October 2026',
      status: AvailabilityWindowStatus.OPEN,
    } as never,
    roles: roles as never,
    pattern: pattern as never,
    shifts,
  };
}

/** Everyone in `people` submitted for every shift of `days`. */
function submissionsFor(people: typeof ROSTER, days: string[], slot = 1) {
  return days.flatMap((date) =>
    people.map((person) => ({
      userId: person.id,
      date: new Date(`${date}T00:00:00.000Z`),
      slot,
    })),
  );
}

function buildPrismaStub(overrides: Record<string, unknown> = {}) {
  return {
    user: { findMany: jest.fn().mockResolvedValue(ROSTER) },
    availabilitySubmission: { findMany: jest.fn().mockResolvedValue([]) },
    scheduleAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    ...overrides,
  };
}

function makeService(prisma: ReturnType<typeof buildPrismaStub>, context = makeContext()) {
  const schedules = { loadContext: jest.fn().mockResolvedValue(context) };
  return new ScheduleAutofillService(prisma as never, schedules as never);
}

/** The rows the run would write, as `date/slot/user/role`. */
function written(prisma: ReturnType<typeof buildPrismaStub>): string[] {
  const calls = prisma.scheduleAssignment.createMany.mock.calls;
  if (calls.length === 0) return [];
  return (calls[0][0].data as Array<Record<string, unknown>>).map(
    (row) =>
      `${(row.date as Date).toISOString().slice(0, 10)}/${row.slot}/${row.userId}/${row.roleId ?? '-'}`,
  );
}

describe('ScheduleAutofillService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fills each role from the people who submitted for that shift', async () => {
    const prisma = buildPrismaStub();
    prisma.availabilitySubmission.findMany.mockResolvedValue(
      submissionsFor([ANA, JOANA, LUISA], ['2026-10-03']),
    );
    const service = makeService(prisma);

    const report = await service.autofill('s1', {}, 'u-coord');

    expect(written(prisma)).toEqual([
      '2026-10-03/1/u-ana/r-driver',
      '2026-10-03/1/u-joana/r-leader',
      '2026-10-03/1/u-luisa/r-member',
    ]);
    expect(report).toEqual({ placed: 3, unfilled: 0, shiftsWithoutDriver: 0 });
  });

  // The rule the story calls out: drivers are counted per vehicle, so a
  // two-vehicle shift needs two certified people even though Driver holds one.
  it('puts a second certified driver in another role when the shift crews two vehicles', async () => {
    const prisma = buildPrismaStub();
    prisma.availabilitySubmission.findMany.mockResolvedValue(
      submissionsFor([ANA, PEDRO, JOANA], ['2026-10-03']),
    );
    const service = makeService(
      prisma,
      makeContext({ days: [{ date: '2026-10-03', vehiclesNeeded: 2 }] }),
    );

    const report = await service.autofill('s1', {}, 'u-coord');

    // Both certified people land on the shift: one takes the Driver post, and
    // the other is preferred for Team Leader over Joana purely because the
    // shift is still a driver short. Which of the two leads is decided by
    // surname (Neves before Silva) — a tie-break, not a rule.
    expect(written(prisma)).toEqual([
      '2026-10-03/1/u-pedro/r-driver',
      '2026-10-03/1/u-ana/r-leader',
      '2026-10-03/1/u-joana/r-member',
    ]);
    expect(report.shiftsWithoutDriver).toBe(0);
  });

  it('only ever puts a certified driver in the driver role', async () => {
    const prisma = buildPrismaStub();
    prisma.availabilitySubmission.findMany.mockResolvedValue(
      submissionsFor([JOANA, LUISA], ['2026-10-03']),
    );
    const service = makeService(prisma);

    const report = await service.autofill('s1', {}, 'u-coord');

    expect(written(prisma)).toEqual([
      '2026-10-03/1/u-joana/r-leader',
      '2026-10-03/1/u-luisa/r-member',
    ]);
    expect(report.shiftsWithoutDriver).toBe(1);
    expect(report.unfilled).toBe(1);
  });

  // Generalised for ADO #163: the same skip-not-override rule applies to any
  // requiredCertification, not only DRIVER.
  it('never places anyone lacking a non-driver requiredCertification either', async () => {
    const tasRole = { ...LEADER_ROLE, requiredCertification: CertificationType.TAS };
    const prisma = buildPrismaStub();
    prisma.availabilitySubmission.findMany.mockResolvedValue(
      submissionsFor([ANA, JOANA], ['2026-10-03']),
    );
    // vehiclesNeeded: 0 keeps the driver-preference tiebreak out of it — this
    // test is only about the requiredCertification skip.
    const service = makeService(
      prisma,
      makeContext({ roles: [tasRole, MEMBER_ROLE], days: [{ date: '2026-10-03', vehiclesNeeded: 0 }] }),
    );

    await service.autofill('s1', {}, 'u-coord');

    // Neither ANA nor JOANA holds TAS, so the leader post stays empty —
    // autofill never overrides, unlike a coordinator assigning by hand.
    expect(written(prisma)).toEqual(['2026-10-03/1/u-joana/r-member']);
  });

  it('never places anyone who did not submit for the shift', async () => {
    const prisma = buildPrismaStub();
    prisma.availabilitySubmission.findMany.mockResolvedValue([]);
    const service = makeService(prisma);

    const report = await service.autofill('s1', {}, 'u-coord');

    expect(prisma.scheduleAssignment.createMany).not.toHaveBeenCalled();
    expect(report).toEqual({ placed: 0, unfilled: 3, shiftsWithoutDriver: 1 });
  });

  it('marks everything it writes as coming from availability, never an override', async () => {
    const prisma = buildPrismaStub();
    prisma.availabilitySubmission.findMany.mockResolvedValue(
      submissionsFor([ANA], ['2026-10-03']),
    );
    const service = makeService(prisma);

    await service.autofill('s1', {}, 'u-coord');

    const rows = prisma.scheduleAssignment.createMany.mock.calls[0][0].data;
    expect(rows.every((row: { isOverride: boolean }) => row.isOverride === false)).toBe(true);
  });

  // Three willing people, two places a shift, three shifts: the load can come
  // out two duties each, or three-and-three-and-nothing. Fairness is about the
  // total each person carries, not about who gets which role.
  const DAYS = ['2026-10-03', '2026-10-04', '2026-10-05'];

  const dutiesPerPerson = (prisma: ReturnType<typeof buildPrismaStub>) => {
    const counts: Record<string, number> = {};
    for (const row of written(prisma)) {
      const userId = row.split('/')[2];
      counts[userId] = (counts[userId] ?? 0) + 1;
    }
    return counts;
  };

  const spreadContext = () =>
    makeContext({
      roles: [LEADER_ROLE, MEMBER_ROLE],
      days: DAYS.map((date) => ({ date, vehiclesNeeded: 0 })),
    });

  it('spreads duties evenly across the window when fairness is on', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findMany.mockResolvedValue([JOANA, LUISA, ANA]);
    prisma.availabilitySubmission.findMany.mockResolvedValue(
      submissionsFor([JOANA, LUISA, ANA], DAYS),
    );

    await makeService(prisma, spreadContext()).autofill('s1', { fairness: true }, 'u-coord');

    expect(dutiesPerPerson(prisma)).toEqual({ 'u-joana': 2, 'u-luisa': 2, 'u-ana': 2 });
  });

  it('leans on the same few when fairness is off', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findMany.mockResolvedValue([JOANA, LUISA, ANA]);
    prisma.availabilitySubmission.findMany.mockResolvedValue(
      submissionsFor([JOANA, LUISA, ANA], DAYS),
    );

    await makeService(prisma, spreadContext()).autofill('s1', { fairness: false }, 'u-coord');

    expect(dutiesPerPerson(prisma)).toEqual({ 'u-joana': 3, 'u-luisa': 3 });
  });

  it('is deterministic — the same window and submissions give the same draft', async () => {
    const submissions = submissionsFor(ROSTER, ['2026-10-03']);
    const first = buildPrismaStub();
    first.availabilitySubmission.findMany.mockResolvedValue(submissions);
    await makeService(first).autofill('s1', {}, 'u-coord');

    const second = buildPrismaStub();
    second.availabilitySubmission.findMany.mockResolvedValue([...submissions].reverse());
    await makeService(second).autofill('s1', {}, 'u-coord');

    expect(written(second)).toEqual(written(first));
  });

  it('keeps hand-placed people in EMPTY mode and fills only around them', async () => {
    const prisma = buildPrismaStub();
    prisma.availabilitySubmission.findMany.mockResolvedValue(
      submissionsFor([ANA, JOANA, LUISA], ['2026-10-03']),
    );
    prisma.scheduleAssignment.findMany.mockResolvedValue([
      {
        userId: 'u-outsider',
        date: new Date('2026-10-03T00:00:00.000Z'),
        slot: 1,
        roleId: LEADER_ROLE.id,
      },
    ]);
    const service = makeService(prisma);

    await service.autofill('s1', { mode: 'EMPTY' }, 'u-coord');

    expect(prisma.scheduleAssignment.deleteMany).not.toHaveBeenCalled();
    expect(written(prisma)).toEqual([
      '2026-10-03/1/u-ana/r-driver',
      '2026-10-03/1/u-joana/r-member',
    ]);
  });

  it('clears the schedule first in REPLACE mode', async () => {
    const prisma = buildPrismaStub();
    prisma.availabilitySubmission.findMany.mockResolvedValue(
      submissionsFor([ANA], ['2026-10-03']),
    );
    const service = makeService(prisma);

    await service.autofill('s1', { mode: 'REPLACE' }, 'u-coord');

    expect(prisma.scheduleAssignment.deleteMany).toHaveBeenCalledWith({
      where: { scheduleId: 's1' },
    });
  });

  it('leaves an unlimited role alone — a pool has no number to fill it to', async () => {
    const pool = { ...MEMBER_ROLE, id: 'r-pool', name: 'Helper', maxPeople: 0 };
    const prisma = buildPrismaStub();
    prisma.availabilitySubmission.findMany.mockResolvedValue(
      submissionsFor([JOANA, LUISA], ['2026-10-03']),
    );
    const service = makeService(
      prisma,
      makeContext({ roles: [pool], days: [{ date: '2026-10-03', vehiclesNeeded: 0 }] }),
    );

    await service.autofill('s1', {}, 'u-coord');

    expect(prisma.scheduleAssignment.createMany).not.toHaveBeenCalled();
  });

  it('places one person per shift when the window defines no roles', async () => {
    const prisma = buildPrismaStub();
    prisma.availabilitySubmission.findMany.mockResolvedValue(
      submissionsFor([JOANA, LUISA], ['2026-10-03']),
    );
    const service = makeService(
      prisma,
      makeContext({ roles: [], days: [{ date: '2026-10-03', vehiclesNeeded: 0 }] }),
    );

    await service.autofill('s1', {}, 'u-coord');

    expect(written(prisma)).toEqual(['2026-10-03/1/u-joana/-']);
  });

  it('ignores submissions from someone no longer on the roster', async () => {
    const prisma = buildPrismaStub();
    prisma.user.findMany.mockResolvedValue([JOANA]);
    prisma.availabilitySubmission.findMany.mockResolvedValue([
      { userId: 'u-left', date: new Date('2026-10-03T00:00:00.000Z'), slot: 1 },
      { userId: JOANA.id, date: new Date('2026-10-03T00:00:00.000Z'), slot: 1 },
    ]);
    const service = makeService(prisma);

    await service.autofill('s1', {}, 'u-coord');

    expect(written(prisma)).toEqual(['2026-10-03/1/u-joana/r-leader']);
  });
});
