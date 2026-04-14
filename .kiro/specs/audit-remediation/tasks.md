# Implementation Plan: Audit Remediation

## Overview

Systematic remediation of 37 pre-launch audit findings across database (Neon MCP SQL), backend (Django 5 + DRF), and frontend (React + TypeScript). Execution follows strict phase ordering: database migrations first, then backend code changes, then frontend changes, then verification. All DB changes use Neon MCP SQL (project: `wild-bar-37055823`) — no Django migrations.

## Tasks

- [x] 1. Phase 1 — Database Migrations (Neon MCP SQL)
  - [x] 1.1 Migration 1: One-time enrollment sync for program_intakes
    - Execute UPDATE on `program_intakes.current_enrollment` to match actual application counts per program+intake combination
    - Run verification query to confirm `stored` equals `actual` for all 8 rows
    - _Requirements: 1.1, 1.4_

  - [x] 1.2 Migration 2: Permissions column type change
    - ALTER `user_permission_overrides.permissions` from `text[]` to `jsonb` using `COALESCE(to_jsonb(permissions), '[]'::jsonb)`
    - Set default to `'[]'::jsonb`
    - _Requirements: 5.1, 5.2_

  - [x] 1.3 Migration 3: IP address column width
    - ALTER `application_status_history.ip_address` from `varchar(45)` to `varchar(64)`
    - _Requirements: 7.1, 7.2_

  - [x] 1.4 Migration 4: Add unique constraints
    - Run duplicate-check queries for `applications.public_tracking_code`, `subjects.code`, and `notifications.idempotency_key`
    - If no duplicates, add UNIQUE constraints on all three columns
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 1.5 Write property test: IP address column accepts SHA-256 hashes
    - **Property 5: IP address column accepts SHA-256 hashes**
    - Verify `application_status_history.ip_address` accepts strings up to 64 characters without truncation
    - Test requires DB access — run after Migration 3
    - **Validates: Requirements 7.2**

  - [x] 1.6 Write property test: unique constraints reject duplicates
    - **Property 6: Unique constraints reject duplicates**
    - Verify duplicate non-null values on `applications.public_tracking_code`, `subjects.code`, `notifications.idempotency_key` are rejected
    - Test requires DB access — run after Migration 4
    - **Validates: Requirements 8.4**

  - [x] 1.7 Migration 5: Invalid status history cleanup
    - DELETE the 3 invalid status transition records from `application_status_history` for test application `a94bffb1-01bb-4a7f-969f-b8fa7ed2d1e8`
    - _Requirements: 10.1, 10.2_

- [x] 2. Phase 2 — Backend Code Changes: Enrollment & Models
  - [x] 2.1 Fix IntakeEnforcer.increment_enrollment() to update both tables
    - Modify `backend/apps/applications/intake_enforcer.py` — change method signature to accept `program_name` parameter
    - After existing `Intake` update, resolve program and atomically increment matching `ProgramIntake` row using `F()` expression
    - Similarly update `decrement_enrollment()` to accept `program_name` and decrement `ProgramIntake`
    - Update call site in `backend/apps/applications/services.py` (`submit_application()`) to pass `program_name`
    - _Requirements: 1.2, 1.3_

  - [x] 2.2 Write property test: enrollment increment updates both tables
    - **Property 1: Enrollment increment updates both tables**
    - Test in `backend/tests/property/test_enrollment_sync.py`
    - **Validates: Requirements 1.2**

  - [x] 2.3 Refactor IntakeEnforcer.sync_enrollment() to fix N+1 queries
    - Replace per-row count queries with single aggregation query using `.values("program").annotate(cnt=Count("id"))`
    - Build count_map and batch-update all `ProgramIntake` rows
    - Reduce N+1 to 2 queries regardless of program+intake count
    - _Requirements: 16.1, 16.2, 16.3_

  - [x] 2.4 Write property test: enrollment sync produces correct counts
    - **Property 2: Enrollment sync produces correct counts**
    - Test in `backend/tests/property/test_enrollment_sync.py`
    - **Validates: Requirements 1.4**

  - [x] 2.5 Write property test: sync enrollment metamorphic equivalence
    - **Property 11: Sync enrollment metamorphic equivalence**
    - Test in `backend/tests/property/test_enrollment_sync.py`
    - **Validates: Requirements 16.2, 16.3**

  - [x] 2.6 Fix Profile.role and Payment.status nullability
    - In `backend/apps/accounts/models.py`: remove `null=True` from `Profile.role`, add `default='student'`
    - In `backend/apps/documents/models.py`: remove `null=True` from `Payment.status`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 2.7 Write property test: model fields with NOT NULL constraints reject None
    - **Property 3: Model fields with NOT NULL DB constraints reject None**
    - Test in `backend/tests/property/test_model_nullability.py`
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

- [x] 3. Checkpoint — Verify enrollment and model fixes
  - Ensure all tests pass, ask the user if questions arise.


- [x] 4. Phase 2 — Backend Code Changes: Middleware, Pagination & Retry
  - [x] 4.1 Add SecurityHeadersMiddleware hardening
    - In `backend/apps/common/middleware.py`, add `X-XSS-Protection: 1; mode=block` header
    - Add `Content-Security-Policy` header with restrictive policy allowing Lenco widget (`pay.lenco.co`, `api.lenco.co`)
    - Include `'unsafe-inline'` for `style-src` (Tailwind CSS requirement)
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 4.2 Write property test: security headers present on all responses
    - **Property 8: Security headers present on all responses**
    - Test in `backend/tests/property/test_security_headers.py`
    - **Validates: Requirements 12.1, 12.2, 12.3**

  - [x] 4.3 Add NotificationListView pagination
    - In `backend/apps/common/notification_views.py`, replace unbounded queryset with `StandardPagination`
    - Use `paginator.paginate_queryset()` and `paginator.get_paginated_response()` pattern
    - Default page_size=20 consistent with other list endpoints
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 4.4 Write property test: notification list is paginated
    - **Property 7: Notification list is paginated**
    - Test in `backend/tests/property/test_notification_pagination.py`
    - **Validates: Requirements 11.1, 11.2**

  - [x] 4.5 Add send_bulk_notifications_task retry logic
    - In `backend/apps/common/tasks.py`, add `self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))` in exception handler
    - Handle `MaxRetriesExceededError` with detailed logging of notification IDs and last error
    - _Requirements: 15.1, 15.2, 15.3_

  - [x] 4.6 Write property test: bulk notification task retries on transient errors
    - **Property 10: Bulk notification task retries on transient errors**
    - Test in `backend/tests/property/test_bulk_notification_retry.py`
    - **Validates: Requirements 15.1, 15.2**

- [x] 5. Phase 2 — Backend Code Changes: Test Fixes & Documentation
  - [x] 5.1 Fix test_admin_override.py for environments without local Postgres
    - In `backend/tests/property/test_admin_override.py`, add `_pg_available()` helper using `socket.create_connection`
    - Add `@pytest.mark.skipif(not _pg_available(), reason="Local Postgres not available")` to `TestAdminPaymentStatusOverride`
    - _Requirements: 3.1, 3.4_

  - [x] 5.2 Fix test_submission_gates.py to mock IdentifierResolver
    - In `backend/tests/property/test_submission_gates.py`, mock `IdentifierResolver.resolve_intake()` in test setup
    - Return `MagicMock(source="not_found", id=None)` so `SimpleTestCase` tests don't trigger `DatabaseOperationForbidden`
    - _Requirements: 3.2, 3.3_

  - [x] 5.3 Add code comments for legacy columns and patterns
    - In `backend/apps/applications/models.py`: add comment above `Application` class documenting 7 legacy unmapped payment columns (`payment_method`, `payer_name`, `payer_phone`, `amount`, `paid_at`, `momo_ref`, `pop_url`)
    - In `backend/apps/applications/models.py` or `backend/apps/documents/payment_service.py`: add comment documenting 20 legacy applications with `payment_status` but no `payments` record
    - In `backend/apps/documents/payment_service.py`: add comment on `verify_payment()` documenting synchronous `requests.post()` as known ASGI limitation
    - _Requirements: 6.1, 6.2, 9.1, 9.2, 13.1, 13.2_

  - [x] 5.4 Write property test: permissions JSONField round-trip
    - **Property 4: Permissions JSONField round-trip**
    - Test in `backend/tests/property/test_permissions_roundtrip.py`
    - **Validates: Requirements 5.2, 5.3**

- [x] 6. Checkpoint — Verify all backend changes
  - Ensure all tests pass, ask the user if questions arise.


- [x] 7. Phase 3 — Frontend Code Changes: Status Constants & PaymentStep
  - [x] 7.1 Verify waitlisted status rendering
    - Confirm `waitlisted` is in `APPLICATION_STATUSES` in `apps/admissions/src/types/applicationStatus.ts`
    - Confirm badge styles exist in `apps/admissions/src/lib/applicationStatusUi.ts`
    - Confirm `ApplicationStatus.tsx` timeline renders `waitlisted` entries — add to timeline rendering logic if hardcoded status checks skip it
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 7.2 Remove pending_documents phantom status
    - Remove `pending_documents` from `APPLICATION_STATUSES` array in `apps/admissions/src/types/applicationStatus.ts`
    - Remove from `APPLICATION_STATUS_LABELS` map
    - Remove from badge styles in `apps/admissions/src/lib/applicationStatusUi.ts`
    - Update unit test in `apps/admissions/tests/unit/applicationStatusUi.test.ts` to remove `pending_documents` from expected values
    - _Requirements: 14.1, 14.3_

  - [x] 7.3 Write property test: frontend status set matches backend status set
    - **Property 9: Frontend status set matches backend status set**
    - Test in `apps/admissions/tests/unit/applicationStatus.test.ts`
    - **Validates: Requirements 14.3**

  - [x] 7.4 Improve PaymentStep UX
    - In `apps/admissions/src/pages/student/applicationWizard/steps/PaymentStep.tsx`:
    - Add tooltip/helper text when "Pay now" button is disabled explaining why (fee loading, widget unavailable, payment in progress)
    - Improve null `applicationId` error message to guide student: "Please save your application before proceeding to payment. Go back to Step 1 and ensure your details are saved."
    - _Requirements: 17.1, 17.2, 17.3_

  - [x] 7.5 Write property test: disabled payment button shows explanation
    - **Property 12: Disabled payment button shows explanation**
    - Test in `apps/admissions/tests/unit/paymentStep.test.ts`
    - **Validates: Requirements 17.1**

- [x] 8. Phase 3 — Frontend Code Changes: Admin Capacity & Enrollment
  - [x] 8.1 Add admin capacity warning on approval review page
    - In the admin review page component consuming the review endpoint response:
    - When `intake_enrollment >= 0.8 * intake_capacity`, display amber capacity warning with percentage and counts
    - When `intake_enrollment >= intake_capacity`, display red over-capacity alert
    - Fail-safe: do not render warning if capacity data is null/undefined
    - _Requirements: 18.1, 18.2, 18.3_

  - [x] 8.2 Write property test: capacity warning at enrollment threshold
    - **Property 13: Capacity warning at enrollment threshold**
    - Test in `apps/admissions/tests/unit/capacityWarning.test.ts`
    - **Validates: Requirements 18.2, 18.3**

  - [x] 8.3 Add enrollment display to admin Intakes page
    - In `apps/admissions/src/pages/admin/Intakes.tsx`:
    - Add `current_enrollment` to the `Intake` TypeScript interface
    - Display enrollment alongside capacity in table/card view
    - Add visual utilization indicator: green (< 80%), amber (80-99%), red (>= 100%)
    - _Requirements: 19.1, 19.2, 19.3_

  - [x] 8.4 Write property test: intake utilization visual indicator
    - **Property 14: Intake utilization visual indicator**
    - Test in `apps/admissions/tests/unit/intakeUtilization.test.ts`
    - **Validates: Requirements 19.3**

- [x] 9. Checkpoint — Verify all frontend changes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Phase 4 — Final Verification
  - [x] 10.1 Run full backend test suite
    - Execute `cd backend && python3 -m pytest` and verify all tests pass
    - Confirm `test_admin_override.py` skips gracefully without local Postgres
    - Confirm `test_submission_gates.py` passes without local Postgres
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 10.2 Run full frontend test suite
    - Execute `cd apps/admissions && bun run test` and verify all tests pass
    - Confirm `pending_documents` removal does not break any tests
    - Confirm `waitlisted` status renders correctly
    - _Requirements: 2.1, 14.1_

  - [x] 10.3 Final checkpoint — Ensure all tests pass
    - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Database migrations (Phase 1) MUST run before backend code changes (Phase 2)
- All SQL executed via Neon MCP against project `wild-bar-37055823` — no Django migrations
- Each property test references its design document property number
- Backend property tests use `pytest` + `hypothesis` with `@settings(max_examples=100)`
- Frontend property tests use `vitest` + `fast-check` with `{ numRuns: 100 }`
- Requirement 20 (optional improvements) is tracked but not included as tasks — address post-launch
