# Implementation Plan: Audit Remediation Sprint

## Overview

Surgical fixes for 15 audit findings. Organized by priority: quick wins first, then medium effort, then infrastructure/docs.

## Tasks

### Quick Wins (< 1 hour each)

- [ ] 1. Fix CSRF password-reset/confirm exempt pattern (P1-SEC-020)
  - Add `re.compile(r"^/api/v1/auth/password-reset/confirm/?$")` to `EXEMPT_PATTERNS` in `CSRFEnforcementMiddleware` in `backend/apps/common/middleware.py`
  - _Requirements: 1.1, 2.1_

- [ ] 2. Add CSRF token expiry check (P1-SEC-018)
  - Change CSRF middleware query from `CSRFToken.objects.filter(token_hash=token_hash).exists()` to `CSRFToken.objects.filter(token_hash=token_hash, expires_at__gt=tz.now()).exists()`
  - Add `from django.utils import timezone as tz` import
  - _Requirements: 1.2, 2.2_

- [ ] 3. Add CSRF user binding (P1-SEC-019)
  - Add user authentication guard before CSRF validation: if user not authenticated on state-changing request, return 403
  - Add `user_id=user_id` to the CSRF token query filter
  - Extract `user_id` from `request.user.pk` or `request.user.id`
  - _Requirements: 1.7, 2.7_

- [ ] 4. Set RATELIMIT_FAIL_OPEN and add try/except (P1-SEC-014)
  - Add `RATELIMIT_FAIL_OPEN = True` to `backend/config/settings/base.py`
  - Wrap `is_ratelimited()` call in `RateLimitMiddleware.__call__()` with try/except that logs warning and sets `limited = False`
  - _Requirements: 1.3, 2.3_

- [ ] 5. Fix frontend error reporter URL (P1-SEC-023)
  - In `apps/admissions/src/lib/errorReporter.ts`, change `const REPORT_URL = '/api/v1/errors/report/'` to use `VITE_API_BASE_URL`
  - Change to: `const API_BASE = import.meta.env.VITE_API_BASE_URL?.trim() || ''` and `const REPORT_URL = \`${API_BASE}/api/v1/errors/report/\``
  - _Requirements: 1.5, 2.5_

- [ ] 6. Change error reporter to opt-out default (P1-SEC-024)
  - In `apps/admissions/src/lib/errorReporter.ts`, change `if (import.meta.env.VITE_ERROR_REPORT_ENABLED !== 'true') return` to `if (import.meta.env.VITE_ERROR_REPORT_ENABLED === 'false') return`
  - _Requirements: 1.8, 2.8_

- [ ] 7. Add CSRF token generation to RefreshView (P1-SEC-009)
  - In `backend/apps/accounts/views.py`, `RefreshView.post()`, after `_set_auth_cookies()`:
    - Add `csrf_token = _generate_csrf_token(user)`
    - Add `response["X-CSRF-Token"] = csrf_token`
  - _Requirements: 1.6, 2.6_

- [ ] 8. Quick wins checkpoint
  - Run `cd backend && python3 -m pytest tests/property/test_middleware_properties.py tests/property/test_jwt_middleware.py -v`
  - Run `cd apps/admissions && bun run type-check`
  - Ensure all tests pass, ask the user if questions arise.

### Medium Effort (1-3 hours each)

- [ ] 9. Expand rate limiting scopes (P1-SEC-013, P1-SEC-012)
  - In `RateLimitMiddleware.SCOPE_LIMITS` in `backend/apps/common/middleware.py`:
    - Add before `/api/v1/auth/`: `("/api/v1/auth/login/", "10/5m")`, `("/api/v1/auth/register/", "5/5m")`, `("/api/v1/auth/password-reset/", "5/5m")`
    - Add after existing scopes: `("/api/v1/outreach/", "30/10m")`, `("/api/v1/email/", "30/10m")`, `("/api/v1/integrations/", "20/10m")`, `("/api/v1/payments/", "20/10m")`
    - Add catch-all at end: `("/api/v1/", "120/10m")`
  - Update the rate limit scope test in `backend/tests/property/test_middleware_properties.py` to include new scopes
  - _Requirements: 1.4, 1.9, 2.4, 2.9_

- [ ] 10. Add CSRF cleanup to logout and periodic task (P1-SEC-021, cleanup)
  - In `backend/apps/accounts/views.py`, `LogoutView.post()`: add `CSRFToken.objects.filter(user=request.user).delete()` before clearing cookies
  - In `backend/apps/common/tasks.py`, `cleanup_audit_logs_task`: add `CSRFToken.objects.filter(expires_at__lt=tz.now()).delete()`
  - _Requirements: 1.12, 1.13, 2.12, 2.13_

- [ ] 11. Add PaymentStatusUpdateSerializer (P1-SEC-027)
  - Create `PaymentStatusUpdateSerializer` in `backend/apps/applications/serializers.py`
  - Update `ApplicationReviewView.post()` payment status branch to use the serializer
  - _Requirements: 1.10, 2.10_

- [ ] 12. Add select_related to key querysets (P3-DB-001)
  - In `backend/apps/applications/views.py`: add `.select_related('user')` to application list/detail querysets
  - In `backend/apps/documents/views.py`: add `.select_related('application')` to document querysets where applicable
  - _Requirements: 1.11, 2.11_

- [ ] 13. Medium effort checkpoint
  - Run `cd backend && python3 -m pytest -v`
  - Run `cd apps/admissions && bun run test`
  - Run `cd apps/admissions && bun run type-check`
  - Run `cd apps/admissions && bun run lint`
  - Ensure all tests pass, ask the user if questions arise.

### Infrastructure & Documentation

- [ ] 14. Install pg_stat_statements on Neon
  - Use Neon MCP to run: `CREATE EXTENSION IF NOT EXISTS pg_stat_statements`
  - Project ID: `wild-bar-37055823`
  - _Requirements: 1.14, 2.14_

- [ ] 15. Add documentation comments to base.py (P1-SEC-005, P1-SEC-010)
  - Add comment next to `AUTH_COOKIE_SAMESITE = "Lax"`: `# Production overrides to "None" in prod.py for cross-origin cookie support (api.mihas.edu.zm → apply.mihas.edu.zm)`
  - Add comment next to `ROTATE_REFRESH_TOKENS` and `BLACKLIST_AFTER_ROTATION`: `# Declarative only — actual rotation/blacklisting logic is in backend/apps/accounts/tokens.py`
  - _Requirements: 1.15, 2.15_

- [ ] 16. Final checkpoint
  - Run full backend test suite: `cd backend && python3 -m pytest`
  - Run full admissions test suite: `cd apps/admissions && bun run test`
  - Run type-check: `cd apps/admissions && bun run type-check`
  - Run lint: `cd apps/admissions && bun run lint`
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 3.11_

## Notes

- Tasks 1-7 are quick wins that can each be done in under 15 minutes
- Task 9 (rate limiting expansion) is the most complex medium-effort item
- Task 14 (pg_stat_statements) requires Neon MCP access
- All changes are backward-compatible — no API contract changes
- The CSRF middleware changes (tasks 1-3) should be applied together as they modify the same code path
