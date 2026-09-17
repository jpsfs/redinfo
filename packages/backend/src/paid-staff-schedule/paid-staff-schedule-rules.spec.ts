import {
  AssignmentCompensationKind,
  EmploymentContract,
  generatesVolunteerHours,
  isOnContractClock,
  isOnPaidClock,
  PaidStaffScheduleBlock,
  PaidStaffScheduleOverride,
  resolveAssignmentCompensation,
} from '@redinfo/shared';

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

  // The night-shift edge (Stage 1): a day-off override covers one calendar
  // date and wins outright over the recurring pattern *for that date only* —
  // so a shift crossing midnight has to be judged half by the override, half
  // by whatever the next day's own pattern says.
  it('a day-off override for one date does not reach into the next date — the night-shift edge', () => {
    const mondayAndTuesday = [
      block({ id: 'b-mon', dayOfWeek: 1 }), // Monday 08:00–16:00
      block({ id: 'b-tue', dayOfWeek: 2, startMinute: 0, endMinute: 8 * 60 }), // Tuesday 00:00–08:00
    ];
    const mondayOff = override({ date: MONDAY, isOff: true });
    // The 00:00–08:00 half of a Mon 22:00 → Tue 08:00 night shift is judged
    // against Tuesday's own pattern, not Monday's day-off — each date is
    // resolved independently.
    expect(isOnPaidClock(mondayAndTuesday, [mondayOff], '2026-10-06', 0, 8 * 60)).toBe(true);
    // The Monday portion of the same night is still off, per the override.
    expect(isOnPaidClock(mondayAndTuesday, [mondayOff], MONDAY, 22 * 60, 24 * 60)).toBe(false);
  });
});

// ── isOnContractClock (Stage 1) ──────────────────────────────────────────────
//
// The contract-aware wrapper around isOnPaidClock: the contract's own dates
// are an absolute gate checked first, ahead of any block/override.

const contract = (overrides: Partial<Pick<EmploymentContract, 'startDate' | 'endDate'>> = {}) => ({
  startDate: '2020-01-01',
  endDate: null as string | null,
  ...overrides,
});

describe('isOnContractClock', () => {
  it('is never on the clock outside every contract, even with a matching block', () => {
    const outsideContract = contract({ startDate: '2027-01-01' });
    expect(
      isOnContractClock({
        contracts: [outsideContract],
        blocks: [block()],
        overrides: [],
        date: MONDAY,
        startMinute: 9 * 60,
        endMinute: 12 * 60,
      }),
    ).toBe(false);
  });

  it('is never on the clock with no contract at all, even with a matching block', () => {
    expect(
      isOnContractClock({
        contracts: [],
        blocks: [block()],
        overrides: [],
        date: MONDAY,
        startMinute: 9 * 60,
        endMinute: 12 * 60,
      }),
    ).toBe(false);
  });

  it('falls through to isOnPaidClock once a contract covers the date', () => {
    expect(
      isOnContractClock({
        contracts: [contract()],
        blocks: [block()],
        overrides: [],
        date: MONDAY,
        startMinute: 9 * 60,
        endMinute: 12 * 60,
      }),
    ).toBe(true);
  });

  it("respects the contract's own end date — a leftover block outlives the contract, but the clock does not", () => {
    const endedContract = contract({ endDate: '2026-06-30' });
    expect(
      isOnContractClock({
        contracts: [endedContract],
        blocks: [block()], // still says Monday 08:00–16:00, with no effectiveTo of its own
        overrides: [],
        date: MONDAY, // 2026-10-05, after the contract ended
        startMinute: 9 * 60,
        endMinute: 12 * 60,
      }),
    ).toBe(false);
  });

  it('is on the clock at the exact boundary of the contract start date', () => {
    const startsToday = contract({ startDate: MONDAY });
    expect(
      isOnContractClock({
        contracts: [startsToday],
        blocks: [block()],
        overrides: [],
        date: MONDAY,
        startMinute: 9 * 60,
        endMinute: 12 * 60,
      }),
    ).toBe(true);
  });
});

// ── resolveAssignmentCompensation (Stage 1, D1–D3) ──────────────────────────

describe('resolveAssignmentCompensation', () => {
  it('D1: defaults to VOLUNTEER off the clock with nothing explicit', () => {
    expect(resolveAssignmentCompensation({ onContractClock: false })).toBe(
      AssignmentCompensationKind.VOLUNTEER,
    );
  });

  it('respects an explicit PAID call off the clock', () => {
    expect(
      resolveAssignmentCompensation({ explicit: AssignmentCompensationKind.PAID, onContractClock: false }),
    ).toBe(AssignmentCompensationKind.PAID);
  });

  it('D2: on-contract-clock is an absolute veto — resolves SALARY regardless of an explicit call', () => {
    expect(resolveAssignmentCompensation({ onContractClock: true })).toBe(AssignmentCompensationKind.SALARY);
  });

  it('D2: an explicit VOLUNTEER must not beat the on-clock veto', () => {
    expect(
      resolveAssignmentCompensation({ explicit: AssignmentCompensationKind.VOLUNTEER, onContractClock: true }),
    ).toBe(AssignmentCompensationKind.SALARY);
  });

  it('D2: an explicit PAID must not beat the on-clock veto either', () => {
    expect(
      resolveAssignmentCompensation({ explicit: AssignmentCompensationKind.PAID, onContractClock: true }),
    ).toBe(AssignmentCompensationKind.SALARY);
  });

  it('treats an explicit null the same as unset', () => {
    expect(resolveAssignmentCompensation({ explicit: null, onContractClock: false })).toBe(
      AssignmentCompensationKind.VOLUNTEER,
    );
  });
});

describe('generatesVolunteerHours', () => {
  it('only VOLUNTEER generates volunteer hours', () => {
    expect(generatesVolunteerHours(AssignmentCompensationKind.VOLUNTEER)).toBe(true);
    expect(generatesVolunteerHours(AssignmentCompensationKind.SALARY)).toBe(false);
    expect(generatesVolunteerHours(AssignmentCompensationKind.PAID)).toBe(false);
  });
});
