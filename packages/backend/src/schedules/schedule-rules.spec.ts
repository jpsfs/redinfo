import {
  Action,
  AvailabilityWindowRole,
  assignedDriverCount,
  CertificationType,
  hasPermission,
  requiredSlotsForShift,
  roleCanTakeMore,
  scheduleFillStats,
  ScheduleDayBoard,
  shiftGaps,
  shiftsOverlap,
  UNLIMITED_ROLE_PEOPLE,
  UserRole,
} from '@redinfo/shared';

// ── The rules a schedule is judged by (ADO #161) ───────────────────────────────
//
// These live in @redinfo/shared so the API, the board and the CSV export cannot
// disagree about whether a shift is covered. They are pure, so this is where the
// awkward cases get pinned down.

const TODAY = '2026-10-01';

const role = (
  overrides: Partial<AvailabilityWindowRole> & { id: string; name: string },
): AvailabilityWindowRole => ({
  windowId: 'w1',
  maxPeople: 1,
  mandatoryCount: 0,
  requiredCertification: overrides.name === 'Driver' ? CertificationType.DRIVER : null,
  order: 0,
  ...overrides,
});

const person = (isDriver: boolean, roleId: string | null = null) => ({
  roleId,
  user: { isDriver },
});

const DRIVER = role({ id: 'r-driver', name: 'Driver', order: 0 });
const LEADER = role({ id: 'r-leader', name: 'Team Leader', order: 1 });
const MEMBER = role({ id: 'r-member', name: 'Team Member', order: 2 });
const EMERGENCY_ROLES = [DRIVER, LEADER, MEMBER];

describe('roleCanTakeMore', () => {
  it('stops a finite role at its headcount', () => {
    expect(roleCanTakeMore({ maxPeople: 1 }, 0)).toBe(true);
    expect(roleCanTakeMore({ maxPeople: 1 }, 1)).toBe(false);
    expect(roleCanTakeMore({ maxPeople: 3 }, 2)).toBe(true);
  });

  it('never stops an unlimited role — it is a pool, not a post', () => {
    expect(roleCanTakeMore({ maxPeople: UNLIMITED_ROLE_PEOPLE }, 0)).toBe(true);
    expect(roleCanTakeMore({ maxPeople: UNLIMITED_ROLE_PEOPLE }, 97)).toBe(true);
  });
});

describe('assignedDriverCount', () => {
  it('counts certified people in any role, not only the driver post', () => {
    const onShift = [
      person(true, DRIVER.id),
      person(false, LEADER.id),
      person(true, MEMBER.id),
    ];
    expect(assignedDriverCount(onShift)).toBe(2);
  });
});

describe('shiftGaps', () => {
  // AC: "Coverage gaps (unfilled required slots) are visually flagged … including
  // a role left short of its people and a shift left without a driver for every
  // vehicle it needs."

  it('reports nothing for a shift filled to every role with a driver per vehicle', () => {
    const gaps = shiftGaps({
      vehiclesNeeded: 1,
      roles: EMERGENCY_ROLES,
      assignments: [
        person(true, DRIVER.id),
        person(false, LEADER.id),
        person(false, MEMBER.id),
      ],
    });
    expect(gaps).toEqual([]);
  });

  it('flags a role left short of its people, naming it', () => {
    const gaps = shiftGaps({
      vehiclesNeeded: 1,
      roles: EMERGENCY_ROLES,
      assignments: [person(true, DRIVER.id), person(false, LEADER.id)],
    });
    expect(gaps).toEqual([
      { kind: 'ROLE_SHORT', roleId: MEMBER.id, roleName: 'Team Member', missing: 1 },
    ]);
  });

  it('flags a shift with nobody who can drive the vehicle it needs', () => {
    const gaps = shiftGaps({
      vehiclesNeeded: 1,
      roles: EMERGENCY_ROLES,
      assignments: [
        person(false, DRIVER.id),
        person(false, LEADER.id),
        person(false, MEMBER.id),
      ],
    });
    expect(gaps).toEqual([{ kind: 'MISSING_DRIVER', missing: 1 }]);
  });

  // The case the story calls out explicitly: drivers are counted per vehicle,
  // the Driver role is capped at one person, so the second certified driver of a
  // two-vehicle shift has to sit somewhere else — and that still counts.
  it('accepts a second certified driver in another role on a two-vehicle shift', () => {
    const gaps = shiftGaps({
      vehiclesNeeded: 2,
      roles: EMERGENCY_ROLES,
      assignments: [
        person(true, DRIVER.id),
        person(false, LEADER.id),
        person(true, MEMBER.id),
      ],
    });
    expect(gaps).toEqual([]);
  });

  it('still flags a two-vehicle shift crewed by only one driver', () => {
    const gaps = shiftGaps({
      vehiclesNeeded: 2,
      roles: EMERGENCY_ROLES,
      assignments: [
        person(true, DRIVER.id),
        person(false, LEADER.id),
        person(false, MEMBER.id),
      ],
    });
    expect(gaps).toEqual([{ kind: 'MISSING_DRIVER', missing: 1 }]);
  });

  it('needs no driver at all for a shift with no vehicle', () => {
    const gaps = shiftGaps({
      vehiclesNeeded: 0,
      roles: [role({ id: 'r1', name: 'Phone watch' })],
      assignments: [person(false, 'r1')],
    });
    expect(gaps).toEqual([]);
  });

  it('never calls an unlimited role short', () => {
    const pool = role({ id: 'r-pool', name: 'Helper', maxPeople: UNLIMITED_ROLE_PEOPLE });
    expect(
      shiftGaps({ vehiclesNeeded: 0, roles: [pool], assignments: [] }),
    ).toEqual([]);
  });

  // AC: "a window with no roles schedules people without one".
  it('flags an empty shift in a window with no roles, and only then', () => {
    expect(shiftGaps({ vehiclesNeeded: 0, roles: [], assignments: [] })).toEqual([
      { kind: 'EMPTY_SHIFT', missing: 1 },
    ]);
    expect(
      shiftGaps({ vehiclesNeeded: 0, roles: [], assignments: [person(false)] }),
    ).toEqual([]);
  });
});

describe('shiftsOverlap', () => {
  it('is true when the clock spans intersect', () => {
    expect(
      shiftsOverlap({ startMinute: 480, endMinute: 960 }, { startMinute: 900, endMinute: 1200 }),
    ).toBe(true);
  });

  it('is false for shifts that merely touch — 08:00–16:00 then 16:00–24:00', () => {
    expect(
      shiftsOverlap({ startMinute: 480, endMinute: 960 }, { startMinute: 960, endMinute: 1440 }),
    ).toBe(false);
  });
});

describe('requiredSlotsForShift', () => {
  it('sums the finite roles', () => {
    expect(requiredSlotsForShift(EMERGENCY_ROLES)).toBe(3);
  });

  it('asks for one person when the window defines no roles', () => {
    expect(requiredSlotsForShift([])).toBe(1);
  });

  it('asks for nothing from an unlimited role', () => {
    const pool = role({ id: 'r-pool', name: 'Helper', maxPeople: UNLIMITED_ROLE_PEOPLE });
    expect(requiredSlotsForShift([DRIVER, pool])).toBe(1);
  });
});

describe('scheduleFillStats', () => {
  const days: ScheduleDayBoard[] = [
    {
      date: '2026-10-01',
      isWeekend: false,
      isHoliday: false,
      shifts: [
        {
          slot: 1,
          startMinute: 1200,
          endMinute: 1440,
          vehiclesNeeded: 1,
          label: '20:00–24:00',
          driverCount: 1,
          gaps: [],
          assignments: [
            { isOverride: false } as never,
            { isOverride: true } as never,
            { isOverride: false } as never,
          ],
        },
        {
          slot: 2,
          startMinute: 0,
          endMinute: 480,
          vehiclesNeeded: 1,
          label: '00:00–08:00',
          driverCount: 0,
          gaps: [{ kind: 'MISSING_DRIVER', missing: 1 }],
          assignments: [],
        },
      ],
    },
  ];

  it('counts required slots per shift, filled people, gapped shifts and overrides', () => {
    expect(scheduleFillStats(days, EMERGENCY_ROLES, TODAY)).toEqual({
      requiredSlots: 6,
      filledSlots: 3,
      shiftsWithGaps: 1,
      overrideCount: 1,
      certificationExceptionCount: 0,
      lapsedCertificationCount: 0,
    });
  });

  // "Overrides" means cover a coordinator arranged off-platform. Someone who
  // put themselves on a published rota did not need overriding, even though no
  // submission backs them either.
  it('does not count a self-signup as an override', () => {
    const withSignUp: ScheduleDayBoard[] = [
      {
        ...days[0],
        shifts: [
          {
            ...days[0].shifts[0],
            assignments: [
              { isOverride: true, selfAssigned: true } as never,
              { isOverride: true, selfAssigned: false } as never,
            ],
          },
        ],
      },
    ];

    expect(scheduleFillStats(withSignUp, EMERGENCY_ROLES, TODAY).overrideCount).toBe(1);
  });
});

describe('scheduleFillStats certification counters', () => {
  const TAS_ROLE = role({ id: 'r-tas', name: 'Team Leader', requiredCertification: CertificationType.TAS });
  const ROLES = [TAS_ROLE];

  const heldCert = (type: CertificationType, validUntil: string | null) => [{ type, validUntil }];

  const dayWith = (assignments: unknown[]): ScheduleDayBoard[] => [
    {
      date: '2026-10-01',
      isWeekend: false,
      isHoliday: false,
      shifts: [
        {
          slot: 1,
          startMinute: 1200,
          endMinute: 1440,
          vehiclesNeeded: 1,
          label: '20:00–24:00',
          driverCount: 1,
          gaps: [],
          assignments: assignments as never,
        },
      ],
    },
  ];

  it('counts an assignment carrying a reason as an exception, not a lapse', () => {
    const days = dayWith([
      {
        roleId: TAS_ROLE.id,
        certificationOverrideReason: 'TAS de serviço em formação',
        user: { certifications: [] },
      } as never,
    ]);
    expect(scheduleFillStats(days, ROLES, TODAY)).toMatchObject({
      certificationExceptionCount: 1,
      lapsedCertificationCount: 0,
    });
  });

  it('counts an assignment whose certification has since lapsed, with no reason on file', () => {
    const days = dayWith([
      {
        roleId: TAS_ROLE.id,
        certificationOverrideReason: null,
        user: { certifications: heldCert(CertificationType.TAS, '2026-01-01') },
      } as never,
    ]);
    expect(scheduleFillStats(days, ROLES, TODAY)).toMatchObject({
      certificationExceptionCount: 0,
      lapsedCertificationCount: 1,
    });
  });

  it('counts neither when the person still holds the requirement', () => {
    const days = dayWith([
      {
        roleId: TAS_ROLE.id,
        certificationOverrideReason: null,
        user: { certifications: heldCert(CertificationType.TAS, '2030-01-01') },
      } as never,
    ]);
    expect(scheduleFillStats(days, ROLES, TODAY)).toMatchObject({
      certificationExceptionCount: 0,
      lapsedCertificationCount: 0,
    });
  });

  it('counts neither for a post with no requirement', () => {
    const days = dayWith([
      {
        roleId: MEMBER.id,
        certificationOverrideReason: null,
        user: { certifications: [] },
      } as never,
    ]);
    expect(scheduleFillStats(days, [MEMBER], TODAY)).toMatchObject({
      certificationExceptionCount: 0,
      lapsedCertificationCount: 0,
    });
  });
});

describe('schedule permissions', () => {
  it('lets a coordinator build and read schedules', () => {
    expect(hasPermission(UserRole.EMERGENCY_COORDINATOR, Action.MANAGE_SCHEDULES)).toBe(true);
    expect(hasPermission(UserRole.EMERGENCY_COORDINATOR, Action.VIEW_SCHEDULES)).toBe(true);
  });

  it('lets an admin build and read schedules', () => {
    expect(hasPermission(UserRole.SYSTEM_ADMIN, Action.MANAGE_SCHEDULES)).toBe(true);
    expect(hasPermission(UserRole.SYSTEM_ADMIN, Action.VIEW_SCHEDULES)).toBe(true);
  });

  // Volunteers read their own duties through `GET /schedules/me`, which is
  // scoped to the caller rather than gated on an action.
  it('does not give field personnel the whole roster', () => {
    expect(hasPermission(UserRole.EMERGENCY_OPERATIONAL, Action.VIEW_SCHEDULES)).toBe(false);
    expect(hasPermission(UserRole.EMERGENCY_OPERATIONAL, Action.MANAGE_SCHEDULES)).toBe(false);
  });

  it('keeps logistics out of the emergency rota', () => {
    expect(hasPermission(UserRole.LOGISTICS_COORDINATOR, Action.VIEW_SCHEDULES)).toBe(false);
    expect(hasPermission(UserRole.LOGISTICS_COORDINATOR, Action.MANAGE_SCHEDULES)).toBe(false);
  });
});
