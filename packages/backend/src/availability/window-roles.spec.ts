import {
  AvailabilityWindowCategory,
  CertificationType,
  DEFAULT_EMERGENCY_WINDOW_ROLES,
  defaultRolesForCategory,
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
 * starts with, what counts as a coherent set of them, and how a post's
 * `requiredCertification` is resolved — a coordinator's own choice, with a
 * name-derived suggestion as the only fallback.
 */

const role = (
  name: string,
  maxPeople = 1,
  requiredCertification?: CertificationType | null,
): WindowRoleSpec => ({ name, maxPeople, requiredCertification });

describe('default roles', () => {
  it('gives an Emergency window a crew of three, each with its own required certification', () => {
    expect(defaultRolesForCategory(AvailabilityWindowCategory.EMERGENCY)).toEqual([
      { name: 'Driver', maxPeople: 1, requiredCertification: CertificationType.DRIVER },
      { name: 'Team Leader', maxPeople: 1, requiredCertification: CertificationType.TAS },
      { name: 'Team Member', maxPeople: 1, requiredCertification: CertificationType.TAT },
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

describe('the driver-name suggestion', () => {
  it.each(['Driver', 'driver', 'DRIVER', '  Driver  '])(
    'suggests the certification for %p',
    (name) => {
      expect(roleRequiresDriverCertification(name)).toBe(true);
    },
  );

  it.each(['Team Leader', 'Driver assistant', 'Co-driver', ''])(
    'does not suggest it for %p',
    (name) => {
      expect(roleRequiresDriverCertification(name)).toBe(false);
    },
  );
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

  it('accepts a role with no certification requirement', () => {
    expect(validateWindowRoles([role('Volunteer', 1, null)])).toBeNull();
  });

  it('accepts a role left unset', () => {
    expect(validateWindowRoles([{ name: 'Volunteer', maxPeople: 1 }])).toBeNull();
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

  it('rejects a value that is not a certification', () => {
    const invalid = [{ name: 'Driver', maxPeople: 1, requiredCertification: 'PILOT' }] as never;
    expect(validateWindowRoles(invalid)).toMatch(/not a certification/);
  });
});

describe('toWindowRoles', () => {
  it('a role named "Driver" with no explicit choice falls back to the DRIVER suggestion', () => {
    expect(toWindowRoles([role(' Driver ')])).toEqual([
      { name: 'Driver', maxPeople: 1, order: 0, requiredCertification: CertificationType.DRIVER },
    ]);
  });

  it('any other role with no explicit choice gets no requirement', () => {
    expect(toWindowRoles([role('Radio', 0)])).toEqual([
      { name: 'Radio', maxPeople: 0, order: 0, requiredCertification: null },
    ]);
  });

  it("a coordinator's explicit choice is kept as given, suggestion or not", () => {
    expect(
      toWindowRoles([
        role('Driver', 1, CertificationType.TAS),
        role('Team Leader', 1, CertificationType.TAT),
      ]),
    ).toEqual([
      { name: 'Driver', maxPeople: 1, order: 0, requiredCertification: CertificationType.TAS },
      { name: 'Team Leader', maxPeople: 1, order: 1, requiredCertification: CertificationType.TAT },
    ]);
  });

  it('an explicit null (deliberately no requirement) is kept, even for a role named "Driver"', () => {
    expect(toWindowRoles([role('Driver', 1, null)])).toEqual([
      { name: 'Driver', maxPeople: 1, order: 0, requiredCertification: null },
    ]);
  });

  it('trims names and numbers the order', () => {
    expect(toWindowRoles([role(' Driver '), role('Radio', 0)]).map((entry) => entry.name)).toEqual([
      'Driver',
      'Radio',
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
