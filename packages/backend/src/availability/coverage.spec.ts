import {
  Action,
  availabilityEligibleRoles,
  coverageLevel,
  hasPermission,
  ROLE_PERMISSIONS,
  SHIFT_MAX_PEOPLE,
  SHIFT_MIN_DRIVERS,
  UserRole,
} from '@redinfo/shared';

// ── coverage colour rule ───────────────────────────────────────────────────────
//
// A scheduled shift holds at most 3 people and always needs ≥1 driver, so a
// coordinator judging schedulability needs both numbers:
//   red    — fewer than 2 available, or no driver at all
//   green  — 3+ available with 2+ drivers (a full shift plus a spare driver)
//   yellow — everything in between

describe('coverageLevel', () => {
  it.each([
    // [available, drivers, expected]
    [0, 0, 'red'],
    [1, 0, 'red'],
    [1, 1, 'red'], // one person is never a shift, even if they drive
    [3, 0, 'red'], // enough bodies, nobody can drive
    [9, 0, 'red'],
    [2, 1, 'yellow'],
    [2, 2, 'yellow'], // enough drivers, but only 2 bodies
    [4, 1, 'yellow'], // plenty available, single point of failure on driving
    [3, 1, 'yellow'],
    [3, 2, 'green'],
    [5, 3, 'green'],
    [3, 3, 'green'],
  ] as const)('(%i available, %i drivers) → %s', (available, drivers, expected) => {
    expect(coverageLevel(available, drivers)).toBe(expected);
  });

  it('never reports green below the schedulable headcount', () => {
    for (let available = 0; available < SHIFT_MAX_PEOPLE; available++) {
      for (let drivers = 0; drivers <= available; drivers++) {
        expect(coverageLevel(available, drivers)).not.toBe('green');
      }
    }
  });

  it('always reports red when the minimum driver count cannot be met', () => {
    for (let available = 0; available <= 10; available++) {
      expect(coverageLevel(available, SHIFT_MIN_DRIVERS - 1)).toBe('red');
    }
  });
});

// ── shift capacity constants ───────────────────────────────────────────────────

describe('shift capacity constants', () => {
  it('matches the rule confirmed with the PO (max 3 people, at least 1 driver)', () => {
    expect(SHIFT_MAX_PEOPLE).toBe(3);
    expect(SHIFT_MIN_DRIVERS).toBe(1);
  });
});

// The default shift grid is covered by shifts.spec.ts, alongside the per-day
// validation rules that now go with it.

// ── who counts as personnel ────────────────────────────────────────────────────

describe('availabilityEligibleRoles', () => {
  it('includes every role explicitly granted SUBMIT_AVAILABILITY', () => {
    expect(availabilityEligibleRoles()).toEqual(
      expect.arrayContaining([
        UserRole.EMERGENCY_OPERATIONAL,
        UserRole.EMERGENCY_COORDINATOR,
      ]),
    );
  });

  it('includes SYSTEM_ADMIN, which is allowed to submit and so must be counted', () => {
    // Anyone who can submit has to appear on the roster; otherwise their saved
    // availability is invisible in the coverage matrix.
    expect(availabilityEligibleRoles()).toContain(UserRole.SYSTEM_ADMIN);
  });

  it('matches exactly the set of roles hasPermission() lets submit', () => {
    const eligible = availabilityEligibleRoles();
    Object.values(UserRole).forEach((role) => {
      expect(eligible.includes(role)).toBe(
        hasPermission(role, Action.SUBMIT_AVAILABILITY),
      );
    });
  });

  it('excludes roles without the action', () => {
    expect(availabilityEligibleRoles()).not.toContain(UserRole.LOGISTICS_COORDINATOR);
  });

  it('picks up a role as soon as it is granted the action', () => {
    ROLE_PERMISSIONS[UserRole.LOGISTICS_COORDINATOR].push(Action.SUBMIT_AVAILABILITY);
    try {
      expect(availabilityEligibleRoles()).toContain(UserRole.LOGISTICS_COORDINATOR);
    } finally {
      ROLE_PERMISSIONS[UserRole.LOGISTICS_COORDINATOR].pop();
    }
  });
});
