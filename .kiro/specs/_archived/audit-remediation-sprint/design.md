# Design Document: Audit Remediation Sprint

## Overview

Surgical fixes for 15 findings from the comprehensive system audit. Organized into 3 tiers: quick wins (7 items, < 1 hour each), medium effort (6 items, 1-3 hours each), and infrastructure/docs (2 items). No new features — all changes fix identified security, reliability, or quality gaps.

## Architecture

No architectural changes. All fixes are within existing layers:
- Backend middleware (`CSRFEnforcementMiddleware`, `RateLimitMiddleware`)
- Backend views (`RefreshView`, `LogoutView`, `ApplicationReviewView`)
- Backend settings (`base.py`)
- Backend tasks (`cleanup_audit_logs_task`)
- Frontend error reporter (`errorReporter.ts`)
- Neon Postgres (pg_stat_statements extension)

## Components and Changes

### 1. CSRF Middleware Hardening (P1-SEC-018, P1-SEC-019, P1-SEC-020)

File: `backend/apps/common/middleware.py`, `CSRFEnforcementMiddleware`

Changes:
- Add `re.compile(r"^/api/v1/auth/password-reset/confirm/?$")` to `EXEMPT_PATTERNS`
- Change query from `CSRFToken.objects.filter(token_hash=token_hash).exists()` to `CSRFToken.objects.filter(token_hash=token_hash, expires_at__gt=tz.now(), user_id=user_id).exists()`
- Add guard: if user is not authenticated, return 403

### 2. CSRF Token Lifecycle (P1-SEC-009, P1-SEC-021, cleanup)

Files: `backend/apps/accounts/views.py`, `backend/apps/common/tasks.py`

Changes:
- `RefreshView.post()`: Add `csrf_token = _generate_csrf_token(user)` and `response["X-CSRF-Token"] = csrf_token` after `_set_auth_cookies()`
- `LogoutView.post()`: Add `CSRFToken.objects.filter(user=request.user).delete()` before clearing cookies
- `cleanup_audit_logs_task`: Add `CSRFToken.objects.filter(expires_at__lt=tz.now()).delete()` to the cleanup logic

### 3. Rate Limiting Expansion (P1-SEC-013, P1-SEC-014, P1-SEC-012)

Files: `backend/apps/common/middleware.py`, `backend/config/settings/base.py`

Changes:
- Add `RATELIMIT_FAIL_OPEN = True` to `base.py`
- Wrap `is_ratelimited()` call in `RateLimitMiddleware.__call__()` with try/except
- Add stricter auth sub-scopes before the general `/api/v1/auth/` entry:
  - `("/api/v1/auth/login/", "10/5m")`
  - `("/api/v1/auth/register/", "5/5m")`
  - `("/api/v1/auth/password-reset/", "5/5m")`
- Add high-risk endpoint scopes:
  - `("/api/v1/outreach/", "30/10m")`
  - `("/api/v1/email/", "30/10m")`
  - `("/api/v1/integrations/", "20/10m")`
  - `("/api/v1/payments/", "20/10m")`
- Add catch-all: `("/api/v1/", "120/10m")` at the end of `SCOPE_LIMITS`

### 4. Frontend Error Reporter Fix (P1-SEC-023, P1-SEC-024)

File: `apps/admissions/src/lib/errorReporter.ts`

Changes:
- Replace `const REPORT_URL = '/api/v1/errors/report/'` with `const REPORT_URL = \`${import.meta.env.VITE_API_BASE_URL?.trim() || ''}/api/v1/errors/report/\``
- Change opt-in guard from `if (import.meta.env.VITE_ERROR_REPORT_ENABLED !== 'true') return` to `if (import.meta.env.VITE_ERROR_REPORT_ENABLED === 'false') return`

### 5. Input Validation (P1-SEC-027)

File: `backend/apps/applications/serializers.py`, `backend/apps/applications/views.py`

Changes:
- Create `PaymentStatusUpdateSerializer` with `payment_status` (ChoiceField) and `notes` (CharField)
- Update `ApplicationReviewView.post()` payment status branch to use the serializer

### 6. Query Optimization (P3-DB-001)

Files: `backend/apps/applications/views.py`, `backend/apps/documents/views.py`

Changes:
- Add `select_related('user')` to application querysets in list/detail views
- Add `select_related('application')` to document querysets

### 7. Database Extension (pg_stat_statements)

Via Neon MCP: `CREATE EXTENSION IF NOT EXISTS pg_stat_statements`

### 8. Documentation Comments (P1-SEC-005, P1-SEC-010)

File: `backend/config/settings/base.py`

Changes:
- Add comment next to `AUTH_COOKIE_SAMESITE = "Lax"` explaining prod override
- Add comment next to `ROTATE_REFRESH_TOKENS` / `BLACKLIST_AFTER_ROTATION` explaining declarative-only nature

## Correctness Properties

Property 1: CSRF middleware rejects expired tokens
- For any CSRFToken with `expires_at < now()`, the middleware SHALL reject the request with 403

Property 2: CSRF middleware validates user binding
- For any request where `token.user_id != request.user.pk`, the middleware SHALL reject with 403

Property 3: Rate limiter fails open on Redis outage
- When Redis is unavailable, no endpoint SHALL return 429

Property 4: All /api/v1/ endpoints have rate limiting
- For any request to `/api/v1/*`, at least one rate limit scope SHALL match

Property 5: Error reporter URL resolves to API backend
- The error report URL SHALL start with the API base URL, not a relative path

## Testing Strategy

- Backend: Run `cd backend && python3 -m pytest` after all changes
- Frontend: Run `cd apps/admissions && bun run test` after error reporter changes
- Type-check: Run `cd apps/admissions && bun run type-check`
- Lint: Run `cd apps/admissions && bun run lint`
