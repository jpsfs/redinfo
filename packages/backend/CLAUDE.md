# `packages/backend` — token-efficient lookup

NestJS + Prisma. Read `../shared/CLAUDE.md` first if the feature touches shared types.

## Module anatomy

`src/<feature>/`:
- `<feature>.module.ts`, `<feature>.controller.ts`, `<feature>.service.ts`
- extra services for sub-concerns: `<feature>-<concern>.service.ts` (e.g.
  `schedule-assignments.service.ts`, `schedule-autofill.service.ts`)
- `dto/<verb>-<noun>.dto.ts` — one class-validator DTO per operation
- tests colocated (see Tests below)

**`src/schedules/` is the richest exemplar — copy its shape for a new feature module.**

Current modules: `auth`, `availability`, `event-reports`, `facilities`, `geography`, `health`,
`inem`, `inventory`, `live-runs`, `notices`, `notifications`, `organisations`, `paid-staff-schedule`,
`patients`, `schedules`, `staff-absences`, `statistics`, `storage`, `transport-requests`, `users`,
`vehicles`, `vehicle-occupancy`, `volunteer-hours`, `employment-contracts`, `prisma`.
New modules are wired into `src/app.module.ts`.
Bootstrap (global `ValidationPipe`, global `ApiErrorFilter`, port 3000) is in `src/main.ts`.

`notifications` is the generic delivery framework (channels, pg-boss queue, org/user
preferences) — `notices` (#165) is its first consumer, not part of it. A future
system-triggered notification type is a new producer against the same framework, not a
redesign; see the banner comment in `notification-delivery.service.ts`.

`inem` (#211/#214) integrates with INEM's own portal (`portalpem.inem.pt`) so a crew can set an
ambulance's operational status from redinfo. Unit state is desired vs. reported, never a
fire-and-forget command — `InemService`'s public API only ever writes `desiredInopCode`;
`InemReconcilerService` (pg-boss, `InemQueueService`) does the actual pushing and polling on a
schedule. `InemSessionService` owns the scraped SSO session (`alAuth`/`samlsessionid`,
`IdentityCipher`-sealed) and its circuit breaker; `packages/inem-worker` (#215) is the only thing
that ever does a cold Playwright login, reachable solely via the polled, shared-secret-guarded
`/internal/inem/login-jobs` endpoints (`InemWorkerGuard`, off Swagger). See
`docs/inem-portal-contract.md` for the wire contract this module codes against.

`organisations` (#227) holds two resources, not one: `OrganisationsService`/`Controller` (the
requester/payer role-flagged party) and `AgreementsService`/`Controller` (the terms a transport
falls under, scoped to its paying organisation) — both gated by `MANAGE_TRANSPORT_CONFIG`, no
tariff or rate fields on either.

`transport-requests` (#228) is referral intake, entered by hand — field order mirrors the
referral's own layout, not an idealised one. `externalServiceNumber` is unique per
`requestingOrganisationId`, never globally. `destinationFacilityId` has a create-if-missing
alternative (`destinationFacility`, resolved via `FacilitiesService.findOrCreateTransportDestination`)
since a referral's destination is routinely not yet in the transport destination list, and a
`TRANSPORT_COORDINATOR` does not hold `MANAGE_HOSPITALS`. A decision (`decide`) is terminal —
`update` refuses a request already accepted/rejected — and accepting one never sets
`externallyRegisteredAt`, which only the requester's own platform can. Gated by
`MANAGE_TRANSPORT_REQUESTS`.

The decision page (#229) adds three things to the same module: `findManaged`'s
`awaitingExternalRegistration` flag (overrides `decision` — accepted, `externallyRegisteredAt`
still null, ordered oldest-accepted-first, feeding the queue's persistent second section);
`getFeasibility` (`GET :id/feasibility`, the roster/absences/vehicle-occupancy snapshot for the
referral's appointment date — roster is a plain `ScheduleAssignment` query, not
`SchedulesService`, to avoid pulling in its whole window/shift dependency graph for a "who's on
this day" list; absences and vehicle occupancy go through `StaffAbsencesService`/
`VehicleOccupancyService` rather than their tables); and `registerExternally` (`POST
:id/register-external`, stamps `externallyRegisteredAt` — a separate action from `decide`, since
accepting in redinfo and registering on the requester's own platform are different facts made
at different times).

## Controller pattern

- Class-level `@UseGuards(JwtAuthGuard, RolesGuard)` + `@UseInterceptors(AuditInterceptor)`.
- Per-route `@Actions(...Action[])` (from `src/auth/decorators/roles.decorator.ts`) is the
  **primary** authorization check; `@Roles(...UserRole[])` is secondary/coarser.
- `@CurrentUser()` injects the `RequestUser` for the viewer.
- A handler with neither decorator is reachable by any authenticated user — that's sometimes
  intentional (e.g. read-your-own-data endpoints), so don't add gating reflexively; match the
  pattern of neighboring routes in the same controller.

Guards: `JwtAuthGuard`, `RolesGuard`, `LocalAuthGuard` in `src/auth/guards/`. Strategies
(`jwt`, `local`, `google`, `microsoft`) in `src/auth/strategies/`. The permission matrix is
tested in `src/auth/permissions.spec.ts` — update it when adding a new `Action`.

## Errors

`src/common/api-error.exception.ts` + `api-error.filter.ts` turn a thrown `ApiErrorException`
into `{message, code, params}`, with `code` drawn from `ApiErrorCode` in shared. Only an
audited subset of failure cases gets a code — plain `NotFoundException`/`BadRequestException`
are fine for everything else. Don't code every exception, and don't leave a case uncoded just
because it's convenient; match how the module you're editing already does it.

## Prisma

Schema at `prisma/schema.prisma` — **1794 lines, 50 models**. Never `Read` it in full.

```bash
grep -n "^model User" packages/backend/prisma/schema.prisma   # find a model
# then Read with offset/limit around the hit
grep -n "^model \|^enum " packages/backend/prisma/schema.prisma  # regenerate the index below
```

Model index by domain (names only — grep for fields/relations):
- **Identity**: `User`, `UserCertification`, `UserProfileAudit`, `RefreshToken`
- **Fleet**: `Vehicle`, `MaintenanceEntry`
- **Vehicle occupancy** (#222): `VehicleOccupancy` — forward commitment of a named vehicle
  across the whole platform (schedule shifts, transport trips, maintenance, support events),
  deliberately outside the transport-specific modules since the fleet is one pool. Written
  through from its source row; `MaintenanceEntry` write-through lives in `vehicles.service.ts`
- **Inventory**: `MaterialItem`, `MaterialItemBarcode`, `InventoryTemplate`, `InventoryTemplateItem`, `VehicleInventoryItem`, `VehicleInventoryAudit`, `StockMovement`
- **Availability**: `Holiday`, `AvailabilityWindow`, `AvailabilityWindowShift`, `AvailabilityWindowRole`, `AvailabilitySubmission`, `AvailabilityResponse`
- **Schedules**: `Schedule`, `ScheduleAssignment`, `ScheduleShiftOverride`
- **Employment & compensation**: `EmploymentContract` (dated fact — who is on contract *and
  when*), `PaidStaffSchedule` (recurring on-the-clock pattern, hangs off a contract),
  `PaidStaffScheduleOverride` (per-date exception). Supersedes #223/#245: `User.isPaidStaff`
  is **gone** — a timeless flag could not answer a dated question. Compensation is a per-person
  property of the *work*: `ScheduleAssignment.compensation` (`VOLUNTEER | SALARY | PAID`) is
  non-null and **materialised at write**, never derived at read, so a later contract edit never
  retro-reclassifies a past shift. Default is always `VOLUNTEER`; on-contract-clock is an
  absolute veto resolving `SALARY`. The money *offer* (`CompensationOfferKind`, cents) lives on
  `AvailabilityWindow` — so members see it before submitting availability — and `Schedule` may
  replace it **as a whole unit** (incl. `NONE` to cancel); never merge the two field-wise.
  Reclassifying after generation soft-deletes/un-deletes the *same* `VolunteerHoursEntry` via
  `deletedBySystem`; see `reconcileEntryForCompensation` in `volunteer-hours.service.ts`
- **Staff absences** (#224): `StaffAbsence` — vacation, sick leave and other paid leave as a
  durable HR fact, independent of `PaidStaffScheduleOverride`'s ad-hoc schedule shuffles. A
  warning to the roster (`SchedulesService`'s board, `ScheduleAbsenceWarning`) and the future
  trip planner, never a block — same override precedent as `VehicleOccupancy`
- **Volunteer hours**: `VolunteerHoursEntry`
- **Geography**: `Municipality`, `Locality`
- **Facilities** (#220): `Facility` — hospitals, clinics and private medical facilities, one
  table with independent `isEmergencyDestination`/`isTransportDestination` flags
- **Event reports**: `EventReport`, `EventReportAssessment`, `EventReportCrewMember`, `EventReportVehicle`, `EventReportMaterial`, `EventReportVictim`, `EventReportInemSupportUnit`, `EventReportAttachment`
- **Live**: `LiveRun`, `LiveRunCrewMember`
- **Patients** (#219, #226): `Patient` — non-urgent transport patient, a durable months-long
  relationship unlike `EventReportVictim`. Identity (full name, telephone, home address,
  reference contact) sealed the same way as `LiveRun`'s victim fields, one `IdentityCipher`
  blob (scope `'patient'`); mobility/coordinates/`localityId` stay unsealed since planning needs
  them without opening it. `PatientIdentityPurgeService` sweeps on `updatedAt` against
  `PATIENT_IDENTITY_RETENTION_DAYS` (env var, conservative default pending a data-protection
  spike) — no inline purge-on-read like `LiveRun`'s, since a patient is read constantly for as
  long as they remain one
- **Config**: `DelegationSettings`
- **Notices & notifications** (#165): `Notice`, `NoticeTargetRole`, `NoticeChannel`,
  `NoticeReceipt`, `NotificationDelivery`, `PushSubscription`, `NotificationTypeSetting`,
  `UserNotificationPreference`
- **INEM integration** (#211): `INEMSession`, `OWASession`, `INEMUnit`, `INEMStatusAudit`,
  `INEMUnitStatusPeriod`
- **Organisations & agreements** (#227): `Organisation` — requester and payer as role flags on
  one model, since the same body routinely requests one transport and pays for another (#219);
  `OrganisationReference` — an organisation's own reference codes, a collection since the worked
  example carries two at once; `Agreement` — the terms a transport falls under, scoped to its
  `payerOrganisation`. No tariff or rate fields anywhere here — billing is modelled, never
  performed
- **Transport requests** (#228): `TransportRequest` — a referral entered by hand, field order
  mirroring the source document; envelope fields (`batchReference`, `communicatedAt`,
  `requesterAccountCode`, `responseDueAt`) are denormalised onto every row one email covered
  rather than split into a batch table. `decision` (`PENDING`/`ACCEPTED`/`REJECTED`) is terminal;
  `externallyRegisteredAt` is a shadow of a decision made on the requester's own platform and is
  never set by accepting in redinfo
- **Treatment plans & transport legs** (#230): `TreatmentPlan` — an optional recurrence rule
  (days of week, time-of-day, validity range) hanging off a `TransportRequest`; `TransportLeg` —
  the durable, billable, dated occurrence, `treatmentPlanId` null for a one-off referral's leg.
  A leg carries its own origin/destination rather than deriving them, so a return trip can target
  somewhere other than the patient's pickup address without touching the plan. `generatedForDate`
  is frozen at creation and never touched by an edit — it's the generator's idempotency key,
  immune to a later reschedule of `date` (`TransportRequestLegsService.generateForPlan`)

Migrations: `prisma:migrate` (dev, interactive) / `prisma:migrate:deploy` (non-interactive —
prefer this in scripts/CI, per `.github/AI-GOVERNANCE.md`). Run `prisma:generate` after every
schema change. Migrations land at `prisma/migrations/<timestamp>_<name>/`.

Seeds: `prisma/seed.ts`, `prisma/seed-geography.ts`. `prisma/data/pt-localities.json` is
generated by `scripts/fetch-pt-localities.mjs` and committed — don't hand-edit it.

## Tests

Colocated under `src/`, no separate `test/` dir. Jest config is inline in `package.json`
(`rootDir: src`, `testRegex: .*\.spec\.ts$`, `maxWorkers: 1`).

- Unit: `src/<feature>/<name>.spec.ts`
- Integration: `src/<feature>/<feature>.integration.spec.ts`

Two traps:
1. Every integration spec starts with
   `const describeIntegration = process.env.DATABASE_URL ? describe : describe.skip;` —
   without `DATABASE_URL` in the process env, the suite **silently skips**, which reads like a
   pass. If integration output shows everything skipped, that's the cause; don't debug further.
2. The describe title must contain the word "integration" — `test:integration` runs
   `jest --runInBand -t integration`, so a mistitled describe block is never selected.

## Common utilities

`src/common/` (API error handling, `identity-cipher.ts` — column encryption shared by `live-runs`
and `inem`), `src/utils/date.util.ts`, `src/storage/attachment-storage.ts` (file/attachment
persistence, `ATTACHMENTS_DIR`).
