# Remaining TODOs (Based on `PLATFORM_PLAN.md`)

This checklist reflects current implementation status in this repo as of 2026-04-27.

## Milestone 1: Foundation

- [x] React app scaffolded (`apps/web`)
- [x] Fastify API scaffolded (`apps/api`)
- [x] PostgreSQL + Prisma base models for users/roles/audit/connections
- [x] Redis + BullMQ queue wiring
- [x] Auth and role assignment for new users
- [x] Audit logging plugin and usage in auth + connection actions
- [ ] Seed/default admin workflow and role management UI
- [ ] Centralized error handling and request validation error format

## Milestone 2: Vercel Connections

- [x] Connection CRUD API routes
- [x] Connection management UI in web app
- [x] Token validation endpoint (`POST /api/vercel/connections/:id/validate`)
- [x] Manual usage sync queue trigger (`POST /api/vercel/connections/:id/sync-usage`)
- [ ] Real Vercel API/CLI token validation (currently local placeholder logic)
- [ ] Team/account metadata fetch from Vercel
- [ ] Strong encryption at rest using `TOKEN_ENCRYPTION_KEY` (currently base64 placeholder)
- [ ] Connection health checks and periodic revalidation job

## Milestone 3: First Deployment

- [ ] Template DB models + API routes
- [ ] Template artifact storage (folder/zip)
- [ ] Deployment job model + CRUD/list endpoints
- [ ] Worker implementation for `render-template`, `deploy-project`, `poll-deployment-status`
- [ ] Deployment status/log persistence and UI history table

## Milestone 4: Usage Tracking

- [ ] Usage snapshot/service models and migrations
- [ ] Worker job for real `vercel usage --format json`
- [ ] Service normalization and quota remaining calculations
- [ ] Usage summary/services/history API
- [ ] Usage dashboard UI cards/charts/filters

## Milestone 5: Template Versioning

- [ ] Template version model + endpoints
- [ ] Payload schema validation for deployment requests
- [ ] Render preview endpoint + UI
- [ ] Retry deployment from prior template version

## Milestone 6: Simulator Lab

- [ ] Simulator DB models + APIs
- [ ] Mock provider implementations (account/email/phone/proxy)
- [ ] State machine runner + queue jobs
- [ ] Simulator UI views and controls

## Milestone 7: Production Hardening

- [ ] Queue retry/backoff strategy by job type
- [ ] Idempotency key enforcement for deployment creation
- [ ] Deployment cancel/retry actions
- [ ] Admin quota-rule editor
- [ ] Alerting and metrics pipeline
- [ ] Structured logs and trace correlation
- [ ] Evaluate/implement direct Vercel REST deployment path
