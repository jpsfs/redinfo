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

echo "==> Configuring Helm repositories..."
if command -v helm >/dev/null 2>&1; then
  # Needed for `deploy/redinfo` chart dependency builds.
  helm repo add bitnami https://charts.bitnami.com/bitnami >/dev/null 2>&1 || true
  helm repo update >/dev/null
else
  echo "    helm not found; skipping repo setup"
fi

echo "==> Setting up git configuration for agent-based workflows..."
# Configure git to support automated commits and PRs
git config --global --add safe.directory /workspaces/redinfo
git config --local user.email "automation@redinfo.local" || true
git config --local user.name "Redinfo Automation" || true

echo "==> Initializing Claude code CLI..."
if command -v claude >/dev/null 2>&1; then
  echo "    Claude code CLI available: $(claude --version 2>/dev/null || echo 'initialized')"
else
  echo "    Warning: Claude code CLI not found in PATH"
fi

echo "==> Verifying automation tools..."
for tool in gh az jq yq make; do
  if command -v "$tool" >/dev/null 2>&1; then
    echo "    ✓ $tool available"
  else
    echo "    ✗ $tool not available (non-critical)"
  fi
done

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
echo "==> Running agent authentication setup..."
bash .devcontainer/setup-agent-auth.sh

echo ""
echo "✓ Devcontainer setup complete!"
echo "  - Agent-based development tools configured"
echo "  - Claude code CLI available via 'claude' command"
echo "  - GitHub CLI, Azure CLI, and automation tools installed"
echo "  - Git configured for automated workflows"
echo "  - Authentication setup ready (check above for status)"

echo ""
echo "Dev container ready."
echo ""
echo "  pnpm dev          — start backend + frontend in parallel"
echo "  pnpm db:studio    — Prisma Studio (port 5555)"
echo "  pnpm db:migrate   — interactive schema migration (dev)"
echo "  pnpm test         — run all tests"
