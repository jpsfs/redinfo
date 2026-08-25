import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AvailabilityWindowDayDto,
  CreateAvailabilityWindowDto,
  CreateMonthlyAvailabilityWindowDto,
} from './dto/create-availability-window.dto';
import { ShiftScheduleService } from './shift-schedule.service';
import { isIsoDate, isoDateRange, parseIsoDate, toIsoDate } from '../utils/date.util';
import {
  AvailabilityWindow,
  AvailabilityWindowCategory,
  availabilityWindowCategoryLabel,
  AvailabilityWindowOverlapsResponse,
  AvailabilityWindowRole,
  AvailabilityWindowStatus,
  CertificationType,
  DayShiftPattern,
  defaultRolesForCategory,
  defaultShiftsForDayType,
  emergencyWindowName,
  MAX_WINDOW_DAYS,
  MAX_WINDOW_NAME_LENGTH,
  monthBounds,
  ShiftSpec,
  toShiftDefinitions,
  toWindowRoles,
  validateWindowRoles,
  WindowRoleSpec,
} from '@redinfo/shared';

// Re-exported so this module stays the import site it has always been; the
// value lives in @redinfo/shared because the window editor enforces it too.
export { MAX_WINDOW_DAYS } from '@redinfo/shared';

type ActorRow = { id: string; firstName: string; lastName: string };

type RoleRow = {
  id: string;
  windowId: string;
  name: string;
  maxPeople: number;
  // Template-literal form so Prisma's own string-union enum type-checks
  // against the shared TS enum without a cast at every call site.
  requiredCertification: `${CertificationType}` | null;
  order: number;
};

type WindowRow = {
  id: string;
  startDate: Date;
  endDate: Date;
  // Prisma generates its own string-union enums; the template-literal form
  // accepts both those and the shared TS enum without a cast at every call.
  category: `${AvailabilityWindowCategory}`;
  name: string | null;
  status: `${AvailabilityWindowStatus}`;
  openedById: string;
  openedBy?: ActorRow | null;
  openedAt: Date;
  closedById: string | null;
  closedBy?: ActorRow | null;
  closedAt: Date | null;
  roles?: RoleRow[];
  createdAt: Date;
  updatedAt: Date;
};

const ACTOR_SELECT = { select: { id: true, firstName: true, lastName: true } };

/**
 * Every read of a window brings its roles: a window without them reads as one
 * with none, which on the schedule screen means "assign people without roles".
 */
const WINDOW_INCLUDE = {
  openedBy: ACTOR_SELECT,
  closedBy: ACTOR_SELECT,
  roles: { orderBy: { order: 'asc' } },
} as const;

@Injectable()
export class AvailabilityWindowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftSchedule: ShiftScheduleService,
  ) {}

  async findAll(
    page = 1,
    perPage = 25,
    filters: { category?: string; status?: string } = {},
  ) {
    const skip = (page - 1) * perPage;
    const where = {
      ...(filters.category
        ? { category: this.assertCategory(filters.category) }
        : {}),
      ...(filters.status ? { status: this.assertStatus(filters.status) } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.availabilityWindow.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { openedAt: 'desc' },
        include: WINDOW_INCLUDE,
      }),
      this.prisma.availabilityWindow.count({ where }),
    ]);
    return { data: rows.map(serializeWindow), total, page, perPage };
  }

  async findOne(id: string) {
    const window = await this.prisma.availabilityWindow.findUnique({
      where: { id },
      include: WINDOW_INCLUDE,
    });
    if (!window) throw new NotFoundException(`Availability window ${id} not found`);
    return serializeWindow(window);
  }

  /**
   * Every open window, by category and then by date.
   *
   * More than one can be open at a time now that windows have categories — a
   * volunteer may be asked for emergency cover and local-support cover over the
   * same dates — so callers that act on "the" window must say which. This is
   * the list a volunteer picks from, hence grouped by rota rather than by when
   * a coordinator happened to open each one.
   */
  async findOpen(): Promise<AvailabilityWindow[]> {
    const rows = await this.prisma.availabilityWindow.findMany({
      where: { status: AvailabilityWindowStatus.OPEN },
      orderBy: [{ category: 'asc' }, { startDate: 'asc' }],
      include: WINDOW_INCLUDE,
    });
    return rows.map(serializeWindow);
  }

  /**
   * The most recently opened OPEN window, or null when none is open. Only a
   * default pick for callers given no window id — never "the" open window.
   */
  async findActive(): Promise<AvailabilityWindow | null> {
    const window = await this.prisma.availabilityWindow.findFirst({
      where: { status: AvailabilityWindowStatus.OPEN },
      orderBy: { openedAt: 'desc' },
      include: WINDOW_INCLUDE,
    });
    return window ? serializeWindow(window) : null;
  }

  /**
   * Windows of one category already covering any day of `[startDate, endDate]`,
   * split by whether they are still open.
   *
   * Both halves matter and mean different things: an open overlap is refused
   * outright, a closed one is only worth warning about — the same dates being
   * asked for twice is usually a mistake, but sometimes exactly the intent.
   */
  async findOverlaps(
    category: string,
    startDate: string,
    endDate: string,
  ): Promise<AvailabilityWindowOverlapsResponse> {
    const from = this.assertIsoDate(startDate, 'startDate');
    const to = this.assertIsoDate(endDate, 'endDate');
    if (to < from) {
      throw new BadRequestException('endDate must be on or after startDate');
    }

    const rows = await this.prisma.availabilityWindow.findMany({
      where: {
        category: this.assertCategory(category),
        // Inclusive ranges overlap unless one ends before the other starts.
        startDate: { lte: parseIsoDate(to) },
        endDate: { gte: parseIsoDate(from) },
      },
      orderBy: { startDate: 'asc' },
      include: WINDOW_INCLUDE,
    });

    const windows = rows.map(serializeWindow);
    return {
      open: windows.filter((window) => window.status === AvailabilityWindowStatus.OPEN),
      closed: windows.filter((window) => window.status === AvailabilityWindowStatus.CLOSED),
    };
  }

  /**
   * The window the self-service screen should show: the open one if there is
   * one, otherwise the most recently opened (closed) window, so volunteers can
   * still read back their final submissions.
   */
  async findActiveOrLatest(): Promise<AvailabilityWindow | null> {
    const active = await this.findActive();
    if (active) return active;
    const latest = await this.prisma.availabilityWindow.findFirst({
      orderBy: { openedAt: 'desc' },
      include: WINDOW_INCLUDE,
    });
    return latest ? serializeWindow(latest) : null;
  }

  /**
   * Open a window and materialise its shifts, one row per day and shift.
   *
   * `dto.days` carries the per-day grid a coordinator built; without it the
   * default grid is used, which is what the whole-month shortcut relies on.
   */
  async open(dto: CreateAvailabilityWindowDto, openedById: string) {
    const startDate = this.assertIsoDate(dto.startDate, 'startDate');
    const endDate = this.assertIsoDate(dto.endDate, 'endDate');
    const category = this.assertCategory(dto.category);
    const name = normaliseName(dto.name);

    if (endDate < startDate) {
      throw new BadRequestException('endDate must be on or after startDate');
    }

    const dates = isoDateRange(startDate, endDate);
    if (dates.length > MAX_WINDOW_DAYS) {
      throw new BadRequestException(
        `A window may span at most ${MAX_WINDOW_DAYS} days (got ${dates.length})`,
      );
    }

    await this.assertNoBlockingOverlap(
      category,
      startDate,
      endDate,
      dto.acknowledgeOverlap === true,
    );

    const shiftsByDate = await this.resolveShifts(dates, dto.days);
    const roles = this.resolveRoles(category, dto.roles);

    // One transaction: a window whose shift rows failed to write would look
    // like a window with no shifts at all, and read back as the default grid.
    const created = await this.prisma.$transaction(async (tx) => {
      const window = await tx.availabilityWindow.create({
        data: {
          startDate: parseIsoDate(startDate),
          endDate: parseIsoDate(endDate),
          category,
          name,
          status: AvailabilityWindowStatus.OPEN,
          openedById,
          // Nested so the window comes back carrying its roles, and so a
          // duplicate name fails the whole open rather than half of it.
          ...(roles.length > 0 ? { roles: { create: roles } } : {}),
        },
        include: WINDOW_INCLUDE,
      });

      const rows = dates.flatMap((date) =>
        toShiftDefinitions(shiftsByDate.get(date) ?? []).map((shift) => ({
          windowId: window.id,
          date: parseIsoDate(date),
          slot: shift.slot,
          startMinute: shift.startMinute,
          endMinute: shift.endMinute,
          vehiclesNeeded: shift.vehiclesNeeded,
        })),
      );
      if (rows.length > 0) {
        await tx.availabilityWindowShift.createMany({ data: rows });
      }

      return window;
    });

    return serializeWindow(created);
  }

  /**
   * Open a window covering a whole calendar month on the default grid — the
   * one-click path for "we need emergency availability for next month".
   *
   * Category and name are not the caller's to choose here: this shortcut *is*
   * the emergency one, named after the month it covers.
   */
  async openMonth(dto: CreateMonthlyAvailabilityWindowDto, openedById: string) {
    let bounds: { startDate: string; endDate: string };
    try {
      bounds = monthBounds(dto.year, dto.month);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid year or month',
      );
    }
    return this.open(
      {
        ...bounds,
        category: AvailabilityWindowCategory.EMERGENCY,
        name: emergencyWindowName(dto.month),
        acknowledgeOverlap: dto.acknowledgeOverlap,
      },
      openedById,
    );
  }

  /**
   * The overlap rules for opening a window, in one place:
   *
   *  - another **open** window of the same category over the same dates is
   *    refused: two live calls for the same rota and the same days would split
   *    the same people's answers in two.
   *  - a **closed** one is allowed, but only once the coordinator has confirmed
   *    they meant to ask for those dates again.
   *
   * Categories never block each other — that is the point of having them.
   */
  private async assertNoBlockingOverlap(
    category: AvailabilityWindowCategory,
    startDate: string,
    endDate: string,
    acknowledged: boolean,
  ): Promise<void> {
    const { open, closed } = await this.findOverlaps(category, startDate, endDate);
    const label = availabilityWindowCategoryLabel(category);

    // "for <label>" rather than "a <label> window": the label is data, and
    // English articles do not survive it ("a Emergency window").
    if (open.length > 0) {
      throw new ConflictException(
        `An availability window for ${label} is already open over these dates ` +
          `(${describeWindows(open)}). Close it before opening another one, or pick ` +
          'dates it does not cover.',
      );
    }

    if (closed.length > 0 && !acknowledged) {
      throw new ConflictException(
        `A closed availability window for ${label} already covers these dates ` +
          `(${describeWindows(closed)}). Confirm to open another one for the same dates.`,
      );
    }
  }

  /** The window's own shifts, per day — what its calendar screens render. */
  async getCalendar(id: string): Promise<DayShiftPattern[]> {
    const window = await this.findOne(id);
    return this.shiftSchedule.getPatternForWindow(window);
  }

  /**
   * The shifts each day of the window will get.
   *
   * A supplied `days` list must cover the range exactly — no gaps, no strays,
   * no repeats. Anything looser would silently drop days to "no shifts", which
   * reads on the volunteer's calendar as a day nobody is needed.
   */
  private async resolveShifts(
    dates: string[],
    days?: AvailabilityWindowDayDto[],
  ): Promise<Map<string, ShiftSpec[]>> {
    if (!days) {
      const contexts = await this.shiftSchedule.getDayContexts(
        dates[0],
        dates[dates.length - 1],
      );
      return new Map(
        contexts.map((context) => [context.date, defaultShiftsForDayType(context.dayType)]),
      );
    }

    const inRange = new Set(dates);
    const byDate = new Map<string, ShiftSpec[]>();

    for (const day of days) {
      const date = this.assertIsoDate(day.date, 'days[].date');
      if (!inRange.has(date)) {
        throw new BadRequestException(
          `${date} is outside the window (${dates[0]} – ${dates[dates.length - 1]})`,
        );
      }
      if (byDate.has(date)) {
        throw new BadRequestException(`Duplicate shifts supplied for ${date}`);
      }
      byDate.set(date, this.shiftSchedule.normaliseDayShifts(date, day.shifts ?? []));
    }

    const missing = dates.filter((date) => !byDate.has(date));
    if (missing.length > 0) {
      const shown = missing.slice(0, 5).join(', ');
      const rest = missing.length > 5 ? ` and ${missing.length - 5} more` : '';
      throw new BadRequestException(`Shifts are missing for ${shown}${rest}`);
    }

    return byDate;
  }

  /**
   * The roles the window opens with: what the coordinator sent, or the
   * category's defaults when they sent nothing at all.
   *
   * An explicitly empty list is honoured — a window whose schedule needs no
   * posts is legitimate — which is why "omitted" and "empty" are told apart
   * here rather than collapsed into one falsy check.
   */
  private resolveRoles(
    category: AvailabilityWindowCategory,
    roles?: WindowRoleSpec[],
  ): Array<WindowRoleSpec & { order: number }> {
    const requested = roles ?? defaultRolesForCategory(category);
    const error = validateWindowRoles(requested);
    if (error) throw new BadRequestException(error);
    return toWindowRoles(requested);
  }

  async close(id: string, closedById: string) {
    const window = await this.prisma.availabilityWindow.findUnique({ where: { id } });
    if (!window) throw new NotFoundException(`Availability window ${id} not found`);
    if (window.status === AvailabilityWindowStatus.CLOSED) {
      throw new ConflictException(`Availability window ${id} is already closed`);
    }

    const closed = await this.prisma.availabilityWindow.update({
      where: { id },
      data: {
        status: AvailabilityWindowStatus.CLOSED,
        closedById,
        closedAt: new Date(),
      },
      include: WINDOW_INCLUDE,
    });
    return serializeWindow(closed);
  }

  private assertIsoDate(value: string, field: string): string {
    const normalised = value?.length > 10 ? toIsoDate(value) : value;
    if (!isIsoDate(normalised)) {
      throw new BadRequestException(
        `${field} must be a valid calendar date (YYYY-MM-DD), got "${value}"`,
      );
    }
    return normalised;
  }

  /**
   * The DTO validates the body, but category also arrives from query strings
   * (the list filter, the overlap preflight) where nothing has checked it.
   */
  private assertCategory(value: string): AvailabilityWindowCategory {
    const categories = Object.values(AvailabilityWindowCategory) as string[];
    if (!categories.includes(value)) {
      throw new BadRequestException(
        `category must be one of ${categories.join(', ')}, got "${value}"`,
      );
    }
    return value as AvailabilityWindowCategory;
  }

  private assertStatus(value: string): AvailabilityWindowStatus {
    const statuses = Object.values(AvailabilityWindowStatus) as string[];
    if (!statuses.includes(value)) {
      throw new BadRequestException(
        `status must be one of ${statuses.join(', ')}, got "${value}"`,
      );
    }
    return value as AvailabilityWindowStatus;
  }
}

/** Blank is stored as null, so "no name" is one value rather than two. */
function normaliseName(name?: string | null): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_WINDOW_NAME_LENGTH) {
    throw new BadRequestException(
      `name may be at most ${MAX_WINDOW_NAME_LENGTH} characters (got ${trimmed.length})`,
    );
  }
  return trimmed;
}

/** e.g. `Emergency - October, 2026-10-01 – 2026-10-31`, for conflict messages. */
function describeWindows(windows: AvailabilityWindow[]): string {
  return windows
    .map((window) =>
      [window.name, `${window.startDate} – ${window.endDate}`]
        .filter(Boolean)
        .join(', '),
    )
    .join('; ');
}

function serializeRole(row: RoleRow): AvailabilityWindowRole {
  return {
    id: row.id,
    windowId: row.windowId,
    name: row.name,
    maxPeople: row.maxPeople,
    requiredCertification: row.requiredCertification as CertificationType | null,
    order: row.order,
  };
}

export function serializeWindow(row: WindowRow): AvailabilityWindow {
  return {
    id: row.id,
    startDate: toIsoDate(row.startDate),
    endDate: toIsoDate(row.endDate),
    category: row.category as AvailabilityWindowCategory,
    name: row.name ?? null,
    status: row.status as AvailabilityWindowStatus,
    openedById: row.openedById,
    openedBy: row.openedBy ?? null,
    openedAt: row.openedAt.toISOString(),
    closedById: row.closedById,
    closedBy: row.closedBy ?? null,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    // Undefined rather than [] when the roles were not read: "none defined" and
    // "not loaded" are different answers, and only one of them is this row's.
    roles: row.roles ? row.roles.map(serializeRole) : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
