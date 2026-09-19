# Design — the transport planning board, second pass

Design document for the screens mocked up in
[`docs/mockups/planeamento-transportes.html`](../mockups/planeamento-transportes.html).
**No product code has been written** — this is the spec a later implementation follows. The
only thing already done is the fixture work it depends on (`prisma/seed-dev.ts`: five to
fifteen people a day across a 45-day horizon, at least one of them travelling to Porto).

Open the mockup in a browser. Click a journey — on the map, on the timeline, or in the
inspector — to see the focus behaviour the whole design rests on.

---

## 1. What the current board does not answer

`TransportPlanningPage` (#235) is a time-only view: one lane per vehicle, one bar per
passenger, time on the x-axis. It is good at *when*. Everything below is a question it cannot
be asked, and every one of them is asked daily once the day carries ten passengers instead of
three.

| Question | Why today's board can't answer it |
|---|---|
| Is this patient *on the way* to somewhere we're already going? | No geography at all. The planner keeps the map in their head, or in another browser tab. |
| Are two vehicles driving the same corridor within ten minutes of each other? | Same. Two bars at the same x are indistinguishable from two bars at the same *place*. |
| Which of thirteen journeys is this bar? | Colour encodes direction (outbound/return), not identity. Every outbound bar on the board is the same blue. |
| What does this journey actually look like end to end? | A lane is the only view. There is no page, no stop table, no printable sheet. |
| Which journeys does Inês crew today? | Crew is per trip and shown as a name on a lane; there is no person-centric view for the planner. |
| Is Thursday already too heavy to accept another referral? | One date at a time, though the recurring series run 30 days out. |

The fixtures made this concrete rather than theoretical: with the new seed, 16/09/2026 carries
twelve people over thirteen journeys, and three dialysis patients finish at 12:00 with no
vehicle free — a conflict that is invisible on a time-only board until someone scrolls to it.

---

## 2. Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Map placement | **Panel beside the timeline**, one shared selection, not a separate tab | The two views answer halves of the same question. A tab makes the planner re-find the journey they were looking at every time they switch. |
| Basemap | **Self-hosted PMTiles + MapLibre GL**, served by our own nginx | `routing-host-guard.ts` exists because a patient address must never leave the building. A tile request centred on a patient's house is that address leaving the building. Google/Mapbox/openstreetmap.org are all excluded by the same rule that excluded them for routing. |
| Route geometry | New `routeGeometry()` on `RoutingService`, backed by OSRM `/route` | OSRM is already up and already holds the Portugal extract. Straight lines between stops would misstate every journey that follows the Cávado valley. |
| Colour | **One hue per journey**, from a fixed 8-hue ramp; direction by *shape*, status by *outline*, mobility by *icon* | Colour is the only channel strong enough to carry identity across three panels. Direction is binary and survives being a shape; identity does not survive being anything else. |
| Brand red | **Never** a journey colour | Red means a problem — capacity exceeded, crew short, arrival window missed. A journey that happens to be drawn red would train the planner to ignore it. |
| Beyond 8 journeys | **Focus mode**, not more hues | No palette distinguishes thirty series. Selecting a journey drops the others to 18–22% opacity across map, timeline and rail; that is what makes a heavy day legible. |
| Unplanned rail | **Grouped by destination + arrival window**, people listed inside the group | See §3. |
| Suggestions | Ranked placements with costs, applied by the planner | #219 deliberately deferred automatic optimisation. Ranking candidates is not optimising: it shows the trade-off and leaves the decision where it is today. |
| Journey detail | Its own route, `/transport-planning/journeys/:tripId` | It is the thing that gets linked, printed and sent to a driver. A drawer cannot be any of those. |
| Component vocabulary | **react-admin + MUI only** | Nothing bespoke that react-admin already ships — see §7. |

### Deliberately out of scope

- **Live dispatch / vehicle tracking.** Every time is known before the day starts; this is
  batch planning, as #219 established. A live position is a different product with a different
  data source.
- **Automatic optimisation.** Ranked suggestions, yes. A "plan my day" button, no — not until
  a planner has used the suggestions for a season and we know which costs they actually trade.
- **Route editing on the map** (dragging a stop to reorder). The stop table on the journey page
  does it unambiguously; dragging pins is an easy way to move a patient's home by accident.

---

## 3. The unplanned rail — grouped, not person by person

**Decision: grouped by destination + arrival window, with the individual people listed inside
each group, and a "por pessoa" toggle for the flat view.**

The unit of a planning decision is *"this vehicle, at this facility, at this time"* — never a
lone person. Three dialysis patients finishing at 12:00 at the Barcelos clinic are one decision
with three passengers, not three decisions; splitting them into three rail cards asks the
planner to re-discover, three times a day, a grouping the data already knows. The grouped card
is also the only place a shared-ride opportunity is visible *before* the assignment, which is
the whole argument for grouping.

The people stay visible inside the card — name, locality, mobility chip — because that is what
decides whether the group fits a vehicle at all (a second wheelchair is what rules out the 03).
A group is assignable whole (one drag, one suggestion, one dialog) or opened to place one person
separately, which is the exception the toggle covers.

Grouping key: `destinationFacilityId` + direction + arrival instant, with a **±15-minute
tolerance bucket** so a 09:00 and a 09:10 appointment at the same hospital land in the same
group rather than two cards that obviously belong together. Sorted by arrival time; a group
that no vehicle can take (capacity, or nothing free in the window) is flagged red with the
reason, as in the mockup.

---

## 4. Colour specification

```
--j1 #1F6FB2   --j2 #00897B   --j3 #B26A00   --j4 #6B4FA0
--j5 #C2185B   --j6 #2E7D32   --j7 #0097A7   --j8 #8D6E63
```

- **Assignment**: stable per `(vehicle, journey ordinal)` within the date, so the same journey
  keeps its colour for as long as the planner is looking at that day, and the same vehicle's
  first journey is the same hue every morning.
- **Channels**: hue = which journey · shape = direction (outbound square-capped solid, return
  dashed/hatched) · icon = patient mobility · outline = status (planned solid, completed muted,
  problem red hairline) · opacity = focus.
- **Accessibility**: the eight hues hold their luminance separation under deuteranopia and in
  greyscale, which matters because the crew sheet prints. Wherever colour is the only
  difference (outbound vs return) there is also a shape difference. Every block carries the
  journey ordinal as text — that is what the radio uses: *"a 04, viagem 2"*.
- These go in `packages/frontend/src/layout/design-tokens.ts` next to the existing brand
  tokens, not inline in the board.

---

## 5. Map panel

- **Layers** (bottom to top): basemap · unplanned patient pins (hollow, dashed) · journey
  routes (white halo under the coloured stroke, which is what keeps two crossing routes
  readable) · numbered stop markers · facility markers · off-frame destination indicators.
- **Off-frame destinations.** Porto is an hour south of the working frame. Rather than zooming
  out until Barcelos is a smudge, a route that leaves the viewport ends in a chevron at the
  edge labelled with distance and time (`Porto — 58 km · 1h05`). The regional zoom is one
  button away.
- **Selection is shared** with the timeline and the inspector, in both directions: hovering a
  lane bar highlights its route, clicking a route opens the journey in the inspector.
- **Overlap hint.** Two journeys whose corridors coincide within a configurable window are
  marked as a possible share. This is a hint next to the two routes, never an automatic merge.

### Infrastructure

| Piece | Choice | Notes |
|---|---|---|
| Tiles | `protomaps/go-pmtiles` extract of Portugal, a single file behind our nginx | ~300–600 MB; no tile server process. Add to `data/`, alongside the OSRM extract, with a `scripts/prepare-basemap.sh` mirroring `prepare-osrm-data.sh`. |
| Renderer | `maplibre-gl` + `pmtiles` (two new frontend deps) | Both BSD/ISC. No account, no key, no outbound request. |
| Geometry | `RoutingService.routeGeometry(points)` → encoded polyline | OSRM `/route/v1/driving/...?overview=full&geometries=polyline6`. Cache per corridor next to `GeocodeCacheService`'s precedent; a journey's geometry is stable between edits. |
| Guard | `assertInternalRoutingHost` extended to the tile URL | Same failure mode, same boot-time check: a third-party tile URL must fail at startup, not silently leak. |

---

## 6. New API surface

| Endpoint | Shape | Notes |
|---|---|---|
| `GET /trips/board?date=` | existing, **extended** | Each lane gains `routeGeometry` (polyline per journey) and each leg its `door` coordinates. Keep it one call — the board's whole design is one round trip per date. |
| `POST /trips/suggest-placements` | `{ legIds[] } → RankedPlacement[]` | Each placement: vehicle, trip (existing or new), insert position, `deltaMinutes`, `deltaKm`, resulting arrival vs. window, and `blockedBy[]` when it cannot be applied. Blocked candidates are returned, not filtered — a planner needs to know the option was considered. |
| `GET /trips/week?from=` | per-date counts | People, journeys, unplanned legs, out-of-district runs, committed vehicle hours. Feeds the week strip. |
| `GET /trips/crew/:userId?date=` | a person's journeys that date | Planner-side counterpart to the existing self-scoped `GET /trips/me`. Gated by `PLAN_TRANSPORT_TRIPS`; `/trips/me` stays ungated and self-scoped. |

All shapes go in `packages/shared/src/index.ts` under the existing **Planning board** banner,
except the week strip, which gets its own. No new `Action` — `PLAN_TRANSPORT_TRIPS` already
covers the planner's side, `VIEW_PATIENT_IDENTITY` still governs patient names.

---

## 7. react-admin / MUI conformance

The board is a custom page, not a `<Resource>`, but it must read as part of the same
application:

- `<Title>`, `useNotify`, `useTranslate`/`useT`, `useGetList`/`dataProvider` where a list is a
  list; `apiFetch` only for the non-resource endpoints above, as `TransportPlanningPage`
  already does.
- Layout in MUI primitives (`Box`, `Stack`, `Paper`, `Card`), never hand-rolled CSS grid in a
  stylesheet. The `minmax(0, 1fr)` track on the timeline column stays — see the comment in
  `TransportPlanningPage.tsx` for why `minWidth: 0` alone does not hold at desktop width.
- Dialogs are MUI `Dialog` with react-admin form components inside, like `CrewDialog` and
  `AssignLegDialog` already are. The suggestions panel is a `Dialog` + `List`, not a popover.
- The journey page uses react-admin `Show`-page vocabulary — `Labeled` fields, `Datagrid`-style
  table for stops, `TopToolbar` for the actions — so it inherits the theme rather than
  approximating it.
- Every string through `labels.ts` (pt + en, parity asserted by `labels.test.ts`), inside the
  existing `transportPlanning.` namespace; a new `transportJourney.` namespace for the journey
  page.
- Nav entry in `layout/navigation.tsx` with `requires: [Action.PLAN_TRANSPORT_TRIPS]` for the
  new routes, or they ship invisible.
- Mobile: the board is a desktop planning tool, but it must not overflow horizontally at tablet
  width — check with `run-frontend`'s `overflow` command, as #235 did.

---

## 8. Suggested phasing

1. **Identity and focus** — colour ramp in tokens, hue per journey, focus mode across rail,
   timeline and inspector. No new endpoint, no new dependency. Immediately useful on its own.
2. **Grouped rail + inspector** — grouping as specified in §3, the right-hand inspector panel,
   selection wiring. Still no new endpoint.
3. **Journey page + crew sheet** — new route, stop table, print layout. `GET /trips/:id` already
   returns everything it needs.
4. **Map panel** — the infrastructure in §5 plus the two extended fields on the board response.
   The largest single step, and the one worth doing behind a feature check so a delegation
   without the extract still gets a working board.
5. **Suggestions** — `POST /trips/suggest-placements` and the dialog.
6. **Week strip and crew day** — `GET /trips/week`, `GET /trips/crew/:userId`.

Status: 1–4 landed as written. A vehicle-day drill-down (not in this list) landed alongside them
and took the "stage 5" label in code comments before Suggestions did — so `#247 stage 5` in the
backend means the vehicle-day page, not this section's Suggestions. Suggestions itself has since
landed too (`TripPlacementSuggestionsService`, no stage number in its own comments, to avoid
compounding that drift). Stage 6 (week strip + crew day) has landed on the backend
(`TripsService.getWeek`, `TripCrewManifestService.getForCrewMember`) and the frontend (the
board's week strip, `/transport-planning/crew/:userId`) — see `packages/backend/CLAUDE.md`'s
`trips` entry. Nothing from this phasing list remains.

Stages 1–3 are independently shippable and touch no infrastructure; 4 is the one that needs a
data file on disk and two new frontend dependencies.

---

## 9. Open questions for the product owner

1. Map beside the timeline (as mocked) or as an alternative tab, on smaller screens?
2. Is a **time scrubber** worth it — drag an hour and see where every vehicle is at that
   instant? It reads well in demos; unclear whether a planner uses it twice.
3. Crew sheet: one page per journey, or one page per vehicle-day?
4. Is the crew-day page for the planner only, or also the shape `/my-transport-trips` should
   grow into?
5. Overlap hint: what window counts as "the same corridor at the same time" — ±10 minutes and
   2 km, or something the delegation configures?
