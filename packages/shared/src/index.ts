// ─── User ────────────────────────────────────────────────────────────────────

export enum UserRole {
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
  EMERGENCY_OPERATIONAL = 'EMERGENCY_OPERATIONAL',
  EMERGENCY_COORDINATOR = 'EMERGENCY_COORDINATOR',
  LOGISTICS_COORDINATOR = 'LOGISTICS_COORDINATOR',
  /**
   * Runs the non-urgent patient transport operation (#219, #225): referral
   * intake, patients, treatment plans and trip planning. Additive, not a
   * replacement for `EMERGENCY_COORDINATOR` — the same person commonly holds
   * both at Campo, and the two capability sets stay separate even then.
   */
  TRANSPORT_COORDINATOR = 'TRANSPORT_COORDINATOR',
}

/**
 * `displayName`/`description` lived here until #180 phase 2 — removed rather
 * than translated in place, because nothing needed an English fallback for
 * them (unlike `AVAILABILITY_WINDOW_CATEGORY_METADATA`'s `label`, which the
 * backend still builds an English exception message from). The frontend's
 * own catalogue now owns both: `accountRole.<ROLE>` and
 * `accountRoleDescription.<ROLE>` in `i18n/labels.ts`. `domain` stays here —
 * it groups roles for permission logic, not for display.
 */
export interface RoleMetadata {
  domain: string;
}

export const ROLE_METADATA: Record<UserRole, RoleMetadata> = {
  [UserRole.SYSTEM_ADMIN]: { domain: 'system' },
  [UserRole.EMERGENCY_OPERATIONAL]: { domain: 'emergency' },
  [UserRole.EMERGENCY_COORDINATOR]: { domain: 'emergency' },
  [UserRole.LOGISTICS_COORDINATOR]: { domain: 'logistics' },
  [UserRole.TRANSPORT_COORDINATOR]: { domain: 'transports' },
};

/**
 * The roles a brand-new account gets when none are specified. One place so
 * the Prisma column default, `UsersService.create` and the seeds cannot
 * drift apart.
 */
export const DEFAULT_USER_ROLES: readonly UserRole[] = [UserRole.EMERGENCY_OPERATIONAL];

/**
 * A person holds a *set* of roles — a Coordinator may also be an Admin, an
 * Admin may also be Operational — but plenty of call sites
 * (`availabilityEligibleRoles()`, the permission matrix test, a single-role
 * fixture) still reason about one role at a time. Widening `hasPermission`
 * to accept either shape here is what keeps multi-role from touching every
 * call site that only ever checks one role.
 */
export type RoleOrRoles = UserRole | readonly UserRole[];

/**
 * `typeof === 'string'` rather than `Array.isArray`: `UserRole` is a string
 * enum, so this narrows cleanly in both branches, which `Array.isArray`
 * does not do for a `readonly` array in a union.
 */
export function toRoleList(roles: RoleOrRoles): readonly UserRole[] {
  return typeof roles === 'string' ? [roles] : roles;
}

/**
 * Deduplicated and put in `UserRole` declaration order.
 *
 * The set of roles a person holds is unordered as a domain concept — there
 * is no primary role — so a canonical *storage* order is what stops the
 * profile audit trail (`recordProfileChanges`, which compares
 * `String(value)`) from recording a change every time a form hands the same
 * set back in a different order.
 */
export function normalizeRoles(roles: readonly UserRole[]): UserRole[] {
  const held = new Set(roles);
  return (Object.values(UserRole) as UserRole[]).filter((role) => held.has(role));
}

/** Order-insensitive, duplicate-insensitive set equality. */
export function sameRoleSet(a: readonly UserRole[], b: readonly UserRole[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size !== right.size) return false;
  for (const role of left) if (!right.has(role)) return false;
  return true;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export enum Action {
  /** Account level: email, role, password, create/delete. Admin only. */
  MANAGE_USERS = 'MANAGE_USERS',
  VIEW_USERS = 'VIEW_USERS',
  /**
   * Personnel level: profile fields, certifications, and the active flag.
   * Split from `MANAGE_USERS` so a coordinator can enable/disable someone and
   * keep their certifications current without also being able to change their
   * email, role or password.
   */
  MANAGE_PERSONNEL = 'MANAGE_PERSONNEL',
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
  /** File a report for an activity you were on, and edit your own. */
  CREATE_EVENT_REPORT = 'CREATE_EVENT_REPORT',
  /**
   * Read every report, not only the ones you attended. Held by every role —
   * the archive is organisation-wide reading, same as the schedule list —
   * so this is really "may read the `/event-reports` list route" rather than
   * a privilege some roles lack. `MANAGE_EVENT_REPORTS` is the actual
   * boundary: editing someone else's report.
   */
  VIEW_EVENT_REPORTS = 'VIEW_EVENT_REPORTS',
  /** Edit anyone's filed report. */
  MANAGE_EVENT_REPORTS = 'MANAGE_EVENT_REPORTS',
  /** Maintain the hospital list a report's transport destination comes from. */
  MANAGE_HOSPITALS = 'MANAGE_HOSPITALS',
  /**
   * Read the board of emergencies currently being run.
   *
   * Oversight only. There is deliberately no matching "write" action: field
   * crew already carry `CREATE_EVENT_REPORT`, which is the "I am the crew"
   * capability, and a live run is the report before it is finished.
   */
  VIEW_LIVE_RUNS = 'VIEW_LIVE_RUNS',
  /**
   * Review the queue: approve or correct anyone's volunteer-hours entry.
   * Logging and viewing your *own* hours needs no action at all — those
   * routes are self-scoped, the same way `GET /schedules/me` is.
   */
  MANAGE_VOLUNTEER_HOURS = 'MANAGE_VOLUNTEER_HOURS',
  /** Read the aggregated volunteer-hours summary, without the review queue. */
  VIEW_VOLUNTEER_HOURS = 'VIEW_VOLUNTEER_HOURS',
  /**
   * Create/deactivate operational notices, view their read/acknowledgement
   * history, and set the org-wide default delivery channels per notification
   * type. Reading a notice targeted at you needs no action — that's
   * self-scoped, the same way reading your own volunteer hours is.
   */
  MANAGE_NOTICES = 'MANAGE_NOTICES',
  /**
   * Set an ambulance's operational status on INEM's own portal (#211). Kept
   * separate from `EMERGENCY_OPERATION` because it is "speaks to INEM on the
   * delegation's behalf", not "runs emergencies" — every action collapses
   * onto one shared INEM identity, so this is a narrower, more consequential
   * capability than ordinary emergency operation.
   */
  MANAGE_INEM_STATUS = 'MANAGE_INEM_STATUS',
  /**
   * Clear a tripped INEM session circuit breaker (#211) — the manual
   * recovery step a `FAILED` session otherwise needs done by hand against
   * the database. Deliberately narrower than `MANAGE_INEM_STATUS`: every
   * crew member sets their own unit's status, but re-arming the one shared
   * INEM identity after INEM itself rejected a request is a coordinator/admin
   * call, not a field one.
   */
  RESET_INEM_SESSION = 'RESET_INEM_SESSION',
  /**
   * See or set who is paid vs. volunteering for a shift — employment
   * contracts, and `ScheduleAssignment.compensation` (the rework that
   * replaced #223's blanket `User.isPaidStaff` flag and #245's
   * `PaidStaffSchedule`-only gate). Split from `MANAGE_SCHEDULES`: building
   * the rota and knowing who on it gets paid are different jobs, and one
   * person's pay is not something every colleague who can see the rota
   * should also see — see `generatesVolunteerHours`/
   * `resolveAssignmentCompensation` for the rule this gates.
   */
  MANAGE_COMPENSATION = 'MANAGE_COMPENSATION',
  /** Enter referrals and accept or reject them (#219, #225). */
  MANAGE_TRANSPORT_REQUESTS = 'MANAGE_TRANSPORT_REQUESTS',
  /**
   * Create and edit patient records — profile, mobility, default address,
   * reference contact. Deliberately does **not** include reading the sealed
   * identity blob; see `VIEW_PATIENT_IDENTITY`.
   */
  MANAGE_PATIENTS = 'MANAGE_PATIENTS',
  /**
   * Open a patient's sealed identity blob. Deliberately not implied by
   * `MANAGE_PATIENTS` or by ordinary transport operation — the same
   * narrower-than-its-neighbour shape as `MANAGE_INEM_STATUS` next to
   * `EMERGENCY_OPERATION`.
   */
  VIEW_PATIENT_IDENTITY = 'VIEW_PATIENT_IDENTITY',
  /** Create and edit treatment plans — recurrence, destination, validity period. */
  MANAGE_TREATMENT_PLANS = 'MANAGE_TREATMENT_PLANS',
  /**
   * Build the day's trips: assign legs to a vehicle and crew, sequence
   * stops. Reading one's own assigned trips needs no action — self-scoped,
   * the same way `GET /schedules/me` is.
   */
  PLAN_TRANSPORT_TRIPS = 'PLAN_TRANSPORT_TRIPS',
  /**
   * Delegation-wide transport configuration: occurrence-type duration
   * floors, arrival-window thresholds, organisations and agreements.
   */
  MANAGE_TRANSPORT_CONFIG = 'MANAGE_TRANSPORT_CONFIG',
}

export const ROLE_PERMISSIONS: Record<UserRole, Action[]> = {
  [UserRole.SYSTEM_ADMIN]: Object.values(Action) as Action[],
  [UserRole.EMERGENCY_OPERATIONAL]: [
    Action.EMERGENCY_OPERATION,
    Action.VIEW_VEHICLES,
    Action.MANAGE_VEHICLE_INVENTORY,
    Action.SUBMIT_AVAILABILITY,
    Action.CREATE_EVENT_REPORT,
    // The archive is org-wide reading; only editing someone else's report
    // needs `MANAGE_EVENT_REPORTS`.
    Action.VIEW_EVENT_REPORTS,
    // The crew on shift is who actually knows a unit is out of service.
    Action.MANAGE_INEM_STATUS,
  ],
  [UserRole.EMERGENCY_COORDINATOR]: [
    Action.EMERGENCY_OPERATION,
    Action.MANAGE_EMERGENCY_CONFIG,
    Action.VIEW_USERS,
    Action.MANAGE_PERSONNEL,
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
    Action.CREATE_EVENT_REPORT,
    Action.VIEW_EVENT_REPORTS,
    Action.MANAGE_EVENT_REPORTS,
    // The hospital list is report configuration, kept by whoever reads the
    // reports — the same hand that keeps the holiday table.
    Action.MANAGE_HOSPITALS,
    // Watching runs in progress is the coordinator's half of live mode; the
    // crew's half needs no new capability.
    Action.VIEW_LIVE_RUNS,
    // Reviewing hours is the coordinator's half of the same job that builds
    // the schedule those hours are generated from.
    Action.MANAGE_VOLUNTEER_HOURS,
    Action.VIEW_VOLUNTEER_HOURS,
    Action.MANAGE_NOTICES,
    Action.MANAGE_INEM_STATUS,
    Action.RESET_INEM_SESSION,
    // The coordinator who assigns the crew is the one who decides whether an
    // off-clock assignment was paid extra.
    Action.MANAGE_COMPENSATION,
  ],
  [UserRole.LOGISTICS_COORDINATOR]: [
    Action.MANAGE_LOGISTICS,
    Action.MANAGE_VEHICLES,
    Action.VIEW_VEHICLES,
    Action.MANAGE_VEHICLE_INVENTORY,
    Action.MANAGE_NOTICES,
    // The archive is org-wide reading, same as for every other role — see
    // `VIEW_EVENT_REPORTS`'s doc comment above.
    Action.VIEW_EVENT_REPORTS,
    // Deliberately no transport actions (#225). LOGISTICS_COORDINATOR covers
    // fleet/inventory logistics, not the patient transport operation — the
    // two are separate on purpose, same as EMERGENCY_COORDINATOR and
    // TRANSPORT_COORDINATOR below.
  ],
  [UserRole.TRANSPORT_COORDINATOR]: [
    Action.MANAGE_TRANSPORT_REQUESTS,
    Action.MANAGE_PATIENTS,
    Action.VIEW_PATIENT_IDENTITY,
    Action.MANAGE_TREATMENT_PLANS,
    Action.PLAN_TRANSPORT_TRIPS,
    Action.MANAGE_TRANSPORT_CONFIG,
  ],
};

/**
 * Does this person hold `action`?
 *
 * Permissions are the **union** across every role held — two roles never
 * subtract from each other, and there is no precedence to resolve. Takes a
 * single role too, so the matrix test and the eligibility helpers keep
 * reading one role at a time.
 *
 * `SYSTEM_ADMIN` anywhere in the set short-circuits to true — it is defined
 * as "every `Action`", and keeping it a short-circuit rather than a table
 * lookup means a newly added `Action` is admin-reachable the moment it
 * exists.
 */
export function hasPermission(roles: RoleOrRoles, action: Action): boolean {
  const held = toRoleList(roles);
  if (held.includes(UserRole.SYSTEM_ADMIN)) return true;
  return held.some((role) => (ROLE_PERMISSIONS[role] ?? []).includes(action));
}

export enum AuthProvider {
  LOCAL = 'LOCAL',
  GOOGLE = 'GOOGLE',
  MICROSOFT = 'MICROSOFT',
}

export enum BloodType {
  A_POS = 'A_POS',
  A_NEG = 'A_NEG',
  B_POS = 'B_POS',
  B_NEG = 'B_NEG',
  AB_POS = 'AB_POS',
  AB_NEG = 'AB_NEG',
  O_POS = 'O_POS',
  O_NEG = 'O_NEG',
}

export const BLOOD_TYPE_LABEL: Record<BloodType, string> = {
  [BloodType.A_POS]: 'A+',
  [BloodType.A_NEG]: 'A-',
  [BloodType.B_POS]: 'B+',
  [BloodType.B_NEG]: 'B-',
  [BloodType.AB_POS]: 'AB+',
  [BloodType.AB_NEG]: 'AB-',
  [BloodType.O_POS]: 'O+',
  [BloodType.O_NEG]: 'O-',
};

/**
 * The two languages the app ships. A primary-subtag match: `pt-PT`/`pt-BR` →
 * `pt`, `en-US`/`en-GB` → `en`, anything else → `pt`. Content is European
 * Portuguese; the code does not encode the region — see #180.
 */
export type Locale = 'pt' | 'en';

export const LOCALES: readonly Locale[] = ['pt', 'en'];

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  /**
   * Every role this person holds — unordered, no primary. Permissions are
   * the union across the set; see `hasPermission`. Always non-empty.
   */
  roles: UserRole[];
  provider: AuthProvider;
  isActive: boolean;
  /**
   * Certified driver. Computed from holding a valid `DRIVER` certification —
   * there is no `isDriver` column; see the `── Certifications ──` section.
   */
  isDriver: boolean;
  /**
   * Derived: holds a valid TAT or TAS. This is *readiness*, not *access* —
   * `isActive` alone gates login; an inactive person or one whose
   * certification lapsed keeps their account but stops appearing in
   * scheduling and availability pickers.
   */
  isActiveEmergencyOperational: boolean;
  createdAt: string;
  updatedAt: string;

  // ─── Personnel profile ───────────────────────────────────────────────────
  // Present on `/users` (coordinator/admin) and `/users/me/profile` (self).
  // Absent from the narrow roster/picker shapes (`SchedulePerson` and
  // friends), which is the actual privacy boundary — those endpoints are not
  // gated by `VIEW_USERS`/`MANAGE_PERSONNEL` and must never carry this data.
  phone?: string | null;
  /** ISO date, `YYYY-MM-DD`. */
  birthDate?: string | null;
  /** ISO date, `YYYY-MM-DD`. When the person joined the delegation. */
  joinedOn?: string | null;
  addressLine?: string | null;
  postalCode?: string | null;
  localityId?: string | null;
  locality?: Locality | null;
  /** Assigned by the delegation; not self-editable. */
  redCrossNumber?: string | null;
  /** Optional, manually assigned by a coordinator; not self-editable. */
  volunteerNumber?: string | null;
  /**
   * The person's full legal name, for administrative use only — insurance
   * forms, certificates, official correspondence. Not self-editable, and
   * never a display substitute for `firstName`/`lastName`: every screen in
   * the app keeps showing those two, everywhere, regardless of whether this
   * is filled in.
   */
  fullName?: string | null;
  nif?: string | null;
  citizenCardNumber?: string | null;
  bloodType?: BloodType | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  photoFilename?: string | null;
  photoMimeType?: string | null;
  photoByteSize?: number | null;
  /** Convenience: whether a photo exists, without exposing its storage key. */
  hasPhoto?: boolean;
  /** Held certifications only — see `effectiveCertifications` for what they grant. */
  certifications?: UserCertification[];
  /**
   * The language chosen on the profile page. `null` means never chosen — the
   * browser decides, falling back to Portuguese. Never write a detected
   * locale back here; only an explicit choice belongs in this field.
   */
  locale?: Locale | null;
}

/**
 * Someone whose birthday falls today — deliberately *only* a name.
 *
 * `birthDate` itself is a sensitive personnel field (it is audited as one:
 * see `UserProfileAudit` in the Prisma schema), so the birthday endpoint
 * never returns the date or the year. Day-and-month is the whole point of
 * the card; the age is nobody else's business, and not sending it is what
 * lets `GET /users/birthdays` stay readable by the whole delegation instead
 * of being gated behind `MANAGE_PERSONNEL`.
 */
export interface BirthdayPerson {
  id: string;
  firstName: string;
  lastName: string;
}

/** `GET /users/birthdays` — active people only, empty on an ordinary day. */
export interface BirthdaysTodayResponse {
  /** The date this was computed for, ISO `YYYY-MM-DD`. */
  date: string;
  people: BirthdayPerson[];
}

/**
 * Whether `birthDate` (ISO `YYYY-MM-DD`) falls on `onDate` — day and month
 * only, so the year on file is never consulted beyond being parsed off.
 *
 * Compared as plain strings rather than through `Date`, because both sides
 * are calendar dates: building a `Date` would drag the reader's timezone in
 * and move a birthday across midnight for anyone east or west of the server.
 *
 * 29 February is celebrated on 28 February in a non-leap year. The
 * alternative — skipping the person three years in four — is the one
 * behaviour a birthday card must not have.
 */
export function isBirthdayOn(birthDate: string, onDate: string): boolean {
  const born = birthDate.slice(5, 10);
  const on = onDate.slice(5, 10);
  if (born === on) return true;
  if (born !== '02-29') return false;
  return on === '02-28' && !isLeapYear(Number(onDate.slice(0, 4)));
}

/** Proleptic Gregorian, the same rule `Date.UTC` applies. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// ─── Certifications ──────────────────────────────────────────────────────────

/**
 * The four operational certifications the delegation tracks. `DRIVER` is an
 * autonomous certification — vehicle-driving authority, unrelated to crew
 * role. The other three form a ladder: TAS (Tripulante de Ambulância de
 * Socorro) implies TAT (Tripulante de Ambulância de Transporte), which
 * implies SBV (Suporte Básico de Vida).
 */
export enum CertificationType {
  DRIVER = 'DRIVER',
  SBV = 'SBV',
  TAT = 'TAT',
  TAS = 'TAS',
}

export const CERTIFICATION_TYPES: readonly CertificationType[] = [
  CertificationType.DRIVER,
  CertificationType.SBV,
  CertificationType.TAT,
  CertificationType.TAS,
];

export const CERTIFICATION_LABEL: Record<CertificationType, string> = {
  [CertificationType.DRIVER]: 'Driver',
  [CertificationType.SBV]: 'SBV',
  [CertificationType.TAT]: 'TAT',
  [CertificationType.TAS]: 'TAS',
};

/**
 * Transitive closure of what holding one certification also grants — see the
 * doc comment on `CertificationType`. `DRIVER` and `SBV` grant nothing beyond
 * themselves.
 */
export const CERTIFICATION_IMPLIES: Record<CertificationType, CertificationType[]> = {
  [CertificationType.DRIVER]: [],
  [CertificationType.SBV]: [],
  [CertificationType.TAT]: [CertificationType.SBV],
  [CertificationType.TAS]: [CertificationType.TAT, CertificationType.SBV],
};

/**
 * How far ahead an expiring certification is flagged — six months, per the
 * PO. Applies uniformly to every certification type.
 */
export const CERTIFICATION_EXPIRY_WARNING_DAYS = 183;

export type CertificationStatus = 'VALID' | 'EXPIRING' | 'EXPIRED';

/** The minimum a certification needs to reason about: what it is, and until when. */
export interface HeldCertification {
  type: CertificationType;
  /** ISO date, `YYYY-MM-DD`. Null = no known expiry — counts as valid. */
  validUntil: string | null;
}

/** A certification actually awarded to a person — the record a coordinator maintains. */
export interface UserCertification extends HeldCertification {
  id: string;
  userId: string;
  /** ISO date, `YYYY-MM-DD`. */
  issuedOn?: string | null;
  notes?: string | null;
  hasDocument: boolean;
  filename?: string | null;
  mimeType?: string | null;
  byteSize?: number | null;
  createdById: string;
  createdBy?: { id: string; firstName: string; lastName: string } | null;
  createdAt: string;
  updatedAt: string;
}

/** Whole days between two ISO dates (`to` minus `from`); negative if `to` is earlier. */
function daysBetweenIsoDates(from: string, to: string): number {
  const fromMs = new Date(`${from}T00:00:00.000Z`).getTime();
  const toMs = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.round((toMs - fromMs) / 86_400_000);
}

/**
 * `validUntil: null` means no known expiry and counts as `VALID` — what the
 * `isDriver` migration writes, and what a certification looks like before a
 * coordinator has entered its real date. Never render that as if the date
 * were confirmed; say plainly that none is on file.
 */
export function certificationStatus(
  validUntil: string | null,
  today: string,
): CertificationStatus {
  if (!validUntil) return 'VALID';
  if (validUntil < today) return 'EXPIRED';
  const daysLeft = daysBetweenIsoDates(today, validUntil);
  return daysLeft <= CERTIFICATION_EXPIRY_WARNING_DAYS ? 'EXPIRING' : 'VALID';
}

/** Held or implied, with the certificate that granted it. */
export interface EffectiveCertification {
  type: CertificationType;
  validUntil: string | null;
  /** === `type` when held directly; the granting certification otherwise. */
  grantedBy: CertificationType;
  status: CertificationStatus;
}

/** Whether `a` is a later expiry than `b` — `null` (no known expiry) beats every date. */
function isFurtherExpiry(a: string | null, b: string | null): boolean {
  if (a === null) return b !== null;
  if (b === null) return false;
  return a > b;
}

/**
 * Every certification a person effectively has: what they were awarded, plus
 * what each of those grants — one entry per type, resolved to whichever
 * source has the furthest expiry.
 *
 * "Best source wins": a person may hold a lapsed TAS *and* a current TAT. For
 * each effective type this picks the granting certificate with the furthest
 * `validUntil`, so a stale TAS never masks a valid TAT held in its own right.
 */
export function effectiveCertifications(
  held: HeldCertification[],
  today: string,
): EffectiveCertification[] {
  const bestSource = new Map<CertificationType, { grantedBy: CertificationType; validUntil: string | null }>();

  const consider = (type: CertificationType, source: HeldCertification) => {
    const current = bestSource.get(type);
    if (!current || isFurtherExpiry(source.validUntil, current.validUntil)) {
      bestSource.set(type, { grantedBy: source.type, validUntil: source.validUntil });
    }
  };

  for (const cert of held) {
    consider(cert.type, cert);
    for (const granted of CERTIFICATION_IMPLIES[cert.type] ?? []) {
      consider(granted, cert);
    }
  }

  return Array.from(bestSource.entries()).map(([type, { grantedBy, validUntil }]) => ({
    type,
    validUntil,
    grantedBy,
    status: certificationStatus(validUntil, today),
  }));
}

/** Whether a person currently holds a given certification — directly or granted, not expired. */
export function holdsCertification(
  held: HeldCertification[],
  type: CertificationType,
  today: string,
): boolean {
  const effective = effectiveCertifications(held, today).find((cert) => cert.type === type);
  return effective !== undefined && effective.status !== 'EXPIRED';
}

/**
 * What qualifies a user as an emergency operational: a valid TAT or TAS.
 * Independent of `UserRole`, which is purely about access — see the doc
 * comment on `User.isActiveEmergencyOperational`.
 */
export function isActiveEmergencyOperational(held: HeldCertification[], today: string): boolean {
  return (
    holdsCertification(held, CertificationType.TAT, today) ||
    holdsCertification(held, CertificationType.TAS, today)
  );
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

/** `GET /health/version` — the commit this backend was built from, for the About dialog. */
export interface AppVersionInfo {
  /** Short commit sha (e.g. `sha-a1b2c3d4`), or `'dev'` outside a CI-built image. */
  commit: string;
  /** ISO 8601 commit date, or `null` outside a CI-built image. */
  commitDate: string | null;
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

/**
 * Collapses a licence plate to bare upper-cased alphanumerics — `"80-PS-45"`
 * and `"80PS45"` normalize to the same key. `Vehicle.licensePlate` is always
 * stored dashed (see `PT_LICENSE_PLATE_REGEX`); external sources don't
 * necessarily agree — INEM's own `CarID` (`INEMUnit.carId`, see the INEM
 * integration section below) comes back dashless. Join on this, never on the
 * raw strings, or the same vehicle silently fails to match.
 */
export const normalizeLicensePlate = (plate: string): string => plate.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Upper bounds for `Vehicle`'s physical-configuration fields (#221) — sanity
 * caps on manual entry, not a real-world fleet limit. Shared so the frontend
 * form and the backend DTO enforce the same numbers.
 */
export const MAX_VEHICLE_SEATED_CAPACITY = 20;
export const MAX_VEHICLE_WHEELCHAIR_POSITIONS = 4;
export const MAX_VEHICLE_STRETCHER_POSITIONS = 4;

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
  /** Seats for ambulatory passengers. */
  seatedCapacity: number;
  /** 0, 1 or 2 depending on the vehicle — a hard constraint on which patients can share a trip. */
  wheelchairPositions: number;
  stretcherPositions: number;
  hasRampOrLift: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  maintenanceEntries?: MaintenanceEntry[];
}

// ─── Vehicle occupancy ──────────────────────────────────────────────────────────

/**
 * Where a `VehicleOccupancy` interval came from (#222). The fleet is one
 * pool — transport vehicles cover non-emergency events and emergency
 * ambulances can cover everything — so occupancy is tracked once, outside
 * every transport-specific module, and this is the single answer to "is
 * vehicle X free at time Y?" for the whole platform.
 */
export enum VehicleOccupancySource {
  SCHEDULE_SHIFT = 'SCHEDULE_SHIFT',
  TRANSPORT_TRIP = 'TRANSPORT_TRIP',
  MAINTENANCE = 'MAINTENANCE',
  SUPPORT_EVENT = 'SUPPORT_EVENT',
}

/**
 * One interval during which a named vehicle is committed, whatever the
 * source. Written through from its source row — never maintained by hand —
 * so `(source, sourceId)` always points back to the record that created it.
 */
export interface VehicleOccupancy {
  id: string;
  vehicleId: string;
  startsAt: string;
  endsAt: string;
  source: VehicleOccupancySource;
  sourceId: string;
  /**
   * Set when this booking was made despite overlapping another interval for
   * the same vehicle. Conflicts are warnings a planner can override, never a
   * hard block — mirrors `ScheduleAssignment.isOverride` /
   * `certificationOverrideReason`.
   */
  overrideReason?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Inventory ─────────────────────────────────────────────────────────────────

export enum InventoryItemType {
  COUNTABLE = 'COUNTABLE',
  UNLIMITED = 'UNLIMITED',
}

/// The catalogue of physical items that can be stocked on a vehicle or
/// consumed during an event report. One `MaterialItem` per real-world item
/// type, shared across every vehicle's template.
export interface MaterialItem {
  id: string;
  namePt: string;
  nameEn?: string | null;
  unit: string;
  type: InventoryItemType;
  notes?: string | null;
  isFrequent: boolean;
  frequentOrder: number;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  barcodes?: MaterialItemBarcode[];
}

/// A barcode (EAN/GS1, etc.) identifying a `MaterialItem`. One item may
/// carry several codes — different manufacturers or box sizes for the same
/// catalogue entry.
export interface MaterialItemBarcode {
  id: string;
  materialItemId: string;
  code: string;
  label?: string | null;
}

/**
 * The single place locale fallback for a material's display name is
 * decided: `nameEn` for `en` when set, otherwise `namePt`.
 */
export function materialItemDisplayName(
  item: Pick<MaterialItem, 'namePt' | 'nameEn'>,
  locale: Locale,
): string {
  if (locale === 'en' && item.nameEn) return item.nameEn;
  return item.namePt;
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
  /// Nullable during the catalogue migration — see `materialItemDisplayName`
  /// and the `20260828141009_material_catalogue` migration.
  materialItemId?: string | null;
  materialItem?: MaterialItem | null;
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
  /// Set when a `StockMovement` deduction floored this item at zero — the
  /// crew spent more than the sheet said was on board. Cleared by a manual
  /// recount (`upsert`/`update`/CSV import), never by another consumption.
  needsRecount: boolean;
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

export enum StockMovementReason {
  CONSUMPTION = 'CONSUMPTION',
  MANUAL_ADJUSTMENT = 'MANUAL_ADJUSTMENT',
  IMPORT = 'IMPORT',
  CORRECTION = 'CORRECTION',
}

/// A single stock delta — the movement ledger behind a vehicle's item count.
/// `delta` is negative for consumption, positive for a manual/import top-up,
/// and is always the *requested* amount, even when the resulting
/// `VehicleInventoryItem.actualQuantity` floors at zero (see `needsRecount`
/// above): the ledger stays truthful about what was spent regardless of what
/// the sheet had room to record.
export interface StockMovement {
  id: string;
  vehicleId: string;
  materialItemId: string;
  materialItem?: MaterialItem;
  delta: number;
  reason: StockMovementReason;
  /// The event report this consumption came from — null for manual/import/
  /// correction movements.
  reportId?: string | null;
  actorId?: string | null;
  /// Resolved by `StockMovementsService.findByVehicle` — null for a system
  /// movement or when the acting user has since been deleted.
  actor?: { id: string; firstName: string; lastName: string } | null;
  occurredAt: string;
  note?: string | null;
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

/**
 * The duration of a `[startMinute, endMinute)` span, wrapping past midnight —
 * `22:00`→`00:30` is 150 minutes, not −1290. Used wherever a person enters a
 * time-of-day span rather than typing a duration directly (manual
 * volunteer-hours entries): the times are what they remember, the minutes are
 * what gets summed.
 */
export function minutesBetweenTimes(startMinute: number, endMinute: number): number {
  const delta = endMinute - startMinute;
  return delta > 0 ? delta : delta + MINUTES_PER_DAY;
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
 * A pattern with some of its shifts' clock times replaced, for a schedule
 * that has moved them without touching the window's own grid.
 *
 * `overrides` is keyed `date#slot` (the same shape `shiftKey(date, slot)`
 * produces) so a caller can build it straight from whatever it stored the
 * correction under. Only `startMinute`/`endMinute`/`label` change — `slot`
 * and `vehiclesNeeded` are untouched, and shifts are **not re-sorted**: a
 * slot is an identity that submissions and assignments point at, so an
 * adjustment that makes slot 1 run after slot 2 must still show as slot 1's
 * row, not silently swap places with it. A key with no matching shift is
 * ignored rather than throwing — the caller may be a step behind a window
 * change that hasn't happened in practice (window shifts are never edited
 * after opening) but is cheap to tolerate.
 */
export function applyShiftOverrides<
  Shift extends ShiftDefinition,
  Day extends { date: string; shifts: Shift[] },
>(pattern: Day[], overrides: ReadonlyMap<string, ShiftTimes>): Day[] {
  if (overrides.size === 0) return pattern;
  return pattern.map((day) => ({
    ...day,
    shifts: day.shifts.map((shift) => {
      const override = overrides.get(`${day.date}#${shift.slot}`);
      if (!override) return shift;
      return {
        ...shift,
        startMinute: override.startMinute,
        endMinute: override.endMinute,
        label: formatShiftLabel(override),
      };
    }),
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
  CNE_SUPPORT = 'CNE_SUPPORT',
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
  [AvailabilityWindowCategory.CNE_SUPPORT]: {
    label: 'CNE Support',
    description: 'Cover for CNE operations.',
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
  /**
   * Fewest people this post needs filled for a shift to count as properly
   * crewed, read by volunteer-hours generation (#164) via
   * `shiftMandatoryRolesFilled`. `0` means the post is optional — someone may
   * fill it, or not, or leave mid-shift, without that blocking anything.
   * Defaults to `0` when omitted on input; once stored it is always given.
   */
  mandatoryCount?: number;
  /**
   * The certification someone must hold to be assigned here, or `null` for a
   * post with no requirement. A coordinator's choice, not derived — though
   * the editor suggests `DRIVER` for a role named "Driver" (see
   * `roleRequiresDriverCertification`). Requirements are enforceable but not
   * absolute: a coordinator may still assign someone who lacks it, recorded
   * as an override with a reason — see `ScheduleAssignment.certificationOverrideReason`.
   *
   * Optional on this base shape only as an *input*: omitted means "take the
   * name-derived suggestion" (see `toWindowRoles`). Once stored, it is always
   * resolved — `AvailabilityWindowRole` below narrows it to required.
   */
  requiredCertification?: CertificationType | null;
}

export interface AvailabilityWindowRole extends WindowRoleSpec {
  id: string;
  windowId: string;
  /** Position in the window's own list, 0-based — the order it is offered in. */
  order: number;
  /** Always resolved once stored — see the doc comment on `WindowRoleSpec`. */
  mandatoryCount: number;
  /** Always resolved once stored — see the doc comment on `WindowRoleSpec`. */
  requiredCertification: CertificationType | null;
}

/** What `maxPeople: 0` means — as many people as the coordinator assigns. */
export const UNLIMITED_ROLE_PEOPLE = 0;

/** The role whose name suggests the `DRIVER` certification by default. */
export const DRIVER_ROLE_NAME = 'Driver';

/** Guards on the role editor; not domain rules. */
export const MAX_ROLE_NAME_LENGTH = 60;
export const MAX_ROLES_PER_WINDOW = 12;
export const MAX_ROLE_PEOPLE = 20;

/**
 * Whether a role's name suggests the driver post. Matched case- and
 * space-insensitively, so "driver" typed by hand is the same post as the one
 * the Emergency defaults create. A suggestion for the editor to pre-fill —
 * see `WindowRoleSpec.requiredCertification` — not an enforced rule on its own.
 */
export function roleRequiresDriverCertification(name: string): boolean {
  return name.trim().toLowerCase() === DRIVER_ROLE_NAME.toLowerCase();
}

/**
 * The roles an Emergency window has unless the coordinator changes them: one
 * crew, one person each, as confirmed with the PO. Condutor needs the driver
 * certification, Chefe de Equipa needs TAS, Socorrista needs TAT.
 *
 * Driver and Team Leader are mandatory — a shift missing either most likely
 * did not run, so volunteer-hours generation (#164) skips it entirely. Team
 * Member is the pool seat: it may go unfilled, or be filled and then leave
 * mid-shift, without that blocking anything (see `shiftMandatoryRolesFilled`).
 */
export const DEFAULT_EMERGENCY_WINDOW_ROLES: readonly WindowRoleSpec[] = [
  {
    name: DRIVER_ROLE_NAME,
    maxPeople: 1,
    mandatoryCount: 1,
    requiredCertification: CertificationType.DRIVER,
  },
  {
    name: 'Team Leader',
    maxPeople: 1,
    mandatoryCount: 1,
    requiredCertification: CertificationType.TAS,
  },
  {
    name: 'Team Member',
    maxPeople: 1,
    mandatoryCount: 0,
    requiredCertification: CertificationType.TAT,
  },
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
    const mandatoryCount = role.mandatoryCount ?? 0;
    if (!Number.isInteger(mandatoryCount) || mandatoryCount < 0) {
      return 'The mandatory count must be a whole number, 0 or more.';
    }
    // An unlimited role (maxPeople === 0) has no ceiling to check against —
    // "at least N, no cap" is a coherent thing to ask for there.
    if (role.maxPeople !== UNLIMITED_ROLE_PEOPLE && mandatoryCount > role.maxPeople) {
      return `"${name}" cannot require more people (${mandatoryCount}) than it can hold (${role.maxPeople}).`;
    }
    if (
      role.requiredCertification !== null &&
      role.requiredCertification !== undefined &&
      !CERTIFICATION_TYPES.includes(role.requiredCertification)
    ) {
      return `"${role.requiredCertification}" is not a certification.`;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) return `Two roles are both called "${name}".`;
    seen.add(key);
  }

  return null;
}

/**
 * Trimmed, ordered, and with the driver suggestion applied — how roles are
 * stored. A coordinator's own choice of `requiredCertification` is kept as
 * given; only a role left unset (`undefined`) falls back to the name-derived
 * suggestion, so a role deliberately set to no requirement (`null`) stays that way.
 */
export function toWindowRoles(
  roles: WindowRoleSpec[],
): Array<WindowRoleSpec & { order: number; mandatoryCount: number }> {
  return roles.map((role, index) => {
    const name = role.name.trim();
    const requiredCertification =
      role.requiredCertification !== undefined
        ? role.requiredCertification
        : roleRequiresDriverCertification(name)
          ? CertificationType.DRIVER
          : null;
    return {
      name,
      maxPeople: role.maxPeople,
      mandatoryCount: role.mandatoryCount ?? 0,
      order: index,
      requiredCertification,
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
  /**
   * This window's own compensation offer, if a coordinator published one —
   * see `resolveCompensationOffer` for how it combines with a schedule's own
   * override, and `CompensationOfferKind`/`CompensationOfferFields` for what
   * each field means. Unlike `ScheduleAssignment.compensation`, this is not
   * redacted (D5 is about who on a shift gets paid, not about the rate a
   * window advertises) — it is meant to be seen by everyone, before they even
   * submit availability.
   */
  compensationKind?: CompensationOfferKind | null;
  compensationRateCents?: number | null;
  compensationAmountCents?: number | null;
  /** Free-text context for the offer, e.g. "Apoio CNE — paid by the client". */
  compensationNote?: string | null;
  compensationSetById?: string | null;
  compensationSetBy?: AvailabilityWindowActor | null;
  compensationSetAt?: string | null;
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
  /** What they hold, for checking a post's `requiredCertification` client-side. */
  certifications: HeldCertification[];
}

/**
 * How one shift of one person's time is classified for pay (Stage 1 of the
 * rework that supersedes #223's blanket `User.isPaidStaff` flag and #245's
 * binary `PAID_EXTRA` — this comment is that domain's actual, current spec,
 * not #245's).
 *
 * `VOLUNTEER` is the default and by far the common case: money must stay
 * invisible everywhere a paid arrangement does not exist, so every
 * assignment starts here — see `resolveAssignmentCompensation`.
 *
 * `SALARY` means the person was already being paid a wage for this exact
 * time under an `EmploymentContract` — see `isOnContractClock`. It is an
 * **absolute veto**: nobody, coordinator included, may explicitly
 * reclassify on-contract-clock time to `VOLUNTEER` or `PAID` — crediting
 * volunteer hours or an extra stipend on top of a salary already being paid
 * for the same time would double-pay it either way. An explicit choice is
 * simply not consulted when the clock veto applies — see
 * `resolveAssignmentCompensation`'s own rule.
 *
 * `PAID` is a coordinator's explicit call that one *off-clock* assignment
 * was extra paid work rather than volunteering (Apoio Local, Apoio CNE, an
 * emergency covered on a day off) — the case #223/#245 could not represent
 * because the paid/volunteer choice was locked to a person-level flag
 * rather than editable per assignment.
 *
 * Whichever it resolves to, `generatesVolunteerHours` says whether a
 * `VolunteerHoursEntry` is produced from it — only `VOLUNTEER` does.
 *
 * Materialised at write (`ScheduleAssignment.compensation`), never derived
 * at read: a later contract edit must never retroactively reclassify a past
 * shift.
 */
export enum AssignmentCompensationKind {
  VOLUNTEER = 'VOLUNTEER',
  SALARY = 'SALARY',
  PAID = 'PAID',
}

/**
 * Whether `kind` produces a `VolunteerHoursEntry` at all. Only `VOLUNTEER`
 * does — `SALARY` is already paid via wage, and `PAID` is paid a different
 * way; crediting volunteer hours on top of either would double-count the
 * same time.
 */
export function generatesVolunteerHours(kind: AssignmentCompensationKind): boolean {
  return kind === AssignmentCompensationKind.VOLUNTEER;
}

/**
 * The one place `AssignmentCompensationKind` gets decided (D1–D3 of the
 * paid-staff rework). `onContractClock` is an absolute veto — see the enum's
 * own doc comment — checked before, and instead of, `explicit`: an
 * explicit `VOLUNTEER` set by a coordinator must never beat a `SALARY`
 * resolution, which is exactly the bug this ordering avoids. Only once the
 * clock veto does not apply does `explicit` get to speak at all, and even
 * then it defaults to `VOLUNTEER` — the always-safe default — when nobody
 * has classified the assignment yet.
 */
export function resolveAssignmentCompensation({
  explicit,
  onContractClock,
}: {
  explicit?: AssignmentCompensationKind | null;
  onContractClock: boolean;
}): AssignmentCompensationKind {
  if (onContractClock) return AssignmentCompensationKind.SALARY;
  return explicit ?? AssignmentCompensationKind.VOLUNTEER;
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
  /**
   * Set when this assignment was made against the post's own
   * `requiredCertification` — the person does not hold it, or holds it
   * lapsed. Distinct from `isOverride`, which is about availability, not
   * certification: the two may both apply, one, or neither. Every
   * requirement is overridable this way, the driver post included, but never
   * without a reason — see `CreateScheduleAssignmentRequest.overrideReason`.
   */
  certificationOverrideReason?: string | null;
  /**
   * How this one shift is classified for pay — see
   * `AssignmentCompensationKind`. Always resolved and stored at write time
   * (never derived at read), but **redacted from the wire entirely** for a
   * viewer without `Action.MANAGE_COMPENSATION` (D5): the key is omitted,
   * not sent null, so a plain member's own client never even sees that the
   * field exists for a colleague's assignment.
   */
  compensation?: AssignmentCompensationKind;
  /**
   * The person put themselves here, on a published schedule.
   *
   * Derived from `assignedById === userId` rather than stored. It matters for
   * how the board reads: an override is something done *to* someone, and
   * calling a volunteer's own offer of cover by that name would be wrong.
   */
  selfAssigned: boolean;
  /** Live state of the same person's submission, for display. */
  availability: AssignmentAvailability;
  assignedById: string;
  assignedBy?: AvailabilityWindowActor | null;
  assignedAt: string;
}

/**
 * A shift whose hours a coordinator moved on this schedule alone.
 *
 * The availability window's own grid is untouched — submissions were made
 * against it, so it stays the record of what people were asked about. This
 * is the board's way of saying "the times below are not the ones that were
 * asked about", which is why it carries the original rather than only a
 * flag: the board can show "19:00–24:00 (was 20:00–24:00)" without a second
 * lookup.
 */
export interface ScheduleShiftAdjustment {
  /** The window's own hours for this shift. */
  original: ShiftTimes;
  adjustedBy?: AvailabilityWindowActor | null;
  /** ISO instant. */
  adjustedAt: string;
}

/** One shift of the board: what it needs, who is on it, what is missing. */
export interface ScheduleShiftBoard extends ShiftSpec {
  slot: number;
  /** Already reflects `adjustment`, if any — the times that will be worked. */
  label: string;
  /** Set only when this shift's hours were moved for this schedule. */
  adjustment?: ScheduleShiftAdjustment | null;
  assignments: ScheduleAssignment[];
  /** Certified drivers across every role on this shift. */
  driverCount: number;
  gaps: ScheduleGap[];
  /**
   * A resolved compensation offer exists on this schedule, and at least one
   * person on this shift is still at the untouched `VOLUNTEER` default —
   * see `ScheduleFillStats.unclassifiedPaidShiftsCount`, the aggregate this
   * feeds. Same redaction as `compensation` itself: present only for a
   * viewer with `Action.MANAGE_COMPENSATION`, omitted for anyone else.
   */
  hasUnclassifiedPaidCrew?: boolean;
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

/**
 * An assignment landing on a day a `StaffAbsence` (#224) covers for the same
 * person — vacation, sick leave or other paid leave already on file. A
 * warning alongside `ScheduleConflict`, never a block: the same override
 * precedent used everywhere else (double-booking here, vehicle occupancy in
 * `VehicleOccupancy`) — a coordinator can see it and decide, but nothing
 * stops the assignment from being made.
 */
export interface ScheduleAbsenceWarning {
  userId: string;
  userName: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  slot: number;
  absenceId: string;
  kind: StaffAbsenceKind;
}

export interface ScheduleFillStats {
  /** Slots the window's roles ask for, over every shift. Unlimited roles ask for none. */
  requiredSlots: number;
  /** Assignments that count towards those slots. */
  filledSlots: number;
  /** Shifts carrying at least one gap. */
  shiftsWithGaps: number;
  overrideCount: number;
  /** Assignments made against the post's `requiredCertification`, reason and all. */
  certificationExceptionCount: number;
  /**
   * Assignments whose certification was fine when made but has since lapsed
   * — never an override (no reason was needed at the time), so counted
   * separately: something to review, not a decision anyone made.
   */
  lapsedCertificationCount: number;
  /**
   * Shifts where the resolved compensation offer (`resolveCompensationOffer`)
   * is non-null and at least one assignment is still at its untouched
   * `VOLUNTEER` default (`compensation === VOLUNTEER` and nobody has ever
   * called `setCompensation` on it) — the gap Stage 1's always-`VOLUNTEER`
   * default leaves open on a genuinely paid post. Present only for a viewer
   * who holds `Action.MANAGE_COMPENSATION`; omitted, not zero, for anyone
   * else, since they cannot act on it and cannot see `compensation` itself
   * either. Like every other figure here, this never blocks publication —
   * it is restated in `PublishDialog`, not enforced.
   */
  unclassifiedPaidShiftsCount?: number;
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
  /**
   * This schedule's own compensation offer, replacing the window's as a
   * **whole unit** when set at all (D4) — see `resolveCompensationOffer`.
   * The post-close escape hatch: a window's offer freezes once it closes
   * (submissions were made against it), but a schedule built from it may
   * still need a rate corrected, or withdrawn (`kind: NONE`), afterwards.
   * No `compensationNote` here — the window's own note is the one members
   * read before submitting; this is a coordinator-only override of the
   * figures alone.
   */
  compensationKind?: CompensationOfferKind | null;
  compensationRateCents?: number | null;
  compensationAmountCents?: number | null;
  compensationSetById?: string | null;
  compensationSetBy?: AvailabilityWindowActor | null;
  compensationSetAt?: string | null;
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
  /** Assignments landing on a day the person is on file as absent (#224). */
  absenceWarnings: ScheduleAbsenceWarning[];
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
  /**
   * Required exactly when the person does not hold the role's
   * `requiredCertification` — the API rejects the assignment without one, and
   * ignores it otherwise. Stored as `ScheduleAssignment.certificationOverrideReason`.
   */
  overrideReason?: string;
  /**
   * An explicit `VOLUNTEER`/`PAID` call for this one assignment, made at the
   * moment it is created. Ignored — never an error — when the assignee is on
   * their contract's clock for this shift: `resolveAssignmentCompensation`'s
   * veto always wins. Omit to get the default (`VOLUNTEER` off the clock).
   * Most assignments are classified later instead, via
   * `SetShiftCompensationRequest` — this field exists for the rare case a
   * coordinator already knows at assignment time.
   */
  compensation?: AssignmentCompensationKind;
}

/**
 * `PUT /schedules/:id/shifts/:date/:slot/compensation` — a coordinator's
 * classification for a whole shift's crew in one call (`MANAGE_COMPENSATION`).
 * One entry per assignment being (re)classified; an assignment left out is
 * untouched. `SALARY` is never a valid `compensation` here — it is resolved,
 * never chosen — so only `VOLUNTEER`/`PAID` are accepted, and an entry for an
 * assignee on their contract's clock is rejected rather than silently
 * dropped, since silently ignoring a coordinator's explicit instruction would
 * be worse than telling them why it didn't apply.
 */
export interface SetShiftCompensationRequest {
  assignments: Array<{
    assignmentId: string;
    compensation: AssignmentCompensationKind;
  }>;
}

/** `PUT /schedules/:id/shifts/:date/:slot` — move one shift's hours for this schedule alone. */
export interface AdjustScheduleShiftRequest extends ShiftTimes {}

/** What both the PUT and the reset DELETE answer with, so the caller can render the shift immediately. */
export interface AdjustScheduleShiftResponse {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  slot: number;
  shift: ScheduleShiftBoard;
}

/**
 * Someone putting *themselves* on a shift of a published schedule.
 *
 * No `userId`: the caller is the subject, which is what makes this safe to
 * offer to everyone rather than only to coordinators.
 */
export interface SelfAssignRequest {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  slot: number;
  /** Required when the window defines roles; rejected when it defines none. */
  roleId?: string | null;
}

/**
 * Whether a published schedule is open for someone to add themselves to a role.
 *
 * Signing up is a one-way door — a volunteer may fill an open place but not
 * vacate it — so the screens offering it check the same things the API will,
 * and say which one is in the way rather than presenting a button that fails.
 *
 * Unlike a coordinator assigning someone else, a certification requirement
 * here always blocks — self-assignment has no override, by design: only a
 * coordinator may decide to make an exception, and only with a reason.
 *
 * A shift already in the past is closed for the same reason: signing up is a
 * statement about turning out, and a rota entry added after the fact is a
 * claim about attendance, which is what volunteer hours are for. A coordinator
 * may still place someone on a past shift — correcting the record afterwards
 * is exactly their job — so `canManageSchedules` opens that door and nothing
 * else does.
 */
export function selfAssignBlockedReason({
  role,
  certifications,
  today,
  date,
  canManageSchedules = false,
  filledInRole,
  alreadyOnShift,
  overlaps,
}: {
  role: AvailabilityWindowRole | null;
  certifications: HeldCertification[];
  today: string;
  /** The shift's own ISO date, `YYYY-MM-DD`. */
  date: string;
  /** `hasPermission(roles, Action.MANAGE_SCHEDULES)` — admins and emergency coordinators. */
  canManageSchedules?: boolean;
  filledInRole: number;
  alreadyOnShift: boolean;
  overlaps: boolean;
}): string | null {
  if (alreadyOnShift) return 'You are already on this shift.';
  if (overlaps) return 'You are already on another shift at the same time.';
  // ISO dates compare correctly as strings, so no parsing and no timezone.
  if (!canManageSchedules && date < today) return 'This shift has already passed.';
  if (
    role?.requiredCertification &&
    !holdsCertification(certifications, role.requiredCertification, today)
  ) {
    return `${role.name} requires the ${CERTIFICATION_LABEL[role.requiredCertification]} certification.`;
  }
  if (role && !roleCanTakeMore(role, filledInRole)) {
    return `${role.name} is already full on this shift.`;
  }
  return null;
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

/** Someone else on the same shift, for "who else is on" context. */
export interface MyDutyCrewmate {
  firstName: string;
  lastName: string;
  roleName?: string | null;
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
  /** Everyone else assigned to this same shift. */
  crewmates: MyDutyCrewmate[];
  /**
   * Whether the shift's mandatory posts are filled — see
   * `shiftMandatoryRolesFilled`, the same bar volunteer-hours generation uses.
   * A shift short of this most likely will not run.
   */
  quorumMet: boolean;
}

/** `GET /schedules/me` — published duties only, split around today. */
export interface MyDutiesResponse {
  upcoming: MyDuty[];
  past: MyDuty[];
}

/** One person on today's rota, as the whole delegation sees them. */
export interface TodayRosterMember {
  userId: string;
  firstName: string;
  lastName: string;
  roleName: string | null;
}

/**
 * One shift of one schedule running today.
 *
 * Only shifts whose mandatory posts are filled are ever built into this shape
 * — see `TodayRosterResponse` — so there is no `quorumMet` flag to read: if
 * it is here, it is on.
 */
export interface TodayRosterSlot {
  scheduleId: string;
  windowId: string;
  /** The rota's own name, for a reader who is on more than one of the same category. */
  windowLabel: string;
  slot: number;
  startMinute: number;
  endMinute: number;
  label: string;
  vehiclesNeeded: number;
  crew: TodayRosterMember[];
}

/**
 * Today's slots for one *category* of rota, not for one schedule: two
 * Emergency schedules both running today read as one "Emergency" heading,
 * which is the question someone opening the dashboard is actually asking.
 */
export interface TodayRosterGroup {
  category: AvailabilityWindowCategory;
  slots: TodayRosterSlot[];
}

/**
 * `GET /schedules/today` — who is on, right across the delegation.
 *
 * Published schedules only, and only shifts that clear
 * `shiftMandatoryRolesFilled`: a shift short of its mandatory posts most
 * likely will not run, and listing it would tell the delegation there is
 * cover when there is none. `groups` is empty when nothing runs today, which
 * the dashboard states in words rather than hiding.
 */
export interface TodayRosterResponse {
  /** The date this was computed for, ISO `YYYY-MM-DD`. */
  date: string;
  groups: TodayRosterGroup[];
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

/**
 * Headline numbers for a whole board, computed the same way everywhere.
 *
 * `today` drives `lapsedCertificationCount` only — an assignment fine when
 * made can lapse later, and that is judged against the current date, not the
 * date it was made.
 */
export function scheduleFillStats(
  days: ScheduleDayBoard[],
  roles: AvailabilityWindowRole[],
  today: string,
): ScheduleFillStats {
  let requiredSlots = 0;
  let filledSlots = 0;
  let shiftsWithGaps = 0;
  let overrideCount = 0;
  let certificationExceptionCount = 0;
  let lapsedCertificationCount = 0;

  const perShift = requiredSlotsForShift(roles);
  const roleById = new Map(roles.map((role) => [role.id, role]));

  for (const day of days) {
    for (const shift of day.shifts) {
      requiredSlots += perShift;
      filledSlots += shift.assignments.length;
      if (shift.gaps.length > 0) shiftsWithGaps += 1;
      // Someone who signed themselves up is not cover a coordinator arranged
      // off-platform, so they do not swell the override count even though no
      // submission backs them.
      overrideCount += shift.assignments.filter(
        (a) => a.isOverride && !a.selfAssigned,
      ).length;

      for (const assignment of shift.assignments) {
        if (assignment.certificationOverrideReason) {
          certificationExceptionCount += 1;
          continue;
        }
        const role = assignment.roleId ? roleById.get(assignment.roleId) : undefined;
        if (
          role?.requiredCertification &&
          !holdsCertification(assignment.user.certifications, role.requiredCertification, today)
        ) {
          lapsedCertificationCount += 1;
        }
      }
    }
  }

  return {
    requiredSlots,
    filledSlots,
    shiftsWithGaps,
    overrideCount,
    certificationExceptionCount,
    lapsedCertificationCount,
  };
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

/**
 * Whether a shift's mandatory posts are filled — the bar for auto-generating
 * volunteer-hours entries from it (#164). A shift short of this most likely
 * did not run at all, so nothing is generated for anyone on it, flagged or
 * otherwise — this is a stricter, narrower question than `shiftGaps()`, which
 * still judges every finite role against its full `maxPeople` for the
 * schedule board's own gap chips and is unaffected by `mandatoryCount`.
 *
 * A window with no roles at all is judged on headcount alone: it ran if
 * anyone at all was assigned.
 */
export function shiftMandatoryRolesFilled({
  roles,
  assignments,
}: {
  roles: Array<Pick<AvailabilityWindowRole, 'id' | 'mandatoryCount'>>;
  assignments: Array<{ roleId?: string | null }>;
}): boolean {
  if (roles.length === 0) return assignments.length > 0;
  return roles.every((role) => {
    if (role.mandatoryCount <= 0) return true;
    const filled = assignments.filter((a) => a.roleId === role.id).length;
    return filled >= role.mandatoryCount;
  });
}

// ─── Compensation offer (#246 Stage 2) ──────────────────────────────────────────
//
// The visible offer: a coordinator publishing a rate on a window *before*
// availability is collected, so a genuinely paid post (the product owner's
// example: "Apoio CNE" at 5€/hour) reads as one on the screen that drives
// submissions. Distinct from `AssignmentCompensationKind`, which classifies
// one person's time *after* they are assigned — that stays default
// `VOLUNTEER` no matter what is offered here (Stage 1's D1 is unchanged); an
// offer only makes `PAID` selectable and expected in `CompensationDialog`, it
// never auto-classifies anyone.

/**
 * How a window (or a schedule, overriding it) advertises pay for its shifts.
 *
 * `NONE` is a real, storable value, not merely "no offer" — it is the only
 * way a schedule can *cancel* a window's offer once one exists, once the
 * window itself is frozen (see `resolveCompensationOffer`). A field left
 * `null`/undefined means "nothing was ever set here"; `NONE` means "an offer
 * existed and was explicitly withdrawn". The two read identically to
 * `resolveCompensationOffer`'s callers, but differ to anything inspecting
 * `compensationKind` directly (the edit dialog needs the distinction to
 * prefill correctly).
 */
export enum CompensationOfferKind {
  HOURLY = 'HOURLY',
  FIXED = 'FIXED',
  NONE = 'NONE',
}

/**
 * The fields one compensation offer is made of — shared shape for
 * `AvailabilityWindow` and `Schedule` so `resolveCompensationOffer` can take
 * either without knowing which. Currency is always EUR, and every cents
 * value is a non-negative integer, never a float (validated by
 * `validateCompensationOffer` and mirrored by a hand-written DB CHECK
 * constraint — Prisma cannot express "HOURLY implies a rate and no amount").
 *
 * `FIXED` is **per person, per shift**: every volunteer or paid crew member
 * assigned to that shift earns the fixed amount once each, the shift's
 * headcount does not split it.
 */
export interface CompensationOfferFields {
  compensationKind?: CompensationOfferKind | null;
  /** EUR cents per hour. Set only when `compensationKind === HOURLY`. */
  compensationRateCents?: number | null;
  /**
   * EUR cents per person, per shift. Set only when
   * `compensationKind === FIXED`.
   */
  compensationAmountCents?: number | null;
}

/** What `resolveCompensationOffer` returns when an offer actually applies. */
export interface ResolvedCompensationOffer {
  kind: CompensationOfferKind.HOURLY | CompensationOfferKind.FIXED;
  rateCents?: number | null;
  amountCents?: number | null;
}

/**
 * Resolves the one offer that applies to a schedule's shifts, from the
 * schedule's own override and the window it was built from — **as a whole
 * unit**, never field-by-field. A schedule whose `compensationKind` is set
 * at all (`HOURLY`, `FIXED`, or an explicit `NONE`) replaces the window's
 * offer entirely; only when the schedule has never touched it
 * (`compensationKind` null/undefined) does the window's own offer apply.
 *
 * This must never degrade into field-wise `??` fallback — e.g. reading a
 * schedule's `HOURLY` kind together with the window's own
 * `compensationAmountCents` would silently invent a rate nobody set. Taking
 * `compensationKind` as the single switch that decides *which row's fields
 * to read, together*, is what prevents that (D4 of the paid-staff rework).
 *
 * Returns null both when nothing was ever offered and when `NONE` was set
 * explicitly — callers that only ask "is there an offer to show" (the
 * window/board UI) need not tell the two apart; the edit dialog, which does,
 * reads `compensationKind` directly off the row instead of through this
 * function.
 */
export function resolveCompensationOffer(
  schedule: CompensationOfferFields | null | undefined,
  window: CompensationOfferFields | null | undefined,
): ResolvedCompensationOffer | null {
  const source = schedule?.compensationKind != null ? schedule : window;
  if (
    !source ||
    source.compensationKind == null ||
    source.compensationKind === CompensationOfferKind.NONE
  ) {
    return null;
  }
  return {
    kind: source.compensationKind,
    rateCents:
      source.compensationKind === CompensationOfferKind.HOURLY
        ? (source.compensationRateCents ?? null)
        : null,
    amountCents:
      source.compensationKind === CompensationOfferKind.FIXED
        ? (source.compensationAmountCents ?? null)
        : null,
  };
}

/**
 * The one validation rule for a compensation offer payload — shared by the
 * window and schedule DTOs, and mirrored by a hand-written DB CHECK
 * constraint (see the doc comments on `AvailabilityWindow`/`Schedule` in
 * `schema.prisma`) since Prisma cannot express a conditional NOT NULL.
 * Returns a message fit to show a coordinator, or null when the combination
 * is coherent.
 */
export function validateCompensationOffer(
  kind: CompensationOfferKind,
  rateCents?: number | null,
  amountCents?: number | null,
): string | null {
  const isNonNegativeInt = (value: number) => Number.isInteger(value) && value >= 0;

  if (kind === CompensationOfferKind.HOURLY) {
    if (rateCents == null || !isNonNegativeInt(rateCents)) {
      return 'An hourly offer needs a non-negative whole number of cents as its rate.';
    }
    if (amountCents != null) {
      return 'An hourly offer must not also carry a fixed amount.';
    }
    return null;
  }

  if (kind === CompensationOfferKind.FIXED) {
    if (amountCents == null || !isNonNegativeInt(amountCents)) {
      return 'A fixed offer needs a non-negative whole number of cents as its amount.';
    }
    if (rateCents != null) {
      return 'A fixed offer must not also carry an hourly rate.';
    }
    return null;
  }

  // NONE
  if (rateCents != null || amountCents != null) {
    return 'Withdrawing an offer (NONE) must not carry a rate or an amount.';
  }
  return null;
}

/** `PATCH /schedules/:id/compensation` — the schedule-level override (D4). */
export interface SetCompensationOfferRequest {
  kind: CompensationOfferKind;
  /** EUR cents. Required (and only meaningful) when `kind === HOURLY`. */
  rateCents?: number | null;
  /** EUR cents. Required (and only meaningful) when `kind === FIXED`. */
  amountCents?: number | null;
}

/**
 * `PATCH /availability-windows/:id` — the offer is the only thing this route
 * edits, and only while the window is still `OPEN` (frozen once closed; see
 * the doc comment near `AvailabilityWindow.status` in `schema.prisma`).
 */
export interface SetWindowCompensationOfferRequest extends SetCompensationOfferRequest {
  note?: string | null;
}

/**
 * Whether a shift has at least one person still at the untouched
 * `VOLUNTEER` default despite a resolved compensation offer — the gap
 * Stage 1's always-`VOLUNTEER` default leaves open on a genuinely paid post,
 * until a coordinator opens `CompensationDialog`. An assignment a coordinator
 * *explicitly* set to `VOLUNTEER` (`compensationSetById` non-null) is a
 * deliberate decision, not a gap, and must not keep nagging — only a row
 * nobody has ever touched counts.
 */
export function shiftHasUnclassifiedPaidCrew(
  offer: ResolvedCompensationOffer | null,
  assignments: Array<{
    compensation: AssignmentCompensationKind;
    compensationSetById?: string | null;
  }>,
): boolean {
  if (!offer) return false;
  return assignments.some(
    (assignment) =>
      assignment.compensation === AssignmentCompensationKind.VOLUNTEER &&
      assignment.compensationSetById == null,
  );
}

// ─── Paid staff schedule (#245) ─────────────────────────────────────────────────

/** Descriptive only — no logic reads `kind`; it exists purely for a coordinator's own record-keeping. */
export enum EmploymentContractKind {
  FULL_TIME = 'FULL_TIME',
  PART_TIME = 'PART_TIME',
}

/**
 * A dated fact — "this person is on contract Mar–Oct" — replacing #223's
 * timeless `User.isPaidStaff` flag, which answered a dated question with a
 * boolean that silently rewrote history the moment it changed: resolving a
 * 2026-04 shift against *today's* flag, after the person's contract ended in
 * October, would get it wrong. A contract's own `startDate`/`endDate` is the
 * authoritative, gating fact `isOnContractClock` checks first — see its own
 * doc comment. `PaidStaffSchedule`'s recurring blocks and one-off overrides
 * (below) describe the *pattern* of hours within a contract; the contract
 * itself is what says the pattern applies at all, for a given date.
 */
export interface EmploymentContract {
  id: string;
  userId: string;
  kind: EmploymentContractKind;
  /** ISO date. */
  startDate: string;
  /** ISO date, inclusive. Null = still in effect. */
  endDate?: string | null;
  /**
   * Null only for a contract a migration backfilled from #223's flag, where
   * there is no real actor — same pattern as `PaidStaffSchedule`'s own
   * migration would need if it ever had to backfill without one. Every
   * contract created through the API has one; the request DTO enforces it.
   */
  createdById?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEmploymentContractRequest {
  kind: EmploymentContractKind;
  startDate: string;
  endDate?: string | null;
}

/**
 * `PATCH /employment-contracts/:userId/:contractId` — dating when a contract
 * stopped, rather than deleting the row: the contract was a real, dated fact
 * while it lasted, and a past assignment's `SALARY` resolution depends on it
 * staying on file (`isOnContractClock`). Deleting it outright is still
 * possible (`DELETE`, for a contract entered in error), but ending one is the
 * ordinary close-out.
 */
export interface EndEmploymentContractRequest {
  /** ISO date, inclusive. Must not be before the contract's own `startDate`. */
  endDate: string;
}

export interface EmploymentContractsResponse {
  userId: string;
  contracts: EmploymentContract[];
}

/**
 * A paid staffer's recurring on-the-clock hours: worked every `dayOfWeek`
 * from `startMinute` to `endMinute`, for as long as `effectiveFrom`–
 * `effectiveTo` covers the date in question. `effectiveTo` null means still
 * current. A contract change is a new block, not an edit to this one — the
 * old block's `effectiveTo` gets set instead — so a past assignment's
 * on-clock resolution never rewrites itself under a later change.
 *
 * Belongs to one `EmploymentContract` (`contractId` at the persistence
 * layer) — the pattern within a contract's own dates. See `isOnContractClock`
 * for how the two combine: the contract is the gate, this is the pattern.
 */
export interface PaidStaffScheduleBlock {
  id: string;
  userId: string;
  /** `Date#getDay()` convention: 0 = Sunday … 6 = Saturday. */
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  /** ISO date. */
  effectiveFrom: string;
  /** ISO date, inclusive. Null = still in effect. */
  effectiveTo?: string | null;
}

/**
 * A one-off exception to the recurring pattern for a single date — either a
 * full day off, or custom hours replacing the pattern for that date alone.
 * Independent of the staff absence calendar (#224): that records vacation
 * and sick leave as a durable HR fact, this records an ad-hoc schedule
 * shuffle ("working the evening instead of the morning today"). A date
 * carries at most one override; where one exists it wins outright over
 * every recurring block for that date, never merges with them.
 */
export interface PaidStaffScheduleOverride {
  id: string;
  userId: string;
  /** ISO date. */
  date: string;
  isOff: boolean;
  /** Required, and only meaningful, when `isOff` is false. */
  startMinute?: number | null;
  endMinute?: number | null;
  notes?: string | null;
}

export interface PaidStaffScheduleResponse {
  userId: string;
  blocks: PaidStaffScheduleBlock[];
  overrides: PaidStaffScheduleOverride[];
}

export interface CreatePaidStaffScheduleBlockRequest {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

export interface CreatePaidStaffScheduleOverrideRequest {
  date: string;
  isOff: boolean;
  startMinute?: number | null;
  endMinute?: number | null;
  notes?: string | null;
}

/** Two half-open minute ranges sharing any time at all, not just an endpoint. */
function minuteRangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Whether a paid staffer was on the clock for some `[shiftStartMinute,
 * shiftEndMinute)` window on `date` — the question `VolunteerHoursService`
 * asks before generating an entry from a paid-staff assignment (#245). A
 * date override, if one exists for `date`, wins outright: `isOff` means off
 * regardless of the recurring pattern, custom hours replace it entirely.
 * Otherwise every recurring block whose `dayOfWeek` and effective range
 * cover `date` applies — a split shift is two blocks, not a reason to pick
 * one. "On the clock" means the shift overlaps the resolved work window at
 * all, not that it falls entirely inside it: a shift that starts on salaried
 * time and runs past it was still, in part, worked on the clock.
 */
export function isOnPaidClock(
  blocks: PaidStaffScheduleBlock[],
  overrides: PaidStaffScheduleOverride[],
  date: string,
  shiftStartMinute: number,
  shiftEndMinute: number,
): boolean {
  const override = overrides.find((o) => o.date === date);
  if (override) {
    if (override.isOff) return false;
    if (override.startMinute == null || override.endMinute == null) return false;
    return minuteRangesOverlap(shiftStartMinute, shiftEndMinute, override.startMinute, override.endMinute);
  }
  const dayOfWeek = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return blocks.some(
    (block) =>
      block.dayOfWeek === dayOfWeek &&
      block.effectiveFrom <= date &&
      (!block.effectiveTo || date <= block.effectiveTo) &&
      minuteRangesOverlap(shiftStartMinute, shiftEndMinute, block.startMinute, block.endMinute),
  );
}

/**
 * Whether someone was on a contract's paid clock for `[startMinute,
 * endMinute)` on `date` — the contract-aware wrapper `resolveAssignmentCompensation`
 * actually calls. Wraps `isOnPaidClock` rather than reimplementing it: the
 * recurring-block/override resolution is unchanged, this only adds the
 * contract as an **authoritative gate** in front of it. Outside every
 * contract's own `startDate`/`endDate`, the person is never on the clock,
 * regardless of what a block or override says — a block/override row can
 * outlive the contract it was set up under (nothing deletes them when a
 * contract ends), and without this gate a leftover row would resolve
 * `SALARY` for a date the person was, in fact, volunteering.
 */
export function isOnContractClock({
  contracts,
  blocks,
  overrides,
  date,
  startMinute,
  endMinute,
}: {
  contracts: Array<Pick<EmploymentContract, 'startDate' | 'endDate'>>;
  blocks: PaidStaffScheduleBlock[];
  overrides: PaidStaffScheduleOverride[];
  date: string;
  startMinute: number;
  endMinute: number;
}): boolean {
  const coveredByContract = contracts.some(
    (contract) => contract.startDate <= date && (!contract.endDate || date <= contract.endDate),
  );
  if (!coveredByContract) return false;
  return isOnPaidClock(blocks, overrides, date, startMinute, endMinute);
}

// ─── Staff absences (#224) ──────────────────────────────────────────────────────

/**
 * A durable HR fact — this is not an ad-hoc schedule shuffle
 * (`PaidStaffScheduleOverride` is that). Entitlement balances, accrual,
 * carry-over and approval workflow are explicitly out of scope: that is HR
 * software, and #219 rules it out by name.
 */
export enum StaffAbsenceKind {
  VACATION = 'VACATION',
  SICK_LEAVE = 'SICK_LEAVE',
  OTHER_PAID_LEAVE = 'OTHER_PAID_LEAVE',
}

/**
 * A dated range someone is off — vacation, sick leave or other paid leave —
 * recorded so the roster and (later) the trip planner can warn a coordinator
 * before assigning them, never block it (`staffAbsencesOnDate`,
 * `ScheduleAbsenceWarning`). `startDate`/`endDate` are both inclusive.
 */
export interface StaffAbsence {
  id: string;
  userId: string;
  kind: StaffAbsenceKind;
  /** ISO date. */
  startDate: string;
  /** ISO date, inclusive. */
  endDate: string;
  /**
   * Partial-day absence, e.g. a medical appointment — the rare case, never
   * the default, and only for `OTHER_PAID_LEAVE` (vacation and sick leave
   * are always whole days). `HH:mm`, 24h. Both set together or neither; only
   * valid when `startDate === endDate` (see `isValidStaffAbsenceTimeRange`)
   * — a partial day can't span a date range.
   */
  startTime?: string | null;
  endTime?: string | null;
  notes?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStaffAbsenceRequest {
  userId: string;
  kind: StaffAbsenceKind;
  startDate: string;
  endDate: string;
  startTime?: string | null;
  endTime?: string | null;
  notes?: string | null;
}

/** `PATCH /staff-absences/:id` — a correction to an existing block, not a new one. */
export interface UpdateStaffAbsenceRequest {
  kind: StaffAbsenceKind;
  startDate: string;
  endDate: string;
  startTime?: string | null;
  endTime?: string | null;
  notes?: string | null;
}

/** `endDate` before `startDate` is never valid, inclusive range or not. */
export function isValidStaffAbsenceRange(startDate: string, endDate: string): boolean {
  return endDate >= startDate;
}

/**
 * A partial-day absence (a medical appointment, say) is the rare case, opted
 * into by setting both times — never just one, never on a multi-day range
 * (since "partial" only means something for a single day), and only for
 * `OTHER_PAID_LEAVE`: vacation and sick leave are always whole days. Full-day
 * (the default) is neither time set.
 */
export function isValidStaffAbsenceTimeRange(
  kind: StaffAbsenceKind,
  startDate: string,
  endDate: string,
  startTime?: string | null,
  endTime?: string | null,
): boolean {
  if (!startTime && !endTime) return true;
  if (!startTime || !endTime) return false;
  if (kind !== StaffAbsenceKind.OTHER_PAID_LEAVE) return false;
  if (startDate !== endDate) return false;
  return endTime > startTime;
}

/** Two inclusive date ranges sharing any day at all. */
export function staffAbsenceRangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * Which of `absences` cover `date` — "who is absent on date D", the question
 * the roster and trip planner ask before assigning someone. Pure so both the
 * backend service and the schedule board's conflict-style computation can
 * share it without agreeing on a shape beyond these three fields.
 */
export function staffAbsencesOnDate<T extends Pick<StaffAbsence, 'startDate' | 'endDate'>>(
  absences: T[],
  date: string,
): T[] {
  return absences.filter((absence) => absence.startDate <= date && date <= absence.endDate);
}

// ─── Volunteer hours ────────────────────────────────────────────────────────────

/**
 * Where an entry's default came from (#164). `SCHEDULED` is proposed by the
 * system from a `ScheduleAssignment`; `MANUAL` has no shift behind it at all
 * — a meeting, training, an emergency/support shift worked outside the
 * schedule (covering a gap the auto-generation missed, or without ever being
 * on the rota), or anything else logged by hand — and always needs a
 * coordinator's eyes: there is no shift to auto-validate it against.
 */
export enum VolunteerHoursSource {
  SCHEDULED = 'SCHEDULED',
  MANUAL = 'MANUAL',
}

/**
 * What the hours were for. The rota categories (`EMERGENCY`,
 * `LOCAL_SUPPORT`, `CNE_SUPPORT`) double as `SCHEDULED` activity types and
 * can also be logged `MANUAL`ly (for shift work the schedule never captured);
 * the other three (`MEETING`, `TRAINING`, `OTHER`) only ever appear on
 * `MANUAL` entries.
 */
export enum VolunteerActivityType {
  EMERGENCY = 'EMERGENCY',
  LOCAL_SUPPORT = 'LOCAL_SUPPORT',
  CNE_SUPPORT = 'CNE_SUPPORT',
  MEETING = 'MEETING',
  TRAINING = 'TRAINING',
  OTHER = 'OTHER',
}

/**
 * Every activity type is offered on the "log hours" form: the rota
 * categories let someone report a shift the schedule never captured (a gap
 * in auto-generation, or work done without ever being on the rota), while
 * `MEETING`/`TRAINING`/`OTHER` cover everything that was never a shift.
 */
export const MANUAL_VOLUNTEER_ACTIVITY_TYPES: readonly VolunteerActivityType[] = [
  VolunteerActivityType.EMERGENCY,
  VolunteerActivityType.LOCAL_SUPPORT,
  VolunteerActivityType.CNE_SUPPORT,
  VolunteerActivityType.MEETING,
  VolunteerActivityType.TRAINING,
  VolunteerActivityType.OTHER,
];

export const VOLUNTEER_ACTIVITY_TYPE_LABEL: Record<VolunteerActivityType, string> = {
  [VolunteerActivityType.EMERGENCY]: 'Emergency',
  [VolunteerActivityType.LOCAL_SUPPORT]: 'Local Support',
  [VolunteerActivityType.CNE_SUPPORT]: 'CNE Support',
  [VolunteerActivityType.MEETING]: 'Meeting',
  [VolunteerActivityType.TRAINING]: 'Training',
  [VolunteerActivityType.OTHER]: 'Other',
};

/**
 * Two states, not four: an entry is either still waiting on someone (a
 * coordinator, or the grace-period sweep), or it counts. There is no
 * separate "rejected" — disputing an entry is done by approving it with
 * `minutes` corrected down (to zero, if nothing should count) and a
 * `correctionReason`.
 */
export enum VolunteerHoursStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
}

/**
 * An exception worth a coordinator's attention. `RAN_OVER` is confident —
 * derived from a submitted emergency report's own chronology — and is
 * auto-credited on top of the scheduled minutes as well as flagged.
 * `POSSIBLY_LEFT_EARLY` is inferential — an optional-seat person absent from
 * every report on the shift — and is flag-only, never adjusting `minutes`
 * itself.
 */
export type VolunteerHoursFlag = 'RAN_OVER' | 'POSSIBLY_LEFT_EARLY';

export interface VolunteerHoursFlagDetail {
  flag: VolunteerHoursFlag;
  /** Set for `RAN_OVER`: how many minutes past the shift's own end. */
  minutesOver?: number;
  /** Report(s) the flag was raised from. */
  reportIds?: string[];
}

export interface VolunteerHoursActor {
  id: string;
  firstName: string;
  lastName: string;
}

/** One volunteer's credited time for one activity (#164). */
export interface VolunteerHoursEntry {
  id: string;
  userId: string;
  user?: VolunteerHoursActor | null;
  source: VolunteerHoursSource;
  activityType: VolunteerActivityType;
  assignmentId?: string | null;
  scheduleId?: string | null;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  /** Required for a MANUAL entry; unused for SCHEDULED. */
  description?: string | null;
  /** The shift's own duration in minutes, snapshotted at generation. Null for MANUAL. */
  baselineMinutes?: number | null;
  /** What the system proposed crediting. */
  proposedMinutes: number;
  /** What actually counts towards totals. */
  minutes: number;
  /**
   * The wall-clock span a MANUAL entry was reported for, minutes from
   * midnight (see `minutesBetweenTimes`). Null for SCHEDULED, and null for a
   * MANUAL entry logged before this field existed — `minutes` remains the
   * authoritative duration either way.
   */
  startMinute?: number | null;
  endMinute?: number | null;
  flags: VolunteerHoursFlag[];
  flagDetails?: VolunteerHoursFlagDetail[] | null;
  status: VolunteerHoursStatus;
  approvedById?: string | null;
  approvedBy?: VolunteerHoursActor | null;
  approvedAt?: string | null;
  autoApproved: boolean;
  /** Present exactly when `minutes` differs from `proposedMinutes`. */
  correctionReason?: string | null;
  loggedById?: string | null;
  loggedBy?: VolunteerHoursActor | null;
  /** Set when a coordinator sent an APPROVED entry back to PENDING. Suppresses
   *  auto-approval forever after — a reopened entry is one a person wants to
   *  look at, and the grace-period sweep must not quietly undo that. */
  reopenedAt?: string | null;
  reopenedById?: string | null;
  reopenedBy?: VolunteerHoursActor | null;
  /** Soft delete. The row is retained rather than removed because
   *  `ensureGenerated` treats an assignment with no entry as one still to
   *  generate — a hard delete of a SCHEDULED entry resurrects it on the very
   *  next read. */
  deletedAt?: string | null;
  deletedById?: string | null;
  deletedBy?: VolunteerHoursActor | null;
  deletionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `POST /volunteer-hours` — logging a MANUAL entry for yourself. */
export interface CreateManualVolunteerHoursRequest {
  activityType: VolunteerActivityType;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  minutes: number;
  /**
   * The time-of-day span `minutes` was derived from, when the form captured
   * one. Optional and supplementary — `minutes` is what the server trusts,
   * checked against these by `validateVolunteerHoursTimes` when both are given.
   */
  startMinute?: number;
  endMinute?: number;
  /** Required exactly when `activityType` is `OTHER`. */
  description?: string;
}

/**
 * `PATCH /volunteer-hours/:id` — the owner correcting their own entry while it
 * is still PENDING, whether it was auto-generated (SCHEDULED) or logged by
 * hand (MANUAL). `activityType`/`date` only take effect for a MANUAL entry —
 * a SCHEDULED entry's activity and date belong to the shift it came from, not
 * to the person correcting its minutes.
 */
export interface UpdateVolunteerHoursRequest {
  activityType?: VolunteerActivityType;
  /** ISO date, `YYYY-MM-DD`. */
  date?: string;
  minutes: number;
  /** Same supplementary role as on `CreateManualVolunteerHoursRequest`. */
  startMinute?: number;
  endMinute?: number;
  description?: string | null;
}

/** `POST /volunteer-hours/:id/approve` — approve as proposed, or correct the number. */
export interface ApproveVolunteerHoursRequest {
  /** Omit to approve the entry's own `proposedMinutes` unchanged. */
  minutes?: number;
  /** Required exactly when `minutes` is given and differs from `proposedMinutes`. */
  correctionReason?: string;
}

/** `GET /volunteer-hours/me`. */
export interface MyVolunteerHoursResponse {
  entries: VolunteerHoursEntry[];
  totalApprovedMinutes: number;
  totalPendingMinutes: number;
}

/** One row of `GET /volunteer-hours/summary`. */
export interface VolunteerHoursSummaryRow {
  userId: string;
  firstName: string;
  lastName: string;
  approvedMinutes: number;
  pendingMinutes: number;
  byActivityType: Partial<Record<VolunteerActivityType, number>>;
}

/** `GET /volunteer-hours/summary` — approved vs pending, per volunteer, over a period. */
export interface VolunteerHoursSummaryResponse {
  /** ISO date, `YYYY-MM-DD`, inclusive. */
  from: string;
  to: string;
  rows: VolunteerHoursSummaryRow[];
}

export const MAX_MANUAL_HOURS_DESCRIPTION_LENGTH = 500;
/** A single manual entry may not claim more than this many minutes (18h). */
export const MAX_MANUAL_HOURS_MINUTES = 18 * 60;

/**
 * The shared gate for a form that captured a time-of-day span rather than a
 * bare duration: both fields present or both absent, each a valid minute of
 * day (`parseTimeOfDay`'s own range, 0–1440), and — when given — `minutes`
 * must actually equal the span `minutesBetweenTimes` derives, so a
 * hand-crafted request can't claim more (or less) than the times say.
 */
export function validateVolunteerHoursTimes(
  startMinute: number | undefined,
  endMinute: number | undefined,
  minutes: number,
): string | null {
  if (startMinute === undefined && endMinute === undefined) return null;
  if (startMinute === undefined || endMinute === undefined) {
    return 'Enter both a start and an end time.';
  }
  if (
    !Number.isInteger(startMinute) ||
    startMinute < 0 ||
    startMinute > MINUTES_PER_DAY - 1 ||
    !Number.isInteger(endMinute) ||
    endMinute < 1 ||
    endMinute > MINUTES_PER_DAY
  ) {
    return 'Enter a valid start and end time.';
  }
  if (minutesBetweenTimes(startMinute, endMinute) !== minutes) {
    return 'The duration does not match the start and end times.';
  }
  return null;
}

/**
 * The one rule for whether a manual-entry request is coherent, mirroring
 * `validateWindowRoles`'s role as the shared gate between the form and the API.
 */
export function validateManualVolunteerHours(
  request: CreateManualVolunteerHoursRequest,
): string | null {
  if (!MANUAL_VOLUNTEER_ACTIVITY_TYPES.includes(request.activityType)) {
    return 'Choose a valid activity type.';
  }
  if (!isIsoDateLike(request.date)) return 'Enter a valid date.';
  if (!Number.isInteger(request.minutes) || request.minutes <= 0) {
    return 'Duration must be a whole number of minutes greater than zero.';
  }
  if (request.minutes > MAX_MANUAL_HOURS_MINUTES) {
    return `A single entry cannot claim more than ${MAX_MANUAL_HOURS_MINUTES / 60} hours.`;
  }
  const timesError = validateVolunteerHoursTimes(
    request.startMinute,
    request.endMinute,
    request.minutes,
  );
  if (timesError) return timesError;
  const description = request.description?.trim() ?? '';
  if (!description && request.activityType === VolunteerActivityType.OTHER) {
    return 'Describe what the activity was.';
  }
  if (description.length > MAX_MANUAL_HOURS_DESCRIPTION_LENGTH) {
    return `The description may be at most ${MAX_MANUAL_HOURS_DESCRIPTION_LENGTH} characters.`;
  }
  return null;
}

/**
 * The rule for whether a self-edit of an existing entry is coherent. A
 * MANUAL entry is re-validated exactly like a fresh one (per
 * `validateManualVolunteerHours`) since the person owns every field on it; a
 * SCHEDULED entry only has its `minutes` (and an optional note) up for
 * correction — its activity and date are the shift's, not editable here.
 */
export function validateVolunteerHoursEdit(
  request: UpdateVolunteerHoursRequest,
  source: VolunteerHoursSource,
  currentActivityType?: VolunteerActivityType,
): string | null {
  if (!Number.isInteger(request.minutes) || request.minutes <= 0) {
    return 'Duration must be a whole number of minutes greater than zero.';
  }
  if (request.minutes > MAX_MANUAL_HOURS_MINUTES) {
    return `A single entry cannot claim more than ${MAX_MANUAL_HOURS_MINUTES / 60} hours.`;
  }
  const timesError = validateVolunteerHoursTimes(
    request.startMinute,
    request.endMinute,
    request.minutes,
  );
  if (timesError) return timesError;
  const description = request.description?.trim() ?? '';
  if (source === VolunteerHoursSource.MANUAL) {
    if (request.activityType && !MANUAL_VOLUNTEER_ACTIVITY_TYPES.includes(request.activityType)) {
      return 'Choose a valid activity type.';
    }
    if (request.date !== undefined && !isIsoDateLike(request.date)) return 'Enter a valid date.';
    const activityType = request.activityType ?? currentActivityType;
    if (!description && activityType === VolunteerActivityType.OTHER) {
      return 'Describe what the activity was.';
    }
  }
  if (description.length > MAX_MANUAL_HOURS_DESCRIPTION_LENGTH) {
    return `The description may be at most ${MAX_MANUAL_HOURS_DESCRIPTION_LENGTH} characters.`;
  }
  return null;
}

/**
 * A bulk report's cap on how many volunteers one submission can cover.
 * Separate from `MAX_APPROVE_BATCH_SIZE`: creating N rows and approving N
 * pre-existing ones are different costs, and there's no reason the two
 * limits need to move together.
 */
export const MAX_BULK_HOURS_ENTRIES = 200;

/** One volunteer on a bulk report. Omitted fields fall back to the shared span. */
export interface BulkVolunteerHoursEntryInput {
  userId: string;
  startMinute?: number;
  endMinute?: number;
  minutes?: number;
}

/**
 * `POST /volunteer-hours/bulk` — a coordinator reporting the same activity
 * for several volunteers at once (a meeting, a training session run outside
 * the rota). Every resulting entry lands APPROVED, the coordinator recorded
 * as both `loggedBy` and `approvedBy`: unlike a self-logged MANUAL entry,
 * there is no need for a second pass of review — the coordinator reporting
 * the hours is already vouching for them, the same trust `MANAGE_VOLUNTEER_HOURS`
 * already grants over anyone else's entry.
 */
export interface CreateBulkVolunteerHoursRequest {
  activityType: VolunteerActivityType;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  /** The shared span/duration, used by any entry that doesn't override it. */
  startMinute?: number;
  endMinute?: number;
  minutes: number;
  /** Required exactly when `activityType` is `OTHER`. */
  description?: string;
  entries: BulkVolunteerHoursEntryInput[];
}

export interface CreateBulkVolunteerHoursResponse {
  created: VolunteerHoursEntry[];
  totalMinutes: number;
}

/**
 * The shared gate for a bulk report: delegates the activity/date/duration/
 * description half to `validateManualVolunteerHours` (a bulk report is that
 * same shape, just fanned out to many volunteers) rather than restating those
 * rules, then adds the two things unique to a list — non-empty, no duplicate
 * volunteer, a sane cap — and re-checks each per-row override.
 */
export function validateBulkVolunteerHours(
  request: CreateBulkVolunteerHoursRequest,
): string | null {
  const sharedError = validateManualVolunteerHours(request);
  if (sharedError) return sharedError;
  if (request.entries.length === 0) return 'Select at least one volunteer.';
  if (request.entries.length > MAX_BULK_HOURS_ENTRIES) {
    return `A bulk report cannot cover more than ${MAX_BULK_HOURS_ENTRIES} volunteers.`;
  }
  const seen = new Set<string>();
  for (const entry of request.entries) {
    if (seen.has(entry.userId)) return 'The same volunteer is selected more than once.';
    seen.add(entry.userId);
    const minutes = entry.minutes ?? request.minutes;
    const timesError = validateVolunteerHoursTimes(entry.startMinute, entry.endMinute, minutes);
    if (timesError) return timesError;
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > MAX_MANUAL_HOURS_MINUTES) {
      return `A single entry cannot claim more than ${MAX_MANUAL_HOURS_MINUTES / 60} hours.`;
    }
  }
  return null;
}

/** Loose `YYYY-MM-DD` shape check — the full calendar validity check lives with the DTOs. */
function isIsoDateLike(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * One report's evidence for one shift's exception detection — already
 * resolved by the caller to plain numbers, so this stays pure: no `Date`
 * arithmetic and no timezone handling here (see `shiftBoundaryToInstant` on
 * the backend for the DST-aware part).
 */
export interface ShiftExceptionReport {
  /** Only a submitted report's timestamps are hard enough evidence to auto-credit minutes. */
  submitted: boolean;
  /**
   * The latest of the report's own end-of-involvement timestamps
   * (`availableAt`, `endedAt`, `hospitalArrivalAt`), minus the shift's own
   * end instant, in minutes. Zero or negative when the report ended at or
   * before the shift did.
   */
  minutesPastShiftEnd: number;
  crewUserIds: string[];
}

export interface ShiftExceptionAssignment {
  userId: string;
  /**
   * The assigned role's `mandatoryCount`, or `null` when the window defines
   * no roles at all — absence detection does not apply then, since there is
   * no "optional seat" to tell apart from a required one.
   */
  roleMandatoryCount: number | null;
}

export interface ShiftExceptionResult {
  /** Extra minutes to auto-credit, keyed by userId — only crew of a report that ran over. */
  extraMinutesByUser: Map<string, number>;
  /** userIds flagged `POSSIBLY_LEFT_EARLY`. */
  possiblyLeftEarly: Set<string>;
}

/**
 * The two exception signals for one Emergency shift (#164): a report running
 * past the shift's own end, and an optional-seat person absent from every
 * report filed on it.
 *
 * Absence is judged against *every* report on the shift, submitted or still
 * a draft — a draft is real evidence someone was there even though nobody
 * has filed it yet, so its crew list still clears people of "possibly
 * absent". It is only the *crediting* of extra minutes that is restricted to
 * submitted reports, since an unfiled draft's timestamps are not yet a
 * statement anyone has made. Absence is judged not at all when the shift has
 * no report whatsoever — there is nothing to tell "absent" apart from
 * "nobody has filed anything yet".
 */
export function detectShiftExceptions({
  assignments,
  reports,
}: {
  assignments: ShiftExceptionAssignment[];
  reports: ShiftExceptionReport[];
}): ShiftExceptionResult {
  const extraMinutesByUser = new Map<string, number>();
  for (const report of reports) {
    if (!report.submitted || report.minutesPastShiftEnd <= 0) continue;
    for (const userId of report.crewUserIds) {
      const current = extraMinutesByUser.get(userId) ?? 0;
      if (report.minutesPastShiftEnd > current) {
        extraMinutesByUser.set(userId, report.minutesPastShiftEnd);
      }
    }
  }

  const possiblyLeftEarly = new Set<string>();
  if (reports.length > 0) {
    const knownCrewUserIds = new Set(reports.flatMap((report) => report.crewUserIds));
    for (const assignment of assignments) {
      if (assignment.roleMandatoryCount !== 0) continue;
      if (!knownCrewUserIds.has(assignment.userId)) possiblyLeftEarly.add(assignment.userId);
    }
  }

  return { extraMinutesByUser, possiblyLeftEarly };
}

/** What one SCHEDULED assignment's entry proposes, from its baseline and its exceptions. */
export function proposeScheduledHours({
  baselineMinutes,
  extraMinutes,
  possiblyLeftEarly,
}: {
  baselineMinutes: number;
  extraMinutes: number;
  possiblyLeftEarly: boolean;
}): { proposedMinutes: number; flags: VolunteerHoursFlag[] } {
  const flags: VolunteerHoursFlag[] = [];
  let proposedMinutes = baselineMinutes;
  if (extraMinutes > 0) {
    flags.push('RAN_OVER');
    proposedMinutes += extraMinutes;
  }
  if (possiblyLeftEarly) flags.push('POSSIBLY_LEFT_EARLY');
  return { proposedMinutes, flags };
}

/**
 * Legacy migration imported historical duty rosters as real `Schedule`/
 * `ScheduleAssignment` rows, with nothing on them marking "came from the
 * import" versus "created in the app" — see `LegacyIdMap`'s own doc comment
 * for why that distinction is deliberately kept out of the domain models.
 * Every shift the legacy roster covers already has its hours captured by the
 * migrated MANUAL+APPROVED `VolunteerHoursEntry` (see
 * `13-volunteer-hours.loader.ts`), so lazily generating a second SCHEDULED
 * entry for the same shift would double it.
 *
 * Gating generation on the shift's own date, instead of on provenance, keeps
 * that decision independent of where the `Schedule` row came from: legacy
 * has nothing to say about a shift on or after go-live, so nothing generated
 * from that date on was ever legacy's to duplicate.
 */
export const VOLUNTEER_HOURS_SCHEDULED_GENERATION_START_DATE = '2026-10-01';

/** Whether a SCHEDULED entry may be generated at all for a shift on this date. */
export function isEligibleForScheduledGeneration(shiftDate: string): boolean {
  return shiftDate >= VOLUNTEER_HOURS_SCHEDULED_GENERATION_START_DATE;
}

/**
 * Days after a SCHEDULED shift's own date before a clean, untouched entry
 * auto-approves. A month gives the volunteer a real window to correct the
 * default before it becomes final, without leaving the review queue holding
 * routine, unflagged entries forever.
 */
export const VOLUNTEER_HOURS_AUTO_APPROVE_GRACE_DAYS = 30;

/**
 * Whether a PENDING entry is due to auto-approve: SCHEDULED (a MANUAL entry
 * always needs a person, per `VolunteerHoursSource` above), unflagged, past
 * the grace period counted from its own `date`, never reopened, and not
 * deleted. `reopenedAt` and `deletedAt` are checked here (not just at the
 * query site) so the grace-period sweep never quietly re-approves an entry a
 * coordinator deliberately sent back to PENDING, or resurrects one that was
 * dismissed.
 */
export function isEligibleForAutoApproval(
  entry: Pick<VolunteerHoursEntry, 'source' | 'status' | 'flags' | 'date' | 'reopenedAt' | 'deletedAt'>,
  today: string,
): boolean {
  if (entry.deletedAt) return false;
  if (entry.reopenedAt) return false;
  if (entry.source !== VolunteerHoursSource.SCHEDULED) return false;
  if (entry.status !== VolunteerHoursStatus.PENDING) return false;
  if (entry.flags.length > 0) return false;
  const graceEnds = new Date(
    Date.parse(`${entry.date}T00:00:00.000Z`) + VOLUNTEER_HOURS_AUTO_APPROVE_GRACE_DAYS * 86_400_000,
  );
  return graceEnds.getTime() <= Date.parse(`${today}T00:00:00.000Z`);
}

/** Chip filters on the review queue. `'NONE'` means "no flags at all". */
export type VolunteerHoursFlagFilter = VolunteerHoursFlag | 'NONE';

/** `GET /volunteer-hours/review` query. */
export interface VolunteerHoursReviewQuery {
  status?: VolunteerHoursStatus;   // default PENDING
  flag?: VolunteerHoursFlagFilter;
  source?: VolunteerHoursSource;
  /** Matches the volunteer's first/last name or the entry description. */
  search?: string;
  from?: string;                   // ISO date, inclusive, on `date`
  to?: string;
  page?: number;                   // 1-based, default 1
  perPage?: number;                // default 25, max 100
  sort?: 'date' | 'person' | 'minutes';
  order?: 'asc' | 'desc';          // default: date asc — oldest waiting first
}

/**
 * Counts for the filter chips and the stats header. Computed over the current
 * `status` + `from`/`to` + `search` scope but *ignoring* `flag`/`source`, so each
 * chip can show how many entries it would reveal.
 */
export interface VolunteerHoursReviewCounts {
  all: number;
  noFlags: number;
  ranOver: number;
  possiblyLeftEarly: number;
  manual: number;
  /** How many the sweep action would approve right now. */
  sweepable: number;
  /** Sum of `proposedMinutes` across `all`. */
  totalProposedMinutes: number;
  /** Earliest `date` in scope, for the "oldest waiting" stat. Null when empty. */
  oldestDate: string | null;
}

export interface VolunteerHoursReviewResponse {
  data: VolunteerHoursEntry[];
  total: number;
  page: number;
  perPage: number;
  counts: VolunteerHoursReviewCounts;
}

export const VOLUNTEER_HOURS_REVIEW_MAX_PER_PAGE = 100;

/** `POST /volunteer-hours/approve-batch`. */
export interface ApproveVolunteerHoursBatchItem {
  id: string;
  /** Omit to approve the entry's own proposed minutes. */
  minutes?: number;
  /** Required exactly when `minutes` differs from the entry's proposed value. */
  correctionReason?: string;
}
export interface ApproveVolunteerHoursBatchRequest {
  entries: ApproveVolunteerHoursBatchItem[];
}
/**
 * Deliberately tolerant: one entry a colleague approved a second earlier must
 * not fail the other 39.
 */
export interface ApproveVolunteerHoursBatchResponse {
  approved: VolunteerHoursEntry[];
  failed: { id: string; message: string }[];
}
export const MAX_APPROVE_BATCH_SIZE = 200;

/** `POST /volunteer-hours/approve-sweep` — the "no exceptions" quick action. */
export interface SweepApproveVolunteerHoursRequest {
  from?: string;
  to?: string;
}
export interface SweepApproveVolunteerHoursResponse {
  approvedCount: number;
  totalMinutes: number;
}

/** `POST /volunteer-hours/:id/dismiss`. */
export interface DismissVolunteerHoursRequest {
  reason: string;
}
export const MAX_DISMISSAL_REASON_LENGTH = 500;

/**
 * Whether the "approve all without exceptions" sweep may take this entry
 * without anyone reading it: auto-generated from a shift, unflagged, still
 * pending, never reopened, not deleted. A MANUAL entry never qualifies — there
 * is no shift to validate it against, which is the whole reason it is queued.
 */
export function isSweepApprovable(
  entry: Pick<VolunteerHoursEntry, 'source' | 'status' | 'flags' | 'reopenedAt' | 'deletedAt'>,
): boolean {
  if (entry.deletedAt) return false;
  if (entry.reopenedAt) return false;
  if (entry.source !== VolunteerHoursSource.SCHEDULED) return false;
  if (entry.status !== VolunteerHoursStatus.PENDING) return false;
  if (entry.flags.length > 0) return false;
  return true;
}

/** An APPROVED, non-deleted entry can be sent back to PENDING. */
export function canReopenVolunteerHours(
  entry: Pick<VolunteerHoursEntry, 'status' | 'deletedAt'>,
): boolean {
  if (entry.deletedAt) return false;
  return entry.status === VolunteerHoursStatus.APPROVED;
}

/**
 * A volunteer may delete their own mistake, but only before anyone has acted on
 * it and only when they filed it by hand: MANUAL, PENDING, owned, not already
 * deleted. Anything else is a coordinator's `dismiss`.
 */
export function canDeleteOwnVolunteerHours(
  entry: Pick<VolunteerHoursEntry, 'userId' | 'source' | 'status' | 'deletedAt'>,
  viewerId: string,
): boolean {
  if (entry.deletedAt) return false;
  if (entry.userId !== viewerId) return false;
  if (entry.source !== VolunteerHoursSource.MANUAL) return false;
  return entry.status === VolunteerHoursStatus.PENDING;
}

/** e.g. "7h 30m", "45m". */
export function formatMinutes(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  if (hours === 0) return `${sign}${mins}m`;
  if (mins === 0) return `${sign}${hours}h`;
  return `${sign}${hours}h ${mins}m`;
}

// ─── Geography ────────────────────────────────────────────────────────────────

/**
 * Lowercase ASCII with punctuation collapsed — the form both the locality
 * search index and the query are folded into, so "sao martinho" matches
 * "São Martinho do Bispo" and "condeixa a nova" matches "Condeixa-a-Nova".
 *
 * Shared so the seed writes exactly what the query looks for; two different
 * foldings would silently return nothing.
 */
export function foldForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface Municipality {
  id: string;
  /** INE `dtmn` code, e.g. "0603". */
  ineCode: string;
  name: string;
  /** District on the mainland, island in the Azores and Madeira. */
  district: string;
  latitude: number;
  longitude: number;
}

/** A freguesia — what the UI calls a "localidade". */
export interface Locality {
  id: string;
  name: string;
  municipalityId: string;
  municipality?: Municipality;
}

/** Longest a locality search term may be; a guard, not a domain rule. */
export const MAX_LOCALITY_QUERY_LENGTH = 80;

/** How many localities a search returns — a phone list, not a data dump. */
export const LOCALITY_SEARCH_LIMIT = 25;

/** How many localities the picker offers, ranked by distance from the origin. */
export const LOCALITY_PICKER_LIMIT = 10;

/**
 * Great-circle distance in kilometres.
 *
 * Used only to order hospitals by how far they are from where an event
 * happened, so the spherical-earth approximation (good to ~0.5%) is far better
 * than the ordering needs.
 */
export function distanceInKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const EARTH_RADIUS_KM = 6371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);
  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.latitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ─── Facilities ───────────────────────────────────────────────────────────────

/**
 * A place a crew can name in a report or a transport: a hospital, clinic or
 * private medical facility. `isEmergencyDestination` and
 * `isTransportDestination` are independent capability flags, not a type enum
 * — a hospital with an emergency room is routinely both. Default-deny: a new
 * row starts with both false until someone opts it in to a list.
 */
export interface Facility {
  id: string;
  name: string;
  municipalityId: string;
  municipality?: Municipality;
  /** Street address, for transport destinations where a centroid isn't good enough. */
  addressLine?: string | null;
  postalCode?: string | null;
  /**
   * The facility's own position when someone filled it in. Null falls back to
   * the municipality centroid for emergency ranking — a transport destination
   * must have its own coordinates, see `validateFacility`.
   */
  latitude?: number | null;
  longitude?: number | null;
  isEmergencyDestination: boolean;
  isTransportDestination: boolean;
  isActive: boolean;
  /**
   * Arrival-window overrides (#233) — each independently nullable. A facility
   * with no override on a given field inherits the delegation-wide default
   * for it; see `resolveArrivalWindowThresholds`. Facilities differ in how
   * strictly they hold their appointment times, hence per-facility rather
   * than one global rule.
   */
  arrivalWindowEarliestMinutesOverride?: number | null;
  arrivalWindowLatestMinutesOverride?: number | null;
  arrivalToleranceMinutesOverride?: number | null;
  createdAt: string;
  updatedAt: string;
}

/** A facility in the picker, with how far it is from the report's locality. */
export interface FacilityWithDistance extends Facility {
  /**
   * Kilometres from the report's locality, or null when no locality was given
   * — the picker then falls back to alphabetical order.
   */
  distanceKm: number | null;
  /**
   * True when `distanceKm` was measured from the municipality centroid rather
   * than the facility's own coordinates, so the UI can say so instead of
   * implying a precision it does not have.
   */
  approximate: boolean;
}

export const MAX_FACILITY_NAME_LENGTH = 160;

export interface FacilityInput {
  name: string;
  municipalityId: string;
  addressLine?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isEmergencyDestination?: boolean;
  isTransportDestination?: boolean;
  isActive?: boolean;
  arrivalWindowEarliestMinutesOverride?: number | null;
  arrivalWindowLatestMinutesOverride?: number | null;
  arrivalToleranceMinutesOverride?: number | null;
}

/**
 * Whether a facility record is coherent — same "message or null" shape as
 * every other validator here, so the form blocks Save with the wording the API
 * would reject the payload with.
 */
export function validateFacility(input: FacilityInput): string | null {
  const name = input.name?.trim() ?? '';
  if (!name) return 'A facility needs a name.';
  if (name.length > MAX_FACILITY_NAME_LENGTH) {
    return `A facility name may be at most ${MAX_FACILITY_NAME_LENGTH} characters (got ${name.length}).`;
  }
  if (!input.municipalityId) return 'Choose the municipality the facility is in.';

  // Both or neither: half a coordinate locates nothing.
  const hasLatitude = input.latitude !== null && input.latitude !== undefined;
  const hasLongitude = input.longitude !== null && input.longitude !== undefined;
  if (hasLatitude !== hasLongitude) {
    return 'Give both latitude and longitude, or neither.';
  }
  if (hasLatitude) {
    if (!Number.isFinite(input.latitude!) || input.latitude! < -90 || input.latitude! > 90) {
      return 'Latitude must be between -90 and 90.';
    }
    if (!Number.isFinite(input.longitude!) || input.longitude! < -180 || input.longitude! > 180) {
      return 'Longitude must be between -180 and 180.';
    }
  }

  // Default-deny needs an explicit opt-in: a facility neither list can ever
  // surface is not manageable through either picker once saved.
  if (!input.isEmergencyDestination && !input.isTransportDestination) {
    return 'Flag the facility as an emergency destination, a transport destination, or both.';
  }
  // A municipality centroid can be kilometres from the actual door — fine for
  // emergency ranking, not for sending a crew to a scheduled transport.
  if (input.isTransportDestination && !hasLatitude) {
    return 'A transport destination needs its own latitude and longitude.';
  }
  const overrideError = validateArrivalWindowThresholds({
    arrivalWindowEarliestMinutes: input.arrivalWindowEarliestMinutesOverride,
    arrivalWindowLatestMinutes: input.arrivalWindowLatestMinutesOverride,
    arrivalToleranceMinutes: input.arrivalToleranceMinutesOverride,
  });
  if (overrideError) return overrideError;
  return null;
}

/**
 * Facilities in the order the picker offers them: nearest first when the
 * report has a locality, alphabetical otherwise, with un-locatable entries
 * last.
 *
 * Shared because both the API (which sorts) and the tests (which assert the
 * order) must agree on what "nearest first" means, including the ties.
 */
export function sortFacilitiesForPicker(
  facilities: FacilityWithDistance[],
): FacilityWithDistance[] {
  return [...facilities].sort((a, b) => {
    if (a.distanceKm === null && b.distanceKm === null) {
      return a.name.localeCompare(b.name, 'pt-PT');
    }
    // A facility nobody can measure sorts after every one that can be.
    if (a.distanceKm === null) return 1;
    if (b.distanceKm === null) return -1;
    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
    return a.name.localeCompare(b.name, 'pt-PT');
  });
}

// ─── Event Reports ────────────────────────────────────────────────────────────

/**
 * What kind of activity a report accounts for.
 *
 * The same three kinds as `AvailabilityWindowCategory`, and deliberately so:
 * the type is what tells a report which rota its crew came from. A type is a
 * fixed kind with pre-defined behaviour — never configured per report.
 */
export enum EventReportType {
  EMERGENCY = 'EMERGENCY',
  LOCAL_SUPPORT = 'LOCAL_SUPPORT',
  CNE_SUPPORT = 'CNE_SUPPORT',
}

/**
 * Everything that differs between the three kinds of report, in one place.
 *
 * Every screen and every service reads its behaviour from here rather than
 * branching on the enum: adding a fourth kind of activity should mean adding a
 * row to this table, not hunting for `=== EMERGENCY` across the codebase.
 */
export interface EventReportTypeRules {
  /** Prefix of the rendered report number, e.g. "EMG 128/2026". */
  codePrefix: string;
  /** The availability-window category whose schedule staffs this type. */
  category: AvailabilityWindowCategory;
  /** Emergency chronology (activation, arrivals, available) applies. */
  hasOccurrenceTimes: boolean;
  /** Most vehicles one report may list. */
  maxVehicles: number;
  /** Most victims one report may list. */
  maxVictims: number;
  /**
   * An external reference is required rather than merely offered. True only
   * for emergencies: a CODU number is what ties the report to the national
   * record, and a report without one cannot be reconciled.
   */
  requiresExternalReference: boolean;
  /** Label for the external reference field. */
  externalReferenceLabel: string;
  /**
   * This kind of activity can be recorded live, on a phone, while it happens.
   * Only an emergency can: a support job has no CODU call to type during and
   * no chronology to stamp.
   */
  supportsLiveRun: boolean;
  /**
   * The report carries vitals, CHAMU and ABCDE findings. Clinical detail is
   * something an emergency crew records about a victim they treated; a
   * standby at a village fair records nobody.
   */
  hasClinicalRecord: boolean;
  /** A slot for the paper INEM *Verbete de Socorro* the crew was handed. */
  hasVerbete: boolean;
  /**
   * Additional INEM means (VMER, SIV, UMIP) that responded alongside the
   * crew's own vehicle. Emergency only: a support job has no CODU to dispatch
   * anyone else, so there is nothing here to record.
   */
  hasInemSupportUnits: boolean;
  /**
   * "Treated and left on scene" is an outcome this kind of report may record.
   * False only for an emergency: a CODU-dispatched victim is transported,
   * refuses transport, dies on scene, or the run is cancelled — being treated
   * and simply left behind is what a support job's own crew does, not what
   * happens on a 112 call.
   */
  allowsTreatedOnScene: boolean;
}

/** How many victims a support report may carry — a guard, not a domain rule. */
export const MAX_VICTIMS_PER_REPORT = 50;

/** How many vehicles a support report may carry — a guard, not a domain rule. */
export const MAX_VEHICLES_PER_REPORT = 20;

/**
 * Per unit type, not combined: a report may carry up to 3 VMER *and* up to 3
 * SIV *and* up to 3 UMIP entries.
 */
export const MAX_INEM_SUPPORT_UNITS_PER_TYPE = 3;

export const EVENT_REPORT_TYPE_RULES: Record<EventReportType, EventReportTypeRules> = {
  [EventReportType.EMERGENCY]: {
    codePrefix: 'EMG',
    category: AvailabilityWindowCategory.EMERGENCY,
    hasOccurrenceTimes: true,
    // One ambulance, one victim, one set of times: an emergency is one run.
    maxVehicles: 1,
    maxVictims: 1,
    requiresExternalReference: true,
    externalReferenceLabel: 'CODU',
    supportsLiveRun: true,
    hasClinicalRecord: true,
    hasVerbete: true,
    hasInemSupportUnits: true,
    allowsTreatedOnScene: false,
  },
  [EventReportType.LOCAL_SUPPORT]: {
    codePrefix: 'APL',
    category: AvailabilityWindowCategory.LOCAL_SUPPORT,
    hasOccurrenceTimes: false,
    maxVehicles: MAX_VEHICLES_PER_REPORT,
    maxVictims: MAX_VICTIMS_PER_REPORT,
    requiresExternalReference: false,
    externalReferenceLabel: 'Reference',
    supportsLiveRun: false,
    hasClinicalRecord: false,
    hasVerbete: false,
    hasInemSupportUnits: false,
    allowsTreatedOnScene: true,
  },
  [EventReportType.CNE_SUPPORT]: {
    codePrefix: 'CNE',
    category: AvailabilityWindowCategory.CNE_SUPPORT,
    hasOccurrenceTimes: false,
    maxVehicles: MAX_VEHICLES_PER_REPORT,
    maxVictims: MAX_VICTIMS_PER_REPORT,
    requiresExternalReference: false,
    externalReferenceLabel: 'Reference',
    supportsLiveRun: false,
    hasClinicalRecord: false,
    hasVerbete: false,
    hasInemSupportUnits: false,
    allowsTreatedOnScene: true,
  },
};

/** Declaration order, which is the order every picker offers them in. */
export const EVENT_REPORT_TYPES = Object.keys(EVENT_REPORT_TYPE_RULES) as EventReportType[];

/**
 * Rules for a type, falling back to the support-report shape for a value this
 * map has not caught up with — the permissive shape, so an unknown type can
 * still be read rather than crashing a list.
 */
export function eventReportRules(type: EventReportType | string): EventReportTypeRules {
  return (
    EVENT_REPORT_TYPE_RULES[type as EventReportType] ??
    EVENT_REPORT_TYPE_RULES[EventReportType.LOCAL_SUPPORT]
  );
}

/** The availability-window category whose schedule staffs a report type. */
export function categoryForEventReportType(
  type: EventReportType | string,
): AvailabilityWindowCategory {
  return eventReportRules(type).category;
}

/** The report type staffed by a window category, or null if none is. */
export function eventReportTypeForCategory(
  category: AvailabilityWindowCategory | string,
): EventReportType | null {
  return (
    EVENT_REPORT_TYPES.find(
      (type) => EVENT_REPORT_TYPE_RULES[type].category === category,
    ) ?? null
  );
}

/**
 * The identity of a report as people say it: "EMG 128/2026".
 *
 * Derived rather than stored, so `(type, year, number)` stays the single truth
 * and there is one spelling of the rule. Three digits because a delegation
 * files hundreds a year, not tens of thousands — and a wider number simply
 * takes more digits rather than wrapping.
 *
 * **Null for a draft.** A report gets its number when it is submitted, so an
 * unsubmitted one has no code at all — and inventing a placeholder ("EMG
 * —/2026") would put a string that looks like an identifier on a screen next
 * to real ones. Callers show `t('report.draftNoNumber')` instead.
 */
export function formatEventReportCode(report: {
  type: EventReportType | string;
  number?: number | null;
  year: number;
}): string | null {
  if (report.number === null || report.number === undefined) return null;
  const prefix = eventReportRules(report.type).codePrefix;
  return `${prefix} ${String(report.number).padStart(3, '0')}/${report.year}`;
}

/**
 * The inverse, for a search box: "EMG 128/2026", "emg 128/2026", "128/2026"
 * and "EMG128" all mean something, and anything else means "no code here, this
 * is a free-text search".
 */
export function parseEventReportCode(
  input: string,
): { type?: EventReportType; number?: number; year?: number } | null {
  const cleaned = input.trim().toUpperCase();
  if (!cleaned) return null;

  const match = /^([A-Z]{3})?\s*0*(\d{1,6})?(?:\s*\/\s*(\d{4}))?$/.exec(cleaned);
  if (!match) return null;

  const [, prefix, digits, year] = match;
  if (!prefix && !digits) return null;

  const type = prefix
    ? EVENT_REPORT_TYPES.find((value) => EVENT_REPORT_TYPE_RULES[value].codePrefix === prefix)
    : undefined;
  // A three-letter prefix that names no type is not a code at all.
  if (prefix && !type) return null;

  return {
    ...(type ? { type } : {}),
    ...(digits ? { number: Number(digits) } : {}),
    ...(year ? { year: Number(year) } : {}),
  };
}

/** Where an event happened, as the operational sees it — not an address. */
export enum EventLocationType {
  HOME = 'HOME',
  ROAD = 'ROAD',
  PUBLIC_SPACE = 'PUBLIC_SPACE',
  OTHER_PUBLIC_LOCATION = 'OTHER_PUBLIC_LOCATION',
  WORK_PLACE = 'WORK_PLACE',
}

/** Declaration order, which is the order the picker offers them in. */
export const EVENT_LOCATION_TYPES = Object.values(EventLocationType);

export enum Gender {
  FEMALE = 'FEMALE',
  MALE = 'MALE',
  UNKNOWN = 'UNKNOWN',
}

export const GENDERS = Object.values(Gender);

/**
 * What became of one victim.
 *
 * `HOSPITAL` is the only value that pairs with a hospital; the other four are
 * the ways a call ends with nobody transported. The database holds the pairing
 * with a CHECK constraint, and `validateEventReport` refuses it earlier with a
 * message worth showing someone.
 */
export enum VictimDestinationKind {
  HOSPITAL = 'HOSPITAL',
  TREATED_ON_SCENE = 'TREATED_ON_SCENE',
  REFUSED_TRANSPORT = 'REFUSED_TRANSPORT',
  DECEASED_ON_SCENE = 'DECEASED_ON_SCENE',
  CANCELLED = 'CANCELLED',
}

/** The destinations that are not a hospital, in the order the sheet lists them. */
export const NO_TRANSPORT_DESTINATIONS = Object.values(VictimDestinationKind).filter(
  (kind) => kind !== VictimDestinationKind.HOSPITAL,
);

/**
 * The non-hospital destinations a given report type may record — the same
 * list as `NO_TRANSPORT_DESTINATIONS`, minus `TREATED_ON_SCENE` for a report
 * type whose rules don't allow it (an emergency, today).
 */
export function noTransportDestinationsFor(
  type: EventReportType | string,
): VictimDestinationKind[] {
  const rules = eventReportRules(type);
  return rules.allowsTreatedOnScene
    ? NO_TRANSPORT_DESTINATIONS
    : NO_TRANSPORT_DESTINATIONS.filter((kind) => kind !== VictimDestinationKind.TREATED_ON_SCENE);
}

/**
 * Additional INEM means that responded alongside the crew's own vehicle — a
 * VMER or SIV backing up the ambulance, or a UMIP. Emergency-only, and paired
 * with the base hospital it was dispatched from (see `EventReportInemSupportUnit`).
 */
export enum InemSupportUnitType {
  VMER = 'VMER',
  SIV = 'SIV',
  UMIP = 'UMIP',
}

/** Declaration order, which is the order every picker offers them in. */
export const INEM_SUPPORT_UNIT_TYPES = Object.values(InemSupportUnitType);

export const MIN_VICTIM_AGE = 0;
export const MAX_VICTIM_AGE = 130;
export const MAX_OPERATIONAL_REPORT_LENGTH = 20000;
export const MAX_EXTERNAL_REFERENCE_LENGTH = 80;
/** The "número de episódio de urgência" a Portuguese ER issues on admission. */
export const MAX_HOSPITAL_EPISODE_NUMBER_LENGTH = 32;
/** Whole kilometres; a guard against a fat-fingered odometer reading. */
export const MAX_VEHICLE_KILOMETRES = 5000;
export const MAX_CREW_PER_REPORT = 20;
export const MAX_ROLE_NAME_ON_REPORT = MAX_ROLE_NAME_LENGTH;
/** How many material lines one report may carry — a guard, not a domain rule. */
export const MAX_MATERIALS_PER_REPORT = 100;

// ─── Event report shapes ──────────────────────────────────────────────────────

/**
 * Who may appear on a report's crew — exactly the roster availability is
 * collected from.
 *
 * Derived from the permission map rather than hardcoded, so a role that gains
 * `SUBMIT_AVAILABILITY` becomes crew-eligible here too instead of being
 * silently absent from the picker.
 */
export function eventReportCrewEligibleRoles(): UserRole[] {
  return availabilityEligibleRoles();
}

export interface EventReportPerson {
  id: string;
  firstName: string;
  lastName: string;
}

export interface EventReportCrewMember {
  id: string;
  userId: string;
  user?: EventReportPerson;
  /** The post as the schedule named it. Null when nobody held a post. */
  roleName?: string | null;
  position: number;
}

/**
 * One measured stretch of a run's route, as the Routes API returned it.
 *
 * Stored alongside the total so "28 km" is explainable a year later: which
 * three hops it was the sum of, and how far each was.
 */
export interface RouteLeg {
  /** Human-readable end points, e.g. "Base" → "Ceira". */
  from: string;
  to: string;
  kilometres: number;
}

export interface EventReportVehicle {
  id: string;
  vehicleId: string;
  vehicle?: Pick<Vehicle, 'id' | 'licensePlate' | 'numeroCauda'>;
  kilometres: number;
  position: number;
  /**
   * The legs `kilometres` was computed from — Base → occurrence → hospital →
   * Base. Null when nobody has computed it yet (no network at close) or when
   * the figure was typed by hand on a post-hoc report.
   */
  routeLegs?: RouteLeg[] | null;
  /**
   * The crew edited the computed figure. Kept so an edited number is visibly
   * an edit rather than silently replacing a measurement.
   */
  isOverridden: boolean;
}

/**
 * One item consumed on the activity, and by which vehicle — the report's
 * material consumption line. `quantity` is null only for an `UNLIMITED`
 * item: logged as used, with nothing to count and no stock effect (see
 * `StockMovementsService` on the backend).
 *
 * `materialItem`/`vehicle` are resolved so the show view needs no second
 * fetch — the same reason `EventReportVehicle.vehicle` above is a `Pick`.
 */
export interface EventReportMaterial {
  id: string;
  materialItemId: string;
  materialItem?: Pick<MaterialItem, 'id' | 'namePt' | 'nameEn' | 'unit' | 'type'>;
  vehicleId: string;
  vehicle?: Pick<Vehicle, 'id' | 'licensePlate' | 'numeroCauda'>;
  quantity: number | null;
  position: number;
}

export interface EventReportVictim {
  id: string;
  position: number;
  gender: Gender;
  age: number;
  destinationKind: VictimDestinationKind;
  destinationFacilityId?: string | null;
  destinationFacility?: Pick<Facility, 'id' | 'name'> | null;
  /**
   * The "número de episódio de urgência" the ER issues on admission, written
   * down by the crew. Set only when `destinationKind` is HOSPITAL, and only
   * meaningful when the report carries an external (CODU) reference.
   */
  hospitalEpisodeNumber?: string | null;
}

/**
 * One VMER/SIV/UMIP that backed up the crew, and the base it was dispatched
 * from. Emergency-only — see `EventReportTypeRules.hasInemSupportUnits`.
 */
export interface EventReportInemSupportUnit {
  id: string;
  position: number;
  unitType: InemSupportUnitType;
  facilityId: string;
  facility?: Pick<Facility, 'id' | 'name'> | null;
}

/**
 * What a report may carry: photographs taken on scene, and the paper the crew
 * was handed.
 *
 * HEIC is here because it is what an iPhone camera produces by default, and a
 * crew that has just photographed a hand-written INEM slip should not have to
 * discover a format policy. Nothing executable, nothing with a script surface.
 */
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
] as const;

export type AttachmentMimeType = (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number];

/** 20 MB — a phone photo with room to spare, and a scanned PDF. */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** Per report. A guard against a runaway camera roll, not a domain rule. */
export const MAX_ATTACHMENTS_PER_REPORT = 30;

export const MAX_ATTACHMENT_FILENAME_LENGTH = 255;

/** Whether a file may be attached, as a message or null. */
export function validateAttachment(file: {
  mimeType: string;
  byteSize: number;
  filename: string;
}): string | null {
  if (!ALLOWED_ATTACHMENT_MIME_TYPES.includes(file.mimeType as AttachmentMimeType)) {
    return 'Only photographs and PDF files can be attached.';
  }
  if (!Number.isFinite(file.byteSize) || file.byteSize <= 0) {
    return 'That file is empty.';
  }
  if (file.byteSize > MAX_ATTACHMENT_BYTES) {
    const megabytes = Math.floor(MAX_ATTACHMENT_BYTES / (1024 * 1024));
    return `Each file may be at most ${megabytes} MB.`;
  }
  if (!file.filename?.trim()) return 'That file has no name.';
  if (file.filename.length > MAX_ATTACHMENT_FILENAME_LENGTH) {
    return `A file name may be at most ${MAX_ATTACHMENT_FILENAME_LENGTH} characters.`;
  }
  return null;
}

/**
 * What an attachment *is*, as distinct from what it contains.
 *
 * A discriminator rather than a second table: the bytes, the MIME allow-list,
 * the size cap, the storage keys and the download route are all identical. Only
 * two things differ — a report has at most one VERBETE, and the Verbete has its
 * own slot on the screen instead of being one thumbnail among twenty.
 */
export enum EventReportAttachmentKind {
  /** The paper INEM *Verbete de Socorro* the crew was handed. At most one. */
  VERBETE = 'VERBETE',
  /** Photographs taken on scene, and anything else. */
  GENERAL = 'GENERAL',
}

export interface EventReportAttachment {
  id: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  kind: EventReportAttachmentKind;
  uploadedById: string;
  uploadedBy?: EventReportPerson;
  createdAt: string;
}

// ─── The clinical record ──────────────────────────────────────────────────────

/**
 * One measurable sign, and the bounds the database will accept.
 *
 * These are *hard* bounds — the widest value that is a measurement rather than
 * a typo — and the migration holds each of them as a CHECK. What a crew would
 * normally expect to see is `VITALS_PLAUSIBLE` below, and that one never
 * blocks: a real SpO₂ of 71 has to be recordable.
 */
export interface VitalRange {
  min: number;
  max: number;
  /** Unit as it is printed beside the field. */
  unit: string;
  /** Decimal places the value is stored with. 0 for everything but temperature. */
  decimals: 0 | 1;
}

/**
 * Every vital sign a set of observations may carry.
 *
 * The five the product owner named, plus SpO₂ and pain score — the other two
 * the *Verbete*'s assessment grid carries, and cheap to collect on the same
 * screen. AVDS (see `AvdsLevel` below) is level-of-consciousness too, but is
 * an enum rather than a number, so it is not a `VitalKey`.
 */
export const VITALS_RANGES = {
  spo2: { min: 0, max: 100, unit: '%', decimals: 0 },
  respiratoryRate: { min: 0, max: 120, unit: 'cpm', decimals: 0 },
  // Asystole is a real, recordable finding — 0 is a measurement, not a blank.
  heartRate: { min: 0, max: 300, unit: 'bpm', decimals: 0 },
  systolic: { min: 0, max: 300, unit: 'mmHg', decimals: 0 },
  diastolic: { min: 0, max: 300, unit: 'mmHg', decimals: 0 },
  bloodGlucose: { min: 0, max: 1000, unit: 'mg/dL', decimals: 0 },
  temperature: { min: 20, max: 45, unit: '°C', decimals: 1 },
  painScore: { min: 0, max: 10, unit: '', decimals: 0 },
} as const satisfies Record<string, VitalRange>;

export type VitalKey = keyof typeof VITALS_RANGES;

/** Declaration order, which is the order the assessment screen shows them in. */
export const VITAL_KEYS = Object.keys(VITALS_RANGES) as VitalKey[];

/**
 * What a crew would normally expect to see, for an advisory caption only.
 *
 * Never a block. The whole point of writing a vital down is that it is
 * abnormal, and a form that refused an SpO₂ of 71 would send the crew back to
 * paper.
 */
export const VITALS_PLAUSIBLE: Record<VitalKey, { min: number; max: number }> = {
  spo2: { min: 90, max: 100 },
  respiratoryRate: { min: 10, max: 24 },
  heartRate: { min: 50, max: 110 },
  systolic: { min: 90, max: 160 },
  diastolic: { min: 50, max: 100 },
  bloodGlucose: { min: 70, max: 180 },
  temperature: { min: 35.5, max: 37.5 },
  painScore: { min: 0, max: 3 },
};

/** Vitals worth flagging with a caption — never an error. */
export function implausibleVitals(
  assessment: Partial<Record<VitalKey, number | null | undefined>>,
): VitalKey[] {
  return VITAL_KEYS.filter((key) => {
    const value = assessment[key];
    if (value === null || value === undefined || !Number.isFinite(value)) return false;
    const range = VITALS_PLAUSIBLE[key];
    return value < range.min || value > range.max;
  });
}

/** Where the victim was found or placed, free text — a short one-liner. */
export const MAX_ASSESSMENT_POSITION_LENGTH = 120;

/** How many sets of vitals one report may carry — a guard, not a domain rule. */
export const MAX_ASSESSMENTS_PER_REPORT = 12;

/**
 * Level of consciousness on the Portuguese AVDS scale — the four-point scale
 * INEM/Verbete crews actually use, in place of the Glasgow Coma Scale: **A**lerta,
 * resposta a estímulos **V**erbais, resposta a estímulos **D**olorosos, **S**em
 * resposta. An enum rather than a number, so it cannot live in `VITALS_RANGES`.
 */
export enum AvdsLevel {
  A = 'A',
  V = 'V',
  D = 'D',
  S = 'S',
}

/** Declaration order, which is the order the assessment screen offers them in. */
export const AVDS_LEVELS = Object.values(AvdsLevel);

/**
 * One set of observations, taken at one moment.
 *
 * A list rather than columns on the report because a set of vitals is something
 * taken *at a time*: usually once on scene, but a deteriorating victim is
 * measured again on the way in, and "what were the vitals when they left" must
 * not overwrite "what were they when we arrived".
 */
export interface AssessmentInput extends Partial<Record<VitalKey, number | null>> {
  takenAt: string;
  /**
   * How the victim was found or placed — e.g. "decúbito dorsal", "sentada".
   * Free text; nothing queries it.
   *
   * Named `bodyPosition` rather than `position` because every other child table
   * here uses `position` for display order, and one word meaning two things in
   * sibling tables is how a wrong ORDER BY gets written.
   */
  bodyPosition?: string | null;
  /** Level of consciousness on the AVDS scale, taken at the same moment as the vitals. */
  avds?: AvdsLevel | null;
}

export interface EventReportAssessment extends AssessmentInput {
  id: string;
  /** Display order within the report, 0-based — the order they were taken. */
  position: number;
}

/** The five ABCDE bands, in the order the primary survey walks them. */
export enum AbcdeBand {
  A = 'A',
  B = 'B',
  C = 'C',
  D = 'D',
  E = 'E',
}

export const ABCDE_BANDS = Object.values(AbcdeBand);

/**
 * What the crew found in one band.
 *
 * `NOT_ASSESSED` is a real answer and different from an absent band: "we looked
 * and it was fine" and "we never got to it" are different clinical facts.
 */
export type AbcdeStatus = 'NORMAL' | 'ALTERED' | 'NOT_ASSESSED';

export const ABCDE_STATUSES: readonly AbcdeStatus[] = [
  'NORMAL',
  'ALTERED',
  'NOT_ASSESSED',
];

export interface AbcdeFinding {
  status: AbcdeStatus;
  note?: string | null;
}

/** A band with nothing recorded is simply absent. */
export type AbcdeFindings = Partial<Record<AbcdeBand, AbcdeFinding>>;

export const MAX_ABCDE_NOTE_LENGTH = 500;

/** The five CHAMU columns, as the national form orders them. */
export const CHAMU_FIELDS = [
  'chamuCircumstances',
  'chamuHistory',
  'chamuAllergies',
  'chamuMedication',
  'chamuLastMeal',
] as const;

export type ChamuField = (typeof CHAMU_FIELDS)[number];

/** Per CHAMU field. Long enough for a paragraph, short enough to read. */
export const MAX_CHAMU_LENGTH = 2000;

/**
 * The clinical part of a report: five CHAMU columns, the ABCDE block, and the
 * sets of vitals.
 *
 * Present only where `hasClinicalRecord` is true. ADO #151 removed vital signs
 * from the report; this feature puts them back, because the crew is now
 * recording them live and throwing them away at close would be worse than not
 * collecting them.
 */
export interface EventReportClinical extends Partial<Record<ChamuField, string | null>> {
  abcde?: AbcdeFindings | null;
  assessments?: AssessmentInput[];
}

/** The shift a report's crew was taken from, for display. */
export interface EventReportShift {
  scheduleId: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  slot: number;
  /** e.g. "20:00–24:00". Resolved from the window's shifts. */
  label?: string;
  /** The window the schedule belongs to, e.g. "Emergency - August". */
  windowLabel?: string;
}

export interface EventReport extends EventReportClinical {
  id: string;
  type: EventReportType;
  /**
   * Null until the report is submitted. The number is a position in the year's
   * activation-ordered sequence, and a draft has no position yet.
   */
  number: number | null;
  /**
   * What this report was called before the sequence was last recomputed. Kept
   * forever and searchable, so paper filed as "EMG 042/2026" stays findable
   * after a renumber.
   */
  legacyNumber?: number | null;
  year: number;
  /** ISO date, `YYYY-MM-DD`. */
  occurredOn: string;
  startedAt: string;
  endedAt?: string | null;
  externalReference?: string | null;
  locationType: EventLocationType;
  localityId: string;
  locality?: Locality;

  activationAt?: string | null;
  sceneArrivalAt?: string | null;
  sceneDepartureAt?: string | null;
  hospitalArrivalAt?: string | null;
  availableAt?: string | null;

  shift?: EventReportShift | null;

  operationalReport: string;

  crew: EventReportCrewMember[];
  vehicles: EventReportVehicle[];
  victims: EventReportVictim[];
  inemSupportUnits: EventReportInemSupportUnit[];
  materials: EventReportMaterial[];
  attachments: EventReportAttachment[];
  assessments: EventReportAssessment[];

  /**
   * Who filed it and when, or nulls while it is a draft.
   *
   * An actor-and-timestamp pair rather than a boolean, matching
   * `Schedule.publishedBy/publishedAt`: a transition is a fact about a person
   * and a moment. `submittedAt === null` *is* the draft state — there is no
   * separate status enum to disagree with it.
   */
  submittedAt?: string | null;
  submittedById?: string | null;
  submittedBy?: EventReportPerson | null;

  /** The live run this report was created from, when there was one. */
  liveRunId?: string | null;

  createdById: string;
  createdBy?: EventReportPerson;
  createdAt: string;
  updatedAt: string;
}

/** Whether a report has been filed, as opposed to being an open draft. */
export function isEventReportSubmitted(report: Pick<EventReport, 'submittedAt'>): boolean {
  return !isBlank(report.submittedAt);
}

/**
 * Was this person part of the activity — on the crew, or the one who filed
 * it?
 *
 * The single definition of "the team" for a report, shared by the backend's
 * write guard (`EventReportsService.assertCanWrite`) and the frontend's Edit
 * button: everyone reads the whole archive (`VIEW_EVENT_REPORTS`), but only
 * `MANAGE_EVENT_REPORTS` or being on this list may change a report that
 * isn't yours.
 */
export function isEventReportInvolved(
  report: Pick<EventReport, 'createdById' | 'crew'>,
  userId: string,
): boolean {
  if (report.createdById === userId) return true;
  return report.crew.some((member) => member.userId === userId);
}

// ─── Event report input ───────────────────────────────────────────────────────

export interface EventReportCrewInput {
  userId: string;
  roleName?: string | null;
}

export interface EventReportVehicleInput {
  vehicleId: string;
  kilometres: number;
  /** Only ever written by the distance service; a client sending it is ignored. */
  routeLegs?: RouteLeg[] | null;
  /** True once a human has changed a computed figure. */
  isOverridden?: boolean;
}

export interface EventReportVictimInput {
  gender: Gender;
  age: number;
  /**
   * Left unset rather than guessed: unlike gender and age, there is no
   * placeholder outcome that is true of every victim before someone says what
   * happened, so a fresh victim carries no destination until the crew picks
   * one. `validateVictimDestination` rejects an unset value with a message
   * asking for a choice, same as any other invalid one.
   */
  destinationKind?: VictimDestinationKind;
  /** Required when `destinationKind` is HOSPITAL, refused otherwise. */
  destinationFacilityId?: string | null;
  /**
   * The "número de episódio de urgência" the ER issues on admission, written
   * down by the crew. Set only when `destinationKind` is HOSPITAL, and only
   * meaningful when the report carries an external (CODU) reference.
   */
  hospitalEpisodeNumber?: string | null;
}

export interface EventReportInemSupportUnitInput {
  unitType: InemSupportUnitType;
  /** Required at the time the entry is added — there is no half-built entry. */
  facilityId: string;
}

/**
 * One material consumption line, as the crew enters it.
 *
 * `itemType` travels with the line rather than being looked up: the picker
 * already has the full `MaterialItem` in hand when a line is added, and
 * carrying its type here is what lets `validateEventReport` decide whether
 * `quantity` is required without a database round trip.
 */
export interface EventReportMaterialInput {
  materialItemId: string;
  itemType: InventoryItemType;
  /**
   * Defaulted server-side to the report's first vehicle when omitted — a
   * crew logging what one ambulance used should not have to pick it twice.
   */
  vehicleId?: string | null;
  /** Required (whole, > 0) for a COUNTABLE item; refused for UNLIMITED. */
  quantity?: number | null;
}

export interface EventReportShiftInput {
  scheduleId: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  slot: number;
}

/**
 * The payload that files or updates a report.
 *
 * One shape for create and update: a report is a form, and the same rules
 * decide whether it is coherent whichever verb is carrying it. Identity
 * (`type`, `number`, `year`) is not in here — the type is fixed on create and
 * the number is the server's to assign.
 */
export interface EventReportInput extends EventReportClinical {
  /** Only read on create; ignored on update, where the type is already fixed. */
  type: EventReportType;
  /** ISO date, `YYYY-MM-DD`. */
  occurredOn: string;
  startedAt: string;
  endedAt?: string | null;
  externalReference?: string | null;
  locationType: EventLocationType;
  localityId: string;

  activationAt?: string | null;
  sceneArrivalAt?: string | null;
  sceneDepartureAt?: string | null;
  hospitalArrivalAt?: string | null;
  availableAt?: string | null;

  shift?: EventReportShiftInput | null;

  operationalReport: string;

  crew: EventReportCrewInput[];
  vehicles: EventReportVehicleInput[];
  victims: EventReportVictimInput[];
  /**
   * Optional, unlike `crew`/`vehicles`/`victims`: a report from before this
   * feature existed, or one closed straight from a live run, carries none.
   */
  inemSupportUnits?: EventReportInemSupportUnitInput[];
  /**
   * Optional, matching `inemSupportUnits` above — but allowed on *every*
   * report type, unlike INEM units, which are emergency-only.
   */
  materials?: EventReportMaterialInput[];
}

/** `GET /event-reports/crew-suggestion` — the shift and crew to pre-fill with. */
export interface CrewSuggestionShift {
  scheduleId: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  slot: number;
  label: string;
  windowLabel: string;
  startMinute: number;
  endMinute: number;
  crew: Array<{
    userId: string;
    firstName: string;
    lastName: string;
    roleName?: string | null;
    isDriver: boolean;
  }>;
  /** Vehicles the schedule expected on this shift, to pre-select from. */
  vehiclesNeeded: number;
}

export interface CrewSuggestionResponse {
  /** The shift covering the given moment, if the rota has one. */
  suggested: CrewSuggestionShift | null;
  /**
   * Other recent shifts of the same rota, newest first — what the "change
   * shift" sheet offers when the report is filed after the fact.
   */
  recent: CrewSuggestionShift[];
}

// ─── Event report rules ───────────────────────────────────────────────────────

/**
 * Why a report cannot be filed.
 *
 * A code as well as a message, because the two audiences need different things:
 * the API returns the message (English, like every other API error), and the
 * wizard shows the crew a translated one keyed by the code. Returning only
 * prose would have put English on a Portuguese screen; returning only a code
 * would have made the API's 400s unreadable.
 */
export type EventReportProblemCode =
  | 'UNKNOWN_TYPE'
  | 'MISSING_DATE'
  | 'MISSING_START'
  | 'INVALID_END'
  | 'END_BEFORE_START'
  | 'MISSING_LOCATION_TYPE'
  | 'MISSING_LOCALITY'
  | 'MISSING_REFERENCE'
  | 'REFERENCE_TOO_LONG'
  | 'TIMES_NOT_FOR_TYPE'
  | 'INVALID_TIME'
  | 'TIMES_OUT_OF_ORDER'
  | 'CREW_NOT_A_LIST'
  | 'TOO_MANY_CREW'
  | 'CREW_MISSING_PERSON'
  | 'CREW_DUPLICATE'
  | 'ROLE_NAME_TOO_LONG'
  | 'VEHICLES_NOT_A_LIST'
  | 'TOO_MANY_VEHICLES'
  | 'VEHICLE_MISSING_ID'
  | 'VEHICLE_DUPLICATE'
  | 'KILOMETRES_INVALID'
  // ── Materials ──
  | 'MATERIALS_NOT_A_LIST'
  | 'TOO_MANY_MATERIALS'
  | 'MATERIAL_MISSING_ITEM'
  | 'MATERIAL_DUPLICATE'
  | 'MATERIAL_VEHICLE_NOT_ON_REPORT'
  | 'MATERIAL_QUANTITY_INVALID'
  | 'MATERIAL_QUANTITY_NOT_ALLOWED'
  | 'VICTIMS_NOT_A_LIST'
  | 'TOO_MANY_VICTIMS'
  | 'VICTIM_GENDER_MISSING'
  | 'VICTIM_AGE_INVALID'
  | 'DESTINATION_INVALID'
  | 'DESTINATION_HOSPITAL_REQUIRED'
  | 'DESTINATION_HOSPITAL_NOT_ALLOWED'
  | 'DESTINATION_NOT_FOR_TYPE'
  | 'HOSPITAL_EPISODE_NOT_ALLOWED'
  | 'HOSPITAL_EPISODE_REQUIRES_REFERENCE'
  | 'HOSPITAL_EPISODE_TOO_LONG'
  // ── INEM support units ──
  | 'INEM_UNITS_NOT_A_LIST'
  | 'INEM_UNITS_NOT_FOR_TYPE'
  | 'INEM_UNIT_INVALID_TYPE'
  | 'INEM_UNIT_HOSPITAL_REQUIRED'
  | 'TOO_MANY_INEM_UNITS'
  | 'NARRATIVE_TOO_LONG'
  | 'SHIFT_MISSING_SCHEDULE'
  | 'SHIFT_MISSING_DATE'
  | 'SHIFT_MISSING_SLOT'
  // ── The clinical record ──
  | 'CLINICAL_NOT_FOR_TYPE'
  | 'CHAMU_TOO_LONG'
  | 'ABCDE_UNKNOWN_BAND'
  | 'ABCDE_INVALID_STATUS'
  | 'ABCDE_NOTE_TOO_LONG'
  | 'ASSESSMENTS_NOT_A_LIST'
  | 'TOO_MANY_ASSESSMENTS'
  | 'ASSESSMENT_INVALID_TIME'
  | 'ASSESSMENT_EMPTY'
  | 'VITAL_OUT_OF_RANGE'
  | 'VITAL_NOT_WHOLE'
  | 'DIASTOLIC_ABOVE_SYSTOLIC'
  | 'ASSESSMENT_POSITION_TOO_LONG'
  | 'AVDS_INVALID'
  // ── Live runs ──
  | 'LIVE_RUN_MISSING_ID'
  | 'LIVE_RUN_INVALID_REVISION'
  | 'LIVE_RUN_UNKNOWN_STATE'
  | 'LIVE_RUN_MISSING_START'
  | 'LIVE_RUN_ADDRESS_TOO_LONG'
  | 'LIVE_RUN_NAME_TOO_LONG'
  | 'LIVE_RUN_INVALID_DATE_OF_BIRTH'
  | 'LIVE_RUN_INVALID_SNS'
  | 'LIVE_RUN_COMPLAINT_TOO_LONG'
  | 'LIVE_RUN_NOT_CLOSED';

export interface EventReportProblem {
  code: EventReportProblemCode;
  /** English, for the API's response and for a developer reading a log. */
  message: string;
}

const problem = (
  code: EventReportProblemCode,
  message: string,
): EventReportProblem => ({ code, message });

/**
 * What is unfinished about an otherwise-valid report.
 *
 * Codes only. These are shown exclusively to the crew, on the review step, so
 * there is no English rendering to keep — and no way for one to reach a screen
 * untranslated.
 */
export type EventReportWarningCode =
  | 'MISSING_END_TIME'
  | 'MISSING_NARRATIVE'
  | 'NO_CREW'
  | 'NO_VEHICLE'
  | 'NO_VICTIM'
  | 'NO_TIMES_MARKED';

/** Plain-text length of an HTML string, for "is this rich text actually empty". */
function richTextLength(html: string): number {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .trim().length;
}

/** Every optional emergency timestamp, in the order they happen. */
export const OCCURRENCE_TIME_FIELDS = [
  'activationAt',
  'sceneArrivalAt',
  'sceneDepartureAt',
  'hospitalArrivalAt',
  'availableAt',
] as const;

export type OccurrenceTimeField = (typeof OCCURRENCE_TIME_FIELDS)[number];

/**
 * English on purpose, and it stays that way (#180 phase 2) — this only ever
 * builds the English `EventReportProblem.message` for
 * `TIMES_NOT_FOR_TYPE`/`INVALID_TIME`/`TIMES_OUT_OF_ORDER`, which is already
 * fallback-only: the client translates by `problem.<code>` in
 * `i18n/labels.ts`'s `problemLabel()`, keyed on `code`, not on this text.
 * `i18n/labels.test.ts`'s exhaustive walk of `EventReportProblemCode` is what
 * actually guarantees nothing here reaches a screen — every code that can
 * embed this text has its own translated `problem.*` entry, so `problemLabel`
 * never falls through to it.
 */
const OCCURRENCE_TIME_LABELS: Record<OccurrenceTimeField, string> = {
  activationAt: 'Activation',
  sceneArrivalAt: 'Arrival on scene',
  sceneDepartureAt: 'Departure from scene',
  hospitalArrivalAt: 'Arrival at hospital',
  availableAt: 'Available',
};

const isBlank = (value: string | null | undefined): boolean =>
  value === null || value === undefined || value === '';

const parseInstant = (value: string): number => new Date(value).getTime();

const isInstant = (value: string): boolean => Number.isFinite(parseInstant(value));

/**
 * Whether a report payload is coherent, as a problem to show or null when it is
 * fine.
 *
 * The same "problem or null" shape as `validateDayShifts` and
 * `validateWindowRoles`, and for the same reason: the wizard blocks its last
 * step on exactly what the API would reject the payload for, so nobody ever
 * sees a form that submits and fails.
 *
 * What this deliberately does *not* enforce: a complete report. A crew filing
 * from a layby must be able to save what they know — no end time, no victim, no
 * narrative yet — and finish later. Only contradictions are refused; everything
 * merely unfinished comes back from `eventReportWarnings`.
 */
export function validateEventReport(input: EventReportInput): EventReportProblem | null {
  const rules = eventReportRules(input.type);

  if (!EVENT_REPORT_TYPES.includes(input.type)) {
    return problem('UNKNOWN_TYPE', `Unknown report type "${input.type}".`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn ?? '')) {
    return problem('MISSING_DATE', 'The report needs the date the activity happened.');
  }
  if (isBlank(input.startedAt) || !isInstant(input.startedAt)) {
    return problem('MISSING_START', 'The report needs a start time.');
  }
  if (!isBlank(input.endedAt)) {
    if (!isInstant(input.endedAt!)) {
      return problem('INVALID_END', 'The end time is not a valid time.');
    }
    if (parseInstant(input.endedAt!) < parseInstant(input.startedAt)) {
      return problem('END_BEFORE_START', 'The activity cannot end before it starts.');
    }
  }

  if (!EVENT_LOCATION_TYPES.includes(input.locationType)) {
    return problem('MISSING_LOCATION_TYPE', 'Choose where this happened.');
  }
  if (!input.localityId) {
    return problem('MISSING_LOCALITY', 'Choose the locality this happened in.');
  }

  const reference = input.externalReference?.trim() ?? '';
  if (rules.requiresExternalReference && !reference) {
    return problem(
      'MISSING_REFERENCE',
      `The ${rules.externalReferenceLabel} number is required on an emergency report.`,
    );
  }
  if (reference.length > MAX_EXTERNAL_REFERENCE_LENGTH) {
    return problem(
      'REFERENCE_TOO_LONG',
      `The reference may be at most ${MAX_EXTERNAL_REFERENCE_LENGTH} characters (got ${reference.length}).`,
    );
  }

  const timesProblem = validateOccurrenceTimes(input);
  if (timesProblem) return timesProblem;

  const crewProblem = validateCrew(input.crew);
  if (crewProblem) return crewProblem;

  const vehiclesProblem = validateVehicles(input.vehicles, rules);
  if (vehiclesProblem) return vehiclesProblem;

  const materialsProblem = validateMaterials(input.materials, input.vehicles);
  if (materialsProblem) return materialsProblem;

  const victimsProblem = validateVictims(input.victims, rules, input.externalReference);
  if (victimsProblem) return victimsProblem;

  const inemUnitsProblem = validateInemSupportUnits(input.inemSupportUnits, rules);
  if (inemUnitsProblem) return inemUnitsProblem;

  const clinicalProblem = validateClinicalRecord(input, rules);
  if (clinicalProblem) return clinicalProblem;

  // An empty narrative is *not* an error. A crew filing from a layby saves what
  // it has and writes the account later; refusing the save would mean the report
  // never gets filed at all. It comes back from `eventReportWarnings` instead.
  if ((input.operationalReport ?? '').length > MAX_OPERATIONAL_REPORT_LENGTH) {
    return problem(
      'NARRATIVE_TOO_LONG',
      `The operational report is too long (max ${MAX_OPERATIONAL_REPORT_LENGTH} characters).`,
    );
  }

  if (input.shift) {
    if (!input.shift.scheduleId) {
      return problem('SHIFT_MISSING_SCHEDULE', 'The shift reference needs a schedule.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.shift.date)) {
      return problem('SHIFT_MISSING_DATE', 'The shift reference needs a date.');
    }
    if (!Number.isInteger(input.shift.slot) || input.shift.slot < 1) {
      return problem('SHIFT_MISSING_SLOT', 'The shift reference needs a slot.');
    }
  }

  return null;
}

/**
 * The optional emergency chronology: present only on emergencies, and in order
 * when more than one is filled in.
 *
 * Each timestamp is independently optional — a crew stamps what it has time to
 * stamp — so the ordering rule only ever compares the ones that are there.
 */
export function validateOccurrenceTimes(
  input: Pick<EventReportInput, 'type'> & Partial<Record<OccurrenceTimeField, string | null>>,
): EventReportProblem | null {
  const rules = eventReportRules(input.type);

  const filled: Array<{ field: OccurrenceTimeField; at: number }> = [];
  for (const field of OCCURRENCE_TIME_FIELDS) {
    const value = input[field];
    if (isBlank(value)) continue;
    if (!rules.hasOccurrenceTimes) {
      return problem(
        'TIMES_NOT_FOR_TYPE',
        `${OCCURRENCE_TIME_LABELS[field]} is only recorded on an emergency report.`,
      );
    }
    if (!isInstant(value!)) {
      return problem(
        'INVALID_TIME',
        `${OCCURRENCE_TIME_LABELS[field]} is not a valid time.`,
      );
    }
    filled.push({ field, at: parseInstant(value!) });
  }

  for (let index = 1; index < filled.length; index += 1) {
    const previous = filled[index - 1];
    const current = filled[index];
    if (current.at < previous.at) {
      return problem(
        'TIMES_OUT_OF_ORDER',
        `${OCCURRENCE_TIME_LABELS[current.field]} cannot be before ${OCCURRENCE_TIME_LABELS[
          previous.field
        ].toLowerCase()}.`,
      );
    }
  }

  return null;
}

/**
 * The clinical record: refused outright on a type that has none, and otherwise
 * checked field by field.
 *
 * Refusing it on a support report is the same rule as refusing a stray
 * occurrence timestamp — a standby at a village fair has no victim to have
 * vitals — and it is stated here rather than as five more CHECK constraints for
 * the same reason.
 */
export function validateClinicalRecord(
  input: EventReportClinical,
  rules: EventReportTypeRules,
): EventReportProblem | null {
  const hasChamu = CHAMU_FIELDS.some((field) => !isBlank(input[field]));
  const hasAbcde = input.abcde ? Object.keys(input.abcde).length > 0 : false;
  const assessments = input.assessments ?? [];

  if (!rules.hasClinicalRecord) {
    if (hasChamu || hasAbcde || assessments.length > 0) {
      return problem(
        'CLINICAL_NOT_FOR_TYPE',
        'Clinical observations are only recorded on an emergency report.',
      );
    }
    return null;
  }

  for (const field of CHAMU_FIELDS) {
    const value = input[field];
    if (!isBlank(value) && value!.length > MAX_CHAMU_LENGTH) {
      return problem(
        'CHAMU_TOO_LONG',
        `Each CHAMU note may be at most ${MAX_CHAMU_LENGTH} characters.`,
      );
    }
  }

  if (input.abcde) {
    for (const [band, finding] of Object.entries(input.abcde)) {
      if (!ABCDE_BANDS.includes(band as AbcdeBand)) {
        return problem('ABCDE_UNKNOWN_BAND', `"${band}" is not an ABCDE band.`);
      }
      if (!finding) continue;
      if (!ABCDE_STATUSES.includes(finding.status)) {
        return problem(
          'ABCDE_INVALID_STATUS',
          `Band ${band} needs a status of normal, altered or not assessed.`,
        );
      }
      if ((finding.note ?? '').length > MAX_ABCDE_NOTE_LENGTH) {
        return problem(
          'ABCDE_NOTE_TOO_LONG',
          `An ABCDE note may be at most ${MAX_ABCDE_NOTE_LENGTH} characters.`,
        );
      }
    }
  }

  if (!Array.isArray(assessments)) {
    return problem('ASSESSMENTS_NOT_A_LIST', 'The observations are missing.');
  }
  if (assessments.length > MAX_ASSESSMENTS_PER_REPORT) {
    return problem(
      'TOO_MANY_ASSESSMENTS',
      `A report may carry at most ${MAX_ASSESSMENTS_PER_REPORT} sets of observations (got ${assessments.length}).`,
    );
  }
  for (const assessment of assessments) {
    const assessmentProblem = validateAssessment(assessment);
    if (assessmentProblem) return assessmentProblem;
  }

  return null;
}

/**
 * One set of observations.
 *
 * The two rules worth naming: a set with no measurement in it at all is not an
 * observation (the database says the same with `num_nonnulls(...) >= 1`), and a
 * diastolic above the systolic is a transcription error rather than a reading —
 * every other out-of-range value is merely advisory.
 */
export function validateAssessment(
  assessment: AssessmentInput,
): EventReportProblem | null {
  if (isBlank(assessment?.takenAt) || !isInstant(assessment.takenAt)) {
    return problem(
      'ASSESSMENT_INVALID_TIME',
      'A set of observations needs the time it was taken.',
    );
  }

  const measured = VITAL_KEYS.filter((key) => {
    const value = assessment[key];
    return value !== null && value !== undefined;
  });

  if (
    measured.length === 0 &&
    isBlank(assessment.bodyPosition) &&
    (assessment.avds === null || assessment.avds === undefined)
  ) {
    return problem(
      'ASSESSMENT_EMPTY',
      'A set of observations with nothing measured in it is not an observation.',
    );
  }

  if (
    assessment.avds !== null &&
    assessment.avds !== undefined &&
    !AVDS_LEVELS.includes(assessment.avds)
  ) {
    return problem('AVDS_INVALID', `Unknown AVDS level "${assessment.avds}".`);
  }

  for (const key of measured) {
    const value = assessment[key]!;
    const range = VITALS_RANGES[key];
    if (!Number.isFinite(value) || value < range.min || value > range.max) {
      return problem(
        'VITAL_OUT_OF_RANGE',
        `${key} must be between ${range.min} and ${range.max}${
          range.unit ? ` ${range.unit}` : ''
        }.`,
      );
    }
    // Its own code rather than reusing the range one: "must be a whole number"
    // and "must be between 0 and 300" are different corrections, and the field
    // that shows them has to be able to tell a crew which one to make.
    if (range.decimals === 0 && !Number.isInteger(value)) {
      return problem('VITAL_NOT_WHOLE', `${key} must be a whole number.`);
    }
  }

  const { systolic, diastolic } = assessment;
  if (
    systolic !== null &&
    systolic !== undefined &&
    diastolic !== null &&
    diastolic !== undefined &&
    diastolic > systolic
  ) {
    return problem(
      'DIASTOLIC_ABOVE_SYSTOLIC',
      'The diastolic pressure cannot be above the systolic.',
    );
  }

  if ((assessment.bodyPosition ?? '').length > MAX_ASSESSMENT_POSITION_LENGTH) {
    return problem(
      'ASSESSMENT_POSITION_TOO_LONG',
      `The position may be at most ${MAX_ASSESSMENT_POSITION_LENGTH} characters.`,
    );
  }

  return null;
}

function validateCrew(crew: EventReportCrewInput[]): EventReportProblem | null {
  if (!Array.isArray(crew)) return problem('CREW_NOT_A_LIST', 'The crew is missing.');
  if (crew.length > MAX_CREW_PER_REPORT) {
    return problem(
      'TOO_MANY_CREW',
      `A report may list at most ${MAX_CREW_PER_REPORT} people (got ${crew.length}).`,
    );
  }
  const seen = new Set<string>();
  for (const member of crew) {
    if (!member.userId) {
      return problem('CREW_MISSING_PERSON', 'Every crew member needs to be a real person.');
    }
    if (seen.has(member.userId)) {
      return problem('CREW_DUPLICATE', 'The same person is listed twice on the crew.');
    }
    seen.add(member.userId);
    const roleName = member.roleName?.trim() ?? '';
    if (roleName.length > MAX_ROLE_NAME_ON_REPORT) {
      return problem(
        'ROLE_NAME_TOO_LONG',
        `A role name may be at most ${MAX_ROLE_NAME_ON_REPORT} characters.`,
      );
    }
  }
  return null;
}

function validateVehicles(
  vehicles: EventReportVehicleInput[],
  rules: EventReportTypeRules,
): EventReportProblem | null {
  if (!Array.isArray(vehicles)) {
    return problem('VEHICLES_NOT_A_LIST', 'The vehicles are missing.');
  }
  if (vehicles.length > rules.maxVehicles) {
    return problem(
      'TOO_MANY_VEHICLES',
      rules.maxVehicles === 1
        ? 'An emergency report records a single vehicle.'
        : `A report may list at most ${rules.maxVehicles} vehicles (got ${vehicles.length}).`,
    );
  }
  const seen = new Set<string>();
  for (const vehicle of vehicles) {
    if (!vehicle.vehicleId) {
      return problem('VEHICLE_MISSING_ID', 'Every vehicle line needs a vehicle.');
    }
    if (seen.has(vehicle.vehicleId)) {
      return problem('VEHICLE_DUPLICATE', 'The same vehicle is listed twice.');
    }
    seen.add(vehicle.vehicleId);
    if (
      !Number.isInteger(vehicle.kilometres) ||
      vehicle.kilometres < 0 ||
      vehicle.kilometres > MAX_VEHICLE_KILOMETRES
    ) {
      return problem(
        'KILOMETRES_INVALID',
        `Kilometres must be a whole number between 0 and ${MAX_VEHICLE_KILOMETRES}.`,
      );
    }
  }
  return null;
}

/**
 * Material consumption lines: allowed on every report type, unlike INEM
 * support units — so there is no `rules` gate here, only structural checks.
 *
 * `itemType` travels on each line (see `EventReportMaterialInput`), which is
 * what lets this decide "quantity required" vs "quantity refused" without a
 * database round trip — the same reason `validateVictimDestination` never
 * needs to look a hospital up to know one is required.
 */
function validateMaterials(
  materials: EventReportMaterialInput[] | undefined,
  vehicles: EventReportVehicleInput[],
): EventReportProblem | null {
  if (materials === undefined) return null;
  if (!Array.isArray(materials)) {
    return problem('MATERIALS_NOT_A_LIST', 'The materials are not a list.');
  }
  if (materials.length > MAX_MATERIALS_PER_REPORT) {
    return problem(
      'TOO_MANY_MATERIALS',
      `A report may list at most ${MAX_MATERIALS_PER_REPORT} materials (got ${materials.length}).`,
    );
  }

  const vehicleIds = new Set(vehicles.map((vehicle) => vehicle.vehicleId));
  const seen = new Set<string>();
  for (const material of materials) {
    if (!material.materialItemId) {
      return problem('MATERIAL_MISSING_ITEM', 'Every material line needs an item.');
    }
    if (!material.vehicleId || !vehicleIds.has(material.vehicleId)) {
      return problem(
        'MATERIAL_VEHICLE_NOT_ON_REPORT',
        'A material line can only be attributed to a vehicle already on this report.',
      );
    }
    const key = `${material.materialItemId}#${material.vehicleId}`;
    if (seen.has(key)) {
      return problem(
        'MATERIAL_DUPLICATE',
        'The same item is listed twice for the same vehicle.',
      );
    }
    seen.add(key);

    if (material.itemType === InventoryItemType.UNLIMITED) {
      if (material.quantity !== null && material.quantity !== undefined) {
        return problem(
          'MATERIAL_QUANTITY_NOT_ALLOWED',
          'An unlimited item is logged with no quantity.',
        );
      }
    } else if (!Number.isInteger(material.quantity) || (material.quantity as number) <= 0) {
      return problem('MATERIAL_QUANTITY_INVALID', 'Enter how many units were used.');
    }
  }
  return null;
}

function validateVictims(
  victims: EventReportVictimInput[],
  rules: EventReportTypeRules,
  externalReference: string | null | undefined,
): EventReportProblem | null {
  if (!Array.isArray(victims)) {
    return problem('VICTIMS_NOT_A_LIST', 'The victims are missing.');
  }
  if (victims.length > rules.maxVictims) {
    return problem(
      'TOO_MANY_VICTIMS',
      rules.maxVictims === 1
        ? 'An emergency report records a single victim.'
        : `A report may list at most ${rules.maxVictims} victims (got ${victims.length}).`,
    );
  }
  const hasReference = !isBlank(externalReference);
  for (const victim of victims) {
    if (!GENDERS.includes(victim.gender)) {
      return problem('VICTIM_GENDER_MISSING', 'Every victim needs a gender.');
    }
    if (
      !Number.isInteger(victim.age) ||
      victim.age < MIN_VICTIM_AGE ||
      victim.age > MAX_VICTIM_AGE
    ) {
      return problem(
        'VICTIM_AGE_INVALID',
        `A victim's age must be between ${MIN_VICTIM_AGE} and ${MAX_VICTIM_AGE}.`,
      );
    }
    const destinationProblem = validateVictimDestination(victim, rules);
    if (destinationProblem) return destinationProblem;
    // The gate is the reference, not the report type: a victim's hospital
    // episode number is only ever legible alongside the CODU/external
    // reference that ties the report back to the same call.
    if (!hasReference && !isBlank(victim.hospitalEpisodeNumber)) {
      return problem(
        'HOSPITAL_EPISODE_REQUIRES_REFERENCE',
        'A hospital episode number needs the report to carry an external reference.',
      );
    }
    if (
      (victim.hospitalEpisodeNumber ?? '').length > MAX_HOSPITAL_EPISODE_NUMBER_LENGTH
    ) {
      return problem(
        'HOSPITAL_EPISODE_TOO_LONG',
        `The hospital episode number may be at most ${MAX_HOSPITAL_EPISODE_NUMBER_LENGTH} characters.`,
      );
    }
  }
  return null;
}

/**
 * A victim is either transported to a hospital or not transported at all. The
 * database holds the same pairing as a CHECK constraint; this one exists to
 * say so in words before the request is sent.
 *
 * `rules` is required, not defaulted, so no call site can skip the
 * type-specific check below by omission — there are only a handful of call
 * sites in the whole repo.
 */
export function validateVictimDestination(
  victim: Pick<
    EventReportVictimInput,
    'destinationKind' | 'destinationFacilityId' | 'hospitalEpisodeNumber'
  >,
  rules: EventReportTypeRules,
): EventReportProblem | null {
  if (!Object.values(VictimDestinationKind).includes(victim.destinationKind as VictimDestinationKind)) {
    return problem(
      'DESTINATION_INVALID',
      'Choose where the victim was taken, or why they were not transported.',
    );
  }
  const facilityId = victim.destinationFacilityId ?? null;
  if (victim.destinationKind === VictimDestinationKind.HOSPITAL && !facilityId) {
    return problem(
      'DESTINATION_HOSPITAL_REQUIRED',
      'Choose which hospital the victim was taken to.',
    );
  }
  if (victim.destinationKind !== VictimDestinationKind.HOSPITAL && facilityId) {
    return problem(
      'DESTINATION_HOSPITAL_NOT_ALLOWED',
      'A victim who was not transported cannot have a hospital.',
    );
  }
  if (
    victim.destinationKind !== VictimDestinationKind.HOSPITAL &&
    !isBlank(victim.hospitalEpisodeNumber)
  ) {
    return problem(
      'HOSPITAL_EPISODE_NOT_ALLOWED',
      'A victim who was not taken to a hospital cannot have a hospital episode number.',
    );
  }
  if (victim.destinationKind === VictimDestinationKind.TREATED_ON_SCENE && !rules.allowsTreatedOnScene) {
    return problem(
      'DESTINATION_NOT_FOR_TYPE',
      'Treated on scene is only recorded on a support report — an emergency victim is transported, refuses transport, dies on scene, or the run is cancelled.',
    );
  }
  return null;
}

/**
 * Additional INEM support units: refused outright on a type that carries none
 * (a support job has no CODU to dispatch anyone else), otherwise checked entry
 * by entry with the cap enforced per unit type — up to 3 VMER *and* up to 3
 * SIV *and* up to 3 UMIP, not one combined total.
 */
export function validateInemSupportUnits(
  units: EventReportInemSupportUnitInput[] | undefined,
  rules: EventReportTypeRules,
): EventReportProblem | null {
  if (units === undefined) return null;
  if (!Array.isArray(units)) {
    return problem('INEM_UNITS_NOT_A_LIST', 'The INEM support units are not a list.');
  }
  if (!rules.hasInemSupportUnits && units.length > 0) {
    return problem(
      'INEM_UNITS_NOT_FOR_TYPE',
      'Additional INEM support units are only recorded on an emergency report.',
    );
  }
  const counts: Record<string, number> = {};
  for (const unit of units) {
    if (!INEM_SUPPORT_UNIT_TYPES.includes(unit.unitType)) {
      return problem('INEM_UNIT_INVALID_TYPE', 'Every INEM support unit needs a valid type.');
    }
    if (!unit.facilityId) {
      return problem(
        'INEM_UNIT_HOSPITAL_REQUIRED',
        'Choose which hospital the INEM support unit came from.',
      );
    }
    counts[unit.unitType] = (counts[unit.unitType] ?? 0) + 1;
    if (counts[unit.unitType] > MAX_INEM_SUPPORT_UNITS_PER_TYPE) {
      return problem(
        'TOO_MANY_INEM_UNITS',
        `A report may list at most ${MAX_INEM_SUPPORT_UNITS_PER_TYPE} ${unit.unitType} units.`,
      );
    }
  }
  return null;
}

/**
 * What is missing from an otherwise-valid report, as warnings rather than
 * errors: the review step shows these and still lets the crew save.
 *
 * Separate from `validateEventReport` on purpose. That function answers "is
 * this coherent"; this one answers "is this finished" — and the answer to the
 * second must never block a save.
 */
export function eventReportWarnings(input: EventReportInput): EventReportWarningCode[] {
  const rules = eventReportRules(input.type);
  const warnings: EventReportWarningCode[] = [];

  if (isBlank(input.endedAt)) warnings.push('MISSING_END_TIME');
  if (richTextLength(input.operationalReport ?? '') === 0) {
    warnings.push('MISSING_NARRATIVE');
  }
  if (input.crew.length === 0) warnings.push('NO_CREW');
  if (input.vehicles.length === 0) warnings.push('NO_VEHICLE');
  if (input.victims.length === 0) warnings.push('NO_VICTIM');

  if (rules.hasOccurrenceTimes) {
    const marked = OCCURRENCE_TIME_FIELDS.filter((field) => !isBlank(input[field]));
    if (marked.length === 0) warnings.push('NO_TIMES_MARKED');
  }

  return warnings;
}

/** Total kilometres across a report's vehicles — the figure the UI totals. */
export function totalKilometres(
  vehicles: Array<Pick<EventReportVehicle, 'kilometres'>>,
): number {
  return vehicles.reduce((total, vehicle) => total + vehicle.kilometres, 0);
}

/** How many of a report's victims were taken to a hospital. */
export function transportedVictimCount(
  victims: Array<Pick<EventReportVictim, 'destinationKind'>>,
): number {
  return victims.filter(
    (victim) => victim.destinationKind === VictimDestinationKind.HOSPITAL,
  ).length;
}
// ─── Event report queries ─────────────────────────────────────────────────────

/** `GET /event-reports` filters — everything a coordinator narrows a list by. */
export interface EventReportListFilters {
  type?: EventReportType;
  /** ISO date, `YYYY-MM-DD`. Inclusive. */
  from?: string;
  /** ISO date, `YYYY-MM-DD`. Inclusive. */
  to?: string;
  /** Free text, matched against the report code, locality and crew names. */
  q?: string;
  /**
   * Filed, still a draft, or both. Defaults to both: a crew's own list is where
   * an unfinished report has to be visible, or forgetting the paperwork leaves
   * nothing to see.
   */
  filed?: EventReportFiledState;
}

/**
 * Per-type counts for the list's filter tabs. Always carries every type, so a
 * tab showing zero is a tab that says "none yet" rather than one that vanishes.
 */
export type EventReportCounts = Record<EventReportType | 'ALL', number>;

/** `GET /event-reports` filters gain one more axis once drafts exist. */
export type EventReportFiledState = 'ALL' | 'DRAFT' | 'SUBMITTED';

/**
 * `POST /event-reports/:id/submit` — the filed report, and every report whose
 * printed number moved to make room for it.
 *
 * The list of displaced reports is returned rather than merely logged because
 * the coordinator who caused it is the one person who can go and correct the
 * paper.
 */
export interface EventReportSubmitResponse {
  report: EventReport;
  renumbered: ReportRenumber[];
}

/** `DELETE /event-reports/:id` — deleting closes the gap it leaves. */
export interface EventReportDeleteResponse {
  id: string;
  renumbered: ReportRenumber[];
}

// ─── Numbering ────────────────────────────────────────────────────────────────

/**
 * The order a `(type, year)` partition is numbered in.
 *
 * This is the testable twin of the SQL `ORDER BY` in
 * `event-report-numbering.ts`: activation time first (falling back to the start
 * time for a report that never stamped one), then when it was created, then the
 * id. The id is there to make the ordering *total* — two reports activated in
 * the same second and created in the same millisecond must still have a
 * defined order, or the same partition renumbers differently on two runs.
 */
export interface NumberableReport {
  id: string;
  activationAt?: string | null;
  startedAt: string;
  createdAt: string;
}

export function orderForNumbering<T extends NumberableReport>(reports: T[]): T[] {
  const key = (report: T) => new Date(report.activationAt || report.startedAt).getTime();
  return [...reports].sort((a, b) => {
    const byActivation = key(a) - key(b);
    if (byActivation !== 0) return byActivation;
    const byCreation = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (byCreation !== 0) return byCreation;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * What a resequence did, one line per report whose printed number moved.
 *
 * Logged rather than merely returned, because renumbering rewrites the identity
 * of reports that are already on paper: "EMG 128/2026 is now EMG 127/2026" has
 * to be answerable a year later.
 */
export interface ReportRenumber {
  reportId: string;
  from: number | null;
  to: number;
}

// ─── The delegation's own configuration ───────────────────────────────────────

/**
 * Planning policy, not physics (#233): a soft customer-experience read of how
 * a planned arrival lands against a treatment's start time. The hard
 * constraint the planning board must never violate is delivering by
 * `appointmentAt`; a coordinator routinely trades the early bound away on
 * purpose (two patients at the same facility an hour apart sharing one
 * route), so this is advisory, never a block.
 */
export interface ArrivalWindowThresholds {
  /** Do not arrive more than this many minutes before treatment start. */
  arrivalWindowEarliestMinutes: number;
  /** Do not arrive later than this many minutes before treatment start. */
  arrivalWindowLatestMinutes: number;
  /** The late arrival that may be tolerated as a last resort, in minutes
   * past `arrivalWindowLatestMinutes`. */
  arrivalToleranceMinutes: number;
}

export const DEFAULT_ARRIVAL_WINDOW_THRESHOLDS: ArrivalWindowThresholds = {
  arrivalWindowEarliestMinutes: 30,
  arrivalWindowLatestMinutes: 5,
  arrivalToleranceMinutes: 10,
};

/** The nullable slice of `Facility` that can override the delegation-wide
 * thresholds — field by field, not all-or-nothing. */
export type ArrivalWindowThresholdsOverride = {
  arrivalWindowEarliestMinutesOverride?: number | null;
  arrivalWindowLatestMinutesOverride?: number | null;
  arrivalToleranceMinutesOverride?: number | null;
};

/**
 * A per-facility override wins, field by field; a facility with no override
 * on a given field inherits the delegation-wide default for it (#233).
 */
export function resolveArrivalWindowThresholds(
  defaults: ArrivalWindowThresholds,
  override?: ArrivalWindowThresholdsOverride | null,
): ArrivalWindowThresholds {
  return {
    arrivalWindowEarliestMinutes:
      override?.arrivalWindowEarliestMinutesOverride ?? defaults.arrivalWindowEarliestMinutes,
    arrivalWindowLatestMinutes:
      override?.arrivalWindowLatestMinutesOverride ?? defaults.arrivalWindowLatestMinutes,
    arrivalToleranceMinutes: override?.arrivalToleranceMinutesOverride ?? defaults.arrivalToleranceMinutes,
  };
}

/** Same "message or null" shape as every other validator here. Every field is
 * optional and nullable so it doubles as the per-facility override's
 * validator — a facility patch supplies only the fields it overrides, and
 * `null` clears one back to inheriting the default. */
export function validateArrivalWindowThresholds(
  input: Partial<Record<keyof ArrivalWindowThresholds, number | null | undefined>>,
): string | null {
  for (const value of Object.values(input)) {
    if (value === null || value === undefined) continue;
    if (!Number.isInteger(value) || value < 0) {
      return 'Arrival window thresholds must be whole numbers of minutes, zero or more.';
    }
  }
  if (
    input.arrivalWindowEarliestMinutes != null &&
    input.arrivalWindowLatestMinutes != null &&
    input.arrivalWindowEarliestMinutes < input.arrivalWindowLatestMinutes
  ) {
    return 'The earliest-arrival threshold cannot be lower than the latest-arrival threshold.';
  }
  return null;
}

/**
 * A planned arrival's timing read against a leg's effective thresholds — for
 * the planning board Feature #219 will build. `null` means on time: no
 * earlier than `arrivalWindowEarliestMinutes` before treatment start, no
 * later than `arrivalWindowLatestMinutes` before it.
 */
export type ArrivalWindowWarning = 'TOO_EARLY' | 'LATE_WITHIN_TOLERANCE' | 'LATE_BEYOND_TOLERANCE' | null;

export function arrivalWindowWarning(
  plannedArrivalAt: string,
  appointmentAt: string,
  thresholds: ArrivalWindowThresholds,
): ArrivalWindowWarning {
  const minutesBeforeAppointment =
    (new Date(appointmentAt).getTime() - new Date(plannedArrivalAt).getTime()) / 60_000;
  if (minutesBeforeAppointment > thresholds.arrivalWindowEarliestMinutes) return 'TOO_EARLY';
  if (minutesBeforeAppointment >= thresholds.arrivalWindowLatestMinutes) return null;
  if (minutesBeforeAppointment >= thresholds.arrivalWindowLatestMinutes - thresholds.arrivalToleranceMinutes) {
    return 'LATE_WITHIN_TOLERANCE';
  }
  return 'LATE_BEYOND_TOLERANCE';
}

/**
 * The handful of values that are the same for every run of this delegation.
 *
 * Configuration rather than constants in code: one place, identical for every
 * run, and changeable without a deploy when the delegation moves or the
 * freephone number changes.
 */
export interface DelegationSettings extends ArrivalWindowThresholds {
  baseName: string;
  baseLatitude: number;
  baseLongitude: number;
  /** Dialled from the live-run overflow menu, and the dial time is stamped. */
  coduDadosPhone: string;
}

/**
 * Campo, Barcelos — resolved once from the delegation's map pin and stored as
 * coordinates rather than a `maps.app.goo.gl` short link, which can rot. The
 * Routes API takes lat/lng waypoints directly, so there is no geocoding step
 * and no ambiguity about which "Campo" is meant.
 */
export const DEFAULT_DELEGATION_SETTINGS: DelegationSettings = {
  baseName: 'Cruz Vermelha Portuguesa — Delegação de Campo',
  baseLatitude: 41.5923783,
  baseLongitude: -8.6117829,
  coduDadosPhone: '+351800203264',
  ...DEFAULT_ARRIVAL_WINDOW_THRESHOLDS,
};

// ─── Live emergency runs ──────────────────────────────────────────────────────

/**
 * Where a run has got to.
 *
 * A run is a walk through these in order, except that `CLOSED` is reachable
 * from *every* stage: a call can be stood down at any point, and the crew must
 * never be stuck in a state the screen cannot leave.
 */
export enum LiveRunState {
  INTAKE = 'INTAKE',
  EN_ROUTE = 'EN_ROUTE',
  ON_SCENE = 'ON_SCENE',
  EN_ROUTE_TO_HOSPITAL = 'EN_ROUTE_TO_HOSPITAL',
  AT_HOSPITAL = 'AT_HOSPITAL',
  CLOSED = 'CLOSED',
}

export const LIVE_RUN_STATES = Object.values(LiveRunState);

/** Which live screen a state is captured on. Also the URL segment. */
export type LiveScreen =
  | 'intake'
  | 'enroute'
  | 'scene'
  | 'assessment'
  | 'transport'
  | 'closing';

export const LIVE_SCREENS: readonly LiveScreen[] = [
  'intake',
  'enroute',
  'scene',
  'assessment',
  'transport',
  'closing',
];

export interface LiveRunStateRules {
  /** The screen this state is worked on. */
  screen: LiveScreen;
  /** The state the primary transition moves to, or null at the end. */
  next: LiveRunState | null;
  /** The occurrence timestamp that transition stamps, or null. */
  stamps: OccurrenceTimeField | null;
}

/**
 * Which stamp each transition writes, as a table rather than a chain of `if`s.
 *
 * The same shape as `EVENT_REPORT_TYPE_RULES` and for the same reason: the
 * bottom bar's label, the stamp it writes and the screen it lives on are one
 * fact about a state, and reading them from one place is what makes the state
 * table itself a unit test.
 */
export const LIVE_RUN_STATE_RULES: Record<LiveRunState, LiveRunStateRules> = {
  [LiveRunState.INTAKE]: {
    screen: 'intake',
    next: LiveRunState.EN_ROUTE,
    stamps: 'activationAt',
  },
  [LiveRunState.EN_ROUTE]: {
    screen: 'enroute',
    next: LiveRunState.ON_SCENE,
    stamps: 'sceneArrivalAt',
  },
  [LiveRunState.ON_SCENE]: {
    screen: 'scene',
    next: LiveRunState.EN_ROUTE_TO_HOSPITAL,
    stamps: 'sceneDepartureAt',
  },
  [LiveRunState.EN_ROUTE_TO_HOSPITAL]: {
    screen: 'transport',
    next: LiveRunState.AT_HOSPITAL,
    stamps: 'hospitalArrivalAt',
  },
  [LiveRunState.AT_HOSPITAL]: {
    screen: 'closing',
    next: LiveRunState.CLOSED,
    stamps: 'availableAt',
  },
  [LiveRunState.CLOSED]: { screen: 'closing', next: null, stamps: null },
};

/** A support call the crew made during the run, and when they made it. */
export enum LiveRunSupportActionKind {
  /** The CODU Dados freephone line. One number, one action. */
  CODU_DADOS = 'CODU_DADOS',
}

export interface LiveRunSupportAction {
  kind: LiveRunSupportActionKind;
  at: string;
}

/**
 * One tap of the material picker while the run is live.
 *
 * One entry per tap, not a running total — the phone does no arithmetic live,
 * it just appends. The same item tapped three times is three entries; turning
 * that into a single report line (summed for `COUNTABLE`, collapsed for
 * `UNLIMITED`) is `liveRunToEventReportInput`'s job, on close.
 */
export interface LiveRunMaterialEntry {
  materialItemId: string;
  /** Omitted (or null) means one unit — a bare tap, not a counted amount. */
  quantity?: number | null;
  at: string;
}

/**
 * The fields that identify a person, held only while the run is live.
 *
 * Stored as one AES-256-GCM blob rather than columns: nothing sorts, filters or
 * counts by them, and a single sealed value is one thing to destroy rather than
 * six columns to remember to null out.
 *
 * The occurrence address is here — and therefore purged — because a street
 * number is what makes a report identify a household. What survives on the
 * report is `locationType` + `localityId`, exactly as before this feature.
 */
export interface LiveRunIdentity {
  victimName?: string | null;
  /** ISO date, `YYYY-MM-DD`. */
  victimDateOfBirth?: string | null;
  victimSnsNumber?: string | null;
  /** Street and number, for navigation and for the paper form. */
  occurrenceAddress?: string | null;
  /** "porta azul ao lado do café" — how to find it, dictated on the call. */
  referencePoints?: string | null;
  victimHomeAddress?: string | null;
  /**
   * Where the victim lives, when that differs from the occurrence — captured
   * only for the verbete, and purged with the rest of identity like every
   * other field here.
   */
  victimHomeLocalityId?: string | null;
}

export const LIVE_RUN_IDENTITY_FIELDS = [
  'victimName',
  'victimDateOfBirth',
  'victimSnsNumber',
  'occurrenceAddress',
  'referencePoints',
  'victimHomeAddress',
  'victimHomeLocalityId',
] as const;

export const MAX_LIVE_RUN_ADDRESS_LENGTH = 300;
export const MAX_LIVE_RUN_NAME_LENGTH = 160;
export const MAX_LIVE_RUN_COMPLAINT_LENGTH = 300;
/** Portuguese SNS numbers are nine digits. */
export const SNS_NUMBER_REGEX = /^\d{9}$/;

/**
 * Everything typed during the run that has no column of its own.
 *
 * JSON on the server because the mirror is a *mirror, not a model*: the server
 * never edits a field of it, it replaces the whole thing. Giving it columns
 * would mean migrating the live table every time the phone's form gains a box.
 */
export interface LiveRunCapture extends EventReportClinical {
  /** The narrative as it is being drafted. Plain text — dictation goes here. */
  notes?: string | null;
  supportActions?: LiveRunSupportAction[];
  materials?: LiveRunMaterialEntry[];
}

/**
 * A run as one phone is capturing it, and as it is mirrored to the server.
 *
 * The client owns `id`: a run created in a dead spot syncs an hour later into
 * the row it would have created at the time. `revision` is the device's own
 * counter and the only ordering the server trusts.
 */
export interface LiveRunInput {
  id: string;
  revision: number;
  state: LiveRunState;
  startedAt: string;

  externalReference?: string | null;
  chiefComplaint?: string | null;
  locationType?: EventLocationType | null;
  localityId?: string | null;
  victimGender?: Gender | null;
  victimAge?: number | null;
  vehicleId?: string | null;

  crew?: EventReportCrewInput[];
  shift?: EventReportShiftInput | null;

  activationAt?: string | null;
  sceneArrivalAt?: string | null;
  sceneDepartureAt?: string | null;
  hospitalArrivalAt?: string | null;
  availableAt?: string | null;

  destinationKind?: VictimDestinationKind | null;
  destinationFacilityId?: string | null;
  /**
   * The "número de episódio de urgência" the ER issues on admission, written
   * down by the crew at the hospital.
   */
  hospitalEpisodeNumber?: string | null;

  /** Purged on submission, or 48h after close — whichever comes first. */
  identity?: LiveRunIdentity | null;
  capture?: LiveRunCapture | null;

  closedAt?: string | null;
}

export interface LiveRunCrewMember {
  userId: string;
  user?: EventReportPerson;
  roleName?: string | null;
  position: number;
}

export interface LiveRun extends Omit<LiveRunInput, 'crew'> {
  crew: LiveRunCrewMember[];
  locality?: Locality | null;
  destinationFacility?: Pick<Facility, 'id' | 'name'> | null;
  /** Set once the run has been closed into a draft report. */
  reportId?: string | null;
  /** When the identity blob was destroyed. Distinguishes "gone" from "never had". */
  identityPurgedAt?: string | null;
  /**
   * The blob is present but no key in the environment can open it. Not a 500: a
   * key retired an hour early must not take the coordinator's board down.
   */
  identityUnavailable?: boolean;
  createdById: string;
  createdBy?: EventReportPerson;
  createdAt: string;
  updatedAt: string;
}

/** How long a closed run — and everything on it — outlives its close. */
export const LIVE_RUN_RETENTION_HOURS = 48;

/**
 * How long a run with no activity is left open before it is force-closed.
 *
 * Force-closed rather than deleted: the phone may still come back, and closing
 * starts the 48h clock rather than throwing away a run that is merely quiet.
 */
export const LIVE_RUN_ABANDON_HOURS = 24;

/** Whether a closed run is still inside its retention window. */
export function isLiveRunReadable(
  run: Pick<LiveRun, 'closedAt'>,
  now: Date = new Date(),
): boolean {
  if (isBlank(run.closedAt)) return true;
  const closed = new Date(run.closedAt!).getTime();
  if (!Number.isFinite(closed)) return true;
  return now.getTime() - closed < LIVE_RUN_RETENTION_HOURS * 3600_000;
}

/**
 * Whether a live-run document is coherent.
 *
 * The API validates the same document the phone does — the rule this repo
 * already follows for `validateEventReport` — so a payload that the screen
 * accepted cannot be refused by the server for a reason the crew never saw.
 *
 * Almost nothing is *required*: a run that exists at all is one the crew has
 * started, and a CODU call that gives only a street is a real call. Only
 * contradictions are refused.
 */
export function validateLiveRun(input: LiveRunInput): EventReportProblem | null {
  if (!input?.id) {
    return problem('LIVE_RUN_MISSING_ID', 'A live run needs an id from the device.');
  }
  if (!Number.isInteger(input.revision) || input.revision < 0) {
    return problem(
      'LIVE_RUN_INVALID_REVISION',
      'A live run needs a whole, non-negative revision.',
    );
  }
  if (!LIVE_RUN_STATES.includes(input.state)) {
    return problem('LIVE_RUN_UNKNOWN_STATE', `Unknown live run state "${input.state}".`);
  }
  if (isBlank(input.startedAt) || !isInstant(input.startedAt)) {
    return problem('LIVE_RUN_MISSING_START', 'A live run needs the time it started.');
  }

  if (
    !isBlank(input.chiefComplaint) &&
    input.chiefComplaint!.length > MAX_LIVE_RUN_COMPLAINT_LENGTH
  ) {
    return problem(
      'LIVE_RUN_COMPLAINT_TOO_LONG',
      `The reason for the call may be at most ${MAX_LIVE_RUN_COMPLAINT_LENGTH} characters.`,
    );
  }
  if (
    !isBlank(input.externalReference) &&
    input.externalReference!.length > MAX_EXTERNAL_REFERENCE_LENGTH
  ) {
    return problem(
      'REFERENCE_TOO_LONG',
      `The reference may be at most ${MAX_EXTERNAL_REFERENCE_LENGTH} characters.`,
    );
  }
  if (
    !isBlank(input.locationType) &&
    !EVENT_LOCATION_TYPES.includes(input.locationType as EventLocationType)
  ) {
    return problem('MISSING_LOCATION_TYPE', `Unknown location type "${input.locationType}".`);
  }
  if (!isBlank(input.victimGender) && !GENDERS.includes(input.victimGender as Gender)) {
    return problem('VICTIM_GENDER_MISSING', `Unknown gender "${input.victimGender}".`);
  }
  if (input.victimAge !== null && input.victimAge !== undefined) {
    if (
      !Number.isInteger(input.victimAge) ||
      input.victimAge < MIN_VICTIM_AGE ||
      input.victimAge > MAX_VICTIM_AGE
    ) {
      return problem(
        'VICTIM_AGE_INVALID',
        `A victim's age must be between ${MIN_VICTIM_AGE} and ${MAX_VICTIM_AGE}.`,
      );
    }
  }

  const timesProblem = validateOccurrenceTimes({
    type: EventReportType.EMERGENCY,
    activationAt: input.activationAt,
    sceneArrivalAt: input.sceneArrivalAt,
    sceneDepartureAt: input.sceneDepartureAt,
    hospitalArrivalAt: input.hospitalArrivalAt,
    availableAt: input.availableAt,
  });
  if (timesProblem) return timesProblem;

  if (input.crew) {
    const crewProblem = validateCrew(input.crew);
    if (crewProblem) return crewProblem;
  }

  if (!isBlank(input.destinationKind)) {
    const destinationProblem = validateVictimDestination(
      {
        destinationKind: input.destinationKind as VictimDestinationKind,
        destinationFacilityId: input.destinationFacilityId ?? null,
        hospitalEpisodeNumber: input.hospitalEpisodeNumber ?? null,
      },
      EVENT_REPORT_TYPE_RULES[EventReportType.EMERGENCY],
    );
    if (destinationProblem) return destinationProblem;
  } else if (input.destinationFacilityId) {
    return problem(
      'DESTINATION_HOSPITAL_NOT_ALLOWED',
      'A hospital without an outcome is not a destination.',
    );
  }

  const identityProblem = validateLiveRunIdentity(input.identity ?? null);
  if (identityProblem) return identityProblem;

  if (input.capture) {
    const clinicalProblem = validateClinicalRecord(
      input.capture,
      EVENT_REPORT_TYPE_RULES[EventReportType.EMERGENCY],
    );
    if (clinicalProblem) return clinicalProblem;
  }

  return null;
}

export function validateLiveRunIdentity(
  identity: LiveRunIdentity | null,
): EventReportProblem | null {
  if (!identity) return null;

  if (
    !isBlank(identity.victimName) &&
    identity.victimName!.length > MAX_LIVE_RUN_NAME_LENGTH
  ) {
    return problem(
      'LIVE_RUN_NAME_TOO_LONG',
      `A name may be at most ${MAX_LIVE_RUN_NAME_LENGTH} characters.`,
    );
  }
  for (const field of ['occurrenceAddress', 'referencePoints', 'victimHomeAddress'] as const) {
    const value = identity[field];
    if (!isBlank(value) && value!.length > MAX_LIVE_RUN_ADDRESS_LENGTH) {
      return problem(
        'LIVE_RUN_ADDRESS_TOO_LONG',
        `An address may be at most ${MAX_LIVE_RUN_ADDRESS_LENGTH} characters.`,
      );
    }
  }
  if (!isBlank(identity.victimDateOfBirth)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(identity.victimDateOfBirth!)) {
      return problem(
        'LIVE_RUN_INVALID_DATE_OF_BIRTH',
        'A date of birth is a calendar date (YYYY-MM-DD).',
      );
    }
  }
  if (
    !isBlank(identity.victimSnsNumber) &&
    !SNS_NUMBER_REGEX.test(identity.victimSnsNumber!.trim())
  ) {
    return problem('LIVE_RUN_INVALID_SNS', 'An SNS number is nine digits.');
  }
  return null;
}

/**
 * What is unfinished about a run the crew is trying to close.
 *
 * Warnings, never blocks — the same split as `eventReportWarnings`. A crew
 * closing a run has an ambulance to put back in service; the paperwork gaps are
 * for the report to chase.
 */
export type LiveRunWarningCode =
  | 'NO_COMPLAINT'
  | 'NO_VICTIM_DETAILS'
  | 'NO_DESTINATION'
  | 'NO_VITALS'
  | 'NO_CREW'
  | 'NO_VEHICLE'
  | 'MISSING_STAMPS';

export function liveRunWarnings(run: LiveRunInput): LiveRunWarningCode[] {
  const warnings: LiveRunWarningCode[] = [];

  if (isBlank(run.chiefComplaint)) warnings.push('NO_COMPLAINT');
  if (isBlank(run.victimGender) || run.victimAge === null || run.victimAge === undefined) {
    warnings.push('NO_VICTIM_DETAILS');
  }
  if (isBlank(run.destinationKind)) warnings.push('NO_DESTINATION');
  if ((run.capture?.assessments ?? []).length === 0) warnings.push('NO_VITALS');
  if ((run.crew ?? []).length === 0) warnings.push('NO_CREW');
  if (isBlank(run.vehicleId)) warnings.push('NO_VEHICLE');

  const stamped = OCCURRENCE_TIME_FIELDS.filter((field) => !isBlank(run[field]));
  if (stamped.length < 2) warnings.push('MISSING_STAMPS');

  return warnings;
}

/**
 * What actually stops a run being closed, as codes the closing screen names.
 *
 * A very short list, and every entry on it is here for the same reason:
 * **closing a run creates the draft report**, and these four are what a report
 * cannot exist without — `validateEventReport` refuses a draft missing any of
 * them, so a run that could not become a report is a run that cannot close.
 * Everything else the crew has not got round to comes back from
 * `liveRunWarnings` and closes anyway.
 *
 * All four are things CODU gives on the call, so in practice the intake screen
 * has already collected them; the closing screen offers them inline for the run
 * where it did not.
 */
export type LiveRunBlockerCode =
  | 'NO_STAMPS'
  | 'NO_LOCALITY'
  | 'NO_LOCATION_TYPE'
  | 'NO_REFERENCE';

export function liveRunCloseBlockers(run: LiveRunInput): LiveRunBlockerCode[] {
  const blockers: LiveRunBlockerCode[] = [];
  // A run with no chronology recorded nothing, which is the failure this whole
  // feature exists to prevent.
  if (!OCCURRENCE_TIME_FIELDS.some((field) => !isBlank(run[field]))) {
    blockers.push('NO_STAMPS');
  }
  if (isBlank(run.localityId)) blockers.push('NO_LOCALITY');
  if (isBlank(run.locationType)) blockers.push('NO_LOCATION_TYPE');
  // An emergency report requires the CODU number — so this is a blocker rather
  // than the warning it looks like. A run that closed without it would produce a
  // draft nobody could ever file.
  if (isBlank(run.externalReference)) blockers.push('NO_REFERENCE');
  return blockers;
}

/**
 * The stamps closing a run writes for itself.
 *
 * Two of them, and both for the same reason: the facts are true whether or not
 * anybody tapped a button. A crew closing from the scene *did* leave the scene,
 * and a crew closing at all *is* available again — that is what closing means.
 * Nothing already stamped is ever overwritten; a crew's own time beats an
 * inferred one.
 *
 * A pure function so the no-transport path — stand down on scene, nobody
 * transported — is provable without a server: `sceneDepartureAt` and
 * `availableAt` both filled, `hospitalArrivalAt` still null.
 */
export interface LiveRunClosingStamps {
  sceneDepartureAt?: string;
  availableAt?: string;
}

export function liveRunClosingStamps(
  run: LiveRunInput,
  now: Date = new Date(),
): LiveRunClosingStamps {
  const at = now.toISOString();
  const stamps: LiveRunClosingStamps = {};
  if (!isBlank(run.sceneArrivalAt) && isBlank(run.sceneDepartureAt)) {
    stamps.sceneDepartureAt = at;
  }
  if (isBlank(run.availableAt)) stamps.availableAt = at;
  return stamps;
}

export function canCloseLiveRun(run: LiveRunInput): boolean {
  if (run.state === LiveRunState.CLOSED) return false;
  return liveRunCloseBlockers(run).length === 0;
}

/**
 * The run as the draft report it becomes.
 *
 * A pure function on purpose: closing a run is the moment the whole feature
 * either works or silently loses twenty minutes of an emergency, and it must be
 * provable without a server. Every identity field is dropped here rather than
 * later — the report has never carried an address and does not start now.
 *
 * `occurredOn` comes from activation rather than from "today": a call taken at
 * 23:52 and closed at 00:40 belongs to the day it started, which is the same
 * rule the paper form uses.
 */
export function liveRunToEventReportInput(
  run: LiveRunInput,
  options: {
    now?: Date;
    /**
     * The catalogue's item type for every id tapped live, keyed by
     * `materialItemId` — looked up by the caller (a database read) so this
     * stays a pure function. An id with no entry here, because the catalogue
     * no longer knows it, is dropped rather than failing the close.
     */
    materialItemTypes?: Map<string, InventoryItemType>;
  } = {},
): EventReportInput {
  const now = options.now ?? new Date();
  const startedAt = run.activationAt || run.startedAt;
  const closedAt = run.availableAt || run.closedAt || now.toISOString();

  const capture = run.capture ?? {};
  const hasVictim =
    !isBlank(run.victimGender) ||
    (run.victimAge !== null && run.victimAge !== undefined) ||
    !isBlank(run.destinationKind);

  return {
    type: EventReportType.EMERGENCY,
    occurredOn: isoDateOf(startedAt),
    startedAt,
    endedAt: closedAt,
    externalReference: run.externalReference ?? null,
    // A run with no locality still becomes a report; the crew picks one on the
    // edit page. An empty string is what the wizard's own empty draft uses.
    locationType: (run.locationType ?? '') as EventLocationType,
    localityId: run.localityId ?? '',

    activationAt: run.activationAt ?? null,
    sceneArrivalAt: run.sceneArrivalAt ?? null,
    sceneDepartureAt: run.sceneDepartureAt ?? null,
    hospitalArrivalAt: run.hospitalArrivalAt ?? null,
    availableAt: run.availableAt ?? null,

    shift: run.shift ?? null,
    // Plain text from the live screens, wrapped once so the rich editor has a
    // paragraph to open rather than a bare text node.
    operationalReport: isBlank(capture.notes) ? '' : `<p>${escapeHtml(capture.notes!)}</p>`,

    crew: (run.crew ?? []).map((member) => ({
      userId: member.userId,
      roleName: member.roleName ?? null,
    })),
    // Kilometres are computed from the route, never carried from the run — a
    // crew does not reliably return to base, so an odometer reading captured
    // live would be wrong more often than right.
    vehicles: run.vehicleId ? [{ vehicleId: run.vehicleId, kilometres: 0 }] : [],
    victims: hasVictim
      ? [
          {
            gender: (run.victimGender ?? Gender.UNKNOWN) as Gender,
            age: run.victimAge ?? 0,
            // A run is always an emergency, so `TREATED_ON_SCENE` — the value
            // this used to default to — is no longer a destination an
            // emergency victim can carry. Unlike a fresh victim in the report
            // form, this is not a person choosing nothing yet: closing a run
            // has already happened, must not fail, and cannot ask anyone a
            // question. `CANCELLED` is the fallback for that one write path
            // only — never recorded (blank) or recorded before this change
            // (a legacy `TREATED_ON_SCENE`) both land here, and the crew
            // corrects it like any other gap on the draft's edit page.
            destinationKind: (
              [VictimDestinationKind.HOSPITAL, ...noTransportDestinationsFor(EventReportType.EMERGENCY)] as Array<
                VictimDestinationKind | null | undefined
              >
            ).includes(run.destinationKind)
              ? (run.destinationKind as VictimDestinationKind)
              : VictimDestinationKind.CANCELLED,
            destinationFacilityId:
              run.destinationKind === VictimDestinationKind.HOSPITAL
                ? run.destinationFacilityId ?? null
                : null,
            hospitalEpisodeNumber: run.hospitalEpisodeNumber ?? null,
          },
        ]
      : [],

    chamuCircumstances: capture.chamuCircumstances ?? null,
    chamuHistory: capture.chamuHistory ?? null,
    chamuAllergies: capture.chamuAllergies ?? null,
    chamuMedication: capture.chamuMedication ?? null,
    chamuLastMeal: capture.chamuLastMeal ?? null,
    abcde: capture.abcde ?? null,
    assessments: capture.assessments ?? [],
    materials: materialLinesFromCapture(capture.materials, options.materialItemTypes, run.vehicleId ?? null),
  };
}

/**
 * Live-tapped materials, folded into report lines.
 *
 * Repeats of the same item aggregate — summed for `COUNTABLE`, collapsed to
 * one logged line for `UNLIMITED`, which has no quantity to sum — in the
 * order each item was first tapped, and every line is attributed to the
 * run's own vehicle. An id the catalogue lookup could not resolve (deleted
 * since the tap, or no lookup supplied at all) is dropped: a report the crew
 * is about to finish by hand must never fail to appear over one bad line.
 */
function materialLinesFromCapture(
  entries: LiveRunMaterialEntry[] | undefined,
  itemTypes: Map<string, InventoryItemType> | undefined,
  vehicleId: string | null,
): EventReportMaterialInput[] {
  if (!entries?.length || !itemTypes) return [];

  const order: string[] = [];
  const totals = new Map<string, number>();
  for (const entry of entries) {
    const itemType = itemTypes.get(entry.materialItemId);
    if (!itemType) continue;
    if (!totals.has(entry.materialItemId)) order.push(entry.materialItemId);
    totals.set(
      entry.materialItemId,
      itemType === InventoryItemType.UNLIMITED
        ? 1
        : (totals.get(entry.materialItemId) ?? 0) + (entry.quantity ?? 1),
    );
  }

  return order.map((materialItemId) => {
    const itemType = itemTypes.get(materialItemId)!;
    return {
      materialItemId,
      itemType,
      vehicleId,
      quantity: itemType === InventoryItemType.UNLIMITED ? null : totals.get(materialItemId)!,
    };
  });
}

/** `YYYY-MM-DD` of an instant, in the device's own timezone. */
function isoDateOf(instant: string): string {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return '';
  const pad2 = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Minimal escaping for text on its way into the rich-text column.
 *
 * The server sanitizes it again with `sanitizeReportHtml`; this exists so a
 * dictated "tensão < 90" does not arrive as a broken tag in the first place.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br />');
}

/**
 * A run as the coordinator's board reads it — no identity, ever.
 *
 * A separate shape rather than a nulled-out `LiveRun`, because the board's
 * query never selects the ciphertext column at all: there is nothing to leak by
 * accident, and the type says so.
 */
export interface LiveRunBoardEntry {
  id: string;
  state: LiveRunState;
  startedAt: string;
  externalReference?: string | null;
  chiefComplaint?: string | null;
  locality?: Pick<Locality, 'id' | 'name'> | null;
  victimGender?: Gender | null;
  victimAge?: number | null;
  crew: LiveRunCrewMember[];
  vehicleId?: string | null;
  activationAt?: string | null;
  sceneArrivalAt?: string | null;
  sceneDepartureAt?: string | null;
  hospitalArrivalAt?: string | null;
  availableAt?: string | null;
  destinationKind?: VictimDestinationKind | null;
  destinationFacility?: Pick<Facility, 'id' | 'name'> | null;
  updatedAt: string;
}

/** `PUT /live-runs/:id` — the whole document, plus what the server made of it. */
export interface LiveRunSyncResponse {
  run: LiveRun;
  /**
   * The stored revision won. A phone that has been in a cellar gets its own
   * later state back rather than a 409 — that is normal operation, not an error
   * to put in front of a crew.
   */
  stale: boolean;
}

/** `POST /live-runs/:id/close` — the run, and the draft report it became. */
export interface LiveRunCloseResponse {
  run: LiveRun;
  report: EventReport;
}

// ─── Notices & notifications ──────────────────────────────────────────────────
//
// Legacy parity for operational alerts (ADO #165): coordinators post a
// targeted notice, members see it in an alerts area and acknowledge it.
// Delivery is a pluggable framework, not just this one feature — `NOTICE` is
// the first `NotificationType`, but the channel/preference/delivery shapes
// below are meant to be reused by future system-triggered types without a
// redesign. `IN_APP` is always implicit (the notice existing in the list *is*
// the in-app delivery) — it's in `NotificationChannel` only so config/prefs
// UIs can show it as an always-on row.

export enum NoticeTargetType {
  ALL = 'ALL',
  ROLES = 'ROLES',
}

export enum NotificationChannel {
  IN_APP = 'IN_APP',
  EMAIL = 'EMAIL',
  WEB_PUSH = 'WEB_PUSH',
}

/** Extend as more system-triggered notifications are built. */
export enum NotificationType {
  NOTICE = 'NOTICE',
  /** 24h-ahead reminder to everyone assigned to a shift. */
  SHIFT_REMINDER = 'SHIFT_REMINDER',
  /** Sent to the person themselves, on their birthday. */
  BIRTHDAY_GREETING = 'BIRTHDAY_GREETING',
  /** Sent to everyone else, telling them it's a teammate's birthday today. */
  BIRTHDAY_ANNOUNCEMENT = 'BIRTHDAY_ANNOUNCEMENT',
}

/**
 * The three system-triggered types a member can individually opt into/out of
 * (`UserNotificationTypeSetting`), each independent of the others and of the
 * per-channel preference. `NOTICE` isn't here — it stays governed by org
 * policy (`NotificationTypeSetting`) and the per-channel preference alone.
 */
export const USER_TOGGLEABLE_NOTIFICATION_TYPES: NotificationType[] = [
  NotificationType.SHIFT_REMINDER,
  NotificationType.BIRTHDAY_GREETING,
  NotificationType.BIRTHDAY_ANNOUNCEMENT,
];

/** What a type defaults to when a member has never touched its toggle. */
export const NOTIFICATION_TYPE_DEFAULT_ENABLED: Record<NotificationType, boolean> = {
  [NotificationType.NOTICE]: true,
  [NotificationType.SHIFT_REMINDER]: true,
  [NotificationType.BIRTHDAY_GREETING]: true,
  [NotificationType.BIRTHDAY_ANNOUNCEMENT]: false,
};

export enum NotificationDeliveryStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

export interface Notice {
  id: string;
  title: string;
  body: string;
  createdById: string;
  createdByName: string;
  targetType: NoticeTargetType;
  /** Only meaningful when `targetType` is `ROLES`; empty for `ALL`. */
  targetRoles: UserRole[];
  /** Channels the coordinator chose when sending this notice, `IN_APP` excluded. */
  channels: NotificationChannel[];
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `POST /notices` body. */
export interface CreateNoticeRequest {
  title: string;
  body: string;
  targetType: NoticeTargetType;
  /** Required, non-empty when `targetType` is `ROLES`. */
  targetRoles?: UserRole[];
  channels: NotificationChannel[];
  expiresAt?: string;
}

/** Per-recipient state — covers both "unread vs read" and "acknowledge/dismiss". */
export interface NoticeReceipt {
  readAt: string | null;
  acknowledgedAt: string | null;
}

/** `GET /notices` (member view) — a notice plus the viewer's own receipt. */
export interface NoticeWithReceipt extends Notice {
  receipt: NoticeReceipt;
}

/** `GET /notices` (coordinator view) — a notice plus a summary for the history list. */
export interface NoticeWithStats extends Notice {
  recipientCount: number;
  acknowledgedCount: number;
}

export interface NoticeDeliveryStatus {
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  error: string | null;
}

/** `GET /notices/:id/recipients` (coordinator view) — one row per target user. */
export interface NoticeRecipientStatus {
  userId: string;
  userName: string;
  readAt: string | null;
  acknowledgedAt: string | null;
  deliveries: NoticeDeliveryStatus[];
}

/** Org-wide default channels per notification type — the notification config page. */
export interface NotificationTypeSetting {
  type: NotificationType;
  defaultChannels: NotificationChannel[];
}

/** A member's own per-channel opt-out — the notification settings in their profile. */
export interface UserNotificationPreference {
  channel: NotificationChannel;
  enabled: boolean;
}

/** A member's own on/off switch for one system-triggered type, from `USER_TOGGLEABLE_NOTIFICATION_TYPES`. */
export interface UserNotificationTypePreference {
  type: NotificationType;
  enabled: boolean;
}

export interface NotificationChannelResolutionInput {
  /** Channels chosen for this specific notice (or event), `IN_APP` excluded. */
  requestedChannels: NotificationChannel[];
  /** Channels the org has enabled by default for this notification type. */
  typeDefaultChannels: NotificationChannel[];
  /** Channels this recipient has explicitly turned off. */
  userDisabledChannels: NotificationChannel[];
  /** `WEB_PUSH` needs a registered device; nothing to deliver to otherwise. */
  userHasPushSubscription: boolean;
}

/**
 * What a recipient actually gets, once org policy and personal preference are
 * both applied. Pure and I/O-free on purpose — the delivery service resolves
 * this per recipient before enqueueing anything, and it's the one place the
 * three-way precedence (notice choice ∩ org default ∩ user opt-out) is
 * defined, so it's tested once here instead of once per call site.
 */
export function resolveEffectiveNotificationChannels(
  input: NotificationChannelResolutionInput,
): NotificationChannel[] {
  return input.requestedChannels.filter((channel) => {
    if (!input.typeDefaultChannels.includes(channel)) return false;
    if (input.userDisabledChannels.includes(channel)) return false;
    if (channel === NotificationChannel.WEB_PUSH && !input.userHasPushSubscription) return false;
    return true;
  });
}

// ─── Statistics ─────────────────────────────────────────────────────────────
//
// Aggregate, organisation-wide numbers behind `/#/statistics` (design:
// docs/plans/estatisticas-dashboards.md). Every authenticated member sees all
// three tabs — nothing here is scoped by role, only by the query range and an
// optional `EventReportType` filter. Only tab 1 (`PeopleStatistics.roster`)
// ever names a person; tabs 2 and 3 publish aggregates only, never a
// per-person cut, per the design doc's re-identification guardrail.

/** Shared query shape for all three `/statistics/*` routes. */
export interface StatisticsQuery {
  /** ISO date, inclusive. Defaults to 12 months before `to` when omitted. */
  from?: string;
  /** ISO date, inclusive. Defaults to today when omitted. */
  to?: string;
  /** Tabs 2 and 3 only — narrows every count to one `EventReportType`. */
  type?: EventReportType;
}

export interface StatisticsMonthPoint {
  /** `YYYY-MM`. */
  month: string;
  value: number;
}

export interface PeopleStatisticsRosterEntry {
  userId: string;
  firstName: string;
  lastName: string;
  hours: number;
  events: number;
  emergencyEvents: number;
  supportEvents: number;
  /** ISO date of the volunteer's most recent counted activity, or null. */
  lastActivityDate: string | null;
}

/** `GET /statistics/people` */
export interface PeopleStatistics {
  from: string;
  to: string;
  totalApprovedHours: number;
  activeVolunteers: number;
  previousPeriodActiveVolunteers: number;
  eventsWithParticipation: number;
  averageHoursPerVolunteer: number;
  viewer: {
    hours: number;
    previousPeriodHours: number;
    events: number;
    /** 1-based position in `roster`, or null when the viewer has no hours in range. */
    rank: number | null;
    totalVolunteers: number;
    monthlyHours: StatisticsMonthPoint[];
  };
  monthlyHours: StatisticsMonthPoint[];
  hoursByActivityType: { activityType: VolunteerActivityType; hours: number }[];
  /** Every volunteer with hours or an event in range, sorted by hours descending. */
  roster: PeopleStatisticsRosterEntry[];
}

export interface StatisticsLocalityCount {
  id: string;
  name: string;
  count: number;
}

export interface StatisticsHospitalCount {
  id: string;
  name: string;
  municipality: string;
  count: number;
}

/** `GET /statistics/activity` */
export interface ActivityStatistics {
  from: string;
  to: string;
  totalEvents: number;
  previousPeriodEvents: number;
  victimsAssisted: number;
  eventsByType: { type: EventReportType; count: number }[];
  eventsByMonth: { month: string; byType: Record<EventReportType, number>; total: number }[];
  /**
   * Emergency `activationAt` (falling back to `startedAt`), bucketed in
   * `Europe/Lisbon` — see the design doc's timezone trap. `weekday` follows
   * `Date#getDay()` (0 = Sunday … 6 = Saturday); `band` is the 4-hour block
   * starting at `band * 4` (0–5).
   */
  activationHeatmap: { weekday: number; band: number; count: number }[];
  /** Top 10 by count. */
  eventsByLocality: StatisticsLocalityCount[];
  eventsByLocalityOther: number;
  eventsByMunicipality: StatisticsLocalityCount[];
  eventsByMunicipalityOther: number;
  destinationHospitals: StatisticsHospitalCount[];
  victimOutcomes: { kind: VictimDestinationKind; count: number }[];
  inemUnits: { unitType: InemSupportUnitType; hospitalName: string; count: number }[];
}

/** One gap between two consecutive emergency chronology stamps. */
export enum ResponseLegKey {
  ACTIVATION_TO_SCENE = 'ACTIVATION_TO_SCENE',
  ON_SCENE = 'ON_SCENE',
  SCENE_TO_HOSPITAL = 'SCENE_TO_HOSPITAL',
  HOSPITAL_TO_AVAILABLE = 'HOSPITAL_TO_AVAILABLE',
}

export const RESPONSE_LEG_KEYS: readonly ResponseLegKey[] = [
  ResponseLegKey.ACTIVATION_TO_SCENE,
  ResponseLegKey.ON_SCENE,
  ResponseLegKey.SCENE_TO_HOSPITAL,
  ResponseLegKey.HOSPITAL_TO_AVAILABLE,
];

export interface StatisticsFleetVehicle {
  vehicleId: string;
  numeroCauda: string;
  licensePlate: string;
  totalKilometres: number;
  monthlyKilometres: StatisticsMonthPoint[];
}

export interface StatisticsResponseLeg {
  leg: ResponseLegKey;
  medianMinutes: number | null;
  p90Minutes: number | null;
  /** How many emergencies had both stamps of this leg — the honesty tile's source. */
  sampleSize: number;
}

/** `GET /statistics/fleet` */
export interface FleetStatistics {
  from: string;
  to: string;
  totalKilometres: number;
  eventCount: number;
  kmPerEventMean: number;
  kmPerEventMedian: number;
  vehicles: StatisticsFleetVehicle[];
  responseLegs: StatisticsResponseLeg[];
  /** Median of `activationAt → availableAt` directly — does not equal the sum of `responseLegs`. */
  totalDurationMedianMinutes: number | null;
  /** Emergencies with both `activationAt` and `availableAt` set. */
  timedEmergencies: number;
  totalEmergencies: number;
}

export interface StatisticsInemReasonMinutes {
  /** `INEM_AVAILABLE_INOP_CODE` is never included here — this is downtime only. */
  inopCode: string;
  /**
   * `inopCode`'s display label, resolved the same way `INEMStatusOverview.inopReasons`
   * is — the last live `GET /api/INOP` capture, falling back to the compile-time
   * `INEM_INOP_REASONS` table. Equal to `inopCode` itself when neither source has an
   * entry for it (e.g. a numeric code INEM hasn't been observed to explain yet).
   */
  label: string;
  minutes: number;
}

export interface StatisticsInemUnit {
  unitId: string;
  vehicle: { id: string; licensePlate: string; numeroCauda: string } | null;
  availableMinutes: number;
  totalDowntimeMinutes: number;
  downtimeByReason: StatisticsInemReasonMinutes[];
}

/**
 * `GET /statistics/inem` — how long each unit actually sat in each confirmed
 * state (`INEMUnitStatusPeriod`, not the merely desired state), and why.
 * Minutes are clipped to `[from, to]`; a period still open at `to` counts up
 * to `to`, not to whenever it eventually closes.
 */
export interface INEMStatistics {
  from: string;
  to: string;
  totalDowntimeMinutes: number;
  downtimeByReason: StatisticsInemReasonMinutes[];
  units: StatisticsInemUnit[];
}

// ─── INEM integration (#211) ───────────────────────────────────────────────────
//
// Lets CVP crews set ambulance operational status on INEM's own portal
// (portalpem.inem.pt) from redinfo instead of logging in there directly. See
// docs/inem-portal-contract.md for the observed wire contract this mirrors,
// and src/inem/ (#214) / packages/inem-worker (#215) for what reads and
// writes it. Mirrors the Prisma `INEMSessionStatus` enum in
// packages/backend/prisma/schema.prisma — keep the two in sync.
export enum INEMSessionStatus {
  UNKNOWN = 'UNKNOWN',
  LOGGING_IN = 'LOGGING_IN',
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  FAILED = 'FAILED',
}

/**
 * The sentinel `PUT /api/unit` INOP code that means "available". Not a
 * member of `INEM_INOP_REASONS` — INEM's own `GET /api/INOP` never returns
 * it, it exists only on the write path. Named rather than left as a literal
 * `'00'` at call sites, which is otherwise unreadable.
 */
export const INEM_AVAILABLE_INOP_CODE = '00' as const;

/**
 * The reason code → INEM's own Portuguese display label, as captured from a
 * `GET /api/INOP` response during #212's original recon (see
 * docs/inem-portal-contract.md). Labels are kept verbatim — accents and odd
 * casing included (`Limpar/Repor_Mat`) — for two reasons: it's the `pt`
 * source text #216's screen translates against, and it's the last-resort
 * fallback when there is no better one to hand.
 *
 * **This table is now known to not match live production.** #218: a real
 * production capture returned a bare numeric `INOPReason` (`"04"`) that
 * isn't a key here — the descriptive-string scheme above was very likely
 * only ever true of the `X-ENV: TESTE` session the recon captured against
 * (see docs/inem-portal-contract.md's open questions), not production. Do
 * not extend this table by guessing at what a numeric code means; only add
 * an entry once it's confirmed from a live `GET /api/INOP` capture.
 *
 * The *code* is the contract, wire format and `desiredInopCode` value; the
 * *label* is display data. Runtime source of truth is always the live
 * `GET /api/INOP` call (surfaced through `INEMStatusOverview.inopReasons`)
 * — `InemSessionService` now persists the last one it fetched (#218) so a
 * process restart falls back to yesterday's real map before it ever falls
 * back to this compile-time one. This constant only matters pre-first-sync,
 * or if the live map itself has genuinely never been fetched.
 */
export const INEM_INOP_REASONS = {
  TEPH_Falta: 'Sem Tripulação',
  Acidente_Viatura: 'Avaria Viatura', // breakdown, not accident — translate from the label
  Limpar_Repor_Material: 'Limpar/Repor_Mat',
  Alimentacao: 'Alimentação',
  Fora_de_turno: 'Ocupada – ExtraSIEM',
} as const satisfies Record<string, string>;

export type INEMInopCode = keyof typeof INEM_INOP_REASONS;

/** A unit as redinfo reports it — the Prisma `INEMUnit` row plus its joined `Vehicle`, if matched. */
export interface INEMUnit {
  unitId: string;
  station: string | null;
  /** The licence plate INEM knows the unit by — the join key to `Vehicle.licensePlate`. */
  carId: string | null;
  unitType: string | null;
  /** `INEM_AVAILABLE_INOP_CODE` or an `INEMInopCode`. Null = no desired state set yet. */
  desiredInopCode: string | null;
  /** What the reconciler last read back from `GET /api/unit`. */
  reportedInopCode: string | null;
  /** INEM's own read-only Portuguese label (`Active`) — display only, never desired state. */
  reportedActive: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  /** Null when INEM lists a unit redinfo has no matching `Vehicle` row for. */
  vehicle: { id: string; licensePlate: string; numeroCauda: string } | null;
}

export interface SetINEMUnitStatusRequest {
  unitId: string;
  inopCode: INEMInopCode | typeof INEM_AVAILABLE_INOP_CODE;
}

/**
 * Units plus session status in one call, so #216's screen gets its list and
 * its degraded-session banner from a single `GET /inem/status`.
 */
export interface INEMStatusOverview {
  sessionStatus: INEMSessionStatus;
  sessionLastError: string | null;
  /** The live `GET /api/INOP` map; falls back to `INEM_INOP_REASONS` when the session is down. */
  inopReasons: Record<string, string>;
  units: INEMUnit[];
}

/**
 * The worker job contract — the one shape that crosses the
 * `packages/inem-worker` package boundary. The worker imports these rather
 * than redeclaring them.
 */
export interface INEMLoginJob {
  id: string;
  /** The OWA `storageState` the backend holds, handed to the worker to read the OTP mail. */
  storageState: unknown;
  /** So the worker only accepts an OTP mail newer than this login attempt. */
  startedAt: string;
}

export type INEMLoginJobResult =
  | {
      ok: true;
      cookies: unknown;
      expiresAt: string;
      /** Must be persisted — OWA's cookie is a sliding window that refreshes on use. */
      refreshedStorageState: unknown;
    }
  | {
      ok: false;
      reason: 'captcha_challenge' | 'otp_timeout' | 'owa_session_expired' | 'unknown_error';
      message: string;
    };

// ─── Patients (#219, #226) ──────────────────────────────────────────────────────
//
// A non-urgent transport patient: a durable, months-long relationship, unlike
// `EventReportVictim` which is scoped to a single incident — and the most
// sensitive data this Feature persists. Identity is sealed the same way as
// `LiveRun`'s victim fields, one `IdentityCipher` blob (scope `'patient'`,
// backend), bound to the row id as additional authenticated data.

export enum PatientMobility {
  AMBULATORY = 'AMBULATORY',
  WHEELCHAIR = 'WHEELCHAIR',
  STRETCHER = 'STRETCHER',
}

/**
 * What the sealed blob holds: full name, telephone, home address and the
 * reference contact's own name/relationship/telephone. Everything a planner
 * needs *without* opening it — mobility, coordinates, `Patient.localityId` —
 * lives unsealed on `Patient` itself; see that model's schema comments for why.
 *
 * Written and read as one unit, never field-by-field: an edit that touches one
 * name replaces the whole blob, the same "whole document" contract
 * `LiveRunInput` uses for its own identity, rather than a decrypt-merge-reseal
 * that would risk half-corrupting it.
 */
export interface PatientIdentity {
  fullName: string;
  telephone: string;
  /** Street and number. */
  homeAddressLine: string;
  homePostalCode: string;
  /**
   * Free text, as given at intake — distinct from `Patient.localityId`, the
   * FK every planning query reads without opening this blob at all.
   */
  homeLocality: string;
  /** Not necessarily the patient — frequently a family member, or (see
   * `referenceContactIsOrganisation`) the institution they live in. */
  referenceContactName: string;
  referenceContactRelationship: string;
  referenceContactTelephone: string;
}

export const PATIENT_IDENTITY_FIELDS = [
  'fullName',
  'telephone',
  'homeAddressLine',
  'homePostalCode',
  'homeLocality',
  'referenceContactName',
  'referenceContactRelationship',
  'referenceContactTelephone',
] as const;

export const MAX_PATIENT_NAME_LENGTH = 160;
export const MAX_PATIENT_ADDRESS_LENGTH = 300;
export const MAX_PATIENT_TELEPHONE_LENGTH = 30;
export const MAX_PATIENT_CONTACT_NOTE_LENGTH = 500;

/**
 * The unsealed part of a patient record — what `MANAGE_PATIENTS` alone can
 * write. `identity` is included too, because a caller who also holds
 * `VIEW_PATIENT_IDENTITY` writes it through the same payload; the backend is
 * what refuses the field for everyone else (see `PatientsService`).
 */
export interface PatientInput {
  mobility: PatientMobility;
  needsOxygen?: boolean;
  escortRequired?: boolean;
  isBariatric?: boolean;
  /**
   * The geocoded home, coordinates only. Personal data, and kept unsealed
   * anyway — a decision, not an oversight: every planning/routing query needs
   * them, and sealing them would make routing impossible.
   */
  defaultLatitude?: number | null;
  defaultLongitude?: number | null;
  /** For traffic-corridor lookups — kept unsealed for the same reason as the
   * coordinates above. */
  localityId?: string | null;
  /** The reference contact may be an institution — e.g. the care home a
   * patient lives in — rather than a person; one contact, never a list. */
  referenceContactIsOrganisation?: boolean;
  /**
   * Whether the patient authorised naming this contact — a recorded fact,
   * never an assumption: telling a third party about a transport can
   * disclose the fact of the patient's treatment.
   */
  contactAuthorisationRecorded?: boolean;
  contactAuthorisationNote?: string | null;
  isActive?: boolean;
  /** Omitted (not merely emptied) for a caller without `VIEW_PATIENT_IDENTITY`,
   * on both read and write. */
  identity?: PatientIdentity | null;
}

export interface Patient extends PatientInput {
  id: string;
  locality?: Locality | null;
  /** Set when the blob was destroyed, so "never had identity" and "had it,
   * purged" stay distinct facts — the same split as `LiveRun.identityPurgedAt`. */
  identityPurgedAt?: string | null;
  /**
   * The blob is present but no key in this environment opens it. Not an
   * error: a key retired an hour early must not take a patient record down,
   * the same `identityUnavailable` state `LiveRun` uses.
   */
  identityUnavailable?: boolean;
  createdById: string;
  createdBy?: { id: string; firstName: string; lastName: string };
  createdAt: string;
  updatedAt: string;
}

/**
 * How long an untouched patient's identity outlives its last edit before the
 * sweep destroys it, absent an explicit `PATIENT_IDENTITY_RETENTION_DAYS`
 * (backend env var). Retention policy is still an open question on the
 * Feature (see the data-protection spike) — this default is deliberately
 * conservative pending an answer: long enough that an active patient's
 * identity is never destroyed out from under daily use, not a considered
 * policy value.
 */
export const DEFAULT_PATIENT_IDENTITY_RETENTION_DAYS = 365;

/**
 * Whether a sealed identity payload is coherent enough to save — same
 * "message or null" shape as `validateFacility`. Every field is required
 * together: there is no partial identity, per `PatientIdentity`'s doc comment.
 */
export function validatePatientIdentity(identity: PatientIdentity): string | null {
  const fullName = identity.fullName?.trim() ?? '';
  if (!fullName) return 'A patient needs a full name.';
  if (fullName.length > MAX_PATIENT_NAME_LENGTH) {
    return `A patient's name may be at most ${MAX_PATIENT_NAME_LENGTH} characters (got ${fullName.length}).`;
  }
  if (!identity.telephone?.trim()) return 'A patient needs a telephone number.';
  if (identity.telephone.trim().length > MAX_PATIENT_TELEPHONE_LENGTH) {
    return `A telephone number may be at most ${MAX_PATIENT_TELEPHONE_LENGTH} characters.`;
  }
  if (!identity.homeAddressLine?.trim()) return 'A patient needs a home address.';
  if (identity.homeAddressLine.trim().length > MAX_PATIENT_ADDRESS_LENGTH) {
    return `A home address may be at most ${MAX_PATIENT_ADDRESS_LENGTH} characters.`;
  }
  if (!identity.homePostalCode?.trim()) return 'A patient needs a home postal code.';
  if (!identity.homeLocality?.trim()) return 'A patient needs a home locality.';
  if (!identity.referenceContactName?.trim()) return 'The reference contact needs a name.';
  if (!identity.referenceContactRelationship?.trim()) {
    return 'The reference contact needs a relationship to the patient.';
  }
  if (!identity.referenceContactTelephone?.trim()) {
    return 'The reference contact needs a telephone number.';
  }
  if (identity.referenceContactTelephone.trim().length > MAX_PATIENT_TELEPHONE_LENGTH) {
    return `A telephone number may be at most ${MAX_PATIENT_TELEPHONE_LENGTH} characters.`;
  }
  return null;
}

/**
 * Whether a patient record is coherent — same "message or null" shape as
 * `validateFacility`. `identity`, when present, is validated by
 * `validatePatientIdentity` — its absence here is never itself an error, since
 * a `MANAGE_PATIENTS`-only caller can create and edit a patient without ever
 * being able to write it.
 */
export function validatePatient(input: PatientInput): string | null {
  if (!Object.values(PatientMobility).includes(input.mobility)) {
    return 'Choose the patient\'s mobility profile.';
  }

  const hasLatitude = input.defaultLatitude !== null && input.defaultLatitude !== undefined;
  const hasLongitude = input.defaultLongitude !== null && input.defaultLongitude !== undefined;
  if (hasLatitude !== hasLongitude) {
    return 'Give both the default latitude and longitude, or neither.';
  }
  if (hasLatitude) {
    if (
      !Number.isFinite(input.defaultLatitude!) ||
      input.defaultLatitude! < -90 ||
      input.defaultLatitude! > 90
    ) {
      return 'Default latitude must be between -90 and 90.';
    }
    if (
      !Number.isFinite(input.defaultLongitude!) ||
      input.defaultLongitude! < -180 ||
      input.defaultLongitude! > 180
    ) {
      return 'Default longitude must be between -180 and 180.';
    }
  }

  if (
    input.contactAuthorisationNote &&
    input.contactAuthorisationNote.length > MAX_PATIENT_CONTACT_NOTE_LENGTH
  ) {
    return `The authorisation note may be at most ${MAX_PATIENT_CONTACT_NOTE_LENGTH} characters.`;
  }

  if (input.identity) {
    const identityError = validatePatientIdentity(input.identity);
    if (identityError) return identityError;
  }

  return null;
}

// ─── Organisations & agreements (#227) ─────────────────────────────────────────

/**
 * A third party to a transport — the body that requests it, the one that
 * pays for it, or both (#219, "requester, payer and patient are three
 * different parties"). One row can hold both roles, but a single transport
 * request may still name different organisations in the two slots: AXA
 * Assistance refers a trip that Allianz covers. Deliberately no tariff or
 * rate fields — billing is modelled here, never performed; invoicing stays
 * in the delegation's own accounting software.
 */
export interface Organisation {
  id: string;
  name: string;
  taxId?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  isRequester: boolean;
  isPayer: boolean;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** The organisation's own reference codes — see `OrganisationReference`. */
  references?: OrganisationReference[];
}

export const MAX_ORGANISATION_NAME_LENGTH = 160;

/**
 * One of an organisation's own reference codes. A collection, not a single
 * column: the worked example carries two distinct codes at once — an
 * envelope-level account code (e.g. `AZP`) and a per-row insurer code —
 * neither of which is "the" code for the organisation.
 */
export interface OrganisationReference {
  id: string;
  organisationId: string;
  code: string;
  description?: string | null;
}

export const MAX_ORGANISATION_REFERENCE_CODE_LENGTH = 64;

export interface OrganisationReferenceInput {
  code: string;
  description?: string | null;
}

export interface OrganisationInput {
  name: string;
  taxId?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  isRequester?: boolean;
  isPayer?: boolean;
  notes?: string | null;
  isActive?: boolean;
  references?: OrganisationReferenceInput[];
}

/**
 * Whether an organisation record is coherent — same "message or null" shape
 * as every other validator here, so the form blocks Save with the wording
 * the API would reject the payload with.
 */
export function validateOrganisation(input: OrganisationInput): string | null {
  const name = input.name?.trim() ?? '';
  if (!name) return 'An organisation needs a name.';
  if (name.length > MAX_ORGANISATION_NAME_LENGTH) {
    return `An organisation name may be at most ${MAX_ORGANISATION_NAME_LENGTH} characters (got ${name.length}).`;
  }
  // Default-deny, same rationale as `validateFacility`: a role-less
  // organisation cannot be named as a requester or a payer by anything, so
  // it can never surface again once saved.
  if (!input.isRequester && !input.isPayer) {
    return 'Flag the organisation as a requester, a payer, or both.';
  }
  for (const reference of input.references ?? []) {
    const code = reference.code?.trim() ?? '';
    if (!code) return 'A reference code cannot be blank.';
    if (code.length > MAX_ORGANISATION_REFERENCE_CODE_LENGTH) {
      return `A reference code may be at most ${MAX_ORGANISATION_REFERENCE_CODE_LENGTH} characters (got ${code.length}).`;
    }
  }
  return null;
}

/**
 * The terms a given transport falls under — the national health service
 * agreement, an insurer's, a private arrangement — scoped to the
 * organisation paying under it. No tariff or rate fields, same reasoning as
 * `Organisation`.
 */
export interface Agreement {
  id: string;
  payerOrganisationId: string;
  payerOrganisation?: Organisation;
  name: string;
  externalReference?: string | null;
  /** `YYYY-MM-DD`. */
  validFrom: string;
  /** `YYYY-MM-DD`, or null for an agreement with no known end date. */
  validTo?: string | null;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const MAX_AGREEMENT_NAME_LENGTH = 160;

export interface AgreementInput {
  payerOrganisationId: string;
  name: string;
  externalReference?: string | null;
  validFrom: string;
  validTo?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

/**
 * Whether an agreement record is coherent — same "message or null" shape as
 * every other validator here.
 */
export function validateAgreement(input: AgreementInput): string | null {
  if (!input.payerOrganisationId) {
    return 'Choose the organisation paying under this agreement.';
  }
  const name = input.name?.trim() ?? '';
  if (!name) return 'An agreement needs a name.';
  if (name.length > MAX_AGREEMENT_NAME_LENGTH) {
    return `An agreement name may be at most ${MAX_AGREEMENT_NAME_LENGTH} characters (got ${name.length}).`;
  }
  if (!input.validFrom) return 'Give the date the agreement starts.';
  if (input.validTo && input.validTo < input.validFrom) {
    return 'The agreement cannot end before it starts.';
  }
  return null;
}

// ─── Transport requests (#228) ─────────────────────────────────────────────────
//
// A non-urgent transport referral, entered by hand from the source referral —
// field order and grouping mirror the referral's own layout (an email today;
// a governmental-platform integration is unscoped, see #219's spikes) rather
// than an idealised one. Envelope fields (`batchReference`, `communicatedAt`,
// `requesterAccountCode`, `responseDueAt`) are the referral's own header,
// carried on every row the same email covered rather than split into a
// separate batch shape — the same one-model-not-two bias `Organisation` uses
// for requester/payer.

/** Ocorrência on the referral. Seed values; the real list is an open question
 * (see the governmental-platform spike) — model as an enum, expect to extend. */
export enum TransportRequestOccurrenceType {
  CONSULTA = 'CONSULTA',
  TRATAMENTO = 'TRATAMENTO',
  ALTA = 'ALTA',
  EXAME = 'EXAME',
  OUTRO = 'OUTRO',
}

/**
 * A duration floor per occurrence type (#233) — policy, not physics, kept a
 * table rather than constants so a coordinator can change it without a
 * deploy. `minimumDurationMinutes` is what stops a leg's estimated end from
 * ever being blank: even the softest case has an earliest-possible-ready
 * time of appointment plus this floor (see `resolveEstimatedEnd`).
 * `defaultDurationMinutes` is a softer planning suggestion — actual treatment
 * duration is a per-patient input that varies far more than this table
 * models, from about 20 minutes to over 4 hours.
 */
export interface OccurrenceTypePolicyInput {
  minimumDurationMinutes: number;
  defaultDurationMinutes: number;
}

export interface OccurrenceTypePolicy extends OccurrenceTypePolicyInput {
  occurrenceType: TransportRequestOccurrenceType;
  updatedAt: string;
}

/** Seed values, and the fallback `resolveEstimatedEnd`'s callers use for any
 * occurrence type not yet in the table (a fresh `db push` test database, see
 * `DEFAULT_DELEGATION_SETTINGS`'s own fallback for the same reason). */
export const DEFAULT_OCCURRENCE_TYPE_POLICIES: Record<TransportRequestOccurrenceType, OccurrenceTypePolicyInput> = {
  [TransportRequestOccurrenceType.CONSULTA]: { minimumDurationMinutes: 30, defaultDurationMinutes: 30 },
  [TransportRequestOccurrenceType.TRATAMENTO]: { minimumDurationMinutes: 30, defaultDurationMinutes: 60 },
  [TransportRequestOccurrenceType.ALTA]: { minimumDurationMinutes: 15, defaultDurationMinutes: 20 },
  [TransportRequestOccurrenceType.EXAME]: { minimumDurationMinutes: 30, defaultDurationMinutes: 45 },
  [TransportRequestOccurrenceType.OUTRO]: { minimumDurationMinutes: 30, defaultDurationMinutes: 30 },
};

/** Same "message or null" shape as every other validator here. */
export function validateOccurrenceTypePolicy(input: OccurrenceTypePolicyInput): string | null {
  if (!Number.isInteger(input.minimumDurationMinutes) || input.minimumDurationMinutes <= 0) {
    return 'The minimum duration must be a positive whole number of minutes.';
  }
  if (!Number.isInteger(input.defaultDurationMinutes) || input.defaultDurationMinutes <= 0) {
    return 'The default duration must be a positive whole number of minutes.';
  }
  if (input.defaultDurationMinutes < input.minimumDurationMinutes) {
    return 'The default duration cannot be shorter than the minimum.';
  }
  return null;
}

/** Transporte on the referral — the vehicle type the requester is asking
 * for, which constrains vehicle choice at planning time. Same "seeded, not
 * final" caveat as `TransportRequestOccurrenceType`. Deliberately distinct
 * from `VehicleType` (the fleet's own physical configuration): this is what
 * was *asked for*, not what redinfo actually has. */
export enum TransportRequestVehicleType {
  AMBULANCIA = 'AMBULANCIA',
  TRANSPORTE = 'TRANSPORTE',
  OUTRO = 'OUTRO',
}

/** Whether the delegation has accepted the referral. `ACCEPTED`/`REJECTED`
 * are terminal — see `TransportRequest.decidedAt`/`decidedByUserId`. */
export enum TransportRequestDecision {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

export const MAX_TRANSPORT_REQUEST_REFERENCE_LENGTH = 120;
export const MAX_TRANSPORT_REQUEST_ADDRESS_LENGTH = 300;
export const MAX_TRANSPORT_REQUEST_MESSAGE_LENGTH = 2000;
export const MAX_TRANSPORT_REQUEST_REJECTION_REASON_LENGTH = 500;

/**
 * A destination named by a referral that a create-if-missing path may need
 * to add to the transport destination list on the fly — a private hospital
 * in Porto will not be in a table seeded with emergency rooms. Deliberately
 * lighter than `FacilityInput`: coordinates are not required here, unlike
 * `validateFacility`'s rule for a human-managed transport destination,
 * because a referral's destination has none yet — geocoding is unscoped
 * (#231). See `FacilitiesService.findOrCreateTransportDestination`.
 */
export interface DestinationFacilityInput {
  name: string;
  municipalityId: string;
  addressLine?: string | null;
  postalCode?: string | null;
}

/**
 * The writable shape of a referral, mirroring the source document's own
 * fields and grouping. `destinationFacilityId` names an existing facility;
 * `destinationFacility` is the create-if-missing alternative — exactly one
 * of the two is given, never both, never neither.
 */
export interface TransportRequestInput {
  batchReference: string;
  /** ISO datetime. */
  communicatedAt: string;
  requesterAccountCode: string;
  /** ISO datetime — the referral's stated deadline for a decision. */
  responseDueAt: string;

  /** The requester's own reference for this one transport — unique per
   * requesting organisation, never globally. */
  externalServiceNumber: string;
  /** ISO datetime — Data, date and time of the appointment. */
  appointmentAt: string;

  requestingOrganisationId: string;
  payingOrganisationId: string;
  agreementId?: string | null;

  patientId: string;

  occurrenceType: TransportRequestOccurrenceType;
  requestedVehicleType: TransportRequestVehicleType;

  /** Accom. */
  escortTravels: boolean;
  /** Ida-Volta. */
  isRoundTrip: boolean;

  /** Origin arrives as a door — a house number and a postcode — not a
   * locality, unlike `Patient.localityId`. */
  originAddress: string;
  originLatitude?: number | null;
  originLongitude?: number | null;

  destinationFacilityId?: string | null;
  destinationFacility?: DestinationFacilityInput | null;

  /** Msg. */
  freeTextMessage?: string | null;
  /** The purpose of the referral's `Coord` column is unresolved (see the
   * referral-field-list spike) — parked verbatim rather than dropped. */
  coordColumnValue?: string | null;
}

export interface TransportRequest extends Omit<TransportRequestInput, 'destinationFacility'> {
  id: string;
  requestingOrganisation?: Organisation;
  payingOrganisation?: Organisation;
  agreement?: Agreement | null;
  patient?: Patient;
  destinationFacilityId: string;
  destinationFacility?: Facility;

  decision: TransportRequestDecision;
  decidedByUserId?: string | null;
  decidedAt?: string | null;
  rejectionReason?: string | null;
  /** The moment somebody actually clicked Aceitar on the requester's own
   * platform — a shadow of a decision made outside redinfo, and the two can
   * silently diverge. Accepting a request in redinfo never sets this. */
  externallyRegisteredAt?: string | null;

  /**
   * Minutes left before `responseDueAt`, negative once overdue — computed at
   * serialization time so the ageing query and its tests agree on what "time
   * remaining" means without either recomputing "now" independently.
   */
  minutesUntilResponseDue: number;

  createdById: string;
  createdBy?: { id: string; firstName: string; lastName: string };
  createdAt: string;
  updatedAt: string;
}

/** Minutes left before `responseDueAt`, negative once overdue. Shared so the
 * backend (serialization) and its tests compute the same number. */
export function minutesUntilResponseDue(responseDueAt: string, now: Date = new Date()): number {
  return Math.round((new Date(responseDueAt).getTime() - now.getTime()) / 60000);
}

/** Accepting or rejecting a referral (#229 builds the decision page this
 * feeds; #228 exposes the capability). Rejecting needs a reason so the
 * requester can be told why; accepting never does. */
export interface DecideTransportRequestInput {
  decision: TransportRequestDecision.ACCEPTED | TransportRequestDecision.REJECTED;
  rejectionReason?: string | null;
}

/**
 * Whether a referral is coherent — same "message or null" shape as every
 * other validator here, so the intake form blocks Save with the wording the
 * API would reject the payload with.
 */
export function validateTransportRequest(input: TransportRequestInput): string | null {
  if (!input.batchReference?.trim()) return 'Give the communication\'s own reference.';
  if (input.batchReference.trim().length > MAX_TRANSPORT_REQUEST_REFERENCE_LENGTH) {
    return `The communication reference may be at most ${MAX_TRANSPORT_REQUEST_REFERENCE_LENGTH} characters.`;
  }
  if (!input.communicatedAt) return 'Give when the referral was communicated.';
  if (!input.requesterAccountCode?.trim()) return 'Give the requester\'s account code.';
  if (!input.responseDueAt) return 'Give the deadline to respond.';

  if (!input.externalServiceNumber?.trim()) return 'Give the requester\'s own reference for this transport.';
  if (input.externalServiceNumber.trim().length > MAX_TRANSPORT_REQUEST_REFERENCE_LENGTH) {
    return `The service reference may be at most ${MAX_TRANSPORT_REQUEST_REFERENCE_LENGTH} characters.`;
  }
  if (!input.appointmentAt) return 'Give the appointment date and time.';

  if (!input.requestingOrganisationId) return 'Choose the requesting organisation.';
  if (!input.payingOrganisationId) return 'Choose the paying organisation.';
  if (!input.patientId) return 'Choose the patient.';

  if (!Object.values(TransportRequestOccurrenceType).includes(input.occurrenceType)) {
    return 'Choose the occurrence type.';
  }
  if (!Object.values(TransportRequestVehicleType).includes(input.requestedVehicleType)) {
    return 'Choose the requested vehicle type.';
  }

  if (!input.originAddress?.trim()) return 'Give the pickup address.';
  if (input.originAddress.trim().length > MAX_TRANSPORT_REQUEST_ADDRESS_LENGTH) {
    return `The pickup address may be at most ${MAX_TRANSPORT_REQUEST_ADDRESS_LENGTH} characters.`;
  }
  const hasOriginLatitude = input.originLatitude !== null && input.originLatitude !== undefined;
  const hasOriginLongitude = input.originLongitude !== null && input.originLongitude !== undefined;
  if (hasOriginLatitude !== hasOriginLongitude) {
    return 'Give both the pickup latitude and longitude, or neither.';
  }

  const hasFacilityId = !!input.destinationFacilityId;
  const hasNewFacility = !!input.destinationFacility;
  if (hasFacilityId === hasNewFacility) {
    return 'Choose an existing destination facility, or give a new one to create.';
  }
  if (hasNewFacility) {
    const name = input.destinationFacility!.name?.trim() ?? '';
    if (!name) return 'The new destination facility needs a name.';
    if (!input.destinationFacility!.municipalityId) {
      return 'Choose the municipality the new destination facility is in.';
    }
  }

  if (
    input.freeTextMessage &&
    input.freeTextMessage.length > MAX_TRANSPORT_REQUEST_MESSAGE_LENGTH
  ) {
    return `The message may be at most ${MAX_TRANSPORT_REQUEST_MESSAGE_LENGTH} characters.`;
  }

  return null;
}

/**
 * The only sensible correspondence between what a referral asks for
 * (`TransportRequestVehicleType`, the requester's own vocabulary) and what
 * the fleet actually is (`VehicleType`, its physical configuration). `OUTRO`
 * names nothing physical, so it maps to `null` — the feasibility panel
 * (#229) leaves that case for the coordinator to judge by eye rather than
 * guessing.
 */
export function mapTransportRequestVehicleType(type: TransportRequestVehicleType): VehicleType | null {
  switch (type) {
    case TransportRequestVehicleType.AMBULANCIA:
      return VehicleType.EMERGENCY;
    case TransportRequestVehicleType.TRANSPORTE:
      return VehicleType.TRANSPORT;
    default:
      return null;
  }
}

/** One absence overlapping the appointment date, with the name the
 * feasibility panel (#229) actually renders — `StaffAbsence` itself only
 * carries `userId`. */
export interface TransportRequestAbsentStaff {
  userId: string;
  userName: string;
  kind: StaffAbsenceKind;
  /** ISO dates — the absence's own range, not clipped to the appointment date. */
  startDate: string;
  endDate: string;
}

/** One vehicle already committed for the appointment date — the feasibility
 * panel's "who/what already has it" answer, not just that it's busy. */
export interface TransportRequestCommittedVehicle {
  vehicleId: string;
  licensePlate: string;
  numeroCauda: string;
  vehicleType: VehicleType;
  startsAt: string;
  endsAt: string;
  source: VehicleOccupancySource;
  sourceId: string;
}

/** The vehicles left over for the appointment date, grouped by their
 * physical type — the feasibility panel's "free ones by type". */
export interface TransportRequestFreeVehicleGroup {
  vehicleType: VehicleType;
  vehicles: Array<{ id: string; licensePlate: string; numeroCauda: string }>;
}

/**
 * What the decision page (#229) needs to answer "are we actually free that
 * day?" for one referral's appointment date, pre-joined so the page never
 * cross-references the roster, the absence calendar and the vehicle
 * occupancy table itself. `requestedVehicleTypeFree` is `null` exactly when
 * `mapTransportRequestVehicleType` is — see its doc comment.
 */
export interface TransportRequestFeasibility {
  /** ISO date, `YYYY-MM-DD` — the referral's `appointmentAt`, day part only. */
  date: string;
  roster: TodayRosterMember[];
  absentStaff: TransportRequestAbsentStaff[];
  committedVehicles: TransportRequestCommittedVehicle[];
  freeVehiclesByType: TransportRequestFreeVehicleGroup[];
  requestedVehicleTypeFree: boolean | null;
}

// ─── Treatment plans & transport legs (#230) ───────────────────────────────────
//
// The central modelling decision for recurring non-urgent transport (#219):
// the recurrence rule (`TreatmentPlan`) stays separate from the materialised
// occurrences (`TransportLeg`) — the leg is the durable, billable unit, the
// plan only a generator. A one-off referral produces legs with no plan above
// them at all; building it the other way round (plan as a mandatory parent)
// would force every ad-hoc journey to invent a series of one.
//
// The leg carries its own origin and destination rather than deriving them
// from the plan/request on every read — the return trip is usually the
// patient's own pickup address, but occasionally isn't, and that exception
// must be representable per leg without editing the plan.

export enum LegDirection {
  OUTBOUND = 'OUTBOUND',
  RETURN = 'RETURN',
}

export enum LegStatus {
  PLANNED = 'PLANNED',
  ASSIGNED = 'ASSIGNED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

/** Who/what caused a cancellation — a fixed vocabulary rather than free
 * text, since it's the fact billing/support actually filters and reports
 * on. `cancellationReason` stays free text alongside it for the detail. */
export enum LegCancellationSource {
  PATIENT = 'PATIENT',
  FACILITY = 'FACILITY',
  DELEGATION = 'DELEGATION',
}

/**
 * Who supplied a leg's `estimatedEndAt` (#233) — provenance, not confidence.
 * An earlier draft of Feature #219 proposed grading end times firm against
 * soft; that's deliberately dropped. Every estimate is of broadly similar
 * quality, so there is no reliability field anywhere alongside this — keep
 * source for later calibration against actuals, not a score nobody could
 * fill in honestly.
 */
export enum EstimatedEndSource {
  FACILITY_SUPPLIED = 'FACILITY_SUPPLIED',
  COORDINATOR_JUDGED = 'COORDINATOR_JUDGED',
}

export const MAX_TREATMENT_PLAN_NOTES_LENGTH = 2000;
export const MAX_LEG_ADDRESS_LENGTH = 300;
export const MAX_LEG_CANCELLATION_REASON_LENGTH = 500;

const TIME_OF_DAY_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The writable shape of a treatment plan. */
export interface TreatmentPlanInput {
  destinationFacilityId: string;
  /** `Date#getDay()` convention (0 = Sunday … 6 = Saturday), matching
   * `PaidStaffSchedule.dayOfWeek`/`isoDayOfWeek` — not the 1..7 numbering a
   * referral form might use. */
  daysOfWeek: number[];
  /** `HH:mm`, 24h, local time-of-day — a recurring wall-clock time, not one instant. */
  treatmentStartTime: string;
  treatmentEndTime?: string | null;
  /** ISO date. */
  validFrom: string;
  /** ISO date, inclusive. */
  validTo: string;
  notes?: string | null;
}

export interface TreatmentPlan extends TreatmentPlanInput {
  id: string;
  transportRequestId: string;
  destinationFacility?: Facility;
  createdAt: string;
  updatedAt: string;
}

/** Same "message or null" shape as `validateTransportRequest`. */
export function validateTreatmentPlan(input: TreatmentPlanInput): string | null {
  if (!input.destinationFacilityId) return 'Choose the treatment facility.';
  if (!input.daysOfWeek?.length) return 'Choose at least one day of the week.';
  if (new Set(input.daysOfWeek).size !== input.daysOfWeek.length) {
    return 'Each day of the week may be chosen only once.';
  }
  if (input.daysOfWeek.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    return 'Days of the week must be between 0 (Sunday) and 6 (Saturday).';
  }
  if (!TIME_OF_DAY_REGEX.test(input.treatmentStartTime ?? '')) return 'Give the treatment start time.';
  if (input.treatmentEndTime && !TIME_OF_DAY_REGEX.test(input.treatmentEndTime)) {
    return 'Give a valid treatment end time.';
  }
  if (input.treatmentEndTime && input.treatmentEndTime <= input.treatmentStartTime) {
    return 'The treatment end time must be after the start time.';
  }
  if (!input.validFrom) return 'Give when the plan starts.';
  if (!input.validTo) return 'Give when the plan ends.';
  if (input.validTo < input.validFrom) return 'The plan cannot end before it starts.';
  if (input.notes && input.notes.length > MAX_TREATMENT_PLAN_NOTES_LENGTH) {
    return `Notes may be at most ${MAX_TREATMENT_PLAN_NOTES_LENGTH} characters.`;
  }
  return null;
}

/** One materialised, dated, direction-specific journey. See the banner
 * comment above for why this — not `TreatmentPlan` — is the durable unit. */
export interface TransportLeg {
  id: string;
  transportRequestId: string;
  /** Null for a one-off referral's leg. */
  treatmentPlanId: string | null;
  /** ISO date — the day this leg actually serves. Editable: rescheduling a
   * leg means changing this, never its identity. */
  date: string;
  /** ISO date — the recurrence slot this leg was generated for, frozen at
   * creation. See the field's own doc comment in `schema.prisma` for why it
   * exists: it's the generator's idempotency key, immune to a later reschedule. */
  generatedForDate: string;
  direction: LegDirection;

  originAddress: string | null;
  originLatitude: number | null;
  originLongitude: number | null;
  originFacilityId: string | null;
  originFacility?: Facility | null;

  destinationAddress: string | null;
  destinationLatitude: number | null;
  destinationLongitude: number | null;
  destinationFacilityId: string | null;
  destinationFacility?: Facility | null;

  /** ISO datetime. */
  plannedPickupAt: string | null;
  /** ISO datetime. */
  plannedDropoffAt: string | null;
  /** ISO datetime. */
  actualPickupAt: string | null;
  /** ISO datetime. */
  actualDropoffAt: string | null;

  status: LegStatus;
  cancellationReason: string | null;
  cancellationSource: LegCancellationSource | null;

  /** ISO datetime — when the facility said, or the coordinator judged, the
   * occurrence will end (#233). Editable and internal; never stored as
   * though the referral had stated it as fact. Null until someone supplies
   * one — see `effectiveEstimatedEndAt` for what to plan against instead. */
  estimatedEndAt: string | null;
  estimatedEndSource: EstimatedEndSource | null;
  /** ISO datetime — `estimatedEndAt` when supplied, or appointment-plus-floor
   * otherwise (#233): never blank. See `resolveEstimatedEnd`. */
  effectiveEstimatedEndAt: string;
  /** The leg's own arrival-timing read (#233), `null` when nothing is
   * planned yet or there is nothing to warn about. Only meaningful for an
   * `OUTBOUND` leg — a return trip has no treatment start to be on time for. */
  arrivalWindowWarning: ArrivalWindowWarning;

  createdAt: string;
  updatedAt: string;
}

/** The editable slice of a leg — address/facility/time detail and, per the
 * reschedule case above, `date` itself. Cancelling and marking no-show go
 * through their own dedicated actions instead (see below), the same
 * separation `TransportRequestsService.decide` keeps from `update`. */
export interface UpdateTransportLegInput {
  date?: string;
  originAddress?: string | null;
  originLatitude?: number | null;
  originLongitude?: number | null;
  originFacilityId?: string | null;
  destinationAddress?: string | null;
  destinationLatitude?: number | null;
  destinationLongitude?: number | null;
  destinationFacilityId?: string | null;
  plannedPickupAt?: string | null;
  plannedDropoffAt?: string | null;
  estimatedEndAt?: string | null;
  estimatedEndSource?: EstimatedEndSource | null;
}

export function validateUpdateTransportLeg(input: UpdateTransportLegInput): string | null {
  if (input.date !== undefined && !input.date) return 'Give the date the leg serves.';
  if (input.originAddress && input.originAddress.length > MAX_LEG_ADDRESS_LENGTH) {
    return `The pickup address may be at most ${MAX_LEG_ADDRESS_LENGTH} characters.`;
  }
  if (input.destinationAddress && input.destinationAddress.length > MAX_LEG_ADDRESS_LENGTH) {
    return `The destination address may be at most ${MAX_LEG_ADDRESS_LENGTH} characters.`;
  }
  const hasOriginLatitude = input.originLatitude !== null && input.originLatitude !== undefined;
  const hasOriginLongitude = input.originLongitude !== null && input.originLongitude !== undefined;
  if (hasOriginLatitude !== hasOriginLongitude) return 'Give both the pickup latitude and longitude, or neither.';
  const hasDestinationLatitude = input.destinationLatitude !== null && input.destinationLatitude !== undefined;
  const hasDestinationLongitude = input.destinationLongitude !== null && input.destinationLongitude !== undefined;
  if (hasDestinationLatitude !== hasDestinationLongitude) {
    return 'Give both the destination latitude and longitude, or neither.';
  }
  const hasEstimatedEndAt = input.estimatedEndAt !== null && input.estimatedEndAt !== undefined;
  const hasEstimatedEndSource = input.estimatedEndSource !== null && input.estimatedEndSource !== undefined;
  if (hasEstimatedEndAt !== hasEstimatedEndSource) {
    return 'Give both an estimated end time and who supplied it, or neither.';
  }
  return null;
}

/**
 * The end time to plan against for a leg (#233) — its own supplied estimate
 * when it has one, or appointment-plus-floor otherwise. Never blank: this is
 * what stops the planning board showing nothing where a time should be. Uses
 * the occurrence type's *minimum* duration deliberately, not its softer
 * default — the earliest the vehicle can possibly be released.
 */
export function resolveEstimatedEnd(
  appointmentAt: string,
  occurrenceType: TransportRequestOccurrenceType,
  policies: Record<TransportRequestOccurrenceType, OccurrenceTypePolicyInput>,
  leg: { estimatedEndAt: string | null },
): string {
  if (leg.estimatedEndAt) return leg.estimatedEndAt;
  const floorMinutes = policies[occurrenceType].minimumDurationMinutes;
  return new Date(new Date(appointmentAt).getTime() + floorMinutes * 60_000).toISOString();
}

/** Cancelling a leg (#230) never touches the plan above it. `source` is a
 * fixed vocabulary (see `LegCancellationSource`); `reason` is the free-text detail. */
export interface CancelTransportLegInput {
  reason: string;
  source: LegCancellationSource;
}

export function validateCancelTransportLeg(input: CancelTransportLegInput): string | null {
  if (!input.reason?.trim()) return 'Give a reason for cancelling the leg.';
  if (input.reason.trim().length > MAX_LEG_CANCELLATION_REASON_LENGTH) {
    return `The cancellation reason may be at most ${MAX_LEG_CANCELLATION_REASON_LENGTH} characters.`;
  }
  if (!Object.values(LegCancellationSource).includes(input.source)) {
    return 'Choose who or what caused the cancellation.';
  }
  return null;
}

// ─── Trips (#234) ───────────────────────────────────────────────────────────
//
// The model and API behind the planning board — the board itself is #235. A
// `Trip` is a vehicle and crew on a date, carrying an ordered `TripStop`
// sequence that serves several patients' `TransportLeg`s. A trip is **not**
// a patient's round journey: a leg's `PICKUP`/`DROPOFF` pair moves between
// trips in one call (`AssignTransportLegInput`), so the outbound and return
// legs of the same patient on the same day may sit on different trips, with
// different vehicles and different crews. `WAIT`/`RETURN_TO_BASE` stops
// carry no leg at all.
//
// Validation follows the override precedent used everywhere else in this
// schema (`ScheduleAssignment.isOverride`/`certificationOverrideReason`,
// `VehicleOccupancy.overrideReason`): a hard constraint throws unless a
// recorded reason is supplied in the same call. Vehicle capacity is the one
// exception with **no** override field — it's a physical limit, not a
// judgement call. Arrival timing is soft and never throws; it's exposed as
// data for the board to rank (`TripPlanIssue`), never a block.

export enum TripStatus {
  PLANNED = 'PLANNED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum TripStopKind {
  PICKUP = 'PICKUP',
  DROPOFF = 'DROPOFF',
  WAIT = 'WAIT',
  RETURN_TO_BASE = 'RETURN_TO_BASE',
}

/**
 * Decided in advance and recorded, never inferred after the fact — the two
 * choices produce completely different vehicle occupancy. Only meaningful on
 * a `WAIT` stop.
 */
export enum TripStopDwell {
  WAIT = 'WAIT',
  RELEASE = 'RELEASE',
}

export const MAX_TRIP_NOTES_LENGTH = 2000;
export const MAX_OVERRIDE_REASON_LENGTH = 500;

export interface Trip {
  id: string;
  /** ISO date. */
  date: string;
  vehicleId: string;
  status: TripStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTripInput {
  date: string;
  vehicleId: string;
  notes?: string | null;
}

export function validateCreateTrip(input: CreateTripInput): string | null {
  if (!input.date) return 'Give the date the trip serves.';
  if (!input.vehicleId) return 'Choose a vehicle.';
  if (input.notes && input.notes.length > MAX_TRIP_NOTES_LENGTH) {
    return `Notes may be at most ${MAX_TRIP_NOTES_LENGTH} characters.`;
  }
  return null;
}

export interface TripCrewMember {
  id: string;
  tripId: string;
  userId: string;
  role: CertificationType;
  /** Set when added despite a `StaffAbsence` covering the trip's date —
   * mirrors `ScheduleAssignment.certificationOverrideReason`. */
  overrideReason: string | null;
  createdAt: string;
}

export interface AddTripCrewMemberInput {
  userId: string;
  role: CertificationType;
  overrideReason?: string | null;
}

export function validateAddTripCrewMember(input: AddTripCrewMemberInput): string | null {
  if (!input.userId) return 'Choose a crew member.';
  if (!Object.values(CertificationType).includes(input.role)) return 'Choose the role they are filling.';
  if (input.overrideReason && input.overrideReason.length > MAX_OVERRIDE_REASON_LENGTH) {
    return `The override reason may be at most ${MAX_OVERRIDE_REASON_LENGTH} characters.`;
  }
  return null;
}

export interface TripStop {
  id: string;
  tripId: string;
  sequence: number;
  kind: TripStopKind;
  transportLegId: string | null;
  facilityId: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  /** ISO datetime. */
  plannedAt: string;
  /** ISO datetime. */
  actualAt: string | null;
  dwellDecision: TripStopDwell | null;
  dwellMinutes: number | null;
  createdAt: string;
  updatedAt: string;
}

/** `POST /trips/:id/legs` — creates or moves the leg's `PICKUP`+`DROPOFF`
 * pair onto this trip in one call; re-assigning a leg from one trip to
 * another is this same call, not a delete-and-recreate. */
export interface AssignTransportLegInput {
  transportLegId: string;
  pickupPlannedAt: string;
  dropoffPlannedAt: string;
}

export function validateAssignTransportLeg(input: AssignTransportLegInput): string | null {
  if (!input.transportLegId) return 'Choose a leg to assign.';
  if (!input.pickupPlannedAt) return 'Give the planned pickup time.';
  if (!input.dropoffPlannedAt) return 'Give the planned dropoff time.';
  if (new Date(input.dropoffPlannedAt) < new Date(input.pickupPlannedAt)) {
    return 'The dropoff cannot be planned before the pickup.';
  }
  return null;
}

/** `POST /trips/:id/stops` — a `WAIT` or `RETURN_TO_BASE` stop, the only two
 * kinds ever added directly; `PICKUP`/`DROPOFF` only ever arrive as a pair,
 * via `AssignTransportLegInput`. */
export interface CreateTripStopInput {
  kind: TripStopKind.WAIT | TripStopKind.RETURN_TO_BASE;
  plannedAt: string;
  /** Required for `WAIT` — the facility being waited at. Ignored for
   * `RETURN_TO_BASE`, which always targets the delegation's own base. */
  facilityId?: string | null;
  dwellDecision?: TripStopDwell | null;
  dwellMinutes?: number | null;
}

export function validateCreateTripStop(input: CreateTripStopInput): string | null {
  if (input.kind !== TripStopKind.WAIT && input.kind !== TripStopKind.RETURN_TO_BASE) {
    return 'Only a WAIT or RETURN_TO_BASE stop may be added directly.';
  }
  if (!input.plannedAt) return 'Give the planned time.';
  if (input.kind === TripStopKind.WAIT && !input.facilityId) {
    return 'A WAIT stop needs the facility being waited at.';
  }
  if (input.dwellMinutes != null && input.dwellMinutes < 0) {
    return 'Dwell minutes cannot be negative.';
  }
  return null;
}

export interface UpdateTripStopInput {
  plannedAt?: string;
  actualAt?: string | null;
  dwellDecision?: TripStopDwell | null;
  dwellMinutes?: number | null;
}

export function validateUpdateTripStop(input: UpdateTripStopInput): string | null {
  if (input.dwellMinutes != null && input.dwellMinutes < 0) {
    return 'Dwell minutes cannot be negative.';
  }
  return null;
}

// ─── Ranked validation ──────────────────────────────────────────────────────

export type TripPlanIssueLevel = 'ERROR' | 'WARNING' | 'NOTE';

/** One ranked finding for the planning board — never a block, see the banner
 * comment above. A human decides what to do about it. */
export interface TripPlanIssue {
  level: TripPlanIssueLevel;
  code: string;
  message: string;
  tripStopId?: string;
  transportLegId?: string;
}

export interface VehicleCapacityInput {
  seatedCapacity: number;
  wheelchairPositions: number;
  stretcherPositions: number;
}

/** What one leg's patient adds to the vehicle while onboard — an ambulatory
 * passenger and their escort (if any) each take a seat; a wheelchair or
 * stretcher user takes the matching position instead. */
export interface PassengerCapacityRequirement {
  wheelchairPositions: number;
  seats: number;
  stretcherPositions: number;
}

const EMPTY_PASSENGER_DEMAND: PassengerCapacityRequirement = {
  wheelchairPositions: 0,
  seats: 0,
  stretcherPositions: 0,
};

function addPassengerDemand(
  a: PassengerCapacityRequirement,
  b: PassengerCapacityRequirement,
): PassengerCapacityRequirement {
  return {
    wheelchairPositions: a.wheelchairPositions + b.wheelchairPositions,
    seats: a.seats + b.seats,
    stretcherPositions: a.stretcherPositions + b.stretcherPositions,
  };
}

/** One stop as the onboard walk needs to see it — enough to add/remove a
 * leg's passengers and to know when the vehicle is due somewhere.
 * `sequence` is manifest/display order only, set by whoever plans the
 * route; the walk itself orders by `plannedAt`; see `walkTripStops`. */
export interface TripStopWalkInput {
  id: string;
  sequence: number;
  kind: TripStopKind;
  transportLegId: string | null;
  plannedAt: string;
  dwellMinutes?: number | null;
  /** Only meaningful on a `PICKUP` stop — what boards the vehicle here. */
  passengerRequirement?: PassengerCapacityRequirement;
}

/** The vehicle's state on the stretch between two consecutive stops. */
export interface TripStopSegment {
  fromStopId: string;
  toStopId: string;
  onboardLegIds: string[];
  demand: PassengerCapacityRequirement;
}

/**
 * The one onboard-tracking pass every other trip computation is a map over:
 * walks the stops **in calendar-time order**, adding a leg's passengers at
 * its `PICKUP` and removing them at its matching `DROPOFF`. Capacity
 * checking and empty-leg detection are both simple filters over the result
 * — see `checkTripCapacity`/`computeEmptyLegs`.
 *
 * Deliberately sorted by `plannedAt`, not `sequence`: whether two
 * wheelchair passengers are physically in the vehicle at the same moment is
 * a fact about calendar time, independent of the manifest order a
 * coordinator happens to have set for display. `sequence` is a tiebreaker
 * only, for two stops planned at the same instant.
 */
export function walkTripStops(stops: TripStopWalkInput[]): TripStopSegment[] {
  const ordered = [...stops].sort(
    (a, b) => new Date(a.plannedAt).getTime() - new Date(b.plannedAt).getTime() || a.sequence - b.sequence,
  );
  const onboard = new Map<string, PassengerCapacityRequirement>();
  const segments: TripStopSegment[] = [];

  for (let i = 0; i < ordered.length; i++) {
    const stop = ordered[i];
    if (stop.kind === TripStopKind.PICKUP && stop.transportLegId) {
      onboard.set(stop.transportLegId, stop.passengerRequirement ?? EMPTY_PASSENGER_DEMAND);
    } else if (stop.kind === TripStopKind.DROPOFF && stop.transportLegId) {
      onboard.delete(stop.transportLegId);
    }

    // One segment per stop, not per pair: the vehicle's state immediately
    // after this stop, lasting until the next one — or, for the last stop,
    // for the rest of the trip. Without a trailing self-referencing segment
    // here, an overload created by the very last stop (a `PICKUP` with no
    // `DROPOFF` after it yet) would never be caught by anything.
    const next = ordered[i + 1];
    segments.push({
      fromStopId: stop.id,
      toStopId: next ? next.id : stop.id,
      onboardLegIds: [...onboard.keys()],
      demand: [...onboard.values()].reduce(addPassengerDemand, EMPTY_PASSENGER_DEMAND),
    });
  }

  return segments;
}

/** Over capacity for the passenger mix is a hard constraint with no override
 * — a vehicle cannot physically seat more wheelchairs than it has positions
 * for, whatever reason is on file. */
export function checkTripCapacity(segments: TripStopSegment[], vehicle: VehicleCapacityInput): TripPlanIssue[] {
  const issues: TripPlanIssue[] = [];
  for (const segment of segments) {
    if (segment.demand.wheelchairPositions > vehicle.wheelchairPositions) {
      issues.push({
        level: 'ERROR',
        code: 'OVER_CAPACITY_WHEELCHAIR',
        message: `${segment.demand.wheelchairPositions} wheelchair passengers exceeds the vehicle's ${vehicle.wheelchairPositions} positions.`,
        tripStopId: segment.toStopId,
      });
    }
    if (segment.demand.stretcherPositions > vehicle.stretcherPositions) {
      issues.push({
        level: 'ERROR',
        code: 'OVER_CAPACITY_STRETCHER',
        message: `${segment.demand.stretcherPositions} stretcher passengers exceeds the vehicle's ${vehicle.stretcherPositions} positions.`,
        tripStopId: segment.toStopId,
      });
    }
    if (segment.demand.seats > vehicle.seatedCapacity) {
      issues.push({
        level: 'ERROR',
        code: 'OVER_CAPACITY_SEATS',
        message: `${segment.demand.seats} seated passengers exceeds the vehicle's ${vehicle.seatedCapacity} seats.`,
        tripStopId: segment.toStopId,
      });
    }
  }
  return issues;
}

/** The stretches where the vehicle moves with nobody in it — waste the
 * planner is trying to squeeze out, and otherwise invisible: nobody is in
 * the vehicle to notice. */
export function computeEmptyLegs(segments: TripStopSegment[]): TripStopSegment[] {
  return segments.filter((segment) => segment.onboardLegIds.length === 0);
}

/** A trip owns exactly one `VehicleOccupancy` interval, spanning every stop
 * including a `WAIT` stop's full dwell — the interval a gap-treating model
 * would miss, offering a vehicle that's actually standing in a hospital car
 * park sixty kilometres away. */
export function computeTripOccupancyWindow(
  stops: { plannedAt: string; dwellMinutes?: number | null }[],
): { startsAt: string; endsAt: string } {
  if (stops.length === 0) throw new Error('A trip needs at least one stop to have an occupancy window.');
  let startsAt = Infinity;
  let endsAt = -Infinity;
  for (const stop of stops) {
    const at = new Date(stop.plannedAt).getTime();
    startsAt = Math.min(startsAt, at);
    endsAt = Math.max(endsAt, at + (stop.dwellMinutes ?? 0) * 60_000);
  }
  return { startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() };
}

/**
 * Wait when the round trip back to base exceeds the expected dwell — exposed
 * as data for the planning board, never decided here. Whether a crew waits
 * or a different driver collects the patient later depends on how many
 * drivers are free and how much work the day holds, which this function has
 * no visibility into on purpose.
 */
export interface DwellBreakEven {
  expectedDwellMinutes: number;
  travelToBaseMinutes: number;
  roundTripToBaseMinutes: number;
}

export function computeDwellBreakEven(expectedDwellMinutes: number, travelToBaseMinutes: number): DwellBreakEven {
  return {
    expectedDwellMinutes,
    travelToBaseMinutes,
    roundTripToBaseMinutes: travelToBaseMinutes * 2,
  };
}

// ─── API error codes (#180 phase 4) ───────────────────────────────────────────
//
// A machine code for the business-rule failures that are genuinely worth a
// crew or coordinator reading in their own language — mirroring
// `EventReportProblem`'s shape rather than inventing a second idea: the API's
// response carries English (for the response itself and for a developer
// reading a log) plus a code the client translates by, with the English
// message as the fallback if a translation is ever missing.
//
// Deliberately not exhaustive. `NotFoundException`s and most `BadRequest`s
// stay plain English — they are developer/URL-shape errors ("Holiday abc123
// not found"), not business rules a person is meant to read and act on. This
// list is the audited subset that is: the schedule-assignment and
// schedule-publish flows (named explicitly in #180's plan), and the
// availability-window overlap check (the plan's worked example). Extending
// it to another module is a deliberate choice, not something to do in bulk —
// see the plan's "do not blanket-code all 147" note.
export type ApiErrorCode =
  | 'WINDOW_OVERLAP_OPEN'
  | 'WINDOW_OVERLAP_CLOSED'
  | 'WINDOW_ALREADY_CLOSED'
  | 'WINDOW_COMPENSATION_LOCKED'
  | 'SCHEDULE_DRAFT_NOT_VISIBLE'
  | 'SCHEDULE_ALREADY_EXISTS_FOR_WINDOW'
  | 'SCHEDULE_PUBLISHED_CANNOT_DELETE'
  | 'SCHEDULE_ALREADY_PUBLISHED'
  | 'ASSIGNMENT_PERSON_INACTIVE'
  | 'ASSIGNMENT_PERSON_NOT_FIELD_PERSONNEL'
  | 'ASSIGNMENT_CERTIFICATION_REQUIRED'
  | 'ASSIGNMENT_ALREADY_ON_SHIFT'
  | 'ASSIGNMENT_ROLE_FULL'
  | 'ASSIGNMENT_DATE_OUTSIDE_WINDOW'
  | 'ASSIGNMENT_WINDOW_HAS_NO_ROLES'
  | 'ASSIGNMENT_ROLE_ID_REQUIRED'
  | 'ASSIGNMENT_ROLE_NOT_IN_WINDOW'
  | 'SELF_ASSIGN_SCHEDULE_NOT_PUBLISHED'
  | 'SELF_ASSIGN_OVERLAPPING_SHIFT'
  | 'SELF_ASSIGN_PAST_SHIFT'
  | 'SHIFT_ADJUSTMENT_END_BEFORE_START'
  | 'SHIFT_ADJUSTMENT_OVERLAPS'
  | 'MATERIAL_ITEM_BARCODE_CONFLICT'
  | 'LAST_SYSTEM_ADMIN'
  | 'INEM_SESSION_NOT_ACTIVE'
  | 'LIVE_RUN_CLOSE_BLOCKED'
  | 'PAID_STAFF_SCHEDULE_INVALID_RANGE'
  | 'COMPENSATION_RECLASSIFY_PRE_CUTOVER';

export interface ApiErrorBody {
  code: ApiErrorCode;
  /** English — the API response's own message, and what a developer reads in a log. */
  message: string;
  /** Polyglot interpolation values for the client's translated version, e.g. `{ role: 'Driver' }`. */
  params?: Record<string, string | number>;
}
