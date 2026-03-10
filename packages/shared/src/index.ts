// ─── User ────────────────────────────────────────────────────────────────────

export enum UserRole {
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
  EMERGENCY_OPERATIONAL = 'EMERGENCY_OPERATIONAL',
  EMERGENCY_COORDINATOR = 'EMERGENCY_COORDINATOR',
  LOGISTICS_COORDINATOR = 'LOGISTICS_COORDINATOR',
}

export interface RoleMetadata {
  displayName: string;
  description: string;
  domain: string;
}

export const ROLE_METADATA: Record<UserRole, RoleMetadata> = {
  [UserRole.SYSTEM_ADMIN]: {
    displayName: 'System Administrator',
    description: 'Full access to all system resources and operations.',
    domain: 'system',
  },
  [UserRole.EMERGENCY_OPERATIONAL]: {
    displayName: 'Emergency Operational',
    description: 'Performs emergency field operations; cannot manage configuration.',
    domain: 'emergency',
  },
  [UserRole.EMERGENCY_COORDINATOR]: {
    displayName: 'Emergency Coordinator',
    description: 'Manages emergency-operation configuration and workflows.',
    domain: 'emergency',
  },
  [UserRole.LOGISTICS_COORDINATOR]: {
    displayName: 'Logistics Coordinator',
    description: 'Manages logistics operations and configuration.',
    domain: 'logistics',
  },
};

// ─── Actions ─────────────────────────────────────────────────────────────────

export enum Action {
  MANAGE_USERS = 'MANAGE_USERS',
  VIEW_USERS = 'VIEW_USERS',
  EMERGENCY_OPERATION = 'EMERGENCY_OPERATION',
  MANAGE_EMERGENCY_CONFIG = 'MANAGE_EMERGENCY_CONFIG',
  MANAGE_LOGISTICS = 'MANAGE_LOGISTICS',
}

export const ROLE_PERMISSIONS: Record<UserRole, Action[]> = {
  [UserRole.SYSTEM_ADMIN]: Object.values(Action) as Action[],
  [UserRole.EMERGENCY_OPERATIONAL]: [Action.EMERGENCY_OPERATION],
  [UserRole.EMERGENCY_COORDINATOR]: [
    Action.EMERGENCY_OPERATION,
    Action.MANAGE_EMERGENCY_CONFIG,
    Action.VIEW_USERS,
  ],
  [UserRole.LOGISTICS_COORDINATOR]: [Action.MANAGE_LOGISTICS],
};

export function hasPermission(role: UserRole, action: Action): boolean {
  if (role === UserRole.SYSTEM_ADMIN) return true;
  return (ROLE_PERMISSIONS[role] ?? []).includes(action);
}

export enum AuthProvider {
  LOCAL = 'LOCAL',
  GOOGLE = 'GOOGLE',
  MICROSOFT = 'MICROSOFT',
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  provider: AuthProvider;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: User;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

// ─── API Helpers ──────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
}

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error: string;
}
