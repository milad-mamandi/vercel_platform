# Vercel Platform (Milestone 1 Foundation)

This repository now includes the Milestone 1 foundation:

- React + Vite frontend (`apps/web`)
- Fastify + TypeScript backend (`apps/api`)
- Prisma schema for PostgreSQL
- Redis + BullMQ queue wiring
- Authentication + role checks + audit logging primitives

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

## Notable foundation endpoints

- `GET /health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me` (Bearer token required)
