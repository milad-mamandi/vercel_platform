# Vercel Platform (Foundation + Milestone 2 Complete)

This repository currently includes:

- React + Vite frontend (`apps/web`)
- Fastify + TypeScript backend (`apps/api`)
- Prisma schema for PostgreSQL
- Redis + BullMQ queue wiring
- Authentication + role checks + audit logging primitives
- Vercel connection CRUD + real token validation + metadata hydration
- AES-256-GCM token encryption at rest (`TOKEN_ENCRYPTION_KEY`)
- Periodic connection health scan + revalidation background jobs

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
   Required additional variables:
   - `TOKEN_ENCRYPTION_KEY` (base64-encoded 32-byte key)
   - optional: `CONNECTION_REVALIDATION_SCHEDULE_MS` and `CONNECTION_STALE_AFTER_MS`
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
