import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityWindowsService } from './availability-windows.service';
import { ShiftScheduleService } from './shift-schedule.service';
import { SubmitAvailabilityDto } from './dto/submit-availability.dto';
import { isIsoDate, parseIsoDate, toIsoDate } from '../utils/date.util';
import {
  Action,
  AvailabilityEntry,
  AvailabilityMatrixDay,
  AvailabilityMatrixPerson,
  AvailabilityMatrixResponse,
  AvailabilityResponseStatus,
  AvailabilityWindow,
  AvailabilityWindowStatus,
  availabilityEligibleRoles,
  coverageLevel,
  DayShiftPattern,
  hasPermission,
  MyAvailabilityResponse,
  ShiftCode,
  SHIFT_DEFINITIONS,
  UserRole,
} from '@redinfo/shared';

/** The authenticated caller, as attached to the request by `JwtStrategy`. */
export interface RequestUser {
  id: string;
  role: UserRole;
}

const PERSON_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  isDriver: true,
} as const;

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly windows: AvailabilityWindowsService,
    private readonly shiftSchedule: ShiftScheduleService,
  ) {}

  // ─── Self-service ───────────────────────────────────────────────────────────

  /**
   * Everything the submission screen needs for one user: the window in play,
   * whether it still accepts changes, their current selection, and the
   * applicable shifts per day.
   */
  async getMine(userId: string, windowId?: string): Promise<MyAvailabilityResponse> {
    const window = windowId
      ? await this.windows.findOne(windowId)
      : await this.windows.findActiveOrLatest();

    if (!window) {
      return { window: null, canSubmit: false, declined: false, calendar: [], entries: [] };
    }

    const [calendar, submissions, declined] = await Promise.all([
      this.shiftSchedule.getPatternForRange(window.startDate, window.endDate),
      this.prisma.availabilitySubmission.findMany({
        where: { windowId: window.id, userId },
        orderBy: [{ date: 'asc' }, { shiftCode: 'asc' }],
      }),
      this.hasDeclined(window.id, userId),
    ]);

    return {
      window,
      canSubmit: window.status === AvailabilityWindowStatus.OPEN,
      declined,
      calendar,
      entries: groupEntries(submissions),
    };
  }

  /**
   * Another person's availability. Anyone may read their own; reading someone
   * else's requires `VIEW_AVAILABILITY_MATRIX` (i.e. a coordinator).
   */
  async getForUser(
    targetUserId: string,
    requester: RequestUser,
    windowId?: string,
  ): Promise<MyAvailabilityResponse> {
    this.assertOwnerOrCoordinator(targetUserId, requester);
    const exists = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!exists) throw new NotFoundException(`User ${targetUserId} not found`);
    return this.getMine(targetUserId, windowId);
  }

  /**
   * Ownership check for self-service data. Same user always passes; everyone
   * else needs the coordinator-level action.
   */
  assertOwnerOrCoordinator(targetUserId: string, requester: RequestUser): void {
    if (requester?.id && requester.id === targetUserId) return;
    if (requester?.role && hasPermission(requester.role, Action.VIEW_AVAILABILITY_MATRIX)) {
      return;
    }
    throw new ForbiddenException('You may only view your own availability');
  }

  /**
   * Replace the caller's selection for the open window with `dto.entries`.
   *
   * Rejected with 403 once the window is closed — the API-level half of the
   * close block, so a stale browser tab cannot slip a late submission through.
   */
  async submitMine(user: RequestUser, dto: SubmitAvailabilityDto): Promise<MyAvailabilityResponse> {
    const window = await this.resolveSubmittableWindow(dto.windowId);
    const patterns = await this.shiftSchedule.getPatternForRange(
      window.startDate,
      window.endDate,
    );
    const patternByDate = new Map<string, DayShiftPattern>(
      patterns.map((pattern) => [pattern.date, pattern]),
    );

    const desired = new Set<string>();
    const seenDates = new Set<string>();

    for (const entry of dto.entries ?? []) {
      const date = normaliseIsoDate(entry.date, 'entries[].date');
      if (seenDates.has(date)) {
        throw new BadRequestException(`Duplicate entry for ${date}`);
      }
      seenDates.add(date);

      const pattern = patternByDate.get(date);
      if (!pattern) {
        throw new BadRequestException(
          `${date} is outside the availability window (${window.startDate} – ${window.endDate})`,
        );
      }

      for (const shiftCode of entry.shiftCodes ?? []) {
        this.shiftSchedule.assertShiftValidForPattern(pattern, shiftCode);
        desired.add(submissionKey(date, shiftCode));
      }
    }

    const existing = await this.prisma.availabilitySubmission.findMany({
      where: { windowId: window.id, userId: user.id },
    });

    const existingKeys = new Map(
      existing.map((row) => [submissionKey(toIsoDate(row.date), row.shiftCode), row.id]),
    );

    const idsToDelete = [...existingKeys.entries()]
      .filter(([key]) => !desired.has(key))
      .map(([, id]) => id);

    const toCreate = [...desired]
      .filter((key) => !existingKeys.has(key))
      .map((key) => {
        const [date, shiftCode] = key.split('|');
        return {
          userId: user.id,
          windowId: window.id,
          date: parseIsoDate(date),
          shiftCode: shiftCode as `${ShiftCode}`,
        };
      });

    await this.prisma.$transaction([
      ...(idsToDelete.length
        ? [this.prisma.availabilitySubmission.deleteMany({ where: { id: { in: idsToDelete } } })]
        : []),
      ...(toCreate.length
        ? [this.prisma.availabilitySubmission.createMany({ data: toCreate })]
        : []),
      // Submitting anything supersedes a prior "no availability" answer, so the
      // two states can never both be true for the same (window, user).
      this.prisma.availabilityResponse.deleteMany({
        where: { windowId: window.id, userId: user.id },
      }),
    ]);

    return this.getMine(user.id, window.id);
  }

  /**
   * Record "no availability this window" — a distinct answer from having never
   * responded. Clears any shifts the caller had selected, in the same
   * transaction, so the two are mutually exclusive. Idempotent.
   */
  async declineMine(user: RequestUser, windowId?: string): Promise<MyAvailabilityResponse> {
    const window = await this.resolveSubmittableWindow(windowId);

    await this.prisma.$transaction([
      this.prisma.availabilitySubmission.deleteMany({
        where: { windowId: window.id, userId: user.id },
      }),
      this.prisma.availabilityResponse.deleteMany({
        where: { windowId: window.id, userId: user.id },
      }),
      this.prisma.availabilityResponse.create({
        data: {
          windowId: window.id,
          userId: user.id,
          status: AvailabilityResponseStatus.DECLINED,
        },
      }),
    ]);

    return this.getMine(user.id, window.id);
  }

  /** Undo a decline ("unchecking the box"), back to "not yet responded". */
  async undeclineMine(user: RequestUser, windowId?: string): Promise<MyAvailabilityResponse> {
    const window = await this.resolveSubmittableWindow(windowId);
    await this.prisma.availabilityResponse.deleteMany({
      where: { windowId: window.id, userId: user.id },
    });
    return this.getMine(user.id, window.id);
  }

  // ─── Coordinator views ──────────────────────────────────────────────────────

  /** Applicable shifts per day for an arbitrary range (calendar preview). */
  async getCalendar(from: string, to: string): Promise<DayShiftPattern[]> {
    return this.shiftSchedule.getPatternForRange(
      normaliseIsoDate(from, 'from'),
      normaliseIsoDate(to, 'to'),
    );
  }

  /**
   * Team-level coverage for one window: per day and shift, how many people are
   * available and how many of those are drivers, plus each eligible person's
   * tri-state response.
   */
  async getMatrix(windowId?: string): Promise<AvailabilityMatrixResponse> {
    const window = windowId
      ? await this.windows.findOne(windowId)
      : await this.windows.findActiveOrLatest();
    if (!window) {
      throw new NotFoundException('No availability window exists yet');
    }

    const eligibleRoles = availabilityEligibleRoles();
    const personnel = await this.prisma.user.findMany({
      where: { isActive: true, role: { in: eligibleRoles } },
      select: PERSON_SELECT,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    const personnelIds = personnel.map((person) => person.id);
    const driverIds = new Set(
      personnel.filter((person) => person.isDriver).map((person) => person.id),
    );

    const [calendar, submissions, declines] = await Promise.all([
      this.shiftSchedule.getPatternForRange(window.startDate, window.endDate),
      this.prisma.availabilitySubmission.findMany({
        where: { windowId: window.id, userId: { in: personnelIds } },
        orderBy: [{ date: 'asc' }, { shiftCode: 'asc' }],
      }),
      this.prisma.availabilityResponse.findMany({
        where: { windowId: window.id, userId: { in: personnelIds } },
        select: { userId: true },
      }),
    ]);

    // date|shiftCode → userIds, in roster order so the drill-down list is stable.
    const rosterOrder = new Map(personnelIds.map((id, index) => [id, index]));
    const availabilityByCell = new Map<string, string[]>();
    const submittedUserIds = new Set<string>();
    for (const row of submissions) {
      const key = submissionKey(toIsoDate(row.date), row.shiftCode);
      const bucket = availabilityByCell.get(key) ?? [];
      bucket.push(row.userId);
      availabilityByCell.set(key, bucket);
      submittedUserIds.add(row.userId);
    }
    for (const bucket of availabilityByCell.values()) {
      bucket.sort(
        (a, b) => (rosterOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (rosterOrder.get(b) ?? Number.MAX_SAFE_INTEGER),
      );
    }

    const declinedUserIds = new Set(declines.map((row) => row.userId));

    const days: AvailabilityMatrixDay[] = calendar.map((day) => ({
      date: day.date,
      isWeekend: day.isWeekend,
      isHoliday: day.isHoliday,
      holidayName: day.holidayName ?? null,
      shifts: day.shifts.map((shift) => {
        const availableUserIds = availabilityByCell.get(submissionKey(day.date, shift.code)) ?? [];
        const driverCount = availableUserIds.filter((id) => driverIds.has(id)).length;
        return {
          shiftCode: shift.code,
          label: shift.label,
          availableCount: availableUserIds.length,
          driverCount,
          coverageLevel: coverageLevel(availableUserIds.length, driverCount),
          availableUserIds,
        };
      }),
    }));

    const taggedPersonnel: AvailabilityMatrixPerson[] = personnel.map((person) => ({
      ...person,
      responseStatus: submittedUserIds.has(person.id)
        ? 'submitted'
        : declinedUserIds.has(person.id)
          ? 'declined'
          : 'pending',
    }));

    return {
      window,
      personnel: taggedPersonnel,
      days,
      responseStats: {
        submitted: taggedPersonnel.filter((p) => p.responseStatus === 'submitted').length,
        declined: taggedPersonnel.filter((p) => p.responseStatus === 'declined').length,
        pending: taggedPersonnel.filter((p) => p.responseStatus === 'pending').length,
        total: taggedPersonnel.length,
      },
    };
  }

  /** The matrix as CSV: one row per day/shift, names in the last column. */
  async getMatrixCsv(windowId?: string): Promise<string> {
    const matrix = await this.getMatrix(windowId);
    const nameById = new Map(
      matrix.personnel.map((person) => [
        person.id,
        `${person.firstName} ${person.lastName}${person.isDriver ? ' (driver)' : ''}`,
      ]),
    );

    const headers = [
      'date',
      'dayType',
      'holiday',
      'shift',
      'availableCount',
      'driverCount',
      'coverage',
      'available',
    ];

    const rows = matrix.days.flatMap((day) =>
      day.shifts.map((shift) =>
        [
          day.date,
          day.isHoliday ? 'holiday' : day.isWeekend ? 'weekend' : 'workday',
          csvEscape(day.holidayName ?? ''),
          shift.label,
          String(shift.availableCount),
          String(shift.driverCount),
          shift.coverageLevel,
          csvEscape(
            shift.availableUserIds.map((id) => nameById.get(id) ?? id).join('; '),
          ),
        ].join(','),
      ),
    );

    return [headers.join(','), ...rows].join('\n');
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async hasDeclined(windowId: string, userId: string): Promise<boolean> {
    const response = await this.prisma.availabilityResponse.findUnique({
      where: { windowId_userId: { windowId, userId } },
    });
    return response !== null;
  }

  /**
   * The window a write applies to. Anything other than the single OPEN window
   * is refused — closing a window blocks submissions at the API, not just in
   * the UI.
   */
  private async resolveSubmittableWindow(windowId?: string): Promise<AvailabilityWindow> {
    if (windowId) {
      const window = await this.windows.findOne(windowId);
      if (window.status !== AvailabilityWindowStatus.OPEN) {
        throw new ForbiddenException(
          `Availability window ${window.startDate} – ${window.endDate} is closed; submissions are no longer accepted`,
        );
      }
      return window;
    }

    const active = await this.windows.findActive();
    if (!active) {
      throw new ForbiddenException(
        'No availability window is currently open; submissions are not accepted',
      );
    }
    return active;
  }
}

// ─── Module-local helpers ──────────────────────────────────────────────────────

function submissionKey(date: string, shiftCode: ShiftCode | string): string {
  return `${date}|${shiftCode}`;
}

function normaliseIsoDate(value: string, field: string): string {
  const normalised = value && value.length > 10 ? toIsoDate(value) : value;
  if (!isIsoDate(normalised)) {
    throw new BadRequestException(
      `${field} must be a valid calendar date (YYYY-MM-DD), got "${value}"`,
    );
  }
  return normalised;
}

function groupEntries(
  // Prisma's generated enum is a string union, so accept both it and the
  // shared TS enum via the template-literal form.
  submissions: Array<{ date: Date; shiftCode: `${ShiftCode}` }>,
): AvailabilityEntry[] {
  const byDate = new Map<string, ShiftCode[]>();
  for (const row of submissions) {
    const date = toIsoDate(row.date);
    const bucket = byDate.get(date) ?? [];
    bucket.push(row.shiftCode as ShiftCode);
    byDate.set(date, bucket);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, shiftCodes]) => ({
      date,
      shiftCodes: shiftCodes.sort(
        (a, b) => SHIFT_DEFINITIONS[a].startHour - SHIFT_DEFINITIONS[b].startHour,
      ),
    }));
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
