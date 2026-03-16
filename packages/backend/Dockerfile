# ─── Development stage ────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS dev

# Use the same pnpm version across dev/CI/Docker.
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

# OpenSSL required by Prisma on Debian
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/

# Install all deps
RUN pnpm install

# Copy sources
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend

WORKDIR /app/packages/backend

EXPOSE 3000

# Build shared types, generate Prisma client, then start the dev watcher
CMD ["sh", "-c", \
    "cd /app/packages/shared && pnpm build && \
     cd /app/packages/backend && npx prisma generate && pnpm dev"]


# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/

RUN pnpm install

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend

WORKDIR /app/packages/shared
RUN pnpm build

WORKDIR /app/packages/backend
RUN pnpm prisma:generate
RUN pnpm build


# ─── Production stage ─────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS prod

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/

# Install only prod deps
RUN pnpm install --prod

# Copy compiled output and Prisma schema
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY packages/backend/prisma ./packages/backend/prisma

# Generate the Prisma client inside the production node_modules so pnpm
# places it at the correct virtual-store location that @prisma/client
# resolves at runtime.  prisma must be in dependencies (not devDependencies)
# for this to work – and for the entrypoint's "prisma migrate deploy" too.
RUN pnpm --filter @redinfo/backend run prisma:generate

WORKDIR /app/packages/backend

COPY packages/backend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/main"]
