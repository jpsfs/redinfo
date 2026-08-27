import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VolunteerActivityType, VolunteerHoursSource, VolunteerHoursStatus } from '@redinfo/shared';
import { VolunteerHoursService } from './volunteer-hours.service';

// ── Volunteer hours generation and review (#164) ────────────────────────────────
//
// The default is "scheduled time is time worked"; generation only ever
// credits or flags on top of that baseline, and skips a shift entirely when
// its mandatory roles were not filled.

const DRIVER_ROLE = { id: 'r-driver', mandatoryCount: 1 };
const MEMBER_ROLE = { id: 'r-member', mandatoryCount: 0 };

const WINDOW = (overrides: Record<string, unknown> = {}) => ({
  id: 'w1',
  startDate: new Date('2026-10-01T00:00:00.000Z'),
  endDate: new Date('2026-10-31T00:00:00.000Z'),
  category: 'LOCAL_SUPPORT',
  roles: [] as Array<{ id: string; mandatoryCount: number }>,
  ...overrides,
});

const SCHEDULE = (overrides: Record<string, unknown> = {}) => ({
  id: 's1',
  status: 'PUBLISHED',
  window: WINDOW(),
  ...overrides,
});

const ASSIGNMENT = (overrides: Record<string, unknown> = {}) => ({
  id: 'a1',
  scheduleId: 's1',
  date: new Date('2026-10-01T00:00:00.000Z'),
  slot: 1,
  userId: 'u-ana',
  roleId: null,
  ...overrides,
});

/** One 20:00–24:00 shift on the given date. */
const patternFor = (date: string) => [
  {
    date,
    isWeekend: false,
    isHoliday: false,
    holidayName: null,
    shifts: [{ slot: 1, startMinute: 1200, endMinute: 1440, vehiclesNeeded: 0, label: '20:00–24:00' }],
  },
];

const PATTERN = patternFor('2026-10-01');

/** Everything `getReviewQueue`'s `where` clauses can throw at the double below. */
type EntryWhere = Record<string, unknown> & {
  userId?: string;
  status?: string;
  source?: string;
  deletedAt?: null;
  reopenedAt?: null;
  assignmentId?: { in: string[] };
  flags?: { isEmpty?: boolean; has?: string };
  date?: Date | { lt?: Date; gte?: Date; lte?: Date };
  description?: { contains?: string };
  OR?: Array<Record<string, unknown>>;
};

function matchesWhere(row: Record<string, unknown>, where: EntryWhere): boolean {
  if (where.userId && row.userId !== where.userId) return false;
  if (where.status && row.status !== where.status) return false;
  if (where.source && row.source !== where.source) return false;
  if ('deletedAt' in where && where.deletedAt === null && row.deletedAt != null) return false;
  if ('reopenedAt' in where && where.reopenedAt === null && row.reopenedAt != null) return false;
  if (where.assignmentId && 'in' in where.assignmentId) {
    if (!where.assignmentId.in.includes(row.assignmentId as string)) return false;
  }
  if (where.flags) {
    const flags = (row.flags as string[]) ?? [];
    if (where.flags.isEmpty !== undefined && flags.length === 0 !== where.flags.isEmpty) return false;
    if (where.flags.has !== undefined && !flags.includes(where.flags.has)) return false;
  }
  if (where.date !== undefined) {
    const rowTime = (row.date as Date).getTime();
    if (where.date instanceof Date) {
      if (rowTime !== where.date.getTime()) return false;
    } else {
      const { lt, gte, lte } = where.date;
      if (lt && !(rowTime < lt.getTime())) return false;
      if (gte && !(rowTime >= gte.getTime())) return false;
      if (lte && !(rowTime <= lte.getTime())) return false;
    }
  }
  // `description` here only supports the plain equality/contains shape the
  // review query builds — good enough for description-search tests; the
  // OR clause's `user.firstName`/`user.lastName` legs are relation lookups
  // this flat double can't join, so name search is covered by the
  // integration suite instead.
  if (where.description?.contains !== undefined) {
    const description = (row.description as string | null) ?? '';
    if (!description.toLowerCase().includes(where.description.contains.toLowerCase())) return false;
  }
  if (where.OR) {
    const matchesAny = where.OR.some((clause) => {
      if ('description' in clause) return matchesWhere(row, { description: clause.description } as EntryWhere);
      return false; // relation-only clauses (user.firstName/lastName) — see note above.
    });
    if (!matchesAny) return false;
  }
  return true;
}

/**
 * A minimal in-memory double for the one table generation actually writes
 * to, so `create` → a later `findMany`/`updateMany` in the same test sees
 * what was written — real Prisma mocks would make the generation pipeline's
 * multi-step read-then-write awkward to assert on otherwise. Extended (#redesign)
 * with `count`/`aggregate`/ordering support for `getReviewQueue`.
 */
function buildEntryTable() {
  const rows: Array<Record<string, unknown>> = [];
  let nextId = 1;

  function filtered(where?: Record<string, unknown>) {
    return rows.filter((row) => matchesWhere(row, (where ?? {}) as EntryWhere));
  }

  function sorted(rowsIn: Array<Record<string, unknown>>, orderBy?: unknown) {
    if (!orderBy) return rowsIn;
    const clause = (Array.isArray(orderBy) ? orderBy[0] : orderBy) as
      | { date?: 'asc' | 'desc'; proposedMinutes?: 'asc' | 'desc' }
      | undefined;
    if (!clause) return rowsIn;
    const [field, direction] = Object.entries(clause)[0] as [string, 'asc' | 'desc'];
    const sign = direction === 'desc' ? -1 : 1;
    return [...rowsIn].sort((a, b) => {
      const av = a[field] as Date | number;
      const bv = b[field] as Date | number;
      const an = av instanceof Date ? av.getTime() : av;
      const bn = bv instanceof Date ? bv.getTime() : bv;
      return an < bn ? -sign : an > bn ? sign : 0;
    });
  }

  return {
    rows,
    findMany: jest.fn(
      async (args: { where?: Record<string, unknown>; orderBy?: unknown; skip?: number; take?: number }) => {
        const matched = sorted(filtered(args?.where), args?.orderBy);
        const skip = args?.skip ?? 0;
        const take = args?.take;
        return take !== undefined ? matched.slice(skip, skip + take) : matched.slice(skip);
      },
    ),
    count: jest.fn(async (args?: { where?: Record<string, unknown> }) => filtered(args?.where).length),
    aggregate: jest.fn(
      async (args: {
        where?: Record<string, unknown>;
        _sum?: { proposedMinutes?: boolean };
        _min?: { date?: boolean };
      }) => {
        const matched = filtered(args?.where);
        const result: { _sum?: { proposedMinutes: number }; _min?: { date: Date | null } } = {};
        if (args._sum?.proposedMinutes) {
          result._sum = {
            proposedMinutes: matched.reduce((total, row) => total + (row.proposedMinutes as number), 0),
          };
        }
        if (args._min?.date) {
          result._min = {
            date:
              matched.length === 0
                ? null
                : matched.reduce(
                    (min, row) => ((row.date as Date) < min ? (row.date as Date) : min),
                    matched[0].date as Date,
                  ),
          };
        }
        return result;
      },
    ),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = {
        id: `e${nextId++}`,
        user: null,
        approvedBy: null,
        loggedBy: null,
        approvedById: null,
        approvedAt: null,
        autoApproved: false,
        correctionReason: null,
        description: null,
        baselineMinutes: null,
        flagDetails: null,
        loggedById: null,
        flags: [],
        status: VolunteerHoursStatus.PENDING,
        reopenedAt: null,
        reopenedById: null,
        reopenedBy: null,
        deletedAt: null,
        deletedById: null,
        deletedBy: null,
        deletionReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      rows.push(row);
      return row;
    }),
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
      rows.find((row) => row.id === where.id) ?? null,
    ),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = rows.find((r) => r.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
    updateMany: jest.fn(async ({ where, data }: { where: { id: { in: string[] } }; data: Record<string, unknown> }) => {
      const ids = where.id.in;
      let count = 0;
      for (const row of rows) {
        if (ids.includes(row.id as string)) {
          Object.assign(row, data);
          count += 1;
        }
      }
      return { count };
    }),
  };
}

function buildPrisma({
  assignments = [ASSIGNMENT()],
  schedule = SCHEDULE(),
  overrides = [] as Array<Record<string, unknown>>,
  eventReports = [] as Array<Record<string, unknown>>,
} = {}) {
  const entryTable = buildEntryTable();

  const scheduleAssignmentFindMany = jest.fn(async (args: { where: Record<string, unknown> }) => {
    const { where } = args;
    if ('volunteerHoursEntry' in where) {
      // The top-level "what's pending" scan.
      const generatedAssignmentIds = new Set(entryTable.rows.map((r) => r.assignmentId));
      return assignments
        .filter((a) => !generatedAssignmentIds.has(a.id))
        .map((a) => ({ scheduleId: a.scheduleId, date: a.date, slot: a.slot }));
    }
    // The per-shift full load.
    return assignments.filter(
      (a) =>
        a.scheduleId === where.scheduleId &&
        (a.date as Date).getTime() === (where.date as Date).getTime() &&
        a.slot === where.slot,
    );
  });

  const prisma = {
    scheduleAssignment: { findMany: scheduleAssignmentFindMany },
    schedule: { findUnique: jest.fn(async () => schedule) },
    scheduleShiftOverride: { findMany: jest.fn(async () => overrides) },
    eventReport: {
      findMany: jest.fn(async () => eventReports),
    },
    volunteerHoursEntry: entryTable,
    entryTable,
    // Set below, once `prisma` itself exists — the callback form hands the
    // transaction body this same mock (no real isolation here, which is
    // fine: these tests run single-connection anyway).
    $transaction: undefined as unknown as jest.Mock,
  };
  // The real Prisma client supports both the array form (a batch of
  // already-created query promises) and the callback form (given a
  // transaction client to run more queries against).
  prisma.$transaction = jest.fn(async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as Promise<unknown>[]),
  );
  return prisma;
}

function makeService(prisma = buildPrisma(), pattern = PATTERN) {
  const shiftSchedule = { getPatternForWindow: jest.fn().mockResolvedValue(pattern) };
  return { service: new VolunteerHoursService(prisma as never, shiftSchedule as never), prisma };
}

describe('generation', () => {
  it('generates a clean baseline entry when the shift needed no roles at all', async () => {
    const { service, prisma } = makeService();
    const { entries } = await service.getMyHours('u-ana');

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      userId: 'u-ana',
      source: VolunteerHoursSource.SCHEDULED,
      activityType: 'LOCAL_SUPPORT',
      baselineMinutes: 240,
      proposedMinutes: 240,
      minutes: 240,
      flags: [],
      status: VolunteerHoursStatus.PENDING,
    });
    expect(prisma.entryTable.create).toHaveBeenCalledTimes(1);
  });

  it('generates nothing at all for a shift whose mandatory role was left empty', async () => {
    const schedule = SCHEDULE({ window: WINDOW({ category: 'EMERGENCY', roles: [DRIVER_ROLE] }) });
    const assignments = [ASSIGNMENT({ id: 'a1', userId: 'u-ana', roleId: null })];
    const { service, prisma } = makeService(buildPrisma({ schedule, assignments }));

    const { entries } = await service.getMyHours('u-ana');

    expect(entries).toHaveLength(0);
    expect(prisma.entryTable.create).not.toHaveBeenCalled();
  });

  it('generates for everyone once the mandatory role is filled, including the pool seat', async () => {
    const schedule = SCHEDULE({
      window: WINDOW({ category: 'EMERGENCY', roles: [DRIVER_ROLE, MEMBER_ROLE] }),
    });
    const assignments = [
      ASSIGNMENT({ id: 'a-driver', userId: 'u-driver', roleId: DRIVER_ROLE.id }),
      ASSIGNMENT({ id: 'a-member', userId: 'u-member', roleId: MEMBER_ROLE.id }),
    ];
    const { service, prisma } = makeService(buildPrisma({ schedule, assignments }));

    await service.getMyHours('u-driver');

    expect(prisma.entryTable.create).toHaveBeenCalledTimes(2);
  });

  it('credits and flags RAN_OVER from a submitted report that ran past the shift end', async () => {
    const schedule = SCHEDULE({ window: WINDOW({ category: 'EMERGENCY', roles: [DRIVER_ROLE] }) });
    const assignments = [ASSIGNMENT({ id: 'a1', userId: 'u-ana', roleId: DRIVER_ROLE.id })];
    // Shift ends 24:00 local. 2026-10-01 is still WEST (UTC+1) — DST doesn't
    // end until the last Sunday of October — so that instant is 23:00 UTC;
    // the report's availableAt is 45 minutes after it.
    const eventReports = [
      {
        submittedAt: new Date('2026-10-02T00:00:00.000Z'),
        availableAt: new Date('2026-10-01T23:45:00.000Z'),
        endedAt: null,
        hospitalArrivalAt: null,
        crew: [{ userId: 'u-ana' }],
      },
    ];
    const { service, prisma } = makeService(buildPrisma({ schedule, assignments, eventReports }));

    const { entries } = await service.getMyHours('u-ana');

    expect(entries[0].flags).toEqual(['RAN_OVER']);
    expect(entries[0].proposedMinutes).toBe(240 + 45);
    expect(prisma.entryTable.create).toHaveBeenCalledTimes(1);
  });

  it('flags POSSIBLY_LEFT_EARLY for a pool seat absent from every report, without touching minutes', async () => {
    const schedule = SCHEDULE({
      window: WINDOW({ category: 'EMERGENCY', roles: [DRIVER_ROLE, MEMBER_ROLE] }),
    });
    const assignments = [
      ASSIGNMENT({ id: 'a-driver', userId: 'u-driver', roleId: DRIVER_ROLE.id }),
      ASSIGNMENT({ id: 'a-member', userId: 'u-member', roleId: MEMBER_ROLE.id }),
    ];
    const eventReports = [
      {
        submittedAt: new Date('2026-10-02T00:00:00.000Z'),
        availableAt: null,
        endedAt: null,
        hospitalArrivalAt: null,
        crew: [{ userId: 'u-driver' }],
      },
    ];
    const { service } = makeService(buildPrisma({ schedule, assignments, eventReports }));

    const { entries } = await service.getMyHours('u-member');

    expect(entries[0].flags).toEqual(['POSSIBLY_LEFT_EARLY']);
    expect(entries[0].proposedMinutes).toBe(240);
  });

  it('does not generate twice for the same assignment', async () => {
    const { service, prisma } = makeService();
    await service.getMyHours('u-ana');
    await service.getMyHours('u-ana');

    expect(prisma.entryTable.create).toHaveBeenCalledTimes(1);
  });
});

describe('manual entries', () => {
  it('creates a MANUAL entry pending review', async () => {
    const { service } = makeService();
    const entry = await service.createManualEntry('u-ana', {
      activityType: VolunteerActivityType.MEETING,
      date: '2026-10-05',
      minutes: 90,
      description: 'Monthly meeting.',
    });

    expect(entry).toMatchObject({
      source: VolunteerHoursSource.MANUAL,
      activityType: VolunteerActivityType.MEETING,
      proposedMinutes: 90,
      minutes: 90,
      status: VolunteerHoursStatus.PENDING,
    });
  });

  it('rejects an invalid manual entry', async () => {
    const { service } = makeService();
    await expect(
      service.createManualEntry('u-ana', {
        activityType: VolunteerActivityType.OTHER,
        date: '2026-10-05',
        minutes: 90,
        description: '   ',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('does not require a description for a non-OTHER manual entry', async () => {
    const { service } = makeService();
    const entry = await service.createManualEntry('u-ana', {
      activityType: VolunteerActivityType.MEETING,
      date: '2026-10-05',
      minutes: 90,
    });

    expect(entry.description).toBeNull();
  });
});

describe('approve', () => {
  it('approves as proposed when no correction is given', async () => {
    const { service } = makeService();
    const [entry] = (await service.getMyHours('u-ana')).entries;

    const approved = await service.approve(entry.id, 'u-coord', {});
    expect(approved.status).toBe(VolunteerHoursStatus.APPROVED);
    expect(approved.minutes).toBe(entry.proposedMinutes);
    expect(approved.correctionReason).toBeNull();
    expect(approved.autoApproved).toBe(false);
  });

  it('records a correction and its reason', async () => {
    const { service } = makeService();
    const [entry] = (await service.getMyHours('u-ana')).entries;

    const approved = await service.approve(entry.id, 'u-coord', {
      minutes: 60,
      correctionReason: 'Left early, confirmed by phone.',
    });
    expect(approved.minutes).toBe(60);
    expect(approved.correctionReason).toBe('Left early, confirmed by phone.');
  });

  it('rejects a correction with no reason', async () => {
    const { service } = makeService();
    const [entry] = (await service.getMyHours('u-ana')).entries;

    await expect(service.approve(entry.id, 'u-coord', { minutes: 60 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('404s for an unknown entry', async () => {
    const { service } = makeService();
    await expect(service.approve('missing', 'u-coord', {})).rejects.toThrow(NotFoundException);
  });
});

describe('updateMine', () => {
  it('lets the owner correct a SCHEDULED entry’s minutes', async () => {
    const { service } = makeService();
    const [entry] = (await service.getMyHours('u-ana')).entries;

    const updated = await service.updateMine(entry.id, 'u-ana', { minutes: 180 });
    expect(updated.minutes).toBe(180);
    expect(updated.status).toBe(VolunteerHoursStatus.PENDING);
  });

  it('lets the owner attach a note to a SCHEDULED entry without touching its activity or date', async () => {
    const { service } = makeService();
    const [entry] = (await service.getMyHours('u-ana')).entries;

    const updated = await service.updateMine(entry.id, 'u-ana', {
      minutes: entry.minutes,
      description: 'Left an hour early, cleared with the team leader.',
    });
    expect(updated.description).toBe('Left an hour early, cleared with the team leader.');
    expect(updated.activityType).toBe(entry.activityType);
    expect(updated.date).toBe(entry.date);
  });

  it('lets the owner correct every field of their own MANUAL entry', async () => {
    const { service } = makeService();
    const entry = await service.createManualEntry('u-ana', {
      activityType: VolunteerActivityType.MEETING,
      date: '2026-10-05',
      minutes: 90,
      description: 'Monthly meeting.',
    });

    const updated = await service.updateMine(entry.id, 'u-ana', {
      activityType: VolunteerActivityType.TRAINING,
      date: '2026-10-06',
      minutes: 120,
      description: 'Actually a training session.',
    });
    expect(updated).toMatchObject({
      activityType: VolunteerActivityType.TRAINING,
      date: '2026-10-06',
      minutes: 120,
      description: 'Actually a training session.',
    });
  });

  it('rejects a MANUAL edit that empties the description of an OTHER entry', async () => {
    const { service } = makeService();
    const entry = await service.createManualEntry('u-ana', {
      activityType: VolunteerActivityType.OTHER,
      date: '2026-10-05',
      minutes: 90,
      description: 'Cleaning the base.',
    });

    await expect(
      service.updateMine(entry.id, 'u-ana', { minutes: 90, description: '   ' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows a MANUAL edit that empties the description of a non-OTHER entry', async () => {
    const { service } = makeService();
    const entry = await service.createManualEntry('u-ana', {
      activityType: VolunteerActivityType.MEETING,
      date: '2026-10-05',
      minutes: 90,
      description: 'Monthly meeting.',
    });

    const updated = await service.updateMine(entry.id, 'u-ana', { minutes: 90, description: '   ' });
    expect(updated.description).toBeNull();
  });

  it('404s for someone else’s entry', async () => {
    const { service } = makeService();
    const [entry] = (await service.getMyHours('u-ana')).entries;

    await expect(service.updateMine(entry.id, 'u-someone-else', { minutes: 60 })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('404s for an unknown entry', async () => {
    const { service } = makeService();
    await expect(service.updateMine('missing', 'u-ana', { minutes: 60 })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('refuses to edit an entry that is already approved', async () => {
    const { service } = makeService();
    const [entry] = (await service.getMyHours('u-ana')).entries;
    await service.approve(entry.id, 'u-coord', {});

    await expect(service.updateMine(entry.id, 'u-ana', { minutes: 60 })).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('auto-approval sweep', () => {
  it('auto-approves a clean SCHEDULED entry once the grace period has passed', async () => {
    // Well over a month before "today" (the real system clock the service
    // defaults to) — old enough that the grace-period sweep should already
    // catch it on the very first read.
    const oldAssignment = ASSIGNMENT({ id: 'a-old', date: new Date('2026-01-01T00:00:00.000Z') });
    const { service, prisma } = makeService(
      buildPrisma({ assignments: [oldAssignment] }),
      patternFor('2026-01-01'),
    );

    const { entries } = await service.getMyHours('u-ana');

    expect(entries[0].status).toBe(VolunteerHoursStatus.APPROVED);
    expect(entries[0].autoApproved).toBe(true);
    expect(prisma.entryTable.updateMany).toHaveBeenCalledTimes(1);
  });

  it('never auto-approves a flagged entry', async () => {
    const schedule = SCHEDULE({ window: WINDOW({ category: 'EMERGENCY', roles: [DRIVER_ROLE] }) });
    const oldAssignment = ASSIGNMENT({
      id: 'a-old',
      userId: 'u-ana',
      roleId: DRIVER_ROLE.id,
      date: new Date('2026-01-01T00:00:00.000Z'),
    });
    const eventReports = [
      {
        submittedAt: new Date('2026-01-02T00:00:00.000Z'),
        availableAt: new Date('2026-01-02T00:45:00.000Z'),
        endedAt: null,
        hospitalArrivalAt: null,
        crew: [{ userId: 'u-ana' }],
      },
    ];
    const { service } = makeService(
      buildPrisma({ schedule, assignments: [oldAssignment], eventReports }),
      patternFor('2026-01-01'),
    );

    const { entries } = await service.getMyHours('u-ana');

    expect(entries[0].flags).toEqual(['RAN_OVER']);
    expect(entries[0].status).toBe(VolunteerHoursStatus.PENDING);
  });

  it('never auto-approves a MANUAL entry', async () => {
    const { service } = makeService();
    const entry = await service.createManualEntry('u-ana', {
      activityType: VolunteerActivityType.MEETING,
      date: '2026-01-01',
      minutes: 90,
      description: 'Old meeting.',
    });

    const { entries } = await service.getMyHours('u-ana');
    expect(entries.find((e) => e.id === entry.id)?.status).toBe(VolunteerHoursStatus.PENDING);
  });
});

// ── Redesigned review queue (docs/plans/volunteer-hours-review-redesign.md) ────

/** DRIVER_ROLE ran over (RAN_OVER); MEMBER_ROLE, a pool seat, is absent from the report (POSSIBLY_LEFT_EARLY). */
function emergencyFixtureWithBothFlags() {
  const schedule = SCHEDULE({ window: WINDOW({ category: 'EMERGENCY', roles: [DRIVER_ROLE, MEMBER_ROLE] }) });
  const assignments = [
    ASSIGNMENT({ id: 'a-driver', userId: 'u-driver', roleId: DRIVER_ROLE.id }),
    ASSIGNMENT({ id: 'a-member', userId: 'u-member', roleId: MEMBER_ROLE.id }),
  ];
  const eventReports = [
    {
      submittedAt: new Date('2026-10-02T00:00:00.000Z'),
      availableAt: new Date('2026-10-02T00:45:00.000Z'),
      endedAt: null,
      hospitalArrivalAt: null,
      crew: [{ userId: 'u-driver' }],
    },
  ];
  return buildPrisma({ schedule, assignments, eventReports });
}

describe('getReviewQueue', () => {
  it('paginates: total is correct and page 2 is disjoint from page 1', async () => {
    const { service } = makeService(buildPrisma({ assignments: [] }));
    for (let i = 0; i < 5; i++) {
      await service.createManualEntry('u-ana', {
        activityType: VolunteerActivityType.MEETING,
        date: `2026-10-0${i + 1}`,
        minutes: 60,
      });
    }

    const page1 = await service.getReviewQueue({ perPage: 2, page: 1 });
    const page2 = await service.getReviewQueue({ perPage: 2, page: 2 });

    expect(page1.total).toBe(5);
    expect(page1.data).toHaveLength(2);
    expect(page2.data).toHaveLength(2);
    const page1Ids = new Set(page1.data.map((e) => e.id));
    expect(page2.data.some((e) => page1Ids.has(e.id))).toBe(false);
  });

  it('flag=NONE excludes flagged entries; a specific flag narrows to just that one', async () => {
    const { service } = makeService(emergencyFixtureWithBothFlags());
    await service.getMyHours('u-driver'); // materialise generation for both rows

    const none = await service.getReviewQueue({ flag: 'NONE' });
    expect(none.data).toHaveLength(0);

    const ranOver = await service.getReviewQueue({ flag: 'RAN_OVER' });
    expect(ranOver.data.map((e) => e.userId)).toEqual(['u-driver']);

    const leftEarly = await service.getReviewQueue({ flag: 'POSSIBLY_LEFT_EARLY' });
    expect(leftEarly.data.map((e) => e.userId)).toEqual(['u-member']);
  });

  it('source filter narrows to MANUAL or SCHEDULED', async () => {
    const { service } = makeService(); // default: one clean SCHEDULED entry for u-ana
    await service.createManualEntry('u-ana', {
      activityType: VolunteerActivityType.MEETING,
      date: '2026-10-05',
      minutes: 60,
    });

    const manualOnly = await service.getReviewQueue({ source: VolunteerHoursSource.MANUAL });
    expect(manualOnly.data.every((e) => e.source === VolunteerHoursSource.MANUAL)).toBe(true);
    expect(manualOnly.data).toHaveLength(1);

    const scheduledOnly = await service.getReviewQueue({ source: VolunteerHoursSource.SCHEDULED });
    expect(scheduledOnly.data.every((e) => e.source === VolunteerHoursSource.SCHEDULED)).toBe(true);
    expect(scheduledOnly.data).toHaveLength(1);
  });

  it('search matches the description', async () => {
    const { service } = makeService(buildPrisma({ assignments: [] }));
    await service.createManualEntry('u-ana', {
      activityType: VolunteerActivityType.OTHER,
      date: '2026-10-05',
      minutes: 60,
      description: 'Delegation cleanup day',
    });
    await service.createManualEntry('u-ana', {
      activityType: VolunteerActivityType.MEETING,
      date: '2026-10-06',
      minutes: 60,
      description: 'Monthly coordination meeting',
    });

    const result = await service.getReviewQueue({ search: 'cleanup' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].description).toContain('cleanup');
  });

  it('counts ignore the flag/source filters but honour status/search, and drive the sweep number', async () => {
    const { service } = makeService(); // default: one clean SCHEDULED entry for u-ana
    await service.getMyHours('u-ana');
    await service.createManualEntry('u-ana', {
      activityType: VolunteerActivityType.MEETING,
      date: '2026-10-05',
      minutes: 30,
      description: 'Monthly coordination meeting',
    });

    const bySource = await service.getReviewQueue({ source: VolunteerHoursSource.MANUAL });
    expect(bySource.data).toHaveLength(1); // narrowed to MANUAL...
    expect(bySource.counts.all).toBe(2); // ...but counts describe the whole scope
    expect(bySource.counts.noFlags).toBe(2);
    expect(bySource.counts.manual).toBe(1);
    expect(bySource.counts.sweepable).toBe(1); // only the clean SCHEDULED entry qualifies

    const searched = await service.getReviewQueue({ search: 'coordination' });
    expect(searched.counts.all).toBe(1);
  });
});

describe('approveBatch', () => {
  it('approves what it can and reports the rest as failed, without aborting the batch', async () => {
    const { service } = makeService(buildPrisma({ assignments: [] }));
    const a = await service.createManualEntry('u-ana', {
      activityType: VolunteerActivityType.MEETING,
      date: '2026-10-01',
      minutes: 60,
    });
    const b = await service.createManualEntry('u-ana', {
      activityType: VolunteerActivityType.MEETING,
      date: '2026-10-02',
      minutes: 90,
    });
    await service.approve(b.id, 'u-coord', {}); // a colleague got there first

    const result = await service.approveBatch(
      { entries: [{ id: a.id }, { id: b.id }, { id: 'missing' }] },
      'u-coord',
    );

    expect(result.approved.map((e) => e.id)).toEqual([a.id]);
    expect(result.failed.map((f) => f.id).sort()).toEqual(['missing', b.id].sort());
  });

  it('fails just the item whose correction is missing a reason', async () => {
    const { service } = makeService(buildPrisma({ assignments: [] }));
    const a = await service.createManualEntry('u-ana', {
      activityType: VolunteerActivityType.MEETING,
      date: '2026-10-01',
      minutes: 60,
    });
    const b = await service.createManualEntry('u-ana', {
      activityType: VolunteerActivityType.MEETING,
      date: '2026-10-02',
      minutes: 90,
    });

    const result = await service.approveBatch(
      { entries: [{ id: a.id }, { id: b.id, minutes: 45 }] },
      'u-coord',
    );

    expect(result.approved.map((e) => e.id)).toEqual([a.id]);
    expect(result.failed).toEqual([{ id: b.id, message: expect.stringContaining('reason') }]);
  });
});

describe('sweepApprove', () => {
  it('approves a clean SCHEDULED entry', async () => {
    const { service } = makeService(); // default: one clean SCHEDULED entry for u-ana
    const [entry] = (await service.getMyHours('u-ana')).entries;

    const result = await service.sweepApprove({}, 'u-coord');

    expect(result.approvedCount).toBe(1);
    expect(result.totalMinutes).toBe(entry.proposedMinutes);
    const approved = (await service.getMyHours('u-ana')).entries.find((e) => e.id === entry.id);
    expect(approved?.status).toBe(VolunteerHoursStatus.APPROVED);
    expect(approved?.autoApproved).toBe(false);
  });

  it('leaves a flagged entry untouched', async () => {
    const { service } = makeService(emergencyFixtureWithBothFlags());
    await service.getMyHours('u-driver');

    const result = await service.sweepApprove({}, 'u-coord');

    expect(result.approvedCount).toBe(0);
    const stillPending = (await service.getMyHours('u-driver')).entries;
    expect(stillPending.every((e) => e.status === VolunteerHoursStatus.PENDING)).toBe(true);
  });

  it('leaves a MANUAL entry untouched — there is no shift to validate it against', async () => {
    const { service } = makeService(buildPrisma({ assignments: [] }));
    const entry = await service.createManualEntry('u-ana', {
      activityType: VolunteerActivityType.MEETING,
      date: '2026-10-01',
      minutes: 60,
    });

    const result = await service.sweepApprove({}, 'u-coord');

    expect(result.approvedCount).toBe(0);
    const stillPending = (await service.getMyHours('u-ana')).entries.find((e) => e.id === entry.id);
    expect(stillPending?.status).toBe(VolunteerHoursStatus.PENDING);
  });

  it('leaves a reopened entry untouched, even though it is clean and SCHEDULED', async () => {
    const { service } = makeService();
    const [entry] = (await service.getMyHours('u-ana')).entries;
    await service.approve(entry.id, 'u-coord', {});
    await service.reopen(entry.id, 'u-coord');

    const result = await service.sweepApprove({}, 'u-coord');

    expect(result.approvedCount).toBe(0);
  });
});

describe('reopen', () => {
  it('sends an APPROVED entry back to PENDING and resets the approval fields', async () => {
    const { service } = makeService();
    const [entry] = (await service.getMyHours('u-ana')).entries;
    await service.approve(entry.id, 'u-coord', { minutes: 60, correctionReason: 'Left early.' });

    const reopened = await service.reopen(entry.id, 'u-coord2');

    expect(reopened.status).toBe(VolunteerHoursStatus.PENDING);
    expect(reopened.minutes).toBe(reopened.proposedMinutes);
    expect(reopened.correctionReason).toBeNull();
    expect(reopened.approvedById).toBeNull();
    expect(reopened.approvedAt).toBeNull();
    expect(reopened.reopenedById).toBe('u-coord2');
    expect(reopened.reopenedAt).not.toBeNull();
  });

  it('refuses to reopen a PENDING entry', async () => {
    const { service } = makeService();
    const [entry] = (await service.getMyHours('u-ana')).entries;
    await expect(service.reopen(entry.id, 'u-coord')).rejects.toThrow(BadRequestException);
  });

  it('404s for an unknown entry', async () => {
    const { service } = makeService();
    await expect(service.reopen('missing', 'u-coord')).rejects.toThrow(NotFoundException);
  });

  // Trap 2: a reopened, clean, old SCHEDULED entry must not be swept straight
  // back to APPROVED by the grace-period sweep that `refreshGeneration` runs
  // on every read.
  it('trap 2 regression: a reopened old clean entry is not re-swept to APPROVED', async () => {
    const oldAssignment = ASSIGNMENT({ id: 'a-old', date: new Date('2026-01-01T00:00:00.000Z') });
    const { service } = makeService(buildPrisma({ assignments: [oldAssignment] }), patternFor('2026-01-01'));

    const [entry] = (await service.getMyHours('u-ana')).entries;
    expect(entry.status).toBe(VolunteerHoursStatus.APPROVED); // auto-approved, well past the grace period

    await service.reopen(entry.id, 'u-coord');
    await service.refreshGeneration('2026-06-01');

    const after = (await service.getMyHours('u-ana')).entries.find((e) => e.id === entry.id);
    expect(after?.status).toBe(VolunteerHoursStatus.PENDING);
  });
});

describe('dismiss / restore', () => {
  it('soft-deletes an entry with a reason, and restore undoes it', async () => {
    const { service } = makeService();
    const [entry] = (await service.getMyHours('u-ana')).entries;

    const dismissed = await service.dismiss(entry.id, 'u-coord', { reason: 'Duplicate entry.' });
    expect(dismissed.deletedAt).not.toBeNull();
    expect(dismissed.deletedById).toBe('u-coord');
    expect(dismissed.deletionReason).toBe('Duplicate entry.');

    const restored = await service.restore(entry.id);
    expect(restored.deletedAt).toBeNull();
    expect(restored.deletedById).toBeNull();
    expect(restored.deletionReason).toBeNull();
  });

  it('refuses to dismiss an already-dismissed entry', async () => {
    const { service } = makeService();
    const [entry] = (await service.getMyHours('u-ana')).entries;
    await service.dismiss(entry.id, 'u-coord', { reason: 'Duplicate.' });

    await expect(service.dismiss(entry.id, 'u-coord', { reason: 'Again.' })).rejects.toThrow(
      BadRequestException,
    );
  });

  // Trap 1: a hard delete of a SCHEDULED entry would make its assignment
  // eligible for generation again; the retained, soft-deleted row must stop
  // that on the very next read of any hours endpoint.
  it('trap 1 regression: a dismissed SCHEDULED entry is not regenerated', async () => {
    const { service, prisma } = makeService();
    const [entry] = (await service.getMyHours('u-ana')).entries;
    await service.dismiss(entry.id, 'u-coord', { reason: 'Never actually worked.' });

    await service.refreshGeneration();

    expect(prisma.entryTable.rows).toHaveLength(1); // no duplicate generated
    expect(prisma.entryTable.rows[0].deletedAt).not.toBeNull();
  });

  // Trap 3: every read path must filter `deletedAt`, or a dismissed entry's
  // minutes silently keep counting.
  it('trap 3 regression: a dismissed entry is absent from getMyHours and the review queue', async () => {
    const { service } = makeService();
    const [entry] = (await service.getMyHours('u-ana')).entries;
    await service.dismiss(entry.id, 'u-coord', { reason: 'Never actually worked.' });

    const { entries, totalPendingMinutes, totalApprovedMinutes } = await service.getMyHours('u-ana');
    expect(entries.find((e) => e.id === entry.id)).toBeUndefined();
    expect(totalPendingMinutes).toBe(0);
    expect(totalApprovedMinutes).toBe(0);

    const queue = await service.getReviewQueue({});
    expect(queue.data.find((e) => e.id === entry.id)).toBeUndefined();
    expect(queue.counts.all).toBe(0);
  });
});

describe('deleteMine', () => {
  it('lets a volunteer delete their own pending MANUAL entry', async () => {
    const { service } = makeService(buildPrisma({ assignments: [] }));
    const entry = await service.createManualEntry('u-ana', {
      activityType: VolunteerActivityType.MEETING,
      date: '2026-10-01',
      minutes: 60,
    });

    await service.deleteMine(entry.id, 'u-ana');

    const { entries } = await service.getMyHours('u-ana');
    expect(entries.find((e) => e.id === entry.id)).toBeUndefined();
  });

  it('404s for someone else’s entry', async () => {
    const { service } = makeService(buildPrisma({ assignments: [] }));
    const entry = await service.createManualEntry('u-ana', {
      activityType: VolunteerActivityType.MEETING,
      date: '2026-10-01',
      minutes: 60,
    });

    await expect(service.deleteMine(entry.id, 'u-someone-else')).rejects.toThrow(NotFoundException);
  });

  it('refuses a SCHEDULED entry — there is no shift-less way to file one by hand', async () => {
    const { service } = makeService();
    const [entry] = (await service.getMyHours('u-ana')).entries;

    await expect(service.deleteMine(entry.id, 'u-ana')).rejects.toThrow(BadRequestException);
  });

  it('refuses an already-APPROVED MANUAL entry', async () => {
    const { service } = makeService(buildPrisma({ assignments: [] }));
    const entry = await service.createManualEntry('u-ana', {
      activityType: VolunteerActivityType.MEETING,
      date: '2026-10-01',
      minutes: 60,
    });
    await service.approve(entry.id, 'u-coord', {});

    await expect(service.deleteMine(entry.id, 'u-ana')).rejects.toThrow(BadRequestException);
  });
});
