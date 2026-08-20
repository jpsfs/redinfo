import {
  Action,
  availabilityEligibleRoles,
  coverageLevel,
  hasPermission,
  ROLE_PERMISSIONS,
  SHIFT_DEFINITIONS,
  SHIFT_MAX_PEOPLE,
  SHIFT_MIN_DRIVERS,
  ShiftCode,
  SPECIAL_DAY_SHIFT_CODES,
  UserRole,
  WORKDAY_SHIFT_CODES,
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

// ── shift definitions ──────────────────────────────────────────────────────────

describe('SHIFT_DEFINITIONS', () => {
  it('defines the workday shift as a single 20:00–24:00 slot', () => {
    expect(WORKDAY_SHIFT_CODES).toEqual([ShiftCode.EVENING]);
    expect(SHIFT_DEFINITIONS[ShiftCode.EVENING]).toEqual({
      code: ShiftCode.EVENING,
      label: '20:00–24:00',
      startHour: 20,
      endHour: 24,
    });
  });

  it('defines weekend/holiday days as two back-to-back slots covering 08:00–24:00', () => {
    expect(SPECIAL_DAY_SHIFT_CODES).toEqual([ShiftCode.MORNING, ShiftCode.AFTERNOON]);
    const [morning, afternoon] = SPECIAL_DAY_SHIFT_CODES.map((code) => SHIFT_DEFINITIONS[code]);
    expect(morning.startHour).toBe(8);
    expect(morning.endHour).toBe(afternoon.startHour);
    expect(afternoon.endHour).toBe(24);
  });

  it('has a definition for every shift code', () => {
    Object.values(ShiftCode).forEach((code) => {
      expect(SHIFT_DEFINITIONS[code]).toBeDefined();
      expect(SHIFT_DEFINITIONS[code].label).toBeTruthy();
    });
  });
});

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
