import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Action,
  AvailabilityWindow,
  AvailabilityWindowCategory,
  AvailabilityWindowRole,
  availabilityWindowLabel,
  DayShiftPattern,
  formatShiftLabel,
  MyDutiesResponse,
  MyDuty,
  Schedule,
  ScheduleAssignment,
  ScheduleBoardResponse,
  ScheduleConflict,
  ScheduleDayBoard,
  ScheduleFillStats,
  ScheduleShiftBoard,
  ScheduleStatus,
  ShiftDefinition,
  UserRole,
  assignedDriverCount,
  hasPermission,
  requiredSlotsForShift,
  scheduleFillStats,
  shiftGaps,
  shiftsOverlap,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ShiftScheduleService } from '../availability/shift-schedule.service';
import { serializeWindow } from '../availability/availability-windows.service';
import { toIsoDate } from '../utils/date.util';
import { CreateScheduleDto } from './dto/create-schedule.dto';

const ACTOR_SELECT = { select: { id: true, firstName: true, lastName: true } };

const WINDOW_INCLUDE = {
  openedBy: ACTOR_SELECT,
  closedBy: ACTOR_SELECT,
  roles: { orderBy: { order: 'asc' } },
} as const;

const SCHEDULE_INCLUDE = {
  window: { include: WINDOW_INCLUDE },
  createdBy: ACTOR_SELECT,
  publishedBy: ACTOR_SELECT,
} as const;

const ASSIGNMENT_INCLUDE = {
  user: { select: { id: true, firstName: true, lastName: true, isDriver: true } },
  role: true,
  assignedBy: ACTOR_SELECT,
} as const;

/** `date#slot` — a shift's identity within one window. */
export const shiftKey = (date: string, slot: number) => `${date}#${slot}`;

/** `userId#date#slot` — one person's submission for one shift. */
const submissionKey = (userId: string, date: string, slot: number) =>
  `${userId}#${date}#${slot}`;

/**
 * Everything a schedule operation needs about the window behind it, read once.
 *
 * The pattern is the *window's own* grid, never the default one: a coordinator
 * may have given any day any times, so nothing here may re-derive shifts from
 * the day type.
 */
export interface ScheduleContext {
  scheduleId: string;
  status: ScheduleStatus;
  window: AvailabilityWindow;
  roles: AvailabilityWindowRole[];
  pattern: DayShiftPattern[];
  /** Every shift of the window, by `date#slot`. */
  shifts: Map<string, ShiftDefinition & { date: string }>;
}

/** Just enough of the caller to answer "may they see this, and as whom". */
export interface RequestUser {
  id: string;
  role: UserRole;
}

/** A coordinator sees drafts too; everyone else only sees what is published. */
const canSeeDrafts = (user: RequestUser) =>
  hasPermission(user.role, Action.VIEW_SCHEDULES);

@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftSchedule: ShiftScheduleService,
  ) {}

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  /**
   * Published schedules are readable by everyone on the platform — the rota is
   * posted, not confidential. Drafts stay with the coordinators building them.
   */
  async findAll(
    user: RequestUser,
    page = 1,
    perPage = 25,
    filters: { windowId?: string; category?: string; status?: string } = {},
  ) {
    const skip = (page - 1) * perPage;
    const where = {
      ...(filters.windowId ? { windowId: filters.windowId } : {}),
      ...(filters.status ? { status: this.assertStatus(filters.status) } : {}),
      ...(filters.category
        ? { window: { category: this.assertCategory(filters.category) } }
        : {}),
      ...(canSeeDrafts(user) ? {} : { status: ScheduleStatus.PUBLISHED }),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.schedule.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { createdAt: 'desc' },
        include: SCHEDULE_INCLUDE,
      }),
      this.prisma.schedule.count({ where }),
    ]);

    const stats = await this.statsForSchedules(rows);
    return {
      data: rows.map((row) => ({
        ...serializeSchedule(row),
        stats: stats.get(row.id),
      })),
      total,
      page,
      perPage,
    };
  }

  async findOne(id: string, user: RequestUser): Promise<Schedule> {
    const row = await this.loadRow(id);
    this.assertVisible(row.status as ScheduleStatus, user);
    return serializeSchedule(row);
  }

  /**
   * A draft is a coordinator's working copy; a published schedule is the rota
   * everyone works from. 403 rather than 404 on a draft: the schedule exists,
   * and saying so tells a volunteer their coordinator is on it.
   */
  private assertVisible(status: ScheduleStatus, user: RequestUser): void {
    if (status === ScheduleStatus.PUBLISHED || canSeeDrafts(user)) return;
    throw new ForbiddenException(
      'This schedule has not been published yet — only coordinators can see a draft.',
    );
  }

  async create(dto: CreateScheduleDto, createdById: string): Promise<Schedule> {
    const window = await this.prisma.availabilityWindow.findUnique({
      where: { id: dto.windowId },
      include: WINDOW_INCLUDE,
    });
    if (!window) {
      throw new NotFoundException(`Availability window ${dto.windowId} not found`);
    }

    const existing = await this.prisma.schedule.findUnique({
      where: { windowId: dto.windowId },
    });
    if (existing) {
      throw new ConflictException(
        `This window already has a schedule (${existing.id}); open that one instead of starting a second.`,
      );
    }

    const created = await this.prisma.schedule.create({
      data: { windowId: dto.windowId, createdById },
      include: SCHEDULE_INCLUDE,
    });
    return serializeSchedule(created);
  }

  /**
   * Drafts only. A published schedule is what people are turning up on the
   * strength of, so it is never removed out from under them.
   */
  async remove(id: string): Promise<{ id: string }> {
    const row = await this.loadRow(id);
    if (row.status === ScheduleStatus.PUBLISHED) {
      throw new ConflictException(
        'A published schedule cannot be deleted — personnel have already been told their duties.',
      );
    }
    await this.prisma.schedule.delete({ where: { id } });
    return { id };
  }

  /**
   * Publishing only changes who can see the schedule. Coverage gaps do not
   * block it: rosters are routinely published part-filled and finished by
   * phone, and the confirmation screen states what is still missing.
   */
  async publish(id: string, publishedById: string): Promise<Schedule> {
    const row = await this.loadRow(id);
    if (row.status === ScheduleStatus.PUBLISHED) {
      throw new ConflictException(`Schedule ${id} is already published`);
    }
    const published = await this.prisma.schedule.update({
      where: { id },
      data: {
        status: ScheduleStatus.PUBLISHED,
        publishedById,
        publishedAt: new Date(),
      },
      include: SCHEDULE_INCLUDE,
    });
    return serializeSchedule(published);
  }

  // ── Context ─────────────────────────────────────────────────────────────────

  /** The window, its roles and its own shift grid, for one schedule. */
  async loadContext(scheduleId: string): Promise<ScheduleContext> {
    const row = await this.loadRow(scheduleId);
    const window = serializeWindow(row.window);
    const pattern = await this.shiftSchedule.getPatternForWindow({
      id: window.id,
      startDate: window.startDate,
      endDate: window.endDate,
    });

    const shifts = new Map<string, ShiftDefinition & { date: string }>();
    for (const day of pattern) {
      for (const shift of day.shifts) {
        shifts.set(shiftKey(day.date, shift.slot), { ...shift, date: day.date });
      }
    }

    return {
      scheduleId,
      status: row.status as ScheduleStatus,
      window,
      roles: window.roles ?? [],
      pattern,
      shifts,
    };
  }

  /** Shift slots someone submitted availability for, as `userId#date#slot`. */
  async loadSubmissionKeys(windowId: string): Promise<Set<string>> {
    const rows = await this.prisma.availabilitySubmission.findMany({
      where: { windowId },
      select: { userId: true, date: true, slot: true },
    });
    return new Set(rows.map((row) => submissionKey(row.userId, toIsoDate(row.date), row.slot)));
  }

  /** Everyone who explicitly declared no availability for this window. */
  async loadDeclinedUserIds(windowId: string): Promise<Set<string>> {
    const rows = await this.prisma.availabilityResponse.findMany({
      where: { windowId },
      select: { userId: true },
    });
    return new Set(rows.map((row) => row.userId));
  }

  // ── Board ───────────────────────────────────────────────────────────────────

  async getBoard(id: string, user: RequestUser): Promise<ScheduleBoardResponse> {
    const context = await this.loadContext(id);
    this.assertVisible(context.status, user);
    const [row, assignments, submissions, declined] = await Promise.all([
      this.loadRow(id),
      this.prisma.scheduleAssignment.findMany({
        where: { scheduleId: id },
        include: ASSIGNMENT_INCLUDE,
        orderBy: [{ date: 'asc' }, { slot: 'asc' }, { assignedAt: 'asc' }],
      }),
      this.loadSubmissionKeys(context.window.id),
      this.loadDeclinedUserIds(context.window.id),
    ]);

    const byShift = new Map<string, ScheduleAssignment[]>();
    for (const assignment of assignments) {
      const date = toIsoDate(assignment.date);
      const key = shiftKey(date, assignment.slot);
      const bucket = byShift.get(key) ?? [];
      bucket.push(
        serializeAssignment(assignment, date, {
          submitted: submissions.has(submissionKey(assignment.userId, date, assignment.slot)),
          declined: declined.has(assignment.userId),
        }),
      );
      byShift.set(key, bucket);
    }

    const days: ScheduleDayBoard[] = context.pattern.map((day) => ({
      date: day.date,
      isWeekend: day.isWeekend,
      isHoliday: day.isHoliday,
      holidayName: day.holidayName ?? null,
      shifts: day.shifts.map<ScheduleShiftBoard>((shift) => {
        const onShift = byShift.get(shiftKey(day.date, shift.slot)) ?? [];
        return {
          slot: shift.slot,
          startMinute: shift.startMinute,
          endMinute: shift.endMinute,
          vehiclesNeeded: shift.vehiclesNeeded,
          label: shift.label,
          assignments: onShift,
          driverCount: assignedDriverCount(onShift),
          gaps: shiftGaps({
            vehiclesNeeded: shift.vehiclesNeeded,
            roles: context.roles,
            assignments: onShift,
          }),
        };
      }),
    }));

    return {
      schedule: serializeSchedule(row),
      window: context.window,
      roles: context.roles,
      days,
      conflicts: await this.detectConflicts(context, days),
      stats: scheduleFillStats(days, context.roles),
    };
  }

  /**
   * The same person on two shifts whose clock times overlap.
   *
   * Deliberately not blocked at assignment time: cover is rearranged in an
   * order the platform does not control, and refusing the first half of a swap
   * would be worse than reporting it. The search spans every schedule over the
   * window's dates, because the case that matters most — an Emergency and a
   * SALOP window running the same weekend — cannot be seen from one window.
   */
  private async detectConflicts(
    context: ScheduleContext,
    days: ScheduleDayBoard[],
  ): Promise<ScheduleConflict[]> {
    const mine = days.flatMap((day) =>
      day.shifts.flatMap((shift) =>
        shift.assignments.map((assignment) => ({ day, shift, assignment })),
      ),
    );
    if (mine.length === 0) return [];

    const userIds = [...new Set(mine.map((entry) => entry.assignment.userId))];
    const others = await this.prisma.scheduleAssignment.findMany({
      where: {
        userId: { in: userIds },
        date: {
          gte: new Date(`${context.window.startDate}T00:00:00.000Z`),
          lte: new Date(`${context.window.endDate}T00:00:00.000Z`),
        },
      },
      include: { schedule: { include: { window: true } } },
    });

    // Times for the *other* windows' shifts: each window carries its own grid,
    // so a slot number alone says nothing about when it runs.
    const otherWindows = new Map<string, { id: string; startDate: string; endDate: string; label: string }>();
    for (const row of others) {
      const window = row.schedule.window;
      if (window.id === context.window.id) continue;
      if (!otherWindows.has(window.id)) {
        otherWindows.set(window.id, {
          id: window.id,
          startDate: toIsoDate(window.startDate),
          endDate: toIsoDate(window.endDate),
          label: availabilityWindowLabel({
            category: window.category as AvailabilityWindowCategory,
            name: window.name,
          }),
        });
      }
    }

    const otherShifts = new Map<string, ShiftDefinition>();
    for (const window of otherWindows.values()) {
      const pattern = await this.shiftSchedule.getPatternForWindow(window);
      for (const day of pattern) {
        for (const shift of day.shifts) {
          otherShifts.set(`${window.id}#${shiftKey(day.date, shift.slot)}`, shift);
        }
      }
    }

    const conflicts: ScheduleConflict[] = [];
    const seen = new Set<string>();

    for (const entry of mine) {
      for (const row of others) {
        if (row.userId !== entry.assignment.userId) continue;
        if (row.id === entry.assignment.id) continue;
        const date = toIsoDate(row.date);
        if (date !== entry.day.date) continue;

        const windowId = row.schedule.windowId;
        const crossWindow = windowId !== context.window.id;
        const other = crossWindow
          ? otherShifts.get(`${windowId}#${shiftKey(date, row.slot)}`)
          : context.shifts.get(shiftKey(date, row.slot));
        if (!other || !shiftsOverlap(entry.shift, other)) continue;

        const windowLabel = crossWindow
          ? (otherWindows.get(windowId)?.label ?? 'another window')
          : availabilityWindowLabel(context.window);
        const key = `${entry.assignment.userId}#${date}#${entry.shift.slot}#${windowId}#${row.slot}`;
        if (seen.has(key)) continue;
        seen.add(key);

        conflicts.push({
          userId: entry.assignment.userId,
          userName: `${entry.assignment.user.firstName} ${entry.assignment.user.lastName}`,
          date,
          slot: entry.shift.slot,
          otherWindowId: windowId,
          otherWindowLabel: windowLabel,
          otherLabel: other.label ?? formatShiftLabel(other),
          crossWindow,
        });
      }
    }

    return conflicts;
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  /**
   * One row per assigned person, plus a row for each empty slot — a roster that
   * hid its holes would be worse than no export.
   */
  async getCsv(id: string, user: RequestUser): Promise<string> {
    const board = await this.getBoard(id, user);
    const lines = [
      'date,dayType,holiday,shift,vehiclesNeeded,role,person,driver,source',
    ];

    for (const day of board.days) {
      const dayType = day.isHoliday ? 'holiday' : day.isWeekend ? 'weekend' : 'workday';
      for (const shift of day.shifts) {
        if (shift.assignments.length === 0) {
          lines.push(
            [
              day.date,
              dayType,
              csvCell(day.holidayName ?? ''),
              shift.label,
              String(shift.vehiclesNeeded),
              '',
              '',
              '',
              'unfilled',
            ].join(','),
          );
          continue;
        }
        for (const assignment of shift.assignments) {
          lines.push(
            [
              day.date,
              dayType,
              csvCell(day.holidayName ?? ''),
              shift.label,
              String(shift.vehiclesNeeded),
              csvCell(assignment.roleName ?? ''),
              csvCell(`${assignment.user.firstName} ${assignment.user.lastName}`),
              assignment.user.isDriver ? 'yes' : 'no',
              assignment.isOverride ? 'override' : 'availability',
            ].join(','),
          );
        }
      }
    }

    return `${lines.join('\n')}\n`;
  }

  // ── Personal view ───────────────────────────────────────────────────────────

  /**
   * Published duties for one person, across every window. Drafts are invisible
   * here: a draft is a coordinator's working copy, not a promise to turn up.
   */
  async getMyDuties(userId: string, today = toIsoDate(new Date())): Promise<MyDutiesResponse> {
    const rows = await this.prisma.scheduleAssignment.findMany({
      where: { userId, schedule: { status: ScheduleStatus.PUBLISHED } },
      include: { role: true, schedule: { include: { window: true } } },
      orderBy: [{ date: 'asc' }, { slot: 'asc' }],
    });
    if (rows.length === 0) return { upcoming: [], past: [] };

    const windows = new Map<string, { id: string; startDate: string; endDate: string }>();
    for (const row of rows) {
      const window = row.schedule.window;
      if (!windows.has(window.id)) {
        windows.set(window.id, {
          id: window.id,
          startDate: toIsoDate(window.startDate),
          endDate: toIsoDate(window.endDate),
        });
      }
    }

    const shifts = new Map<string, ShiftDefinition>();
    for (const window of windows.values()) {
      const pattern = await this.shiftSchedule.getPatternForWindow(window);
      for (const day of pattern) {
        for (const shift of day.shifts) {
          shifts.set(`${window.id}#${shiftKey(day.date, shift.slot)}`, shift);
        }
      }
    }

    const upcoming: MyDuty[] = [];
    const past: MyDuty[] = [];

    for (const row of rows) {
      const window = row.schedule.window;
      const date = toIsoDate(row.date);
      const shift = shifts.get(`${window.id}#${shiftKey(date, row.slot)}`);
      // A shift the window no longer defines cannot be described, and inventing
      // times for it would be worse than leaving it out.
      if (!shift) continue;

      const duty: MyDuty = {
        id: row.id,
        scheduleId: row.scheduleId,
        windowId: window.id,
        windowCategory: window.category as AvailabilityWindowCategory,
        windowLabel: availabilityWindowLabel({
          category: window.category as AvailabilityWindowCategory,
          name: window.name,
        }),
        date,
        slot: row.slot,
        startMinute: shift.startMinute,
        endMinute: shift.endMinute,
        label: shift.label,
        vehiclesNeeded: shift.vehiclesNeeded,
        roleName: row.role?.name ?? null,
      };

      if (date >= today) upcoming.push(duty);
      else past.push(duty);
    }

    // Most recent first: the duty someone is looking back at is the last one.
    past.reverse();
    return { upcoming, past };
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private async loadRow(id: string) {
    const row = await this.prisma.schedule.findUnique({
      where: { id },
      include: SCHEDULE_INCLUDE,
    });
    if (!row) throw new NotFoundException(`Schedule ${id} not found`);
    return row;
  }

  /**
   * Fill figures for a page of list rows, without building a board each.
   *
   * Three queries regardless of page size: the shift rows behind every window,
   * the assignments behind every schedule, and (only for a window that
   * materialised no shifts) its pattern.
   */
  private async statsForSchedules(
    rows: Array<{ id: string; windowId: string; window: { startDate: Date; endDate: Date; roles: Array<{ id: string; maxPeople: number }> } }>,
  ): Promise<Map<string, ScheduleFillStats>> {
    const stats = new Map<string, ScheduleFillStats>();
    if (rows.length === 0) return stats;

    const [shiftRows, assignmentRows] = await Promise.all([
      this.prisma.availabilityWindowShift.findMany({
        where: { windowId: { in: rows.map((row) => row.windowId) } },
        select: { windowId: true, date: true, slot: true, vehiclesNeeded: true },
      }),
      this.prisma.scheduleAssignment.findMany({
        where: { scheduleId: { in: rows.map((row) => row.id) } },
        select: {
          scheduleId: true,
          date: true,
          slot: true,
          roleId: true,
          isOverride: true,
          // Both needed to tell a coordinator's override from a self-signup.
          userId: true,
          assignedById: true,
          user: { select: { isDriver: true } },
        },
      }),
    ]);

    const shiftsByWindow = new Map<string, Array<{ key: string; vehiclesNeeded: number }>>();
    for (const shift of shiftRows) {
      const bucket = shiftsByWindow.get(shift.windowId) ?? [];
      bucket.push({
        key: shiftKey(toIsoDate(shift.date), shift.slot),
        vehiclesNeeded: shift.vehiclesNeeded,
      });
      shiftsByWindow.set(shift.windowId, bucket);
    }

    const assignmentsBySchedule = new Map<string, typeof assignmentRows>();
    for (const assignment of assignmentRows) {
      const bucket = assignmentsBySchedule.get(assignment.scheduleId) ?? [];
      bucket.push(assignment);
      assignmentsBySchedule.set(assignment.scheduleId, bucket);
    }

    for (const row of rows) {
      let shifts = shiftsByWindow.get(row.windowId);
      if (!shifts) {
        // Legacy window with no materialised rows: fall back to its pattern,
        // which is what every other read of it does too.
        const pattern = await this.shiftSchedule.getPatternForWindow({
          id: row.windowId,
          startDate: toIsoDate(row.window.startDate),
          endDate: toIsoDate(row.window.endDate),
        });
        shifts = pattern.flatMap((day) =>
          day.shifts.map((shift) => ({
            key: shiftKey(day.date, shift.slot),
            vehiclesNeeded: shift.vehiclesNeeded,
          })),
        );
      }

      const roles = row.window.roles as AvailabilityWindowRole[];
      const perShift = requiredSlotsForShift(roles);
      const assignments = assignmentsBySchedule.get(row.id) ?? [];

      const byShift = new Map<string, typeof assignments>();
      for (const assignment of assignments) {
        const key = shiftKey(toIsoDate(assignment.date), assignment.slot);
        const bucket = byShift.get(key) ?? [];
        bucket.push(assignment);
        byShift.set(key, bucket);
      }

      let shiftsWithGaps = 0;
      for (const shift of shifts) {
        const onShift = byShift.get(shift.key) ?? [];
        const gaps = shiftGaps({
          vehiclesNeeded: shift.vehiclesNeeded,
          roles,
          assignments: onShift,
        });
        if (gaps.length > 0) shiftsWithGaps += 1;
      }

      stats.set(row.id, {
        requiredSlots: shifts.length * perShift,
        filledSlots: assignments.length,
        shiftsWithGaps,
        overrideCount: assignments.filter(
          (assignment) =>
            assignment.isOverride && assignment.assignedById !== assignment.userId,
        ).length,
      });
    }

    return stats;
  }

  private assertStatus(value: string): ScheduleStatus {
    if (!Object.values(ScheduleStatus).includes(value as ScheduleStatus)) {
      throw new BadRequestException(
        `status must be one of ${Object.values(ScheduleStatus).join(', ')}, got "${value}"`,
      );
    }
    return value as ScheduleStatus;
  }

  private assertCategory(value: string): AvailabilityWindowCategory {
    if (!Object.values(AvailabilityWindowCategory).includes(value as AvailabilityWindowCategory)) {
      throw new BadRequestException(
        `category must be one of ${Object.values(AvailabilityWindowCategory).join(', ')}, got "${value}"`,
      );
    }
    return value as AvailabilityWindowCategory;
  }
}

// ─── Serialisation ─────────────────────────────────────────────────────────────

type ScheduleRow = {
  id: string;
  windowId: string;
  status: string;
  createdById: string;
  createdBy?: { id: string; firstName: string; lastName: string } | null;
  createdAt: Date;
  publishedById: string | null;
  publishedBy?: { id: string; firstName: string; lastName: string } | null;
  publishedAt: Date | null;
  updatedAt: Date;
  window?: Parameters<typeof serializeWindow>[0] | null;
};

export function serializeSchedule(row: ScheduleRow): Schedule {
  return {
    id: row.id,
    windowId: row.windowId,
    window: row.window ? serializeWindow(row.window) : undefined,
    status: row.status as ScheduleStatus,
    createdById: row.createdById,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt.toISOString(),
    publishedById: row.publishedById,
    publishedBy: row.publishedBy ?? null,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeAssignment(
  row: {
    id: string;
    scheduleId: string;
    slot: number;
    userId: string;
    user: { id: string; firstName: string; lastName: string; isDriver: boolean };
    roleId: string | null;
    role?: { name: string } | null;
    isOverride: boolean;
    assignedById: string;
    assignedBy?: { id: string; firstName: string; lastName: string } | null;
    assignedAt: Date;
  },
  date: string,
  availability: { submitted: boolean; declined: boolean },
): ScheduleAssignment {
  return {
    id: row.id,
    scheduleId: row.scheduleId,
    date,
    slot: row.slot,
    userId: row.userId,
    user: row.user,
    roleId: row.roleId,
    roleName: row.role?.name ?? null,
    isOverride: row.isOverride,
    // Derived, not stored: an override is something done *to* someone, so
    // a volunteer who put themselves forward must not read as one.
    selfAssigned: row.assignedById === row.userId,
    // Read live rather than from `isOverride`: someone may withdraw after being
    // scheduled, and the board should show that rather than the state at the
    // moment the coordinator clicked.
    availability: availability.submitted
      ? 'submitted'
      : availability.declined
        ? 'declined'
        : 'pending',
    assignedById: row.assignedById,
    assignedBy: row.assignedBy ?? null,
    assignedAt: row.assignedAt.toISOString(),
  };
}

/** Quote a CSV cell only when it needs it, matching the availability export. */
function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
