# Plan — redesign `/#/volunteer-hours/review`

Self-contained implementation plan. Everything you need to start is in this file; the
"Ground truth" section below records what was already verified in the codebase so you do
not need to re-explore. Follow `CLAUDE.md` (read budget, verification, definition of done).

**Goal.** Turn the coordinator's hours-review screen into something fast to work through:
server-paginated, filterable by exception type, multi-select approve, a one-shot sweep for
routine entries, a history tab, and real recovery (undo an approval, soft-delete an entry).
Works on desktop and on a phone.

---

## 1. Ground truth (verified — do not re-derive)

### Files that matter

| Path | Note |
|---|---|
| `packages/frontend/src/pages/VolunteerHoursReviewPage.tsx` | 258 lines. The screen being replaced. |
| `packages/frontend/src/pages/VolunteerHoursReviewPage.test.tsx` | Existing tests; will need rewriting. |
| `packages/backend/src/volunteer-hours/volunteer-hours.service.ts` | ~530 lines. `getPendingQueue` at :165, `approve` at :176, `refreshGeneration` at :213, `ensureGenerated` at :226, `autoApproveEligible` at :463, `serializeEntry` near :520. |
| `packages/backend/src/volunteer-hours/volunteer-hours.controller.ts` | Routes listed below. |
| `packages/backend/src/volunteer-hours/volunteer-hours-summary.service.ts` | `getSummary`, `getCsv`. |
| `packages/backend/src/volunteer-hours/dto/approve-hours.dto.ts` | `MAX_CORRECTION_REASON_LENGTH = 500`. |
| `packages/backend/prisma/schema.prisma` | `model VolunteerHoursEntry` at :624–695. User back-relations at :119–121. |
| `packages/shared/src/index.ts` | `// ─── Volunteer hours ───` section, ~:1920–2310. |

### Existing API surface

```
GET    /volunteer-hours/me                  ungated (self)
POST   /volunteer-hours                     ungated (self) — log MANUAL
PATCH  /volunteer-hours/:id                 ungated (self) — updateMine, PENDING only
GET    /volunteer-hours/pending             VIEW_VOLUNTEER_HOURS    ← being replaced
POST   /volunteer-hours/:id/approve         MANAGE_VOLUNTEER_HOURS
GET    /volunteer-hours/summary             VIEW_VOLUNTEER_HOURS
GET    /volunteer-hours/summary/csv         VIEW_VOLUNTEER_HOURS
```

Controller has class-level `@UseGuards(JwtAuthGuard, RolesGuard)` +
`@UseInterceptors(AuditInterceptor)`. Self-service routes are deliberately ungated — the
service enforces ownership. Follow that split for the new routes.

`Action.VIEW_VOLUNTEER_HOURS` and `Action.MANAGE_VOLUNTEER_HOURS` already exist. **No new
`Action` is needed**, so `src/auth/permissions.spec.ts` does not change.

### Three domain traps — the plan is shaped around these

1. **Deleting a SCHEDULED entry resurrects it.** `ensureGenerated`
   (`volunteer-hours.service.ts:227`) queries `scheduleAssignment` where
   `volunteerHoursEntry: null`. A hard `DELETE` makes the assignment eligible again and the
   entry reappears on the next read of *any* hours endpoint. → **Delete must be a soft
   delete.** The retained row is what stops regeneration, for free.

2. **Un-approving a clean old entry re-approves it instantly.** `autoApproveEligible`
   (`:463`) runs inside `refreshGeneration`, which runs on *every* read path. A SCHEDULED,
   unflagged entry older than `VOLUNTEER_HOURS_AUTO_APPROVE_GRACE_DAYS` (30) that is set back
   to `PENDING` is swept straight back to `APPROVED` on the next request. → **Reopening needs
   a persistent `reopenedAt` marker that `isEligibleForAutoApproval` honours.**

3. **Soft delete must be filtered on every read path or totals silently include deleted
   rows.** Exhaustive list in §4.4.

### Current consumers of what's being replaced

- `GET /volunteer-hours/pending`: only `VolunteerHoursReviewPage.tsx` and its test.
- `VolunteerHoursService.getPendingQueue()`: only
  `volunteer-hours.integration.spec.ts` at lines 234, 246, 282.

Safe to replace outright; update those three spec call sites.

### Conventions to copy

- **Pagination** (`vehicles.service.ts:20–37`): `page`/`perPage` query params via
  `@Query('page', new DefaultValuePipe(1), ParseIntPipe)`, service does
  `skip = (page - 1) * perPage`, returns `{ data, total, page, perPage }` from a
  `prisma.$transaction([findMany, count])`.
- **Frontend data**: this is not a react-admin `<Resource>`. Use `apiFetch<T>` /
  `apiDownload` from `src/api.ts`, as the current page does.
- **i18n**: extend the existing `volunteerHoursReview.` namespace *inside its block* in
  `src/i18n/labels.ts` (2148 lines — grep, never read whole). Both `pt` and `en`;
  `labels.test.ts` enforces parity.
- **Design tokens**: `src/layout/design-tokens.ts` — `touchTargetSize` (44),
  `colorCategoryEmergency` / `colorCategoryLocalSupport` / `colorCategorySalopSupport`,
  `colorWarning`, `colorInfo`, `borderRadiusMedium`.

---

## 2. Decisions already made (do not relitigate)

| Question | Decision |
|---|---|
| Queue structure | Flat, chronological, oldest first. Not grouped. |
| Filtering | Filter chips per exception type + person search, **server-side** (required by pagination). |
| Quick global action | "Approve all without exceptions" = `SCHEDULED` **and** no flags **and** `PENDING` **and** not reopened. Manual entries are never swept — there is no shift to validate them against. |
| Bulk approve API | New `POST /approve-batch`. Not a client-side loop. |
| Flagged entries in bulk | Selectable, but flags stay loudly visible and the confirm dialog names them. |
| Page scope | Tabs: Pending / Approved. Plus a stats header and CSV export in the toolbar. |
| Pagination | Server-side. Default `perPage` 25. |
| Delete | Soft delete, allowed for **both** MANUAL and SCHEDULED. Coordinator "dismiss" (with reason) + volunteer self-delete of their own pending manual entry. |
| Undo | `POST /:id/reopen` — APPROVED → PENDING. Powers both the Approved tab and the undo affordance in the approve snackbar. |

---

## 3. Phase 0 — `packages/shared`

All edits go **inside** the `// ─── Volunteer hours ───` banner section. Grep for
`export interface VolunteerHoursEntry` to locate it.

### 3.1 Extend `VolunteerHoursEntry`

Add, after the existing `correctionReason` / `loggedBy` fields:

```ts
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
```

### 3.2 Change `isEligibleForAutoApproval` (behaviour change)

```ts
export function isEligibleForAutoApproval(
  entry: Pick<VolunteerHoursEntry, 'source' | 'status' | 'flags' | 'date' | 'reopenedAt' | 'deletedAt'>,
  today: string,
): boolean {
  if (entry.deletedAt) return false;
  if (entry.reopenedAt) return false;
  // …existing checks unchanged…
}
```

Update its doc comment to say why. Callers to update: `volunteer-hours.service.ts:475`
(pass `reopenedAt` / `deletedAt` through — add them to the `select` at :471) and any case in
`volunteer-hours-rules.spec.ts`.

### 3.3 New request/response contracts

```ts
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
```

### 3.4 New predicates

Both must be used by the frontend *and* the backend so the button's count and the server's
sweep can never disagree.

```ts
/**
 * Whether the "approve all without exceptions" sweep may take this entry
 * without anyone reading it: auto-generated from a shift, unflagged, still
 * pending, never reopened, not deleted. A MANUAL entry never qualifies — there
 * is no shift to validate it against, which is the whole reason it is queued.
 */
export function isSweepApprovable(
  entry: Pick<VolunteerHoursEntry, 'source' | 'status' | 'flags' | 'reopenedAt' | 'deletedAt'>,
): boolean;

/** An APPROVED, non-deleted entry can be sent back to PENDING. */
export function canReopenVolunteerHours(
  entry: Pick<VolunteerHoursEntry, 'status' | 'deletedAt'>,
): boolean;

/**
 * A volunteer may delete their own mistake, but only before anyone has acted on
 * it and only when they filed it by hand: MANUAL, PENDING, owned, not already
 * deleted. Anything else is a coordinator's `dismiss`.
 */
export function canDeleteOwnVolunteerHours(
  entry: Pick<VolunteerHoursEntry, 'userId' | 'source' | 'status' | 'deletedAt'>,
  viewerId: string,
): boolean;
```

### 3.5 Build

`pnpm --filter @redinfo/shared build` — the backend resolves `@redinfo/shared` from `dist/`
at runtime. Skipping this makes the running API serve stale types while tests pass.

---

## 4. Phase 1 — `packages/backend`

### 4.1 Prisma

In `model VolunteerHoursEntry` (schema.prisma:624), after `loggedBy`:

```prisma
  /// Set when a coordinator sent an APPROVED entry back to PENDING. Read by
  /// `isEligibleForAutoApproval` so the grace-period sweep never re-approves
  /// something a person deliberately reopened.
  reopenedAt   DateTime?
  reopenedById String?
  reopenedBy   User?     @relation("VolunteerHoursReopenedBy", fields: [reopenedById], references: [id])

  /// Soft delete. The row is retained rather than removed because
  /// `ensureGenerated` treats an assignment with no entry as one still to
  /// generate — hard-deleting a SCHEDULED entry would resurrect it on the very
  /// next read of any hours endpoint.
  deletedAt      DateTime?
  deletedById    String?
  deletedBy      User?     @relation("VolunteerHoursDeletedBy", fields: [deletedById], references: [id])
  deletionReason String?   @db.Text
```

Add indexes alongside the existing ones:

```prisma
  @@index([status, date])
  @@index([deletedAt])
```

Add User back-relations after schema.prisma:121:

```prisma
  volunteerHoursReopened VolunteerHoursEntry[] @relation("VolunteerHoursReopenedBy")
  volunteerHoursDeleted  VolunteerHoursEntry[] @relation("VolunteerHoursDeletedBy")
```

Then: `pnpm --filter backend prisma:migrate` (name it
`add_volunteer_hours_reopen_and_soft_delete`) and `pnpm --filter backend prisma:generate`.

### 4.2 DTOs (`src/volunteer-hours/dto/`)

- `review-query.dto.ts` — `ReviewVolunteerHoursQueryDto`: optional `status`, `flag`,
  `source`, `search` (`@MaxLength(100)`), `from`/`to` (validate with `isIsoDate` as the
  controller already does for the summary range), `page`/`perPage`
  (`@Type(() => Number) @IsInt() @Min(1)`, perPage `@Max(VOLUNTEER_HOURS_REVIEW_MAX_PER_PAGE)`),
  `sort`, `order`.
- `approve-hours-batch.dto.ts` — `ApproveVolunteerHoursBatchDto`: `@ValidateNested({ each: true })`
  `@ArrayMaxSize(MAX_APPROVE_BATCH_SIZE)` `@ArrayNotEmpty()` over an item class reusing the
  same `minutes` / `correctionReason` validators as `ApproveVolunteerHoursDto`.
- `sweep-approve.dto.ts` — optional `from` / `to`.
- `dismiss-hours.dto.ts` — `reason: string`, `@IsNotEmpty() @MaxLength(MAX_DISMISSAL_REASON_LENGTH)`.

### 4.3 Service — new and changed methods

Replace `getPendingQueue` with:

```ts
async getReviewQueue(query: ReviewVolunteerHoursQueryDto): Promise<VolunteerHoursReviewResponse>
```

- Calls `refreshGeneration()` first (as `getPendingQueue` did).
- Builds `where` from status (default `PENDING`), `deletedAt: null`, date range, and search
  (`OR` across `user.firstName` / `user.lastName` / `description`, `mode: 'insensitive'`).
- Flag filter: `'NONE'` → `flags: { isEmpty: true }`; a specific flag → `flags: { has: flag }`.
- Source filter → `source`.
- `$transaction([findMany(skip/take/orderBy/include: ENTRY_INCLUDE), count])`, plus the
  counts (below).
- Sort: `date` → `orderBy: { date: order }`; `person` → `[{ user: { firstName: order } }, { user: { lastName: order } }]`; `minutes` → `{ proposedMinutes: order }`. Default `date asc`.

Counts: compute with the **scope** `where` (status + range + search, *without* flag/source)
using `groupBy`/`count`/`aggregate` in the same transaction. `sweepable` counts
`source: SCHEDULED, status: PENDING, flags: { isEmpty: true }, reopenedAt: null, deletedAt: null`
within the same range. `oldestDate` via `aggregate({ _min: { date: true } })`.

New methods:

```ts
async approveBatch(dto, approverId): Promise<ApproveVolunteerHoursBatchResponse>
```
Loops the items, reusing the single-entry `approve` logic (extract the shared body into a
private `approveOne(tx, id, approverId, minutes?, reason?)`). Each item runs in its own
transaction; a rejection is caught and pushed to `failed` with its message. Also rejects an
item whose entry is `deletedAt != null` or already `APPROVED`.

```ts
async sweepApprove(dto, approverId): Promise<SweepApproveVolunteerHoursResponse>
```
`refreshGeneration()`, then load candidate rows with the sweepable `where`, filter them
through `isSweepApprovable` (same reasoning as `autoApproveEligible`'s comment at :464 —
do not read the query's own filter back as fact), then `updateMany` to `APPROVED` with
`approvedById`, `approvedAt`, `autoApproved: false`. Return count and summed `proposedMinutes`.

```ts
async reopen(id, actorId): Promise<VolunteerHoursEntryShape>
```
404 if missing. `BadRequest` unless `canReopenVolunteerHours`. Sets `status: PENDING`,
`minutes: proposedMinutes`, `correctionReason: null`, `approvedById: null`,
`approvedAt: null`, `autoApproved: false`, `reopenedAt: now`, `reopenedById: actorId`.

```ts
async dismiss(id, actorId, dto): Promise<VolunteerHoursEntryShape>   // soft delete, any source/status
async restore(id): Promise<VolunteerHoursEntryShape>                 // clears the three deleted* fields
async deleteMine(id, userId): Promise<void>                          // soft delete, self-service
```
`deleteMine` mirrors `updateMine`'s guard exactly (`:118–131`): same 404 whether the entry
is missing or someone else's, then `BadRequest` unless `canDeleteOwnVolunteerHours`. Sets
`deletedAt`/`deletedById` with no reason.

Update `serializeEntry` (~:520) to emit the six new fields (dates as ISO strings, actors via
`ENTRY_INCLUDE` — extend it with `reopenedBy` and `deletedBy` selects).

### 4.4 Soft-delete filter — every read path (do not miss one)

Add `deletedAt: null` to the `where` in:

1. `getMyHours` (`:74`)
2. `getReviewQueue` (new) — and every one of its count queries
3. `autoApproveEligible` candidates (`:469`)
4. `sweepApprove` (new)
5. `VolunteerHoursSummaryService.getSummary`
6. `VolunteerHoursSummaryService.getCsv`
7. Any `sumMinutes` / totals helper reachable from the above (`:499`)

`ensureGenerated` needs **no** change — the retained row is exactly what stops regeneration.
Add a one-line comment there saying so, or the next person will "clean up" the soft delete.

### 4.5 Controller

```ts
@Get('review')            @Actions(Action.VIEW_VOLUNTEER_HOURS)     // replaces @Get('pending')
@Post('approve-batch')    @Actions(Action.MANAGE_VOLUNTEER_HOURS)
@Post('approve-sweep')    @Actions(Action.MANAGE_VOLUNTEER_HOURS)
@Post(':id/reopen')       @Actions(Action.MANAGE_VOLUNTEER_HOURS)
@Post(':id/dismiss')      @Actions(Action.MANAGE_VOLUNTEER_HOURS)
@Post(':id/restore')      @Actions(Action.MANAGE_VOLUNTEER_HOURS)
@Delete(':id')            // ungated — self-service, service enforces ownership
```

Route-order caution: `approve-batch` / `approve-sweep` are static segments and must be
declared **before** any `:id` route, or Nest matches them as an id.

Delete `@Get('pending')` and `getPendingQueue`; update
`volunteer-hours.integration.spec.ts:234,246,282` to call `getReviewQueue({})` and read
`.data`.

### 4.6 Backend tests

`volunteer-hours.service.spec.ts` / `.integration.spec.ts`:

- Pagination: `perPage` boundary, `total` correct, page 2 returns a disjoint set.
- Each filter narrows correctly; `flag: 'NONE'` excludes flagged.
- Counts ignore `flag`/`source` but honour status/range/search.
- `approveBatch`: mixed success/failure returns both arrays; an already-approved id lands in
  `failed` without aborting the rest; over-size batch is rejected by the DTO; correction
  without a reason fails that item only.
- `sweepApprove`: takes SCHEDULED+unflagged, leaves MANUAL, flagged, and reopened entries.
- **Trap 2 regression**: reopen a SCHEDULED unflagged entry dated 60 days ago, call
  `refreshGeneration()`, assert it is still `PENDING`.
- **Trap 1 regression**: dismiss a SCHEDULED entry, call `refreshGeneration()`, assert no
  duplicate entry is generated for that assignment.
- **Trap 3 regression**: a dismissed entry is absent from `getMyHours`, the review queue,
  the summary, and the CSV, and excluded from every total.
- `deleteMine`: refuses someone else's entry (404), a SCHEDULED entry (400), an APPROVED one
  (400); succeeds on own pending manual.
- Permission gating on each new coordinator route.

---

## 5. Phase 2 — `packages/frontend`

### 5.1 Layout

```
┌─ Rever horas ─────────────────────────────────────────────────────────┐
│  [ Pendentes (23) ][ Aprovadas ]              [Exportar CSV ▾]        │
├───────────────────────────────────────────────────────────────────────┤
│  23 por rever  ·  61h30 pendentes  ·  7 com exceções  ·  mais antiga  │
│                                                          há 12 dias   │
├───────────────────────────────────────────────────────────────────────┤
│  (Todas 23)(Sem exceções 16)(Excedeu 4)(Saída antecipada 3)(Manuais 9)│
│  🔎 Procurar voluntário…        [ Aprovar tudo sem exceções (12) ]    │
├───────────────────────────────────────────────────────────────────────┤
│ ☐ │ Voluntário │ Atividade    │ Data      │ Proposto  │ Exceções │    │
│ ☐ │ AS Ana S.  │ ● Emergência │ Sáb 12/08 │ 5h00      │ Excedeu  │ …  │
│   │            │   Manual     │ há 5 dias │ +30m ⌃4h30│  +30m    │    │
├───────────────────────────────────────────────────────────────────────┤
│                                        ‹ 1–25 de 23 ›   [25 ▾]        │
└───────────────────────────────────────────────────────────────────────┘
```

### 5.2 Files

Split the page — the current single file cannot absorb this.

```
src/pages/VolunteerHoursReviewPage.tsx          orchestration: tabs, query state, fetching
src/pages/volunteerHoursReview/
  ReviewStatsHeader.tsx      the four-stat strip
  ReviewFilters.tsx          flag chips (with counts) + person search + source filter
  ReviewQueueTable.tsx       desktop table rows
  ReviewQueueCards.tsx       mobile card list
  ReviewEntryFlags.tsx       flag chips + flagDetails popover (shared by both)
  BulkActionBar.tsx          sticky/fixed selection bar
  BulkApproveDialog.tsx      confirm, names flagged entries
  SweepApproveDialog.tsx     confirm, states that manual/flagged are excluded
  AdjustHoursDialog.tsx      replaces the current review dialog
  DismissEntryDialog.tsx     reason required
  ApprovedTab.tsx            history + reopen/restore
  ExportMenu.tsx             toolbar popover with from/to
  useReviewQueue.ts          fetch + query-state hook
```

### 5.3 Query state and fetching

`useReviewQueue.ts` owns `{ status, flag, source, search, from, to, page, perPage, sort,
order }`, builds the querystring, and calls
`apiFetch<VolunteerHoursReviewResponse>('/volunteer-hours/review?…')`.

- Debounce `search` by 300ms.
- Any filter change resets `page` to 1 **and clears the selection** (selection is
  page-scoped; say so in the bulk bar copy: "25 nesta página").
- Expose `refetch()` for use after every mutation.

### 5.4 Row contents

Beyond what the current table shows, each row/card must render:

- **Person**: initials avatar + name (name is the strong element).
- **Activity**: category dot from the design tokens for the three rota types, `Manual` chip
  for `source === MANUAL`, `description` as a truncated secondary line.
- **Date**: `Sáb 12/08` plus a muted "há N dias" once older than 7 days.
- **Proposed**: `formatMinutes(proposedMinutes)` large. When it differs from
  `baselineMinutes`, show a `+30m` delta chip (`colorInfo`) and the baseline muted beside it.
  *This is the single most useful missing signal today* — it is what makes a `RAN_OVER`
  judgeable at a glance.
- **Flags**: chips; `RAN_OVER` shows its `minutesOver`; tap/hover opens a popover rendering
  `flagDetails`, with `reportIds` linking to `/#/event-reports/<id>`. `flagDetails` is
  already fetched today and never rendered.
- **Actions**: primary **Aprovar** — one click, approves as proposed, **no dialog**. Plus an
  overflow with **Ajustar** (correction dialog) and **Descartar** (dismiss).

### 5.5 Selection and bulk

- Header checkbox selects the current page's rows, with an indeterminate state.
- `BulkActionBar` appears when the selection is non-empty: `8 selecionadas · 21h15` +
  `[Aprovar selecionadas]` `[Limpar]`. Sticky under the toolbar on desktop; **fixed to the
  bottom of the viewport on mobile**, where the thumb is.
- `BulkApproveDialog` lists any flagged entries in the selection by name before confirming.
- Posts one `POST /approve-batch`. On a partial failure, surface the `failed` messages in an
  alert and refetch — the successful ones simply leave the list.
- `SweepApproveDialog` (from the toolbar button, labelled with `counts.sweepable`) confirms
  count + total hours and states explicitly that manual and flagged entries are **not**
  included, so nobody assumes the queue was cleared. Posts `POST /approve-sweep` with the
  active date range. Button disabled when `sweepable === 0`.

### 5.6 Undo

Approving (single, batch, or sweep) raises a snackbar. For the **single-entry** case it
carries an **Anular** action calling `POST /:id/reopen`, then refetches. Batch and sweep get
no snackbar undo — reopening is per-entry; point those at the Approved tab instead.

### 5.7 Approved tab

Same filters, no checkboxes, `status=APPROVED`, default range the last 30 days. Columns:
`Voluntário | Atividade | Data | Creditado | Aprovado por | Quando`. Corrected entries show
their delta and `correctionReason`; `autoApproved` ones get an "Automático" chip; reopened
ones show when. Row actions: **Reabrir** and **Descartar**. Deleted entries are hidden
(the backend filters them); `restore` is wired but reachable only from the dismiss
snackbar's undo.

### 5.8 Adjust dialog

Replaces the current one. `fullScreen` below `sm`. Context header showing baseline →
proposed → your value. Minutes as hours + minutes with `−30 / −15 / +15 / +30` steppers, not
a raw integer field — coordinators think in hours. Presets: *Aprovar o proposto*, *Repor o
agendado*, *Não contar (0)*. Reason required only once the value differs (same rule as
today), with the error shown **inline at the field**, not as a banner. Reason quick-chips
("Saiu mais cedo", "Confirmado com a equipa", "Duplicado") prefill the editable field.

### 5.9 Mobile

Below `sm`, `useMediaQuery(theme.breakpoints.down('sm'))` swaps the table for cards — do not
horizontally scroll a table.

```
┌──────────────────────────────────┐
│ ☐  Ana Silva               5h00  │
│    ● Emergência · Manual  ⌃4h30  │
│    Sáb, 12 Ago · há 5 dias       │
│    [Excedeu +30m]                │
│    "Cobertura de turno em falta" │
│    ──────────────────────────────│
│    [ Ajustar ]      [ Aprovar ]  │
└──────────────────────────────────┘
```

Tapping the card body (not the buttons) toggles selection, so multi-select is a thumb-flick
down the list. All targets ≥ `touchTargetSize` (44px). Filter chips scroll horizontally;
stats collapse to one line. Pagination becomes a "Carregar mais"-style prev/next pair.
**No swipe-to-approve** — undiscoverable, and a mis-swipe is only recoverable via the
Approved tab.

### 5.10 States

Skeleton rows (3) while loading, not a bare spinner · empty pending = a positive "Nada por
rever" state · empty-after-filter offers "Limpar filtros" · error gets a retry button
(today it is text only) · per-row saving disables that row · partial batch failure names the
failures.

### 5.11 Self-service delete on `/my-hours`

Small, separate change in `src/pages/MyHoursPage.tsx`: a delete action on the caller's own
`PENDING` `MANUAL` entries, gated in the UI by `canDeleteOwnVolunteerHours`, calling
`DELETE /volunteer-hours/:id`, with a confirm step.

### 5.12 i18n

Extend `volunteerHoursReview.` in `src/i18n/labels.ts` (grep `'volunteerHoursReview\.` to
find the block; add inside it, never at EOF). New keys cover: tabs, the four stats, chip
labels with counts, search placeholder, sweep button + dialog, bulk bar + dialog, adjust
dialog (steppers, presets, reason chips), dismiss dialog, reopen/restore, snackbars, undo,
pagination, and the empty/error states. Both `pt` and `en` — `labels.test.ts` fails loudly
on a missing counterpart.

### 5.13 Frontend tests

Rewrite `VolunteerHoursReviewPage.test.tsx`, plus colocated tests for the extracted pieces:

- Filter chips issue a request with the right query params and reset `page` to 1.
- Selection is page-scoped and cleared on filter change.
- Select-all selects exactly the current page.
- "Approve all without exceptions" is disabled at `sweepable === 0`, and its dialog states
  the manual/flagged exclusion.
- Bulk confirm names flagged entries.
- Batch partial failure surfaces failed ids and keeps the page usable.
- One-click Aprovar posts no correction and shows an undo snackbar; undo calls `reopen`.
- Adjust dialog requires a reason only after the value changes.
- Dismiss requires a reason.
- Approved tab shows correction reason, auto-approved chip, and offers Reabrir.
- Mobile: `renderMobile` (`src/test/renderMobile.tsx`) shows cards, the fixed bottom bar,
  and no table.

---

## 6. Suggested order

1. Shared types + predicates + `isEligibleForAutoApproval` change → `pnpm --filter @redinfo/shared build` → shared tests.
2. Prisma schema + migration + generate.
3. Service: soft-delete filters (§4.4) and the three trap regression tests **first** — they
   are the ones that silently break.
4. Service: `getReviewQueue`, `approveBatch`, `sweepApprove`, `reopen`, `dismiss`,
   `restore`, `deleteMine`.
5. DTOs + controller + spec call-site updates.
6. Backend unit + integration green.
7. Frontend: `useReviewQueue` + page shell + table, then cards, then dialogs.
8. i18n (pt + en together).
9. Frontend tests.
10. `MyHoursPage` delete.

## 7. Verification (per `CLAUDE.md`)

```bash
pnpm --filter @redinfo/shared build
pnpm --filter backend  test 2>&1 | tail -40
pnpm --filter frontend test 2>&1 | tail -40
docker compose up -d --build
docker compose exec backend pnpm test:integration 2>&1 | tail -40
docker compose logs --since 5m backend | grep -iE "error|warn|exception|unhandled" | tail -30
```

Never run `test:integration -- -t "integration"`. If every integration suite skips,
`DATABASE_URL` was not in the process env — that is the cause, stop there. Leave the stack
running. Commit, do not push.

## 8. Non-goals

- Grouping the queue by volunteer, date, or exception type — flat and chronological is the
  decision.
- Swipe gestures.
- Hard deletes of any kind.
- A rejected status. Disputing an entry is still "approve with corrected minutes + reason";
  dismiss is for entries that should not exist at all.
- Changing the 30-day auto-approval grace period or the exception-detection rules.
- Reworking `/my-hours` beyond adding the delete action.
