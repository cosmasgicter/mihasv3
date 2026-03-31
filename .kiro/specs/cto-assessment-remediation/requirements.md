# Requirements Document

## Introduction

This spec addresses the critical, important, and quarterly remediation items identified in the CTO Assessment dated March 30, 2026 (`docs/cto-assessment-2026-03-30.md`). The scope covers completing the JWT authentication middleware, wiring remaining Celery email tasks, adding free error monitoring, scaling the backend, adding uptime monitoring, documenting secrets rotation, adding audit log cleanup, and forcing bcrypt re-hash for legacy passwords.

All work respects the existing constraints: no paid monitoring services, cookie-based JWT auth on `.mihas.edu.zm`, Django 5 + DRF on Koyeb, React 18 on Vercel, Neon Postgres, Upstash Redis, Cloudflare R2, Resend email, and Celery for async tasks.

## Glossary

- **JWT_Middleware**: The `JWTAuthenticationMiddleware` class in `backend/apps/common/middleware.py` (position 8 in the middleware chain) that validates JWT tokens at the ASGI middleware layer before DRF authentication runs.
- **JWT_Cookie_Auth**: The `JWTCookieAuthentication` DRF authentication backend in `backend/apps/accounts/authentication.py` that extracts and validates JWT tokens for DRF views.
- **Email_Task**: The `send_email_task` Celery task in `backend/apps/common/tasks.py` that sends email via the Resend API with exponential backoff retries.
- **Error_Monitor**: A lightweight, self-hosted error logging system that captures backend exceptions and frontend runtime errors, stores them in Neon Postgres, and sends alert emails via Resend.
- **Frontend_Error_Reporter**: A browser-side handler for `window.onerror` and `unhandledrejection` events that POSTs error payloads to the backend Error_Monitor endpoint.
- **Health_Endpoint**: The `/health/ready/` readiness probe in `backend/apps/common/health.py` that verifies Postgres and Redis connectivity.
- **Audit_Log**: The `audit_logs` table mapped by `backend/apps/common/models.py::AuditLog` with `retention_category` values of `security` (365 days) and `standard` (90 days).
- **Profile**: The `profiles` table mapped by `backend/apps/accounts/models.py::Profile`, the primary user model.
- **Secrets_Runbook**: A markdown document describing the step-by-step process for rotating each production secret.
- **Uptime_Monitor**: A combination of UptimeRobot (free tier, primary external monitor) and an internal Celery periodic task (secondary, catches partial failures) that checks `/health/ready/` and alerts via email on failure.
- **Celery_Beat**: The Celery Beat scheduler process that dispatches periodic tasks on a configured schedule. Not currently configured in the backend — must be set up as part of this spec.

## Requirements

### Requirement 1: Complete JWT Authentication Middleware

**User Story:** As a platform operator, I want the JWT authentication middleware to fully validate tokens from HTTP-only cookies so that all authenticated endpoints are protected at the ASGI layer before reaching DRF views.

#### Acceptance Criteria

1. WHEN an HTTP request arrives with an `access_token` cookie, THE JWT_Middleware SHALL extract the token from the cookie, decode it using the configured `JWT_SIGNING_KEY` and `HS256` algorithm, and attach the authenticated user object to `request.user`.
2. WHEN an HTTP request arrives with an `Authorization: Bearer <token>` header and no `access_token` cookie, THE JWT_Middleware SHALL extract the token from the header and process it identically to a cookie-based token.
3. WHEN the JWT token is expired, THE JWT_Middleware SHALL allow the request to proceed without setting `request.user`, leaving authentication enforcement to DRF permission classes.
4. WHEN the JWT token is malformed or has an invalid signature, THE JWT_Middleware SHALL allow the request to proceed without setting `request.user` and log a warning.
5. WHEN no JWT token is present in either the cookie or the Authorization header, THE JWT_Middleware SHALL allow the request to proceed as an anonymous request.
6. THE JWT_Middleware SHALL validate that the `token_type` claim equals `access` before attaching the user to the request.
7. THE JWT_Middleware SHALL validate that the `user_id` claim is present and non-empty before attaching the user to the request.
8. THE JWT_Middleware SHALL reuse the `JWTUser` class from `backend/apps/accounts/authentication.py` to construct the user object from the JWT payload.
9. THE JWT_Middleware SHALL not perform any database queries during token validation.
10. WHEN the JWT_Middleware attaches a user to `request.user`, THE JWT_Cookie_Auth SHOULD detect the pre-authenticated user and skip redundant token decoding. This is an optional optimization — the system SHALL work correctly even if DRF re-validates the token independently.

### Requirement 2: Wire Remaining Email Celery Tasks

**User Story:** As a platform operator, I want password reset and account lockout emails to be sent asynchronously via Celery so that users receive timely notifications without blocking request processing.

#### Acceptance Criteria

1. WHEN a password reset token is generated in `PasswordResetRequestView`, THE Email_Task SHALL be dispatched via `send_email_task.delay()` with the password reset email queued in the `email_queue` table.
2. WHEN an account lockout is triggered in `send_lockout_email()`, THE Email_Task SHALL be dispatched via `send_email_task.delay()` with the lockout notification email queued in the `email_queue` table.
3. THE Email_Task dispatch SHALL create an `EmailQueue` record with `recipient_email`, `subject`, `body`, and `status='pending'` before calling `send_email_task.delay()` with the record ID.
4. IF the `EmailQueue` record creation fails, THEN THE system SHALL log the error and continue processing the original request without raising an exception to the caller.
5. THE password reset email body SHALL include a reset link containing the raw token and the frontend base URL (`https://apply.mihas.edu.zm`).
6. THE lockout notification email body SHALL inform the user that their account has been temporarily locked due to repeated failed login attempts.

### Requirement 3: Add Error Monitoring (Free, Self-Hosted)

**User Story:** As a platform operator, I want unhandled errors in both the backend and frontend to be captured, stored, and alerted on so that production issues are detected without relying on paid services like Sentry.

#### Acceptance Criteria

1. THE backend SHALL provide a Django model `ErrorLog` mapped to an `error_logs` table in Neon Postgres, storing: `id` (UUID), `source` (backend/frontend), `level` (error/warning), `message` (text), `stack_trace` (text, nullable), `context` (JSON, nullable), `request_path` (text, nullable), `user_id` (UUID, nullable), `ip_hash` (text, nullable), `created_at` (timestamp). The model SHALL use `managed = False` consistent with the existing schema pattern, and a SQL migration script SHALL be provided to create the `error_logs` table in Neon.
2. WHEN an unhandled exception occurs in a Django view, THE backend SHALL log the error to the `ErrorLog` table via a custom DRF exception handler extension.
3. WHEN an `ErrorLog` record with `level='error'` is created, THE backend SHALL dispatch an alert email via `send_email_task.delay()` to a configurable `ERROR_ALERT_EMAIL` address using the existing Resend integration.
4. THE backend SHALL expose a `POST /api/v1/errors/report/` endpoint that accepts error payloads from the frontend with fields: `message`, `stack_trace`, `context`, `url`, `user_agent`.
5. THE `POST /api/v1/errors/report/` endpoint SHALL accept both authenticated and unauthenticated requests, rate-limited to 10 reports per IP per 5 minutes.
6. THE `POST /api/v1/errors/report/` endpoint SHALL hash the client IP address with SHA-256 before storing it in the `ErrorLog` record.
7. THE Frontend_Error_Reporter SHALL register `window.onerror` and `window.addEventListener('unhandledrejection', ...)` handlers that POST error details to `/api/v1/errors/report/`.
8. THE Frontend_Error_Reporter SHALL batch errors with a 5-second debounce to avoid flooding the backend during cascading failures.
9. THE Frontend_Error_Reporter SHALL include the current page URL, user agent, and app version in each error report.
10. IF the error report POST fails, THEN THE Frontend_Error_Reporter SHALL log the error to the browser console and not retry.
11. THE backend SHALL throttle alert emails to a maximum of 1 alert per unique error message per 15-minute window to prevent alert fatigue. THE throttle state SHALL be stored in Redis (not queried from the `error_logs` table) for performance.
12. THE `ERROR_ALERT_EMAIL` setting SHALL be added to `backend/.env.example`, `apps/admissions/.env.example`, and documented in `backend/DEPLOY.md`.

### Requirement 4: Scale Backend Concurrency

**User Story:** As a platform operator, I want the backend to handle more concurrent requests so that the single-instance deployment is not a bottleneck under normal traffic.

#### Acceptance Criteria

1. THE Koyeb deployment configuration SHALL set `WEB_CONCURRENCY` to 3 for the web service.
2. THE `backend/DEPLOY.md` document SHALL be updated to reflect the new `WEB_CONCURRENCY` value and document the scaling approach for adding additional Koyeb instances.
3. THE `backend/DEPLOY.md` document SHALL include guidance on when to scale from increased concurrency to multiple instances (CPU saturation, memory pressure, or response latency thresholds).

### Requirement 5: Add Uptime Monitoring

**User Story:** As a platform operator, I want to be alerted when the backend becomes unavailable so that downtime is detected and addressed promptly.

#### Acceptance Criteria

1. THE `backend/DEPLOY.md` document SHALL include instructions for configuring UptimeRobot (free tier: 50 monitors, 5-minute intervals) as the primary external uptime monitor for `/health/ready/`, with email alerts to the operations team.
2. THE backend SHALL include a Celery periodic task `check_uptime_task` as a secondary internal health check that sends an HTTP GET request to the configured health endpoint URL every 5 minutes. This catches partial failures (e.g., database down but web process still running) that an external monitor may not detect.
3. WHEN the Health_Endpoint returns a non-200 status code or the request times out after 10 seconds, THE `check_uptime_task` SHALL dispatch an alert email via `send_email_task.delay()` to the configured `ERROR_ALERT_EMAIL` address.
4. WHEN the Health_Endpoint returns a 200 status code after a previous failure, THE `check_uptime_task` SHALL dispatch a recovery notification email.
5. THE `check_uptime_task` SHALL track the previous health status in Redis to distinguish between ongoing failures and new incidents.
6. THE backend SHALL configure Celery Beat with a `CELERY_BEAT_SCHEDULE` in Django settings to schedule the `check_uptime_task` and `cleanup_audit_logs_task` periodic tasks. THE `backend/DEPLOY.md` SHALL document how to run the Celery Beat scheduler as a separate process on Koyeb.

### Requirement 6: Document Secrets Rotation Strategy

**User Story:** As a platform operator, I want a documented runbook for rotating all production secrets so that credential compromise risk is minimized and rotation can be performed without downtime.

#### Acceptance Criteria

1. THE Secrets_Runbook SHALL be created at `docs/runbooks/secrets-rotation.md`.
2. THE Secrets_Runbook SHALL document the rotation procedure for `JWT_SIGNING_KEY`, including the dual-key overlap strategy to avoid invalidating active sessions.
3. THE Secrets_Runbook SHALL document the rotation procedure for `SECRET_KEY`.
4. THE Secrets_Runbook SHALL document the rotation procedure for Cloudflare R2 credentials (`S3_ACCESS_KEY`, `S3_SECRET_KEY`).
5. THE Secrets_Runbook SHALL document the rotation procedure for `DATABASE_URL` (Neon Postgres credentials).
6. THE Secrets_Runbook SHALL document the rotation procedure for `RESEND_API_KEY`.
7. THE Secrets_Runbook SHALL document the rotation procedure for `REDIS_URL` (Upstash credentials).
8. THE Secrets_Runbook SHALL specify a recommended rotation schedule for each secret category.
9. THE Secrets_Runbook SHALL include a verification checklist to confirm service health after each rotation.

### Requirement 7: Add Audit Log Cleanup Job

**User Story:** As a platform operator, I want expired audit log records to be automatically purged so that the database does not grow unbounded while retaining security-relevant records for the required period.

#### Acceptance Criteria

1. THE backend SHALL include a Celery periodic task `cleanup_audit_logs_task` that runs daily, registered in the `CELERY_BEAT_SCHEDULE` configured in Requirement 5.6.
2. WHEN `cleanup_audit_logs_task` runs, THE task SHALL delete `AuditLog` records where `retention_category='standard'` and `created_at` is older than 90 days.
3. WHEN `cleanup_audit_logs_task` runs, THE task SHALL delete `AuditLog` records where `retention_category='security'` and `created_at` is older than 365 days.
4. THE `cleanup_audit_logs_task` SHALL delete records in batches of 1000 to avoid long-running transactions.
5. THE `cleanup_audit_logs_task` SHALL log the count of deleted records per retention category.
6. IF the cleanup task encounters a database error, THEN THE task SHALL log the error and retry once after 5 minutes.

### Requirement 8: Force Bcrypt Re-Hash on Legacy Passwords

**User Story:** As a platform operator, I want users with legacy SHA-256 password hashes to be forced to re-hash to bcrypt on their next login so that all stored passwords use the current hashing standard.

#### Acceptance Criteria

1. WHEN a user logs in and `needs_rehash()` returns true for the stored password hash, THE `LoginView` SHALL re-hash the password with bcrypt and update the `password_hash` field on the Profile record.
2. THE `LoginView` already performs this re-hash (verified in existing code); THE requirement is to confirm coverage and add explicit test coverage for the legacy hash migration path.
3. THE backend test suite SHALL include a test that verifies a user with a SHA-256 password hash can log in and the stored hash is updated to bcrypt format after login.
4. THE backend test suite SHALL include a test that verifies `needs_rehash()` returns true for SHA-256 hashes and false for bcrypt hashes.
