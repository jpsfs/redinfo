import { SetMetadata } from '@nestjs/common';
import { UserRole, Action } from '@redinfo/shared';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export const ACTIONS_KEY = 'actions';
export const Actions = (...actions: Action[]) => SetMetadata(ACTIONS_KEY, actions);
