# ─── Development stage ────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS dev

RUN npm install -g pnpm

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

RUN npm install -g pnpm

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
# Copy generated Prisma client into package-local node_modules so PROD stage can COPY it reliably
RUN mkdir -p /app/packages/backend/node_modules && \
    if [ -d "/app/node_modules/.prisma" ]; then cp -R /app/node_modules/.prisma /app/packages/backend/node_modules/.prisma; fi


# ─── Production stage ─────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS prod

RUN npm install -g pnpm

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/

# Install only prod deps
RUN pnpm install --prod

# Copy generated Prisma client + compiled output
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/packages/backend/node_modules/.prisma ./packages/backend/node_modules/.prisma
COPY packages/backend/prisma ./packages/backend/prisma

WORKDIR /app/packages/backend

COPY packages/backend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/main"]
