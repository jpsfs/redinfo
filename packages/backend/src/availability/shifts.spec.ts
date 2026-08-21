import {
  availabilityWindowCategoryLabel,
  AVAILABILITY_WINDOW_CATEGORIES,
  AvailabilityWindowCategory,
  availabilityWindowLabel,
  datesOverlap,
  DEFAULT_SPECIAL_DAY_SHIFTS,
  DEFAULT_VEHICLES_NEEDED,
  DEFAULT_WORKDAY_SHIFTS,
  defaultShiftsForDayType,
  emergencyWindowName,
  formatShiftLabel,
  formatShiftShortLabel,
  formatTimeOfDay,
  MAX_SHIFTS_PER_DAY,
  MINUTES_PER_DAY,
  monthBounds,
  monthName,
  parseTimeOfDay,
  sortShifts,
  toMinuteOfDay,
  toShiftDefinitions,
  toTimeInputValue,
  validateDayShifts,
} from '@redinfo/shared';

/**
 * The shift and window rules shared by the API and the window editor. They live
 * in @redinfo/shared so a coordinator is never shown a day the API would refuse,
 * and are tested here because that is where the Jest runner lives.
 */

/** Minutes from midnight, so the expectations read in wall-clock time. */
const at = (hour: number, minute = 0) => toMinuteOfDay(hour, minute);

describe('the default grid', () => {
  it('gives a workday one evening shift, needing one vehicle', () => {
    expect(defaultShiftsForDayType('workday')).toEqual([
      { startMinute: at(20), endMinute: at(24), vehiclesNeeded: 1 },
    ]);
  });

  it('gives weekends and holidays the same two shifts', () => {
    expect(defaultShiftsForDayType('weekend')).toEqual([
      { startMinute: at(8), endMinute: at(16), vehiclesNeeded: 1 },
      { startMinute: at(16), endMinute: at(24), vehiclesNeeded: 1 },
    ]);
    expect(defaultShiftsForDayType('holiday')).toEqual(
      defaultShiftsForDayType('weekend'),
    );
  });

  it('returns copies, so an editor cannot mutate the constants', () => {
    const shifts = defaultShiftsForDayType('weekend');
    shifts[0].startMinute = 3;
    shifts.pop();

    expect(DEFAULT_SPECIAL_DAY_SHIFTS).toEqual([
      { startMinute: at(8), endMinute: at(16) },
      { startMinute: at(16), endMinute: at(24) },
    ]);
    expect(DEFAULT_WORKDAY_SHIFTS).toEqual([
      { startMinute: at(20), endMinute: at(24) },
    ]);
  });

  it('is itself valid, and so can seed the editor', () => {
    expect(validateDayShifts(defaultShiftsForDayType('workday'))).toBeNull();
    expect(validateDayShifts(defaultShiftsForDayType('weekend'))).toBeNull();
  });
});

describe('times of day', () => {
  it('counts minutes from midnight', () => {
    expect(toMinuteOfDay(0)).toBe(0);
    expect(toMinuteOfDay(8, 30)).toBe(510);
    expect(toMinuteOfDay(24)).toBe(MINUTES_PER_DAY);
  });

  it('formats end-of-day as 24:00 rather than wrapping to 00:00', () => {
    expect(formatTimeOfDay(0)).toBe('00:00');
    expect(formatTimeOfDay(510)).toBe('08:30');
    expect(formatTimeOfDay(MINUTES_PER_DAY)).toBe('24:00');
  });

  it('hands a native time input the 00:00 it can hold instead', () => {
    expect(toTimeInputValue(MINUTES_PER_DAY)).toBe('00:00');
    expect(toTimeInputValue(510)).toBe('08:30');
  });

  it('parses HH:MM, including 24:00', () => {
    expect(parseTimeOfDay('08:30')).toBe(510);
    expect(parseTimeOfDay('8:30')).toBe(510);
    expect(parseTimeOfDay('00:00')).toBe(0);
    expect(parseTimeOfDay('24:00')).toBe(MINUTES_PER_DAY);
  });

  it.each(['', '  ', 'noon', '8', '08:5', '25:00', '08:60', '24:01', '-1:00'])(
    'refuses %p rather than guessing',
    (value) => {
      expect(parseTimeOfDay(value)).toBeNull();
    },
  );

  it('round-trips every minute of the day', () => {
    for (let minute = 0; minute <= MINUTES_PER_DAY; minute += 1) {
      expect(parseTimeOfDay(formatTimeOfDay(minute))).toBe(minute);
    }
  });
});

describe('formatShiftLabel', () => {
  it('pads to two digits and spells midnight as 24:00', () => {
    expect(formatShiftLabel({ startMinute: at(8), endMinute: at(16) })).toBe(
      '08:00–16:00',
    );
    expect(formatShiftLabel({ startMinute: at(20), endMinute: at(24) })).toBe(
      '20:00–24:00',
    );
    expect(formatShiftLabel({ startMinute: at(0), endMinute: at(6) })).toBe(
      '00:00–06:00',
    );
  });

  it('shows minutes when a shift does not start on the hour', () => {
    expect(formatShiftLabel({ startMinute: at(8, 30), endMinute: at(16, 45) })).toBe(
      '08:30–16:45',
    );
  });

  it('drops the leading zero and an on-the-hour :00 in the short form', () => {
    expect(formatShiftShortLabel({ startMinute: at(8), endMinute: at(16) })).toBe('8–16');
    expect(formatShiftShortLabel({ startMinute: at(20), endMinute: at(24) })).toBe(
      '20–24',
    );
    expect(formatShiftShortLabel({ startMinute: at(8, 30), endMinute: at(16) })).toBe(
      '8:30–16',
    );
  });
});

describe('sortShifts / toShiftDefinitions', () => {
  it('orders by start time, then end time', () => {
    expect(
      sortShifts([
        { startMinute: at(16), endMinute: at(24) },
        { startMinute: at(8), endMinute: at(20) },
        { startMinute: at(8), endMinute: at(12) },
      ]),
    ).toEqual([
      { startMinute: at(8), endMinute: at(12) },
      { startMinute: at(8), endMinute: at(20) },
      { startMinute: at(16), endMinute: at(24) },
    ]);
  });

  it('orders shifts that start in the same hour by the minute', () => {
    expect(
      sortShifts([
        { startMinute: at(8, 45), endMinute: at(12) },
        { startMinute: at(8, 15), endMinute: at(8, 30) },
      ])[0],
    ).toEqual({ startMinute: at(8, 15), endMinute: at(8, 30) });
  });

  it('numbers slots from 1 in that order and labels each shift', () => {
    expect(
      toShiftDefinitions([
        { startMinute: at(16), endMinute: at(24) },
        { startMinute: at(8), endMinute: at(16) },
      ]),
    ).toEqual([
      {
        slot: 1,
        startMinute: at(8),
        endMinute: at(16),
        vehiclesNeeded: DEFAULT_VEHICLES_NEEDED,
        label: '08:00–16:00',
      },
      {
        slot: 2,
        startMinute: at(16),
        endMinute: at(24),
        vehiclesNeeded: DEFAULT_VEHICLES_NEEDED,
        label: '16:00–24:00',
      },
    ]);
  });

  it('leaves the input untouched', () => {
    const input = [
      { startMinute: at(16), endMinute: at(24) },
      { startMinute: at(8), endMinute: at(16) },
    ];
    toShiftDefinitions(input);
    expect(input[0]).toEqual({ startMinute: at(16), endMinute: at(24) });
  });

  it('maps an empty day to no shifts', () => {
    expect(toShiftDefinitions([])).toEqual([]);
  });
});

describe('validateDayShifts', () => {
  it('accepts an empty day — nobody is needed then', () => {
    expect(validateDayShifts([])).toBeNull();
  });

  it('accepts back-to-back shifts, which do not overlap', () => {
    expect(
      validateDayShifts([
        { startMinute: at(8), endMinute: at(16) },
        { startMinute: at(16), endMinute: at(24) },
      ]),
    ).toBeNull();
  });

  it('accepts a handover part-way through an hour', () => {
    expect(
      validateDayShifts([
        { startMinute: at(8, 30), endMinute: at(16, 30) },
        { startMinute: at(16, 30), endMinute: at(24) },
      ]),
    ).toBeNull();
  });

  it('accepts a gap between shifts', () => {
    expect(
      validateDayShifts([
        { startMinute: at(8), endMinute: at(12) },
        { startMinute: at(18), endMinute: at(22) },
      ]),
    ).toBeNull();
  });

  it('accepts the full day as one shift', () => {
    expect(
      validateDayShifts([{ startMinute: 0, endMinute: MINUTES_PER_DAY }]),
    ).toBeNull();
  });

  it('accepts a one-minute shift', () => {
    expect(validateDayShifts([{ startMinute: at(8), endMinute: at(8, 1) }])).toBeNull();
  });

  it('rejects an overlap, naming both shifts', () => {
    expect(
      validateDayShifts([
        { startMinute: at(8), endMinute: at(16) },
        { startMinute: at(12), endMinute: at(20) },
      ]),
    ).toMatch(/08:00–16:00 and 12:00–20:00 overlap/);
  });

  it('rejects an overlap of a single minute', () => {
    expect(
      validateDayShifts([
        { startMinute: at(8), endMinute: at(16, 1) },
        { startMinute: at(16), endMinute: at(20) },
      ]),
    ).toMatch(/overlap/);
  });

  it('finds an overlap regardless of the order given', () => {
    expect(
      validateDayShifts([
        { startMinute: at(12), endMinute: at(20) },
        { startMinute: at(8), endMinute: at(16) },
      ]),
    ).toMatch(/overlap/);
  });

  it('rejects a shift that ends before it starts', () => {
    expect(
      validateDayShifts([{ startMinute: at(20), endMinute: at(8) }]),
    ).toMatch(/must end after it starts/);
  });

  it('rejects a zero-length shift', () => {
    expect(
      validateDayShifts([{ startMinute: at(12), endMinute: at(12) }]),
    ).toMatch(/must end after it starts/);
  });

  it.each([
    [{ startMinute: -1, endMinute: at(6) }, /must start between/],
    [{ startMinute: MINUTES_PER_DAY, endMinute: MINUTES_PER_DAY }, /must start between/],
    [{ startMinute: at(8), endMinute: MINUTES_PER_DAY + 1 }, /must end between/],
    [{ startMinute: at(8), endMinute: 0 }, /must end between/],
  ])('rejects out-of-range times %p', (shift, expected) => {
    expect(validateDayShifts([shift])).toMatch(expected);
  });

  it('rejects a fraction of a minute', () => {
    expect(
      validateDayShifts([{ startMinute: 510.5, endMinute: at(16) }]),
    ).toMatch(/whole minute/);
  });

  it('rejects more shifts than a day may hold', () => {
    const tooMany = Array.from({ length: MAX_SHIFTS_PER_DAY + 1 }, (_, index) => ({
      startMinute: at(index),
      endMinute: at(index + 1),
    }));
    expect(validateDayShifts(tooMany)).toMatch(
      new RegExp(`at most ${MAX_SHIFTS_PER_DAY} shifts`),
    );
  });

  it('accepts exactly the maximum', () => {
    const atLimit = Array.from({ length: MAX_SHIFTS_PER_DAY }, (_, index) => ({
      startMinute: at(index * 2),
      endMinute: at(index * 2 + 2),
    }));
    expect(validateDayShifts(atLimit)).toBeNull();
  });
});

describe('window categories', () => {
  it('offers the three rotas in declaration order', () => {
    expect(AVAILABILITY_WINDOW_CATEGORIES).toEqual([
      AvailabilityWindowCategory.EMERGENCY,
      AvailabilityWindowCategory.LOCAL_SUPPORT,
      AvailabilityWindowCategory.SALOP_SUPPORT,
    ]);
  });

  it('labels each one for display', () => {
    expect(availabilityWindowCategoryLabel(AvailabilityWindowCategory.EMERGENCY)).toBe(
      'Emergency',
    );
    expect(availabilityWindowCategoryLabel(AvailabilityWindowCategory.LOCAL_SUPPORT)).toBe(
      'Local Support',
    );
    expect(availabilityWindowCategoryLabel(AvailabilityWindowCategory.SALOP_SUPPORT)).toBe(
      'SALOP Support',
    );
  });

  it('falls back to the raw value for a category it does not know', () => {
    expect(availabilityWindowCategoryLabel('PARADE_SUPPORT')).toBe('PARADE_SUPPORT');
  });

  it('titles a window by its name, and by its category when it has none', () => {
    const category = AvailabilityWindowCategory.LOCAL_SUPPORT;
    expect(availabilityWindowLabel({ category, name: 'Marathon cover' })).toBe(
      'Marathon cover',
    );
    expect(availabilityWindowLabel({ category, name: null })).toBe('Local Support');
    expect(availabilityWindowLabel({ category, name: '   ' })).toBe('Local Support');
    expect(availabilityWindowLabel({ category })).toBe('Local Support');
  });

  it('names an emergency window after the month it covers', () => {
    expect(emergencyWindowName(10)).toBe('Emergency - October');
    expect(emergencyWindowName(1)).toBe('Emergency - January');
    expect(monthName(12)).toBe('December');
  });
});

describe('datesOverlap', () => {
  it('is true when the ranges share a day', () => {
    expect(datesOverlap('2026-10-01', '2026-10-31', '2026-10-31', '2026-11-15')).toBe(true);
    expect(datesOverlap('2026-10-01', '2026-10-31', '2026-09-01', '2026-10-01')).toBe(true);
  });

  it('is true when one range contains the other', () => {
    expect(datesOverlap('2026-10-01', '2026-10-31', '2026-10-10', '2026-10-12')).toBe(true);
    expect(datesOverlap('2026-10-10', '2026-10-12', '2026-10-01', '2026-10-31')).toBe(true);
  });

  it('is false for adjacent ranges', () => {
    expect(datesOverlap('2026-10-01', '2026-10-31', '2026-11-01', '2026-11-30')).toBe(false);
    expect(datesOverlap('2026-11-01', '2026-11-30', '2026-10-01', '2026-10-31')).toBe(false);
  });
});

describe('monthBounds', () => {
  it('spans the 1st to the last day of a 31-day month', () => {
    expect(monthBounds(2026, 10)).toEqual({
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    });
  });

  it('handles a 30-day month', () => {
    expect(monthBounds(2026, 11)).toEqual({
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    });
  });

  it('handles February in a common year and a leap year', () => {
    expect(monthBounds(2027, 2).endDate).toBe('2027-02-28');
    expect(monthBounds(2028, 2).endDate).toBe('2028-02-29');
  });

  it('handles the year boundary months', () => {
    expect(monthBounds(2026, 1)).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });
    expect(monthBounds(2026, 12)).toEqual({
      startDate: '2026-12-01',
      endDate: '2026-12-31',
    });
  });

  it.each([0, 13, -1])('rejects month %i', (month) => {
    expect(() => monthBounds(2026, month)).toThrow(RangeError);
  });

  it('rejects a fractional month or year', () => {
    expect(() => monthBounds(2026, 1.5)).toThrow(RangeError);
    expect(() => monthBounds(2026.5, 1)).toThrow(RangeError);
  });
});
