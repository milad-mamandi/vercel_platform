# Vercel Platform (Foundation + Milestone 2 Progress)

This repository currently includes:

- React + Vite frontend (`apps/web`)
- Fastify + TypeScript backend (`apps/api`)
- Prisma schema for PostgreSQL
- Redis + BullMQ queue wiring
- Authentication + role checks + audit logging primitives
- Vercel connection CRUD + token validation + manual usage-sync queue trigger

A detailed implementation checklist is tracked in [`REMAINING_TODOS.md`](./REMAINING_TODOS.md).

## Prerequisites

- Node.js 20+
- Docker / Docker Compose

## Quick start

1. Start infrastructure:
   ```bash
   docker compose up -d
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure API env:
   ```bash
   cp apps/api/.env.example apps/api/.env
   ```
4. Generate Prisma client and migrate DB:
   ```bash
   npm run prisma:generate -w @platform/api
   npm run prisma:migrate -w @platform/api -- --name init
   ```
5. Start both apps in separate terminals:
   ```bash
   npm run dev:api
   npm run dev:web
   ```

## Notable current endpoints

- `GET /health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me` (Bearer token required)
- `POST /api/vercel/connections`
- `GET /api/vercel/connections`
- `GET /api/vercel/connections/:id`
- `PATCH /api/vercel/connections/:id`
- `DELETE /api/vercel/connections/:id`
- `POST /api/vercel/connections/:id/validate`
- `POST /api/vercel/connections/:id/sync-usage`
