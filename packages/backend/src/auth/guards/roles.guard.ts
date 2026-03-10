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
    const role: UserRole = user?.role;

    if (!role) return false;

    // @Roles and @Actions are alternative authorization strategies (OR).
    // @Roles: explicit allow-list of roles.
    // @Actions: capability-based check via ROLE_PERMISSIONS.
    if (requiredRoles && requiredRoles.length > 0 && requiredRoles.includes(role)) {
      return true;
    }

    if (requiredActions && requiredActions.length > 0) {
      return requiredActions.every((action) => hasPermission(role, action));
    }

    return false;
  }
}
