# Implementation Plan: Pre-Launch Audit

## Overview

A 6-phase bottom-up audit of the MIHAS platform. Each phase builds on findings from the layer below: Schema → Data Integrity → Wiring → Logic → UX → Report. The executing agent will use Neon MCP for database inspection, code analysis tools for codebase review, and test runners for regression verification. Findings are collected into a structured audit report with severity classifications.

## Tasks

- [x] 1. Phase 1 — Database Schema Audit
  - [x] 1.1 Run existing test suites to establish baseline
    - Run `cd backend && python3 -m pytest tests/unit/ -q` and `cd backend && python3 -m pytest tests/property/ -q`
    - Run `bun run build:admissions` and `bun run type-check:jobs-ops`
    - Run `bun run lint:admissions` and `bun run lint:jobs-ops`
    - Flag any failures as `blocker` issues
    - _Requirements: 14.1_

  - [x] 1.2 Verify table existence for all Django managed=False models
    - Query `information_schema.tables` via Neon MCP for each table listed in the design (profiles, device_sessions, login_attempts, password_reset_tokens, csrf_tokens, user_permission_overrides, applications, application_status_history, application_drafts, application_interviews, institutions, programs, intakes, program_intakes, subjects, course_requirements, application_documents, application_grades, payments, program_fees, webhook_event_logs, audit_logs, notifications, error_logs, email_queue)
    - Flag missing tables as `blocker`
    - _Requirements: 1.4_

  - [x] 1.3 Compare Django model fields against Neon Postgres columns
    - For each model in accounts, applications, catalog, documents, common apps: read the model definition, then query `information_schema.columns` for the corresponding table
    - Compare column name, data type mapping, nullability, and defaults
    - Classify mismatches as `breaking` (runtime error risk) or `cosmetic` (compatible but imprecise)
    - _Requirements: 1.1, 1.7_

  - [x] 1.4 Verify foreign key, unique, and primary key constraints
    - Query `information_schema.table_constraints` and `information_schema.key_column_usage` via Neon MCP
    - Compare against Django ForeignKey fields, `unique=True`, `unique_together`, and model PKs
    - Flag missing FK constraints as `critical`, missing unique constraints as `warning`
    - _Requirements: 1.2, 1.3_

  - [x] 1.5 Detect unmapped tables in the public schema
    - Query all tables in `public` schema, diff against Django model `db_table` values
    - Assess each unmapped table: orphaned vs intentionally unmanaged
    - _Requirements: 1.5_

  - [x] 1.6 Verify enrollment count synchronization
    - Run SQL comparing `program_intakes.current_enrollment` against `COUNT(*)` of applications with status in ('submitted', 'under_review', 'approved', 'waitlisted') per program+intake
    - Flag mismatches as `critical`
    - _Requirements: 1.6_

  - [x] 1.7 Write property test for schema field correspondence (Property 1)
    - **Property 1: Schema field correspondence**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**

  - [x] 1.8 Write property test for type mismatch severity classification (Property 3)
    - **Property 3: Type mismatch severity is deterministic**
    - **Validates: Requirements 1.7**

- [x] 2. Phase 2 — Data Integrity Audit
  - [x] 2.1 Check referential integrity across all child tables
    - Run orphaned record queries via Neon MCP: applications→profiles, application_documents→applications, application_grades→applications, payments→applications, application_status_history→applications, application_interviews→applications
    - Categorize orphans by table, count, and likely cause
    - _Requirements: 2.1, 2.2, 2.7_

  - [x] 2.2 Verify payment amount consistency
    - Run SQL comparing `payments.amount` against `program_fees.amount` for each payment's application program and residency category
    - Flag mismatches as `critical`
    - _Requirements: 2.3_

  - [x] 2.3 Verify payment status consistency
    - Run SQL checking that applications with `payment_status` in ('verified', 'paid', 'force_approved') have a corresponding `payments` record with `status = 'successful'`
    - Flag inconsistencies as `critical`
    - _Requirements: 2.4_

  - [x] 2.4 Validate status history chains
    - Run SQL checking `application_status_history` for invalid `(old_status, new_status)` transitions against the allowed transition map
    - Flag invalid transitions as `critical`
    - _Requirements: 2.5_

  - [x] 2.5 Verify program fee coverage
    - Run SQL checking that every active program has both `local` and `international` residency entries with `fee_type = 'application'` in `program_fees`
    - Flag missing fee rows as `critical`
    - _Requirements: 2.6_

  - [x] 2.6 Write property test for referential integrity (Property 4)
    - **Property 4: Referential integrity across child tables**
    - **Validates: Requirements 2.1, 2.2**

  - [x] 2.7 Write property test for payment-fee matching (Property 5)
    - **Property 5: Payment amount matches program fee**
    - **Validates: Requirements 2.3**

  - [x] 2.8 Write property test for status history validity (Property 7)
    - **Property 7: Status history chain validity**
    - **Validates: Requirements 2.5**

  - [x] 2.9 Write property test for program fee coverage (Property 8)
    - **Property 8: Program fee coverage**
    - **Validates: Requirements 2.6**

- [x] 3. Checkpoint — Schema and data integrity
  - Ensure all Phase 1 and Phase 2 findings are documented, ask the user if questions arise.

- [x] 4. Phase 3 — Wiring Audit
  - [x] 4.1 Trace admissions frontend API calls to backend endpoints
    - Scan each service module in `apps/admissions/src/services/` (applications.ts, auth.ts, catalog.ts, documents.ts, interviews.ts, notifications.ts, sessionService.ts) and `apps/admissions/src/services/admin/` (dashboard.ts, audit.ts, users.ts)
    - Extract all API URL patterns from `apiClient` calls
    - Compare against registered URL patterns in `backend/config/urls.py` and app-level `urls.py` files
    - Flag unmatched frontend URLs as `blocker`
    - _Requirements: 3.1, 3.7_

  - [x] 4.2 Verify backend view implementations are non-trivial
    - For each URL pattern matched in 4.1, read the view class and verify HTTP method handlers have real implementations (not `pass` or empty bodies)
    - Flag stub views as `critical`
    - _Requirements: 3.2_

  - [x] 4.3 Verify serializer field mappings
    - For each serializer used in matched views, verify every field in `Meta.fields` maps to a model field, `SerializerMethodField`, or annotated queryset column
    - Flag unmapped fields as `critical`
    - _Requirements: 3.3_

  - [x] 4.4 Verify pagination envelope on list endpoints
    - For list views, verify usage of `StandardPagination` and the `{page, pageSize, totalCount, results}` envelope
    - Flag non-standard pagination as `warning`
    - _Requirements: 3.4_

  - [x] 4.5 Verify admin endpoints require admin authentication
    - For endpoints called by admin service modules, verify the view's `permission_classes` includes `IsAdminOrSuperAdmin`
    - Flag missing admin auth as `blocker`
    - _Requirements: 3.7_

  - [x] 4.6 Trace jobs-ops frontend API calls to backend endpoints
    - Scan `apps/jobs-ops/src/services/api/` modules, extract API URLs, compare against backend URL patterns
    - Flag unmatched URLs as `warning` (jobs-ops is not primary launch target)
    - _Requirements: 3.5, 13.2_

  - [x] 4.7 Verify frontend build and type-check pass
    - Run `bun run build:admissions` to verify no build errors
    - Run `bun run type-check:jobs-ops` to verify type safety
    - Flag failures as `blocker`
    - _Requirements: 13.6_

  - [x] 4.8 Write property test for frontend-backend URL mapping (Property 9)
    - **Property 9: Frontend API calls map to backend endpoints**
    - **Validates: Requirements 3.1, 3.5, 13.2**

  - [x] 4.9 Write property test for admin endpoint auth (Property 13)
    - **Property 13: Admin endpoints require admin authentication**
    - **Validates: Requirements 3.7, 13.4**

- [x] 5. Phase 4 — Logic Audit
  - [x] 5.1 Audit authentication and session security
    - Read `JWTAuthenticationMiddleware`: verify token extraction from HTTP-only cookies, expiry check, signature validation
    - Read `CSRFEnforcementMiddleware`: verify exempt paths match unauthenticated endpoints (webhook, error report, health)
    - Read `SecurityHeadersMiddleware`: verify all 6 required headers are set
    - Read `PasswordResetToken` consumption logic: verify `used_at` is set
    - Read `RateLimitMiddleware`: verify rate configs for login, register, password reset, error report
    - Read `DeviceSession` creation/invalidation in login/logout views
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 5.2 Audit payment flow integrity
    - Trace `PaymentService.initiate_payment()` → payments record → Lenco reference
    - Trace `PaymentService.verify_payment()` → Lenco API → forward-only transitions
    - Trace `WebhookProcessor` → HMAC-SHA512 validation → webhook_event_logs → delegation
    - Trace `poll_pending_payments_task` → stale payment identification → verification
    - Trace admin override in `ApplicationReviewView` → `force_approved` status
    - Trace `FeeResolver` → program_fees lookup → local/international coverage
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 5.3 Audit business logic consistency (frontend ↔ backend)
    - Compare `ALLOWED_TRANSITIONS` in `services.py` against `applicationStateMachine.ts`
    - Compare `DuplicateChecker.NON_TERMINAL_STATUSES` against `duplicateApplicationCheck.ts`
    - Compare `IntakeEnforcer` logic against frontend intake validation
    - Verify `EligibilityEngine` is advisory-only
    - Compare `normalizePaymentStatus()` / `isPaymentVerified()` against backend payment status values
    - Compare `gradeValidation.ts` ECZ scale against `CourseRequirement.minimum_grade`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 5.4 Scan for dead code and incomplete implementations
    - Scan for unused imports/exports in frontend (exported symbols not imported elsewhere)
    - Scan for backend views/serializers not referenced in any `urls.py`
    - Scan for `TODO`, `FIXME`, `HACK`, `XXX` comments in both frontend and backend
    - Scan for placeholder content ("Coming Soon", stub components)
    - Identify seed-data-only endpoints (jobs-ops views returning `jobs_ops_seed.py` data)
    - Verify `ApplicationDraft` model is deprecated and not used in critical paths
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.7_

  - [x] 5.5 Audit error handling and resilience
    - Verify `envelope_exception_handler` catches DRF exceptions and creates `ErrorLog` records
    - Verify `errorReporter.ts` captures `window.onerror` and `unhandledrejection`
    - Scan frontend API calls for missing error handling (no `.catch()` or try/catch)
    - Verify SSE client has rapid-failure detection (go-live-polish Fix 15)
    - Verify Celery tasks have retry configuration
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 5.6 Audit performance patterns
    - Scan for N+1 patterns: queryset access in loops without `select_related`/`prefetch_related`
    - Verify frontend lazy-loading of heavy dependencies (PDF libs, chart libs)
    - Check high-traffic endpoint querysets for index usage
    - Verify `keep_alive_ping_task` is configured in Celery Beat
    - Scan for synchronous blocking calls in ASGI path
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.7_

  - [x] 5.7 Run backend tests to verify logic audit findings
    - Run `cd backend && python3 -m pytest tests/unit/ -q`
    - Run `cd backend && python3 -m pytest tests/property/ -q`
    - Flag regressions as `blocker`
    - _Requirements: 14.5_

  - [x] 5.8 Write property test for FeeResolver correctness (Property 14)
    - **Property 14: FeeResolver returns correct fees**
    - **Validates: Requirements 4.3, 6.6**

  - [x] 5.9 Write property test for payment forward-only transitions (Property 15)
    - **Property 15: Payment status transitions are forward-only**
    - **Validates: Requirements 4.4, 6.2**

  - [x] 5.10 Write property test for duplicate checker semantics (Property 27)
    - **Property 27: Duplicate checker distinguishes create-time and submit-time**
    - **Validates: Requirements 7.2**

  - [x] 5.11 Write property test for payment status normalization (Property 29)
    - **Property 29: Payment status normalization handles all backend values**
    - **Validates: Requirements 7.5**

- [x] 6. Checkpoint — Wiring and logic audit
  - Ensure all Phase 3 and Phase 4 findings are documented, ask the user if questions arise.

- [x] 7. Phase 5 — UX Audit
  - [x] 7.1 Audit student dashboard and profile flows
    - Trace `Dashboard.tsx` → profile completion calculation → application status display → pending actions
    - Verify data binding to backend responses, loading states, error states, empty states
    - _Requirements: 10.1_

  - [x] 7.2 Audit application wizard flow
    - Trace each wizard step component → form validation → auto-save → back-navigation data preservation
    - Verify progress indication, step validation, and data persistence across refreshes
    - _Requirements: 4.1, 4.2, 10.2, 10.3_

  - [x] 7.3 Audit payment and submission flow
    - Trace `PaymentStep.tsx` → fee display → Lenco widget → status polling → success/failure
    - Verify submission gates enforcement at `POST /api/v1/applications/{id}/submit/`
    - _Requirements: 4.3, 4.4, 4.5, 10.4_

  - [x] 7.4 Audit student status tracking, interviews, and notifications
    - Trace `ApplicationStatus.tsx` → status timeline → admin feedback display
    - Trace `Interview.tsx` → scheduled interviews → empty state handling
    - Trace `NotificationSettings.tsx` → preference management → persistence
    - _Requirements: 10.5, 10.6, 10.8_

  - [x] 7.5 Audit admin dashboard and review flows
    - Trace admin dashboard → statistics accuracy → activity feed (go-live-polish Fix 12)
    - Trace application review → full details → documents → grades → payment → decision
    - Verify capacity warning on approval near capacity (go-live-polish Fix 6)
    - _Requirements: 11.1, 11.2, 11.7_

  - [x] 7.6 Audit admin management pages
    - Trace applications list → filtering → search → pagination
    - Trace `Intakes.tsx` → capacity display → enrollment counts → deadlines
    - Trace `ProgramFees.tsx` → fee editing → residency categories
    - Trace `AuditTrail.tsx` → human-readable entries (go-live-polish Fix 12)
    - _Requirements: 11.3, 11.4, 11.5, 11.6_

- [x] 8. Phase 6 — Go-Live-Polish Regression Check and Report Generation
  - [x] 8.1 Verify all 15 go-live-polish fixes
    - Fix 1: Verify `test_admin_override.py` uses `TransactionTestCase` (run test)
    - Fix 2: Query `program_fees` via Neon MCP for international rows
    - Fix 3: Code trace `ApplicationReviewView.post()` for notification creation
    - Fix 4: Verify `ApplicationDraft` has deprecated docstring and no active usage
    - Fix 5: Verify `keep_alive_ping_task` in `CELERY_BEAT_SCHEDULE`
    - Fix 6: Code trace review endpoint response for `intake_capacity` and `intake_enrollment`
    - Fix 7: Code trace `IntakeEnforcer.sync_enrollment()` for `program_intakes` update
    - Fix 8: Verify dynamic imports for PDF libs in admissions bundle
    - Fix 9: Verify `cleanup_csrf_tokens_task` in `CELERY_BEAT_SCHEDULE`
    - Fix 10: Code trace `DocumentUploadView.post()` for `application_slip` exception
    - Fix 11: Code trace `duplicate_checker.py` — `approved` not in `NON_TERMINAL_STATUSES`
    - Fix 12: Code trace `normalizeRecentActivity()` for human-readable messages
    - Fix 13: Code trace `ProfileReadSerializer` for `first_name` and `last_name` fields
    - Fix 14: Code trace `applicationService.delete()` for 404 handling
    - Fix 15: Code trace `sseClient.ts` for rapid-failure detection
    - Flag regressions as `blocker` with `go_live_polish_ref`
    - _Requirements: 14.5_

  - [x] 8.2 Generate the structured audit report
    - Create `audit-report.md` with the structure defined in the design:
      - Summary: issue counts by severity and domain
      - Domain sections: Schema Integrity, Data Integrity, End-to-End Wiring, Application Wizard, Auth & Security, Payment Flow, Business Logic, Dead Code, Error Handling, Student UX, Admin UX, Performance, Jobs-Ops Readiness
      - Go-Live-Polish Regression Check section with status of each fix
      - Launch Readiness Verdict
    - Each issue follows the record format: id, severity, domain, description, affected, expected, recommendation, go_live_polish_ref (if applicable)
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

  - [x] 8.3 Implement fixes for blocker issues found during audit
    - For each `blocker` issue identified in the report, implement the recommended fix
    - Re-run relevant tests after each fix to verify resolution
    - Update the audit report to reflect fixed issues
    - _Requirements: 14.6_

  - [x] 8.4 Write property test for audit report structure (Property 37)
    - **Property 37: Audit report structure completeness**
    - **Validates: Requirements 14.1, 14.2, 14.3**

  - [x] 8.5 Write property test for go-live-polish regression detection (Property 38)
    - **Property 38: Go-live-polish regression detection**
    - **Validates: Requirements 14.5**

- [x] 9. Final checkpoint — Audit complete
  - Ensure all tests pass, the audit report is complete, and all blocker issues are resolved or documented. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster audit completion
- Each task references specific requirements for traceability
- Phases are ordered bottom-up: schema issues are found before they manifest as wiring or logic bugs
- The audit report is the primary deliverable — all findings flow into `audit-report.md`
- Go-live-polish regression checks are integrated into Phase 6 but individual fixes are also verified in their relevant domain phases
- Property tests validate universal correctness properties from the design document
