# Implementation Plan: CTO Assessment Remediation

## Overview

Implements eight remediation items from the CTO Assessment (March 30, 2026), ordered by priority: P0 (JWT middleware, email wiring, error monitoring), P1 (scaling, uptime monitoring, secrets runbook, audit cleanup), P2 (bcrypt re-hash coverage). Each task builds incrementally on previous work, with checkpoints after each priority tier.

## Tasks

- [x] 1. P0: Complete JWT Authentication Middleware
  - [x] 1.1 Implement JWTAuthenticationMiddleware token extraction and validation
    - Replace the pass-through stub in `backend/apps/common/middleware.py` class `JWTAuthenticationMiddleware` (lines ~156-168)
    - Add `_extract_token(request)` method: check `access_token` cookie first, then `Authorization: Bearer` header fallback
    - Add `_authenticate(token)` method: lazy-load signing key and algorithm from `settings.SIMPLE_JWT`, decode with PyJWT, validate `token_type == 'access'` and `user_id` is present and non-empty
    - Reuse `JWTUser` from `backend/apps/accounts/authentication.py` to construct the user object
    - On any failure (expired, malformed, invalid signature, wrong type, missing user_id): pass through silently, log warning, do not set `request.user`
    - No database queries — purely stateless JWT validation
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

  - [x] 1.2 Write property tests for JWT middleware
    - **Property 1: Valid JWT produces authenticated request.user**
    - Create `backend/tests/property/test_jwt_middleware.py`
    - Use Hypothesis to generate random JWT payloads with valid claims (`user_id`, `email`, `role`, `token_type=access`), encode with test signing key, verify `request.user` matches for both cookie and Bearer header paths
    - **Validates: Requirements 1.1, 1.2**

  - [x] 1.3 Write property test for invalid JWT handling
    - **Property 2: Invalid JWT does not set request.user**
    - In `backend/tests/property/test_jwt_middleware.py`, generate expired tokens, wrong-key tokens, malformed strings, tokens with `token_type != 'access'`, and tokens with missing/empty `user_id`
    - Verify `request.user` is not set to an authenticated user in all cases
    - **Validates: Requirements 1.3, 1.4, 1.6, 1.7**

  - [x] 1.4 Write unit tests for JWT middleware edge cases
    - Create `backend/tests/unit/test_jwt_middleware.py`
    - Test: no-token request passes through as anonymous
    - Test: cookie takes precedence over Bearer header when both present
    - Test: middleware does not make database queries (mock DB, assert no calls)
    - _Requirements: 1.5, 1.9, 1.10_

- [x] 2. P0: Wire Remaining Email Celery Tasks
  - [x] 2.1 Wire lockout email in send_lockout_email()
    - Modify `backend/apps/accounts/services.py` function `send_lockout_email` (line ~197)
    - Replace the TODO/placeholder with: create an `EmailQueue` record with lockout notification body, then call `send_email_task.delay(str(email_queue_id))`
    - Wrap in try/except: log error on failure, never raise to caller
    - Email body should inform the user their account has been temporarily locked due to repeated failed login attempts
    - _Requirements: 2.2, 2.3, 2.4, 2.6_

  - [x] 2.2 Wire password reset email in PasswordResetRequestView
    - Modify `backend/apps/accounts/views.py` class `PasswordResetRequestView.post()` (line ~621, the `# TODO: send_email_task.delay(...)` comment)
    - Replace the TODO with: create an `EmailQueue` record with reset link (`https://apply.mihas.edu.zm/auth/reset-password?token={raw_token}`), then call `send_email_task.delay(str(email_queue_id))`
    - Wrap in try/except: log error on failure, never raise to caller
    - _Requirements: 2.1, 2.3, 2.4, 2.5_

  - [x] 2.3 Write property tests for email dispatch
    - **Property 3: Email dispatch creates EmailQueue record before task dispatch**
    - Create `backend/tests/property/test_email_dispatch.py`
    - Generate random email parameters, call dispatch helper, verify EmailQueue record exists with `status='pending'`, non-empty `recipient_email`, `subject`, and `body`
    - **Validates: Requirements 2.3**

  - [x] 2.4 Write property test for password reset email content
    - **Property 4: Password reset email contains token and base URL**
    - In `backend/tests/property/test_email_dispatch.py`, generate random tokens, create reset email body, verify both the raw token string and `https://apply.mihas.edu.zm` are present
    - **Validates: Requirements 2.5**

  - [x] 2.5 Write unit tests for email wiring
    - Create `backend/tests/unit/test_email_wiring.py`
    - Test: password reset request dispatches email task (mock `send_email_task.delay`)
    - Test: lockout triggers email task (mock `send_email_task.delay`)
    - Test: EmailQueue creation failure does not raise to caller
    - Test: lockout email body contains lockout message
    - _Requirements: 2.1, 2.2, 2.4, 2.6_

- [x] 3. P0: Add Error Monitoring (Free, Self-Hosted)
  - [x] 3.1 Create ErrorLog model and SQL migration script
    - Add `ErrorLog` model to `backend/apps/common/models.py` with `managed = False`, fields: `id` (UUID), `source`, `level`, `message`, `stack_trace`, `context` (JSONField), `request_path`, `user_id`, `ip_hash`, `created_at`
    - Create SQL migration script at `backend/scripts/create_error_logs_table.sql` with the `error_logs` table DDL and indexes (`idx_error_logs_created_at`, `idx_error_logs_source_level`)
    - _Requirements: 3.1_

  - [x] 3.2 Extend DRF exception handler for error logging
    - Modify `backend/apps/common/exceptions.py` function `envelope_exception_handler`
    - After building the error response, if status is 500: create an `ErrorLog` record with `source='backend'`, `level='error'`, and the exception message
    - Dispatch throttled alert email via `send_email_task.delay()` (throttle check via Redis key `error_alert:{sha256(message)[:16]}` with 15-min TTL)
    - Wrap ErrorLog creation in try/except to never break the original error response
    - _Requirements: 3.2, 3.3, 3.11_

  - [x] 3.3 Create error report endpoint and URL wiring
    - Create `backend/apps/common/error_views.py` with `ErrorReportView` (POST `/api/v1/errors/report/`)
    - Accept: `{ message, stack_trace?, context?, url?, user_agent? }`, permission `AllowAny`, no authentication classes
    - Hash client IP with SHA-256 before storing in `ErrorLog` with `source='frontend'`
    - Dispatch throttled alert email for `level='error'`
    - Create `backend/apps/common/error_urls.py` with URL pattern
    - Register in `backend/config/urls.py`: `path("api/v1/errors/", include("apps.common.error_urls"))`
    - Add CSRF exemption: add `re.compile(r"^/api/v1/errors/report/?$")` to `CSRFEnforcementMiddleware.EXEMPT_PATTERNS` in `backend/apps/common/middleware.py`
    - Add rate limit: add `("/api/v1/errors/", "10/5m")` to `RateLimitMiddleware.SCOPE_LIMITS` in `backend/apps/common/middleware.py`
    - _Requirements: 3.4, 3.5, 3.6, 3.11_

  - [x] 3.4 Add configuration for error alert email
    - Add `ERROR_ALERT_EMAIL` setting to `backend/config/settings/base.py` reading from env var with default `ops@mihas.edu.zm`
    - Add `ERROR_ALERT_EMAIL` to `backend/.env.example` with comment
    - Add `VITE_ERROR_REPORT_ENABLED=true` to `apps/admissions/.env.example`
    - Document `ERROR_ALERT_EMAIL` in `backend/DEPLOY.md` environment variables table
    - _Requirements: 3.12_

  - [x] 3.5 Create frontend error reporter
    - Create `apps/admissions/src/lib/errorReporter.ts`
    - Register `window.onerror` and `window.addEventListener('unhandledrejection', ...)` handlers
    - Batch errors with 5-second debounce timer
    - POST to `/api/v1/errors/report/` via `fetch` (not `apiClient`, since errors can happen before auth is initialized)
    - Include current page URL (`window.location.href`), user agent (`navigator.userAgent`), and app version (`import.meta.env.VITE_APP_VERSION`)
    - On POST failure: `console.error()`, no retry
    - Export `initErrorReporter()` function
    - Initialize in `apps/admissions/src/main.tsx` by calling `initErrorReporter()`
    - _Requirements: 3.7, 3.8, 3.9, 3.10_

  - [x] 3.6 Write property tests for error monitoring
    - **Property 5: Unhandled DRF exceptions produce ErrorLog records**
    - Create `backend/tests/property/test_error_monitoring.py`
    - Generate random exception types and messages, invoke exception handler, verify ErrorLog record with `source='backend'`, `level='error'`, non-empty `message`
    - **Validates: Requirements 3.2**

  - [x] 3.7 Write property test for alert throttling
    - **Property 6: Error-level ErrorLog triggers throttled alert email**
    - In `backend/tests/property/test_error_monitoring.py`, generate sequences of error messages, verify alert dispatch follows throttle rules (1 per unique message per 15 min)
    - **Validates: Requirements 3.3, 3.11**

  - [x] 3.8 Write property test for IP hashing
    - **Property 7: Frontend error reports hash client IP**
    - In `backend/tests/property/test_error_monitoring.py`, generate random IP addresses, submit error reports, verify stored `ip_hash` equals SHA-256 of IP and raw IP does not appear in record
    - **Validates: Requirements 3.6**

  - [x] 3.9 Write frontend property test for error batching
    - **Property 8: Frontend error reporter batches and includes metadata**
    - Create `apps/admissions/tests/property/errorReporter.property.test.ts`
    - Use fast-check to generate random error events within a 5-second window, verify single POST with all errors and required metadata (URL, user agent, app version)
    - **Validates: Requirements 3.8, 3.9**

  - [x] 3.10 Write unit tests for error monitoring
    - Create `backend/tests/unit/test_error_monitoring.py`
    - Test: `POST /api/v1/errors/report/` returns 200 for valid payload
    - Test: `POST /api/v1/errors/report/` returns 400 for missing `message` field
    - Test: error report endpoint works for unauthenticated requests
    - _Requirements: 3.4, 3.5_

- [x] 4. P0 Checkpoint
  - Ensure all tests pass, ask the user if questions arise.
  - Verify JWT middleware correctly authenticates requests with valid tokens
  - Verify email tasks are dispatched for password reset and lockout flows
  - Verify error reports are stored and alert emails are throttled

- [x] 5. P1: Scale Backend Concurrency
  - [x] 5.1 Update WEB_CONCURRENCY and deployment documentation
    - Change `WEB_CONCURRENCY=1` to `WEB_CONCURRENCY=3` in `backend/Dockerfile` (line 44, the `ENV PORT=8000` block)
    - Update `backend/.env.example` to show `WEB_CONCURRENCY=3` as the recommended value
    - Update `backend/DEPLOY.md`: change the web service table to show `WEB_CONCURRENCY=3`, add a scaling guidance section documenting when to scale from increased concurrency to multiple instances (CPU saturation >80%, memory pressure >85%, or p95 response latency >2s)
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 6. P1: Add Uptime Monitoring
  - [x] 6.1 Document UptimeRobot setup in DEPLOY.md
    - Add a new "Uptime Monitoring" section to `backend/DEPLOY.md`
    - Document UptimeRobot free-tier setup (50 monitors, 5-minute intervals) for `https://api.mihas.edu.zm/health/ready/` with email alerts
    - _Requirements: 5.1_

  - [x] 6.2 Implement check_uptime_task Celery periodic task
    - Add `check_uptime_task` to `backend/apps/common/tasks.py`
    - Send HTTP GET to configured `HEALTH_CHECK_URL` (default: `https://api.mihas.edu.zm/health/ready/`) with 10-second timeout
    - Track previous status in Redis key `uptime:last_status`
    - On transition from healthy to unhealthy (non-200 or timeout): dispatch alert email via `send_email_task.delay()`
    - On transition from unhealthy to healthy: dispatch recovery notification email
    - Repeated failures without recovery should not produce duplicate alerts
    - Add `HEALTH_CHECK_URL` to `backend/.env.example` and `backend/config/settings/base.py`
    - _Requirements: 5.2, 5.3, 5.4, 5.5_

  - [x] 6.3 Configure Celery Beat schedule in Django settings
    - Add `CELERY_BEAT_SCHEDULE` to `backend/config/settings/base.py` with:
      - `check-uptime`: `apps.common.tasks.check_uptime_task` every 300 seconds
      - `cleanup-audit-logs`: `apps.common.tasks.cleanup_audit_logs_task` daily at 03:00 UTC via `crontab(hour=3, minute=0)`
    - Add `from celery.schedules import crontab` import
    - Document running Celery Beat as a third Koyeb service (`celery -A config beat -l info`) in `backend/DEPLOY.md`
    - _Requirements: 5.6_

  - [x] 6.4 Write property test for uptime state transitions
    - **Property 9: Uptime task alerts on failure and recovers**
    - Create `backend/tests/property/test_uptime_task.py`
    - Generate sequences of health check results (200/non-200), verify alert email on healthy→unhealthy transition and recovery email on unhealthy→healthy transition, no duplicate alerts for repeated failures
    - **Validates: Requirements 5.3, 5.4**

- [x] 7. P1: Document Secrets Rotation Strategy
  - [x] 7.1 Create secrets rotation runbook
    - Create `docs/runbooks/secrets-rotation.md`
    - Document rotation procedures for: `JWT_SIGNING_KEY` (dual-key overlap strategy to avoid invalidating active sessions), `SECRET_KEY`, R2 credentials (`S3_ACCESS_KEY`, `S3_SECRET_KEY`), `DATABASE_URL` (Neon Postgres), `RESEND_API_KEY`, `REDIS_URL` (Upstash)
    - Include recommended rotation schedule per secret category
    - Include post-rotation verification checklist to confirm service health
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_

- [x] 8. P1: Add Audit Log Cleanup Job
  - [x] 8.1 Implement cleanup_audit_logs_task Celery periodic task
    - Add `cleanup_audit_logs_task` to `backend/apps/common/tasks.py`
    - Delete `AuditLog` records where `retention_category='standard'` and `created_at` older than 90 days
    - Delete `AuditLog` records where `retention_category='security'` and `created_at` older than 365 days
    - Batch deletes in groups of 1000 to avoid long-running transactions
    - Log count of deleted records per retention category
    - On database error: log error and retry once after 5 minutes (`max_retries=1, default_retry_delay=300`)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 8.2 Write property test for audit log cleanup
    - **Property 10: Audit log cleanup respects retention periods**
    - Create `backend/tests/property/test_audit_cleanup.py`
    - Generate random AuditLog records with various retention categories and ages, run cleanup, verify only expired records are deleted and records within retention period are preserved
    - **Validates: Requirements 7.2, 7.3**

  - [x] 8.3 Write unit tests for audit log cleanup
    - Create `backend/tests/unit/test_audit_cleanup.py`
    - Test: cleanup logs deletion counts per category
    - Test: cleanup retries once on database error
    - _Requirements: 7.5, 7.6_

- [x] 9. P1 Checkpoint
  - Ensure all tests pass, ask the user if questions arise.
  - Verify WEB_CONCURRENCY is set to 3 in Dockerfile
  - Verify Celery Beat schedule includes both periodic tasks
  - Verify secrets runbook covers all production secrets
  - Verify audit cleanup respects retention periods

- [x] 10. P2: Force Bcrypt Re-Hash Coverage
  - [x] 10.1 Write property test for needs_rehash classification
    - **Property 11: needs_rehash correctly classifies hash formats**
    - Create `backend/tests/property/test_password_rehash.py`
    - Generate bcrypt hashes (starting with `$2`) and SHA-256 hex digests (64 hex chars), verify `needs_rehash()` returns correct boolean
    - **Validates: Requirements 8.4**

  - [x] 10.2 Write property test for legacy hash upgrade on login
    - **Property 12: Legacy hash is upgraded to bcrypt on login**
    - In `backend/tests/property/test_password_rehash.py`, generate random passwords, create SHA-256 hashes, simulate login through `LoginView`, verify stored `password_hash` starts with `$2` and `needs_rehash()` returns `False`
    - **Validates: Requirements 8.1**

  - [x] 10.3 Write unit tests for password rehash
    - Create `backend/tests/unit/test_password_rehash.py`
    - Test: SHA-256 user can log in and hash is upgraded to bcrypt
    - Test: `needs_rehash()` returns True for SHA-256, False for bcrypt
    - Test: `needs_rehash()` returns False for empty string
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 11. Final Checkpoint — Verify all remediation items
  - Ensure all tests pass, ask the user if questions arise.
  - Verify all 8 CTO assessment remediation items are addressed
  - Verify all 12 correctness properties have corresponding test tasks
  - Confirm no orphaned or unwired code remains

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints after each priority tier ensure incremental validation
- Property tests validate universal correctness properties from the design document
- All models use `managed = False` — the SQL migration script for `error_logs` must be run manually against Neon
- Celery Beat is a new process that must be deployed as a third Koyeb service
- The error report endpoint needs CSRF exemption since `window.onerror` fires before any CSRF token is available
