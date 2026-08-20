import { BadRequestException, Injectable } from '@nestjs/common';
import { HolidaysService } from './holidays.service';
import {
  DayShiftPattern,
  ShiftCode,
  SHIFT_DEFINITIONS,
  SPECIAL_DAY_SHIFT_CODES,
  WORKDAY_SHIFT_CODES,
} from '@redinfo/shared';
import { isIsoDate, isoDateRange, isWeekendDate } from '../utils/date.util';

/** Longest range any single lookup may span, as a runaway guard. */
const MAX_RANGE_DAYS = 400;

export type DayType = 'workday' | 'weekend' | 'holiday';

/**
 * The single place the shift grid lives.
 *
 *   workdays (Mon–Fri, non-holiday) → 1 shift, 20:00–24:00
 *   weekends (Sat/Sun) or holidays  → 2 shifts, 08:00–16:00 and 16:00–24:00
 *
 * Anything needing to know which shifts a date has — submission validation,
 * the coverage matrix, the calendar preview — asks this service. Never
 * re-derive the rule at a call site: it is expected to change.
 */
@Injectable()
export class ShiftScheduleService {
  constructor(private readonly holidays: HolidaysService) {}

  isWeekend(date: string): boolean {
    this.assertIsoDate(date);
    return isWeekendDate(date);
  }

  async getDayType(date: string): Promise<DayType> {
    this.assertIsoDate(date);
    if (await this.holidays.isHoliday(date)) return 'holiday';
    return isWeekendDate(date) ? 'weekend' : 'workday';
  }

  /** Shift codes applicable to a single date. */
  async getShiftsForDate(date: string): Promise<ShiftCode[]> {
    const dayType = await this.getDayType(date);
    return shiftCodesForDayType(dayType);
  }

  /** Full pattern (day type + applicable shifts) for a single date. */
  async getPatternForDate(date: string): Promise<DayShiftPattern> {
    const patterns = await this.getPatternForRange(date, date);
    return patterns[0];
  }

  /**
   * Full pattern for every date in `[from, to]` inclusive, with a single
   * holiday query for the whole range.
   */
  async getPatternForRange(from: string, to: string): Promise<DayShiftPattern[]> {
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

    const holidayNames = await this.holidays.findBetween(from, to);

    return dates.map((date) => {
      const holidayName = holidayNames.get(date) ?? null;
      const isHoliday = holidayName !== null;
      const isWeekend = isWeekendDate(date);
      const dayType: DayType = isHoliday ? 'holiday' : isWeekend ? 'weekend' : 'workday';
      return {
        date,
        isWeekend,
        isHoliday,
        holidayName,
        shifts: shiftCodesForDayType(dayType).map((code) => SHIFT_DEFINITIONS[code]),
      };
    });
  }

  /**
   * Throws unless `shiftCode` is one of the shifts that exist on `date`, e.g.
   * a MORNING shift submitted for a plain Tuesday.
   */
  assertShiftValidForPattern(pattern: DayShiftPattern, shiftCode: ShiftCode): void {
    const allowed = pattern.shifts.some((shift) => shift.code === shiftCode);
    if (!allowed) {
      const labels = pattern.shifts.map((shift) => shift.code).join(', ');
      throw new BadRequestException(
        `Shift ${shiftCode} does not exist on ${pattern.date} (applicable shifts: ${labels})`,
      );
    }
  }

  private assertIsoDate(date: string): void {
    if (!isIsoDate(date)) {
      throw new BadRequestException(`date must be a valid calendar date (YYYY-MM-DD), got "${date}"`);
    }
  }
}

export function shiftCodesForDayType(dayType: DayType): ShiftCode[] {
  return dayType === 'workday' ? [...WORKDAY_SHIFT_CODES] : [...SPECIAL_DAY_SHIFT_CODES];
}
