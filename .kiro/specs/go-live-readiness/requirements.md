# Requirements Document

## Introduction

This specification covers the go-live readiness work for the MIHAS admissions platform. The platform runs Django 5 + DRF on Koyeb (web, worker, beat services), React 18 + Vite on Vercel, Neon Postgres (project: wild-bar-37055823), Upstash Redis, Cloudflare R2, and Resend for email. All Django models use `managed = False`, so schema changes must be applied via SQL directly against Neon. The scope includes end-to-end live environment testing, complete DB-model alignment auditing, Celery/Redis verification, error handling pipeline validation, database schema hardening, and steering file updates to reflect the current platform state.

## Glossary

- **Platform**: The MIHAS admissions system comprising the Django API backend, React frontend, Neon Postgres database, Upstash Redis, Cloudflare R2 storage, and Resend email service
- **Live_Environment**: The production deployment consisting of the Koyeb web service (api.mihas.edu.zm), Koyeb worker service (Celery), Koyeb beat service (Celery Beat), Vercel frontend (apply.mihas.edu.zm), and Neon Postgres database
- **Neon_MCP**: The Neon Management Console / MCP tool used to execute SQL queries and inspect the live Neon Postgres database directly
- **Schema_Auditor**: The process or script that compares Django model field definitions against actual Neon Postgres table columns
- **Celery_Worker**: The Koyeb worker service running `celery -A config worker` that processes background tasks from the Redis queue
- **Celery_Beat**: The Koyeb beat service running `celery -A config beat` that dispatches periodic tasks on a schedule
- **Error_Pipeline**: The error monitoring chain: backend exception handler → ErrorLog table → throttled alert email, and frontend error reporter → POST /api/v1/errors/report/
- **Steering_Files**: The `.kiro/steering/tech.md`, `.kiro/steering/structure.md`, and `.kiro/steering/product.md` files that document platform conventions and state
- **DB_Column**: An actual column in a Neon Postgres table as returned by `information_schema.columns`
- **Model_Field**: A field defined on a Django model class in the `backend/apps/` source code

## Requirements

### Requirement 1: End-to-End Live Environment Testing

**User Story:** As a platform operator, I want every API endpoint tested against the live Neon database with real credentials, so that I can confirm the platform works correctly in production before go-live.

#### Acceptance Criteria

1. WHEN a student login request is sent to `/api/v1/auth/login/` with valid student credentials, THE Live_Environment SHALL return a successful authentication response with HTTP-only cookies set
2. WHEN an admin login request is sent to `/api/v1/auth/login/` with valid admin credentials, THE Live_Environment SHALL return a successful authentication response with admin-role cookies set
3. WHEN an authenticated student calls `/api/v1/applications/`, THE Live_Environment SHALL return the student's application data from the live Neon database
4. WHEN an authenticated admin calls `/api/v1/admin/users/`, THE Live_Environment SHALL return user listing data from the live Neon database
5. WHEN a state-changing request is made (create, update, delete), THE Neon_MCP SHALL confirm the corresponding row change in the live database
6. WHEN the catalog endpoints (`/api/v1/catalog/programs/`, `/api/v1/catalog/intakes/`, `/api/v1/catalog/subjects/`) are called, THE Live_Environment SHALL return data matching the live Neon catalog tables
7. WHEN the health endpoints (`/health/live/`, `/health/ready/`) are called, THE Live_Environment SHALL return HTTP 200 confirming Postgres and Redis connectivity
8. IF an API endpoint returns an unexpected error during live testing, THEN THE Live_Environment SHALL log the error to the `error_logs` table with source, level, message, and stack trace

### Requirement 2: Complete DB-Model Alignment Audit

**User Story:** As a platform operator, I want every Django model field verified against the actual Neon Postgres schema, so that no field mismatch causes a runtime error in production.

#### Acceptance Criteria

1. THE Schema_Auditor SHALL compare every Model_Field in `backend/apps/accounts/models.py` against the corresponding DB_Column in the Neon `profiles`, `device_sessions`, `login_attempts`, `password_reset_tokens`, `csrf_tokens`, and `user_permission_overrides` tables
2. THE Schema_Auditor SHALL compare every Model_Field in `backend/apps/applications/models.py` against the corresponding DB_Column in the Neon `applications`, `application_status_history`, `application_drafts`, and `application_interviews` tables
3. THE Schema_Auditor SHALL compare every Model_Field in `backend/apps/catalog/models.py` against the corresponding DB_Column in the Neon `institutions`, `programs`, `intakes`, `program_intakes`, `subjects`, and `course_requirements` tables
4. THE Schema_Auditor SHALL compare every Model_Field in `backend/apps/documents/models.py` against the corresponding DB_Column in the Neon `application_documents`, `application_grades`, and `payments` tables
5. THE Schema_Auditor SHALL compare every Model_Field in `backend/apps/common/models.py` against the corresponding DB_Column in the Neon `audit_logs`, `idempotency_keys`, `settings`, `notifications`, `user_notification_preferences`, `email_queue`, `error_logs`, and `migration_history` tables
6. WHEN a Model_Field exists in Django but the corresponding DB_Column is missing in Neon, THE Schema_Auditor SHALL flag the mismatch and generate an ALTER TABLE ADD COLUMN SQL statement
7. WHEN a DB_Column exists in Neon but no corresponding Model_Field exists in Django, THE Schema_Auditor SHALL flag the extra column for review
8. WHEN a Model_Field data type does not match the DB_Column data type (e.g., CharField vs integer, DecimalField vs text), THE Schema_Auditor SHALL flag the type mismatch
9. WHEN a mismatch is identified, THE Platform SHALL apply the corrective SQL via Neon_MCP or update the Django model to resolve the discrepancy
10. IF a previously fixed model (DeviceSession, LoginAttempt, PasswordResetToken, CSRFToken, Program, EmailQueue) regresses, THEN THE Schema_Auditor SHALL detect and report the regression

### Requirement 3: Celery Worker Verification

**User Story:** As a platform operator, I want to verify that the Celery worker processes email tasks and that Celery Beat dispatches periodic tasks on schedule, so that background processing works reliably in production.

#### Acceptance Criteria

1. WHEN the `send_email_task` is dispatched to the Celery queue, THE Celery_Worker SHALL pick up the task and attempt email delivery via Resend
2. WHEN the `send_email_task` completes successfully, THE Celery_Worker SHALL update the corresponding `email_queue` row status to a completed state
3. IF the `send_email_task` fails due to a transient error, THEN THE Celery_Worker SHALL retry the task with exponential backoff up to the configured maximum retry count
4. WHEN the Celery Beat schedule fires, THE Celery_Beat SHALL dispatch the `check_uptime_task` at the configured 300-second interval
5. WHEN the Celery Beat schedule fires, THE Celery_Beat SHALL dispatch the `cleanup_audit_logs_task` at the configured daily 03:00 UTC schedule
6. WHEN the `check_uptime_task` runs, THE Celery_Worker SHALL verify Postgres and Redis connectivity and send an alert email if either service is unreachable
7. WHEN the `cleanup_audit_logs_task` runs, THE Celery_Worker SHALL delete audit log records that exceed their retention period (standard: 90 days, security: 365 days)

### Requirement 4: Redis Connectivity Verification

**User Story:** As a platform operator, I want to verify that Redis is working for all its intended purposes, so that caching, rate limiting, CSRF storage, and Celery brokering function correctly in production.

#### Acceptance Criteria

1. WHEN the backend starts, THE Platform SHALL establish a TLS connection to Upstash Redis using the configured `REDIS_URL`
2. WHEN a rate-limited endpoint receives requests exceeding the configured threshold, THE Platform SHALL enforce the rate limit using Redis-backed counters and return HTTP 429
3. WHEN a CSRF token is generated during authentication, THE Platform SHALL store the token reference in Redis with the configured TTL
4. WHEN a Celery task is dispatched, THE Platform SHALL publish the task message to the Redis broker queue
5. WHEN the `/health/ready/` endpoint is called, THE Platform SHALL verify Redis connectivity and include the result in the health response
6. IF Redis becomes unreachable, THEN THE Platform SHALL return a non-200 response from `/health/ready/` indicating the Redis connectivity failure

### Requirement 5: Error Handling Pipeline Verification

**User Story:** As a platform operator, I want to verify the complete error monitoring pipeline, so that backend exceptions and frontend errors are captured, logged, and alerted on in production.

#### Acceptance Criteria

1. WHEN an unhandled exception occurs in a Django view, THE Error_Pipeline SHALL catch the exception via the custom exception handler and create an ErrorLog record with source='backend', the error level, message, and stack trace
2. WHEN the ErrorLog record count for a given time window exceeds the throttle threshold, THE Error_Pipeline SHALL send an alert email to the configured `ERROR_ALERT_EMAIL` recipient
3. WHEN the alert email throttle period has not elapsed since the last alert, THE Error_Pipeline SHALL suppress duplicate alert emails
4. WHEN the frontend error reporter sends a POST request to `/api/v1/errors/report/`, THE Error_Pipeline SHALL create an ErrorLog record with source='frontend' and the reported error details
5. WHEN the frontend error reporter sends a malformed or incomplete payload, THE Error_Pipeline SHALL return an appropriate HTTP error response and not create a partial ErrorLog record
6. THE Error_Pipeline SHALL include the `request_path`, `user_id` (if authenticated), and `ip_hash` (SHA-256) in each ErrorLog record where available

### Requirement 6: Steering File Updates

**User Story:** As a developer, I want the steering files to reflect the current state of the platform after all remediation work, so that future development follows accurate conventions and context.

#### Acceptance Criteria

1. WHEN all remediation work is complete, THE Steering_Files SHALL update `.kiro/steering/tech.md` to document the error monitoring system (ErrorLog model, error reporting endpoint, throttled alert emails)
2. WHEN all remediation work is complete, THE Steering_Files SHALL update `.kiro/steering/tech.md` to document Celery Beat periodic tasks (check_uptime_task, cleanup_audit_logs_task) and their schedules
3. WHEN all remediation work is complete, THE Steering_Files SHALL update `.kiro/steering/tech.md` to document the uptime monitoring setup (internal Celery task and external UptimeRobot)
4. WHEN all remediation work is complete, THE Steering_Files SHALL update `.kiro/steering/product.md` to reflect the error alerting default recipient and the error monitoring pipeline
5. WHEN all remediation work is complete, THE Steering_Files SHALL update `.kiro/steering/structure.md` to document any new files or paths added during remediation (error_urls, error_views, exceptions, health endpoints)
6. THE Steering_Files SHALL remove or correct any statements that are no longer accurate after remediation (e.g., "No error monitoring" from the CTO assessment is now resolved)

### Requirement 7: Database Schema Hardening

**User Story:** As a platform operator, I want the Neon Postgres schema to have proper indexes, NOT NULL constraints, and foreign key constraints, so that the database enforces data integrity and performs well under production load.

#### Acceptance Criteria

1. THE Neon_MCP SHALL add indexes on columns frequently used in WHERE clauses and JOIN conditions across all tables (e.g., `applications.user`, `applications.status`, `applications.application_number`, `audit_logs.created_at`, `email_queue.status`, `notifications.user`)
2. THE Neon_MCP SHALL add NOT NULL constraints on columns that must always have a value based on business rules (e.g., `applications.status`, `applications.email`, `profiles.email`, `profiles.role`, `email_queue.status`)
3. THE Neon_MCP SHALL add foreign key constraints where Django model ForeignKey fields reference other tables but the Neon schema lacks the corresponding database-level constraint
4. WHEN an index is added, THE Neon_MCP SHALL use CREATE INDEX CONCURRENTLY to avoid locking the table during index creation
5. WHEN a NOT NULL constraint is added to a column that contains existing NULL values, THE Neon_MCP SHALL first backfill the NULL values with an appropriate default before applying the constraint
6. IF orphaned records exist (rows referencing non-existent parent records), THEN THE Neon_MCP SHALL clean up the orphaned data before adding the foreign key constraint
7. THE Neon_MCP SHALL verify each schema change by querying `information_schema` or `pg_indexes` after applying the change
