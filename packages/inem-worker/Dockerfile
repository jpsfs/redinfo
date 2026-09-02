# Standalone image, own base — deliberately not a variant of
# packages/backend/Dockerfile, same reasoning as
# packages/legacy-migration/Dockerfile: it shares no base-image layer and no
# source with the backend on purpose. This is what keeps Chromium (~400MB)
# out of the API pod, which would otherwise pull it on every deploy for no
# reason (#215's brief).
#
# Runs via `ts-node`, same as local dev (`pnpm --filter @redinfo/inem-worker
# start`) — no separate compiled build, same tradeoff `legacy-migration`
# makes and for the same reason: this is a small, infrequently-invoked
# process (a few cold logins a day at most), not something a build-step
# saves meaningful image size or startup time on.
#
# Microsoft's own Playwright image ships Node.js, the matching Chromium
# build, and every OS-level dependency Chromium needs already installed —
# pulling those in by hand on a plain node:*-slim base is exactly the kind
# of drift `playwright install --with-deps` exists to avoid.
#
# This tag must match the `playwright` npm package version actually resolved
# in pnpm-lock.yaml exactly, or the bundled Chromium won't match what
# Playwright expects and every launch fails with "Executable doesn't exist"
# — found live in production (#211 go-live) when this was still pinned to
# v1.48.0 while the lockfile had long since drifted to 1.62.1 on `^1.48.0`'s
# floating range. `package.json` now pins an exact version for the same
# reason; bump both together, deliberately, never one without the other.
FROM mcr.microsoft.com/playwright:v1.62.1-jammy

# Not `corepack prepare` (what packages/legacy-migration/Dockerfile uses on a
# plain node:22 base): this image's bundled corepack (0.29.3) fails
# signature verification against current npm registry keys for pinned pnpm
# versions — a corepack-side issue, not a package-lock one. Installing pnpm
# as a plain global package sidesteps it.
RUN npm install -g pnpm@10.32.1

WORKDIR /app

# Workspace manifests only — this package needs nothing from packages/backend
# or packages/frontend (no Prisma client, no DATABASE_URL; see README.md).
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/inem-worker/package.json ./packages/inem-worker/

RUN pnpm install

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/inem-worker ./packages/inem-worker

WORKDIR /app/packages/shared
RUN pnpm build

WORKDIR /app/packages/inem-worker

# The poll-loop entrypoint. bootstrap.ts is deliberately never run from this
# image — it needs a real display for a human to complete MFA in a headed
# browser, which this image (and any container) doesn't have. See README.md.
CMD ["pnpm", "start"]
