import {
  AvailabilityWindowRole,
  ScheduleAssignment,
  ScheduleBoardResponse,
  UNLIMITED_ROLE_PEOPLE,
} from '@redinfo/shared';

/**
 * Pure, DOM-free layout math for the print screen (`SchedulePrintPage.tsx`).
 *
 * Kept apart from the component so "does this fit on one page" is testable
 * with plain assertions rather than a rendered DOM and a real printer.
 * `buildPrintRows` turns a board into the flat row/column shape a print
 * table wants; `choosePrintLayout` turns a row and column count into paper
 * geometry. Neither reads a clock, a window size, or anything else that
 * would make a test flaky.
 */

// ─── Rows ────────────────────────────────────────────────────────────────────

/** One role's (or the crew column's) people on one shift, print-ready. */
export interface PrintCell {
  /** Assigned people, name plus whether they drive (bold marker, B&W-safe). */
  people: Array<{ name: string; isDriver: boolean }>;
  /**
   * Open places still to fill, rendered as em-dashes.
   *
   * For a capped role this is `maxPeople - people.length`. A role with no cap
   * (`UNLIMITED_ROLE_PEOPLE`) and the roleless "Crew" column have no count to
   * fall short of, so they carry at most one — enough to mark the cell empty
   * without claiming to know how many more the pool could take.
   */
  unfilled: number;
}

/** One printed row: one shift, one cell per column. */
export interface PrintRow {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  /** True only on the day's first shift row — the date prints once per day. */
  firstOfDay: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  shiftLabel: string;
  cells: PrintCell[];
  /** Sum of every cell's `unfilled` on this row — drives the legend/at-a-glance count. */
  unfilledCount: number;
}

function buildCell(
  role: AvailabilityWindowRole | null,
  assignments: ScheduleAssignment[],
): PrintCell {
  const people = assignments
    .filter((assignment) => (assignment.roleId ?? null) === (role?.id ?? null))
    .map((assignment) => ({
      name: `${assignment.user.firstName} ${assignment.user.lastName}`,
      isDriver: assignment.user.isDriver,
    }));
  const capacity = role?.maxPeople ?? UNLIMITED_ROLE_PEOPLE;
  const unfilled =
    capacity === UNLIMITED_ROLE_PEOPLE ? (people.length === 0 ? 1 : 0) : Math.max(0, capacity - people.length);
  return { people, unfilled };
}

/**
 * One row per shift, one column per role (a single unnamed "Crew" column when
 * the window defines none — same convention as `ScheduleBoard`'s `columns`).
 */
export function buildPrintRows(board: ScheduleBoardResponse): PrintRow[] {
  const columns: Array<AvailabilityWindowRole | null> = board.roles.length > 0 ? board.roles : [null];
  const rows: PrintRow[] = [];

  for (const day of board.days) {
    day.shifts.forEach((shift, index) => {
      const cells = columns.map((role) => buildCell(role, shift.assignments));
      rows.push({
        date: day.date,
        firstOfDay: index === 0,
        isWeekend: day.isWeekend,
        isHoliday: day.isHoliday,
        holidayName: day.holidayName ?? null,
        shiftLabel: shift.label,
        cells,
        unfilledCount: cells.reduce((sum, cell) => sum + cell.unfilled, 0),
      });
    });
  }

  return rows;
}

// ─── Page geometry ───────────────────────────────────────────────────────────

export type PrintOrientation = 'portrait' | 'landscape';
export type PrintColumnMode = 'roles' | 'stacked';
export type PrintDensity = 'comfortable' | 'compact' | 'dense';

export interface PrintLayout {
  orientation: PrintOrientation;
  columnMode: PrintColumnMode;
  density: PrintDensity;
  /** Data rows the chosen density fits per page. */
  rowsPerPage: number;
  estimatedPages: number;
}

/**
 * Density tiers over an A4 portrait body: 277mm usable height at 10mm
 * margins, less a letterhead (compact, but figured generously here) and
 * ~7mm column header, leaves ~236mm for data rows (there is no longer a
 * legend eating into that — see the print page). The loosest tier whose row
 * height still fits every row in that space wins; erring conservative here
 * just leaves headroom unused, not an overflow, so the estimate does not
 * need to track the letterhead precisely.
 */
const DENSITY_TIERS: Array<{ density: PrintDensity; rowsPerPage: number }> = [
  { density: 'comfortable', rowsPerPage: 31 }, // 236mm / 7.5mm
  { density: 'compact', rowsPerPage: 39 }, // 236mm / 6.0mm
  { density: 'dense', rowsPerPage: 49 }, // 236mm / 4.8mm
];

/**
 * Orientation, column layout and row density for a board of the given shape.
 *
 * Column mode follows role count alone: 0–4 roles keep the ordinary one-
 * column-per-role portrait table (0 collapses to the single "Crew" column);
 * 5–6 flip to landscape, still one column per role, because a sixth role
 * column no longer fits an A4 portrait width; 7+ gives up on side-by-side
 * columns altogether and stacks "Role: Name" lines in one column instead —
 * back in portrait, since a table that wide would need paper this app does
 * not target. EMERGENCY windows carry 3 roles, so they never leave the first
 * tier.
 *
 * Density picks the loosest tier that still keeps every row on the fitting
 * page count; below the tightest tier (`dense`) the rota stops being legible
 * on a wall, so a board too big even for that overflows to further pages
 * (repeated header) rather than shrinking further — see `SchedulePrintPage`'s
 * `thead { display: table-header-group }`.
 */
export function choosePrintLayout({
  roleCount,
  rowCount,
}: {
  roleCount: number;
  rowCount: number;
}): PrintLayout {
  const orientation: PrintOrientation = roleCount >= 5 && roleCount <= 6 ? 'landscape' : 'portrait';
  const columnMode: PrintColumnMode = roleCount >= 7 ? 'stacked' : 'roles';

  const fitting = DENSITY_TIERS.find((tier) => rowCount <= tier.rowsPerPage);
  const { density, rowsPerPage } = fitting ?? DENSITY_TIERS[DENSITY_TIERS.length - 1];
  const estimatedPages = Math.max(1, Math.ceil(rowCount / rowsPerPage));

  return { orientation, columnMode, density, rowsPerPage, estimatedPages };
}
