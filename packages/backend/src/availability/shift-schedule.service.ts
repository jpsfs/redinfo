import { BadRequestException, Injectable } from '@nestjs/common';
import { HolidaysService } from './holidays.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DayShiftPattern,
  DayType,
  defaultShiftsForDayType,
  formatShiftLabel,
  ShiftDefinition,
  ShiftTimes,
  sortShifts,
  toShiftDefinitions,
  validateDayShifts,
} from '@redinfo/shared';
import { isIsoDate, isoDateRange, isWeekendDate, toIsoDate } from '../utils/date.util';

/** Longest range any single lookup may span, as a runaway guard. */
const MAX_RANGE_DAYS = 400;

export type { DayType };

/** A date and what kind of day it is — before any shifts are attached. */
export interface DayContext {
  date: string;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  dayType: DayType;
}

/**
 * Everything about which shifts exist when.
 *
 * Two distinct notions live here, and mixing them up is the bug this service
 * exists to prevent:
 *
 *  - the **default grid** (`getDefaultPatternForRange`), from the day type —
 *    workday → 20:00–24:00, weekend/holiday → 08:00–16:00 + 16:00–24:00. It
 *    seeds a new window and previews dates no window covers.
 *  - a **window's own grid** (`getPatternForWindow`), read from the rows
 *    materialised when that window was opened. This is what submissions, the
 *    coverage matrix and the CSV must use: a coordinator may have given any day
 *    any times, so the day type no longer implies the shifts.
 */
@Injectable()
export class ShiftScheduleService {
  constructor(
    private readonly holidays: HolidaysService,
    private readonly prisma: PrismaService,
  ) {}

  isWeekend(date: string): boolean {
    this.assertIsoDate(date);
    return isWeekendDate(date);
  }

  async getDayType(date: string): Promise<DayType> {
    this.assertIsoDate(date);
    if (await this.holidays.isHoliday(date)) return 'holiday';
    return isWeekendDate(date) ? 'weekend' : 'workday';
  }

  /**
   * Day type and holiday name for every date in `[from, to]` inclusive, with a
   * single holiday query for the whole range.
   */
  async getDayContexts(from: string, to: string): Promise<DayContext[]> {
    const dates = this.assertRange(from, to);
    const holidayNames = await this.holidays.findBetween(from, to);

    return dates.map((date) => {
      const holidayName = holidayNames.get(date) ?? null;
      const isHoliday = holidayName !== null;
      const isWeekend = isWeekendDate(date);
      return {
        date,
        isWeekend,
        isHoliday,
        holidayName,
        dayType: isHoliday ? 'holiday' : isWeekend ? 'weekend' : 'workday',
      };
    });
  }

  /** The default grid over a range — a preview, not what any window stores. */
  async getDefaultPatternForRange(from: string, to: string): Promise<DayShiftPattern[]> {
    const contexts = await this.getDayContexts(from, to);
    return contexts.map((context) => ({
      ...toPatternHead(context),
      shifts: toShiftDefinitions(defaultShiftsForDayType(context.dayType)),
    }));
  }

  /** The default shifts for one date, as the window editor seeds it. */
  async getDefaultShiftsForDate(date: string): Promise<ShiftTimes[]> {
    return defaultShiftsForDayType(await this.getDayType(date));
  }

  /**
   * The shifts a window actually carries, per day of its range.
   *
   * Days the coordinator left empty come back with no shifts. A window with no
   * stored rows at all falls back to the default grid: that covers windows
   * opened before per-day shifts existed, and means a calendar is never blank
   * for a reason the reader cannot see.
   */
  async getPatternForWindow(window: {
    id: string;
    startDate: string;
    endDate: string;
  }): Promise<DayShiftPattern[]> {
    const [contexts, rows] = await Promise.all([
      this.getDayContexts(window.startDate, window.endDate),
      this.prisma.availabilityWindowShift.findMany({
        where: { windowId: window.id },
        orderBy: [{ date: 'asc' }, { slot: 'asc' }],
      }),
    ]);

    if (rows.length === 0) {
      return contexts.map((context) => ({
        ...toPatternHead(context),
        shifts: toShiftDefinitions(defaultShiftsForDayType(context.dayType)),
      }));
    }

    const byDate = new Map<string, ShiftDefinition[]>();
    for (const row of rows) {
      const date = toIsoDate(row.date);
      const bucket = byDate.get(date) ?? [];
      // Stored slots are authoritative — they are what submissions point at, so
      // they are never renumbered on read.
      bucket.push({
        slot: row.slot,
        startHour: row.startHour,
        endHour: row.endHour,
        label: formatShiftLabel(row),
      });
      byDate.set(date, bucket);
    }

    return contexts.map((context) => ({
      ...toPatternHead(context),
      shifts: byDate.get(context.date) ?? [],
    }));
  }

  /**
   * Validate and sort one day's shifts, or throw 400 naming the date. The rule
   * itself lives in `validateDayShifts` (shared), so the editor blocks Save on
   * exactly what the API would reject.
   */
  normaliseDayShifts(date: string, shifts: ShiftTimes[]): ShiftTimes[] {
    const error = validateDayShifts(shifts);
    if (error) {
      throw new BadRequestException(`${date}: ${error}`);
    }
    return sortShifts(shifts).map(({ startHour, endHour }) => ({ startHour, endHour }));
  }

  /**
   * Throws unless `slot` is one of the shifts that exist on that day of the
   * window, e.g. a second shift submitted for a day that only has one.
   */
  assertSlotValidForPattern(pattern: DayShiftPattern, slot: number): void {
    if (pattern.shifts.some((shift) => shift.slot === slot)) return;

    if (pattern.shifts.length === 0) {
      throw new BadRequestException(`${pattern.date} has no shifts in this window`);
    }
    const labels = pattern.shifts
      .map((shift) => `${shift.slot} (${shift.label})`)
      .join(', ');
    throw new BadRequestException(
      `Shift ${slot} does not exist on ${pattern.date} (applicable shifts: ${labels})`,
    );
  }

  private assertRange(from: string, to: string): string[] {
    this.assertIsoDate(from);
    this.assertIsoDate(to);
    if (to < from) {
      throw new BadRequestException(`Range end ${to} precedes range start ${from}`);
    }

    const dates = isoDateRange(from, to);
    if (dates.length > MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `Range spans ${dates.length} days; at most ${MAX_RANGE_DAYS} can be requested at once`,
      );
    }
    return dates;
  }

  private assertIsoDate(date: string): void {
    if (!isIsoDate(date)) {
      throw new BadRequestException(`date must be a valid calendar date (YYYY-MM-DD), got "${date}"`);
    }
  }
}

function toPatternHead(context: DayContext): Omit<DayShiftPattern, 'shifts'> {
  return {
    date: context.date,
    isWeekend: context.isWeekend,
    isHoliday: context.isHoliday,
    holidayName: context.holidayName,
  };
}
