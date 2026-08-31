import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './guards/roles.guard';
import { ROLES_KEY, ACTIONS_KEY } from './decorators/roles.decorator';
import {
  UserRole,
  Action,
  hasPermission,
  normalizeRoles,
  sameRoleSet,
  ROLE_METADATA,
  ROLE_PERMISSIONS,
} from '@redinfo/shared';

// ── hasPermission unit tests ──────────────────────────────────────────────────

describe('hasPermission', () => {
  it('SYSTEM_ADMIN is allowed for every action', () => {
    Object.values(Action).forEach((action) => {
      expect(hasPermission(UserRole.SYSTEM_ADMIN, action as Action)).toBe(true);
    });
  });

  it('EMERGENCY_OPERATIONAL can perform EMERGENCY_OPERATION', () => {
    expect(hasPermission(UserRole.EMERGENCY_OPERATIONAL, Action.EMERGENCY_OPERATION)).toBe(true);
  });

  it('EMERGENCY_OPERATIONAL cannot perform MANAGE_USERS', () => {
    expect(hasPermission(UserRole.EMERGENCY_OPERATIONAL, Action.MANAGE_USERS)).toBe(false);
  });

  it('EMERGENCY_OPERATIONAL cannot perform MANAGE_PERSONNEL', () => {
    expect(hasPermission(UserRole.EMERGENCY_OPERATIONAL, Action.MANAGE_PERSONNEL)).toBe(false);
  });

  it('EMERGENCY_COORDINATOR can perform MANAGE_PERSONNEL (may enable/disable people and maintain certifications)', () => {
    expect(hasPermission(UserRole.EMERGENCY_COORDINATOR, Action.MANAGE_PERSONNEL)).toBe(true);
  });

  it('EMERGENCY_COORDINATOR cannot perform MANAGE_USERS (account-level stays admin-only)', () => {
    expect(hasPermission(UserRole.EMERGENCY_COORDINATOR, Action.MANAGE_USERS)).toBe(false);
  });

  it('LOGISTICS_COORDINATOR cannot perform MANAGE_PERSONNEL', () => {
    expect(hasPermission(UserRole.LOGISTICS_COORDINATOR, Action.MANAGE_PERSONNEL)).toBe(false);
  });

  it('EMERGENCY_OPERATIONAL cannot perform MANAGE_LOGISTICS', () => {
    expect(hasPermission(UserRole.EMERGENCY_OPERATIONAL, Action.MANAGE_LOGISTICS)).toBe(false);
  });

  it('EMERGENCY_OPERATIONAL cannot perform MANAGE_EMERGENCY_CONFIG', () => {
    expect(hasPermission(UserRole.EMERGENCY_OPERATIONAL, Action.MANAGE_EMERGENCY_CONFIG)).toBe(false);
  });

  it('EMERGENCY_COORDINATOR can perform EMERGENCY_OPERATION', () => {
    expect(hasPermission(UserRole.EMERGENCY_COORDINATOR, Action.EMERGENCY_OPERATION)).toBe(true);
  });

  it('EMERGENCY_COORDINATOR can perform MANAGE_EMERGENCY_CONFIG', () => {
    expect(hasPermission(UserRole.EMERGENCY_COORDINATOR, Action.MANAGE_EMERGENCY_CONFIG)).toBe(true);
  });

  it('EMERGENCY_COORDINATOR cannot perform MANAGE_LOGISTICS (cross-domain denied)', () => {
    expect(hasPermission(UserRole.EMERGENCY_COORDINATOR, Action.MANAGE_LOGISTICS)).toBe(false);
  });

  it('LOGISTICS_COORDINATOR can perform MANAGE_LOGISTICS', () => {
    expect(hasPermission(UserRole.LOGISTICS_COORDINATOR, Action.MANAGE_LOGISTICS)).toBe(true);
  });

  it('LOGISTICS_COORDINATOR cannot perform MANAGE_EMERGENCY_CONFIG (cross-domain denied)', () => {
    expect(hasPermission(UserRole.LOGISTICS_COORDINATOR, Action.MANAGE_EMERGENCY_CONFIG)).toBe(false);
  });

  it('LOGISTICS_COORDINATOR cannot perform MANAGE_USERS', () => {
    expect(hasPermission(UserRole.LOGISTICS_COORDINATOR, Action.MANAGE_USERS)).toBe(false);
  });

  // ── Vehicle permissions ───────────────────────────────────────────────────────

  it('LOGISTICS_COORDINATOR can perform MANAGE_VEHICLES', () => {
    expect(hasPermission(UserRole.LOGISTICS_COORDINATOR, Action.MANAGE_VEHICLES)).toBe(true);
  });

  it('EMERGENCY_COORDINATOR can perform MANAGE_VEHICLES', () => {
    expect(hasPermission(UserRole.EMERGENCY_COORDINATOR, Action.MANAGE_VEHICLES)).toBe(true);
  });

  it('EMERGENCY_OPERATIONAL can perform VIEW_VEHICLES (read-only)', () => {
    expect(hasPermission(UserRole.EMERGENCY_OPERATIONAL, Action.VIEW_VEHICLES)).toBe(true);
  });

  it('EMERGENCY_OPERATIONAL cannot perform MANAGE_VEHICLES', () => {
    expect(hasPermission(UserRole.EMERGENCY_OPERATIONAL, Action.MANAGE_VEHICLES)).toBe(false);
  });

  // ── Availability permissions ──────────────────────────────────────────────────

  it('EMERGENCY_OPERATIONAL can perform SUBMIT_AVAILABILITY', () => {
    expect(hasPermission(UserRole.EMERGENCY_OPERATIONAL, Action.SUBMIT_AVAILABILITY)).toBe(true);
  });

  it('EMERGENCY_OPERATIONAL cannot manage availability windows', () => {
    expect(
      hasPermission(UserRole.EMERGENCY_OPERATIONAL, Action.MANAGE_AVAILABILITY_WINDOWS),
    ).toBe(false);
  });

  it('EMERGENCY_OPERATIONAL cannot manage holidays', () => {
    expect(hasPermission(UserRole.EMERGENCY_OPERATIONAL, Action.MANAGE_HOLIDAYS)).toBe(false);
  });

  it('EMERGENCY_OPERATIONAL cannot view the availability matrix (own data only)', () => {
    expect(
      hasPermission(UserRole.EMERGENCY_OPERATIONAL, Action.VIEW_AVAILABILITY_MATRIX),
    ).toBe(false);
  });

  it('EMERGENCY_COORDINATOR can manage availability windows and holidays', () => {
    expect(
      hasPermission(UserRole.EMERGENCY_COORDINATOR, Action.MANAGE_AVAILABILITY_WINDOWS),
    ).toBe(true);
    expect(hasPermission(UserRole.EMERGENCY_COORDINATOR, Action.MANAGE_HOLIDAYS)).toBe(true);
  });

  it('EMERGENCY_COORDINATOR can view the availability matrix', () => {
    expect(
      hasPermission(UserRole.EMERGENCY_COORDINATOR, Action.VIEW_AVAILABILITY_MATRIX),
    ).toBe(true);
  });

  it('EMERGENCY_COORDINATOR can submit their own availability', () => {
    expect(hasPermission(UserRole.EMERGENCY_COORDINATOR, Action.SUBMIT_AVAILABILITY)).toBe(true);
  });

  it('EMERGENCY_COORDINATOR can manage and view volunteer hours', () => {
    expect(hasPermission(UserRole.EMERGENCY_COORDINATOR, Action.MANAGE_VOLUNTEER_HOURS)).toBe(true);
    expect(hasPermission(UserRole.EMERGENCY_COORDINATOR, Action.VIEW_VOLUNTEER_HOURS)).toBe(true);
  });

  it.each([Action.MANAGE_VOLUNTEER_HOURS, Action.VIEW_VOLUNTEER_HOURS])(
    // Logging and viewing your own hours needs no action at all — those
    // routes are self-scoped, like `GET /schedules/me`. This is about the
    // review queue and the cross-volunteer summary specifically.
    'EMERGENCY_OPERATIONAL cannot %s (only the review queue and summary, not their own hours)',
    (action) => {
      expect(hasPermission(UserRole.EMERGENCY_OPERATIONAL, action)).toBe(false);
    },
  );

  it.each([
    Action.SUBMIT_AVAILABILITY,
    Action.MANAGE_AVAILABILITY_WINDOWS,
    Action.MANAGE_HOLIDAYS,
    Action.VIEW_AVAILABILITY_MATRIX,
    Action.MANAGE_VOLUNTEER_HOURS,
    Action.VIEW_VOLUNTEER_HOURS,
  ])('LOGISTICS_COORDINATOR cannot %s (cross-domain denied)', (action) => {
    expect(hasPermission(UserRole.LOGISTICS_COORDINATOR, action)).toBe(false);
  });

  it('EMERGENCY_COORDINATOR and LOGISTICS_COORDINATOR can manage notices', () => {
    expect(hasPermission(UserRole.EMERGENCY_COORDINATOR, Action.MANAGE_NOTICES)).toBe(true);
    expect(hasPermission(UserRole.LOGISTICS_COORDINATOR, Action.MANAGE_NOTICES)).toBe(true);
  });

  it('EMERGENCY_OPERATIONAL cannot manage notices (reading your own is self-scoped, unactioned)', () => {
    expect(hasPermission(UserRole.EMERGENCY_OPERATIONAL, Action.MANAGE_NOTICES)).toBe(false);
  });

  // Scenario 3: new emergency action added → EMERGENCY_OPERATIONAL gains it after mapping
  it('new emergency action is accessible to EMERGENCY_OPERATIONAL once added to ROLE_PERMISSIONS', () => {
    const DISPATCH_AMBULANCE = 'DISPATCH_AMBULANCE' as Action;
    // Simulate the developer adding the new action to permissions
    ROLE_PERMISSIONS[UserRole.EMERGENCY_OPERATIONAL].push(DISPATCH_AMBULANCE);
    expect(hasPermission(UserRole.EMERGENCY_OPERATIONAL, DISPATCH_AMBULANCE)).toBe(true);
    // Cleanup
    ROLE_PERMISSIONS[UserRole.EMERGENCY_OPERATIONAL].pop();
  });
});

// ── Multi-role union ─────────────────────────────────────────────────────────
//
// A person now holds a *set* of roles (#multi-role) — an Emergency
// Coordinator who is also a System Administrator, or also Emergency
// Operational. Permissions are the union: holding any one role that grants an
// action is enough, and a second role never takes an action away.

describe('hasPermission — multi-role union', () => {
  const OPS_AND_LOGISTICS = [UserRole.EMERGENCY_OPERATIONAL, UserRole.LOGISTICS_COORDINATOR];

  it('unions capabilities across roles', () => {
    expect(hasPermission(OPS_AND_LOGISTICS, Action.SUBMIT_AVAILABILITY)).toBe(true); // from OPERATIONAL
    expect(hasPermission(OPS_AND_LOGISTICS, Action.MANAGE_LOGISTICS)).toBe(true); // from LOGISTICS
  });

  it('a second role never subtracts from the first', () => {
    expect(
      hasPermission([UserRole.EMERGENCY_COORDINATOR, UserRole.EMERGENCY_OPERATIONAL], Action.MANAGE_PERSONNEL),
    ).toBe(true);
  });

  it('grants nothing no held role grants', () => {
    expect(hasPermission(OPS_AND_LOGISTICS, Action.MANAGE_USERS)).toBe(false);
    expect(hasPermission(OPS_AND_LOGISTICS, Action.MANAGE_EMERGENCY_CONFIG)).toBe(false);
  });

  it('SYSTEM_ADMIN anywhere in the set grants everything', () => {
    Object.values(Action).forEach((action) => {
      expect(hasPermission([UserRole.EMERGENCY_OPERATIONAL, UserRole.SYSTEM_ADMIN], action as Action)).toBe(true);
    });
  });

  it('an empty set grants nothing', () => {
    Object.values(Action).forEach((action) => {
      expect(hasPermission([], action as Action)).toBe(false);
    });
  });

  it('a single role and its one-element array agree for every action', () => {
    Object.values(UserRole).forEach((role) => {
      Object.values(Action).forEach((action) => {
        expect(hasPermission([role as UserRole], action as Action)).toBe(
          hasPermission(role as UserRole, action as Action),
        );
      });
    });
  });
});

describe('normalizeRoles', () => {
  it('dedupes and canonicalises to UserRole declaration order', () => {
    expect(
      normalizeRoles([UserRole.LOGISTICS_COORDINATOR, UserRole.SYSTEM_ADMIN, UserRole.SYSTEM_ADMIN]),
    ).toEqual([UserRole.SYSTEM_ADMIN, UserRole.LOGISTICS_COORDINATOR]);
  });
});

describe('sameRoleSet', () => {
  it('ignores order and duplicates but not membership', () => {
    const a = UserRole.EMERGENCY_COORDINATOR;
    const b = UserRole.LOGISTICS_COORDINATOR;
    expect(sameRoleSet([a, b], [b, a])).toBe(true);
    expect(sameRoleSet([a, a], [a])).toBe(true);
    expect(sameRoleSet([a, b], [a, a])).toBe(false); // the length-only-compare trap
    expect(sameRoleSet([a], [a, b])).toBe(false);
  });
});

// ── ROLE_METADATA tests ───────────────────────────────────────────────────────
//
// `displayName`/`description` moved to the frontend catalogue in #180 phase
// 2 (`accountRole.*`/`accountRoleDescription.*` in `i18n/labels.ts`, covered
// by that file's own exhaustive-coverage test) — `domain` is the one field
// that stays here, since it groups roles for permission logic rather than
// for display.

describe('ROLE_METADATA', () => {
  it('every role has a domain', () => {
    Object.values(UserRole).forEach((role) => {
      const meta = ROLE_METADATA[role as UserRole];
      expect(meta).toBeDefined();
      expect(meta.domain).toBeTruthy();
    });
  });

  it('the System Administrator role is in the system domain', () => {
    expect(ROLE_METADATA[UserRole.SYSTEM_ADMIN].domain).toBe('system');
  });
});

// ── RolesGuard tests ──────────────────────────────────────────────────────────

type MetadataKey = string | symbol;
type MetadataMock = (key: MetadataKey) => MetadataKey[] | undefined;

function spyReflectorWith(reflector: Reflector, fn: MetadataMock): void {
  const spy = jest.spyOn(reflector, 'getAllAndOverride');
  (spy as jest.Mock).mockImplementation(fn);
}

function makeCtx(roles: UserRole[] | null): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue({ user: roles ? { roles } : null }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
  });

  it('allows all requests when no roles or actions required', () => {
    const guard = new RolesGuard(reflector);
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(makeCtx([UserRole.EMERGENCY_OPERATIONAL]))).toBe(true);
  });

  it('SYSTEM_ADMIN passes action-based guard for MANAGE_USERS', () => {
    const guard = new RolesGuard(reflector);
    spyReflectorWith(reflector, (key) => key === ACTIONS_KEY ? [Action.MANAGE_USERS] : undefined);
    expect(guard.canActivate(makeCtx([UserRole.SYSTEM_ADMIN]))).toBe(true);
  });

  it('EMERGENCY_OPERATIONAL is denied for MANAGE_USERS (Scenario 2)', () => {
    const guard = new RolesGuard(reflector);
    spyReflectorWith(reflector, (key) => key === ACTIONS_KEY ? [Action.MANAGE_USERS] : undefined);
    expect(guard.canActivate(makeCtx([UserRole.EMERGENCY_OPERATIONAL]))).toBe(false);
  });

  it('EMERGENCY_COORDINATOR passes MANAGE_EMERGENCY_CONFIG guard (Scenario 4)', () => {
    const guard = new RolesGuard(reflector);
    spyReflectorWith(reflector, (key) => key === ACTIONS_KEY ? [Action.MANAGE_EMERGENCY_CONFIG] : undefined);
    expect(guard.canActivate(makeCtx([UserRole.EMERGENCY_COORDINATOR]))).toBe(true);
  });

  it('EMERGENCY_COORDINATOR is denied for MANAGE_LOGISTICS (Scenario 4 cross-domain)', () => {
    const guard = new RolesGuard(reflector);
    spyReflectorWith(reflector, (key) => key === ACTIONS_KEY ? [Action.MANAGE_LOGISTICS] : undefined);
    expect(guard.canActivate(makeCtx([UserRole.EMERGENCY_COORDINATOR]))).toBe(false);
  });

  it('SYSTEM_ADMIN passes role-based guard (Scenario 1)', () => {
    const guard = new RolesGuard(reflector);
    spyReflectorWith(reflector, (key) => key === ROLES_KEY ? [UserRole.SYSTEM_ADMIN] : undefined);
    expect(guard.canActivate(makeCtx([UserRole.SYSTEM_ADMIN]))).toBe(true);
  });

  it('returns false when user has no roles', () => {
    const guard = new RolesGuard(reflector);
    spyReflectorWith(reflector, (key) => key === ACTIONS_KEY ? [Action.MANAGE_USERS] : undefined);
    expect(guard.canActivate(makeCtx(null))).toBe(false);
  });

  it('returns false when user holds an empty role list', () => {
    const guard = new RolesGuard(reflector);
    spyReflectorWith(reflector, (key) => key === ACTIONS_KEY ? [Action.MANAGE_USERS] : undefined);
    expect(guard.canActivate(makeCtx([]))).toBe(false);
  });

  it('a dual-role user passes an @Actions guard satisfied by only one of their roles', () => {
    const guard = new RolesGuard(reflector);
    spyReflectorWith(reflector, (key) => key === ACTIONS_KEY ? [Action.MANAGE_LOGISTICS] : undefined);
    expect(
      guard.canActivate(makeCtx([UserRole.EMERGENCY_OPERATIONAL, UserRole.LOGISTICS_COORDINATOR])),
    ).toBe(true);
  });

  it('@Actions with two actions is still AND, satisfied across two different roles', () => {
    const guard = new RolesGuard(reflector);
    spyReflectorWith(reflector, (key) =>
      key === ACTIONS_KEY ? [Action.MANAGE_LOGISTICS, Action.SUBMIT_AVAILABILITY] : undefined,
    );
    expect(
      guard.canActivate(makeCtx([UserRole.EMERGENCY_OPERATIONAL, UserRole.LOGISTICS_COORDINATOR])),
    ).toBe(true);
  });

  it('@Roles passes when the user holds one of several listed roles', () => {
    const guard = new RolesGuard(reflector);
    spyReflectorWith(reflector, (key) =>
      key === ROLES_KEY ? [UserRole.SYSTEM_ADMIN, UserRole.EMERGENCY_COORDINATOR] : undefined,
    );
    expect(
      guard.canActivate(makeCtx([UserRole.EMERGENCY_OPERATIONAL, UserRole.EMERGENCY_COORDINATOR])),
    ).toBe(true);
  });

  it('@Roles fails on an empty intersection', () => {
    const guard = new RolesGuard(reflector);
    spyReflectorWith(reflector, (key) => key === ROLES_KEY ? [UserRole.SYSTEM_ADMIN] : undefined);
    expect(
      guard.canActivate(makeCtx([UserRole.EMERGENCY_OPERATIONAL, UserRole.LOGISTICS_COORDINATOR])),
    ).toBe(false);
  });
});
