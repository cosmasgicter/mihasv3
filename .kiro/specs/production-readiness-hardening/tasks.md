# Implementation Plan: Production Readiness Hardening

## Overview

Raise the MIHAS platform production readiness score from 79 to 90+ across six areas: CI reliability, observability, Redis resilience, code organization, task scheduling, and documentation. Tasks are ordered by priority: CI-blocking fixes first, then observability, resilience, code organization, task scheduling, and documentation last. All changes target the existing Django 5 + DRF backend (Python 3.12+).

## Tasks

- [ ] 1. Fix failing property tests (P0 — unblock CI)
  - [x] 1.1 Audit all 43 failing property tests and add mocks for outbox/communication DB paths
    - For each property test class extending `SimpleTestCase`, add `@unittest.mock.patch` decorators for:
      - `apps.common.outbox._record_outbox_event` → returns `None`
      - `apps.common.outbox.create_notification` → returns `MagicMock`
      - `apps.common.outbox.queue_email` → returns `MagicMock`
      - `apps.common.communication_service.CommunicationService.send` → no-op
      - `apps.common.communication_service.CommunicationService.render_template` → returns `("subject", "body")`
    - For tests that genuinely need DB access, upgrade to `TransactionTestCase` with `@pytest.mark.django_db`
    - No production code changes — only test files in `backend/tests/property/`
    - _Requirements: 1.2, 1.3, 1.4_

  - [-] 1.2 Write property test for SimpleTestCase DB isolation
    - **Property 1: SimpleTestCase DB Isolation**
    - Verify that all `SimpleTestCase`-based property tests have mocked outbox and communication service calls
    - **Validates: Requirements 1.2, 1.3, 1.4**

- [~] 2. Checkpoint — Verify CI is green
  - Run `python -m pytest tests/unit/ tests/property/ -x -q --tb=short` from `backend/`
  - Ensure all tests pass with exit code 0, ask the user if questions arise.
  - _Requirements: 1.1, 1.5_

- [ ] 3. Implement request metrics middleware (P1 — Observability)
  - [~] 3.1 Add `MetricsMiddleware` to `backend/apps/common/middleware.py`
    - Implement `MetricsMiddleware` class with `SKIP_PATHS` for health endpoints
    - Compute `duration_ms` via `time.monotonic()`, emit structured log with `type: "request_metric"`, `method`, `path`, `status_code`, `duration_ms`, `request_id`
    - Wrap metric emission in try/except to never block responses
    - _Requirements: 2.1, 2.2, 2.3, 2.5_
    - _Design: Section 2 (MetricsMiddleware)_

  - [~] 3.2 Update `JsonLogFormatter` in `backend/apps/common/logging.py`
    - Merge `extra` dict fields into JSON payload so `type`, `method`, `path`, `status_code`, `duration_ms` appear as top-level keys
    - _Requirements: 2.1, 2.5_

  - [~] 3.3 Register `MetricsMiddleware` in `MIDDLEWARE` in `backend/config/settings/base.py`
    - Insert after `RequestIDMiddleware` (position 5.5 in the stack)
    - _Requirements: 2.4_

  - [~] 3.4 Write property test for MetricsMiddleware structured log completeness
    - **Property 2: MetricsMiddleware Emits Complete Structured Logs**
    - **Validates: Requirements 2.1, 2.5**

  - [~] 3.5 Write property test for MetricsMiddleware health path skipping
    - **Property 3: MetricsMiddleware Skips Health Paths**
    - **Validates: Requirements 2.3**

  - [~] 3.6 Write property test for MetricsMiddleware duration positivity
    - **Property 4: MetricsMiddleware Duration Is Positive**
    - **Validates: Requirements 2.2**

- [ ] 4. Add business metrics logging (P1 — Observability)
  - [~] 4.1 Add payment completion metric in `backend/apps/documents/payment_service.py`
    - After payment transitions to `successful`, emit structured log with `type: "business_metric"`, `metric: "payment_completed"`, `amount`, `currency`
    - _Requirements: 3.1_
    - _Design: Section 3 (Business Metrics Logging)_

  - [~] 4.2 Add application submission metric in `backend/apps/applications/services.py`
    - After successful `draft → submitted` transition, emit structured log with `type: "business_metric"`, `metric: "application_submitted"`, `application_id`, `program`
    - _Requirements: 3.2_

  - [~] 4.3 Write property test for payment completion business metric
    - **Property 5: Payment Completion Business Metric**
    - **Validates: Requirements 3.1**

  - [~] 4.4 Write property test for application submission business metric
    - **Property 6: Application Submission Business Metric**
    - **Validates: Requirements 3.2**

- [ ] 5. Enhance readiness probe with Redis latency (P1 — Observability)
  - [~] 5.1 Modify `ReadinessView` in `backend/apps/common/health.py`
    - Replace `_check_redis()` with `_check_redis_with_latency()` returning `(status_str, latency_ms)`
    - Add `redis_latency_ms` to response body
    - Ensure Redis failure returns `"degraded"` with HTTP 200, HTTP 503 only on DB failure
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
    - _Design: Section 4 (Enhanced Readiness Probe)_

  - [~] 5.2 Write property test for readiness probe Redis status and latency
    - **Property 7: Readiness Probe Redis Status and Latency**
    - **Validates: Requirements 4.1, 4.2, 4.3**

  - [~] 5.3 Write property test for readiness probe 503 only on DB failure
    - **Property 8: Readiness Probe 503 Only On DB Failure**
    - **Validates: Requirements 4.4**

- [~] 6. Checkpoint — Verify observability changes pass tests
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 2.1–2.5, 3.1–3.3, 4.1–4.4_

- [ ] 7. Implement JTI blacklist recovery command (P2 — Redis Resilience)
  - [~] 7.1 Create `backend/apps/accounts/management/commands/recover_jti_blacklist.py`
    - Query `device_sessions` for active sessions (`is_active=True`, `expires_at > now`)
    - Force-expire all active sessions by setting `expires_at = now` (conservative approach since raw JWTs aren't stored)
    - Log count of sessions invalidated and expired sessions skipped
    - Exit with code 1 and descriptive error if Redis is unreachable
    - Create necessary `management/` and `commands/` directories with `__init__.py` files
    - _Requirements: 5.1, 5.2, 5.3_
    - _Design: Section 5 (JTI Blacklist Recovery Command)_

  - [~] 7.2 Update `docs/runbooks/redis-recovery.md` with recovery command documentation
    - Document when to run (after Redis flush/failover), command invocation, expected output, and impact
    - _Requirements: 5.4_

  - [~] 7.3 Write property test for JTI recovery command logging
    - **Property 9: JTI Recovery Command Logs Counts**
    - **Validates: Requirements 5.2**

- [ ] 8. Add CSRF degradation warning logging (P2 — Redis Resilience)
  - [~] 8.1 Add Redis degradation warning to `CSRFEnforcementMiddleware` in `backend/apps/common/middleware.py`
    - Add lightweight Redis health check (cache ping) at top of `__call__`
    - Log warning with `type: "csrf_redis_warning"` when Redis is unavailable
    - Rate-limit warning to once per 60 seconds using module-level timestamp
    - CSRF validation continues via Postgres regardless (already the current behavior)
    - _Requirements: 6.1, 6.2, 6.3_
    - _Design: Section 6 (CSRF Graceful Degradation)_

  - [~] 8.2 Write property test for CSRF validation during Redis downtime
    - **Property 10: CSRF Validation Works During Redis Downtime**
    - **Validates: Requirements 6.1**

  - [~] 8.3 Write property test for CSRF Redis degradation warning
    - **Property 11: CSRF Logs Warning During Redis Downtime**
    - **Validates: Requirements 6.3**

- [ ] 9. Split applications views module (P3 — Code Organization)
  - [~] 9.1 Create domain-scoped view files in `backend/apps/applications/`
    - Create `student_views.py` (~600 lines): `ApplicationCreateView`, `ApplicationDraftView`, `ApplicationSubmitView`, `ApplicationTrackView`, `ApplicationWithdrawView`, `ConfirmEnrollmentView`, `AmendmentCreateView`, `WaitlistPositionView`, `ConditionListView`
    - Create `admin_views.py` (~900 lines): `ApplicationListView`, `ApplicationReviewView`, `ApplicationBulkStatusView`, `ApplicationGradeView`, `ApplicationExportView`, `AssignReviewerView`, `AutoAssignView`, `FeeWaiverView`, `AmendmentReviewView`
    - Create `interview_views.py` (~300 lines): `InterviewListView`, `InterviewScheduleView`, `InterviewUpdateView`
    - Create `document_views.py` (~250 lines): `DocumentUploadView`, `DocumentListView`, `DocumentIntelligenceView`
    - Create `public_views.py` (~150 lines): `ApplicationTrackingPublicView`, `ProgramListView`
    - Extract shared helpers to `_view_helpers.py`
    - _Requirements: 7.1, 7.5_
    - _Design: Section 7 (Split Applications Views Module)_

  - [~] 9.2 Replace `views.py` with backward-compatible re-export module
    - Reduce `backend/apps/applications/views.py` to <100 lines of re-exports
    - Ensure all existing URL configurations and test imports continue to work
    - _Requirements: 7.2, 7.3, 7.4_

  - [~] 9.3 Write property test for view re-export completeness
    - **Property 12: View Re-exports Preserve All Class Names**
    - **Validates: Requirements 7.2, 7.4**

- [ ] 10. Break circular import dependencies (P3 — Code Organization)
  - [~] 10.1 Convert top-level cross-app imports to lazy imports
    - Fix `applications ↔ accounts`: move `Profile` import inside method body in views
    - Fix `common ↔ accounts`: move `Profile`, `CSRFToken` imports inside task function bodies
    - Fix `common ↔ catalog`: move catalog model imports inside `communication_service.py` method bodies
    - Fix `common ↔ integrations`: move shared utility imports inside function bodies
    - Fix `documents ↔ accounts`: move account model imports inside `payment_service.py` method bodies
    - Verify `applications ↔ documents` is already resolved by Django lazy model loading
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_
    - _Design: Section 8 (Break Circular Import Dependencies)_

  - [~] 10.2 Create CI governance script `backend/scripts/check_circular_imports.py`
    - Use AST to build import graph between `apps.*` packages
    - Exit non-zero if cycles are found
    - Skip files that fail AST parsing (log warning, don't fail CI)
    - _Requirements: 8.8_

  - [~] 10.3 Add circular import check as CI step in `.github/workflows/ci.yml`
    - Add step after `Django checks` to run `python scripts/check_circular_imports.py`
    - _Requirements: 8.7, 8.8_

- [~] 11. Checkpoint — Verify code organization changes pass tests
  - Run `python manage.py check` and full test suite
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 7.3, 8.7_

- [ ] 12. Implement Celery task lifecycle signals (P4 — Task Scheduling)
  - [~] 12.1 Create `backend/apps/common/celery_signals.py`
    - Register handlers for `task_prerun`, `task_postrun`, and `task_failure` Celery signals
    - Emit structured logs with `type: "task_lifecycle"` at each phase
    - Track start times in `_task_start_times` dict for duration computation
    - On `task_postrun`, also write `cache.set(f"task_last_run:{task.name}", time.time(), timeout=None)` for missed-task detection
    - Swallow all exceptions in signal handlers — never interfere with task execution
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 3.3_
    - _Design: Section 9 (Celery Task Lifecycle Signals)_

  - [~] 12.2 Register celery signals in `backend/config/celery.py`
    - Import `celery_signals` module in the Celery app's `ready()` or at module level
    - _Requirements: 9.4_

  - [~] 12.3 Write property test for Celery lifecycle signal logs
    - **Property 13: Celery Lifecycle Signals Emit Correct Logs**
    - **Validates: Requirements 9.1, 9.2, 9.3**

- [ ] 13. Implement missed task detection command (P4 — Task Scheduling)
  - [~] 13.1 Create `backend/apps/common/management/commands/check_missed_tasks.py`
    - Read `CELERY_BEAT_SCHEDULE` from Django settings
    - For each task, compute expected interval (handle both numeric and `crontab` schedules)
    - Query Redis for `task_last_run:{task_name}` key (set by lifecycle signal handler)
    - If `now - last_run > 2 * expected_interval`, log warning with `type: "missed_task"`, `task_name`, `expected_interval_seconds`, `last_run_at`
    - Report tasks with no recorded timestamp as missed
    - Exit 0 if all tasks within window; exit 1 if any missed
    - If Redis unavailable, report all tasks as missed and exit 1
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
    - _Design: Section 10 (Missed Task Detection Command)_

  - [~] 13.2 Write property test for missed task detection
    - **Property 14: Missed Task Detection Within 2x Interval**
    - **Validates: Requirements 10.2**

- [~] 14. Checkpoint — Verify task scheduling changes pass tests
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 9.1–9.4, 10.1–10.4_

- [ ] 15. Create scaling playbook and Beat HA documentation (P5 — Documentation)
  - [~] 15.1 Create `docs/runbooks/scaling-playbook.md`
    - Document Koyeb backend scaling (current 1-instance Uvicorn, steps to add instances)
    - Document Celery worker scaling (concurrency, Redis connection limits for Upstash free tier)
    - Document Neon Postgres connection pool sizing (0.25 CU tier, `CONN_MAX_AGE=300` rationale)
    - Document Vercel frontend scaling (automatic, no manual intervention)
    - Document Redis/Upstash scaling (free tier limits, upgrade path)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
    - _Design: Section 11 (Scaling Playbook)_

  - [~] 15.2 Add Celery Beat HA section to scaling playbook
    - Document current SPOF risk (single Beat instance, 16 tasks)
    - Document migration path to `celery-redbeat`
    - Document trade-offs (complexity, Redis dependency, Upstash free-tier limits)
    - Recommend: acceptable risk at current scale, migrate when adding >1 worker
    - _Requirements: 12.1, 12.2, 12.3_
    - _Design: Section 12 (Celery Beat HA Documentation)_

- [~] 16. Final checkpoint — Ensure all tests pass
  - Run full test suite: `python -m pytest tests/unit/ tests/property/ -x -q --tb=short`
  - Run `python manage.py check`
  - Run circular import check: `python scripts/check_circular_imports.py`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements and design sections for traceability
- Checkpoints ensure incremental validation after each priority tier
- Property tests validate universal correctness properties from the design document
- P0 (task 1) must be completed first to unblock CI — all other work depends on a green pipeline
- No new database tables are introduced — all changes use existing tables or in-memory/Redis state
- All property tests use Hypothesis (already installed) with `@settings(max_examples=100)`
