---
inclusion: always
---

# Technology Stack And Development Conventions

## Stack Overview

### Monorepo

| Layer | Technology | Notes |
|-------|------------|-------|
| Workspace root | Bun workspaces | Defined in the root `package.json` |
| JS package scope | `apps/*`, `shared` | `apps/admissions` and `apps/jobs-ops` are active frontend apps |
| Python backend | Standalone Django package in `backend/` | Not managed by Bun |

### Admissions Frontend

| Layer | Technology | Notes |
|-------|------------|-------|
| Runtime | Bun | Use Bun for install, dev, build, lint, and test |
| UI | React 18 + TypeScript | Vite-based SPA |
| Routing | React Router | Route-level pages live in `apps/admissions/src/pages/` |
| State | React Query and Zustand | Keep server and client state concerns separate |
| Forms | React Hook Form + Zod | Client-side validation remains Zod-based |
| Styling | Tailwind CSS + Radix UI | Existing app conventions still apply |
| Testing | Vitest, fast-check, Playwright | Frontend tests live under `apps/admissions/tests/` |
| Hosting | Vercel | App-local config in `apps/admissions/vercel.json` |

### Jobs Ops Frontend

| Layer | Technology | Notes |
|-------|------------|-------|
| Runtime | Bun | Use Bun for install, type-check, lint, and build |
| UI | React 18 + TypeScript | Vite-based SPA in `apps/jobs-ops/` |
| Routing | React Router | Central route map in `apps/jobs-ops/src/app/router.tsx` |
| State | React Query + Zustand | Query state for backend data, Zustand for UI shell state |
| Forms | React Hook Form + Zod | Planned/expected for write flows |
| Styling | Tailwind CSS + Lucide | Production-style operator dashboard |
| Validation | `bun run type-check`, `bun run lint`, `vite build` | Current quality gates for jobs-ops |

### Backend

| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | Django 5 + Django REST Framework | Active server implementation |
| Runtime | Python 3.12+ | Repo config targets Python 3.12+ |
| App server | Uvicorn (ASGI) | Deployed backend entrypoint is `config.asgi:application` |
| Data | Neon Postgres | Admissions and jobs-ops backend runtime database |
| Async | Celery + Redis | Background work, retries, and periodic tasks |
| Storage | Cloudflare R2 via `django-storages` | Signed URL workflow |
| Email | Resend live, Zoho planned placeholders | Resend is wired for alerting; Zoho env placeholders exist for jobs-ops |
| HTTP client | `requests` | Used by `check_uptime_task` for internal health checks |
| AI + messaging | OpenAI and Telegram planned placeholders | Env scaffolding now exists; integration wiring remains to be completed |
| Browser automation | Playwright worker service planned | Placeholder envs now exist |
| Error monitoring | Self-hosted via `ErrorLog` model + throttled alert emails | No Sentry — see Error Monitoring section below |
| API docs | drf-spectacular | Schema and docs under `/api/v1/` |
| Testing | pytest + hypothesis | Backend tests live under `backend/tests/` |

## Commands That Reflect The Real Repo

### Root

| Command | Purpose |
|---------|---------|
| `bun run dev:admissions` | Run the admissions app |
| `bun run build:admissions` | Build the admissions app |
| `bun run test:admissions` | Run admissions tests |
| `bun run lint:admissions` | Lint the admissions app |
| `bun run dev:jobs-ops` | Run the jobs-ops app |
| `bun run build:jobs-ops` | Build the jobs-ops app |
| `bun run type-check:jobs-ops` | Type-check the jobs-ops app |
| `bun run lint:jobs-ops` | Lint the jobs-ops app |

### Admissions App

| Command | Purpose |
|---------|---------|
| `cd apps/admissions && bun run dev` | Start the Vite dev server |
| `cd apps/admissions && bun run build` | Production build |
| `cd apps/admissions && bun run test` | Vitest suite |
| `cd apps/admissions && bun run lint` | ESLint suite |

### Jobs Ops App

| Command | Purpose |
|---------|---------|
| `cd apps/jobs-ops && bun run dev` | Start the jobs-ops Vite dev server |
| `cd apps/jobs-ops && bun run type-check` | TypeScript verification |
| `cd apps/jobs-ops && bun run lint` | ESLint suite |
| `cd apps/jobs-ops && ./node_modules/.bin/vite build` | Production build |

### Backend

| Command | Purpose |
|---------|---------|
| `cd backend && python3 -m pytest` | Run backend tests |
| `cd backend && python3 manage.py check` | Django system checks |
| `cd backend && python3 manage.py spectacular --file /tmp/schema.yaml` | Generate and verify OpenAPI schema |
| `cd backend && python3 manage.py runserver` | Local Django dev server |
| `cd backend && python3 -m uvicorn config.asgi:application --reload` | Local ASGI runtime parity check |

## API Contract

The frontend and backend share a single, unified API contract. There is no compatibility shim.

- Backend routes are mounted in `backend/config/urls.py` under `/api/v1/...`.
- Admissions frontend calls `/api/v1/...` directly.
- Jobs-ops frontend also calls `/api/v1/...` directly through app-local API services.
- Routes are resource-style, for example:
  - `/api/v1/auth/login/`
  - `/api/v1/applications/`
  - `/api/v1/jobs/`
  - `/api/v1/job-applications/`
  - `/api/v1/outreach/contacts/`
  - `/api/v1/automation/runs/`
  - `/api/v1/email/threads/`
  - `/api/v1/analytics/funnel/`
  - `/api/v1/meta/platform/`
- There are no legacy `/api/{resource}?action=` query-parameter routes.

## Response And Auth Conventions

- The platform uses the `{"success": true, "data": ...}` envelope for API responses handled through DRF renderers.
- Paginated responses use `{page, pageSize, totalCount, results}` inside the `data` envelope.
- Auth remains cookie-based for the main backend auth stack.
- CSRF is required for state-changing requests in authenticated flows.
- Jobs-ops currently exposes public read-oriented scaffold routes for some surfaces while keeping risky write actions authenticated and policy-gated.

## Conventions For New Code

### Frontend

- Use app-local code inside the target app first.
- `apps/admissions` and `apps/jobs-ops` should not casually share implementation through `shared/` unless the code is intentionally cross-app.
- In `apps/jobs-ops`, keep route-level logic inside `src/features/*`.
- Prefer React Query for backend data and keep shell/UI state in Zustand.
- Use app-local API service modules instead of raw `fetch`.

### Backend

- Keep new API work inside explicit domain apps under `backend/apps/`.
- Keep routes resource-oriented under `/api/v1/`.
- Preserve explicit jobs-ops domain naming such as `JobApplication`.
- Shared jobs-ops scaffold data currently lives in `backend/apps/common/jobs_ops_seed.py`; do not re-duplicate that seed state across views.
- Current default error-alert recipient is `ops@mihas.edu.zm` (configurable via `ERROR_ALERT_EMAIL` env var; code fallback is `admin@mihas.edu.zm`).

## Error Monitoring

The platform uses self-hosted error monitoring — there is no Sentry or third-party error tracker.

### Pipeline

1. Backend 500 errors: `envelope_exception_handler` in `backend/apps/common/exceptions.py` catches DRF exceptions, creates an `ErrorLog` row (source=`backend`), and dispatches a throttled alert email via Redis `cache.add` (15-minute TTL per unique message hash).
2. Frontend errors: `apps/admissions/src/lib/errorReporter.ts` captures `window.onerror` and `unhandledrejection` events, batches them with a 5-second debounce, and POSTs to `POST /api/v1/errors/report/`. The backend `ErrorReportView` in `backend/apps/common/error_views.py` creates an `ErrorLog` row (source=`frontend`) and dispatches a throttled alert email using the same logic.
3. Alert emails are enqueued in `EmailQueue` and dispatched via `send_email_task` through Celery + Resend.

### Key details

- `ErrorLog` model lives in `backend/apps/common/models.py` with `managed = False`. The `error_logs` table was created via the SQL migration script `backend/scripts/create_error_logs_table.sql`, not Django migrations.
- Default alert recipient: `ops@mihas.edu.zm` (configurable via `ERROR_ALERT_EMAIL` env var; code fallback is `admin@mihas.edu.zm`).
- Throttle: one alert per unique error message per 15 minutes, backed by Redis `cache.add`. If Redis is unavailable, alerts fail-open (dispatch anyway).
- Frontend error reporting is unauthenticated (`AllowAny`) and CSRF-exempt, rate-limited to 10 requests per IP per 5 minutes.
- Frontend reporter respects `VITE_ERROR_REPORT_ENABLED` env var — does nothing when disabled.

## Celery Beat Periodic Tasks

Celery Beat runs as a dedicated Koyeb worker service (exactly 1 instance to avoid duplicate dispatches). The schedule is defined in `CELERY_BEAT_SCHEDULE` in `backend/config/settings/base.py`:

| Task | Schedule | Purpose |
|------|----------|---------|
| `check_uptime_task` | Every 300 seconds (5 minutes) | Internal health check — pings `/health/ready/`, alerts on failure/recovery transitions |
| `cleanup_audit_logs_task` | Daily at 03:00 UTC (`crontab(hour=3, minute=0)`) | Purge expired audit log records: standard retention 90 days, security retention 365 days |

Both tasks live in `backend/apps/common/tasks.py`.

## Uptime Monitoring

Two layers of uptime monitoring are in place:

1. **Internal**: `check_uptime_task` (Celery Beat, every 5 minutes) sends `GET` to the configured `HEALTH_CHECK_URL` (default: `https://api.mihas.edu.zm/health/ready/`) with a 10-second timeout. Tracks previous status in Redis key `uptime:last_status`. On healthy→unhealthy transition: dispatches alert email. On unhealthy→healthy: dispatches recovery email. Repeated failures without recovery do not produce duplicate alerts. Uses the `requests` library.
2. **External**: [UptimeRobot](https://uptimerobot.com/) (free tier) monitors `https://api.mihas.edu.zm/health/ready/` every 5 minutes from outside the network. Sends email alerts to `ops@mihas.edu.zm` on failure and recovery.

## Secrets Rotation

A runbook for rotating production secrets lives at `docs/runbooks/secrets-rotation.md`. It covers JWT signing key, database credentials, Resend API key, S3/R2 keys, and Redis URL rotation with step-by-step procedures and rollback guidance.

## Current Jobs Ops State

- `apps/jobs-ops` is a real operator dashboard, not a placeholder shell.
- Search and recommendation filtering are implemented in the jobs inbox.
- Major views have loading states.
- Backend jobs-ops domains exist for jobs, outreach, automation, integrations, analytics, and reports.
- Schema generation is currently clean.
- Verified backend suites currently include application endpoints, notification endpoints, and jobs-ops endpoint coverage.

## Verification Expectations

- Run relevant backend pytest suites when you change Django code.
- Run jobs-ops type-check, lint, and build when you change `apps/jobs-ops`.
- Regenerate the schema after backend API changes.
- Keep steering files aligned with the actual repo state.
