# Requirements Document — Pre-Launch Audit

## Introduction

Comprehensive end-to-end audit of the MIHAS platform before production launch. The platform is a monorepo with two active frontends (`apps/admissions` — student-facing, `apps/jobs-ops` — operator dashboard) backed by a Django 5 + DRF API (`backend/`) on Neon Postgres. The admissions app is the primary launch target. This audit covers database integrity, codebase completeness, business logic consistency, and user experience quality across all critical flows.

## Glossary

- **Auditor**: The automated or manual process performing the pre-launch audit
- **Schema_Validator**: The component that compares Neon Postgres schema against Django ORM model definitions
- **Flow_Verifier**: The component that traces end-to-end wiring from frontend UI through API to database
- **Logic_Analyzer**: The component that detects business logic gaps, dead code, and inconsistencies
- **UX_Evaluator**: The component that assesses user experience quality across all user journeys
- **Admissions_App**: The student-facing React+Vite frontend at `apps/admissions/`
- **Jobs_Ops_App**: The operator dashboard React+Vite frontend at `apps/jobs-ops/`
- **Backend_API**: The Django 5 + DRF backend at `backend/`
- **Neon_DB**: The Neon Postgres database backing both applications
- **Student**: A user with the `student` role applying through the admissions flow
- **Admin**: A user with the `admin` or `super_admin` role managing applications
- **Operator**: A user of the jobs-ops dashboard

## Requirements

### Requirement 1: Database Schema Integrity Audit

**User Story:** As a platform operator, I want the database schema validated against application expectations, so that schema drift and missing constraints do not cause runtime failures after launch.

#### Acceptance Criteria

1. THE Schema_Validator SHALL compare every Django ORM model (`managed = False`) field definition against the corresponding Neon Postgres table column (type, nullability, default, constraints) and report all mismatches
2. WHEN a foreign key is defined in a Django model, THE Schema_Validator SHALL verify that the corresponding database-level foreign key constraint exists in Neon_DB and report missing constraints
3. THE Schema_Validator SHALL verify that all unique constraints declared in Django models (`unique=True`, `unique_together`) have matching unique indexes in Neon_DB
4. THE Schema_Validator SHALL verify that all tables referenced by Django models exist in Neon_DB and contain the expected columns
5. WHEN a table exists in Neon_DB but has no corresponding Django model, THE Schema_Validator SHALL flag the table as unmapped and assess whether the table is orphaned or intentionally unmanaged
6. THE Schema_Validator SHALL verify that `program_intakes.current_enrollment` is synchronized with actual submitted application counts per program+intake combination
7. IF a column type mismatch is detected between Django model and Neon_DB (e.g., `CharField` vs `text`, `IntegerField` vs `bigint`), THEN THE Schema_Validator SHALL classify the mismatch by severity (breaking vs cosmetic)

### Requirement 2: Data Integrity and Referential Consistency Audit

**User Story:** As a platform operator, I want all data relationships validated for referential integrity, so that orphaned records and broken links do not corrupt the user experience.

#### Acceptance Criteria

1. THE Schema_Validator SHALL detect orphaned records in child tables (`applications`, `application_documents`, `application_grades`, `payments`, `application_status_history`, `application_interviews`) where the parent foreign key references a non-existent row
2. THE Schema_Validator SHALL verify that every `applications.user` references a valid `profiles.id` and every `applications.program` references a valid program code in the `programs` table
3. THE Schema_Validator SHALL verify that every `payments.application_id` references a valid `applications.id` and that payment amounts match the expected `program_fees` for the application's program and residency category
4. WHEN `applications.payment_status` is `verified`, `paid`, or `force_approved`, THE Schema_Validator SHALL verify that a corresponding `payments` record with status `successful` exists for that application
5. THE Schema_Validator SHALL verify that `application_status_history` records form a valid chronological chain for each application and that no status transitions violate the allowed transition map (`draft→submitted→under_review→approved/rejected/waitlisted`)
6. THE Schema_Validator SHALL verify that `program_fees` has both `local` and `international` residency entries for every active program with `fee_type='application'`
7. IF orphaned records are found, THEN THE Schema_Validator SHALL categorize each orphan by table, count, and likely cause (cascade failure, manual deletion, migration gap)

### Requirement 3: Frontend-Backend-Database End-to-End Wiring Audit

**User Story:** As a developer, I want every feature verified as fully wired from UI to database, so that no incomplete implementations ship to production.

#### Acceptance Criteria

1. THE Flow_Verifier SHALL trace each admissions frontend service module (`applications.ts`, `auth.ts`, `catalog.ts`, `documents.ts`, `interviews.ts`, `notifications.ts`, `sessionService.ts`) and verify that every API call maps to a registered Backend_API endpoint in `backend/config/urls.py`
2. THE Flow_Verifier SHALL verify that every Backend_API endpoint defined in URL patterns has a corresponding view class with implemented HTTP method handlers (not just stubs or pass-through)
3. THE Flow_Verifier SHALL verify that every serializer field referenced in Backend_API views maps to an existing model field or annotated queryset column
4. WHEN a frontend component calls an API endpoint that returns paginated data, THE Flow_Verifier SHALL verify that the backend view uses the standard `{page, pageSize, totalCount, results}` pagination envelope
5. THE Flow_Verifier SHALL verify that the jobs-ops frontend API service modules in `apps/jobs-ops/src/services/api/` map to registered backend endpoints and that response shapes match frontend type expectations
6. IF a frontend route renders a page that depends on API data, THEN THE Flow_Verifier SHALL verify that the corresponding API endpoint returns all fields consumed by the page component
7. THE Flow_Verifier SHALL verify that all admin service modules in `apps/admissions/src/services/admin/` map to backend endpoints requiring admin-level authentication

### Requirement 4: Application Wizard End-to-End Flow Audit

**User Story:** As a student, I want the entire application wizard to work seamlessly from start to submission, so that I can complete my application without encountering broken steps.

#### Acceptance Criteria

1. THE Flow_Verifier SHALL verify that each wizard step (Personal Info, Program Selection, Grades, Documents, Payment, Review/Submit) saves data to the correct backend endpoint and that saved data persists across page refreshes
2. THE Flow_Verifier SHALL verify that the auto-save mechanism in the application wizard triggers on form changes and successfully persists draft data via `PATCH /api/v1/applications/{id}/`
3. WHEN a student reaches the Payment step, THE Flow_Verifier SHALL verify that `FeeResolver` returns the correct fee for the selected program and residency, and that the Lenco widget initializes with the correct amount
4. WHEN a student completes payment via the Lenco widget, THE Flow_Verifier SHALL verify that `PaymentService.verify_payment()` transitions the payment status correctly and that `applications.payment_status` is updated
5. THE Flow_Verifier SHALL verify that the submission endpoint `POST /api/v1/applications/{id}/submit/` enforces all gates: payment completed, identity document uploaded, intake deadline not passed, intake capacity not exceeded, and no duplicate submitted application
6. WHEN a student uploads an NRC or Passport document, THE Flow_Verifier SHALL verify that the document is stored in Cloudflare R2 via signed URL and that the `application_documents` record is created with correct metadata
7. IF the student's network connection drops during auto-save, THEN THE Flow_Verifier SHALL verify that the frontend handles the failure gracefully without losing form data

### Requirement 5: Authentication and Session Security Audit

**User Story:** As a platform operator, I want all authentication and session flows verified for security, so that no auth bypass or session hijacking vulnerabilities exist at launch.

#### Acceptance Criteria

1. THE Logic_Analyzer SHALL verify that `JWTAuthenticationMiddleware` correctly validates JWT tokens from HTTP-only cookies, rejects expired tokens, and attaches the authenticated user to the request
2. THE Logic_Analyzer SHALL verify that `CSRFEnforcementMiddleware` requires valid CSRF tokens on all state-changing requests (POST, PUT, PATCH, DELETE) for authenticated endpoints and correctly exempts unauthenticated endpoints (webhook, error report, health checks)
3. THE Logic_Analyzer SHALL verify that `SecurityHeadersMiddleware` sets all required security headers: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Strict-Transport-Security`, and `Content-Security-Policy`
4. THE Logic_Analyzer SHALL verify that password reset tokens are single-use, time-bound, and that `PasswordResetToken.used_at` is set after consumption
5. THE Logic_Analyzer SHALL verify that `RateLimitMiddleware` enforces rate limits on login, registration, password reset, and error reporting endpoints
6. THE Logic_Analyzer SHALL verify that `DeviceSession` records are created on login, invalidated on logout, and that expired sessions are cleaned up
7. IF a JWT token is tampered with or signed with an incorrect key, THEN THE Logic_Analyzer SHALL verify that the middleware rejects the request with a 401 response

### Requirement 6: Payment Flow Integrity Audit

**User Story:** As a platform operator, I want the entire payment lifecycle verified end-to-end, so that no payment is lost, duplicated, or incorrectly recorded.

#### Acceptance Criteria

1. THE Logic_Analyzer SHALL verify that `PaymentService.initiate_payment()` creates a `payments` record with status `pending`, generates a valid Lenco reference, and returns widget configuration with the correct amount and currency
2. THE Logic_Analyzer SHALL verify that `PaymentService.verify_payment()` calls the Lenco API, updates payment status based on the response, and enforces forward-only status transitions (pending→successful, pending→failed; no backward transitions)
3. THE Logic_Analyzer SHALL verify that `WebhookProcessor` validates HMAC-SHA512 signatures on incoming Lenco webhooks, logs all events to `webhook_event_logs`, and delegates to `PaymentService.process_webhook_event()`
4. THE Logic_Analyzer SHALL verify that `poll_pending_payments_task` correctly identifies stale pending payments (older than 5 minutes, younger than 24 hours) and verifies them via the Lenco API
5. WHEN an admin overrides payment status via the review endpoint, THE Logic_Analyzer SHALL verify that the override is recorded with the admin's identity and that `applications.payment_status` is updated to `force_approved`
6. THE Logic_Analyzer SHALL verify that `FeeResolver` returns correct fees for all active programs for both `local` and `international` residency categories, and that missing fee configurations are reported as errors
7. IF a Lenco webhook arrives with an invalid signature, THEN THE Logic_Analyzer SHALL verify that the webhook is logged but not processed, and that a 400 response is returned

### Requirement 7: Business Logic Consistency Audit

**User Story:** As a developer, I want all business logic validated for consistency between frontend and backend, so that no logic gaps cause incorrect behavior in production.

#### Acceptance Criteria

1. THE Logic_Analyzer SHALL verify that the application status state machine in `backend/apps/applications/services.py` (`ALLOWED_TRANSITIONS`) is consistent with frontend status display logic in `applicationStateMachine.ts` and `applicationStatusUi.ts`
2. THE Logic_Analyzer SHALL verify that `DuplicateChecker` correctly distinguishes between create-time checks (blocking drafts for same program+intake) and submit-time checks (blocking duplicate submissions), and that `NON_TERMINAL_STATUSES` and `SUBMITTED_STATUSES` are correctly defined
3. THE Logic_Analyzer SHALL verify that `IntakeEnforcer` correctly checks intake deadlines, open dates, capacity limits, and that `sync_enrollment()` updates both `intakes.current_enrollment` and `program_intakes.current_enrollment`
4. THE Logic_Analyzer SHALL verify that `EligibilityEngine` evaluation is advisory-only and does not block submission, and that eligibility results are stored on the application record
5. THE Logic_Analyzer SHALL verify that frontend payment status normalization (`normalizePaymentStatus()`, `isPaymentVerified()`) correctly handles all backend payment status values including legacy `verified` and current `paid`/`successful`/`force_approved`
6. THE Logic_Analyzer SHALL verify that the frontend `gradeValidation.ts` ECZ grading logic (1-9 scale) is consistent with backend `CourseRequirement.minimum_grade` validation
7. WHEN the frontend and backend implement the same business rule (e.g., duplicate check, eligibility, intake enforcement), THE Logic_Analyzer SHALL verify that both implementations produce consistent results for the same inputs

### Requirement 8: Dead Code and Incomplete Implementation Detection

**User Story:** As a developer, I want dead code and incomplete implementations identified, so that the codebase is clean and maintainable at launch.

#### Acceptance Criteria

1. THE Logic_Analyzer SHALL identify frontend components, hooks, services, and utility modules that are imported nowhere in the codebase and flag them as potentially dead code
2. THE Logic_Analyzer SHALL identify backend views, serializers, and URL patterns that are defined but unreachable (no URL route, no frontend caller)
3. THE Logic_Analyzer SHALL identify TODO, FIXME, HACK, and XXX comments in both frontend and backend code and categorize them by severity (blocking vs informational)
4. THE Logic_Analyzer SHALL identify frontend pages or components that render placeholder content ("Coming Soon", empty states without data fetching, stub components)
5. THE Logic_Analyzer SHALL identify backend API endpoints that return hardcoded or seed data instead of querying the database
6. WHEN a service module imports a function or class that does not exist in the target module, THE Logic_Analyzer SHALL flag the broken import as a blocking issue
7. THE Logic_Analyzer SHALL identify deprecated code paths (e.g., `ApplicationDraft` model, legacy payment columns) and verify they are properly documented and not actively used in critical flows

### Requirement 9: Error Handling and Resilience Audit

**User Story:** As a platform operator, I want all error handling paths verified, so that failures degrade gracefully instead of crashing the user experience.

#### Acceptance Criteria

1. THE Logic_Analyzer SHALL verify that `envelope_exception_handler` in `backend/apps/common/exceptions.py` catches all DRF exceptions, creates `ErrorLog` records, and dispatches throttled alert emails
2. THE Logic_Analyzer SHALL verify that the frontend `errorReporter.ts` captures `window.onerror` and `unhandledrejection` events, batches them, and POSTs to `/api/v1/errors/report/`
3. THE Logic_Analyzer SHALL verify that all frontend API calls handle network errors, 401/403 responses, 404 responses, and 500 responses with appropriate user-facing feedback
4. THE Logic_Analyzer SHALL verify that the SSE client (`sseClient.ts`) handles connection failures, implements exponential backoff, detects rapid QUIC failures, and falls back to polling mode
5. WHEN a Celery task fails, THE Logic_Analyzer SHALL verify that the failure is logged and that retry logic is configured for transient failures (network timeouts, temporary database unavailability)
6. THE Logic_Analyzer SHALL verify that file upload failures (R2 signed URL expiry, network timeout, oversized file) are handled with clear user-facing error messages
7. IF the Neon_DB connection is temporarily unavailable, THEN THE Logic_Analyzer SHALL verify that the backend returns appropriate 503 responses and that the frontend displays a maintenance message

### Requirement 10: User Experience Quality Audit — Student Flows

**User Story:** As a student, I want every interaction to be intuitive and error-free, so that I can complete my application without confusion or frustration.

#### Acceptance Criteria

1. THE UX_Evaluator SHALL verify that the student dashboard accurately displays profile completion percentage, application status, and pending actions based on actual backend data
2. THE UX_Evaluator SHALL verify that the application wizard provides clear progress indication, validates each step before allowing progression, and preserves data on back-navigation
3. THE UX_Evaluator SHALL verify that all student-facing forms (profile settings, application wizard, grade entry) provide inline validation errors, accessible error announcements, and prevent submission of invalid data
4. THE UX_Evaluator SHALL verify that the payment flow provides clear feedback at each stage: fee display, widget loading, payment processing, success/failure confirmation
5. THE UX_Evaluator SHALL verify that application status tracking (`ApplicationStatus.tsx`) displays the current status, status history timeline, and any admin feedback in a clear format
6. THE UX_Evaluator SHALL verify that the interview page (`Interview.tsx`) displays scheduled interviews with date, time, mode, location, and join actions, and handles the case where no interviews are scheduled
7. WHEN a student accesses the platform on a mobile device with a slow network connection, THE UX_Evaluator SHALL verify that all critical flows (login, dashboard, wizard, payment) are usable with appropriate loading states and offline resilience
8. THE UX_Evaluator SHALL verify that notification settings (`NotificationSettings.tsx`) allow students to manage their notification preferences and that changes persist correctly

### Requirement 11: User Experience Quality Audit — Admin Flows

**User Story:** As an admin, I want all administrative tools to work correctly and efficiently, so that I can manage applications without encountering broken features.

#### Acceptance Criteria

1. THE UX_Evaluator SHALL verify that the admin dashboard displays accurate statistics (total applications, pending reviews, recent activity) derived from real backend data
2. THE UX_Evaluator SHALL verify that the application review flow allows admins to view full application details, documents, grades, payment status, and submit approval/rejection decisions with feedback
3. THE UX_Evaluator SHALL verify that the admin applications list supports filtering by status, program, intake, and search by applicant name or application number
4. THE UX_Evaluator SHALL verify that the admin intake management page (`Intakes.tsx`) displays intake capacity, enrollment counts, deadlines, and allows intake configuration
5. THE UX_Evaluator SHALL verify that the admin program fees page (`ProgramFees.tsx`) displays and allows editing of fee configurations for all programs and residency categories
6. THE UX_Evaluator SHALL verify that the admin audit trail page (`AuditTrail.tsx`) displays human-readable activity entries with timestamps, actors, and affected resources
7. WHEN an admin approves an application for an intake nearing capacity, THE UX_Evaluator SHALL verify that a capacity warning is displayed before the approval is confirmed

### Requirement 12: Performance and Optimization Audit

**User Story:** As a platform operator, I want performance bottlenecks identified before launch, so that the platform responds quickly under expected load.

#### Acceptance Criteria

1. THE Logic_Analyzer SHALL identify N+1 query patterns in backend views where related objects are accessed in loops without `select_related()` or `prefetch_related()`
2. THE Logic_Analyzer SHALL verify that the frontend bundle does not eagerly load heavy dependencies (PDF libraries, chart libraries) that are only needed on specific pages
3. THE Logic_Analyzer SHALL verify that database queries on high-traffic endpoints (application list, dashboard, catalog) use appropriate indexes and do not perform full table scans
4. THE Logic_Analyzer SHALL verify that the `keep_alive_ping_task` prevents Koyeb cold starts and that the health check endpoints respond within acceptable latency
5. WHEN the application list endpoint is called with filters, THE Logic_Analyzer SHALL verify that the query uses indexed columns and that pagination limits prevent unbounded result sets
6. THE Logic_Analyzer SHALL verify that static assets (CSS, JS, images) are served with appropriate cache headers and that the Vite build produces optimized, code-split bundles
7. THE Logic_Analyzer SHALL identify any synchronous blocking operations in the ASGI request path that could degrade throughput under concurrent load

### Requirement 13: Jobs-Ops Platform Readiness Audit

**User Story:** As a platform operator, I want the jobs-ops dashboard validated for structural completeness, so that known gaps are documented even if jobs-ops is not the primary launch target.

#### Acceptance Criteria

1. THE Flow_Verifier SHALL verify that all jobs-ops frontend feature routes (`overview`, `jobs`, `job-applications`, `automation`, `outreach`, `email`, `documents`, `integrations`, `sources`, `analytics`, `review`, `audit`) render without runtime errors
2. THE Flow_Verifier SHALL verify that jobs-ops API service modules map to registered backend endpoints and that backend views return data in the expected shape
3. THE Logic_Analyzer SHALL identify jobs-ops backend endpoints that return seed data from `jobs_ops_seed.py` instead of querying real database tables, and flag them as scaffold-only
4. THE Logic_Analyzer SHALL verify that jobs-ops write endpoints (create job application, update automation rule, send outreach) are properly authenticated and permission-gated
5. WHEN a jobs-ops feature depends on an external integration (Telegram, OpenAI, email provider), THE Logic_Analyzer SHALL verify that the integration is either fully wired or gracefully degraded with appropriate placeholder UI
6. THE Flow_Verifier SHALL verify that the jobs-ops type-check (`bun run type-check:jobs-ops`), lint (`bun run lint:jobs-ops`), and build pass without errors

### Requirement 14: Audit Report Generation

**User Story:** As a platform operator, I want a structured audit report with issues categorized by severity, so that I can prioritize fixes before launch.

#### Acceptance Criteria

1. THE Auditor SHALL produce a report categorizing every issue as one of: `blocker` (must fix before launch), `critical` (should fix before launch), `warning` (fix soon after launch), or `info` (improvement opportunity)
2. THE Auditor SHALL group issues by audit domain: Schema Integrity, Data Integrity, End-to-End Wiring, Business Logic, Security, Payment, UX, Performance, Dead Code, and Jobs-Ops Readiness
3. FOR EACH issue found, THE Auditor SHALL provide: a description of the problem, the affected file(s) or table(s), the expected behavior, and a recommended fix
4. THE Auditor SHALL produce a summary count of issues by severity and domain at the top of the report
5. THE Auditor SHALL flag any issue that was previously identified in the `go-live-polish` spec but remains unresolved or has regressed
6. WHEN all blocker issues are resolved, THE Auditor SHALL produce a launch readiness confirmation with any remaining warnings documented as known issues
