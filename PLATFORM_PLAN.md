# Authorized Vercel Deployment Automation Platform

## Scope

This platform automates authorized Vercel deployments, tracks quota and usage, and provides a simulator lab for research/testing of account lifecycle workflows.

The platform does not automate real third-party account creation, proxy rotation, generated-email verification, or phone-verification bypass. Those behaviors are represented only through mock providers so the queueing, state handling, quota modeling, and UI can be tested safely.

## Goals

- Connect existing Vercel accounts or teams through official Vercel access tokens.
- Deploy generated projects from folders, ZIP templates, or repository templates.
- Allow deployment content to change per deployment.
- Store deployment metadata, generated domains, logs, and errors.
- Track resource usage and estimated remaining quota for Vercel accounts/teams.
- Provide mock account, email, phone, and proxy simulators for controlled research tests.
- Expose a React dashboard for connections, deployments, templates, usage, and simulator workflows.

## Recommended Stack

### Frontend

- React
- Vite
- TypeScript
- React Router
- TanStack Query
- Zustand for lightweight UI state
- Tailwind CSS or shadcn/ui
- Recharts for usage graphs

### Backend

- Node.js
- TypeScript
- Fastify
- PostgreSQL
- Prisma ORM
- Redis
- BullMQ
- S3-compatible object storage for template artifacts
- Vercel CLI for the MVP deployment worker
- Vercel REST API for later production-grade deployment uploads

## High-Level Architecture

```text
React UI
  |
  v
Fastify API
  |
  +--> PostgreSQL / Prisma
  +--> Redis / BullMQ
  +--> Object Storage
  +--> Vercel CLI or Vercel REST API
  +--> Simulator Providers

BullMQ Workers
  |
  +--> Render project folders
  +--> Deploy to Vercel
  +--> Poll deployment status
  +--> Sync usage/quota
  +--> Run simulator flows
```

## Core Modules

### 1. Auth And Users

Responsibilities:

- User authentication.
- Role-based access control.
- User/team ownership of Vercel connections.
- Audit logging for token, deployment, and simulator actions.

Suggested roles:

- `admin`
- `operator`
- `viewer`

### 2. Vercel Connection Manager

Responsibilities:

- Accept user-provided official Vercel access tokens.
- Validate access tokens.
- Store tokens encrypted.
- Track account/team metadata.
- Track connection health.
- Support multiple authorized Vercel connections per user or organization.

Stored metadata:

- Connection name
- Vercel user ID if available
- Vercel team ID
- Team slug
- Plan
- Token status
- Last validation timestamp
- Last usage sync timestamp

### 3. Deployment Template System

Supported template sources:

- Static project folder
- ZIP upload
- GitHub repository reference
- Generated project blueprint

Template capabilities:

- Template variables
- Environment variables
- Generated content files
- `vercel.json` configuration
- Version history
- Artifact storage
- Render preview before deployment

Example template variables:

```json
{
  "siteTitle": "Example Campaign",
  "heroText": "Generated per deployment",
  "apiResponse": {
    "status": "ok",
    "variant": "A"
  }
}
```

### 4. Deployment Orchestrator

Responsibilities:

- Create deployment jobs.
- Render project folders from templates.
- Inject per-deployment content.
- Deploy to Vercel.
- Poll deployment status.
- Store deployment URL/domain.
- Store build logs and errors.
- Trigger usage sync after deployment.

Deployment targets:

- Preview deployment
- Production deployment

Recommended MVP deployment method:

```text
vercel deploy --cwd <rendered-project-folder> --token <token>
```

Later production method:

- Use Vercel REST API.
- Hash files.
- Upload deployment files.
- Create deployment.
- Poll deployment status.

### 5. Usage And Quota Tracker

Primary sync method:

```text
vercel usage --format json --token <token>
```

Usage resources to track:

- Fast Origin Transfer
- Fast Data Transfer
- CDN Requests
- Function Invocations
- Fluid Active CPU
- Provisioned Memory
- Build resources, where available

Tracker responsibilities:

- Sync current billing period usage.
- Sync daily, weekly, or monthly breakdowns.
- Normalize service names.
- Store raw Vercel payloads.
- Calculate estimated remaining quota.
- Calculate daily deltas.
- Project end-of-cycle usage.
- Alert at configured thresholds.

Recommended alert thresholds:

- 50%
- 75%
- 90%
- 100%

Quota rules should be stored in the database rather than hardcoded, because provider plans and allotments change over time.

### 6. Simulator Lab

The simulator lab models account, email, phone, and proxy workflows without touching real providers.

Simulator providers:

- `MockAccountProvider`
- `MockEmailProvider`
- `MockPhoneProvider`
- `MockProxyPool`

Simulated account states:

- `created`
- `email_pending`
- `email_verified`
- `phone_pending`
- `phone_verified`
- `active`
- `suspended`
- `quota_exhausted`
- `failed`

Simulated email behavior:

- Verification token creation
- Delivery delay
- Expired links
- Duplicate links
- Failed verification
- Retry behavior

Simulated phone behavior:

- Number allocation
- OTP delivery
- OTP timeout
- Invalid OTP
- Retry limit
- Provider failure

Simulated proxy behavior:

- Region
- Latency
- Failure rate
- Blocked status
- Cooldown time
- Request count

The simulator is useful for testing:

- Queue reliability
- Retry logic
- UI state transitions
- Failure handling
- Metrics and dashboards
- Quota exhaustion behavior

## Database Plan

### Tables

```text
users
roles
user_roles
vercel_connections
deployment_templates
deployment_template_versions
deployment_jobs
deployments
deployment_logs
usage_snapshots
usage_services
quota_rules
simulated_accounts
simulated_email_inboxes
simulated_phone_numbers
simulated_proxy_profiles
audit_events
```

### `vercel_connections`

```text
id
user_id
name
team_id
team_slug
plan
encrypted_token
token_status
last_validated_at
last_usage_sync_at
created_at
updated_at
```

### `deployment_templates`

```text
id
owner_id
name
description
source_type
created_at
updated_at
```

### `deployment_template_versions`

```text
id
template_id
version
artifact_uri
variables_schema
default_payload
created_at
```

### `deployment_jobs`

```text
id
user_id
connection_id
template_version_id
status
target
payload_json
error_message
created_at
started_at
finished_at
```

Suggested statuses:

```text
queued
rendering
deploying
polling
ready
failed
canceled
```

### `deployments`

```text
id
job_id
connection_id
vercel_project_id
vercel_deployment_id
url
status
created_at
updated_at
```

### `deployment_logs`

```text
id
deployment_id
job_id
level
message
raw_payload
created_at
```

### `usage_snapshots`

```text
id
connection_id
period_start
period_end
source
raw_payload
created_at
```

### `usage_services`

```text
id
snapshot_id
connection_id
period_start
period_end
service_name
quantity
unit
included_limit
estimated_remaining
effective_cost
billed_cost
created_at
```

### `quota_rules`

```text
id
plan
service_name
included_limit
unit
period
effective_from
effective_to
created_at
updated_at
```

### `simulated_accounts`

```text
id
owner_id
provider
state
email_ref
phone_ref
proxy_ref
quota_profile
failure_reason
created_at
updated_at
```

### `simulated_email_inboxes`

```text
id
account_id
email_address
verification_token
state
delivery_delay_ms
expires_at
created_at
updated_at
```

### `simulated_phone_numbers`

```text
id
account_id
phone_number
otp_code
state
delivery_delay_ms
expires_at
retry_count
created_at
updated_at
```

### `simulated_proxy_profiles`

```text
id
region
latency_ms
failure_rate
is_blocked
cooldown_until
request_count
created_at
updated_at
```

### `audit_events`

```text
id
actor_user_id
action
entity_type
entity_id
metadata
created_at
```

## Backend API Plan

### Auth

```text
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/me
```

### Vercel Connections

```text
POST   /api/vercel/connections
GET    /api/vercel/connections
GET    /api/vercel/connections/:id
PATCH  /api/vercel/connections/:id
DELETE /api/vercel/connections/:id
POST   /api/vercel/connections/:id/validate
POST   /api/vercel/connections/:id/sync-usage
```

### Templates

```text
POST   /api/templates
GET    /api/templates
GET    /api/templates/:id
PATCH  /api/templates/:id
DELETE /api/templates/:id
POST   /api/templates/:id/versions
GET    /api/templates/:id/versions
GET    /api/templates/:id/versions/:versionId
POST   /api/templates/:id/render-preview
```

### Deployments

```text
POST   /api/deployments
GET    /api/deployments
GET    /api/deployments/:id
GET    /api/deployments/:id/logs
POST   /api/deployments/:id/cancel
POST   /api/deployments/:id/retry
```

### Usage

```text
GET    /api/usage/summary
GET    /api/usage/services
GET    /api/usage/history
GET    /api/usage/connections/:connectionId/summary
GET    /api/usage/connections/:connectionId/services
```

### Simulator

```text
POST   /api/simulator/accounts
GET    /api/simulator/accounts
GET    /api/simulator/accounts/:id
POST   /api/simulator/accounts/:id/run
POST   /api/simulator/accounts/:id/run-email-verification
POST   /api/simulator/accounts/:id/run-phone-verification

GET    /api/simulator/emails
GET    /api/simulator/phones
GET    /api/simulator/proxies
POST   /api/simulator/proxies
PATCH  /api/simulator/proxies/:id
```

## Worker Job Plan

### Deployment Jobs

```text
render-template
deploy-project
poll-deployment-status
collect-deployment-logs
sync-usage-after-deployment
```

### Connection Jobs

```text
validate-vercel-token
sync-vercel-usage
calculate-quota-remaining
```

### Simulator Jobs

```text
run-simulated-account-flow
run-simulated-email-verification
run-simulated-phone-verification
run-simulated-proxy-request
simulate-quota-exhaustion
```

## Frontend Plan

### 1. Dashboard

Purpose:

- Overview of platform status.

Widgets:

- Connected Vercel accounts/teams
- Recent deployments
- Failed jobs
- Usage warnings
- Current billing period summary

### 2. Connections

Purpose:

- Manage authorized Vercel connections.

Features:

- Add token
- Validate token
- View team/account metadata
- View token health
- Trigger usage sync
- Remove connection

### 3. New Deployment

Purpose:

- Create a new deployment from a template.

Flow:

```text
Select Vercel connection
Select template
Select template version
Edit payload
Choose preview or production
Submit deployment
Watch live status
Open generated URL
```

### 4. Deployments

Purpose:

- Track deployment history.

Features:

- Table of deployments
- Status filters
- URL/domain column
- Connection/team column
- Template version column
- Logs drawer
- Retry failed jobs
- Cancel queued jobs

### 5. Templates

Purpose:

- Manage deployment templates.

Features:

- Upload ZIP or folder artifact
- Create generated blueprint
- Configure variable schema
- Store template versions
- Preview rendered output

### 6. Usage

Purpose:

- Track resource usage and remaining quota.

Cards:

- Fast Origin Transfer
- Fast Data Transfer
- CDN Requests
- Function Invocations
- Fluid Active CPU
- Provisioned Memory

Charts:

- Daily usage trend
- Service breakdown
- Projected end-of-cycle usage

Controls:

- Connection selector
- Date range selector
- Service filter
- Manual sync button

### 7. Simulator Lab

Purpose:

- Research and test account lifecycle state machines without real provider automation.

Features:

- Create mock account
- Run full simulated lifecycle
- Trigger mock email verification
- Trigger mock phone verification
- Assign mock proxy profile
- Configure failure rates
- Configure delivery delays
- Simulate quota exhaustion
- Inspect state transitions

## Deployment Flow

```text
User creates deployment
  |
  v
API validates request
  |
  v
API creates deployment_job
  |
  v
BullMQ queues render-template
  |
  v
Worker renders project folder
  |
  v
Worker injects content, env vars, and config
  |
  v
Worker deploys to Vercel
  |
  v
Worker polls deployment status
  |
  v
Worker stores deployment URL/domain
  |
  v
Worker schedules usage sync
  |
  v
UI shows deployment status and updated quota snapshot
```

## Usage Sync Flow

```text
Scheduled sync or manual sync
  |
  v
Worker runs Vercel usage sync
  |
  v
Parse service usage
  |
  v
Normalize service names
  |
  v
Store raw payload in usage_snapshots
  |
  v
Store normalized services in usage_services
  |
  v
Calculate estimated remaining quota
  |
  v
Update dashboard cards and alerts
```

## Simulator Flow

```text
Create simulated account
  |
  v
Assign mock email, phone, and proxy profile
  |
  v
Run simulated email verification
  |
  v
Run simulated phone verification
  |
  v
Mark simulated account active
  |
  v
Attach simulated quota profile
  |
  v
Run deployment or quota behavior tests against simulated account state
```

## Security And Reliability Requirements

- Encrypt Vercel tokens at rest.
- Never log raw tokens.
- Use strict RBAC for token and deployment actions.
- Add audit events for all sensitive actions.
- Use worker retries with exponential backoff.
- Respect Vercel API and CLI failures.
- Handle rate limiting.
- Store raw provider responses for debugging where safe.
- Keep quota rules editable by admins.
- Add idempotency keys to deployment creation.
- Make jobs resumable after worker restart.

## Configuration

Recommended environment variables:

```text
DATABASE_URL
REDIS_URL
OBJECT_STORAGE_ENDPOINT
OBJECT_STORAGE_BUCKET
OBJECT_STORAGE_ACCESS_KEY_ID
OBJECT_STORAGE_SECRET_ACCESS_KEY
TOKEN_ENCRYPTION_KEY
JWT_SECRET
VERCEL_CLI_PATH
WORKER_CONCURRENCY
```

## Milestones

### Milestone 1: Foundation

- Create React app.
- Create Fastify API.
- Add PostgreSQL and Prisma.
- Add Redis and BullMQ.
- Add auth and roles.
- Add audit logging.

### Milestone 2: Vercel Connections

- Add Vercel connection CRUD.
- Encrypt token storage.
- Validate Vercel token.
- Store team/account metadata.
- Show connections in UI.

### Milestone 3: First Deployment

- Add template model.
- Add simple folder or ZIP template.
- Add deployment job model.
- Render project folder.
- Deploy with Vercel CLI.
- Store generated URL.
- Show deployment status and logs in UI.

### Milestone 4: Usage Tracking

- Add usage sync worker.
- Run `vercel usage --format json`.
- Store raw snapshots.
- Normalize resource services.
- Add usage dashboard cards.
- Add quota rules and estimated remaining calculations.

### Milestone 5: Template Versioning

- Add template versions.
- Add payload schema support.
- Add render preview.
- Add retry deployment from same template version.

### Milestone 6: Simulator Lab

- Add mock account provider.
- Add mock email provider.
- Add mock phone provider.
- Add mock proxy profiles.
- Add state-machine runner.
- Add simulator UI.

### Milestone 7: Production Hardening

- Add robust worker retries.
- Add idempotency keys.
- Add deployment cancellation.
- Add admin quota rule editor.
- Add alerting.
- Add metrics.
- Add structured logs.
- Evaluate replacing CLI deployment with direct Vercel REST API deployment.

## MVP Definition

The first usable version should include:

- User login.
- Add authorized Vercel token.
- Validate Vercel connection.
- Create one template.
- Submit a deployment with custom content.
- Deploy to Vercel through the worker.
- Show deployment URL in the UI.
- Run manual usage sync.
- Show current usage for the connected account/team.

## Later Enhancements

- Direct Vercel REST API file upload deployment.
- GitHub repository import support.
- Custom domain assignment.
- Team-level permissions.
- Webhook-based deployment status updates.
- Cost forecasting.
- Per-template usage attribution.
- Per-project usage breakdown where provider data allows it.
- Deployment diff viewer.
- Template marketplace.
