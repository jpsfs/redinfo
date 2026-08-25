import { describe, expect, it } from 'vitest';
import {
  AvailabilityWindowCategory,
  AvailabilityWindowRole,
  AvailabilityWindowStatus,
  CertificationType,
  MAX_WINDOW_DAYS,
  ScheduleAssignment,
  ScheduleBoardResponse,
  ScheduleDayBoard,
  ScheduleStatus,
} from '@redinfo/shared';
import { buildPrintRows, choosePrintLayout } from './printLayout';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const EMERGENCY_ROLES: AvailabilityWindowRole[] = [
  { id: 'r-driver', windowId: 'w1', order: 0, name: 'Driver', maxPeople: 1, requiredCertification: CertificationType.DRIVER },
  { id: 'r-leader', windowId: 'w1', order: 1, name: 'Team Leader', maxPeople: 1, requiredCertification: CertificationType.TAS },
  { id: 'r-member', windowId: 'w1', order: 2, name: 'Team Member', maxPeople: 1, requiredCertification: CertificationType.TAT },
];

let assignmentCounter = 0;
function makeAssignment(overrides: Partial<ScheduleAssignment> & { userId: string; roleId?: string | null }): ScheduleAssignment {
  assignmentCounter += 1;
  return {
    id: `a-${assignmentCounter}`,
    scheduleId: 's1',
    date: '2026-10-01',
    slot: 0,
    roleId: null,
    roleName: null,
    isOverride: false,
    selfAssigned: false,
    availability: 'submitted',
    assignedById: 'coordinator',
    assignedAt: '2026-09-01T00:00:00.000Z',
    user: {
      id: overrides.userId,
      firstName: 'First',
      lastName: overrides.userId,
      isDriver: false,
      certifications: [],
    },
    ...overrides,
  };
}

/** A day with a single 24h shift, for the low-shifts-per-day fixtures below. */
function makeDay(date: string, assignments: ScheduleAssignment[] = []): ScheduleDayBoard {
  return {
    date,
    isWeekend: false,
    isHoliday: false,
    holidayName: null,
    shifts: [
      {
        slot: 0,
        startMinute: 0,
        endMinute: 24 * 60,
        vehiclesNeeded: 1,
        label: '00:00–24:00',
        assignments,
        driverCount: assignments.filter((a) => a.user.isDriver).length,
        gaps: [],
      },
    ],
  };
}

function makeBoard(overrides: Partial<ScheduleBoardResponse>): ScheduleBoardResponse {
  return {
    schedule: {
      id: 's1',
      windowId: 'w1',
      status: ScheduleStatus.DRAFT,
      createdById: 'coordinator',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
    window: {
      id: 'w1',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      category: AvailabilityWindowCategory.EMERGENCY,
      status: AvailabilityWindowStatus.OPEN,
      openedById: 'coordinator',
      openedAt: '2026-09-01T00:00:00.000Z',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
    roles: [],
    days: [],
    conflicts: [],
    stats: {
      requiredSlots: 0,
      filledSlots: 0,
      shiftsWithGaps: 0,
      overrideCount: 0,
      certificationExceptionCount: 0,
      lapsedCertificationCount: 0,
    },
    ...overrides,
  };
}

function dateSeries(count: number, start = '2026-06-01'): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  for (let i = 0; i < count; i += 1) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

// ─── buildPrintRows ──────────────────────────────────────────────────────────

describe('buildPrintRows', () => {
  it('produces one row per shift with a filled cell per assigned role', () => {
    const assignments = [
      makeAssignment({ userId: 'alice', roleId: 'r-driver', user: { id: 'alice', firstName: 'Alice', lastName: 'A', isDriver: true, certifications: [] } }),
      makeAssignment({ userId: 'bob', roleId: 'r-leader' }),
      makeAssignment({ userId: 'carl', roleId: 'r-member' }),
    ];
    const board = makeBoard({ roles: EMERGENCY_ROLES, days: [makeDay('2026-10-01', assignments)] });

    const rows = buildPrintRows(board);

    expect(rows).toHaveLength(1);
    expect(rows[0].cells).toHaveLength(3);
    for (const cell of rows[0].cells) {
      expect(cell.people).toHaveLength(1);
      expect(cell.unfilled).toBe(0);
    }
    expect(rows[0].cells[0].people[0]).toEqual({ name: 'Alice A', isDriver: true });
  });

  it('collapses a roleless window to a single Crew column', () => {
    const assignments = [makeAssignment({ userId: 'alice' })];
    const board = makeBoard({ roles: [], days: [makeDay('2026-10-01', assignments)] });

    const rows = buildPrintRows(board);

    expect(rows[0].cells).toHaveLength(1);
    expect(rows[0].cells[0].people).toEqual([{ name: 'First alice', isDriver: false }]);
  });

  it('carries firstOfDay, holiday and unfilledCount', () => {
    const filled = makeAssignment({ userId: 'alice', roleId: 'r-driver' });
    const day: ScheduleDayBoard = {
      date: '2026-12-25',
      isWeekend: false,
      isHoliday: true,
      holidayName: 'Christmas',
      shifts: [
        { slot: 0, startMinute: 0, endMinute: 720, vehiclesNeeded: 1, label: 'Morning', assignments: [filled], driverCount: 0, gaps: [] },
        { slot: 1, startMinute: 720, endMinute: 1440, vehiclesNeeded: 1, label: 'Afternoon', assignments: [], driverCount: 0, gaps: [] },
      ],
    };
    const board = makeBoard({ roles: EMERGENCY_ROLES, days: [day] });

    const rows = buildPrintRows(board);

    expect(rows).toHaveLength(2);
    expect(rows[0].firstOfDay).toBe(true);
    expect(rows[0].isHoliday).toBe(true);
    expect(rows[0].holidayName).toBe('Christmas');
    // Driver filled, the other two roles empty → 2 unfilled on the morning row.
    expect(rows[0].unfilledCount).toBe(2);
    expect(rows[1].firstOfDay).toBe(false);
    // Nobody assigned on the afternoon shift → all three roles unfilled.
    expect(rows[1].unfilledCount).toBe(3);
  });
});

// ─── choosePrintLayout ───────────────────────────────────────────────────────

describe('choosePrintLayout', () => {
  it('keeps a 31-day EMERGENCY month (~40 rows, 3 roles) on one portrait page of role columns', () => {
    const board = makeBoard({ roles: EMERGENCY_ROLES, days: dateSeries(31).map((date) => makeDay(date)) });
    const rows = buildPrintRows(board);

    const layout = choosePrintLayout({ roleCount: EMERGENCY_ROLES.length, rowCount: rows.length });

    expect(rows.length).toBeGreaterThanOrEqual(31);
    expect(layout.estimatedPages).toBe(1);
    expect(layout.orientation).toBe('portrait');
    expect(layout.columnMode).toBe('roles');
  });

  it('flips to landscape role columns at 5 roles', () => {
    const layout = choosePrintLayout({ roleCount: 5, rowCount: 20 });
    expect(layout.orientation).toBe('landscape');
    expect(layout.columnMode).toBe('roles');
  });

  it('stacks Role: Name in one portrait column at 7 roles', () => {
    const layout = choosePrintLayout({ roleCount: 7, rowCount: 20 });
    expect(layout.orientation).toBe('portrait');
    expect(layout.columnMode).toBe('stacked');
  });

  it('overflows to further dense pages on a 92-day window', () => {
    const board = makeBoard({
      roles: EMERGENCY_ROLES,
      days: dateSeries(MAX_WINDOW_DAYS).map((date) => makeDay(date)),
    });
    const rows = buildPrintRows(board);

    const layout = choosePrintLayout({ roleCount: EMERGENCY_ROLES.length, rowCount: rows.length });

    expect(layout.estimatedPages).toBeGreaterThan(1);
    expect(layout.density).toBe('dense');
  });
});
