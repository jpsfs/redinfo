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
  MANAGE_VEHICLES = 'MANAGE_VEHICLES',
  VIEW_VEHICLES = 'VIEW_VEHICLES',
  MANAGE_VEHICLE_INVENTORY = 'MANAGE_VEHICLE_INVENTORY',
  MANAGE_AVAILABILITY_WINDOWS = 'MANAGE_AVAILABILITY_WINDOWS',
  MANAGE_HOLIDAYS = 'MANAGE_HOLIDAYS',
  SUBMIT_AVAILABILITY = 'SUBMIT_AVAILABILITY',
  VIEW_AVAILABILITY_MATRIX = 'VIEW_AVAILABILITY_MATRIX',
}

export const ROLE_PERMISSIONS: Record<UserRole, Action[]> = {
  [UserRole.SYSTEM_ADMIN]: Object.values(Action) as Action[],
  [UserRole.EMERGENCY_OPERATIONAL]: [
    Action.EMERGENCY_OPERATION,
    Action.VIEW_VEHICLES,
    Action.MANAGE_VEHICLE_INVENTORY,
    Action.SUBMIT_AVAILABILITY,
  ],
  [UserRole.EMERGENCY_COORDINATOR]: [
    Action.EMERGENCY_OPERATION,
    Action.MANAGE_EMERGENCY_CONFIG,
    Action.VIEW_USERS,
    Action.MANAGE_VEHICLES,
    Action.VIEW_VEHICLES,
    Action.MANAGE_VEHICLE_INVENTORY,
    Action.MANAGE_AVAILABILITY_WINDOWS,
    Action.MANAGE_HOLIDAYS,
    Action.VIEW_AVAILABILITY_MATRIX,
    Action.SUBMIT_AVAILABILITY,
  ],
  [UserRole.LOGISTICS_COORDINATOR]: [
    Action.MANAGE_LOGISTICS,
    Action.MANAGE_VEHICLES,
    Action.VIEW_VEHICLES,
    Action.MANAGE_VEHICLE_INVENTORY,
  ],
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
  /** Certified driver — a scheduled shift always needs at least one. */
  isDriver: boolean;
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

// ─── Vehicles ─────────────────────────────────────────────────────────────────

export enum VehicleType {
  EMERGENCY = 'EMERGENCY',
  TRANSPORT = 'TRANSPORT',
}

/**
 * Portuguese licence-plate formats (case-insensitive on input, stored uppercased):
 *   AA-99-99  (pre-1992)
 *   99-99-AA  (1992–2005)
 *   99-AA-99  (2005–2020)
 *   AA-99-AA  (2020+)
 */
export const PT_LICENSE_PLATE_REGEX =
  /^([A-Z]{2}-\d{2}-\d{2}|\d{2}-\d{2}-[A-Z]{2}|\d{2}-[A-Z]{2}-\d{2}|[A-Z]{2}-\d{2}-[A-Z]{2})$/;

export interface MaintenanceEntry {
  id: string;
  vehicleId: string;
  date: string;
  description: string;
  serviceProvider: string;
  cost: number;
  vatAmount?: number | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Vehicle {
  id: string;
  licensePlate: string;
  numeroCauda: string;
  vehicleType: VehicleType;
  insuranceRenewalDate: string;
  nextImtInspectionDate: string;
  manufacturer?: string | null;
  model?: string | null;
  notes?: string | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  maintenanceEntries?: MaintenanceEntry[];
}

// ─── Inventory ─────────────────────────────────────────────────────────────────

export enum InventoryItemType {
  COUNTABLE = 'COUNTABLE',
  UNLIMITED = 'UNLIMITED',
}

export interface InventoryTemplate {
  id: string;
  vehicleType: VehicleType;
  version: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  items?: InventoryTemplateItem[];
}

export interface InventoryTemplateItem {
  id: string;
  templateId: string;
  name: string;
  type: InventoryItemType;
  recommendedQuantity?: number | null;
  unit: string;
  notes?: string | null;
  order: number;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleInventoryItem {
  id: string;
  vehicleId: string;
  templateItemId: string;
  templateItem?: InventoryTemplateItem;
  actualQuantity?: number | null;
  templateVersion: number;
  updatedById?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleInventoryAudit {
  id: string;
  vehicleInventoryItemId: string;
  changedById?: string | null;
  oldQuantity?: number | null;
  newQuantity?: number | null;
  changedAt: string;
}

export interface VehicleInventoryRow {
  templateItem: InventoryTemplateItem;
  vehicleInventoryItem?: VehicleInventoryItem;
  status: 'low' | 'ok' | 'over' | 'unlimited';
}

// ─── Availability ──────────────────────────────────────────────────────────────

export enum ShiftCode {
  /** Weekend / holiday only. */
  MORNING = 'MORNING',
  /** Weekend / holiday only. */
  AFTERNOON = 'AFTERNOON',
  /** Workday only. */
  EVENING = 'EVENING',
}

export interface ShiftDefinition {
  code: ShiftCode;
  /** Human label, e.g. "08:00–24:00". */
  label: string;
  /** Start hour, 0–23. */
  startHour: number;
  /** End hour, 1–24 (24 = midnight of the following day). */
  endHour: number;
}

/**
 * The fixed shift grid. Confirmed with the PO (ADO #160):
 *   workdays (Mon–Fri, non-holiday) → 1 shift, 20:00–24:00
 *   weekends (Sat/Sun) or holidays  → 2 shifts, 08:00–16:00 and 16:00–24:00
 *
 * Not user-configurable today, but every consumer must read the pattern from
 * `ShiftScheduleService` (backend) rather than re-deriving it, so the rule can
 * change in one place.
 */
export const SHIFT_DEFINITIONS: Record<ShiftCode, ShiftDefinition> = {
  [ShiftCode.MORNING]: {
    code: ShiftCode.MORNING,
    label: '08:00–16:00',
    startHour: 8,
    endHour: 16,
  },
  [ShiftCode.AFTERNOON]: {
    code: ShiftCode.AFTERNOON,
    label: '16:00–24:00',
    startHour: 16,
    endHour: 24,
  },
  [ShiftCode.EVENING]: {
    code: ShiftCode.EVENING,
    label: '20:00–24:00',
    startHour: 20,
    endHour: 24,
  },
};

/** Shifts applicable to a workday (Mon–Fri, non-holiday). */
export const WORKDAY_SHIFT_CODES: ShiftCode[] = [ShiftCode.EVENING];

/** Shifts applicable to a weekend day or a holiday. */
export const SPECIAL_DAY_SHIFT_CODES: ShiftCode[] = [
  ShiftCode.MORNING,
  ShiftCode.AFTERNOON,
];

/**
 * Capacity of a single *scheduled* shift. #160 does not enforce these on
 * submission — anyone may declare availability for any applicable shift — but
 * the coverage matrix colours cells against them, and #161 enforces them when
 * building the schedule.
 */
export const SHIFT_MAX_PEOPLE = 3;
export const SHIFT_MIN_DRIVERS = 1;

export type CoverageLevel = 'red' | 'yellow' | 'green';

/**
 * Coverage colour for one shift cell, from how many people are available and
 * how many of those are certified drivers.
 *
 *   red    — fewer than 2 available, or no driver available at all
 *   green  — a full shift is schedulable with a spare driver
 *   yellow — everything in between
 */
export function coverageLevel(
  availableCount: number,
  driverCount: number,
): CoverageLevel {
  if (availableCount < 2 || driverCount === 0) return 'red';
  if (availableCount >= SHIFT_MAX_PEOPLE && driverCount >= 2) return 'green';
  return 'yellow';
}

/**
 * Roles counted as field personnel for availability: exactly those allowed to
 * submit it.
 *
 * Anyone who *can* submit must also be counted — otherwise their saved
 * availability is silently missing from the coverage matrix, which is how a
 * coordinator reads the window. That includes `SYSTEM_ADMIN`, which holds every
 * `Action`. Derived from the permission map rather than hardcoded, so granting
 * `SUBMIT_AVAILABILITY` to a new role adds it to the roster automatically.
 */
export function availabilityEligibleRoles(): UserRole[] {
  return (Object.keys(ROLE_PERMISSIONS) as UserRole[]).filter((role) =>
    hasPermission(role, Action.SUBMIT_AVAILABILITY),
  );
}

export enum AvailabilityWindowStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

/**
 * Only `DECLINED` is ever stored — absence of a row means "not yet responded",
 * and "submitted" is derived from `AvailabilitySubmission` rows existing.
 */
export enum AvailabilityResponseStatus {
  DECLINED = 'DECLINED',
}

/** Tri-state response of one person to one window. */
export type AvailabilityResponseState = 'submitted' | 'declined' | 'pending';

export interface Holiday {
  id: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface AvailabilityWindowActor {
  id: string;
  firstName: string;
  lastName: string;
}

export interface AvailabilityWindow {
  id: string;
  /** ISO date, `YYYY-MM-DD`. */
  startDate: string;
  /** ISO date, `YYYY-MM-DD`. */
  endDate: string;
  status: AvailabilityWindowStatus;
  openedById: string;
  openedBy?: AvailabilityWindowActor | null;
  openedAt: string;
  closedById?: string | null;
  closedBy?: AvailabilityWindowActor | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The applicable shifts for one calendar day, plus why they apply. */
export interface DayShiftPattern {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string | null;
  shifts: ShiftDefinition[];
}

export interface AvailabilityWindowWithCalendar extends AvailabilityWindow {
  calendar: DayShiftPattern[];
}

export interface AvailabilitySubmission {
  id: string;
  userId: string;
  windowId: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  shiftCode: ShiftCode;
  createdAt: string;
  updatedAt: string;
}

/** One day's selection, as submitted from the UI. */
export interface AvailabilityEntry {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  shiftCodes: ShiftCode[];
}

export interface SubmitAvailabilityRequest {
  entries: AvailabilityEntry[];
}

/** `GET /availability/me` — everything the submission screen needs. */
export interface MyAvailabilityResponse {
  window: AvailabilityWindow | null;
  /** False when there is no window, or the window is closed. */
  canSubmit: boolean;
  /** True when the user explicitly declared "no availability this window". */
  declined: boolean;
  /** Applicable shifts per day across the window range. */
  calendar: DayShiftPattern[];
  entries: AvailabilityEntry[];
}

export interface AvailabilityMatrixShiftCell {
  shiftCode: ShiftCode;
  label: string;
  availableCount: number;
  driverCount: number;
  /** Computed server-side via `coverageLevel()`. */
  coverageLevel: CoverageLevel;
  availableUserIds: string[];
}

export interface AvailabilityMatrixPerson {
  id: string;
  firstName: string;
  lastName: string;
  isDriver: boolean;
  responseStatus: AvailabilityResponseState;
}

export interface AvailabilityMatrixDay {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string | null;
  shifts: AvailabilityMatrixShiftCell[];
}

export interface AvailabilityResponseStats {
  submitted: number;
  declined: number;
  pending: number;
  total: number;
}

export interface AvailabilityMatrixResponse {
  window: AvailabilityWindow;
  /** Full eligible roster, each tagged with their response state. */
  personnel: AvailabilityMatrixPerson[];
  days: AvailabilityMatrixDay[];
  responseStats: AvailabilityResponseStats;
}
