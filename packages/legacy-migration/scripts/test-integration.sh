#!/usr/bin/env bash
# Runs `legacy-migration.integration.spec.ts` against its own database — never
# against whatever DATABASE_URL happens to point at. Mirrors
# packages/backend/scripts/test-integration.sh exactly, because it targets the
# same schema (this package owns no Prisma schema of its own — see
# ../../backend/prisma/schema.prisma).
#
# `TEST_DATABASE_URL` is the dedicated database (`postgres-test` in
# docker-compose.override.yml locally; the CI Postgres service in CI, via the
# fallback below). It is wiped and re-migrated on every run.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

TARGET="${TEST_DATABASE_URL:-${DATABASE_URL:-}}"
if [ -z "$TARGET" ]; then
  echo "Neither TEST_DATABASE_URL nor DATABASE_URL is set — integration tests need a database to run against." >&2
  exit 1
fi

export DATABASE_URL="$TARGET"

npx prisma migrate reset --force --skip-seed --skip-generate --schema=../backend/prisma/schema.prisma

# ...and then seed it, unlike the backend's otherwise-identical script. This
# suite's `beforeAll` needs a real `Locality` to resolve a `saidas.freguesia`
# against, and the loader's own preflight hard-requires seeded geography +
# hospitals before it will touch anything (see ../src/preflight.ts) — so
# `--skip-seed` alone leaves a database this package can never run against.
(cd ../backend && npx ts-node prisma/seed.ts)

npx jest --runInBand -t integration
