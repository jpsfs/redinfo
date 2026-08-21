import {
  Action,
  availabilityEligibleRoles,
  coverageLevel,
  DEFAULT_VEHICLES_NEEDED,
  hasPermission,
  MAX_VEHICLES_PER_SHIFT,
  ROLE_PERMISSIONS,
  SHIFT_MAX_PEOPLE,
  SHIFT_MIN_DRIVERS,
  UserRole,
} from '@redinfo/shared';

// ── coverage colour rule ───────────────────────────────────────────────────────
//
// A scheduled shift holds at most 3 people, and every vehicle it needs has to
// be driven — so a coordinator judging schedulability needs three numbers:
//   red    — fewer than 2 available, or a vehicle is needed and nobody can drive
//   green  — 3+ available *and* a driver for every vehicle
//   yellow — everything in between

describe('coverageLevel', () => {
  it.each([
    // [available, drivers, expected] — one vehicle, the default
    [0, 0, 'red'],
    [1, 0, 'red'],
    [1, 1, 'red'], // one person is never a shift, even if they drive
    [3, 0, 'red'], // enough bodies, nobody can drive
    [9, 0, 'red'],
    [2, 1, 'yellow'],
    [2, 2, 'yellow'], // enough drivers, but only 2 bodies
    [3, 1, 'green'], // one vehicle needs one driver, and that is met
    [4, 1, 'green'],
    [3, 2, 'green'],
    [5, 3, 'green'],
  ] as const)('(%i available, %i drivers) → %s', (available, drivers, expected) => {
    expect(coverageLevel(available, drivers)).toBe(expected);
  });

  it('defaults to one vehicle when none is given', () => {
    expect(coverageLevel(3, 1)).toBe(coverageLevel(3, 1, DEFAULT_VEHICLES_NEEDED));
    expect(DEFAULT_VEHICLES_NEEDED).toBe(1);
  });

  // ── one driver per vehicle ─────────────────────────────────────────────────

  it.each([
    // [available, drivers, vehicles, expected]
    [3, 1, 2, 'yellow'], // second vehicle has nobody to drive it
    [6, 1, 2, 'yellow'], // plenty of people, still only one driver
    [3, 2, 2, 'green'],
    [6, 2, 3, 'yellow'],
    [6, 3, 3, 'green'],
    [9, 3, 4, 'yellow'],
  ] as const)(
    '(%i available, %i drivers, %i vehicles) → %s',
    (available, drivers, vehicles, expected) => {
      expect(coverageLevel(available, drivers, vehicles)).toBe(expected);
    },
  );

  it('needs a driver for each vehicle before it goes green, however many people turn up', () => {
    for (let vehicles = 1; vehicles <= 4; vehicles++) {
      for (let drivers = 0; drivers < vehicles; drivers++) {
        expect(coverageLevel(20, drivers, vehicles)).not.toBe('green');
      }
      expect(coverageLevel(20, vehicles, vehicles)).toBe('green');
    }
  });

  it('judges a shift needing no vehicle on headcount alone', () => {
    // A phone watch or a static post: no vehicle, so no driver required.
    expect(coverageLevel(3, 0, 0)).toBe('green');
    expect(coverageLevel(2, 0, 0)).toBe('yellow');
    expect(coverageLevel(1, 0, 0)).toBe('red');
  });

  it('never reports green below the schedulable headcount', () => {
    for (let available = 0; available < SHIFT_MAX_PEOPLE; available++) {
      for (let drivers = 0; drivers <= available; drivers++) {
        expect(coverageLevel(available, drivers)).not.toBe('green');
      }
    }
  });

  it('always reports red when a vehicle is needed and the minimum driver count is not met', () => {
    for (let available = 0; available <= 10; available++) {
      expect(coverageLevel(available, SHIFT_MIN_DRIVERS - 1, 1)).toBe('red');
    }
  });
});

// ── shift capacity constants ───────────────────────────────────────────────────

describe('shift capacity constants', () => {
  it('matches the rule confirmed with the PO (max 3 people, one driver per vehicle)', () => {
    expect(SHIFT_MAX_PEOPLE).toBe(3);
    expect(SHIFT_MIN_DRIVERS).toBe(1);
    expect(MAX_VEHICLES_PER_SHIFT).toBe(10);
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
