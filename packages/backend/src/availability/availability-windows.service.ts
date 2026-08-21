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
  AvailabilityWindowStatus,
  DayShiftPattern,
  defaultShiftsForDayType,
  MAX_WINDOW_DAYS,
  monthBounds,
  ShiftTimes,
  toShiftDefinitions,
} from '@redinfo/shared';

// Re-exported so this module stays the import site it has always been; the
// value lives in @redinfo/shared because the window editor enforces it too.
export { MAX_WINDOW_DAYS } from '@redinfo/shared';

type ActorRow = { id: string; firstName: string; lastName: string };

type WindowRow = {
  id: string;
  startDate: Date;
  endDate: Date;
  // Prisma generates its own string-union enums; the template-literal form
  // accepts both those and the shared TS enum without a cast at every call.
  status: `${AvailabilityWindowStatus}`;
  openedById: string;
  openedBy?: ActorRow | null;
  openedAt: Date;
  closedById: string | null;
  closedBy?: ActorRow | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const ACTOR_SELECT = { select: { id: true, firstName: true, lastName: true } };

@Injectable()
export class AvailabilityWindowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftSchedule: ShiftScheduleService,
  ) {}

  async findAll(page = 1, perPage = 25) {
    const skip = (page - 1) * perPage;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.availabilityWindow.findMany({
        skip,
        take: perPage,
        orderBy: { openedAt: 'desc' },
        include: { openedBy: ACTOR_SELECT, closedBy: ACTOR_SELECT },
      }),
      this.prisma.availabilityWindow.count(),
    ]);
    return { data: rows.map(serializeWindow), total, page, perPage };
  }

  async findOne(id: string) {
    const window = await this.prisma.availabilityWindow.findUnique({
      where: { id },
      include: { openedBy: ACTOR_SELECT, closedBy: ACTOR_SELECT },
    });
    if (!window) throw new NotFoundException(`Availability window ${id} not found`);
    return serializeWindow(window);
  }

  /** The single OPEN window, or null when submissions are closed. */
  async findActive(): Promise<AvailabilityWindow | null> {
    const window = await this.prisma.availabilityWindow.findFirst({
      where: { status: AvailabilityWindowStatus.OPEN },
      orderBy: { openedAt: 'desc' },
      include: { openedBy: ACTOR_SELECT, closedBy: ACTOR_SELECT },
    });
    return window ? serializeWindow(window) : null;
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
      include: { openedBy: ACTOR_SELECT, closedBy: ACTOR_SELECT },
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

    if (endDate < startDate) {
      throw new BadRequestException('endDate must be on or after startDate');
    }

    const dates = isoDateRange(startDate, endDate);
    if (dates.length > MAX_WINDOW_DAYS) {
      throw new BadRequestException(
        `A window may span at most ${MAX_WINDOW_DAYS} days (got ${dates.length})`,
      );
    }

    // Only one window may be OPEN at a time (AC). Checked here rather than in
    // the schema because Prisma's DSL cannot express a filtered unique index.
    const alreadyOpen = await this.prisma.availabilityWindow.findFirst({
      where: { status: AvailabilityWindowStatus.OPEN },
    });
    if (alreadyOpen) {
      throw new ConflictException(
        `An availability window is already open (${toIsoDate(alreadyOpen.startDate)} – ${toIsoDate(
          alreadyOpen.endDate,
        )}). Close it before opening the next one.`,
      );
    }

    const shiftsByDate = await this.resolveShifts(dates, dto.days);

    // One transaction: a window whose shift rows failed to write would look
    // like a window with no shifts at all, and read back as the default grid.
    const created = await this.prisma.$transaction(async (tx) => {
      const window = await tx.availabilityWindow.create({
        data: {
          startDate: parseIsoDate(startDate),
          endDate: parseIsoDate(endDate),
          status: AvailabilityWindowStatus.OPEN,
          openedById,
        },
        include: { openedBy: ACTOR_SELECT, closedBy: ACTOR_SELECT },
      });

      const rows = dates.flatMap((date) =>
        toShiftDefinitions(shiftsByDate.get(date) ?? []).map((shift) => ({
          windowId: window.id,
          date: parseIsoDate(date),
          slot: shift.slot,
          startHour: shift.startHour,
          endHour: shift.endHour,
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
   * one-click path for "we need availability for next month".
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
    return this.open(bounds, openedById);
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
  ): Promise<Map<string, ShiftTimes[]>> {
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
    const byDate = new Map<string, ShiftTimes[]>();

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
      include: { openedBy: ACTOR_SELECT, closedBy: ACTOR_SELECT },
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
}

export function serializeWindow(row: WindowRow): AvailabilityWindow {
  return {
    id: row.id,
    startDate: toIsoDate(row.startDate),
    endDate: toIsoDate(row.endDate),
    status: row.status as AvailabilityWindowStatus,
    openedById: row.openedById,
    openedBy: row.openedBy ?? null,
    openedAt: row.openedAt.toISOString(),
    closedById: row.closedById,
    closedBy: row.closedBy ?? null,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
