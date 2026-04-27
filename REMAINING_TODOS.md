# Remaining TODOs (Based on `PLATFORM_PLAN.md`)

This checklist reflects current implementation status in this repo as of 2026-04-27.

## Milestone 1: Foundation

- [x] React app scaffolded (`apps/web`)
- [x] Fastify API scaffolded (`apps/api`)
- [x] PostgreSQL + Prisma base models for users/roles/audit/connections
- [x] Redis + BullMQ queue wiring
- [x] Auth and role assignment for new users
- [x] Audit logging plugin and usage in auth + connection actions
- [x] Seed/default admin workflow and role management UI
- [x] Centralized error handling and request validation error format

## Milestone 2: Vercel Connections

- [x] Connection CRUD API routes
- [x] Connection management UI in web app
- [x] Token validation endpoint (`POST /api/vercel/connections/:id/validate`)
- [x] Manual usage sync queue trigger (`POST /api/vercel/connections/:id/sync-usage`)
- [x] Real Vercel API/CLI token validation (currently local placeholder logic)
- [x] Team/account metadata fetch from Vercel
- [x] Strong encryption at rest using `TOKEN_ENCRYPTION_KEY` (currently base64 placeholder)
- [x] Connection health checks and periodic revalidation job

## Milestone 3: First Deployment

- [x] Template DB models + API routes
- [x] Template artifact storage (folder/zip)
- [x] Deployment job model + CRUD/list endpoints
- [x] Worker implementation for `render-template`, `deploy-project`, `poll-deployment-status`
- [x] Deployment status/log persistence and UI history table

## Milestone 4: Usage Tracking

- [x] Usage snapshot/service models and migrations
- [x] Worker job for real `vercel usage --format json`
- [x] Service normalization and quota remaining calculations
- [x] Usage summary/services/history API
- [x] Usage dashboard UI cards/charts/filters

## Milestone 5: Template Versioning

- [x] Template version model + endpoints
- [x] Payload schema validation for deployment requests
- [x] Render preview endpoint + UI
- [x] Retry deployment from prior template version

## Milestone 6: Simulator Lab

- [x] Simulator DB models + APIs
- [x] Mock provider implementations (account/email/phone/proxy)
- [x] State machine runner + queue jobs
- [x] Simulator UI views and controls

## Milestone 7: Production Hardening

- [x] Queue retry/backoff strategy by job type
- [x] Idempotency key enforcement for deployment creation
- [x] Deployment cancel/retry actions
- [x] Admin quota-rule editor
- [x] Alerting and metrics pipeline
- [x] Structured logs and trace correlation
- [x] Evaluate/implement direct Vercel REST deployment path
