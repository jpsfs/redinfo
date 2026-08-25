# redinfo — Claude Code instructions

Monorepo: `packages/backend` (NestJS + Prisma), `packages/frontend` (React + Vite),
`packages/shared`. Package manager is `pnpm` (workspace-aware — use `pnpm --filter <pkg>
<script>` rather than `cd`-ing into a package).

See also `.github/copilot-instructions.md`, `.github/TESTING-STANDARD.md`, and
`.github/AI-GOVERNANCE.md` — the standards below are the Claude Code equivalent of those
same repo policies; don't contradict them.

## Definition of done for any feature or fix

Every time you implement a feature (or a fix of meaningful scope), all of the following
must be true before you stop and hand back to the user — don't stop mid-way through this
list because something upstream looks fine:

1. **Tests for every layer you touched, and they pass.**
   - Backend unit tests: `pnpm --filter backend test`
   - Backend integration tests: `pnpm --filter backend test:integration` (needs
     `DATABASE_URL` — the docker-compose Postgres service covers this; do **not** run it
     with `-- -t "integration"`, everything after `--` is a jest path pattern, not a flag,
     so the filter is silently ignored and suites can race on the shared DB — use the
     `test:integration` script as-is)
   - Frontend unit/component tests: `pnpm --filter frontend test`
   - `packages/shared`: add unit tests too if you changed logic there
   - Add or update tests for the layers your change actually touches — don't skip a layer
     because it's inconvenient. Run the suites and read the real output; a suite that's
     red, hanging, or was skipped to dodge a failure means you are not done.
   - Unit + integration is the bar here. `TESTING-STANDARD.md`/`AI-GOVERNANCE.md` also
     call for e2e, but `pnpm --filter frontend test:e2e` is currently just a stub
     (`echo "No e2e tests configured"`) — there's no e2e harness wired up yet, so don't
     invent one on the fly. Flag it to the user rather than silently skipping if a change
     seems e2e-critical (auth flows, payment-like flows, etc.).

2. **Run the full stack and check logs.** Bring it up (`docker compose up`, or
   `pnpm dev` if you're iterating outside Docker) and check backend + frontend logs for
   errors or new warnings caused by your change. Leave the stack running when you finish —
   the user tests manually afterward, so don't tear it down as your last act.

3. **Commit, but do not push.** Once tests pass and the stack looks clean,
   `git add` the relevant files and `git commit` with a clear message. Never run
   `git push` unless the user explicitly asks for it in that turn — commits stay local
   until they say so.

4. **Resolve the ADO work item, if there is one.** If the change is tied to a known Azure
   DevOps work item — an explicit ID, a `#<id>` reference (branch name, the user's
   request, a commit trailer like `AB#<id>`) — delegate to the `ado-workitem-resolver`
   subagent to mark it Resolved in the `redinfo` project (org `jpsfs`) after 1–3 above are
   done. If no work item ID is known, skip this step rather than guessing at one.

## Azure DevOps

Org `jpsfs`, project `redinfo`. Auth/setup: `.github/ADO_AUTH.md`,
`.vscode/mcp.json`, `pnpm ado:mcp`. For anything beyond resolving a completed work item
(creating items, re-triaging area path/iteration, pipeline triage), use the ADO MCP tools
directly rather than the resolver subagent — it's intentionally scoped to one job.
