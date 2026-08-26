# `packages/frontend` — token-efficient lookup

React + Vite + react-admin (genuinely used, not just scaffolding) + MUI 5. Read
`../shared/CLAUDE.md` first if the feature touches shared types.

## i18n — read this before touching labels.ts

`src/i18n/labels.ts` is **2148 lines**, ~1560 keys namespaced by screen/dialog (`scheduleBoard.`,
`adjustShift.`, `report.`, `apiError.`, …). **Never `Read` it in full** — that alone burns
~20k tokens.

```bash
grep -n "'<namespace>\." packages/frontend/src/i18n/labels.ts   # find the namespace block
# then Read with offset/limit around the hit
grep -noE "^\s*[a-zA-Z]+:" packages/frontend/src/i18n/labels.ts | sort -u | head -80  # list namespaces
```

Add new keys **inside the existing namespace block**, never at EOF. `MessageKey = keyof typeof
MESSAGES`. `labels.test.ts` asserts pt/en parity — adding a key to only one locale fails that
test loudly, so you'll know immediately if you missed one. Use `useT()` inside components;
`i18nProvider.translate(...)` outside them (see how `dataProvider.ts` does it).

## Resource anatomy (react-admin)

`src/resources/<name>/` — one dir per CRUD resource (`availability`, `eventReports`,
`hospitals`, `inventory`, `liveRuns`, `schedules`, `users`, `vehicles`), each with an
`index.ts` barrel and `XList.tsx` / `XCreate.tsx` / `XEdit.tsx` / `XShow.tsx` (+ dialogs as
needed). `src/schedules/` on the backend pairs with `resources/schedules/` here — together
they're the richest exemplar; copy their shape.

`src/App.tsx` is **the router**: `<Admin>` + `<Resource name=... list/create/edit/show>` per
resource, plus two `<CustomRoutes>` blocks — `noLayout` for standalone screens (auth callback,
print view, live mode) and layout-wrapped for `/my-*` self-service pages and `/live-runs`.
Non-CRUD standalone screens live in `src/pages/`.

## Nav gating

Add new screens to `src/layout/navigation.tsx` with `requires?: Action[]`. `useCapabilities()`
(`src/hooks/useCapabilities.ts`) checks the same permission table the backend enforces via
`@Actions()`. **Forgetting the nav entry ships an invisible feature** — the route works but
no one can reach it.

## Data access

- `src/dataProvider.ts` — react-admin CRUD → REST for `<Resource>`s. Also translates
  `ApiErrorCode` responses before react-admin surfaces a notification.
- `src/api.ts` — `apiFetch<T>` + `ApiError` for anything that isn't a react-admin resource
  (matrices, exports, self-service actions).
- `src/authProvider.ts` — `getAccessToken()` for the bearer token.

## Tests

Vitest, colocated, suffix `.test.ts`/`.test.tsx` (config in `vite.config.ts`: jsdom,
`setupFiles: ./src/test/setup.ts`, 20s timeout). `src/test/` itself is infra only —
`fixtures.ts`, `renderMobile.tsx` — not a place to add feature tests.

## Dev proxy

`vite.config.ts`: `/api/*` → `http://backend:3000` with `/api` stripped; `/auth` → backend
as-is. Mirrors prod `nginx/nginx.conf`. If a new endpoint 404s only in the browser (not in a
direct backend test), check the proxy path before anything else.

## UI/UX

Design tokens and theme: `src/layout/design-tokens.ts`, `src/layout/theme.ts`. For branding or
visual-identity work specifically, also see `.github/UI-UX-GUIDELINES.md`.
