---
name: redinfo-feature-slice
description: Ordered checklist for implementing a full-stack feature, endpoint, screen, or schema change in the redinfo monorepo (backend + frontend + shared). Use when implementing a feature, not when just answering a question about the codebase.
---

# redinfo feature slice

A typical feature here touches all three packages in a fixed order. Following this order
avoids rediscovering the same wiring points feature after feature, and each step names the
exact file(s) involved instead of requiring exploration. Read the relevant `packages/*/CLAUDE.md`
for lookup protocols on the big files (`shared/index.ts`, `schema.prisma`, `labels.ts`) — don't
whole-read them.

Skip steps that don't apply (a pure UI tweak skips 2–4 and 6; a pure backend endpoint skips 5).

## 1. Shared types
Add/extend types in `packages/shared/src/index.ts`, inside the matching banner section (see
`packages/shared/CLAUDE.md` for the section map). Then:
```bash
pnpm --filter @redinfo/shared build
```
Do this now, not at the end — backend tests read `shared` via `src/` (jest mapper) but the
running API reads `dist/`, so skipping this makes the app misbehave while tests stay green.

## 2. Prisma model (if the feature persists new data)
Edit `packages/backend/prisma/schema.prisma` (see `packages/backend/CLAUDE.md` for the model
index and lookup grep). Then:
```bash
pnpm --filter backend prisma:migrate     # dev migration
pnpm --filter backend prisma:generate    # regenerate the client
```

## 3. Backend
In `packages/backend/src/<feature>/` (new module) or the existing feature dir:
1. DTO(s) in `dto/<verb>-<noun>.dto.ts`
2. Service method(s) + a `.spec.ts` for the new logic
3. Controller route, gated with `@Actions(...)` matching neighboring routes
4. If it's a new module: `<feature>.module.ts` + register in `src/app.module.ts`
5. If it crosses the DB in a way unit tests can't cover: add/extend
   `<feature>.integration.spec.ts` — describe title must contain "integration"
   (see `packages/backend/CLAUDE.md` for the two test traps).

## 4. Permissions (if the feature is gated)
1. New `Action` in shared's Actions section, added to `ROLE_PERMISSIONS`
2. Update `src/auth/permissions.spec.ts` (the matrix test)

## 5. Frontend
1. New i18n keys inside the relevant namespace in `src/i18n/labels.ts` (never at EOF — see
   `packages/frontend/CLAUDE.md`)
2. Component/dialog + `.test.tsx`
3. If it's a new react-admin resource: `resources/<name>/` + `index.ts` barrel, then register
   in `App.tsx`; if it's a standalone screen, add it under `pages/` and wire a route in
   `App.tsx`'s `<CustomRoutes>`
4. Add the nav entry in `src/layout/navigation.tsx` with `requires?: Action[]` — a route that
   works but has no nav entry is an invisible feature

## 6. Doc-map upkeep
If you added a backend module, a react-admin resource, a Prisma model, or a shared banner
section, update the corresponding line in the relevant `packages/*/CLAUDE.md` in the same
change. This is what keeps those maps from rotting.

## 7. Verify, commit, resolve
Follow the Verification section in root `CLAUDE.md` (scoped tests while iterating, full suites
+ stack check once before handing back). Commit, don't push. Resolve the ADO work item via
`ado-workitem-resolver` if one is known.

## Symptom → cause

| Symptom | Cause |
|---|---|
| API returns old shape/types despite shared edit | Forgot `pnpm --filter @redinfo/shared build` |
| Backend tests pass but running app is broken | Same — tests use `src/`, runtime uses `dist/` |
| Integration suite reports 0 failures, 0 useful assertions | `DATABASE_URL` not in process env → silently `describe.skip`d |
| `test:integration` doesn't pick up your new test | Describe title doesn't contain "integration" |
| New endpoint 404s only in the browser | Vite dev proxy path in `vite.config.ts` doesn't match |
| New nav item / page unreachable | Missing entry in `layout/navigation.tsx`, or `requires` excludes the current role |
| `labels.test.ts` fails after adding a key | Key added to only one locale — namespaces must stay pt/en parity |
