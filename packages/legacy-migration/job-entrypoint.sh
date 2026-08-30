#!/usr/bin/env bash
# Entrypoint for the `job` build target only (see Dockerfile). Stands up a
# throwaway local MariaDB, loads it with a fresh `mysqldump` straight from
# legacy production, points the loader at that local copy, then runs
# whatever command was passed (job-legacy-migration.yaml's default: `pnpm
# migrate:legacy --apply`).
#
# Never connects the loader itself to legacy production — same reasoning as
# the local rehearsal path (docker-compose.migration.yml's mysql-legacy):
# `LegacySource`'s queries run against this disposable local copy, so however
# many of them a loader run issues, legacy production only ever sees the one
# `mysqldump --single-transaction` read. The container is destroyed at the
# end of every run (a Job pod, never restarted in place), so there is no
# volume to remember to wipe — the throwaway copy dies with it.
set -euo pipefail

: "${LEGACY_PROD_MYSQL_HOST:?LEGACY_PROD_MYSQL_HOST is required (fresh copy source, not the throwaway local instance).}"
: "${LEGACY_PROD_MYSQL_USER:?LEGACY_PROD_MYSQL_USER is required.}"
: "${LEGACY_PROD_MYSQL_PASSWORD:?LEGACY_PROD_MYSQL_PASSWORD is required.}"
: "${LEGACY_PROD_MYSQL_DATABASE:?LEGACY_PROD_MYSQL_DATABASE is required.}"
LEGACY_PROD_MYSQL_PORT="${LEGACY_PROD_MYSQL_PORT:-3306}"

DATADIR="$(mktemp -d)"
echo "Initialising throwaway MariaDB at ${DATADIR}..."
# --user=root: this container never runs as anyone else (no USER in the
# Dockerfile), and mariadbd refuses to start as root without an explicit
# opt-in. Fine here — "throwaway, single-purpose, dead at the end of this
# run" is exactly the case that opt-in exists for.
mariadb-install-db --datadir="${DATADIR}" --auth-root-authentication-method=normal --user=root >/dev/null

# The package's default socket dir (/run/mysqld) doesn't exist on this base
# image (no init system ever created it) — mariadbd fails to bind at all
# without it, socket-only clients or not.
mkdir -p /run/mysqld

mariadbd --datadir="${DATADIR}" --socket=/run/mysqld/mysqld.sock --skip-networking=0 --bind-address=127.0.0.1 --port=3306 --user=root &
MARIADB_PID=$!
trap 'kill "${MARIADB_PID}" 2>/dev/null || true' EXIT

echo "Waiting for the throwaway MariaDB to accept connections..."
for _ in $(seq 1 30); do
  if mariadb-admin ping -h127.0.0.1 -uroot --silent >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
mariadb-admin ping -h127.0.0.1 -uroot --silent

# A throwaway, unguessable-doesn't-matter password: mariadb-install-db leaves
# root passwordless, and readLegacyConnectionConfigFromEnv (deliberately)
# treats an empty LEGACY_MYSQL_PASSWORD as a missing one, not "no password" —
# it has no way to tell those two apart from an env var, and "missing" is the
# far more common mistake to catch.
THROWAWAY_PASSWORD="$(head -c18 /dev/urandom | base64)"
mariadb-admin -h127.0.0.1 -uroot password "${THROWAWAY_PASSWORD}"

mariadb -h127.0.0.1 -uroot -p"${THROWAWAY_PASSWORD}" -e "CREATE DATABASE \`${LEGACY_PROD_MYSQL_DATABASE}\`;"

echo "Fetching a fresh copy from legacy production (${LEGACY_PROD_MYSQL_HOST})..."
mariadb-dump --single-transaction --routines --no-tablespaces \
  -h "${LEGACY_PROD_MYSQL_HOST}" -P "${LEGACY_PROD_MYSQL_PORT}" \
  -u "${LEGACY_PROD_MYSQL_USER}" -p"${LEGACY_PROD_MYSQL_PASSWORD}" \
  "${LEGACY_PROD_MYSQL_DATABASE}" \
  | mariadb -h127.0.0.1 -uroot -p"${THROWAWAY_PASSWORD}" "${LEGACY_PROD_MYSQL_DATABASE}"

# Point the loader at the local throwaway copy — never at legacy production
# directly, and never at whatever LEGACY_MYSQL_* the environment happened to
# set (there shouldn't be any in this stage, but a stray value must not win).
export LEGACY_MYSQL_HOST=127.0.0.1
export LEGACY_MYSQL_PORT=3306
export LEGACY_MYSQL_USER=root
export LEGACY_MYSQL_PASSWORD="${THROWAWAY_PASSWORD}"
export LEGACY_MYSQL_DATABASE="${LEGACY_PROD_MYSQL_DATABASE}"

echo "Running: $*"
set +e
"$@"
STATUS=$?
set -e

# report.md never reaches anywhere more persistent than this Job pod's own
# logs (see migration/README.md's note on this) — printed regardless of
# outcome, since a failed run's partial counts are exactly what explains why.
REPORT=/app/migration/out/report.md
if [ -f "${REPORT}" ]; then
  echo "───────────────────────── migration/out/report.md ─────────────────────────"
  cat "${REPORT}"
  echo "─────────────────────────────────────────────────────────────────────────"
fi

exit "${STATUS}"
