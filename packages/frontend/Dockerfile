# ─── Development stage ────────────────────────────────────────────────────────
FROM node:22-alpine AS dev

RUN npm install -g pnpm

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

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/frontend/package.json ./packages/frontend/

RUN pnpm install

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend

WORKDIR /app/packages/frontend
RUN VITE_API_URL=$VITE_API_URL pnpm build


# ─── Production stage (served by nginx) ───────────────────────────────────────
FROM nginx:1.27-alpine AS prod

COPY --from=build /app/packages/frontend/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
