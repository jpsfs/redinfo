import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, ACTIONS_KEY } from '../decorators/roles.decorator';
import { UserRole, Action, hasPermission } from '@redinfo/shared';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredActions = this.reflector.getAllAndOverride<Action[]>(ACTIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if ((!requiredRoles || requiredRoles.length === 0) && (!requiredActions || requiredActions.length === 0)) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    const roles: UserRole[] = user?.roles ?? [];

    if (roles.length === 0) return false;

    // @Roles and @Actions are alternative authorization strategies (OR).
    // @Roles: explicit allow-list — holding *any* listed role is enough.
    // @Actions: capability-based check via ROLE_PERMISSIONS, unioned across
    // every role the user holds.
    if (requiredRoles && requiredRoles.length > 0 && requiredRoles.some((role) => roles.includes(role))) {
      return true;
    }

    if (requiredActions && requiredActions.length > 0) {
      return requiredActions.every((action) => hasPermission(roles, action));
    }

    return false;
  }
}
