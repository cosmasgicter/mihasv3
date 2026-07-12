# Bugfix Requirements Document

## Introduction

This spec remediates 15 open findings from the comprehensive system audit (`.kiro/specs/comprehensive-system-audit/findings.md`). It covers the 7 quick wins (< 1 hour each) plus 8 medium-effort items. Large-effort items (P2-PERF-001 bundle size optimization, P2-JOPS-001/P4-TEST-002 jobs-ops test coverage, P5-DOCS-001 docs cleanup) are deferred to separate specs.

**Scope:** Security hardening (CSRF, rate limiting, error reporting), input validation, query optimization, and documentation improvements.

**Findings addressed:** P1-SEC-020, P1-SEC-018, P1-SEC-014, P1-SEC-013, P1-SEC-023, P1-SEC-009, P1-SEC-019, P1-SEC-024, P1-SEC-012, P1-SEC-027, P3-DB-001, P1-SEC-021 (logout cleanup), plus pg_stat_statements installation and documentation comments for P1-SEC-005 and P1-SEC-010.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user submits `POST /api/v1/auth/password-reset/confirm/` (unauthenticated, no CSRF token) THEN the system rejects the request with HTTP 403 because the endpoint is not in the CSRF exempt patterns, making password reset non-functional (P1-SEC-020)

1.2 WHEN the CSRF middleware validates a token THEN the system accepts any `CSRFToken` row matching the hash regardless of `expires_at`, meaning expired CSRF tokens are valid indefinitely (P1-SEC-018)

1.3 WHEN Redis is unavailable THEN the `django-ratelimit` library defaults to fail-closed (`RATELIMIT_FAIL_OPEN` not set), blocking all rate-limited endpoints with HTTP 429 and causing a full outage of auth, error reporting, admin, documents, sessions, and notifications (P1-SEC-014)

1.4 WHEN requests are sent to 13 API endpoint groups (`/api/v1/applications/`, `/api/v1/catalog/`, `/api/v1/jobs/`, `/api/v1/job-applications/`, `/api/v1/outreach/`, `/api/v1/automation/`, `/api/v1/integrations/`, `/api/v1/analytics/`, `/api/v1/reports/`, `/api/v1/payments/`, `/api/v1/events/`, `/api/v1/email/`, `/api/v1/meta/`) THEN the system applies no rate limiting, allowing unlimited request volume from a single IP (P1-SEC-013)

1.5 WHEN the frontend error reporter (`errorReporter.ts`) sends error reports in production THEN the system POSTs to the relative URL `/api/v1/errors/report/` which resolves to the Vercel static site (`apply.mihas.edu.zm`) instead of the Django backend (`api.mihas.edu.zm`), so errors never reach the backend (P1-SEC-023)

1.6 WHEN `RefreshView.post()` rotates auth tokens THEN the system does not generate or return a new CSRF token in the `X-CSRF-Token` response header, causing the CSRF token to expire after 24 hours while the refresh token remains valid for 7 days (P1-SEC-009)

1.7 WHEN the CSRF middleware validates a token THEN the system checks only `token_hash` without verifying the `user` FK, meaning any valid CSRF token from any user is accepted for any authenticated request (P1-SEC-019)

1.8 WHEN `VITE_ERROR_REPORT_ENABLED` is not set in the environment THEN the frontend error reporter is silently disabled because the default is opt-in (`!== 'true'`), and the variable is not configured in any `.env` file (P1-SEC-024)

1.9 WHEN requests are sent to `/api/v1/auth/login/`, `/api/v1/auth/register/`, or `/api/v1/auth/password-reset/` THEN the system applies the same 60/5m rate limit as general auth operations (session, refresh, logout), providing insufficient protection against brute-force and credential-stuffing attacks (P1-SEC-012)

1.10 WHEN `ApplicationReviewView.post()` receives a payment status update THEN the system reads `paymentStatus`, `payment_status`, `verificationNotes`, and `notes` directly from `request.data` without serializer validation, bypassing input validation for the payment status update flow (P1-SEC-027)

1.11 WHEN views access ForeignKey fields in serializers THEN the system issues separate SQL queries for each related object because only 4 of 46 FK/M2M relationships use `select_related`, creating N+1 query patterns in application, document, and audit views (P3-DB-001)

1.12 WHEN expired `CSRFToken` rows accumulate in the database (40 tokens found, 38 expired) THEN the system never cleans them up because no periodic task or signal deletes expired rows (P1-SEC-018 related)

1.13 WHEN a user logs out via `LogoutView.post()` THEN the system does not delete the user's `CSRFToken` rows, leaving stale tokens in the database that remain valid until manually deleted (P1-SEC-021)

1.14 WHEN slow queries occur in production THEN the system cannot identify or monitor them because the `pg_stat_statements` extension is not installed on the Neon Postgres instance (database finding)

1.15 WHEN a developer reads `AUTH_COOKIE_SAMESITE = "Lax"` in `base.py` or `ROTATE_REFRESH_TOKENS = True` / `BLACKLIST_AFTER_ROTATION = True` in `SIMPLE_JWT` THEN the system provides no documentation explaining that production overrides SameSite to `None` (P1-SEC-005) or that these SIMPLE_JWT settings are declarative-only and the actual logic lives in `tokens.py` (P1-SEC-010)

### Expected Behavior (Correct)

2.1 WHEN a user submits `POST /api/v1/auth/password-reset/confirm/` THEN the system SHALL exempt this endpoint from CSRF validation (matching the pattern `^/api/v1/auth/password-reset/confirm/?$`) and process the password reset normally (P1-SEC-020)

2.2 WHEN the CSRF middleware validates a token THEN the system SHALL query `CSRFToken.objects.filter(token_hash=token_hash, expires_at__gt=tz.now())` to reject expired tokens (P1-SEC-018)

2.3 WHEN Redis is unavailable THEN the system SHALL degrade gracefully by setting `RATELIMIT_FAIL_OPEN = True` in `base.py` and wrapping `is_ratelimited()` in a try/except that fails open with a warning log (P1-SEC-014)

2.4 WHEN requests are sent to any `/api/v1/` endpoint not covered by a specific rate limit scope THEN the system SHALL apply rate limiting via specific scopes for high-risk endpoints (`/api/v1/outreach/` 30/10m, `/api/v1/email/` 30/10m, `/api/v1/integrations/` 20/10m, `/api/v1/payments/` 20/10m) and a catch-all `/api/v1/` scope at 120/10m (P1-SEC-013)

2.5 WHEN the frontend error reporter sends error reports THEN the system SHALL construct the URL using `VITE_API_BASE_URL` (e.g., `${import.meta.env.VITE_API_BASE_URL}/api/v1/errors/report/`) so reports reach the Django backend in production (P1-SEC-023)

2.6 WHEN `RefreshView.post()` rotates auth tokens THEN the system SHALL generate a new CSRF token via `_generate_csrf_token(user)` and return it in the `X-CSRF-Token` response header (P1-SEC-009)

2.7 WHEN the CSRF middleware validates a token THEN the system SHALL verify the token belongs to the requesting user by adding `user_id=request.user.pk` to the query filter, with a guard that returns 403 if the user is not authenticated (P1-SEC-019)

2.8 WHEN `VITE_ERROR_REPORT_ENABLED` is not set THEN the system SHALL default to enabled (opt-out) by changing the guard to `if (import.meta.env.VITE_ERROR_REPORT_ENABLED === 'false') return` (P1-SEC-024)

2.9 WHEN requests are sent to `/api/v1/auth/login/` THEN the system SHALL apply a stricter rate limit of 10/5m; `/api/v1/auth/register/` SHALL use 5/5m; `/api/v1/auth/password-reset/` SHALL use 5/5m; these specific scopes SHALL be matched before the general `/api/v1/auth/` 60/5m scope (P1-SEC-012)

2.10 WHEN `ApplicationReviewView.post()` receives a payment status update THEN the system SHALL validate the input through a `PaymentStatusUpdateSerializer` with a `ChoiceField` for `payment_status` and a `CharField(max_length=1000)` for notes before saving (P1-SEC-027)

2.11 WHEN views query models with ForeignKey fields that are accessed in serializers THEN the system SHALL use `select_related` on key querysets (application → user, application → program, document → application) to eliminate N+1 queries (P3-DB-001)

2.12 WHEN `cleanup_audit_logs_task` runs daily at 03:00 UTC THEN the system SHALL also delete expired `CSRFToken` rows via `CSRFToken.objects.filter(expires_at__lt=tz.now()).delete()` (P1-SEC-018 related)

2.13 WHEN a user logs out via `LogoutView.post()` THEN the system SHALL delete all `CSRFToken` rows for that user before clearing cookies (P1-SEC-021)

2.14 WHEN the Neon Postgres instance is configured THEN the system SHALL have `pg_stat_statements` enabled via `CREATE EXTENSION IF NOT EXISTS pg_stat_statements` for slow query monitoring (database finding)

2.15 WHEN a developer reads `base.py` THEN the system SHALL include documentation comments explaining: (a) `AUTH_COOKIE_SAMESITE = "Lax"` is overridden to `None` in `prod.py` for cross-origin cookie support, and (b) `ROTATE_REFRESH_TOKENS` and `BLACKLIST_AFTER_ROTATION` are declarative-only settings with actual logic in `backend/apps/accounts/tokens.py` (P1-SEC-005, P1-SEC-010)

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user submits `POST /api/v1/auth/login/` or `POST /api/v1/auth/register/` or `POST /api/v1/auth/password-reset/` THEN the system SHALL CONTINUE TO exempt these endpoints from CSRF validation

3.2 WHEN a valid, non-expired CSRF token is submitted by the correct user on a state-changing request THEN the system SHALL CONTINUE TO accept the request and return a successful response

3.3 WHEN Redis is available THEN the system SHALL CONTINUE TO enforce rate limits normally with correct 429 responses and Retry-After headers

3.4 WHEN requests are sent to the 6 existing rate-limited scopes (`/api/v1/auth/`, `/api/v1/admin/`, `/api/v1/documents/`, `/api/v1/sessions/`, `/api/v1/notifications/`, `/api/v1/errors/`) THEN the system SHALL CONTINUE TO apply their existing rate limits

3.5 WHEN the frontend error reporter is explicitly disabled via `VITE_ERROR_REPORT_ENABLED=false` THEN the system SHALL CONTINUE TO not send error reports

3.6 WHEN `LoginView.post()` authenticates a user THEN the system SHALL CONTINUE TO generate and return a CSRF token in the `X-CSRF-Token` response header

3.7 WHEN GET, HEAD, or OPTIONS requests are made THEN the system SHALL CONTINUE TO bypass CSRF validation entirely

3.8 WHEN `ApplicationReviewView.post()` receives a non-payment review action THEN the system SHALL CONTINUE TO process it through the existing `ApplicationReviewSerializer` path

3.9 WHEN health check endpoints (`/health/live/`, `/health/ready/`) are accessed THEN the system SHALL CONTINUE TO respond without rate limiting, authentication, or CSRF checks

3.10 WHEN `cleanup_audit_logs_task` runs THEN the system SHALL CONTINUE TO purge expired audit log records with standard retention 90 days and security retention 365 days

3.11 WHEN the existing 47 backend test files and 222 admissions frontend test files are run THEN the system SHALL CONTINUE TO pass with zero failures
