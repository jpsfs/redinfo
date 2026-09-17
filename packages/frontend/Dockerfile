# ─── Development stage ────────────────────────────────────────────────────────
FROM node:22-alpine AS dev

# Use the same pnpm version across dev/CI/Docker.
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/frontend/package.json ./packages/frontend/

RUN pnpm install

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend

WORKDIR /app/packages/frontend

EXPOSE 5173

CMD ["pnpm", "dev"]


# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS build

ARG VITE_API_URL=/api
# Tab title / installed-app name — build-time only now, and optional
# (build-once/promote model). Defaults to unset/empty on purpose: a plain
# `docker build --target prod` with no --build-arg then stamps NOTHING at
# build time (vite.config.ts's injectAppTitle leaves the __APP_TITLE__
# placeholder in dist/ untouched), so the same image can be promoted
# staging → production and the real title is set per-environment at
# container start by docker-entrypoint-app-title.sh below, from APP_TITLE
# (see deploy/redinfo/values.*.yaml). Still settable for a local/compose
# build that wants a fixed title baked in without touching APP_TITLE — see
# docker-compose.prod.yml and .env.example.
ARG VITE_APP_TITLE=""

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/frontend/package.json ./packages/frontend/

# --frozen-lockfile: CI determinism — fail the build rather than silently
# resolving a different tree than pnpm-lock.yaml describes.
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend

WORKDIR /app/packages/shared
RUN pnpm build

WORKDIR /app/packages/frontend
RUN VITE_API_URL="$VITE_API_URL" VITE_APP_TITLE="$VITE_APP_TITLE" pnpm build


# ─── Production stage (served by nginx) ───────────────────────────────────────
FROM nginx:1.27-alpine AS prod

COPY --from=build /app/packages/frontend/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

# nginx:alpine runs every executable *.sh under /docker-entrypoint.d/ before
# starting nginx — this is what lets one image serve every environment: it
# sed's the real APP_TITLE (see deploy/redinfo/values.*.yaml) into
# index.html/manifest.webmanifest at container start instead of at build
# time. See the script itself for what it does and doesn't rewrite.
COPY packages/frontend/docker-entrypoint-app-title.sh /docker-entrypoint.d/20-app-title.sh
RUN chmod +x /docker-entrypoint.d/20-app-title.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
