# Requirements Document

## Introduction

The MIHAS platform currently scores 79/100 on production readiness. This spec targets 90+ by addressing the six weakest areas: CI reliability, observability, Redis resilience, code organization, task scheduling resilience, and scalability documentation. Changes must not break existing production functionality, must maintain backward API compatibility, and should prefer free/low-cost solutions (GlitchTip free tier, Upstash free tier).

## Glossary

- **CI_Pipeline**: The GitHub Actions workflow defined in `.github/workflows/ci.yml` that runs backend and frontend checks on push/PR to `main`.
- **Property_Test_Suite**: The collection of Hypothesis-based property tests in `backend/tests/property/` that validate backend invariants.
- **Outbox_Module**: The `backend/apps/common/outbox.py` module that persists notifications and emails via Django ORM, creating DB-dependent side effects.
- **Communication_Service**: The `backend/apps/common/communication_service.py` module that renders templates and dispatches notifications/emails via the Outbox_Module.
- **Readiness_Probe**: The `GET /health/ready/` endpoint that verifies Postgres and Redis connectivity before accepting traffic.
- **Liveness_Probe**: The `GET /health/live/` endpoint that returns HTTP 200 with no external dependencies.
- **Redis_Health_Probe**: The `GET /health/redis/` endpoint that checks Redis connectivity independently.
- **JTI_Blacklist**: The Redis-backed set of revoked JWT refresh token identifiers used to prevent token reuse after rotation.
- **CSRF_Token_Store**: The `csrf_tokens` Postgres table where hashed CSRF tokens are validated by `CSRFEnforcementMiddleware`.
- **Metrics_Middleware**: A new Django middleware that emits structured JSON log lines with request duration, status code, and endpoint metadata for aggregation.
- **Applications_Views_Module**: The `backend/apps/applications/views.py` file containing 2,904 lines and 30 view classes with mixed admin/student/public concerns.
- **Celery_Beat**: The single-instance Celery Beat scheduler running 16 periodic tasks defined in `CELERY_BEAT_SCHEDULE`.
- **Structured_Log**: A JSON-formatted log line emitted by `JsonLogFormatter` in `backend/apps/common/logging.py` containing timestamp, level, logger name, message, and request context.

## Requirements

### Requirement 1: Fix Property Tests That Hit Database Paths

**User Story:** As a developer, I want all property tests to pass in CI without database access, so that the CI pipeline is green and trustworthy.

#### Acceptance Criteria

1. WHEN the CI_Pipeline runs the Property_Test_Suite, THE CI_Pipeline SHALL complete with zero test failures across all files in `backend/tests/property/`.
2. WHEN a property test class extends `SimpleTestCase`, THE Property_Test_Suite SHALL mock all calls to the Outbox_Module that would trigger Django ORM operations.
3. WHEN a property test class extends `SimpleTestCase`, THE Property_Test_Suite SHALL mock all calls to the Communication_Service that would trigger Django ORM operations.
4. IF a property test requires actual database access for correctness, THEN THE Property_Test_Suite SHALL use `@pytest.mark.django_db` and extend `TransactionTestCase` or `TestCase` instead of `SimpleTestCase`.
5. WHEN all property test fixes are applied, THE CI_Pipeline SHALL pass the `python -m pytest tests/unit/ tests/property/ -x -q --tb=short` command with exit code 0.

### Requirement 2: Request Metrics via Structured Logging

**User Story:** As an operator, I want request-level metrics emitted as structured log lines, so that I can answer "what is p95 latency?" and "which endpoints are slowest?" using log aggregation.

#### Acceptance Criteria

1. WHEN an HTTP request completes, THE Metrics_Middleware SHALL emit a Structured_Log containing the fields: `method`, `path`, `status_code`, `duration_ms`, and `request_id`.
2. THE Metrics_Middleware SHALL compute `duration_ms` as the wall-clock time between request receipt and response dispatch, measured in milliseconds with at least 1ms precision.
3. WHEN the `path` matches a health check endpoint (`/health/live/`, `/health/ready/`, `/health/redis/`), THE Metrics_Middleware SHALL skip metric emission to avoid log noise.
4. THE Metrics_Middleware SHALL be positioned after `RequestIDMiddleware` in the middleware stack so that `request_id` is available for correlation.
5. THE Structured_Log emitted by the Metrics_Middleware SHALL include a `type` field set to `"request_metric"` to distinguish metric lines from application logs.

### Requirement 3: Business Metrics Logging

**User Story:** As an operator, I want key business events logged as structured metrics, so that I can track payment volumes, submission rates, and pending queues without a dedicated metrics backend.

#### Acceptance Criteria

1. WHEN a payment status transitions to `successful`, THE Payment_Service SHALL emit a Structured_Log with `type` set to `"business_metric"`, `metric` set to `"payment_completed"`, and `amount` set to the payment amount.
2. WHEN an application transitions from `draft` to `submitted`, THE Application_Service SHALL emit a Structured_Log with `type` set to `"business_metric"` and `metric` set to `"application_submitted"`.
3. WHEN a Celery task completes, THE task SHALL emit a Structured_Log with `type` set to `"task_metric"`, `task_name`, `duration_ms`, and `status` (success or failure).

### Requirement 4: Enhanced Readiness Probe with Redis Detail

**User Story:** As an operator, I want the readiness probe to report granular Redis health status, so that I can distinguish between Redis being fully down versus degraded.

#### Acceptance Criteria

1. WHEN Redis responds to a PING within 2 seconds, THE Readiness_Probe SHALL report `redis` as `"ok"` in the response body.
2. WHEN Redis fails to respond to a PING within 2 seconds, THE Readiness_Probe SHALL report `redis` as `"degraded"` in the response body and return HTTP 200 (not 503).
3. THE Readiness_Probe SHALL include a `redis_latency_ms` field in the response body indicating the time taken for the Redis health check in milliseconds.
4. THE Readiness_Probe SHALL continue to return HTTP 503 only when the database check fails, regardless of Redis status.

### Requirement 5: Redis JTI Blacklist Recovery

**User Story:** As an operator, I want a documented and executable recovery procedure for JTI blacklist loss after a Redis flush, so that revoked refresh tokens cannot be reused silently.

#### Acceptance Criteria

1. THE Platform SHALL provide a Django management command `recover_jti_blacklist` that reads all active refresh tokens from the database session records and re-populates the Redis JTI blacklist.
2. WHEN the `recover_jti_blacklist` command executes, THE command SHALL log the count of JTI entries restored and the count of expired tokens skipped.
3. IF Redis is unreachable when `recover_jti_blacklist` runs, THEN THE command SHALL exit with a non-zero exit code and a descriptive error message.
4. THE Platform SHALL include a runbook entry in `docs/runbooks/redis-recovery.md` documenting when and how to run the recovery command.

### Requirement 6: CSRF Graceful Degradation When Redis Is Down

**User Story:** As a student, I want state-changing requests to continue working when Redis is temporarily unavailable, so that I do not lose my application progress during Redis outages.

#### Acceptance Criteria

1. WHILE Redis is unavailable, THE CSRF_Enforcement_Middleware SHALL fall back to validating CSRF tokens against the `csrf_tokens` Postgres table only, without attempting Redis lookups.
2. WHEN Redis becomes available again, THE CSRF_Enforcement_Middleware SHALL resume normal operation without requiring a restart.
3. THE CSRF_Enforcement_Middleware SHALL log a warning-level Structured_Log when falling back to Postgres-only CSRF validation, including the `request_id`.

### Requirement 7: Split Applications Views Module

**User Story:** As a developer, I want the applications views split into domain-scoped modules, so that the codebase is navigable and merge conflicts are reduced.

#### Acceptance Criteria

1. THE Applications_Views_Module SHALL be split into separate files: `student_views.py`, `admin_views.py`, `interview_views.py`, `document_views.py`, and `public_views.py` within `backend/apps/applications/`.
2. WHEN the split is complete, THE `backend/apps/applications/views.py` file SHALL re-export all view classes for backward compatibility with existing URL configurations.
3. WHEN the split is complete, THE CI_Pipeline SHALL pass all existing tests in `backend/tests/unit/` and `backend/tests/property/` without modification to test imports.
4. THE split SHALL preserve all existing URL routing by maintaining the same view class names and import paths via the re-export module.
5. WHEN the split is complete, THE `backend/apps/applications/views.py` file SHALL contain fewer than 100 lines (re-exports only).

### Requirement 8: Break Circular Import Dependencies

**User Story:** As a developer, I want circular import cycles between Django apps eliminated, so that import errors do not surface at runtime and the dependency graph is clean.

#### Acceptance Criteria

1. THE Platform SHALL eliminate the circular import cycle between `applications` and `documents` by extracting shared interfaces or using lazy imports.
2. THE Platform SHALL eliminate the circular import cycle between `applications` and `accounts` by extracting shared interfaces or using lazy imports.
3. THE Platform SHALL eliminate the circular import cycle between `common` and `accounts` by extracting shared interfaces or using lazy imports.
4. THE Platform SHALL eliminate the circular import cycle between `common` and `catalog` by extracting shared interfaces or using lazy imports.
5. THE Platform SHALL eliminate the circular import cycle between `common` and `integrations` by extracting shared interfaces or using lazy imports.
6. THE Platform SHALL eliminate the circular import cycle between `documents` and `accounts` by extracting shared interfaces or using lazy imports.
7. WHEN all circular dependencies are resolved, THE CI_Pipeline SHALL pass `python manage.py check` with no import-related warnings or errors.
8. THE Platform SHALL include a CI governance check script that detects circular imports between Django apps and fails if new cycles are introduced.

### Requirement 9: Celery Task Execution Metrics

**User Story:** As an operator, I want visibility into Celery task execution health, so that I can detect missed or stuck tasks before they cause business impact.

#### Acceptance Criteria

1. WHEN a Celery task begins execution, THE task SHALL log a Structured_Log with `type` set to `"task_lifecycle"`, `event` set to `"task_started"`, and `task_name` set to the task function name.
2. WHEN a Celery task completes successfully, THE task SHALL log a Structured_Log with `type` set to `"task_lifecycle"`, `event` set to `"task_completed"`, `task_name`, and `duration_ms`.
3. IF a Celery task raises an unhandled exception, THEN THE task SHALL log a Structured_Log with `type` set to `"task_lifecycle"`, `event` set to `"task_failed"`, `task_name`, `duration_ms`, and `error` containing the exception class name and message.
4. THE Platform SHALL provide a Celery signal handler (using `task_prerun`, `task_postrun`, and `task_failure` signals) that emits these logs automatically for all registered tasks without requiring per-task code changes.

### Requirement 10: Missed Task Detection

**User Story:** As an operator, I want to detect when a scheduled Celery Beat task has not run within its expected window, so that I can investigate Beat failures before they cascade.

#### Acceptance Criteria

1. THE Platform SHALL provide a Django management command `check_missed_tasks` that compares the last execution timestamp of each Celery Beat task against its configured schedule.
2. WHEN a task has not executed within 2x its scheduled interval, THE `check_missed_tasks` command SHALL log a warning-level Structured_Log with `type` set to `"missed_task"`, `task_name`, `expected_interval_seconds`, and `last_run_at`.
3. WHEN all tasks have executed within their expected windows, THE `check_missed_tasks` command SHALL exit with code 0 and log an info-level summary.
4. IF a task has never executed (no recorded timestamp), THEN THE `check_missed_tasks` command SHALL report the task as missed.

### Requirement 11: Scalability Playbook

**User Story:** As an operator, I want a documented scaling playbook, so that I know how to scale each component when traffic increases.

#### Acceptance Criteria

1. THE Platform SHALL include a `docs/runbooks/scaling-playbook.md` document covering horizontal scaling procedures for Koyeb backend instances, Celery workers, and Neon Postgres connection pool sizing.
2. THE scaling playbook SHALL document the current single-process Uvicorn configuration (2-3 workers) and the steps to add additional Koyeb instances.
3. THE scaling playbook SHALL document Neon connection pool limits for the current 0.25 CU tier and the `CONN_MAX_AGE` setting rationale.
4. THE scaling playbook SHALL document Celery worker scaling guidelines including recommended concurrency settings and Redis connection limits for Upstash free tier.
5. THE scaling playbook SHALL document Vercel frontend scaling characteristics (automatic, no manual intervention required).

### Requirement 12: Celery Beat High Availability Consideration

**User Story:** As an operator, I want the Celery Beat single-point-of-failure risk documented with a migration path, so that I can plan for Beat resilience when the platform grows.

#### Acceptance Criteria

1. THE scaling playbook SHALL include a section documenting the current Celery Beat SPOF risk (single instance, 16 tasks).
2. THE scaling playbook SHALL document the migration path to `celery-redbeat` for distributed Beat scheduling using the existing Redis infrastructure.
3. THE scaling playbook SHALL document the operational trade-offs of `celery-redbeat` versus the current single-instance Beat (complexity, Redis dependency, Upstash free-tier limits).
