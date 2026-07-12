# Requirements Document

## Introduction

This specification addresses the highest-priority findings from a comprehensive audit of the MIHAS admissions application process. The audit covered security, data integrity, performance, data validation, API contract, and accessibility across the frontend (React/TypeScript), backend (Django/DRF), and database (Neon Postgres) layers.

The audit was conducted using the a11y-audit, senior-frontend, senior-backend, senior-security, code-reviewer, and cto-advisor skills, plus the Neon MCP for live database inspection (project `wild-bar-37055823`) and Context7 for DRF documentation verification.

Requirements are grouped by domain and prioritized by severity. The goal is to harden the application process against replay attacks, data inconsistency, performance degradation, and accessibility gaps.

### CTO Review Notes

The following corrections were applied after cross-referencing the requirements against the live Neon database schema and actual codebase:

1. 🟢 **Req 1 (Amount Mismatch) — ALREADY IMPLEMENTED.** Both `verify_payment()` and `process_webhook_event()` in `payment_service.py` already return early on amount mismatch without transitioning to `successful`. Verified via code review. **Removed from scope.**
2. 🟢 **Req 3 (Idempotency) — EXISTING INFRASTRUCTURE.** The `idempotency_keys` table already exists in Neon with columns `(key TEXT PK, endpoint TEXT, response_json JSONB, created_at TIMESTAMPTZ)` and an index on `created_at`. The `submit_application()` function also uses `SELECT FOR UPDATE` as a secondary guard. Requirements updated to reference existing table instead of proposing Redis.
3. 🟢 **Req 7 (Pagination) — PARTIALLY IMPLEMENTED.** `StandardPagination` already sets `max_page_size = 100`. The requirement is updated to increase it to 500 (from 100), not to add it from scratch.
4. 🟢 **Req 10 (Program-Intake) — EXISTING TABLE.** The `program_intakes` table exists with a `UNIQUE(program_id, intake_id)` constraint, FK to `programs` and `intakes`. Requirements updated to reference this join table directly.
5. 🟢 **Req 13 (State Machine) — LIVE DATA CONFIRMS ISSUE.** `application_status_history` shows a `draft → approved` transition (1 record), confirming the force-bypass issue. The history table already has `old_status`, `new_status`, `ip_address`, `user_agent`, `notes`, `changes` columns — no schema changes needed.
6. 🟡 **Req 2 (Webhook Replay) — SCHEMA SUPPORTS IT.** `webhook_event_logs` has `reference` (indexed) and `processed` columns. Deduplication can be implemented with a simple query against existing schema. No new columns needed.
7. 🟡 **Req 4 (Error Endpoint) — PARTIALLY IMPLEMENTED.** The view already truncates messages to 2000 chars. Rate limiting is currently 10 req/IP/5min via middleware. Requirements updated to reflect what's already done.
8. 🟡 **Req 9 (Polling Backoff) — CONFIRMED.** `usePaymentStatus.ts` uses a fixed `POLL_INTERVAL_MS = 10_000` (10 seconds). Requirements updated with accurate current state.

## Glossary

- **Payment_Service**: The `PaymentService` class in `backend/apps/documents/payment_service.py` that manages the payment lifecycle (initiate, verify, webhook processing, forward-only status transitions).
- **Webhook_Processor**: The `WebhookProcessor` class in `backend/apps/documents/webhook_processor.py` that validates HMAC-SHA512 signatures, logs webhook events, and delegates to Payment_Service.
- **Webhook_Event_Log**: The `webhook_event_logs` database table (columns: `id`, `event_type`, `reference`, `payload`, `signature_valid`, `processed`, `processing_error`, `created_at`) with an index on `reference`.
- **Idempotency_Keys_Table**: The `idempotency_keys` database table (columns: `key TEXT PK`, `endpoint TEXT`, `response_json JSONB`, `created_at TIMESTAMPTZ`) with an index on `created_at`.
- **Program_Intakes_Table**: The `program_intakes` join table (columns: `id`, `program_id FK`, `intake_id FK`, `max_capacity`, `current_enrollment`, `created_at`) with a `UNIQUE(program_id, intake_id)` constraint.
- **Application_Status_History**: The `application_status_history` table (columns: `id`, `application_id FK`, `status`, `old_status`, `new_status`, `changed_by FK`, `notes`, `changes JSONB`, `ip_address`, `user_agent`, `created_at`).
- **Application_Model**: The `Application` Django model in `backend/apps/applications/models.py` mapping to the `applications` table.
- **Submission_Service**: The `submit_application` function in `backend/apps/applications/services.py` that enforces payment/document/state checks before transitioning an application to `submitted`. Uses `SELECT FOR UPDATE` for row-level locking.
- **Standard_Pagination**: The `StandardPagination` class in `backend/apps/common/pagination.py` — currently sets `page_size=20`, `page_size_query_param="pageSize"`, `max_page_size=100`.
- **Error_Report_View**: The `ErrorReportView` class in `backend/apps/common/error_views.py` — currently `AllowAny`, rate-limited to 10 req/IP/5min via middleware, truncates messages to 2000 chars.
- **Error_Reporter**: The frontend error reporting module in `apps/admissions/src/lib/errorReporter.ts` that captures `window.onerror` and unhandled rejections, batches them with a 5-second debounce, and POSTs to the backend.
- **Payment_Status_Hook**: The `usePaymentStatus` React hook in `apps/admissions/src/hooks/usePaymentStatus.ts` — currently polls at a fixed 10-second interval (`POLL_INTERVAL_MS = 10_000`).
- **Application_Wizard**: The multi-step application form in `apps/admissions/src/pages/student/applicationWizard/`.
- **Admin_Applications_View**: The admin applications list page in `apps/admissions/src/pages/admin/Applications.tsx`.
- **Status_Transition_Service**: The `transition_application_status` function in `backend/apps/applications/services.py` that applies status changes and records history. Currently has NO transition validation — accepts any old_status → new_status combination.
- **Lenco_API**: The external Lenco payment gateway API used for payment verification and webhook delivery.
- **Application_Review_View**: The `ApplicationReviewView` class in `backend/apps/applications/views.py` that handles admin review actions including status transitions and payment status overrides.

## Requirements

### ~~Requirement 1: Block Payment on Amount Mismatch~~ — ALREADY IMPLEMENTED

**CTO Review:** Both `verify_payment()` (line 240) and `process_webhook_event()` (line 300) in `payment_service.py` already return early on amount mismatch without transitioning to `successful`. Uses `Decimal` comparison via `_parse_amount()`. No action needed.

### Requirement 2: Webhook Replay Protection

**User Story:** As a security engineer, I want the webhook processor to reject replayed webhook events, so that a captured valid webhook cannot be reprocessed to manipulate payment state.

#### Acceptance Criteria

1. WHEN a webhook event is received, THE Webhook_Processor SHALL query the existing Webhook_Event_Log table for any entry with the same `reference` value and `event_type` where `processed=True`, using the existing `idx_webhook_event_logs_reference` index.
2. IF a duplicate webhook event is detected (same `reference` and `event_type` with `processed=True`), THEN THE Webhook_Processor SHALL skip delegation to Payment_Service and log the duplicate detection at INFO level.
3. THE Webhook_Processor SHALL still create a Webhook_Event_Log entry for the duplicate event with `processing_error` set to `'Duplicate event — already processed'` and `processed=True`.
4. THE deduplication check SHALL occur after signature validation but before delegation to `Payment_Service.process_webhook_event()`.

### Requirement 3: Application Submission Idempotency

**User Story:** As a student on a slow connection, I want my application submission to be idempotent, so that double-clicking the submit button does not create duplicate submissions or errors.

#### Acceptance Criteria

1. WHEN a submission request is received, THE Submission_Service SHALL accept an `Idempotency-Key` header from the client.
2. WHEN a submission request carries an `Idempotency-Key` that already exists in the Idempotency_Keys_Table, THE Submission_Service SHALL return the stored `response_json` without re-executing the submission logic.
3. THE Submission_Service SHALL store successful submission responses in the existing `idempotency_keys` table with `key=<header value>`, `endpoint='/api/v1/applications/{id}/submit/'`, and `response_json=<serialized response>`.
4. THE Submission_Service SHALL implement a cleanup mechanism (e.g., a periodic task or `DELETE WHERE created_at < NOW() - INTERVAL '1 hour'`) to prevent unbounded growth of the Idempotency_Keys_Table.
5. IF the idempotency lookup fails (database error), THEN THE Submission_Service SHALL fall through to the existing `SELECT FOR UPDATE` guard in `submit_application()` that prevents duplicate transitions from `draft` to `submitted`.
6. THE Application_Wizard SHALL generate a unique `Idempotency-Key` (UUID v4) for each submission attempt and include it in the `POST` request header. A new key SHALL be generated on each retry after a failure.

### Requirement 4: Error Report Endpoint Hardening

**User Story:** As a platform operator, I want the error report endpoint to be more resistant to abuse, so that attackers cannot flood the error logging pipeline.

#### Acceptance Criteria

1. THE Error_Report_View SHALL use DRF's `ScopedRateThrottle` with scope `error_report` and a rate of `5/min` per IP, replacing the current middleware-based 10 req/IP/5min limit. (Context7 reference: DRF `ScopedRateThrottle` with `throttle_scope` on the view.)
2. THE Error_Report_View SHALL reject request payloads larger than 16 KB with a `413 Payload Too Large` response, checked before any processing.
3. THE Error_Report_View SHALL continue to truncate individual error messages to 2000 characters before storage (already implemented).
4. THE Error_Report_View SHALL limit batch payloads to a maximum of 10 error items per request. IF a batch payload contains more than 10 items, THEN only the first 10 SHALL be processed.
5. THE Error_Report_View SHALL validate that each error item in a batch contains a non-empty `message` field (already implemented) and reject the entire batch if any item fails validation.

### Requirement 5: Admin Force-Bypass Audit Logging

**User Story:** As an auditor, I want every admin force-bypass of payment verification to be explicitly logged, so that bypasses are traceable and reviewable.

#### Acceptance Criteria

1. WHEN an admin sets `force=true` on a status transition to `approved` without verified payment, THE Application_Review_View SHALL call `transition_application_status()` with `notes` containing the string `"[FORCE-BYPASS] Payment verification bypassed by admin"` so the existing Application_Status_History record captures the bypass reason.
2. WHEN a force-bypass is used, THE Application_Review_View SHALL log a warning at `logger.warning` level containing the application ID, admin user ID, and the target status.
3. THE Application_Review_View SHALL pass the admin's hashed IP address and user agent to `transition_application_status()` which already records them in the `ip_address` and `user_agent` columns of Application_Status_History.
4. THE Application_Review_View SHALL record the bypass in the `changes` JSONB column of Application_Status_History with `{"force_bypass": true, "reason": "<admin-provided reason>"}`.

---

**CTO Note on Req 5:** The `application_status_history` table already has `ip_address`, `user_agent`, `notes`, and `changes JSONB` columns. Live data confirms a `draft → approved` transition exists (1 record). No schema changes needed — this is purely a code-level enforcement in the view layer.

### Requirement 6: Frontend Error Reporter Deduplication

**User Story:** As a frontend developer, I want the error reporter to deduplicate identical errors before batching, so that a single recurring error does not flood the backend with redundant reports.

#### Acceptance Criteria

1. WHEN the same error message occurs multiple times within the 5-second batch window, THE Error_Reporter SHALL send only one report for that message.
2. THE Error_Reporter SHALL identify duplicate errors by computing a hash of the error message and stack trace.
3. THE Error_Reporter SHALL include a `count` field in the payload indicating how many times the deduplicated error occurred within the batch window.

### Requirement 7: Pagination Max Page Size Increase

**User Story:** As a backend engineer, I want the pagination class to enforce a higher maximum page size, so that admin bulk operations work efficiently while still preventing unbounded memory usage.

#### Acceptance Criteria

1. THE Standard_Pagination SHALL increase `max_page_size` from the current value of `100` to `500`.
2. WHEN a client requests a `pageSize` greater than 500, THE Standard_Pagination SHALL silently cap the page size to 500 (this is built-in DRF `PageNumberPagination` behavior per Context7 docs).
3. THE Standard_Pagination SHALL retain the default `page_size` of 20 for requests that do not specify a `pageSize` parameter.

---

**CTO Note on Req 7:** `StandardPagination` in `backend/apps/common/pagination.py` already sets `max_page_size = 100`. DRF's `PageNumberPagination` automatically caps requests exceeding `max_page_size`. This is a one-line change from `100` to `500`.

### Requirement 8: Application Detail N+1 Query Prevention

**User Story:** As a backend engineer, I want the application detail endpoint to prefetch related data, so that rendering a single application does not trigger excessive database queries.

#### Acceptance Criteria

1. WHEN an application detail is requested, THE Application_Detail_View SHALL use `prefetch_related` for documents, grades, and interviews in addition to the existing `select_related('user')`.
2. WHEN the application list endpoint is requested, THE Application_List_View SHALL use `prefetch_related` for documents when the response includes document counts or document data.

### Requirement 9: Payment Status Polling with Exponential Backoff

**User Story:** As a student waiting for payment confirmation, I want the polling to start fast and slow down over time, so that I get quick feedback without wasting bandwidth on a slow confirmation.

#### Acceptance Criteria

1. THE Payment_Status_Hook SHALL replace the current fixed `POLL_INTERVAL_MS = 10_000` (10-second) interval with an exponential backoff starting at 2 seconds.
2. WHILE the payment status remains `pending`, THE Payment_Status_Hook SHALL increase the polling interval by a factor of 1.5 after each poll, up to a maximum of 30 seconds (sequence: 2s → 3s → 4.5s → 6.75s → 10.1s → 15.2s → 22.8s → 30s cap).
3. WHEN the payment status resolves to `successful` or `failed`, THE Payment_Status_Hook SHALL stop polling by clearing the interval.
4. WHEN the user manually triggers a status check (via `refetch()`), THE Payment_Status_Hook SHALL reset the polling interval back to 2 seconds.

---

**CTO Note on Req 9:** Current implementation in `usePaymentStatus.ts` uses `setInterval(fetchStatus, POLL_INTERVAL_MS)` with a fixed 10s interval. The refactor replaces `setInterval` with `setTimeout` chaining to support dynamic intervals. The `refetch` callback already exists and is returned from the hook.

### Requirement 10: Program-Intake Compatibility Validation

**User Story:** As an admissions officer, I want the backend to validate that a selected program and intake are compatible, so that students cannot submit applications for invalid program-intake combinations.

#### Acceptance Criteria

1. WHEN an application is created or updated with a `program` and `intake`, THE Application_Create_View SHALL resolve the program code and intake name to their respective UUIDs via `Program.objects.filter(code=program)` and `Intake.objects.filter(name=intake)`, then verify that a row exists in the Program_Intakes_Table where `program_id` and `intake_id` match.
2. IF no matching row exists in Program_Intakes_Table, or if the program code or intake name cannot be resolved, THEN THE Application_Create_View SHALL return a 400 response with error code `INVALID_PROGRAM_INTAKE` and a message: "The selected program is not available for this intake."
3. THE validation SHALL also verify that the referenced intake's `is_active` flag is true in the `intakes` table.
4. THE validation SHALL use the existing `program_intakes_program_id_intake_id_key` unique index for efficient lookup.

---

**CTO Note on Req 10:** The `program_intakes` join table already exists in Neon with `UNIQUE(program_id, intake_id)`, FK constraints to `programs` and `intakes`, and indexes on both columns. Contains active data (verified via Neon MCP). The `intakes` table has an `is_active` column. No schema changes needed — this is a validation check in the serializer or view.

### Requirement 11: Backend Age Validation

**User Story:** As an admissions officer, I want the backend to validate that applicants meet the minimum age requirement, so that underage applicants are rejected at the API boundary regardless of frontend validation.

#### Acceptance Criteria

1. WHEN an application is created with a `date_of_birth`, THE Application_Create_View SHALL verify that the applicant is at least 16 years old as of the current date.
2. IF the applicant is younger than 16, THEN THE Application_Create_View SHALL return a 400 response with error code `MINIMUM_AGE_NOT_MET` and a message stating the minimum age requirement.
3. THE age calculation SHALL use the applicant's `date_of_birth` and the server's current date, accounting for leap years.

### Requirement 12: International Phone Number Validation

**User Story:** As an international student, I want to enter my home country phone number during application, so that I am not blocked by Zambia-only phone validation.

#### Acceptance Criteria

1. THE Application_Create_View SHALL accept phone numbers in E.164 international format (e.g., `+260977123456`, `+44207946000`).
2. THE Application_Create_View SHALL validate that the phone number contains only digits, an optional leading `+`, and is between 7 and 15 digits long.
3. THE Application_Wizard SHALL update its phone input field to accept international phone numbers with a country code prefix.

### Requirement 13: Application Status State Machine Enforcement

**User Story:** As a platform engineer, I want the backend to enforce a defined set of valid status transitions, so that applications cannot be moved to invalid states through API calls.

#### Acceptance Criteria

1. THE Status_Transition_Service SHALL define an explicit `ALLOWED_TRANSITIONS` map as a module-level constant:
   - `draft → submitted` (student submission)
   - `submitted → under_review` (admin begins review)
   - `under_review → approved` (admin approves)
   - `under_review → rejected` (admin rejects)
   - `under_review → waitlisted` (admin waitlists)
   - `submitted → approved` (admin force-approve, requires `force=True`)
   - `submitted → rejected` (admin rejects without review)
2. WHEN `transition_application_status()` is called with a transition not in the allowed map, THE function SHALL raise a `ValueError` with code `INVALID_STATUS_TRANSITION` and a message: "Cannot transition from '{old_status}' to '{new_status}'."
3. THE Status_Transition_Service SHALL log every attempted invalid transition at `logger.warning` level with the application ID, current status, requested status, and the `changed_by` user ID.
4. THE validation SHALL occur at the start of `transition_application_status()` before any model mutations.

---

**CTO Note on Req 13:** Live `application_status_history` data from Neon confirms the issue: a `draft → approved` transition exists (bypassing `submitted` and `under_review`). The history table already records `old_status` and `new_status` — no schema changes needed. The `transition_application_status()` function currently accepts any transition without validation.

### Requirement 14: Wizard Step Accessible Announcements

**User Story:** As a student using a screen reader, I want each wizard step change to be announced with full context, so that I know which step I am on and how many steps remain.

#### Acceptance Criteria

1. WHEN the active wizard step changes, THE Application_Wizard SHALL update an `aria-live="polite"` region with a message in the format "Step [current] of [total]: [step title]".
2. THE Application_Wizard SHALL ensure the announcement region is present in the DOM before the first step renders.
3. WHEN a step change occurs due to validation failure, THE Application_Wizard SHALL include "Validation errors found" in the announcement.

### Requirement 15: Payment Error Recovery Accessibility

**User Story:** As a student using assistive technology, I want payment error states to provide accessible recovery guidance, so that I can understand what went wrong and how to retry.

#### Acceptance Criteria

1. WHEN a payment error occurs, THE Payment_Step SHALL render an error alert with `role="alert"` so screen readers announce the error immediately.
2. THE Payment_Step SHALL ensure the "Retry payment" button receives focus after a payment failure, enabling keyboard users to retry without manual navigation.
3. THE Payment_Step SHALL include descriptive text in the error alert explaining the failure reason and the available recovery action.

### Requirement 16: Admin Applications Grid Keyboard Navigation

**User Story:** As an admin using keyboard navigation, I want the virtualized applications grid to support standard keyboard patterns, so that I can navigate and select applications without a mouse.

#### Acceptance Criteria

1. THE Admin_Applications_View SHALL support arrow key navigation between rows in the virtualized grid.
2. WHEN a row is focused via keyboard, THE Admin_Applications_View SHALL visually indicate the focused row with a distinct focus style.
3. THE Admin_Applications_View SHALL support `Enter` or `Space` key to open the detail view for the focused application row.
4. THE Admin_Applications_View SHALL ensure that the virtualized grid container has `role="grid"` and rows have `role="row"` with appropriate `aria-rowindex` attributes.

### Requirement 17: Validation Error Focus Management

**User Story:** As a student filling out the application form, I want focus to move to the first validation error when I attempt to proceed, so that I can quickly find and fix the problem.

#### Acceptance Criteria

1. WHEN form validation fails on step navigation or submission, THE Application_Wizard SHALL move focus to the first field with a validation error.
2. THE Application_Wizard SHALL use `aria-describedby` to associate each form field with its corresponding error message element.
3. THE Application_Wizard SHALL ensure error messages are rendered as visible text (not only as `aria-live` announcements) so that sighted users can also see them.

### Requirement 18: Error Display Color Contrast

**User Story:** As a student with low vision, I want error messages to have sufficient color contrast, so that I can read them without difficulty.

#### Acceptance Criteria

1. THE Application_Wizard SHALL render error text with a foreground-to-background contrast ratio of at least 4.5:1 as defined by WCAG 2.1 Level AA.
2. THE Application_Wizard SHALL render error borders or indicators with a contrast ratio of at least 3:1 against adjacent colors.
3. THE Application_Wizard SHALL convey error states through both color and a secondary visual indicator (such as an icon or text label), so that color is not the sole means of communicating the error.

### Requirement 19: Admin Export Streaming

**User Story:** As an admin exporting application data, I want the export to stream results instead of loading everything into browser memory, so that large exports do not crash the browser tab.

#### Acceptance Criteria

1. WHEN an admin triggers a CSV export, THE Admin_Applications_View SHALL use a streaming download approach that writes rows incrementally rather than buffering the entire dataset in memory.
2. IF the backend provides a streaming CSV endpoint, THEN THE Admin_Applications_View SHALL consume it via a streaming fetch response.
3. IF the export is generated client-side, THEN THE Admin_Applications_View SHALL process records in batches of no more than 500 rows at a time to limit peak memory usage.

### Requirement 20: Database Integrity — Approved Application Without Payment

**User Story:** As a data integrity engineer, I want to remediate the approved application that has a NULL payment status, so that the audit trail is consistent.

#### Acceptance Criteria

1. THE remediation script SHALL update application `APP-20260401-D169738A` to set `payment_status` to `force_approved` (or an equivalent marker) and add an `admin_feedback` note documenting the remediation.
2. THE remediation script SHALL create an ApplicationStatusHistory entry recording the data fix with a system-level `changed_by` identifier.

### Requirement 21: Database Integrity — Draft Application With Verified Payment

**User Story:** As a data integrity engineer, I want to remediate the draft application that has a verified payment but was never submitted, so that the inconsistent state is resolved.

#### Acceptance Criteria

1. THE remediation script SHALL review application `MIHAS202661975` and either transition it to `submitted` (if all submission prerequisites are met) or add an `admin_feedback` note explaining the inconsistency.
2. THE remediation script SHALL create an ApplicationStatusHistory entry recording the remediation action.

### Requirement 22: Database Integrity — Missing submitted_at Timestamps

**User Story:** As a data integrity engineer, I want all non-draft applications to have a `submitted_at` timestamp, so that the audit trail is complete.

#### Acceptance Criteria

1. THE remediation script SHALL identify all applications where `status` is not `draft` and `submitted_at` is NULL.
2. THE remediation script SHALL set `submitted_at` to the earliest `created_at` value from the corresponding ApplicationStatusHistory entry where `new_status = 'submitted'`, or to the application's `created_at` if no history entry exists.
3. THE remediation script SHALL log each application ID and the timestamp value applied.
