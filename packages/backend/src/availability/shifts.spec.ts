import {
  DEFAULT_SPECIAL_DAY_SHIFTS,
  DEFAULT_WORKDAY_SHIFTS,
  defaultShiftsForDayType,
  formatShiftLabel,
  formatShiftShortLabel,
  MAX_SHIFTS_PER_DAY,
  monthBounds,
  sortShifts,
  toShiftDefinitions,
  validateDayShifts,
} from '@redinfo/shared';

/**
 * The shift rules shared by the API and the window editor. They live in
 * @redinfo/shared so a coordinator is never shown a day the API would refuse,
 * and are tested here because that is where the Jest runner lives.
 */

describe('the default grid', () => {
  it('gives a workday one evening shift', () => {
    expect(defaultShiftsForDayType('workday')).toEqual([{ startHour: 20, endHour: 24 }]);
  });

  it('gives weekends and holidays the same two shifts', () => {
    expect(defaultShiftsForDayType('weekend')).toEqual([
      { startHour: 8, endHour: 16 },
      { startHour: 16, endHour: 24 },
    ]);
    expect(defaultShiftsForDayType('holiday')).toEqual(
      defaultShiftsForDayType('weekend'),
    );
  });

  it('returns copies, so an editor cannot mutate the constants', () => {
    const shifts = defaultShiftsForDayType('weekend');
    shifts[0].startHour = 3;
    shifts.pop();

    expect(DEFAULT_SPECIAL_DAY_SHIFTS).toEqual([
      { startHour: 8, endHour: 16 },
      { startHour: 16, endHour: 24 },
    ]);
    expect(DEFAULT_WORKDAY_SHIFTS).toEqual([{ startHour: 20, endHour: 24 }]);
  });

  it('is itself valid, and so can seed the editor', () => {
    expect(validateDayShifts(defaultShiftsForDayType('workday'))).toBeNull();
    expect(validateDayShifts(defaultShiftsForDayType('weekend'))).toBeNull();
  });
});

describe('formatShiftLabel', () => {
  it('pads to two digits and spells midnight as 24:00', () => {
    expect(formatShiftLabel({ startHour: 8, endHour: 16 })).toBe('08:00–16:00');
    expect(formatShiftLabel({ startHour: 20, endHour: 24 })).toBe('20:00–24:00');
    expect(formatShiftLabel({ startHour: 0, endHour: 6 })).toBe('00:00–06:00');
  });

  it('has a short form for calendar cells', () => {
    expect(formatShiftShortLabel({ startHour: 8, endHour: 16 })).toBe('08–16h');
  });
});

describe('sortShifts / toShiftDefinitions', () => {
  it('orders by start time, then end time', () => {
    expect(
      sortShifts([
        { startHour: 16, endHour: 24 },
        { startHour: 8, endHour: 20 },
        { startHour: 8, endHour: 12 },
      ]),
    ).toEqual([
      { startHour: 8, endHour: 12 },
      { startHour: 8, endHour: 20 },
      { startHour: 16, endHour: 24 },
    ]);
  });

  it('numbers slots from 1 in that order and labels each shift', () => {
    expect(
      toShiftDefinitions([
        { startHour: 16, endHour: 24 },
        { startHour: 8, endHour: 16 },
      ]),
    ).toEqual([
      { slot: 1, startHour: 8, endHour: 16, label: '08:00–16:00' },
      { slot: 2, startHour: 16, endHour: 24, label: '16:00–24:00' },
    ]);
  });

  it('leaves the input untouched', () => {
    const input = [{ startHour: 16, endHour: 24 }, { startHour: 8, endHour: 16 }];
    toShiftDefinitions(input);
    expect(input[0]).toEqual({ startHour: 16, endHour: 24 });
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
        { startHour: 8, endHour: 16 },
        { startHour: 16, endHour: 24 },
      ]),
    ).toBeNull();
  });

  it('accepts a gap between shifts', () => {
    expect(
      validateDayShifts([
        { startHour: 8, endHour: 12 },
        { startHour: 18, endHour: 22 },
      ]),
    ).toBeNull();
  });

  it('accepts the full day as one shift', () => {
    expect(validateDayShifts([{ startHour: 0, endHour: 24 }])).toBeNull();
  });

  it('rejects an overlap, naming both shifts', () => {
    expect(
      validateDayShifts([
        { startHour: 8, endHour: 16 },
        { startHour: 12, endHour: 20 },
      ]),
    ).toMatch(/08:00–16:00 and 12:00–20:00 overlap/);
  });

  it('finds an overlap regardless of the order given', () => {
    expect(
      validateDayShifts([
        { startHour: 12, endHour: 20 },
        { startHour: 8, endHour: 16 },
      ]),
    ).toMatch(/overlap/);
  });

  it('rejects a shift that ends before it starts', () => {
    expect(validateDayShifts([{ startHour: 20, endHour: 8 }])).toMatch(
      /must end after it starts/,
    );
  });

  it('rejects a zero-length shift', () => {
    expect(validateDayShifts([{ startHour: 12, endHour: 12 }])).toMatch(
      /must end after it starts/,
    );
  });

  it.each([
    [{ startHour: -1, endHour: 6 }, /must start between/],
    [{ startHour: 24, endHour: 24 }, /must start between/],
    [{ startHour: 8, endHour: 25 }, /must end between/],
    [{ startHour: 8, endHour: 0 }, /must end between/],
  ])('rejects out-of-range hours %p', (shift, expected) => {
    expect(validateDayShifts([shift])).toMatch(expected);
  });

  it('rejects fractional hours', () => {
    expect(validateDayShifts([{ startHour: 8.5, endHour: 16 }])).toMatch(
      /whole hours/,
    );
  });

  it('rejects more shifts than a day may hold', () => {
    const tooMany = Array.from({ length: MAX_SHIFTS_PER_DAY + 1 }, (_, index) => ({
      startHour: index,
      endHour: index + 1,
    }));
    expect(validateDayShifts(tooMany)).toMatch(
      new RegExp(`at most ${MAX_SHIFTS_PER_DAY} shifts`),
    );
  });

  it('accepts exactly the maximum', () => {
    const atLimit = Array.from({ length: MAX_SHIFTS_PER_DAY }, (_, index) => ({
      startHour: index * 2,
      endHour: index * 2 + 2,
    }));
    expect(validateDayShifts(atLimit)).toBeNull();
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
