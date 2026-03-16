#!/usr/bin/env bash
# Post-create script for the redinfo devcontainer.
# Runs once after the container is first created.
set -euo pipefail

cd /workspaces/redinfo

echo "==> Installing pnpm@10.32.1 via corepack..."
# Use corepack (ships with Node 22) instead of `npm install -g`.
# postCreateCommand runs in a non-login shell, so nvm env vars may not be
# sourced, making global npm installs write to a root-owned prefix and fail.
# corepack shims land in /usr/local/bin (needs root), but after that pnpm
# runs as the node user without any further elevation.
sudo corepack enable
corepack prepare pnpm@10.32.1 --activate
echo "    pnpm $(pnpm --version) installed."

echo "==> Installing workspace dependencies..."
pnpm install

echo "==> Generating Prisma client..."
pnpm --filter backend exec prisma generate

echo "==> Waiting for PostgreSQL to be ready..."
MAX_TRIES=30
tries=0
until bash -c "echo >/dev/tcp/postgres/5432" 2>/dev/null; do
  tries=$((tries + 1))
  if [ "$tries" -ge "$MAX_TRIES" ]; then
    echo ""
    echo "ERROR: PostgreSQL did not become ready after $((MAX_TRIES * 2))s."
    exit 1
  fi
  printf "."
  sleep 2
done
echo " ready"

echo "==> Running database migrations..."
pnpm --filter backend prisma:migrate:deploy

echo ""
echo "Dev container ready."
echo ""
echo "  pnpm dev          — start backend + frontend in parallel"
echo "  pnpm db:studio    — Prisma Studio (port 5555)"
echo "  pnpm db:migrate   — interactive schema migration (dev)"
echo "  pnpm test         — run all tests"
