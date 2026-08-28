# `packages/shared` — token-efficient lookup

`src/index.ts` is a single **4158-line** file — the domain contract for the whole monorepo
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
| Inventory | Inventory templates and items |
| Availability | Windows, shifts, submissions, responses |
| Window roles | Roles within an availability window |
| Schedules | Schedule, assignment, shift-override shapes and rules |
| Volunteer hours | `VolunteerHoursEntry`, exception detection, auto-approval rules |
| Geography | Municipality, locality, hospital location shapes |
| Hospitals | Hospital shapes |
| Event Reports | Top-level event report shapes |
| Event report shapes | Sub-shapes for event reports |
| The clinical record | Clinical/assessment record shapes |
| Event report input | Input/creation shapes for event reports |
| Event report rules | Business rules for event reports |
| Event report queries | Query/filter shapes for event reports |
| Numbering | Report numbering rules |
| The delegation's own configuration | `DelegationSettings`-adjacent shapes |
| Live emergency runs | `LiveRun` shapes and state |
| Statistics | `/statistics/*` query and response shapes (people/activity/fleet) |
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
