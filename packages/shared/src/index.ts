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
  MANAGE_SCHEDULES = 'MANAGE_SCHEDULES',
  VIEW_SCHEDULES = 'VIEW_SCHEDULES',
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
    // Building the rota is the same job as opening the window it comes from.
    Action.MANAGE_SCHEDULES,
    Action.VIEW_SCHEDULES,
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

/** Minutes in a day; also the value that means "midnight" as an end time. */
export const MINUTES_PER_DAY = 1440;

/**
 * The clock span of one shift, as minutes from midnight.
 *
 * Minutes rather than hours because shifts are set per day by a coordinator and
 * real rotas do not fall on the hour (a handover at 08:30 is ordinary). Stored
 * as integers so ordering, overlap and equality are plain arithmetic.
 */
export interface ShiftTimes {
  /** Minutes from midnight the shift starts, 0–1439 (510 = 08:30). */
  startMinute: number;
  /** Minutes from midnight it ends, 1–1440 (1440 = midnight, end of day). */
  endMinute: number;
}

/** Minutes from midnight for a wall-clock time. */
export function toMinuteOfDay(hour: number, minute = 0): number {
  return hour * 60 + minute;
}

/** `HH:MM`, with 1440 rendered as "24:00" rather than wrapping to "00:00". */
export function formatTimeOfDay(minuteOfDay: number): string {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return `${pad(hour)}:${pad(minute)}`;
}

/**
 * The value a native `<input type="time">` can hold, which cannot express
 * 24:00 — end-of-day shows there as "00:00", the usual convention for a shift
 * that runs to midnight.
 */
export function toTimeInputValue(minuteOfDay: number): string {
  return formatTimeOfDay(minuteOfDay % MINUTES_PER_DAY);
}

/**
 * Parse `HH:MM` to minutes from midnight, or null when it is not a time.
 *
 * Accepts "24:00" for end-of-day; a caller reading an end time from a native
 * picker maps the "00:00" it gets there to `MINUTES_PER_DAY` itself.
 */
export function parseTimeOfDay(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value?.trim() ?? '');
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 24 || minute > 59 || (hour === 24 && minute !== 0)) return null;
  return toMinuteOfDay(hour, minute);
}

/** Vehicles a shift needs when nobody has said otherwise. */
export const DEFAULT_VEHICLES_NEEDED = 1;

/** Runaway guard on the editor's vehicle field; not a domain rule. */
export const MAX_VEHICLES_PER_SHIFT = 10;

/**
 * A shift as a coordinator defines it: when it runs, and what it needs.
 *
 * `vehiclesNeeded` drives the coverage colours — every vehicle has to be
 * crewed by a driver, so two vehicles on a shift means two drivers before it
 * counts as covered. Zero is meaningful: a shift that needs people but no
 * vehicle (a phone watch, a static post) does not need a driver at all.
 */
export interface ShiftSpec extends ShiftTimes {
  vehiclesNeeded: number;
}

/**
 * One shift of one day of one window.
 *
 * `slot` is the shift's identity *within its day* — 1-based, ordered by start
 * time. Submissions reference `(date, slot)` rather than a named shift, which
 * is what lets each day carry its own times: slot 1 can be 20:00–24:00 on a
 * Monday and 08:00–16:00 on the Saturday of the same window.
 */
export interface ShiftDefinition extends ShiftSpec {
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
export const DEFAULT_WORKDAY_SHIFTS: readonly ShiftTimes[] = [
  { startMinute: toMinuteOfDay(20), endMinute: toMinuteOfDay(24) },
];

export const DEFAULT_SPECIAL_DAY_SHIFTS: readonly ShiftTimes[] = [
  { startMinute: toMinuteOfDay(8), endMinute: toMinuteOfDay(16) },
  { startMinute: toMinuteOfDay(16), endMinute: toMinuteOfDay(24) },
];

/** Fresh, mutable copies — callers edit these, so never hand out the constants. */
export function defaultShiftsForDayType(dayType: DayType): ShiftSpec[] {
  const defaults =
    dayType === 'workday' ? DEFAULT_WORKDAY_SHIFTS : DEFAULT_SPECIAL_DAY_SHIFTS;
  return defaults.map(({ startMinute, endMinute }) => ({
    startMinute,
    endMinute,
    vehiclesNeeded: DEFAULT_VEHICLES_NEEDED,
  }));
}

/** Runaway guard on the per-day editor; not a domain rule. */
export const MAX_SHIFTS_PER_DAY = 6;

/**
 * Longest window a coordinator may open, as a guard against fat-fingered
 * years. Shared so the editor stops at the same day count the API rejects.
 */
export const MAX_WINDOW_DAYS = 92;

const pad = (value: number) => String(value).padStart(2, '0');

/** e.g. "08:00–16:30". */
export function formatShiftLabel({ startMinute, endMinute }: ShiftTimes): string {
  return `${formatTimeOfDay(startMinute)}–${formatTimeOfDay(endMinute)}`;
}

/**
 * e.g. "8–16" or "8:30–16", for calendar cells too small for the full label:
 * the leading zero and an on-the-hour ":00" are the first things to go.
 */
export function formatShiftShortLabel({ startMinute, endMinute }: ShiftTimes): string {
  const short = (minuteOfDay: number) => {
    const hour = Math.floor(minuteOfDay / 60);
    const minute = minuteOfDay % 60;
    return minute === 0 ? String(hour) : `${hour}:${pad(minute)}`;
  };
  return `${short(startMinute)}–${short(endMinute)}`;
}

/**
 * By start time, then end time — the order slots are numbered in. Generic so
 * sorting a list of fuller shift objects keeps everything else about them.
 */
export function sortShifts<T extends ShiftTimes>(shifts: T[]): T[] {
  return [...shifts].sort(
    (a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute,
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
export function validateDayShifts(
  // `vehiclesNeeded` is optional so the time rules can be checked on their own;
  // when a count is given it is held to the same limits the API applies.
  shifts: Array<ShiftTimes & { vehiclesNeeded?: number }>,
): string | null {
  if (shifts.length > MAX_SHIFTS_PER_DAY) {
    return `A day may have at most ${MAX_SHIFTS_PER_DAY} shifts (got ${shifts.length}).`;
  }

  for (const shift of shifts) {
    if (shift.vehiclesNeeded !== undefined) {
      if (!Number.isInteger(shift.vehiclesNeeded) || shift.vehiclesNeeded < 0) {
        return 'Vehicles needed must be a whole number, or 0 for none.';
      }
      if (shift.vehiclesNeeded > MAX_VEHICLES_PER_SHIFT) {
        return `A shift may need at most ${MAX_VEHICLES_PER_SHIFT} vehicles (got ${shift.vehiclesNeeded}).`;
      }
    }
    if (!Number.isInteger(shift.startMinute) || !Number.isInteger(shift.endMinute)) {
      return 'Shift times must fall on a whole minute.';
    }
    if (shift.startMinute < 0 || shift.startMinute > MINUTES_PER_DAY - 1) {
      return 'A shift must start between 00:00 and 23:59.';
    }
    if (shift.endMinute < 1 || shift.endMinute > MINUTES_PER_DAY) {
      return 'A shift must end between 00:01 and 24:00.';
    }
    if (shift.endMinute <= shift.startMinute) {
      return `A shift must end after it starts (got ${formatShiftLabel(shift)}).`;
    }
  }

  const sorted = sortShifts(shifts);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].startMinute < sorted[index - 1].endMinute) {
      return `Shifts ${formatShiftLabel(sorted[index - 1])} and ${formatShiftLabel(
        sorted[index],
      )} overlap.`;
    }
  }

  return null;
}

/** Sorted, slot-numbered and labelled: the shape every consumer reads. */
export function toShiftDefinitions(
  shifts: Array<ShiftTimes & { vehiclesNeeded?: number }>,
): ShiftDefinition[] {
  return sortShifts(shifts).map((shift, index) => ({
    slot: index + 1,
    startMinute: shift.startMinute,
    endMinute: shift.endMinute,
    vehiclesNeeded: shift.vehiclesNeeded ?? DEFAULT_VEHICLES_NEEDED,
    label: formatShiftLabel(shift),
  }));
}

/**
 * Month names, in the one place both the backend (naming an emergency window)
 * and the frontend (month pickers, calendar headers) read them from — so the
 * name a window is given always matches the month the coordinator picked.
 */
export const MONTH_NAMES: readonly string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Name of a calendar month, 1–12. */
export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? String(month);
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

/** Per vehicle: a vehicle nobody can drive is not cover. */
export const SHIFT_MIN_DRIVERS = 1;

export type CoverageLevel = 'red' | 'yellow' | 'green';

/**
 * Coverage colour for one shift cell, from how many people are available, how
 * many of those are certified drivers, and how many vehicles the shift needs.
 *
 *   red    — fewer than 2 available, or a vehicle is needed and nobody can drive
 *   green  — a full shift is schedulable *and* every vehicle has a driver
 *   yellow — everything in between
 *
 * The driver test is per vehicle: one driver takes one vehicle, so a two-vehicle
 * shift is not green on a single driver however many people are available. A
 * shift needing no vehicle needs no driver, and is judged on headcount alone.
 */
export function coverageLevel(
  availableCount: number,
  driverCount: number,
  vehiclesNeeded: number = DEFAULT_VEHICLES_NEEDED,
): CoverageLevel {
  if (availableCount < 2) return 'red';
  if (vehiclesNeeded > 0 && driverCount < SHIFT_MIN_DRIVERS) return 'red';
  if (availableCount >= SHIFT_MAX_PEOPLE && driverCount >= vehiclesNeeded) return 'green';
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
 * What a window is asking availability *for*.
 *
 * Categories are independent rotas: the same person may be asked for emergency
 * cover and for local-support cover over the same dates, so two windows may
 * overlap as long as their categories differ.
 */
export enum AvailabilityWindowCategory {
  EMERGENCY = 'EMERGENCY',
  LOCAL_SUPPORT = 'LOCAL_SUPPORT',
  SALOP_SUPPORT = 'SALOP_SUPPORT',
}

export interface AvailabilityWindowCategoryMetadata {
  label: string;
  description: string;
}

export const AVAILABILITY_WINDOW_CATEGORY_METADATA: Record<
  AvailabilityWindowCategory,
  AvailabilityWindowCategoryMetadata
> = {
  [AvailabilityWindowCategory.EMERGENCY]: {
    label: 'Emergency',
    description: 'Emergency response cover — the standing on-call rota.',
  },
  [AvailabilityWindowCategory.LOCAL_SUPPORT]: {
    label: 'Local Support',
    description: 'Cover for local events and standby requests.',
  },
  [AvailabilityWindowCategory.SALOP_SUPPORT]: {
    label: 'SALOP Support',
    description: 'Cover for SALOP operations.',
  },
};

/** Declaration order, which is the order every picker offers them in. */
export const AVAILABILITY_WINDOW_CATEGORIES = Object.keys(
  AVAILABILITY_WINDOW_CATEGORY_METADATA,
) as AvailabilityWindowCategory[];

/**
 * Display label for a category, falling back to the raw value so a category
 * added to the enum before this map still renders as something readable.
 */
export function availabilityWindowCategoryLabel(
  category: AvailabilityWindowCategory | string,
): string {
  return (
    AVAILABILITY_WINDOW_CATEGORY_METADATA[category as AvailabilityWindowCategory]?.label ??
    String(category)
  );
}

// ─── Window roles ──────────────────────────────────────────────────────────────

/**
 * A post people are scheduled into on the shifts of one window.
 *
 * Roles belong to the window, never to the person: availability is collected
 * with no mention of them — a volunteer says only when they can be there — and
 * the coordinator assigns roles when building the schedule (#161). That is why
 * this shape carries no user, and why nothing on the submission screens reads it.
 */
export interface WindowRoleSpec {
  name: string;
  /**
   * Most people the schedule may put in this role on one shift. `0` means
   * unlimited, for a role that is a pool rather than a post.
   */
  maxPeople: number;
}

export interface AvailabilityWindowRole extends WindowRoleSpec {
  id: string;
  windowId: string;
  /** Position in the window's own list, 0-based — the order it is offered in. */
  order: number;
  /**
   * Only a certified driver may be assigned to this role. Always true for the
   * driver post: a vehicle nobody may legally drive is not cover, so this is
   * derived from the name rather than left to whoever fills the form in.
   */
  requiresDriverCertification: boolean;
}

/** What `maxPeople: 0` means — as many people as the coordinator assigns. */
export const UNLIMITED_ROLE_PEOPLE = 0;

/** The role that always requires the driver certification. */
export const DRIVER_ROLE_NAME = 'Driver';

/** Guards on the role editor; not domain rules. */
export const MAX_ROLE_NAME_LENGTH = 60;
export const MAX_ROLES_PER_WINDOW = 12;
export const MAX_ROLE_PEOPLE = 20;

/**
 * Whether a role is the driver post. Matched on the name, case- and
 * space-insensitively, so "driver" typed by hand is the same post as the one
 * the Emergency defaults create.
 */
export function roleRequiresDriverCertification(name: string): boolean {
  return name.trim().toLowerCase() === DRIVER_ROLE_NAME.toLowerCase();
}

/**
 * The roles an Emergency window has unless the coordinator changes them: one
 * crew, one person each, as confirmed with the PO.
 */
export const DEFAULT_EMERGENCY_WINDOW_ROLES: readonly WindowRoleSpec[] = [
  { name: DRIVER_ROLE_NAME, maxPeople: 1 },
  { name: 'Team Leader', maxPeople: 1 },
  { name: 'Team Member', maxPeople: 1 },
];

/**
 * Fresh, mutable copies of a category's default roles — callers edit these.
 *
 * Only Emergency has defaults. Other rotas are shaped by whoever opens them, so
 * they start empty rather than inheriting a crew that may make no sense there.
 */
export function defaultRolesForCategory(
  category: AvailabilityWindowCategory | string,
): WindowRoleSpec[] {
  if (category !== AvailabilityWindowCategory.EMERGENCY) return [];
  return DEFAULT_EMERGENCY_WINDOW_ROLES.map((role) => ({ ...role }));
}

/** e.g. "1 person", "up to 3 people", "unlimited". */
export function formatRoleCapacity(maxPeople: number): string {
  if (maxPeople === UNLIMITED_ROLE_PEOPLE) return 'unlimited';
  return maxPeople === 1 ? '1 person' : `up to ${maxPeople} people`;
}

/**
 * The one rule for whether a window's roles are coherent, returning a message
 * fit to show a coordinator or null when they are fine. Shared so the editor
 * blocks Save with the same wording the API would reject the payload with.
 *
 * Names must differ case-insensitively: two roles called "Driver" and "driver"
 * would read as the same post on the schedule and be impossible to tell apart.
 * A window with no roles at all is allowed — people are then simply scheduled
 * without one.
 */
export function validateWindowRoles(roles: WindowRoleSpec[]): string | null {
  if (roles.length > MAX_ROLES_PER_WINDOW) {
    return `A window may have at most ${MAX_ROLES_PER_WINDOW} roles (got ${roles.length}).`;
  }

  const seen = new Set<string>();
  for (const role of roles) {
    const name = role.name?.trim() ?? '';
    if (!name) return 'Every role needs a name.';
    if (name.length > MAX_ROLE_NAME_LENGTH) {
      return `A role name may be at most ${MAX_ROLE_NAME_LENGTH} characters (got ${name.length}).`;
    }
    if (!Number.isInteger(role.maxPeople) || role.maxPeople < 0) {
      return 'People per role must be a whole number, or 0 for unlimited.';
    }
    if (role.maxPeople > MAX_ROLE_PEOPLE) {
      return `A role may take at most ${MAX_ROLE_PEOPLE} people (got ${role.maxPeople}), or 0 for unlimited.`;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) return `Two roles are both called "${name}".`;
    seen.add(key);
  }

  return null;
}

/** Trimmed, ordered and with the driver rule applied — how roles are stored. */
export function toWindowRoles(
  roles: WindowRoleSpec[],
): Array<WindowRoleSpec & { order: number; requiresDriverCertification: boolean }> {
  return roles.map((role, index) => {
    const name = role.name.trim();
    return {
      name,
      maxPeople: role.maxPeople,
      order: index,
      requiresDriverCertification: roleRequiresDriverCertification(name),
    };
  });
}

/** Guard on the free-text window name; names need not be unique. */
export const MAX_WINDOW_NAME_LENGTH = 120;

/** The name the "New Emergency Availability" shortcut gives its window. */
export function emergencyWindowName(month: number): string {
  return `Emergency - ${monthName(month)}`;
}

/**
 * How a window is titled on screen: its own name when it was given one, and
 * its category otherwise, so a nameless window still reads as something.
 */
export function availabilityWindowLabel(window: {
  category: AvailabilityWindowCategory | string;
  name?: string | null;
}): string {
  return window.name?.trim() || availabilityWindowCategoryLabel(window.category);
}

/**
 * Whether two inclusive date ranges share at least one day. Used both to
 * refuse a second open window over the same dates in one category and to warn
 * about re-asking for dates a closed window already covered.
 */
export function datesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
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
  /** Which rota this window collects availability for. */
  category: AvailabilityWindowCategory;
  /** Optional free-text title, e.g. "Emergency - October". Not unique. */
  name?: string | null;
  status: AvailabilityWindowStatus;
  openedById: string;
  openedBy?: AvailabilityWindowActor | null;
  openedAt: string;
  closedById?: string | null;
  closedBy?: AvailabilityWindowActor | null;
  closedAt?: string | null;
  /**
   * Roles the schedule for this window is built from, in their own order. May
   * be empty; irrelevant to submitting availability, which never mentions them.
   */
  roles?: AvailabilityWindowRole[];
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
  shifts: ShiftSpec[];
}

export interface CreateAvailabilityWindowRequest {
  startDate: string;
  endDate: string;
  category: AvailabilityWindowCategory;
  /** Free-text title; omitted or blank leaves the window showing its category. */
  name?: string | null;
  /**
   * Per-day shifts. Must cover every day of the range exactly once when
   * present; omit it entirely to materialise the default grid instead.
   */
  days?: AvailabilityWindowDayInput[];
  /**
   * Roles the schedule will be built from. Omit to take the category's defaults
   * (a crew of Driver, Team Leader and Team Member for Emergency, none
   * elsewhere); send an empty list to open a window with no roles at all.
   */
  roles?: WindowRoleSpec[];
  /**
   * Confirms the coordinator saw the "a closed window already covers these
   * dates" warning and meant it. Never bypasses an *open* overlap.
   */
  acknowledgeOverlap?: boolean;
}

/** `POST /availability-windows/month` — a whole month on the default grid. */
export interface CreateMonthlyAvailabilityWindowRequest {
  year: number;
  /** 1–12. */
  month: number;
  acknowledgeOverlap?: boolean;
}

/**
 * `GET /availability-windows/overlaps` — windows of one category already
 * covering a proposed range, so the create screens can warn before saving
 * rather than only on the rejected request.
 */
export interface AvailabilityWindowOverlapsResponse {
  /** Overlapping windows that are still open: opening another is refused. */
  open: AvailabilityWindow[];
  /** Overlapping windows already closed: allowed, but worth a warning. */
  closed: AvailabilityWindow[];
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
  /**
   * Windows the person can switch between: every open one, plus the window
   * being shown when it is already closed. Empty only when none exists at all.
   */
  windows: AvailabilityWindow[];
  /** False when there is no window, or the window is closed. */
  canSubmit: boolean;
  /** True when the user explicitly declared "no availability this window". */
  declined: boolean;
  /** Applicable shifts per day across the window range. */
  calendar: DayShiftPattern[];
  entries: AvailabilityEntry[];
}

export interface AvailabilityMatrixShiftCell extends ShiftSpec {
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

// ─── Schedules ─────────────────────────────────────────────────────────────────

/**
 * A schedule is built for one availability window, over that window's dates and
 * against the shifts that window defined per day. Windows of different
 * categories may cover the same dates, so there is no single "monthly schedule":
 * each window is scheduled independently and carries its own history.
 */
export enum ScheduleStatus {
  /** Being built. Nobody but a coordinator sees it. */
  DRAFT = 'DRAFT',
  /** Assigned personnel see their duties. Still editable — cover changes daily. */
  PUBLISHED = 'PUBLISHED',
}

/** Why a shift is not fully crewed. */
export type ScheduleGapKind =
  /** Fewer certified drivers on the shift than it has vehicles to crew. */
  | 'MISSING_DRIVER'
  /** A role with a finite `maxPeople` that is not filled to it. */
  | 'ROLE_SHORT'
  /** A window with no roles at all, and nobody assigned to this shift. */
  | 'EMPTY_SHIFT';

export interface ScheduleGap {
  kind: ScheduleGapKind;
  /** Set for `ROLE_SHORT` only — which post is short. */
  roleId?: string;
  roleName?: string;
  /** How many more people the gap wants. */
  missing: number;
}

/**
 * Where an assignment stands against what the person actually submitted, read
 * live rather than from `isOverride`: someone may withdraw their availability
 * after being scheduled, and the board should say so.
 */
export type AssignmentAvailability = AvailabilityResponseState;

export interface SchedulePerson {
  id: string;
  firstName: string;
  lastName: string;
  isDriver: boolean;
}

export interface ScheduleAssignment {
  id: string;
  scheduleId: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  /** Shift slot within that day of the window. */
  slot: number;
  userId: string;
  user: SchedulePerson;
  /** Null only when the window defines no roles. */
  roleId?: string | null;
  roleName?: string | null;
  /**
   * The person had not submitted availability for this shift when they were
   * assigned. Recorded at assignment time and never recomputed: it is the audit
   * record of a decision, not a live view of the submission table.
   */
  isOverride: boolean;
  /** Live state of the same person's submission, for display. */
  availability: AssignmentAvailability;
  assignedById: string;
  assignedBy?: AvailabilityWindowActor | null;
  assignedAt: string;
}

/** One shift of the board: what it needs, who is on it, what is missing. */
export interface ScheduleShiftBoard extends ShiftSpec {
  slot: number;
  label: string;
  assignments: ScheduleAssignment[];
  /** Certified drivers across every role on this shift. */
  driverCount: number;
  gaps: ScheduleGap[];
}

export interface ScheduleDayBoard {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string | null;
  shifts: ScheduleShiftBoard[];
}

/**
 * The same person on two shifts whose clock times overlap — including shifts in
 * two different windows, which is the case a single window cannot see.
 */
export interface ScheduleConflict {
  userId: string;
  userName: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  /** The assignment on *this* schedule. */
  slot: number;
  /** What it collides with. */
  otherWindowId: string;
  otherWindowLabel: string;
  otherLabel: string;
  /** True when the collision is on another window rather than this one. */
  crossWindow: boolean;
}

export interface ScheduleFillStats {
  /** Slots the window's roles ask for, over every shift. Unlimited roles ask for none. */
  requiredSlots: number;
  /** Assignments that count towards those slots. */
  filledSlots: number;
  /** Shifts carrying at least one gap. */
  shiftsWithGaps: number;
  overrideCount: number;
}

export interface Schedule {
  id: string;
  windowId: string;
  window?: AvailabilityWindow | null;
  status: ScheduleStatus;
  createdById: string;
  createdBy?: AvailabilityWindowActor | null;
  createdAt: string;
  publishedById?: string | null;
  publishedBy?: AvailabilityWindowActor | null;
  publishedAt?: string | null;
  updatedAt: string;
  /** Present on list rows so the grid can show progress without the full board. */
  stats?: ScheduleFillStats;
}

/** `GET /schedules/:id/board` — everything the builder screen needs. */
export interface ScheduleBoardResponse {
  schedule: Schedule;
  window: AvailabilityWindow;
  /** The window's own roles, in their own order. May be empty. */
  roles: AvailabilityWindowRole[];
  days: ScheduleDayBoard[];
  conflicts: ScheduleConflict[];
  stats: ScheduleFillStats;
}

/** One person the coordinator could put on a shift. */
export interface ScheduleCandidate extends SchedulePerson {
  /** Their response to the window this schedule belongs to. */
  availability: AssignmentAvailability;
  /** True when they submitted for *this* shift — the easy path. */
  submittedForShift: boolean;
  /** Already on this shift, in this role or another: cannot be assigned twice. */
  alreadyOnShift: boolean;
  /** Role they already hold on this shift, when `alreadyOnShift`. */
  currentRoleName?: string | null;
  /** Duties already given to them on this schedule — the fairness signal. */
  dutyCount: number;
  /** An overlapping duty elsewhere, if any, so the coordinator sees it first. */
  conflictLabel?: string | null;
}

export interface ScheduleCandidatesResponse {
  /** Submitted for this shift. Offered first and assignable in one action. */
  available: ScheduleCandidate[];
  /** Everyone else eligible. Assigning one is recorded as an override. */
  others: ScheduleCandidate[];
}

export interface CreateScheduleRequest {
  windowId: string;
}

export interface CreateScheduleAssignmentRequest {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  slot: number;
  userId: string;
  /** Required when the window defines roles; rejected when it defines none. */
  roleId?: string | null;
}

/** Keep hand-placed people, or start again from availability. */
export type AutofillMode = 'EMPTY' | 'REPLACE';

export interface AutofillScheduleRequest {
  mode?: AutofillMode;
  /** Prefer whoever has fewest duties so far in this window. Default true. */
  fairness?: boolean;
}

export interface AutofillReport {
  placed: number;
  /** Slots still open afterwards. */
  unfilled: number;
  /** Shifts left without a driver for every vehicle. */
  shiftsWithoutDriver: number;
}

/** One published duty, as the person it belongs to sees it. */
export interface MyDuty {
  id: string;
  scheduleId: string;
  windowId: string;
  windowCategory: AvailabilityWindowCategory;
  windowLabel: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  slot: number;
  startMinute: number;
  endMinute: number;
  label: string;
  vehiclesNeeded: number;
  roleName?: string | null;
}

/** `GET /schedules/me` — published duties only, split around today. */
export interface MyDutiesResponse {
  upcoming: MyDuty[];
  past: MyDuty[];
}

/** Whether a role may take one more person on a shift. */
export function roleCanTakeMore(
  role: Pick<AvailabilityWindowRole, 'maxPeople'>,
  currentCount: number,
): boolean {
  if (role.maxPeople === UNLIMITED_ROLE_PEOPLE) return true;
  return currentCount < role.maxPeople;
}

/**
 * Certified drivers among the people on a shift — in *any* role, not only the
 * driver post.
 *
 * The two rules are deliberately separate: `maxPeople` caps a role, while
 * `vehiclesNeeded` says how many people on the shift must be able to drive. A
 * shift crewing two vehicles in a window whose `Driver` role holds one person
 * is covered when the second certified driver sits in another role.
 */
export function assignedDriverCount(
  assignments: Array<{ user: Pick<SchedulePerson, 'isDriver'> }>,
): number {
  return assignments.filter((assignment) => assignment.user.isDriver).length;
}

/**
 * Everything missing from one shift, in the order a reader cares about: a
 * vehicle nobody can drive first, then each role short of its people.
 */
export function shiftGaps({
  vehiclesNeeded,
  roles,
  assignments,
}: {
  vehiclesNeeded: number;
  roles: AvailabilityWindowRole[];
  assignments: Array<{ roleId?: string | null; user: Pick<SchedulePerson, 'isDriver'> }>;
}): ScheduleGap[] {
  const gaps: ScheduleGap[] = [];

  const drivers = assignedDriverCount(assignments);
  if (vehiclesNeeded > 0 && drivers < vehiclesNeeded) {
    gaps.push({ kind: 'MISSING_DRIVER', missing: vehiclesNeeded - drivers });
  }

  if (roles.length === 0) {
    if (assignments.length === 0) {
      gaps.push({ kind: 'EMPTY_SHIFT', missing: 1 });
    }
    return gaps;
  }

  for (const role of roles) {
    // An unlimited role is a pool, not a post: it cannot be short.
    if (role.maxPeople === UNLIMITED_ROLE_PEOPLE) continue;
    const filled = assignments.filter((assignment) => assignment.roleId === role.id).length;
    if (filled < role.maxPeople) {
      gaps.push({
        kind: 'ROLE_SHORT',
        roleId: role.id,
        roleName: role.name,
        missing: role.maxPeople - filled,
      });
    }
  }

  return gaps;
}

/** Whether two shifts on the same day share any minute of the clock. */
export function shiftsOverlap(a: ShiftTimes, b: ShiftTimes): boolean {
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

/** Slots a shift asks for: the sum of its finite roles, or 1 for a role-less window. */
export function requiredSlotsForShift(roles: AvailabilityWindowRole[]): number {
  if (roles.length === 0) return 1;
  return roles.reduce(
    (total, role) => total + (role.maxPeople === UNLIMITED_ROLE_PEOPLE ? 0 : role.maxPeople),
    0,
  );
}

/** Headline numbers for a whole board, computed the same way everywhere. */
export function scheduleFillStats(
  days: ScheduleDayBoard[],
  roles: AvailabilityWindowRole[],
): ScheduleFillStats {
  let requiredSlots = 0;
  let filledSlots = 0;
  let shiftsWithGaps = 0;
  let overrideCount = 0;

  const perShift = requiredSlotsForShift(roles);

  for (const day of days) {
    for (const shift of day.shifts) {
      requiredSlots += perShift;
      filledSlots += shift.assignments.length;
      if (shift.gaps.length > 0) shiftsWithGaps += 1;
      overrideCount += shift.assignments.filter((a) => a.isOverride).length;
    }
  }

  return { requiredSlots, filledSlots, shiftsWithGaps, overrideCount };
}

/** e.g. "3 of 4 people" / "no gaps". Short enough for a chip. */
export function formatGap(gap: ScheduleGap): string {
  switch (gap.kind) {
    case 'MISSING_DRIVER':
      return gap.missing === 1
        ? 'No driver for the vehicle'
        : `${gap.missing} drivers short for the vehicles`;
    case 'ROLE_SHORT':
      return gap.missing === 1
        ? `${gap.roleName}: 1 person short`
        : `${gap.roleName}: ${gap.missing} people short`;
    case 'EMPTY_SHIFT':
      return 'Nobody assigned';
    default:
      return 'Not fully crewed';
  }
}
