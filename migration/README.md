# Legacy migration

Moves the Cruz Vermelha Portuguesa delegation's legacy MySQL system
(`u127939263_cvp`) into this application's Postgres schema. The loader lives
at `packages/legacy-migration/`, a standalone workspace package — **not** a
dependency of `@redinfo/backend`, and never bundled into its image. This
document is the operator runbook and the record of what is (and is not yet)
decided.

---

## ⚠ This directory holds real personal and clinical data

`migration/dump/` is where a `mysqldump` of the legacy production database
goes. It **is gitignored** (verify with `git check-ignore -v migration/dump/dump.sql`
before assuming otherwise) and **must never**:

- be committed, even accidentally, even a fragment of it;
- be pasted into a PR description, an ADO work item, a Slack message, or this
  README;
- be attached to a bug report. If a loader bug needs a repro, reduce it to
  synthetic data first (see the integration spec's fixture for the shape to
  copy).

`migration/out/` (also gitignored) holds this run's reject CSVs and report —
treat it the same way. `--verbose` never prints field *values* for sensitive
columns, and reject rows blank the value column for anything in
`SENSITIVE_AUDIT_FIELDS` or free-text clinical content — but the surrounding
row context (a legacy freguesia name, an email) is still personal data, and
`migration/out/` should be deleted once a rehearsal is reviewed, not kept
around "just in case".

The automated staging/production Job (below) never writes a dump to disk at
all — `job-entrypoint.sh` pipes `mariadb-dump` straight into its own
throwaway MariaDB's stdin, and that whole container is destroyed at the end
of every run. Its `report.md`/reject CSVs live only in that Job pod's own
transient filesystem and its logs — nobody has wired those anywhere more
persistent yet, so a coordinator who needs to see them today has to read the
Job pod's logs before Kubernetes garbage-collects it.

---

## Status

**Track A** (this PR): the loader engine, every pure transform and its unit
tests, preflight, the compose/env/dependency scaffolding, and the
integration-spec scaffolding — buildable and testable with no sign-off, and
done. **Track B**: three loaders remain blocked on open product questions —
see below.

## How this reaches staging and production

**Not a dependency of the app's own image, even though a Kubernetes Job now
does run it automatically.** `@redinfo/legacy-migration` is its own workspace
package, built from its own `Dockerfile` (`packages/legacy-migration/Dockerfile`)
— it shares no base image, no `node_modules`, and no source with
`packages/backend/`. Nothing under `packages/backend/package.json` changes
because this package exists (no `mysql2`, no migration scripts), and nothing
under `packages/legacy-migration/` is reachable from the running app. The day
the migration is over, deleting this whole package (and this file, and
`deploy/redinfo/templates/job-legacy-migration.yaml`, and the
`legacyMigration.*` values below it) leaves the app exactly as if none of it
had ever existed — that is the point.

Three ways to run it, against whichever target `DATABASE_URL` / `LEGACY_MYSQL_*`
point at:

1. **Automatically, on every staging (and — once it exists — production)
   deploy.** `deploy/redinfo/templates/job-legacy-migration.yaml`, a
   post-install/post-upgrade Helm hook gated by `legacyMigration.enabled`
   (true in `values.staging.yaml` and `values.production.yaml`; false by
   default). Built with `--target job` from this package's `Dockerfile` — a
   variant that bundles its own throwaway MariaDB — its container fetches a
   fresh `mariadb-dump` straight from legacy production
   (`LEGACY_PROD_MYSQL_*`, from the `redinfo-<env>` ADO variable group — see
   `secret-app.yaml`), loads it locally, and runs `migrate:legacy --apply`
   against that environment's own Postgres with **no human review step** —
   see `packages/legacy-migration/job-entrypoint.sh`. This is "legacy always
   wins" (`upsert-engine.ts`) on a schedule: an app-side edit to an
   already-imported row does not survive the next deploy, by design, for as
   long as this stays enabled. Runs *after* `job-seed` (hook-weight `1` vs.
   `0`) because the loader's preflight hard-requires seeded geography +
   hospitals first.
2. **Directly from an operator's machine**, wherever that machine already has
   network access to the target Postgres and to a legacy MySQL source (a
   `mysqldump` import, or — see `source/queries.ts`'s own "why not a live
   connection" doc comment for why this is the only supported shape — a
   throwaway local copy loaded from one): `pnpm --filter @redinfo/legacy-migration
   migrate:legacy` (needs Node 22 + pnpm locally; no Docker required).
3. **Via the standalone `base` image, for a one-off manual rehearsal**:
   `docker build -f packages/legacy-migration/Dockerfile -t legacy-migration .`,
   then `docker run --rm -e DATABASE_URL=... -e LEGACY_MYSQL_HOST=...
   legacy-migration`. `docker-compose.migration.yml`'s `migration` service
   wraps exactly this, pointed at the local throwaway `mysql-legacy` + dev
   Postgres by default — see the runbook below.

All three run `ts-node src/main.ts` directly — there is no separate compiled
build for this package (`build:migration`/`dist-migration` no longer exist).
This is a one-off operator script, never a long-lived process, so a prod-image
tradeoff (smaller image, no `ts-node`) was never worth a second build path.

**New ADO variable group entries needed before path 1 works**: add
`LEGACY_PROD_MYSQL_HOST`, `_PORT`, `_USER`, `_PASSWORD`, `_DATABASE` to both
`redinfo-staging` and `redinfo-production` (same place `JWT_SECRET` etc.
already live) — legacy production's own connection details, distinct from
`LEGACY_MYSQL_*` (which inside that Job is the throwaway local copy
`job-entrypoint.sh` creates for itself, never legacy production).

## The three-`-f` trap

`docker-compose.override.yml` (dev source mounts, the `postgres-test`
dependency) is loaded automatically — **only** when no `-f` flag is given at
all. Naming any `-f` disables that automatic pickup, so the migration overlay
must always be invoked with all three files:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.override.yml \
  -f docker-compose.migration.yml \
  up -d --force-recreate mysql-legacy
```

This only matters for `mysql-legacy` and `migration` (the two services
`docker-compose.migration.yml` adds) — it no longer touches the `backend`
service at all.

## Runbook (local rehearsal)

```bash
# 1. Fresh dump from legacy production. Never a live connection — see
#    "why not a live connection" in source/queries.ts's own module doc.
mysqldump --single-transaction --routines --no-tablespaces \
  -h <legacy-host> -u <legacy-user> -p u127939263_cvp \
  > migration/dump/dump.sql                # gitignored, stays local

# 2. Bring up the throwaway legacy MariaDB (re-imports from scratch every time —
#    --force-recreate on a volume-less container is the point, see the compose
#    file's own comments).
docker compose -f docker-compose.yml -f docker-compose.override.yml \
  -f docker-compose.migration.yml up -d --force-recreate mysql-legacy

# 3. Dry run (the default — --apply is required to write anything) against
#    the local dev Postgres, via the standalone container:
docker compose -f docker-compose.yml -f docker-compose.override.yml \
  -f docker-compose.migration.yml run --rm migration

#    ...or the same thing without Docker at all, from an operator's own
#    machine (needs Node 22 + pnpm, and DATABASE_URL / LEGACY_MYSQL_* set to
#    reach mysql-legacy's published port and the target Postgres):
pnpm --filter @redinfo/legacy-migration migrate:legacy

# 4. Read migration/out/report.md — especially the "overwrite summary" table
#    and every rejects-*.csv — and fill in unresolved localities:
#    migration/out/unresolved-localities.csv → migration/overrides/locality-map.csv

# 5. Repeat 3–4 until the rejects are empty or knowingly accepted.

# 6. Commit.
docker compose -f docker-compose.yml -f docker-compose.override.yml \
  -f docker-compose.migration.yml run --rm migration pnpm migrate:legacy --apply
```

For staging or production, the same image/command runs anywhere with network
access to that Postgres and to a legacy MySQL source — override
`DATABASE_URL` / `LEGACY_MYSQL_*` (e.g. `docker run --rm -e DATABASE_URL=...
-e LEGACY_MYSQL_HOST=... legacy-migration`, built from
`packages/legacy-migration/Dockerfile`) rather than reusing this compose
file's `mysql-legacy`/dev-Postgres defaults.

## `migration/out/` artifacts

| File | What it is |
|---|---|
| `report.md` | The deliverable a human reads. Overwrite summary first (created/adopted/**updated**/unchanged/rejected per entity — the `updated` total is the headline "how many existing rows would this touch" number), then per-decision detail sections, "not migrated" tables/columns, and truncated/non-conforming values. |
| `rejects-<entity>.csv` | One per entity with at least one rejected row. `legacy_key,reason_code,reason,field,value_redacted` — `value_redacted` is blank for sensitive/clinical fields. |
| `unresolved-localities.csv` | Every `saidas.freguesia` value the three-tier resolver could not place, with `nearest_candidates` to make filling in the override CSV fast. |
| `run.jsonl` | One JSON line per decision, for diffing two runs. |

## Filling in `migration/overrides/locality-map.csv`

Header: `legacy_text,localityId,note`. A row whose `localityId` does not
exist is a **preflight failure**, not a row-level warning — it is checked
before any loader runs. Use `unresolved-localities.csv`'s `nearest_candidates`
column to find the right `Locality.id` quickly (Portugal's 2013 freguesia
reorganisation is the usual cause of a miss, not a typo).

## Go-live sequence

This is the **final, one-time cutover** — not the automated recurring sync
described above under "How this reaches staging and production", which keeps
running unattended on every deploy throughout the bridge period leading up to
this. This sequence is what actually turns legacy production off; everything
before it is rehearsal, however many times it has run automatically by then.

1. Final `mysqldump` from legacy production, as close to the cutover moment
   as practical.
2. `--dry-run` (the default) against the real target, and read the report.
3. Resolve every reject that can be resolved; get sign-off on any that can't.
4. **Take a Postgres snapshot immediately before `--apply`.** This is the
   rollback plan — restore the snapshot. Do not attempt to "un-import"; the
   loader has no delete path and was never meant to have one.
5. `--apply`.
6. Spot-check a handful of imported rows against the legacy system by hand.
7. Switch DNS / cut over.

## Open questions

These block the Track B loaders below. Full detail (options considered,
recommendations, row counts behind each) lives in the implementation plan
this harness was built from (kept with the engineering team, referenced here
by number so a decision stays traceable to what it unblocks). **Do not guess
these** — every code path they touch is a typed `TodoReview` sentinel that
either lands a row in a reject CSV or throws if a Track B loader is invoked
before the question is answered.

| # | Blocks | Question |
|---|---|---|
| Q1 | `EventReportInemSupportUnit` (part of loader 12) | `apoio_inem` codes `heli`/`moto`/`pem`/`out` have no `InemSupportUnitType` bucket; `vout`/`sivou`/`umip` have a type but no base hospital named anywhere in the data. |
| Q2 | `EventReportVictim` (part of loader 12) | `transporte` code `n4` cannot become `TREATED_ON_SCENE` (invalid for EMERGENCY); `n6` names nothing safe to infer; `s5` has no hospital name in the row. |
| Q5 | `EventReportAssessment` (part of loader 12) | `avaliacoes_saida.temperatura` has no known unit (whole degrees vs. tenths) — low urgency, 0 rows behind it today. |
| Q6 | `14-profile-audits.loader.ts`, `11-schedule-overrides.loader.ts`'s original scope | Whether `usuarios_hist` belongs alongside `socorrista_hist` in the `UserProfileAudit` backfill. (`11-schedule-overrides.loader.ts` itself turned out **not** to need this sign-off — see its own doc comment: `alteracoes_escala` has no minutes-shaped fact to migrate at all, decided, not guessed.) |
| Q7 | `transform/narrative.ts`'s phone-in-narrative step | Whether `saidas.contacto` (a phone number) is dropped entirely or written into a clinical free-text field. The transform is built either way; only the decision to actually pass that note in is missing. |

**Already resolved this session** (real values in `mapping.config.ts`, not
sentinels): `ambulancias.tipo → VehicleType` (Q3: `B`→EMERGENCY,
`A1`/`VDTD`→TRANSPORT); the `escala` crew role names (Q4:
`condutor`→"Condutor", `socorrista_1`→"Chefe de Equipa",
`socorrista_3`→"Socorrista"); `LEGACY_TIMEZONE` default `Europe/Lisbon` (Q8);
the standalone-package/operator-run deployment model (Q9, revised — see "How
this reaches staging and production" above; the earlier Kubernetes-Job design
was reversed once it would have meant `mysql2` and the loader shipping in the
app's own prod image); synthesising one `AvailabilityWindow` per `(ano, mes)`,
category `EMERGENCY`, status `CLOSED` (Q10).

**Minor, non-blocking, already decided by proposal:** `socorrista.n_cvp` →
`User.redCrossNumber`, `.n_tripulante` → `.volunteerNumber` (Q11); the 1-row
`material_outro` table is out of scope, and `material_saida.material` is
catalogued regardless of its `Outro` flag (Q12).
