# redinfo — Cruz Vermelha Portuguesa

Information system platform for a local Red Cross (_Cruz Vermelha Portuguesa_) branch.

## Stack

| Layer           | Technology                                                |
| --------------- | --------------------------------------------------------- |
| Frontend        | React 18 + TypeScript + **React-Admin 5** + MUI           |
| Backend         | **NestJS 10** + TypeScript                                |
| ORM             | **Prisma 5**                                              |
| Database        | PostgreSQL 18                                             |
| Auth            | JWT (access + refresh) + Google OAuth2 + Microsoft OAuth2 |
| Package manager | pnpm workspaces                                           |
| Containers      | Docker + Docker Compose                                   |

## Project structure

```
redinfo/
├── docker-compose.yml           # base (dev by default)
├── docker-compose.override.yml  # dev hot-reload volumes (auto-applied)
├── docker-compose.prod.yml      # production overrides
├── nginx/nginx.conf             # production nginx config
├── packages/
│   ├── shared/                  # TypeScript types shared by frontend & backend
│   ├── backend/                 # NestJS API  →  :3000
│   │   └── prisma/              # schema.prisma + migrations + seed
│   └── frontend/                # React-Admin SPA  →  :5173 (dev) / :80 (prod)
└── .env.example
```

## Quick start (development)

```bash
# 1. Install pnpm (if not already installed)
npm install -g pnpm

# 2. Copy and configure env vars
cp .env.example .env
# ➜ edit .env — set JWT_SECRET and OAuth credentials at minimum

# 3. Start all services (postgres + backend + frontend with hot-reload)
docker compose up --build

# 4. First time only — run DB migrations and seed
docker compose exec backend pnpm prisma:migrate   # creates tables
docker compose exec backend pnpm prisma:seed      # creates admin user

# 5. Open the app
#    Frontend  →  http://localhost:5173
#    API docs  →  http://localhost:3000/api/docs
#    DB (dev)  →  localhost:5432
```

Default admin credentials (seed): **admin@redcross.local** / **Admin1234!**

## Production

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Run migrations (first deploy or after schema changes)
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend \
  npx prisma migrate deploy
```

Production services:

- Frontend served by Nginx on **:80** (with API/auth proxy built in)
- Backend NOT exposed externally — accessed via Nginx proxy only
- Database NOT exposed externally

## Environment variables

See [`.env.example`](.env.example) for the full list.

| Variable                               | Description                     |
| -------------------------------------- | ------------------------------- |
| `DATABASE_URL`                         | PostgreSQL connection string    |
| `JWT_SECRET`                           | Long random secret (≥ 64 chars) |
| `JWT_ACCESS_EXPIRES_IN`                | e.g. `15m`                      |
| `JWT_REFRESH_EXPIRES_IN`               | e.g. `7d`                       |
| `GOOGLE_CLIENT_ID/SECRET`              | Google OAuth app credentials    |
| `MICROSOFT_CLIENT_ID/SECRET/TENANT_ID` | Azure AD app credentials        |

## OAuth setup

### Google

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Add authorised redirect URI: `http://localhost:3000/auth/google/callback`

### Microsoft

1. Go to [Azure Portal](https://portal.azure.com/) → App registrations → New registration
2. Add redirect URI: `http://localhost:3000/auth/microsoft/callback`
3. Create a client secret under _Certificates & secrets_
   An information system for the a local branch of Red Cross
