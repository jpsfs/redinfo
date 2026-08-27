import {
  VolunteerActivityType,
  VolunteerHoursFlag,
  VolunteerHoursSource,
  VolunteerHoursStatus,
  detectShiftExceptions,
  formatMinutes,
  isEligibleForAutoApproval,
  proposeScheduledHours,
  shiftMandatoryRolesFilled,
  validateManualVolunteerHours,
} from '@redinfo/shared';

// ── The rules volunteer-hours generation is judged by (#164) ───────────────────
//
// These live in @redinfo/shared so generation, the review queue and the CSV
// export cannot disagree about what a clean entry is. Pure, so this is where
// the awkward cases get pinned down.

describe('shiftMandatoryRolesFilled', () => {
  const DRIVER = { id: 'r-driver', mandatoryCount: 1 };
  const LEADER = { id: 'r-leader', mandatoryCount: 1 };
  const MEMBER = { id: 'r-member', mandatoryCount: 0 };

  it('is filled when every mandatory seat has someone in it', () => {
    expect(
      shiftMandatoryRolesFilled({
        roles: [DRIVER, LEADER, MEMBER],
        assignments: [{ roleId: 'r-driver' }, { roleId: 'r-leader' }],
      }),
    ).toBe(true);
  });

  it('is filled when the optional seat is also taken', () => {
    expect(
      shiftMandatoryRolesFilled({
        roles: [DRIVER, LEADER, MEMBER],
        assignments: [{ roleId: 'r-driver' }, { roleId: 'r-leader' }, { roleId: 'r-member' }],
      }),
    ).toBe(true);
  });

  it('is not filled when a mandatory seat is empty', () => {
    expect(
      shiftMandatoryRolesFilled({
        roles: [DRIVER, LEADER, MEMBER],
        assignments: [{ roleId: 'r-driver' }],
      }),
    ).toBe(false);
  });

  it('does not care whether the optional seat is filled', () => {
    expect(
      shiftMandatoryRolesFilled({
        roles: [DRIVER, LEADER, MEMBER],
        assignments: [{ roleId: 'r-driver' }, { roleId: 'r-leader' }],
      }),
    ).toBe(true);
  });

  it('a window with no roles ran if anyone at all was assigned', () => {
    expect(shiftMandatoryRolesFilled({ roles: [], assignments: [{ roleId: null }] })).toBe(true);
    expect(shiftMandatoryRolesFilled({ roles: [], assignments: [] })).toBe(false);
  });

  it('an unlimited role requiring at least one is judged on headcount, not maxPeople', () => {
    const POOL = { id: 'r-pool', mandatoryCount: 1 };
    expect(
      shiftMandatoryRolesFilled({ roles: [POOL], assignments: [{ roleId: 'r-pool' }] }),
    ).toBe(true);
    expect(shiftMandatoryRolesFilled({ roles: [POOL], assignments: [] })).toBe(false);
  });
});

describe('detectShiftExceptions', () => {
  const MANDATORY_DRIVER = { userId: 'u-driver', roleMandatoryCount: 1 };
  const POOL_MEMBER = { userId: 'u-member', roleMandatoryCount: 0 };

  it('credits nobody and flags nobody when there are no reports at all', () => {
    const result = detectShiftExceptions({
      assignments: [MANDATORY_DRIVER, POOL_MEMBER],
      reports: [],
    });
    expect(result.extraMinutesByUser.size).toBe(0);
    expect(result.possiblyLeftEarly.size).toBe(0);
  });

  it('credits the crew of a submitted report that ran over, taking the largest', () => {
    const result = detectShiftExceptions({
      assignments: [MANDATORY_DRIVER, POOL_MEMBER],
      reports: [
        { submitted: true, minutesPastShiftEnd: 20, crewUserIds: ['u-driver', 'u-member'] },
        { submitted: true, minutesPastShiftEnd: 45, crewUserIds: ['u-driver'] },
      ],
    });
    expect(result.extraMinutesByUser.get('u-driver')).toBe(45);
    expect(result.extraMinutesByUser.get('u-member')).toBe(20);
  });

  it('never credits from a draft report, submitted or not', () => {
    const result = detectShiftExceptions({
      assignments: [MANDATORY_DRIVER],
      reports: [{ submitted: false, minutesPastShiftEnd: 90, crewUserIds: ['u-driver'] }],
    });
    expect(result.extraMinutesByUser.size).toBe(0);
  });

  it('does not credit a report that ended within the shift', () => {
    const result = detectShiftExceptions({
      assignments: [MANDATORY_DRIVER],
      reports: [{ submitted: true, minutesPastShiftEnd: -10, crewUserIds: ['u-driver'] }],
    });
    expect(result.extraMinutesByUser.size).toBe(0);
  });

  it('flags an optional-seat person absent from every report on the shift', () => {
    const result = detectShiftExceptions({
      assignments: [MANDATORY_DRIVER, POOL_MEMBER],
      reports: [{ submitted: true, minutesPastShiftEnd: 0, crewUserIds: ['u-driver'] }],
    });
    expect(result.possiblyLeftEarly.has('u-member')).toBe(true);
  });

  it('never flags absence for a mandatory seat', () => {
    const result = detectShiftExceptions({
      assignments: [MANDATORY_DRIVER],
      reports: [{ submitted: true, minutesPastShiftEnd: 0, crewUserIds: [] }],
    });
    expect(result.possiblyLeftEarly.has('u-driver')).toBe(false);
  });

  it("a still-draft report's crew still clears someone of 'possibly absent'", () => {
    const result = detectShiftExceptions({
      assignments: [POOL_MEMBER],
      reports: [{ submitted: false, minutesPastShiftEnd: 0, crewUserIds: ['u-member'] }],
    });
    expect(result.possiblyLeftEarly.has('u-member')).toBe(false);
  });
});

describe('proposeScheduledHours', () => {
  it('proposes the baseline alone when there is nothing to flag', () => {
    expect(
      proposeScheduledHours({ baselineMinutes: 240, extraMinutes: 0, possiblyLeftEarly: false }),
    ).toEqual({ proposedMinutes: 240, flags: [] });
  });

  it('adds the run-over minutes and flags RAN_OVER', () => {
    expect(
      proposeScheduledHours({ baselineMinutes: 240, extraMinutes: 45, possiblyLeftEarly: false }),
    ).toEqual({ proposedMinutes: 285, flags: ['RAN_OVER'] });
  });

  it('flags POSSIBLY_LEFT_EARLY without adjusting minutes', () => {
    expect(
      proposeScheduledHours({ baselineMinutes: 240, extraMinutes: 0, possiblyLeftEarly: true }),
    ).toEqual({ proposedMinutes: 240, flags: ['POSSIBLY_LEFT_EARLY'] });
  });

  it('can carry both flags at once', () => {
    expect(
      proposeScheduledHours({ baselineMinutes: 240, extraMinutes: 30, possiblyLeftEarly: true }),
    ).toEqual({ proposedMinutes: 270, flags: ['RAN_OVER', 'POSSIBLY_LEFT_EARLY'] });
  });
});

describe('isEligibleForAutoApproval', () => {
  const TODAY = '2026-11-01';
  const base = {
    source: VolunteerHoursSource.SCHEDULED,
    status: VolunteerHoursStatus.PENDING,
    flags: [] as VolunteerHoursFlag[],
    date: '2026-10-01',
  };

  it('is eligible once the grace period has fully elapsed', () => {
    expect(isEligibleForAutoApproval(base, TODAY)).toBe(true);
  });

  it('is not eligible before the grace period elapses', () => {
    expect(isEligibleForAutoApproval({ ...base, date: '2026-10-20' }, TODAY)).toBe(false);
  });

  it('is never eligible for a MANUAL entry', () => {
    expect(
      isEligibleForAutoApproval({ ...base, source: VolunteerHoursSource.MANUAL }, TODAY),
    ).toBe(false);
  });

  it('is never eligible once already APPROVED', () => {
    expect(
      isEligibleForAutoApproval({ ...base, status: VolunteerHoursStatus.APPROVED }, TODAY),
    ).toBe(false);
  });

  it('is never eligible while any flag is set', () => {
    expect(
      isEligibleForAutoApproval({ ...base, flags: ['RAN_OVER'] as VolunteerHoursFlag[] }, TODAY),
    ).toBe(false);
  });
});

describe('validateManualVolunteerHours', () => {
  const valid = () => ({
    activityType: VolunteerActivityType.MEETING,
    date: '2026-10-03',
    minutes: 90,
    description: 'Monthly coordination meeting.',
  });

  it('accepts a well-formed manual entry', () => {
    expect(validateManualVolunteerHours(valid())).toBeNull();
  });

  it('rejects an activity type that is not one of the manual three', () => {
    expect(
      validateManualVolunteerHours({ ...valid(), activityType: VolunteerActivityType.EMERGENCY }),
    ).toMatch(/Meeting, Training, or Other/);
  });

  it('rejects a non-positive duration', () => {
    expect(validateManualVolunteerHours({ ...valid(), minutes: 0 })).toMatch(/greater than zero/);
  });

  it('rejects a claim over the per-entry cap', () => {
    expect(validateManualVolunteerHours({ ...valid(), minutes: 24 * 60 })).toMatch(
      /cannot claim more than/,
    );
  });

  it('rejects a blank description', () => {
    expect(validateManualVolunteerHours({ ...valid(), description: '   ' })).toMatch(
      /Describe what the activity was/,
    );
  });
});

describe('formatMinutes', () => {
  it.each([
    [0, '0m'],
    [45, '45m'],
    [60, '1h'],
    [90, '1h 30m'],
    [-30, '-30m'],
  ])('formats %i as %p', (minutes, expected) => {
    expect(formatMinutes(minutes)).toBe(expected);
  });
});
