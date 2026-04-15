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
| Browser automation | Stagehand (AI) + Playwright (low-level) | Stagehand installed at monorepo root for AI-driven browser tasks; Playwright for deterministic automation |
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
- Access tokens have a 30-minute lifetime; refresh tokens last 7 days with JTI blacklisting via Redis.
- CSRF is required for state-changing requests in authenticated flows.
- Jobs-ops currently exposes public read-oriented scaffold routes for some surfaces while keeping risky write actions authenticated and policy-gated.

## Conventions For New Code

### Frontend

- Use app-local code inside the target app first.
- `apps/admissions` and `apps/jobs-ops` should not casually share implementation through `shared/` unless the code is intentionally cross-app.
- In `apps/jobs-ops`, keep route-level logic inside `src/features/*`.
- Prefer React Query for backend data and keep shell/UI state in Zustand.
- Use app-local API service modules instead of raw `fetch`.
- Payment in the admissions wizard is handled exclusively by the Lenco inline widget (`LencoPay.getPaid`). Do not reintroduce the retired pre-Lenco payment UX.
- Student authenticated pages should prefer the canonical UI primitives already in the repo: `PageShell`, `SectionCard`, `ErrorDisplay`, `EmptyState`, and `Button asChild` for semantic links.
- Student forms that can lose work, especially settings and wizard-related screens, should protect dirty state on navigation and `beforeunload`.
- Use speculative prefetching (`src/lib/speculativePrefetch.ts`) for predictive data loading — prefetch catalog data on login success, wizard chunks on dashboard mount.
- SSE connections use `src/lib/sseClient.ts` with rapid-failure detection and automatic polling fallback. Do not add new SSE reconnection logic outside this client.
- PWA dependencies (`vite-plugin-pwa`, `workbox-*`) have been fully removed. The one-time SW unregistration block in `main.tsx` must be retained for 90 days (until July 2026).

### Backend

- Keep new API work inside explicit domain apps under `backend/apps/`.
- Keep routes resource-oriented under `/api/v1/`.
- Preserve explicit jobs-ops domain naming such as `JobApplication`.
- Shared jobs-ops scaffold data currently lives in `backend/apps/common/jobs_ops_seed.py`; do not re-duplicate that seed state across views.
- Current default error-alert recipient is `admin@mihas.edu.zm` (configurable via `ERROR_ALERT_EMAIL` env var).
- Payment records live in the `payments` table (managed by `backend/apps/documents/`). Application-level payment summaries should be derived from canonical payment records, not from retired inline compatibility columns.

## Lenco Payment Integration

The platform uses Lenco as its payment gateway for application fees. Key components:

| Component | Location | Purpose |
|-----------|----------|---------|
| `PaymentService` | `backend/apps/documents/payment_service.py` | Payment lifecycle: initiate, verify, webhook processing |
| `FeeResolver` | `backend/apps/documents/fee_resolver.py` | Dynamic fee resolution by program + residency |
| `WebhookProcessor` | `backend/apps/documents/webhook_processor.py` | HMAC-SHA512 signature validation + event logging |
| `ProgramFee` model | `backend/apps/documents/models.py` | Per-program fee configuration (local vs international) |
| `WebhookEventLog` model | `backend/apps/documents/models.py` | Audit trail for all webhook events |
| `useLencoWidget` | `apps/admissions/src/hooks/useLencoWidget.ts` | Dynamic Lenco widget script loading |
| `useFeeResolver` | `apps/admissions/src/hooks/useFeeResolver.ts` | Frontend fee resolution hook |
| `usePaymentStatus` | `apps/admissions/src/hooks/usePaymentStatus.ts` | Payment status polling hook |
| `PaymentStep` | `apps/admissions/src/pages/student/applicationWizard/steps/PaymentStep.tsx` | Lenco widget payment step |

Payment API endpoints:
- `POST /api/v1/payments/initiate/` — create pending payment, returns widget config
- `POST /api/v1/payments/{id}/verify/` — verify payment via Lenco API
- `POST /api/v1/payments/webhook/lenco/` — webhook receiver (unauthenticated, HMAC-validated)
- `GET /api/v1/payments/resolve-fee/` — resolve fee for program + residency
- `GET/POST/PUT/DELETE /api/v1/programs/{id}/fees/` — admin fee management

Related admissions flow endpoints:
- `POST /api/v1/applications/{id}/submit/` — canonical student submission endpoint with submission gates
- `POST/PATCH /api/v1/applications/{id}/review/` — admin review and payment override endpoint
- `GET /api/v1/applications/interviews/?mine=true` — canonical student interview list endpoint

Payment status conventions:
- Use `normalizePaymentStatus()` and `isPaymentVerified()` from `apps/admissions/src/lib/paymentStatus.ts` for student-facing reads.
- Do not branch directly on raw payment strings in new UI code unless you are handling backend write payloads.

Environment variables:
- Backend: `LENCO_API_SECRET_KEY`, `LENCO_API_BASE_URL`, `LENCO_PUBLIC_KEY`
- Frontend: `VITE_LENCO_PUBLIC_KEY`, `VITE_LENCO_WIDGET_URL`

Webhook URL registered with Lenco: `https://api.mihas.edu.zm/api/v1/payments/webhook/lenco/`

## Error Monitoring

The platform uses self-hosted error monitoring — there is no Sentry or third-party error tracker.

### Pipeline

1. Backend 500 errors: `envelope_exception_handler` in `backend/apps/common/exceptions.py` catches DRF exceptions, creates an `ErrorLog` row (source=`backend`), and dispatches a throttled alert email via Redis `cache.add` (15-minute TTL per unique message hash).
2. Frontend errors: `apps/admissions/src/lib/errorReporter.ts` captures `window.onerror` and `unhandledrejection` events, batches them with a 5-second debounce, and POSTs to `POST /api/v1/errors/report/`. The backend `ErrorReportView` in `backend/apps/common/error_views.py` creates an `ErrorLog` row (source=`frontend`) and dispatches a throttled alert email using the same logic.
3. Alert emails are enqueued in `EmailQueue` and dispatched via `send_email_task` through Celery + Resend.

### Key details

- `ErrorLog` model lives in `backend/apps/common/models.py` with `managed = False`. The `error_logs` table was created via the SQL migration script `backend/scripts/create_error_logs_table.sql`, not Django migrations.
- Default alert recipient: `admin@mihas.edu.zm` (configurable via `ERROR_ALERT_EMAIL` env var).
- Throttle: one alert per unique error message per 15 minutes, backed by Redis `cache.add`. If Redis is unavailable, alerts fail-open (dispatch anyway).
- Frontend error reporting is unauthenticated (`AllowAny`) and CSRF-exempt, rate-limited to 10 requests per IP per 5 minutes.
- Frontend reporter respects `VITE_ERROR_REPORT_ENABLED` env var — does nothing when disabled.

## Stagehand (AI Browser Automation)

Stagehand (`@browserbasehq/stagehand`) is installed at the monorepo root for AI-driven browser automation. It wraps Playwright with an LLM layer that can interpret natural-language instructions to interact with web pages.

### Use Cases in MIHAS

| Use Case | Surface | Notes |
|----------|---------|-------|
| E2E smoke tests with natural language | Admissions, Jobs-Ops | Write resilient tests that survive UI refactors — Stagehand finds elements by intent, not selectors |
| Outreach automation | Jobs-Ops | Browser-based job application submission, form filling on external career portals |
| Scraping job boards | Jobs-Ops | AI-guided extraction from dynamic job listing pages that resist traditional scraping |
| Admissions document verification | Admissions | Automated cross-referencing of uploaded documents against external registries |
| Competitive intelligence | Jobs-Ops | Monitor competitor job postings and salary data from public sources |

### Integration Pattern

- Stagehand runs in Node.js with `env: "LOCAL"` — uses a local Chromium instance, no Browserbase account needed
- Requires an LLM API key (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`) for AI-driven page interaction
- For E2E tests against the live site, point Stagehand at the production URL (`https://apply.mihas.edu.zm`) so env variables and real behavior are exercised
- For backend-triggered browser tasks, create a Node.js worker script that the Django backend calls via HTTP or a task queue
- Environment variables: `OPENAI_API_KEY` (add to `.env.local` — already documented in `.env.example`)

### Local Setup

```typescript
import { Stagehand } from "@browserbasehq/stagehand";

const stagehand = new Stagehand({
  env: "LOCAL",
  model: "openai/gpt-4o",
  localBrowserLaunchOptions: {
    headless: false,  // set true for CI
  },
});

await stagehand.init();
const page = stagehand.context.pages()[0];
await page.goto("https://apply.mihas.edu.zm");
```

### Commands

| Command | Purpose |
|---------|---------|
| `bun add @browserbasehq/stagehand` | Already installed at monorepo root |
| `npx playwright install chromium` | Install local Chromium for Stagehand |

## Celery Beat Periodic Tasks

Celery Beat runs as a dedicated Koyeb worker service (exactly 1 instance to avoid duplicate dispatches). The schedule is defined in `CELERY_BEAT_SCHEDULE` in `backend/config/settings/base.py`:

| Task | Schedule | Purpose |
|------|----------|---------|
| `check_uptime_task` | Every 300 seconds (5 minutes) | Internal health check — pings `/health/ready/`, alerts on failure/recovery transitions |
| `cleanup_audit_logs_task` | Daily at 03:00 UTC (`crontab(hour=3, minute=0)`) | Purge expired audit log records: standard retention 90 days, security retention 365 days |
| `poll_pending_payments_task` | Every 600 seconds (10 minutes) | Polls Lenco API for pending payments older than 5 min and younger than 24 hr, max 50 per run |
| `intake_manager_task` | Daily at 04:00 UTC (`crontab(hour=4, minute=0)`) | Ensures at least 2 open intakes exist following the Jan/Jul pattern. Idempotent. |

The first two tasks live in `backend/apps/common/tasks.py`. The payment polling task lives in `backend/apps/documents/tasks.py`. The intake manager task lives in `backend/apps/catalog/tasks.py` and is also callable as `python3 manage.py manage_intakes`.

## Uptime Monitoring

Two layers of uptime monitoring are in place:

1. **Internal**: `check_uptime_task` (Celery Beat, every 5 minutes) sends `GET` to the configured `HEALTH_CHECK_URL` (default: `https://api.mihas.edu.zm/health/ready/`) with a 10-second timeout. Tracks previous status in Redis key `uptime:last_status`. On healthy→unhealthy transition: dispatches alert email. On unhealthy→healthy: dispatches recovery email. Repeated failures without recovery do not produce duplicate alerts. Uses the `requests` library.
2. **External**: [UptimeRobot](https://uptimerobot.com/) (free tier) monitors `https://api.mihas.edu.zm/health/ready/` every 5 minutes from outside the network. Sends email alerts to `admin@mihas.edu.zm` on failure and recovery.

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
