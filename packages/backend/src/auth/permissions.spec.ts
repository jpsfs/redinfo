import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './guards/roles.guard';
import { ROLES_KEY, ACTIONS_KEY } from './decorators/roles.decorator';
import { UserRole, Action, hasPermission, ROLE_METADATA, ROLE_PERMISSIONS } from '@redinfo/shared';

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

// ── ROLE_METADATA tests ───────────────────────────────────────────────────────

describe('ROLE_METADATA', () => {
  it('every role has a displayName, description and domain', () => {
    Object.values(UserRole).forEach((role) => {
      const meta = ROLE_METADATA[role as UserRole];
      expect(meta).toBeDefined();
      expect(meta.displayName).toBeTruthy();
      expect(meta.description).toBeTruthy();
      expect(meta.domain).toBeTruthy();
    });
  });

  it('System Administrator display name is correct', () => {
    expect(ROLE_METADATA[UserRole.SYSTEM_ADMIN].displayName).toBe('System Administrator');
  });
});

// ── RolesGuard tests ──────────────────────────────────────────────────────────

describe('RolesGuard', () => {
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
  });

  it('allows all requests when no roles or actions required', () => {
    const guard = new RolesGuard(reflector);
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user: { role: UserRole.EMERGENCY_OPERATIONAL } }),
      }),
    } as unknown as ExecutionContext;
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('SYSTEM_ADMIN passes action-based guard for MANAGE_USERS', () => {
    const guard = new RolesGuard(reflector);
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) =>
      key === ACTIONS_KEY ? [Action.MANAGE_USERS] : undefined,
    );
    const ctx = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user: { role: UserRole.SYSTEM_ADMIN } }),
      }),
    } as unknown as ExecutionContext;
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('EMERGENCY_OPERATIONAL is denied for MANAGE_USERS (Scenario 2)', () => {
    const guard = new RolesGuard(reflector);
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) =>
      key === ACTIONS_KEY ? [Action.MANAGE_USERS] : undefined,
    );
    const ctx = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user: { role: UserRole.EMERGENCY_OPERATIONAL } }),
      }),
    } as unknown as ExecutionContext;
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('EMERGENCY_COORDINATOR passes MANAGE_EMERGENCY_CONFIG guard (Scenario 4)', () => {
    const guard = new RolesGuard(reflector);
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) =>
      key === ACTIONS_KEY ? [Action.MANAGE_EMERGENCY_CONFIG] : undefined,
    );
    const ctx = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user: { role: UserRole.EMERGENCY_COORDINATOR } }),
      }),
    } as unknown as ExecutionContext;
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('EMERGENCY_COORDINATOR is denied for MANAGE_LOGISTICS (Scenario 4 cross-domain)', () => {
    const guard = new RolesGuard(reflector);
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) =>
      key === ACTIONS_KEY ? [Action.MANAGE_LOGISTICS] : undefined,
    );
    const ctx = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user: { role: UserRole.EMERGENCY_COORDINATOR } }),
      }),
    } as unknown as ExecutionContext;
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('SYSTEM_ADMIN passes role-based guard (Scenario 1)', () => {
    const guard = new RolesGuard(reflector);
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) =>
      key === ROLES_KEY ? [UserRole.SYSTEM_ADMIN] : undefined,
    );
    const ctx = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user: { role: UserRole.SYSTEM_ADMIN } }),
      }),
    } as unknown as ExecutionContext;
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('returns false when user has no role', () => {
    const guard = new RolesGuard(reflector);
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) =>
      key === ACTIONS_KEY ? [Action.MANAGE_USERS] : undefined,
    );
    const ctx = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user: null }),
      }),
    } as unknown as ExecutionContext;
    expect(guard.canActivate(ctx)).toBe(false);
  });
});
