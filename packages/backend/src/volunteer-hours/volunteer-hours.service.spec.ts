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

/**
 * A minimal in-memory double for the one table generation actually writes
 * to, so `create` → a later `findMany`/`updateMany` in the same test sees
 * what was written — real Prisma mocks would make the generation pipeline's
 * multi-step read-then-write awkward to assert on otherwise.
 */
function buildEntryTable() {
  const rows: Array<Record<string, unknown>> = [];
  let nextId = 1;
  return {
    rows,
    findMany: jest.fn(async (args: { where?: Record<string, unknown> }) => {
      const where = args?.where ?? {};
      return rows.filter((row) => {
        if (where.userId && row.userId !== where.userId) return false;
        if (where.status && row.status !== where.status) return false;
        if (where.source && row.source !== where.source) return false;
        if (
          where.assignmentId &&
          typeof where.assignmentId === 'object' &&
          where.assignmentId !== null &&
          'in' in where.assignmentId
        ) {
          const ids = (where.assignmentId as { in: string[] }).in;
          if (!ids.includes(row.assignmentId as string)) return false;
        }
        return true;
      });
    }),
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

  return {
    scheduleAssignment: { findMany: scheduleAssignmentFindMany },
    schedule: { findUnique: jest.fn(async () => schedule) },
    scheduleShiftOverride: { findMany: jest.fn(async () => overrides) },
    eventReport: {
      findMany: jest.fn(async () => eventReports),
    },
    volunteerHoursEntry: entryTable,
    entryTable,
  };
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
        activityType: VolunteerActivityType.MEETING,
        date: '2026-10-05',
        minutes: 90,
        description: '   ',
      }),
    ).rejects.toThrow(BadRequestException);
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

  it('rejects a MANUAL edit that empties the description', async () => {
    const { service } = makeService();
    const entry = await service.createManualEntry('u-ana', {
      activityType: VolunteerActivityType.MEETING,
      date: '2026-10-05',
      minutes: 90,
      description: 'Monthly meeting.',
    });

    await expect(
      service.updateMine(entry.id, 'u-ana', { minutes: 90, description: '   ' }),
    ).rejects.toThrow(BadRequestException);
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
