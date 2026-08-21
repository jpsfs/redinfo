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

/** The clock span of one shift, in whole hours. `endHour` 24 means midnight. */
export interface ShiftTimes {
  /** Start hour, 0–23. */
  startHour: number;
  /** End hour, 1–24 (24 = midnight of the following day). */
  endHour: number;
}

/**
 * One shift of one day of one window.
 *
 * `slot` is the shift's identity *within its day* — 1-based, ordered by start
 * time. Submissions reference `(date, slot)` rather than a named shift, which
 * is what lets each day carry its own times: slot 1 can be 20:00–24:00 on a
 * Monday and 08:00–16:00 on the Saturday of the same window.
 */
export interface ShiftDefinition extends ShiftTimes {
  slot: number;
  /** Human label, e.g. "08:00–16:00". */
  label: string;
}

export type DayType = 'workday' | 'weekend' | 'holiday';

/**
 * The default shift grid, as confirmed with the PO (ADO #160):
 *   workdays (Mon–Fri, non-holiday) → 1 shift, 20:00–24:00
 *   weekends (Sat/Sun) or holidays  → 2 shifts, 08:00–16:00 and 16:00–24:00
 *
 * These are only *defaults*: a window materialises its own shifts per day when
 * it is opened, and a coordinator may edit any day's times. Every consumer must
 * read the shifts of the window in play rather than re-deriving them from here.
 */
export const DEFAULT_WORKDAY_SHIFTS: readonly ShiftTimes[] = [{ startHour: 20, endHour: 24 }];

export const DEFAULT_SPECIAL_DAY_SHIFTS: readonly ShiftTimes[] = [
  { startHour: 8, endHour: 16 },
  { startHour: 16, endHour: 24 },
];

/** Fresh, mutable copies — callers edit these, so never hand out the constants. */
export function defaultShiftsForDayType(dayType: DayType): ShiftTimes[] {
  const defaults =
    dayType === 'workday' ? DEFAULT_WORKDAY_SHIFTS : DEFAULT_SPECIAL_DAY_SHIFTS;
  return defaults.map(({ startHour, endHour }) => ({ startHour, endHour }));
}

/** Runaway guard on the per-day editor; not a domain rule. */
export const MAX_SHIFTS_PER_DAY = 6;

/**
 * Longest window a coordinator may open, as a guard against fat-fingered
 * years. Shared so the editor stops at the same day count the API rejects.
 */
export const MAX_WINDOW_DAYS = 92;

const pad = (hour: number) => String(hour).padStart(2, '0');

/** e.g. "08:00–16:00". */
export function formatShiftLabel({ startHour, endHour }: ShiftTimes): string {
  return `${pad(startHour)}:00–${pad(endHour)}:00`;
}

/** e.g. "08–16h", for calendar cells too small for the full label. */
export function formatShiftShortLabel({ startHour, endHour }: ShiftTimes): string {
  return `${pad(startHour)}–${endHour}h`;
}

/** By start time, then end time — the order slots are numbered in. */
export function sortShifts(shifts: ShiftTimes[]): ShiftTimes[] {
  return [...shifts].sort(
    (a, b) => a.startHour - b.startHour || a.endHour - b.endHour,
  );
}

/**
 * The one rule for whether a day's shifts are coherent, returning a message
 * fit to show a coordinator or null when they are fine.
 *
 * Shared so the per-day editor can block Save with the same wording the API
 * would reject the payload with. Overlaps are rejected because one person
 * cannot cover two shifts that share an hour — which is the whole point of
 * splitting a day into shifts.
 */
export function validateDayShifts(shifts: ShiftTimes[]): string | null {
  if (shifts.length > MAX_SHIFTS_PER_DAY) {
    return `A day may have at most ${MAX_SHIFTS_PER_DAY} shifts (got ${shifts.length}).`;
  }

  for (const shift of shifts) {
    if (!Number.isInteger(shift.startHour) || !Number.isInteger(shift.endHour)) {
      return 'Shift times must be whole hours.';
    }
    if (shift.startHour < 0 || shift.startHour > 23) {
      return 'A shift must start between 00:00 and 23:00.';
    }
    if (shift.endHour < 1 || shift.endHour > 24) {
      return 'A shift must end between 01:00 and 24:00.';
    }
    if (shift.endHour <= shift.startHour) {
      return `A shift must end after it starts (got ${formatShiftLabel(shift)}).`;
    }
  }

  const sorted = sortShifts(shifts);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].startHour < sorted[index - 1].endHour) {
      return `Shifts ${formatShiftLabel(sorted[index - 1])} and ${formatShiftLabel(
        sorted[index],
      )} overlap.`;
    }
  }

  return null;
}

/** Sorted, slot-numbered and labelled: the shape every consumer reads. */
export function toShiftDefinitions(shifts: ShiftTimes[]): ShiftDefinition[] {
  return sortShifts(shifts).map((shift, index) => ({
    slot: index + 1,
    startHour: shift.startHour,
    endHour: shift.endHour,
    label: formatShiftLabel(shift),
  }));
}

/**
 * First and last day of a calendar month, as ISO dates — the range the
 * "whole month" window covers. `month` is 1–12.
 */
export function monthBounds(
  year: number,
  month: number,
): { startDate: string; endDate: string } {
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new RangeError('year and month must be whole numbers');
  }
  if (month < 1 || month > 12) {
    throw new RangeError(`month must be between 1 and 12, got ${month}`);
  }
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return {
    startDate: iso(new Date(Date.UTC(year, month - 1, 1))),
    // Day 0 of the next month is the last day of this one, leap years included.
    endDate: iso(new Date(Date.UTC(year, month, 0))),
  };
}

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

/** The shifts of one calendar day, plus the day type that seeded them. */
export interface DayShiftPattern {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string | null;
  /** May be empty: a day can be left with no shifts at all. */
  shifts: ShiftDefinition[];
}

export interface AvailabilityWindowWithCalendar extends AvailabilityWindow {
  calendar: DayShiftPattern[];
}

/** One day's shifts as sent when opening a window. */
export interface AvailabilityWindowDayInput {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  shifts: ShiftTimes[];
}

export interface CreateAvailabilityWindowRequest {
  startDate: string;
  endDate: string;
  /**
   * Per-day shifts. Must cover every day of the range exactly once when
   * present; omit it entirely to materialise the default grid instead.
   */
  days?: AvailabilityWindowDayInput[];
}

/** `POST /availability-windows/month` — a whole month on the default grid. */
export interface CreateMonthlyAvailabilityWindowRequest {
  year: number;
  /** 1–12. */
  month: number;
}

export interface AvailabilitySubmission {
  id: string;
  userId: string;
  windowId: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  /** Shift slot within that day of the window. */
  slot: number;
  createdAt: string;
  updatedAt: string;
}

/** One day's selection, as submitted from the UI. */
export interface AvailabilityEntry {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  /** Slots the person is available for, from that day's shifts. */
  slots: number[];
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

export interface AvailabilityMatrixShiftCell extends ShiftTimes {
  /** Slot within its own day; only unique together with the date. */
  slot: number;
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
