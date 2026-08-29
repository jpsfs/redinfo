# Standalone migration-loader image. Deliberately not a variant of
# packages/backend/Dockerfile — it shares no base-image layer and no source
# with it on purpose (see migration/README.md). There is nothing
# migration-shaped in the backend image: delete this file and
# packages/legacy-migration/ once the migration is done, and the app is
# exactly as if this package never existed.
#
# Runs via `ts-node`, same as local/dev use (`pnpm migrate:legacy`) — there is
# no separate compiled build. This package's whole "runtime" is a one-off
# operator script, never a long-lived process, so there is no prod-image
# tradeoff (smaller image, no ts-node) worth the extra build path.
FROM node:22-bookworm-slim

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

# OpenSSL required by Prisma on Debian.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Workspace manifests. `packages/backend/package.json` is here too, even
# though none of backend's *source* is — this package directly imports two
# backend files (event-report-numbering.ts, sanitize-report.ts; see main.ts's
# REPO_ROOT comment and loader 12 / transform/narrative.ts's doc comments for
# why), and one of them needs `sanitize-html` resolvable from *its own*
# directory. Without backend's manifest present at install time, pnpm has no
# package to hang that dependency's node_modules entry off of, and Node's
# module resolution — which only ever walks up from the requiring file's own
# location, never sideways into a sibling package — fails at that import.
# `packages/frontend/package.json` is never needed here for the same reason
# packages/backend/Dockerfile never copies it: pnpm installs whichever
# workspace manifests are present and does not require the rest.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/legacy-migration/package.json ./packages/legacy-migration/
COPY packages/backend/package.json ./packages/backend/

RUN pnpm install

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/legacy-migration ./packages/legacy-migration

# This package targets the backend's Postgres schema (it owns no schema of
# its own). Nothing under packages/backend/ besides the two files below and
# the schema/migrations is ever copied into this image.
COPY packages/backend/prisma ./packages/backend/prisma
COPY packages/backend/src/event-reports ./packages/backend/src/event-reports

WORKDIR /app/packages/shared
RUN pnpm build

WORKDIR /app/packages/legacy-migration
RUN pnpm prisma:generate

CMD ["pnpm", "migrate:legacy"]
