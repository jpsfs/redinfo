import { isOnPaidClock, PaidStaffScheduleBlock, PaidStaffScheduleOverride } from '@redinfo/shared';

// ── The rule a paid staffer's clock is judged by (#245) ─────────────────────
//
// Lives in @redinfo/shared so `VolunteerHoursService` and any future consumer
// cannot disagree about whether an assignment was worked on salaried time.
// Pure, so this is where the awkward cases get pinned down.

const USER_ID = 'u-tiago';

const block = (overrides: Partial<PaidStaffScheduleBlock> = {}): PaidStaffScheduleBlock => ({
  id: 'b1',
  userId: USER_ID,
  dayOfWeek: 1, // Monday
  startMinute: 8 * 60,
  endMinute: 16 * 60,
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  ...overrides,
});

const override = (overrides: Partial<PaidStaffScheduleOverride> = {}): PaidStaffScheduleOverride => ({
  id: 'o1',
  userId: USER_ID,
  date: '2026-10-05',
  isOff: false,
  startMinute: null,
  endMinute: null,
  notes: null,
  ...overrides,
});

// 2026-10-05 is a Monday.
const MONDAY = '2026-10-05';

describe('isOnPaidClock', () => {
  it('is on the clock when the shift falls inside a matching recurring block', () => {
    expect(isOnPaidClock([block()], [], MONDAY, 9 * 60, 12 * 60)).toBe(true);
  });

  it('is off the clock on a day the pattern does not cover', () => {
    const tuesday = '2026-10-06';
    expect(isOnPaidClock([block()], [], tuesday, 9 * 60, 12 * 60)).toBe(false);
  });

  it('is on the clock for a shift that only partly overlaps the block', () => {
    // Block is 08:00–16:00; shift runs 15:00–20:00 — the first hour was worked on salaried time.
    expect(isOnPaidClock([block()], [], MONDAY, 15 * 60, 20 * 60)).toBe(true);
  });

  it('is off the clock once the shift falls entirely outside the block, even same day', () => {
    // Block ends at 16:00; shift starts at 18:00.
    expect(isOnPaidClock([block()], [], MONDAY, 18 * 60, 20 * 60)).toBe(false);
  });

  it('respects effectiveFrom — not yet on the clock before the block starts applying', () => {
    const notYetActive = block({ effectiveFrom: '2026-11-01' });
    expect(isOnPaidClock([notYetActive], [], MONDAY, 9 * 60, 12 * 60)).toBe(false);
  });

  it('respects effectiveTo — no longer on the clock after the block stops applying', () => {
    const expired = block({ effectiveTo: '2026-09-01' });
    expect(isOnPaidClock([expired], [], MONDAY, 9 * 60, 12 * 60)).toBe(false);
  });

  it('a day-off override wins outright over a matching recurring block', () => {
    const dayOff = override({ date: MONDAY, isOff: true });
    expect(isOnPaidClock([block()], [dayOff], MONDAY, 9 * 60, 12 * 60)).toBe(false);
  });

  it('a custom-hours override replaces the pattern entirely for that date', () => {
    // Recurring block is 08:00–16:00, but the override moves this Monday to an evening shift.
    const evening = override({ date: MONDAY, isOff: false, startMinute: 19 * 60, endMinute: 23 * 60 });
    expect(isOnPaidClock([block()], [evening], MONDAY, 9 * 60, 12 * 60)).toBe(false);
    expect(isOnPaidClock([block()], [evening], MONDAY, 20 * 60, 22 * 60)).toBe(true);
  });

  it('a split shift is two blocks, not a reason to pick one', () => {
    const morning = block({ id: 'b-morning', startMinute: 6 * 60, endMinute: 10 * 60 });
    const evening = block({ id: 'b-evening', startMinute: 18 * 60, endMinute: 22 * 60 });
    expect(isOnPaidClock([morning, evening], [], MONDAY, 6 * 60, 8 * 60)).toBe(true);
    expect(isOnPaidClock([morning, evening], [], MONDAY, 19 * 60, 21 * 60)).toBe(true);
    expect(isOnPaidClock([morning, evening], [], MONDAY, 12 * 60, 14 * 60)).toBe(false);
  });

  it('with no blocks and no override at all, nobody is ever on the clock', () => {
    expect(isOnPaidClock([], [], MONDAY, 9 * 60, 12 * 60)).toBe(false);
  });
});
