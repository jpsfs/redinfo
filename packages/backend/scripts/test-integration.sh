#!/usr/bin/env bash
# Runs the integration suite against its own database — never against
# whatever DATABASE_URL happens to point at.
#
# `TEST_DATABASE_URL` is the dedicated database (`postgres-test` in
# docker-compose.override.yml locally; the CI Postgres service in CI, via the
# fallback below). It is wiped and re-migrated on every run — deliberately no
# `--skip-seed` skip-if-clean check here, so a suite that left the database
# dirty from a previous crash can never be mistaken for a clean run.
#
# Falls back to DATABASE_URL when TEST_DATABASE_URL is unset, which is what
# CI's workflow relies on: it hands this script one ephemeral, already-empty
# Postgres per run, so there is only one database to name.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

TARGET="${TEST_DATABASE_URL:-${DATABASE_URL:-}}"
if [ -z "$TARGET" ]; then
  echo "Neither TEST_DATABASE_URL nor DATABASE_URL is set — integration tests need a database to run against." >&2
  exit 1
fi

export DATABASE_URL="$TARGET"

npx prisma migrate reset --force --skip-seed --skip-generate
npx jest --runInBand -t integration
