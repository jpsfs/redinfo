# Design — `/estatisticas`, the aggregate dashboards

Design document for the screen mocked up in
[`docs/mockups/estatisticas.html`](../mockups/estatisticas.html). **No code has been
written** — this is the spec a later implementation follows.

Open the mockup in a browser. It renders all three tabs at desktop width and again in
390 px phone frames, from mock data shaped like what the API would return.

---

## 1. Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Placement | New screen at `/#/estatisticas`, **not** merged into `Dashboard.tsx` | Home stays the operational alert board (live runs → certs → renewals → low stock). An insurance renewal in three weeks must not sit below a twelve-month hours chart. |
| Visibility | Every authenticated member sees **all three tabs**, aggregated | Extends the rule the delegation already applies to approved hours. Nothing here exposes a victim, a clinical record or a report body. |
| Tabs | Three, not two | Four metric families were in scope; folding fleet + response times into *Atividade* made one tab that scrolls forever on a phone. The permission split chosen (everything visible, aggregated) is unaffected — the third tab is a legibility split, not a security one. |
| Charts | **Recharts** | Composable, responsive containers, the usual react-admin pairing. Nothing in the mockup needs a feature it lacks. |
| Hours counted | `APPROVED` only, `deletedAt IS NULL` | Pending hours are a claim, not a fact. A public total built on unreviewed claims would be wrong the moment a coordinator corrects one down. |
| Events counted | `submittedAt IS NOT NULL` | Drafts are unfinished paperwork. A live run that auto-closed into a draft is not yet an event anyone has attested to. |

### What I deliberately left out

- **A map.** Choropleth of Barcelos freguesias needs boundary geometry the repo does not
  have (`Municipality` carries one centroid; `Locality` carries none). A ranked bar answers
  "where do we go most" today; a map is a separate piece of work with a data dependency.
- **Availability / rota-coverage stats.** Real, but they are coordinator planning tools,
  not organisation-wide facts — a different audience and a different screen.
- **Per-person clinical or victim cuts.** Never, at any permission level, on this screen.

---

## 2. Tab 1 — Pessoas & Horas

| Element | Source | Aggregation |
|---|---|---|
| Hero: total approved hours | `VolunteerHoursEntry` | `SUM(minutes) / 60` where `status = APPROVED`, `deletedAt IS NULL`, `date` in range |
| Active volunteers | same | `COUNT(DISTINCT userId)` with `minutes > 0` |
| Events with participation | `EventReportCrewMember` → `EventReport` | `COUNT(DISTINCT reportId)` where the report is submitted and `occurredOn` in range |
| Your hours / your events / your rank | same two, scoped to the viewer | tile row; rank is position in the roster ordering |
| Monthly trend | `VolunteerHoursEntry` | `SUM(minutes)` grouped by `date_trunc('month', date)` |
| Hours by activity type | `VolunteerHoursEntry.activityType` | `SUM(minutes)` grouped by the six enum values |
| Roster table | join of the two | per user: hours, event count, split emergency vs support, last activity date |

The roster is **sorted by hours but presented as a roster, not a podium** — no medals, no
top-3 treatment, the viewer's own row highlighted. Sortable by name, hours or events, so a
member who would rather not read it as a ranking can sort alphabetically. Worth confirming
with the delegation before build; it is the one element here with a social cost.

`VolunteerHoursSummaryService.getSummary()` already computes most of this per user for a
date range. It refreshes generation first (`refreshGeneration()`), which is what makes a
never-before-read period report complete numbers — the new endpoint must keep that call.

---

## 3. Tab 2 — Atividade

| Element | Source | Notes |
|---|---|---|
| Hero: events in period, YoY % | `EventReport` | `occurredOn` in range, `submittedAt IS NOT NULL` |
| Per type | `EventReport.type` | the three `EventReportType` values |
| Victims assisted | `EventReportVictim` | `COUNT(*)` over the same reports |
| Events per month | `EventReport` | stacked by type, grouped by `date_trunc('month', occurredOn)` |
| When they happen | `EventReport.activationAt`, falling back to `startedAt` | weekday × 4-hour band, **emergencies only** |
| Events per locality | `EventReport.localityId` → `Locality` | top 10 + grouped remainder; toggle to `Municipality` |
| Destination hospital | `EventReportVictim.destinationHospitalId` | only `destinationKind = HOSPITAL` rows have one |
| Victim outcome | `EventReportVictim.destinationKind` | the five enum values, as a ranked bar with counts and % |
| INEM units in support | `EventReportInemSupportUnit` | `unitType` × `hospitalId` (the **base dispatched from**, not a destination) |

**Timezone trap.** `occurredOn` is a `@db.Date` and safe to group directly. `activationAt`
and `startedAt` are `DateTime` in UTC — bucketing them into weekday and hour **must** be
done in `Europe/Lisbon`, or every summer evening call lands an hour early and the heatmap is
quietly wrong. Do it in SQL (`AT TIME ZONE 'Europe/Lisbon'`), not in the browser.

---

## 4. Tab 3 — Frota & Resposta

| Element | Source | Notes |
|---|---|---|
| Hero: kilometres | `EventReportVehicle.kilometres` | `SUM` over submitted reports in range |
| Km per event | derived | total km ÷ event count; median shown alongside the mean |
| Km per vehicle per month | `EventReportVehicle` grouped by `vehicleId` | **small multiples**, one panel per vehicle, shared 0–950 scale |
| Response medians | the five emergency chronology stamps | `activationAt → sceneArrivalAt → sceneDepartureAt → hospitalArrivalAt → availableAt` |
| p50 / p90 per stage | same | only emergencies with **both** stamps of a leg present |
| Coverage tile | same | how many emergencies were timed at all — makes the sample size visible |

Two honesty requirements, both visible on the card in the mockup:

1. **Medians of stages do not sum to the median total** (59′ vs 63′ in the mock). Say so on
   the card rather than letting a reader do arithmetic that does not hold.
2. **A crew stamps what it has time to stamp.** Each leg is computed over its own subset.
   The "emergências cronometradas" tile exists so nobody reads a median as covering
   everything.

`isOverridden` on `EventReportVehicle` means a human replaced a computed distance. The total
includes overrides; the card says so.

---

## 5. Permissions

No new `Action` is needed.

| Route | Gate |
|---|---|
| `GET /statistics/people` | none beyond `JwtAuthGuard` — self-scoped-and-public, like `GET /volunteer-hours/me` |
| `GET /statistics/activity` | same |
| `GET /statistics/fleet` | same |
| `GET /statistics/*/csv` | same |

Follow the `volunteer-hours.controller.ts` split: routes that return only aggregates carry
no `@Actions(...)`, and the *service* is what guarantees no row-level data escapes. Add the
nav entry to `layout/navigation.tsx` with **no** `requires` — forgetting the nav entry ships
an invisible feature.

Drill-through (clicking a locality to list its reports) keeps `VIEW_EVENT_REPORTS`, so an
operational sees the count without gaining the reports.

Aggregation is a real re-identification surface at this size: a delegation month with one
SALOP event and one crew makes "SALOP hours in March" a personal record. Approved hours are
already public per the delegation's own rule, so this changes nothing about tab 1 — but it is
the reason tab 2 and tab 3 publish **no per-person cut at all**.

---

## 6. Charts — palette and the one token change

The palette was validated with the `dataviz` skill's checker, not chosen by eye.

**Categorical (identity).** Fixed order, never cycled:

| Slot | Meaning | Light | Dark |
|---|---|---|---|
| 1 | Emergência | `#ED1B24` | `#F4555C` |
| 2 | Apoio local | `#00897B` | `#12A392` |
| 3 | Apoio SALOP | `#6B4FA0` | `#9B85D6` |
| 4 | Reunião | `#B26A00` | `#C77D18` |
| 5 | Formação | `#1F6FB2` | `#4F97DB` |
| — | Outras | `#9E9E9E` | de-emphasis grey, not a categorical slot |

```
node scripts/validate_palette.js "#ED1B24,#00897B,#6B4FA0,#B26A00,#1F6FB2" --mode light --surface "#FFFFFF"
  → ALL CHECKS PASS   (worst adjacent CVD ΔE 12.7 deutan; normal-vision 20.5)
node scripts/validate_palette.js "#F4555C,#12A392,#9B85D6,#C77D18,#4F97DB" --mode dark  --surface "#16161A"
  → ALL CHECKS PASS   (worst adjacent CVD ΔE 9.7; normal-vision 19.6)
```

The first three slots also pass the harder **all-pairs** test, so scatter/small-multiple
forms may carry three series. Five cannot — which is why *hours by activity type* is a
stacked bar (adjacent pairs only) and never a scatter or a set of small multiples.

### Proposed token change: `colorCategoryLocalSupport`

`#0E7C86` → `#00897B`. The current teal measures **OKLCH chroma 0.089**, under the 0.10
floor — at chart scale (a 14 px bar segment, a 10 px legend swatch) it drifts toward grey and
stops doing identity work. Every teal that holds the exact hue fails the same check; clearing
it needs a step greener. The change is barely perceptible at chip size and keeps
`CategoryChip`, schedules, availability windows and the charts reading one colour for one
category — which is the property worth protecting. **Needs delegation sign-off** (the
category colours were confirmed with them on 2026-08-23) before touching
`design-tokens.ts`.

### Sequential (magnitude)

One hue, light → dark, brand red: `#FDE7E8 · #FAC7C9 · #F59BA0 · #EF6B72 · #ED1B24 ·
#C41520 · #8C0E13`. Used by the heatmap only, where the lightest step legitimately means
"near zero". **Discrete** ordered marks (the response-time stages) start at `#F59BA0`
— 2.08:1 on white, the lightest step that still clears the surface.

Single-series ranked bars (localities, hospitals, outcomes, km) are **one colour for every
bar** — brand red, no legend, value at the tip. Colouring those bars darker-where-bigger
would spend the identity channel re-encoding what bar length already shows.

### Mark rules applied throughout

2 px lines · ≤ 24 px bars, 4 px rounded data-end square at the baseline · 2 px surface gap
between stacked segments · 2 px surface ring on end markers · hairline solid gridlines ·
selective direct labels (the endpoint, the extreme, the one value the card is about) ·
values and labels in ink tokens, never in the series colour · a legend for every multi-series
chart · a `Ver dados em tabela` twin under every chart.

---

## 7. Responsive

One filter row above everything it scopes — period preset, plus a type filter on tabs 2–3.
Never a filter inside a chart card.

| | Desktop | Phone |
|---|---|---|
| Grid | 12 columns | 2 columns; every chart card spans both, stat tiles pair up |
| Roster | table with meter column | card list, viewer's own row pinned in place and highlighted |
| Ranked bars | label left, bar right | label + value on their own line, bar full-width beneath |
| Month axis | all 12 labels | every other label |
| Tabs | inline | horizontally scrollable |

The two ranked-bar layouts are chosen **by measurement, not by breakpoint**: the chart
measures its longest label and switches the whole chart to the stacked row when it would not
fit. That is what keeps `CH Póvoa de Varzim / V. do Conde` from running under its own bar in
a half-width card. Labels that still do not fit are truncated with a measured ellipsis and
carried in full by the tooltip and the table view — never cropped with `overflow: hidden`.

Verified by executing the mockup under jsdom with the real CSS grid widths and asserting no
label overflows its canvas, collides with a bar, or escapes the fill it is drawn inside:
**26 charts, 0 issues**.

---

## 8. Open questions

1. **Roster as a ranking** — sorted by hours by default, or alphabetically, with sorting
   left to the reader? (§2)
2. **The teal token** — is `#00897B` acceptable to whoever signed off the category colours? (§6)
3. **Default period** — the mockup opens on 12 months. Calendar year may match how the
   delegation actually reports to CVP nationally.
4. **Inactive members** — a volunteer who left mid-period still has approved hours. Show them
   greyed, or drop them from the roster?
