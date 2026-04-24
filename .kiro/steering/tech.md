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
| Email | Zoho SMTP (primary) + Resend (fallback) | Zoho SMTP for outbound email; Resend as fallback for transactional delivery |
| HTTP client | `requests` | Used by `check_uptime_task` for internal health checks |
| AI gateway | Vercel AI Gateway (multi-model) | `AI_GATEWAY_API_KEY` — routes to gpt-4o-mini, gemini-2.5-flash, deepseek-v3 by task type |
| Messaging | Telegram planned placeholder | Env scaffolding exists; integration wiring remains to be completed |
| Browser automation | Playwright | Deterministic browser automation for E2E testing |
| Error monitoring | GlitchTip (Sentry-compatible) via `sentry-sdk` | DSN-based — see Error Monitoring section below |
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

- The platform uses the `{"success": true, "data": ...}` envelope for API responses handled through DRF renderers. All authenticated list endpoints (including `GET /api/v1/sessions/`) must use this envelope format.
- Paginated responses use `{page, pageSize, totalCount, results}` inside the `data` envelope.
- Auth remains cookie-based for the main backend auth stack.
- The admissions frontend calls `https://api.mihas.edu.zm` directly (cross-origin with `credentials: 'include'`). Vercel free tier does not support external rewrites, so there is no same-origin proxy. In local dev, Vite proxies `/api` to the backend.
- DRF authentication classes are the sole authority for setting `request.user`. The `JWTAuthenticationMiddleware` does NOT authenticate — it only flags expired tokens so 403→401 conversion fires for the frontend refresh interceptor.
- Access tokens have a 30-minute lifetime; refresh tokens last 7 days with JTI blacklisting via Redis.
- Token refresh (`POST /api/v1/auth/refresh/`) uses distinct error codes: `NO_REFRESH_TOKEN` when the cookie is missing, `TOKEN_EXPIRED` for expired/blacklisted/invalid tokens. Frontend can differentiate between configuration issues and token expiry.
- CSRF is required for state-changing requests in authenticated flows. CSRF tokens are validated at the `JWTCookieAuthentication` layer (not middleware). The frontend bootstrap session call (`GET /api/v1/auth/session/?refresh_csrf=1`) requests a fresh token when the in-memory store is empty (e.g. after page refresh). CSRF recovery uses the `?refresh_csrf=1` query parameter (not a custom header) to avoid CORS preflight issues on cross-origin requests. `x-csrf-token`, `x-csrf-recovery`, and `idempotency-key` are all in `CORS_ALLOW_HEADERS`. CSRF tokens are issued by `SessionView` and `RefreshView` in the `X-CSRF-Token` response header. The frontend stores them in-memory only (never localStorage). After a page refresh the in-memory token is lost, so the bootstrap session call includes `?refresh_csrf=1` to force a fresh token. The CSRF recovery flow (`recoverCsrfAndRetry`) also uses `?refresh_csrf=1` instead of a custom header to avoid CORS preflight issues on cross-origin requests.
- `CORS_ALLOW_HEADERS` includes `x-csrf-token`, `x-csrf-recovery`, `idempotency-key`, and `cache-control` in addition to the `corsheaders` defaults.
- Application tracking (`GET /api/v1/applications/track/`) validates code format against `APP-YYYYMMDD-XXXXXXXX` or `TRK-XXXXXXXXXXXX` patterns, returning 400 with `INVALID_FORMAT` for bad formats and descriptive 404 messages for valid-format codes not found.
- Jobs-ops currently exposes public read-oriented scaffold routes for some surfaces while keeping risky write actions authenticated and policy-gated.

## Conventions For New Code

### Frontend

- Use app-local code inside the target app first.
- `apps/admissions` and `apps/jobs-ops` should not casually share implementation through `shared/` unless the code is intentionally cross-app.
- In `apps/jobs-ops`, keep route-level logic inside `src/features/*`.
- Prefer React Query for backend data and keep shell/UI state in Zustand.
- Use app-local API service modules instead of raw `fetch`.
- Payment in the admissions wizard supports mobile money (primary) and card widget (secondary). Mobile money is initiated via `POST /api/v1/payments/mobile-money/` and polled for completion. The Lenco card widget (`LencoPay.getPaid`) remains available as a fallback. Students may also defer payment and submit without paying upfront. Do not reintroduce the retired pre-Lenco payment UX.
- Student authenticated pages should prefer the canonical UI primitives already in the repo: `PageShell`, `SectionCard`, `ErrorDisplay`, `EmptyState`, and `Button asChild` for semantic links.
- Student forms that can lose work, especially settings and wizard-related screens, should protect dirty state on navigation and `beforeunload`.
- Use speculative prefetching (`src/lib/speculativePrefetch.ts`) for predictive data loading — prefetch catalog data on login success, wizard chunks on dashboard mount.
- Dashboard data freshness is handled by `useStudentDashboardPolling` (React Query with fingerprint deduplication). NotificationBell uses `useNotificationPolling` (React Query with 60-second interval and tab-visibility pause). Do not introduce SSE or WebSocket connections for these surfaces.
- `ErrorDisplay` returns `null` for empty or whitespace-only `message` props. Do not render `role="alert"` elements without meaningful content.
- All content images (campus photos, badges, logos) must use `OptimizedImage` or have an `onError` handler with a visible fallback. Raw `<img>` tags without error handling are not acceptable for content images.
- Font fallback chain in `tailwind.config.js` uses the full Tailwind default sans-serif stack with Inter prepended: `['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', '"Noto Sans"', 'sans-serif']`. Do not reduce this chain.
- Auth form pages (`SignInPage`, `SignUpPage`, `ForgotPasswordPage`, `ResetPasswordPage`) must use proper `autocomplete`, `inputMode`, and `type` attributes on all form fields for browser autofill and mobile keyboard support.
- PWA dependencies (`vite-plugin-pwa`, `workbox-*`) have been fully removed. Service worker unregistration and cache cleanup code has also been removed (no real users had the PWA installed).

### Backend

- Keep new API work inside explicit domain apps under `backend/apps/`.
- Keep routes resource-oriented under `/api/v1/`.
- Preserve explicit jobs-ops domain naming such as `JobApplication`.
- Shared jobs-ops scaffold data currently lives in `backend/apps/common/jobs_ops_seed.py`; do not re-duplicate that seed state across views.
- Current default error-alert recipient is `admin@mihas.edu.zm` (configurable via `ERROR_ALERT_EMAIL` env var). Used for uptime, payment failures, and SLA breach alerts. Error monitoring uses GlitchTip.
- Payment records live in the `payments` table (managed by `backend/apps/documents/`). Application-level payment summaries should be derived from canonical payment records, not from retired inline compatibility columns.
- `.env` and `.env.local` files are gitignored and safe for real credentials during local development. They are never committed to the repository. When the user asks to add real secrets to these files, do so without hesitation — the gitignore is configured correctly.
- Email is sent via Zoho SMTP (smtp.zoho.com:465, TLS). No IMAP integration — the platform only sends outbound email, it does not read inboxes. Resend is configured as a fallback for transactional delivery.

## Lenco Payment Integration

The platform uses Lenco as its payment gateway for application fees. Key components:

| Component | Location | Purpose |
|-----------|----------|---------|
| `PaymentService` | `backend/apps/documents/payment_service.py` | Payment lifecycle: initiate, verify, webhook processing |
| `FeeResolver` | `backend/apps/documents/fee_resolver.py` | Dynamic fee resolution by program + residency |
| `WebhookProcessor` | `backend/apps/documents/webhook_processor.py` | HMAC-SHA512 signature validation + event logging |
| `MobileMoneyInitiateView` | `backend/apps/documents/views.py` | `POST /api/v1/payments/mobile-money/` — initiate mobile money collection via Lenco |
| `ProgramFee` model | `backend/apps/documents/models.py` | Per-program fee configuration (local vs international) |
| `WebhookEventLog` model | `backend/apps/documents/models.py` | Audit trail for all webhook events |
| `PaymentForm` | `apps/admissions/src/components/student/PaymentForm.tsx` | Shared payment form with mobile money + card method selection |
| `useLencoWidget` | `apps/admissions/src/hooks/useLencoWidget.ts` | Dynamic Lenco widget script loading |
| `useFeeResolver` | `apps/admissions/src/hooks/useFeeResolver.ts` | Frontend fee resolution hook |
| `usePaymentStatus` | `apps/admissions/src/hooks/usePaymentStatus.ts` | Payment status polling hook |
| `PaymentStep` | `apps/admissions/src/pages/student/applicationWizard/steps/PaymentStep.tsx` | Wizard payment step: mobile money (primary), card widget (secondary), defer option |

Payment API endpoints:
- `POST /api/v1/payments/initiate/` — create pending payment, returns widget config
- `POST /api/v1/payments/mobile-money/` — initiate mobile money collection via Lenco
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

The platform uses GlitchTip (Sentry-compatible, free tier at app.glitchtip.com) for error tracking. Both frontend and backend report to a single GlitchTip project (22431). The standard Sentry SDK (`sentry-sdk` for Python, `@sentry/react` for React) is used with DSN URLs pointing to GlitchTip.

### Pipeline

1. Backend errors: `sentry-sdk` with `DjangoIntegration` and `CeleryIntegration` automatically captures unhandled exceptions. The `envelope_exception_handler` in `backend/apps/common/exceptions.py` also calls `sentry_sdk.capture_exception()` for 500 responses to ensure all errors reach GlitchTip.
2. Frontend errors: `@sentry/react` captures `window.onerror` and unhandled rejections automatically once initialized via `initErrorReporter()` in `apps/admissions/src/lib/errorReporter.ts`.
3. CSP violations: The `Content-Security-Policy` header in `apps/admissions/vercel.json` includes a `report-uri` directive that sends browser CSP violations directly to GlitchTip.
4. The legacy `POST /api/v1/errors/report/` endpoint still accepts frontend error reports for backwards compatibility, forwarding them to GlitchTip via `sentry_sdk.capture_message()`.

### Key details

- Backend DSN: configured via `GLITCHTIP_DSN` env var. SDK initializes in `backend/config/settings/base.py`.
- Frontend DSN: configured via `VITE_GLITCHTIP_DSN` env var. SDK initializes in `apps/admissions/src/lib/errorReporter.ts`.
- CSP security endpoint: `https://app.glitchtip.com/api/22431/security/?glitchtip_key=8a2c416ba7464b6bb50a194b32b12832`
- The `ErrorLog` model in `backend/apps/common/models.py` is deprecated. The `error_logs` table is preserved for historical records but no longer written to.
- `ERROR_ALERT_EMAIL` is still used for non-error-monitoring alerts (uptime, payment failures, SLA breaches).
- Frontend error reporting endpoint (`/api/v1/errors/report/`) remains unauthenticated (`AllowAny`), CSRF-exempt, and rate-limited.
- Frontend `tracesSampleRate` is set to 0.01 (1%) to conserve GlitchTip disk space.

## Admissions Business Logic Services

The admissions domain uses thin service modules for each business logic domain. Each service follows the same pattern: static methods, custom error class with `code`/`message`, `select_for_update()` locking, and notification helpers.

| Service | Location | Purpose |
|---------|----------|---------|
| `WithdrawalService` | `backend/apps/applications/withdrawal_service.py` | Student-initiated withdrawal with enrollment decrement and waitlist promotion |
| `InterviewService` | `backend/apps/applications/interview_service.py` | Interview scheduling with 48h notice, conflict detection, mode validation |
| `WaitlistManager` | `backend/apps/applications/waitlist_manager.py` | Position assignment, auto-promotion, reindexing, override logging |
| `ConditionManager` | `backend/apps/applications/condition_manager.py` | Conditional admission lifecycle: assign, verify, auto-promote/reject |
| `EnrollmentService` | `backend/apps/applications/enrollment_service.py` | Enrollment confirmation and deadline computation from academic calendar |
| `AmendmentService` | `backend/apps/applications/amendment_service.py` | Student amendment requests with admin approval workflow |
| `CommunicationService` | `backend/apps/common/communication_service.py` | Template-based notifications and emails with `{{variable}}` substitution |
| `FeeWaiverService` | `backend/apps/documents/fee_waiver_service.py` | Fee waiver granting and effective fee computation |

### Extended State Machine

Application statuses now include: `draft`, `submitted`, `under_review`, `waitlisted`, `conditionally_approved`, `approved`, `enrolled`, `rejected`, `withdrawn`, `expired`, `enrollment_expired`. The `ALLOWED_TRANSITIONS` map in `services.py` is the single source of truth. Terminal statuses (no outbound transitions): `rejected`, `withdrawn`, `expired`, `enrolled`, `enrollment_expired`.

### Admissions Business Logic Endpoints

| Method | Path | Permission | Domain |
|--------|------|------------|--------|
| POST | `/api/v1/applications/{id}/withdraw/` | Owner | Withdrawal |
| GET | `/api/v1/applications/{id}/waitlist-position/` | Owner/Admin | Waitlist |
| GET | `/api/v1/applications/{id}/conditions/` | Owner/Admin | Conditions |
| POST | `/api/v1/applications/{id}/conditions/{cid}/verify/` | Admin | Conditions |
| POST | `/api/v1/applications/{id}/confirm-enrollment/` | Owner | Enrollment |
| POST | `/api/v1/applications/{id}/assign/` | SuperAdmin | Reviewer assignment |
| POST | `/api/v1/applications/auto-assign/` | SuperAdmin | Reviewer auto-assign |
| POST | `/api/v1/applications/{id}/fee-waiver/` | SuperAdmin | Fee waivers |
| POST | `/api/v1/applications/{id}/amendments/` | Owner | Amendments |
| POST | `/api/v1/applications/{id}/amendments/{aid}/review/` | Admin | Amendment review |
| GET | `/api/v1/admin/templates/` | Admin | Communication templates |
| PUT | `/api/v1/admin/templates/{key}/` | Admin | Communication templates |

### DuplicateChecker Terminal Statuses

`TERMINAL_STATUSES = {"rejected", "withdrawn", "expired", "enrolled", "enrollment_expired"}` — applications in these statuses do not block new applications for the same program+intake.

### IntakeEnforcer Grace Period

When the intake deadline has passed, `IntakeEnforcer.check_submission()` checks `grace_period_days` on the intake. If within the grace period, returns `IntakeCheckResult(allowed=True, is_late=True)`. The `submit_application()` service then sets `is_late_submission=True` and enforces late fee payment if configured.

### Payment Retry Limits

`PaymentService.initiate_payment()` enforces a maximum of 5 payment attempts per application (excluding expired payments older than 7 days). The `poll_pending_payments_task` expires payments pending > 24 hours. Forward-only transitions include `pending → expired`.

### Batch Operation Safety

`ApplicationBulkStatusView` enforces: max 25 applications per batch, all-or-nothing validation, SHA-256 confirmation token, single transaction, and waitlist promotion on batch rejections.

### Idempotency

State-changing endpoints use the `@idempotent` decorator (`backend/apps/common/idempotency.py`) for replay protection. Command identity is `(idempotency_key, actor, method, path, body_hash)`. Same key + same body returns the cached response. Same key + different body returns 409 Conflict. The `IdempotencyKey` model stores cached responses with TTL-based cleanup. Applied to submission (`POST /api/v1/applications/{id}/submit/`) and other critical write endpoints.

## Celery Beat Periodic Tasks

Celery Beat runs as a dedicated Koyeb worker service (exactly 1 instance to avoid duplicate dispatches). The schedule is defined in `CELERY_BEAT_SCHEDULE` in `backend/config/settings/base.py`:

| Task | Schedule | Purpose |
|------|----------|---------|
| `keep_alive_task` | Every 240 seconds (4 minutes) | Lightweight ping to /health/live/ to prevent Koyeb cold starts |
| `check_uptime_task` | Every 900 seconds (15 minutes) | Internal health check — pings `/health/ready/`, alerts on failure/recovery transitions |
| `cleanup_stale_sessions_task` | Daily at 02:30 UTC | Deactivate expired device sessions |
| `cleanup_audit_logs_task` | Daily at 03:00 UTC | Purge expired audit log records and CSRF tokens: standard retention 90 days, security retention 365 days |
| `cleanup_idempotency_keys` | Daily at 03:00 UTC | Purge expired idempotency key records |
| `poll_pending_payments_task` | Every 600 seconds (10 minutes) | Polls Lenco API for pending payments, expires payments > 24h, max 50 per run |
| `process_pending_emails_task` | Every 120 seconds (2 minutes) | Sweep stale pending EmailQueue rows |
| `intake_manager_task` | Daily at 04:00 UTC | Ensures at least 2 open intakes exist following the Jan/Jul pattern |
| `condition_expiry_task` | Daily at 05:00 UTC | Expires overdue admission conditions, triggers auto-rejection |
| `draft_expiry_reminder_task` | Daily at 06:00 UTC | Reminds students about stale drafts (7+ days), expires drafts at 30 days |
| `review_sla_reminder_task` | Daily at 07:00 UTC | Notifies admins about applications exceeding review SLA threshold |
| `document_verification_sla_task` | Daily at 08:00 UTC | Notifies admins about documents pending verification beyond SLA, escalates at 2x |
| `enrollment_confirmation_expiry_task` | Daily at 09:00 UTC | Expires unconfirmed enrollments, decrements capacity, triggers waitlist promotion |
| `waitlist_cascade_task` | Daily at 10:00 UTC | Cascades waitlisted applications to next intake when current intake closes |
| `deferred_payment_reminder_task` | Daily at 11:00 UTC | Reminds students who deferred payment to complete it |
| `interview_auto_complete_task` | Every 7200 seconds (2 hours) | Auto-completes interviews whose scheduled time has passed |
| `interview_reminder_task` | Every 3600 seconds (1 hour) | Sends reminder notifications for interviews within next 24 hours |

Infrastructure tasks live in `backend/apps/common/tasks.py`. Payment/document tasks in `backend/apps/documents/tasks.py`. Application tasks in `backend/apps/applications/tasks.py`. Intake tasks in `backend/apps/catalog/tasks.py`.

## Uptime Monitoring

Two layers of uptime monitoring are in place:

1. **Internal**: `check_uptime_task` (Celery Beat, every 15 minutes) sends `GET` to the configured `HEALTH_CHECK_URL` (default: `https://api.mihas.edu.zm/health/ready/`) with a 10-second timeout. Tracks previous status in Redis key `uptime:last_status`. On healthy→unhealthy transition: dispatches alert email. On unhealthy→healthy: dispatches recovery email. Repeated failures without recovery do not produce duplicate alerts. Uses the `requests` library.
2. **External**: [UptimeRobot](https://uptimerobot.com/) (free tier) monitors `https://api.mihas.edu.zm/health/ready/` every 5 minutes from outside the network. Sends email alerts to `admin@mihas.edu.zm` on failure and recovery.

## Secrets Rotation

A runbook for rotating production secrets lives at `docs/runbooks/secrets-rotation.md`. It covers JWT signing key, database credentials, Resend API key, S3/R2 keys, and Redis URL rotation with step-by-step procedures and rollback guidance.

## AI-Powered Features

| Feature | Backend | Frontend | Model |
|---------|---------|----------|-------|
| OCR grade extraction | `backend/apps/documents/ocr_service.py` | Education step in wizard | Tesseract via Celery task |
| AI admin review summary | `GET /api/v1/applications/{id}/admin-summary/` | Admin review panel | `gpt-4o-mini` via `AI_GATEWAY_API_KEY` |
| AI preview summary | Review step in wizard | Personalized application summary | `gpt-4o-mini` |

- AI features use `AI_GATEWAY_API_KEY` (not `OPENAI_API_KEY`) for the Vercel AI Gateway.
- The gateway supports multiple model tiers configured in `base.py`: `AI_MODEL_FAST` (gemini-2.5-flash), `AI_MODEL_VISION` (gemini-2.5-flash), `AI_MODEL_ANALYSIS` (gpt-4o-mini), `AI_MODEL_SMART` (deepseek-v3).
- OCR never overwrites manually entered grades. Timeout is 30 seconds.
- AI admin summary is cached and rate-limited. Falls back gracefully when the API key is missing.

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
- When modifying `ErrorDisplay`, `Settings.tsx`, `useSessionListener.ts`, `session_views.py`, `RefreshView`, or `ApplicationTrackView`, re-run the corresponding audit production fix tests to verify no regressions.
- Backend endpoints that return lists must use the `{"success": true, "data": [...]}` envelope format. Do not return raw lists from authenticated endpoints.

## Security Hardening (April 2026 Audit)

The following security measures were applied during the April 2026 full repository audit:

- Admin privilege escalation blocked: admins cannot assign roles higher than their own, and cannot modify users with higher roles. Self-deactivation is prevented.
- Batch user import now creates an `AuditLog` entry with `action=user_batch_import` for every batch operation. Per-row savepoints handle `IntegrityError` races without discarding the entire batch. Role-level validation prevents creating users with roles above the actor's own.
- Bulk notification retry no longer re-sends emails for already-processed notifications. The task retries with only the remaining unprocessed IDs.
- `ApplicationReviewView` payment gate now checks the full `_RESOLVED_PAYMENT_STATUSES` tuple (including `verified`, `paid`, `deferred`) instead of a subset.
- Tracked `.env.development` and `.env.production` placeholder files removed from the repository. Only `.env.example` and `.env.scripts.example` remain as tracked templates. Real env files (`.env`, `.env.local`, `.env.vercel.*`) are gitignored.

### Known Open Issues (from AUDIT-REPORT-2026-04-24.md)

These findings are documented but not yet fixed:

- `cleanup-idempotency-keys` Celery Beat task uses a bare task name instead of a dotted module path.
- `SessionView.get()` returns non-envelope format for unauthenticated users.
- Several catalog, analytics, and integrations views return raw data without the `{"success": true, "data": ...}` envelope.
- `PaymentVerifyView` and `PaymentInitiateView` lack per-user rate limiting.
- `IsAuthenticatedOrDebug` permission class bypasses auth when `DEBUG=True`.
- `AuditMiddleware` does not populate `entity_id` from URL path segments.
- `ReadOnlyMiddleware` queries the database on every write request when the env var is not set.
- Jobs-ops frontend has no auth refresh interceptor or session management.
- 7 SQL scripts in `backend/scripts/` are fully applied and stale (safe to archive).
- `idempotency_redesign.sql` contains a `DROP TABLE` without a re-run guard.

See `AUDIT-REPORT-2026-04-24.md` and `all-files.txt` for the full file-by-file audit inventory.
