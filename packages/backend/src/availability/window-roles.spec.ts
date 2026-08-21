import {
  AvailabilityWindowCategory,
  DEFAULT_EMERGENCY_WINDOW_ROLES,
  defaultRolesForCategory,
  DRIVER_ROLE_NAME,
  formatRoleCapacity,
  MAX_ROLE_NAME_LENGTH,
  MAX_ROLES_PER_WINDOW,
  roleRequiresDriverCertification,
  toWindowRoles,
  UNLIMITED_ROLE_PEOPLE,
  validateWindowRoles,
  WindowRoleSpec,
} from '@redinfo/shared';

/**
 * The role rules shared by the API and the window editor: which roles a window
 * starts with, what counts as a coherent set of them, and the standing rule
 * that the driver post always requires the certification.
 */

const role = (name: string, maxPeople = 1): WindowRoleSpec => ({ name, maxPeople });

describe('default roles', () => {
  it('gives an Emergency window a crew of three, one person each', () => {
    expect(defaultRolesForCategory(AvailabilityWindowCategory.EMERGENCY)).toEqual([
      { name: 'Driver', maxPeople: 1 },
      { name: 'Team Leader', maxPeople: 1 },
      { name: 'Team Member', maxPeople: 1 },
    ]);
  });

  it.each([
    AvailabilityWindowCategory.LOCAL_SUPPORT,
    AvailabilityWindowCategory.SALOP_SUPPORT,
  ])('leaves %s with no roles, for whoever opens it to decide', (category) => {
    expect(defaultRolesForCategory(category)).toEqual([]);
  });

  it('hands out fresh copies, so editing one window cannot change the defaults', () => {
    const first = defaultRolesForCategory(AvailabilityWindowCategory.EMERGENCY);
    first[0].maxPeople = 7;

    expect(defaultRolesForCategory(AvailabilityWindowCategory.EMERGENCY)[0].maxPeople).toBe(1);
    expect(DEFAULT_EMERGENCY_WINDOW_ROLES[0].maxPeople).toBe(1);
  });
});

describe('the driver rule', () => {
  it.each(['Driver', 'driver', 'DRIVER', '  Driver  '])(
    'always requires the certification for %p',
    (name) => {
      expect(roleRequiresDriverCertification(name)).toBe(true);
    },
  );

  it.each(['Team Leader', 'Driver assistant', 'Co-driver', ''])(
    'does not require it for %p',
    (name) => {
      expect(roleRequiresDriverCertification(name)).toBe(false);
    },
  );

  it('flags the default crew driver and nobody else', () => {
    const roles = toWindowRoles(
      defaultRolesForCategory(AvailabilityWindowCategory.EMERGENCY),
    );
    expect(
      roles.filter((entry) => entry.requiresDriverCertification).map((entry) => entry.name),
    ).toEqual([DRIVER_ROLE_NAME]);
  });
});

describe('validateWindowRoles', () => {
  it('accepts a window with no roles at all', () => {
    expect(validateWindowRoles([])).toBeNull();
  });

  it('accepts the Emergency defaults', () => {
    expect(
      validateWindowRoles(defaultRolesForCategory(AvailabilityWindowCategory.EMERGENCY)),
    ).toBeNull();
  });

  it('accepts an unlimited role', () => {
    expect(validateWindowRoles([role('Volunteer', UNLIMITED_ROLE_PEOPLE)])).toBeNull();
  });

  it('rejects a blank name', () => {
    expect(validateWindowRoles([role('   ')])).toMatch(/needs a name/);
  });

  it('rejects a name past the length limit', () => {
    expect(validateWindowRoles([role('x'.repeat(MAX_ROLE_NAME_LENGTH + 1))])).toMatch(
      /at most 60 characters/,
    );
  });

  it('accepts a name exactly at the limit', () => {
    expect(validateWindowRoles([role('x'.repeat(MAX_ROLE_NAME_LENGTH))])).toBeNull();
  });

  it('rejects two roles a schedule could not tell apart', () => {
    expect(validateWindowRoles([role('Driver'), role('  driver')])).toMatch(
      /both called "driver"/,
    );
  });

  it.each([-1, 1.5, Number.NaN])('rejects %p people', (maxPeople) => {
    expect(validateWindowRoles([role('Driver', maxPeople)])).toMatch(/whole number/);
  });

  it('rejects more people than a role may take', () => {
    expect(validateWindowRoles([role('Volunteer', 21)])).toMatch(/at most 20 people/);
  });

  it('rejects more roles than a window may have', () => {
    const roles = Array.from({ length: MAX_ROLES_PER_WINDOW + 1 }, (_, index) =>
      role(`Role ${index}`),
    );
    expect(validateWindowRoles(roles)).toMatch(/at most 12 roles/);
  });
});

describe('toWindowRoles', () => {
  it('trims names, numbers the order and applies the driver rule', () => {
    expect(toWindowRoles([role(' Driver '), role('Radio', 0)])).toEqual([
      { name: 'Driver', maxPeople: 1, order: 0, requiresDriverCertification: true },
      { name: 'Radio', maxPeople: 0, order: 1, requiresDriverCertification: false },
    ]);
  });

  it('keeps the order it was given rather than sorting by name', () => {
    expect(toWindowRoles([role('Zulu'), role('Alpha')]).map((entry) => entry.name)).toEqual([
      'Zulu',
      'Alpha',
    ]);
  });
});

describe('formatRoleCapacity', () => {
  it.each([
    [0, 'unlimited'],
    [1, '1 person'],
    [3, 'up to 3 people'],
  ])('describes %i as %p', (maxPeople, expected) => {
    expect(formatRoleCapacity(maxPeople)).toBe(expected);
  });
});
