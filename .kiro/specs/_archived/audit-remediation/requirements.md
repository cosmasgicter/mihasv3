# Requirements Document — Audit Remediation

## Introduction

Systematic remediation of all 37 issues identified during the MIHAS pre-launch audit (`.kiro/specs/pre-launch-audit/audit-report.md`). Issues span database schema drift, enrollment sync bugs, test environment failures, missing constraints, security headers, frontend status gaps, UX deficiencies, and performance patterns. Each requirement maps to one or more audit finding IDs (AUDIT-X.Y-NNN) for traceability. The platform uses Django 5 + DRF with Neon Postgres (`managed=False` models), so database changes require direct SQL via Neon MCP rather than Django migrations.

## Glossary

- **Remediation_Engine**: The process that implements fixes for audit findings across backend, frontend, and database layers
- **Neon_MCP**: The Neon Management Console Protocol used to execute SQL statements against the production Neon Postgres database
- **IntakeEnforcer**: The backend component at `backend/apps/applications/intake_enforcer.py` responsible for intake capacity checks and enrollment synchronization
- **SecurityHeadersMiddleware**: The Django middleware at `backend/apps/common/middleware.py` that sets HTTP security headers on all responses
- **NotificationListView**: The backend view serving `GET /api/v1/notifications/` for user notification retrieval
- **FeeResolver**: The backend component at `backend/apps/documents/fee_resolver.py` that resolves application fees by program and residency
- **PaymentStep**: The React component at `apps/admissions/src/pages/student/applicationWizard/steps/PaymentStep.tsx` handling the Lenco payment widget
- **ApplicationStatus**: The React component at `apps/admissions/src/pages/student/ApplicationStatus.tsx` displaying application status timeline
- **Intakes_Page**: The admin React page at `apps/admissions/src/pages/admin/Intakes.tsx` displaying intake management
- **APPLICATION_STATUSES**: The frontend constant defining all valid application status values
- **Celery_Task**: A background task executed by the Celery worker process
- **Admin_Review_Page**: The admin application review interface consuming the review endpoint response

## Requirements

### Requirement 1: Enrollment Count Synchronization (CRITICAL)

**User Story:** As a platform operator, I want enrollment counts in `program_intakes` to reflect actual submitted application counts, so that intake capacity enforcement is accurate and no students are incorrectly blocked or admitted.

**Audit Refs:** AUDIT-1.6-001, AUDIT-1.6-002

#### Acceptance Criteria

1. WHEN the Remediation_Engine executes a one-time sync, THE Neon_MCP SHALL update `program_intakes.current_enrollment` for all 8 rows to match the count of applications with status in ('submitted', 'under_review', 'approved', 'waitlisted') for each program+intake combination (AUDIT-1.6-001)
2. WHEN IntakeEnforcer.increment_enrollment() is called after a successful application submission, THE IntakeEnforcer SHALL update both `intakes.current_enrollment` and `program_intakes.current_enrollment` atomically (AUDIT-1.6-002)
3. THE IntakeEnforcer.increment_enrollment() SHALL use a single SQL UPDATE statement per table to avoid partial updates
4. FOR ALL program+intake combinations, querying `program_intakes.current_enrollment` after the one-time sync SHALL return a value equal to the count of non-terminal applications for that combination (round-trip verification)

### Requirement 2: Frontend Status Constant Verification (CRITICAL)

**User Story:** As a developer, I want the frontend APPLICATION_STATUSES constant to include all valid backend statuses, so that no status value causes rendering errors or missing UI states.

**Audit Refs:** AUDIT-5.3-001, AUDIT-7.4-001

#### Acceptance Criteria

1. THE APPLICATION_STATUSES constant SHALL include the `waitlisted` status value (AUDIT-5.3-001 — verify fix is still in place)
2. THE ApplicationStatus timeline component SHALL render a timeline entry for the `waitlisted` status with appropriate label and icon (AUDIT-7.4-001)
3. WHEN an application has status `waitlisted`, THE ApplicationStatus component SHALL display the status without errors or missing UI elements

### Requirement 3: Test Environment Compatibility (BLOCKER)

**User Story:** As a developer, I want all property tests to pass in environments without a local Postgres instance, so that the test suite is reliable across development machines and CI.

**Audit Refs:** AUDIT-1.1-001, AUDIT-1.1-002

#### Acceptance Criteria

1. WHEN a local Postgres instance is unavailable, THE test suite SHALL skip `test_admin_override.py` tests gracefully using `@pytest.mark.skipif` or equivalent conditional skip (AUDIT-1.1-001)
2. THE `test_submission_gates.py` test setup SHALL mock `IdentifierResolver.resolve_intake()` so that tests do not trigger `DatabaseOperationForbidden` errors when using `SimpleTestCase` (AUDIT-1.1-002)
3. WHEN all 6 affected tests in `test_submission_gates.py` are run without a local database, THE test suite SHALL report them as passed (not errored or failed)
4. WHEN the 2 affected tests in `test_admin_override.py` are run without a local database, THE test suite SHALL report them as skipped (not errored)

### Requirement 4: Django Model Nullability Alignment (WARNING)

**User Story:** As a developer, I want Django model field nullability to match database column constraints, so that saving model instances does not raise unexpected IntegrityError exceptions.

**Audit Refs:** AUDIT-1.3-001, AUDIT-1.3-004

#### Acceptance Criteria

1. THE Profile model `role` field SHALL NOT include `null=True`, aligning with the database `NOT NULL DEFAULT 'student'` constraint (AUDIT-1.3-001)
2. THE Payment model `status` field SHALL NOT include `null=True`, aligning with the database `NOT NULL DEFAULT 'pending'` constraint (AUDIT-1.3-004)
3. WHEN a Profile instance is saved without an explicit `role` value, THE Profile model SHALL default to 'student' rather than allowing None
4. WHEN a Payment instance is saved without an explicit `status` value, THE Payment model SHALL default to 'pending' rather than allowing None

### Requirement 5: Permission Override Column Type Migration (WARNING)

**User Story:** As a developer, I want the `user_permission_overrides.permissions` column type to match the Django JSONField expectation, so that reading and writing permission data does not cause type casting errors.

**Audit Ref:** AUDIT-1.3-002

#### Acceptance Criteria

1. THE Neon_MCP SHALL alter the `user_permission_overrides.permissions` column from `text[]` to `jsonb` with an appropriate default of `'[]'::jsonb` (AUDIT-1.3-002)
2. WHEN existing `text[]` data exists in the column, THE migration SHALL convert the array values to a JSON array representation
3. AFTER the migration, THE Django JSONField SHALL read and write `user_permission_overrides.permissions` without type casting errors

### Requirement 6: Legacy Column Documentation (WARNING)

**User Story:** As a developer, I want legacy unmapped database columns documented in the Django model, so that future developers understand why 7 payment columns exist in the `applications` table but are not mapped.

**Audit Ref:** AUDIT-1.3-003

#### Acceptance Criteria

1. THE Application model SHALL include a code comment listing the 7 legacy pre-Lenco payment columns (`payment_method`, `payer_name`, `payer_phone`, `amount`, `paid_at`, `momo_ref`, `pop_url`) as intentionally unmapped (AUDIT-1.3-003)
2. THE comment SHALL state that these columns are deprecated since the Lenco payment integration and that payment data now lives in the `payments` table

### Requirement 7: IP Address Column Width Fix (WARNING)

**User Story:** As a developer, I want the `application_status_history.ip_address` column to accept SHA-256 hashes (64 characters), so that hashed IP addresses are not truncated or rejected by the database.

**Audit Ref:** AUDIT-1.3-005

#### Acceptance Criteria

1. THE Neon_MCP SHALL alter `application_status_history.ip_address` from `varchar(45)` to `varchar(64)` (AUDIT-1.3-005)
2. AFTER the migration, THE database column SHALL accept strings up to 64 characters without raising `DataError`

### Requirement 8: Missing Unique Constraints (WARNING)

**User Story:** As a platform operator, I want database-level unique constraints on columns declared unique in Django, so that concurrent writes and raw SQL cannot create duplicate records.

**Audit Refs:** AUDIT-1.4-001, AUDIT-1.4-002, AUDIT-1.4-003

#### Acceptance Criteria

1. THE Neon_MCP SHALL add a UNIQUE constraint on `applications.public_tracking_code` (AUDIT-1.4-001)
2. THE Neon_MCP SHALL add a UNIQUE constraint on `subjects.code` (AUDIT-1.4-002)
3. THE Neon_MCP SHALL add a UNIQUE constraint on `notifications.idempotency_key` (AUDIT-1.4-003)
4. AFTER adding constraints, THE database SHALL reject duplicate values on insert for each of these columns
5. IF existing duplicate values are found before adding a constraint, THEN THE Remediation_Engine SHALL resolve duplicates before applying the constraint


### Requirement 9: Legacy Data Documentation (WARNING)

**User Story:** As a developer, I want legacy payment-status inconsistencies documented, so that the 20 applications with `payment_status` but no `payments` record are understood as a known pre-Lenco pattern.

**Audit Ref:** AUDIT-2.3-001

#### Acceptance Criteria

1. THE Application model or PaymentService SHALL include a code comment documenting that 20 legacy applications have `payment_status` values but no corresponding `payments` record due to the pre-Lenco manual payment flow (AUDIT-2.3-001)
2. THE comment SHALL state that these applications predate the Lenco integration and that no remediation is needed for their payment records

### Requirement 10: Invalid Status Transition Cleanup (WARNING)

**User Story:** As a platform operator, I want invalid status transition records removed from the test application, so that the status history chain is clean and audit queries do not flag false positives.

**Audit Ref:** AUDIT-2.4-001

#### Acceptance Criteria

1. THE Neon_MCP SHALL delete the 3 invalid status transition records from `application_status_history` for test application APP-20260401-D169738A (AUDIT-2.4-001)
2. AFTER deletion, THE remaining status history for that application SHALL contain only valid transitions per the allowed transition map

### Requirement 11: Notification Pagination (WARNING)

**User Story:** As a platform operator, I want the notification list endpoint to return paginated results, so that users with many notifications do not trigger unbounded queries.

**Audit Ref:** AUDIT-4.4-001

#### Acceptance Criteria

1. THE NotificationListView SHALL use `StandardPagination` or apply a LIMIT to query results (AUDIT-4.4-001)
2. WHEN a user has more notifications than the page size, THE NotificationListView SHALL return paginated results using the standard `{page, pageSize, totalCount, results}` envelope
3. THE default page size SHALL be consistent with other paginated list endpoints in the platform

### Requirement 12: Security Headers Hardening (WARNING)

**User Story:** As a platform operator, I want all HTTP responses to include `X-XSS-Protection` and `Content-Security-Policy` headers, so that the platform has defense-in-depth against cross-site scripting attacks.

**Audit Ref:** AUDIT-5.1-001

#### Acceptance Criteria

1. THE SecurityHeadersMiddleware SHALL set the `X-XSS-Protection` header to `1; mode=block` on all responses (AUDIT-5.1-001)
2. THE SecurityHeadersMiddleware SHALL set a `Content-Security-Policy` header with a restrictive default policy on all responses
3. WHEN any HTTP response is returned by the backend, THE response SHALL include both `X-XSS-Protection` and `Content-Security-Policy` headers

### Requirement 13: Synchronous Lenco API Documentation (WARNING)

**User Story:** As a developer, I want the synchronous Lenco API call in the ASGI path documented as a known limitation, so that the team plans an async migration post-launch without treating it as an unknown risk.

**Audit Refs:** AUDIT-5.2-001, AUDIT-5.6-002

#### Acceptance Criteria

1. THE PaymentService.verify_payment() method SHALL include a code comment documenting that the synchronous `requests.post()` call to the Lenco API blocks the ASGI event loop (AUDIT-5.2-001, AUDIT-5.6-002)
2. THE comment SHALL note this as a known limitation for launch with a planned post-launch migration to `httpx` async client or offloading to a Celery task

### Requirement 14: Phantom Frontend Status Cleanup (WARNING)

**User Story:** As a developer, I want the frontend `pending_documents` status either justified or removed, so that the frontend status set matches the backend status set exactly.

**Audit Ref:** AUDIT-5.3-002

#### Acceptance Criteria

1. IF `pending_documents` is not a valid backend application status, THEN THE Remediation_Engine SHALL remove it from the frontend status definitions (AUDIT-5.3-002)
2. IF `pending_documents` is a planned future status, THEN THE Remediation_Engine SHALL add a code comment documenting its intended use
3. AFTER remediation, THE frontend application status set SHALL contain only statuses that the backend can produce, plus any explicitly documented future statuses

### Requirement 15: Celery Task Retry Logic (WARNING)

**User Story:** As a platform operator, I want `send_bulk_notifications_task` to actually retry on transient failures, so that bulk notification sends are resilient to temporary network or database issues.

**Audit Ref:** AUDIT-5.5-001

#### Acceptance Criteria

1. THE `send_bulk_notifications_task` SHALL call `self.retry()` when a transient error occurs, using the existing `max_retries=3` configuration (AUDIT-5.5-001)
2. WHEN a transient failure occurs (network timeout, temporary database unavailability), THE task SHALL retry with exponential backoff
3. IF all retries are exhausted, THEN THE task SHALL log the failure with sufficient context for manual investigation

### Requirement 16: Enrollment Sync N+1 Fix (WARNING)

**User Story:** As a developer, I want `IntakeEnforcer.sync_enrollment()` to use a single aggregation query instead of N+1 queries, so that enrollment synchronization scales with the number of intakes.

**Audit Ref:** AUDIT-5.6-001

#### Acceptance Criteria

1. THE IntakeEnforcer.sync_enrollment() SHALL use a single aggregation query (e.g., `GROUP BY` with `COUNT`) to compute enrollment counts for all relevant program+intake combinations (AUDIT-5.6-001)
2. THE refactored method SHALL produce the same enrollment counts as the original N+1 implementation
3. FOR ALL valid sets of applications and intakes, THE single-query result SHALL equal the per-intake loop result (metamorphic property)

### Requirement 17: Payment Step UX Improvements (WARNING)

**User Story:** As a student, I want clear guidance when the payment step is not yet available and helpful error messages when something goes wrong, so that I understand what to do next.

**Audit Refs:** AUDIT-7.2-001, AUDIT-7.3-002

#### Acceptance Criteria

1. WHEN the "Next Step" button on the payment step is disabled, THE PaymentStep SHALL display a tooltip or helper text explaining why the button is disabled (AUDIT-7.2-001)
2. WHEN the `applicationId` is null on the PaymentStep, THE PaymentStep SHALL display a user-friendly error message instead of a generic or unhelpful error (AUDIT-7.3-002)
3. THE error message SHALL guide the student on how to resolve the issue (e.g., "Please save your application before proceeding to payment")

### Requirement 18: Admin Capacity Warning (WARNING)

**User Story:** As an admin, I want to see a warning when approving an application for an intake that is near or at capacity, so that I can make informed decisions about over-enrollment.

**Audit Ref:** AUDIT-7.5-001

#### Acceptance Criteria

1. THE Admin_Review_Page SHALL consume `intake_capacity` and `intake_enrollment` fields from the review endpoint response (AUDIT-7.5-001)
2. WHEN `intake_enrollment` is at or above 80% of `intake_capacity`, THE Admin_Review_Page SHALL display a capacity warning before the admin confirms approval
3. WHEN `intake_enrollment` equals or exceeds `intake_capacity`, THE Admin_Review_Page SHALL display a prominent over-capacity alert

### Requirement 19: Admin Intakes Enrollment Display (WARNING)

**User Story:** As an admin, I want the Intakes management page to display current enrollment counts, so that I can monitor intake utilization at a glance.

**Audit Ref:** AUDIT-7.6-001

#### Acceptance Criteria

1. THE Intakes_Page SHALL display `current_enrollment` alongside `capacity` for each intake (AUDIT-7.6-001)
2. THE intake TypeScript interface SHALL include a `current_enrollment` field
3. WHEN `current_enrollment` approaches or exceeds `capacity`, THE Intakes_Page SHALL visually indicate the utilization level (e.g., color coding or progress bar)

### Requirement 20: Optional Improvements (INFO)

**User Story:** As a developer, I want known improvement opportunities tracked and optionally addressed, so that the codebase quality improves incrementally after launch.

**Audit Refs:** AUDIT-1.1-003, AUDIT-1.1-004, AUDIT-5.1-002, AUDIT-5.2-002, AUDIT-5.4-001, AUDIT-5.4-002, AUDIT-4.1-001, AUDIT-7.1-001, AUDIT-7.1-002, AUDIT-7.2-002, AUDIT-7.3-001, AUDIT-7.4-002, AUDIT-7.4-003, AUDIT-7.5-002, AUDIT-7.5-003, AUDIT-7.6-002, AUDIT-7.6-003

#### Acceptance Criteria

1. WHERE the team chooses to address pre-existing property test failures, THE Remediation_Engine SHALL fix test generators for the ~20+ failing property tests (AUDIT-1.1-003)
2. WHERE the team chooses to address slow tests, THE Remediation_Engine SHALL add a `@settings(deadline=...)` configuration to `test_sse_delivery.py` (AUDIT-1.1-004)
3. WHERE the team chooses to address stale sessions, THE Remediation_Engine SHALL add a Celery periodic task to clean up expired `DeviceSession` records (AUDIT-5.1-002)
4. WHERE the team chooses to address misleading documentation, THE Remediation_Engine SHALL update the `ApplicationDraft` model docstring to accurately reflect its deprecated status (AUDIT-5.4-001)
5. WHERE the team chooses to address dead code, THE Remediation_Engine SHALL remove the unused `emailService.ts` module (AUDIT-5.4-002, AUDIT-4.1-001)
6. WHERE the team chooses to address minor UX improvements, THE Remediation_Engine SHALL implement the improvements cataloged under AUDIT-7.x-00x info-level findings
