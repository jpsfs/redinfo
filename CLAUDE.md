# redinfo — Claude Code instructions

Monorepo: `packages/backend` (NestJS + Prisma), `packages/frontend` (React + Vite),
`packages/shared`. Package manager is `pnpm` (workspace-aware — use `pnpm --filter <pkg>
<script>` rather than `cd`-ing into a package).

## Read budget — follow this before your first `Read`

Never `Read` these in full — each is a single file that alone costs 10k+ tokens, and there is
always a targeted way in:
- `packages/shared/src/index.ts` (4158 lines) — see `packages/shared/CLAUDE.md`
- `packages/frontend/src/i18n/labels.ts` (2148 lines) — see `packages/frontend/CLAUDE.md`
- `packages/backend/prisma/schema.prisma` (1149 lines) — see `packages/backend/CLAUDE.md`

That's not an exhaustive blocklist — several other files (`ReportSections.tsx`,
`ScheduleBoard.tsx`, `schedules.service.ts`, the availability/event-reports integration specs)
are also 900+ lines. General rule: **any file over ~400 lines → `grep -n` for the anchor you
need, then `Read` with `offset`/`limit` around it**, rather than reading the whole thing.

## Where things live

- **Backend** (`packages/backend/src/<feature>/`): `<feature>.{module,controller,service}.ts`,
  extra services as `<feature>-<concern>.service.ts`, DTOs at `dto/<verb>-<noun>.dto.ts`,
  specs colocated. Modules: `auth`, `availability`, `event-reports`, `geography`, `health`,
  `hospitals`, `inventory`, `live-runs`, `schedules`, `storage`, `users`, `vehicles`, `prisma`.
  Wiring: `src/app.module.ts`. Bootstrap: `src/main.ts`. Details: `packages/backend/CLAUDE.md`.
- **Frontend** (`packages/frontend/src/`): `resources/<name>/` = react-admin CRUD screens,
  `pages/` = standalone screens, `components/` = shared UI, `layout/` = shell/nav/theme,
  `hooks/`, `i18n/`, `utils/`. `App.tsx` is the router. `dataProvider.ts` handles react-admin
  resource CRUD; `api.ts` (`apiFetch<T>`) handles everything else. Details:
  `packages/frontend/CLAUDE.md`.
- **Shared** (`packages/shared/src/index.ts`): the domain contract — enums, interfaces,
  constants, pure rule functions, organized by banner comments. Details:
  `packages/shared/CLAUDE.md`.
- **Permissions chain**: `Action` enum + `ROLE_PERMISSIONS` (shared) → `@Actions(...)` on
  backend routes → `useCapabilities()` / `navigation.tsx` `requires` on the frontend →
  `src/auth/permissions.spec.ts` is the matrix test that ties it together.
- **Reference implementation**: `src/schedules/` (backend) + `resources/schedules/` (frontend)
  is the richest exemplar in the repo — when unsure how a new feature should be shaped, copy
  its shape instead of exploring from scratch.

## Verification — scoped while iterating, full once before handing back

```bash
# While iterating — scope to what you touched (positional arg = path pattern for both runners)
pnpm --filter backend  test schedules
pnpm --filter frontend test -- AdjustShiftDialog

# Before handing back — full suites once, trimmed to summary + failures
pnpm --filter backend  test 2>&1 | tail -40      # jest writes to stderr
pnpm --filter frontend test 2>&1 | tail -40
docker compose exec backend pnpm test:integration 2>&1 | tail -40
```

- **Never** run `test:integration -- -t "integration"` — everything after `--` reaches jest as
  a *path* pattern, not a flag, so the name filter is silently ignored and suites can race on
  the shared DB. Use the `test:integration` script as-is.
- If integration output shows every suite skipped, `DATABASE_URL` wasn't in the process env —
  that's the cause, don't investigate further. (Each integration spec is written as
  `process.env.DATABASE_URL ? describe : describe.skip`.)
- Stack: `docker compose up -d --build` — not foreground, it streams logs into the transcript
  indefinitely, and `-d` also satisfies "leave it running for the user to test manually
  afterward" below.
- Logs: prefer a targeted grep over a raw dump —
  `docker compose logs --since 5m backend | grep -iE "error|warn|exception|unhandled" | tail -30`
  (same for `frontend`). A clean grep *is* the evidence this step asks for.
- E2E: `pnpm --filter frontend test:e2e` is currently a stub (`echo "No e2e tests
  configured"`) — don't invent a harness on the fly. Flag it to the user if a change seems
  e2e-critical (auth flows, payment-like flows).

## Definition of done for any feature or fix

Every time you implement a feature (or a fix of meaningful scope), all of the following must
be true before you stop and hand back — don't stop mid-way through this list because something
upstream looks fine:

1. **Tests for every layer you touched, and they pass.** Backend unit (`pnpm --filter backend
   test`), backend integration (`pnpm --filter backend test:integration`, needs
   `DATABASE_URL`), frontend (`pnpm --filter frontend test`), and unit tests in
   `packages/shared` if you changed logic there. Don't skip a layer because it's inconvenient;
   a suite that's red, hanging, or skipped to dodge a failure means you are not done.
2. **Run the full stack and check logs** (see Verification above). Leave the stack running
   when you finish — the user tests manually afterward.
3. **Commit, but do not push.** `git add` the relevant files and `git commit` with a clear
   message. Never run `git push` unless the user explicitly asks for it in that turn.
4. **Resolve the ADO work item, if there is one.** If the change is tied to a known Azure
   DevOps work item — an explicit ID, a `#<id>` reference (branch name, the user's request, a
   commit trailer like `AB#<id>`) — delegate to the `ado-workitem-resolver` subagent to mark it
   Resolved in the `redinfo` project (org `jpsfs`) after 1–3 above are done. That subagent uses
   `az boards` directly (MCP needs an interactive browser login unavailable in this
   environment). If no work item ID is known, skip this step rather than guessing at one.

## Azure DevOps

Org `jpsfs`, project `redinfo`. The working auth path here is the `az` CLI (`az boards ...`)
— see `.github/ADO_AUTH.md`. The ADO MCP server (`.vscode/mcp.json`, `pnpm ado:mcp`) is an
optional fast path if its tools happen to be live in your session, not the primary one. For
anything beyond resolving a completed work item (creating items, re-triaging area
path/iteration, pipeline triage), use `az boards` or the MCP tools directly rather than the
resolver subagent — it's intentionally scoped to one job.

## Do not read these unless the user asks about policy

`.github/copilot-instructions.md`, `.github/AI-GOVERNANCE.md`, `.github/TESTING-STANDARD.md`,
`.github/PULL_REQUEST_TEMPLATE.md` are PR-workflow policy aimed at Copilot and human
contributors opening GitHub PRs (screenshots, merge gates, PR metadata). This agent commits
locally and never opens PRs, and the Claude-relevant subset of those rules is inlined above —
reading them is very unlikely to change what you do, so don't, unless the user is specifically
asking about repo policy or PR process.
