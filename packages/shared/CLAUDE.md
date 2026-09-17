# `packages/shared` — token-efficient lookup

`src/index.ts` is a single **5707-line** file — the domain contract for the whole monorepo
(enums, interfaces, constants, pure rule functions). It has 287 top-level exports and is
imported by 81 backend files and 108 frontend files. **Never `Read` it in full** — that alone
burns ~50k tokens. Always grep first, then read a ranged window.

## Lookup protocol

The file is organized into banner-commented sections (`// ─── <Name> ───`). Sections are
stable across history; line numbers are not. Look up by banner text, not by line number:

```bash
grep -n "─── Schedules" packages/shared/src/index.ts   # find the section start
# then Read with offset = that line, limit ~120–200 (sections vary in size)
```

To find a specific symbol instead of a whole section:

```bash
grep -n "export .*<Name>" packages/shared/src/index.ts
```

Don't ask for a list of all exports — grep them.

## Section map (in file order)

| Section | Contents |
|---|---|
| User | `User`, `UserRole`, `ROLE_METADATA` |
| Actions | `Action` permission enum, `ROLE_PERMISSIONS` |
| Certifications | Certification types and metadata |
| Auth | Auth-related shapes |
| API Helpers | Generic request/response helpers |
| Vehicles | Vehicle types and shapes |
| Vehicle occupancy | `VehicleOccupancySource`, `VehicleOccupancy` — forward commitment of a named vehicle across the whole platform, whatever the source (#222) |
| Inventory | Inventory templates and items |
| Availability | Windows, shifts, submissions, responses |
| Window roles | Roles within an availability window |
| Schedules | Schedule, assignment, shift-override shapes and rules |
| Compensation offer | `CompensationOfferKind`, `resolveCompensationOffer`, `validateCompensationOffer` (#246 Stage 2) — the rate a window/schedule advertises before availability is collected, distinct from `AssignmentCompensationKind`'s per-person classification |
| Paid staff schedule | `PaidStaffScheduleBlock`/`Override`, `isOnPaidClock` (#245) — on/off-clock resolution for `AssignmentCompensationKind` |
| Staff absences | `StaffAbsence`, `StaffAbsenceKind`, `staffAbsencesOnDate`, `isValidStaffAbsenceTimeRange` (#224) — vacation/sick/other paid leave as a durable HR fact; a warning to the roster and trip planner, never a block; `OTHER_PAID_LEAVE` only can optionally be a partial day (rare) via `startTime`/`endTime` |
| Volunteer hours | `VolunteerHoursEntry`, exception detection, auto-approval rules |
| Geography | Municipality, locality location shapes |
| Facilities | `Facility` shapes — hospitals, clinics, private medical facilities; independent `isEmergencyDestination`/`isTransportDestination` flags, `validateFacility` (#220) |
| Event Reports | Top-level event report shapes |
| Event report shapes | Sub-shapes for event reports |
| The clinical record | Clinical/assessment record shapes |
| Event report input | Input/creation shapes for event reports |
| Event report rules | Business rules for event reports |
| Event report queries | Query/filter shapes for event reports |
| Numbering | Report numbering rules |
| The delegation's own configuration | `DelegationSettings`-adjacent shapes; `ArrivalWindowThresholds`, `resolveArrivalWindowThresholds`, `arrivalWindowWarning` (#233) — per-facility-overridable soft arrival-timing policy. `PatientHandlingThresholds`, `DEFAULT_PATIENT_HANDLING_THRESHOLDS`, `validatePatientHandlingThresholds` — adjustable per-pickup/per-dropoff loading time, distinct from `TripStopDwell`'s WAIT-at-facility decision. `targetArrivalAt`, `suggestLegTimes`, `SuggestedLegTimes` (#235) — the arrival a plan aims at (midpoint of the preferred window) and the pickup/home-arrival times derived from it: outbound is built backwards from H.I., return forwards from H.F., widened at the unanchored end by `PatientHandlingThresholds`, and an unroutable leg yields `null`, never a fabricated time |
| Live emergency runs | `LiveRun` shapes and state |
| Notices & notifications | `Notice`, `NotificationChannel`/`NotificationType`, delivery/preference shapes, `resolveEffectiveNotificationChannels` (#165) |
| Statistics | `/statistics/*` query and response shapes (people/activity/fleet/inem) |
| INEM integration | `INEMSessionStatus`, `INEM_AVAILABLE_INOP_CODE`, `INEM_INOP_REASONS`, `INEMInopCode`, `INEMUnit`, `SetINEMUnitStatusRequest`, `INEMStatusOverview`, worker job contract (`INEMLoginJob`/`INEMLoginJobResult`) (#211) |
| Patients | `Patient`, `PatientMobility`, `PatientIdentity` (sealed name/telephone/address/reference contact), `validatePatient`/`validatePatientIdentity`, `DEFAULT_PATIENT_IDENTITY_RETENTION_DAYS` (#219, #226) — non-urgent transport patient, sealed the same way as `LiveRun`'s victim fields |
| Organisations & agreements | `Organisation`, `OrganisationReference`, `Agreement`, `validateOrganisation`/`validateAgreement` (#227) — requester and payer as roles on one model; an agreement is the terms a transport falls under, scoped to its paying organisation; no tariff/rate fields |
| Transport requests | `TransportRequest`, `TransportRequestOccurrenceType`, `TransportRequestVehicleType`, `TransportRequestDecision`, `DestinationFacilityInput`, `validateTransportRequest`, `minutesUntilResponseDue`, `DecideTransportRequestInput` (#228) — a referral entered by hand, field order mirroring the source document; `destinationFacility` is a create-if-missing alternative to `destinationFacilityId`. `TransportRequestFeasibility`, `mapTransportRequestVehicleType` (#229) — the decision page's roster/absences/vehicle-occupancy snapshot for a referral's appointment date. `OccurrenceTypePolicy`, `DEFAULT_OCCURRENCE_TYPE_POLICIES`, `validateOccurrenceTypePolicy` (#233) — the duration floor/default per occurrence type |
| Treatment plans & transport legs | `TreatmentPlan`, `TransportLeg`, `LegDirection`, `LegStatus`, `LegCancellationSource`, `EstimatedEndSource`, `validateTreatmentPlan`, `validateUpdateTransportLeg`, `validateCancelTransportLeg`, `resolveEstimatedEnd` (#230, #233) — the recurrence rule (optional) vs. the materialised, durable, billable occurrence; a leg carries its own origin/destination rather than deriving them, and `generatedForDate` (frozen at creation) is the generator's idempotency key, immune to a later reschedule of `date`; `effectiveEstimatedEndAt`/`arrivalWindowWarning` are computed, never blank |
| Trips | `Trip`, `TripStop`, `TripCrewMember`, `TripStatus`, `TripStopKind`, `TripStopDwell`, `TripPlanIssue`, `walkTripStops`, `checkTripCapacity`, `computeEmptyLegs`, `computeTripOccupancyWindow`, `computeDwellBreakEven` (#234) — the model/API behind the planning board (#235); a trip is not a patient's round journey, a leg's `PICKUP`/`DROPOFF` pair moves between trips in one call; capacity is a hard, unoverridable constraint, crew/vehicle availability are hard but overridable (recorded reason), arrival timing is soft and never blocks. **Crew composition** (#235): `TripCrewRequirement`, `STRETCHER_TRIP_CREW_REQUIREMENT`/`STANDARD_TRIP_CREW_REQUIREMENT`, `tripCrewRequirement`, `carriesStretcherPassenger`, `checkTripCrew`, `TripCrewCandidate` — a "maca" (`PatientMobility.STRETCHER`, *not* `TransportRequestVehicleType.AMBULANCIA`) needs an emergency vehicle and 2× TAT, anything else 1× SBV; ranked on read, never thrown, because a journey is crewed one person at a time. `AddTripCrewMemberInput.applyToVehicleDay` copies a crew member across the vehicle's whole day |
| Planning board | `TransportPlanningBoard`, `TransportPlanningLane`, `TransportPlanningLeg`, `TransportPlanningCrewMember`, `TripJourneyDetail`, `decodePolyline` (#235, #247) — the `GET /trips/board?date=` response shape: every lane for the date plus the legs still waiting to be dragged onto one, keyed in one `legsById` lookup. A board leg also carries `travelMinutes`/`travelEstimated`/`travelDistanceMeters` and `suggested` (see `suggestLegTimes`), the pickup and home-arrival times the crew works out by experience today. A lane carries `crewRequirement`, a server-computed `journeyNumber` (the colour/ordinal both the board and the journey page key off), and crew members already joined to their names/certifications, so the board needs no second round trip to `users`. `TripJourneyDetail` (#247 stage 3) is the same lane shape plus its own `legsById`, served by the now-widened `GET /trips/:id` for the standalone journey page. `door` (#247 stage 4) on a leg is its two endpoints resolved the same way `travelMinutes` is; `routeGeometry` on a lane is that journey's whole road path as one polyline6 — `decodePolyline` is the pure decoder both a test and the map panel use |
| Crew manifest | `MyTransportTripsResponse`, `CrewManifestTrip`, `CrewManifestStop` (#236) — the `GET /trips/me?date=` response shape: a crew member's own trips for a date, patient name always included (self-scoped, not `VIEW_PATIENT_IDENTITY`-gated — see `PatientsService.findManyForCrewManifest`) |
| API error codes | `ApiErrorCode` |

## Edit rules

- Add new types/constants **inside the matching banner section** — never append at EOF.
- Adding a genuinely new domain concept → add a new banner (`// ─── <Name> ───`) and add a row
  to the table above in the same PR.

## The build trap

Backend resolves `@redinfo/shared` via `dist/` **at runtime** (compose bind-mounts
`packages/shared/dist`), but via jest `moduleNameMapper` to `src/` **in tests**. Frontend
aliases straight to `src/`. This means backend unit/integration tests can pass while the
running API still serves stale types from an unbuilt `dist/`. After any change here:

```bash
pnpm --filter @redinfo/shared build
```

Do this before manually exercising the backend or the full stack — not just before committing.
