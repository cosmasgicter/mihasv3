# Bugfix Requirements Document — Platform Drift Remediation

## Introduction

Eight confirmed bugs across the MIHAS platform caused by frontend/backend drift, stale in-memory state, missing endpoints, type mismatches, and dead code. These bugs affect payment verification, admin settings, document management, application filtering, draft persistence, schema verification, type safety, and code hygiene. Grouped by severity: 3 HIGH, 4 MEDIUM, 1 LOW.

## Bug Analysis

### Current Behavior (Defect)

**Bug 1 — Payment verification returns stale status (HIGH)**

1.1 WHEN `PaymentService.verify_payment()` calls `_update_payment_status()` to write a new status to the database THEN the method returns a `PaymentVerificationResult` built from the original in-memory `payment.status` which still holds the old value (e.g. `pending`), causing the wizard to display "Payment is being confirmed" even after Lenco reports success

1.2 WHEN the payment polling task calls `verify_payment()` for a pending payment that Lenco has already marked successful THEN the returned `PaymentVerificationResult.status` is `pending` instead of `successful`, causing the student to see stale payment state until the next page refresh or DB read

**Bug 2 — Admin Settings frontend/backend HTTP method and endpoint drift (HIGH)**

1.3 WHEN the frontend calls `PUT /api/v1/admin/settings/{id}/` to update a setting THEN the backend returns 405 Method Not Allowed because `AdminSettingDetailView` only implements GET, PATCH, and DELETE

1.4 WHEN the frontend calls `POST /api/v1/admin/settings/import/` to bulk-import settings THEN the backend returns 404 Not Found because no import endpoint exists in `admin_urls.py`

1.5 WHEN the frontend calls `POST /api/v1/admin/settings/reset/` to reset settings to defaults THEN the backend returns 404 Not Found because no reset endpoint exists in `admin_urls.py`

**Bug 3 — Document/storage endpoints not backed by Django (HIGH)**

1.6 WHEN the frontend calls `GET /api/v1/documents/{id}/signed-url/` to get a download URL THEN the backend returns 404 because `document_urlpatterns` has no signed-url route

1.7 WHEN the frontend calls `GET /api/v1/documents/{id}/download/` to download a document THEN the backend returns 404 because no download route exists

1.8 WHEN the frontend calls `GET /api/v1/documents/{id}/info/` to get document metadata THEN the backend returns 404 because no info route exists

1.9 WHEN the frontend calls `DELETE /api/v1/documents/{id}/` to delete a document THEN the backend returns 404 because no delete route exists for individual documents

**Bug 4 — Application filters drift between frontend and backend (MEDIUM)**

1.10 WHEN the frontend sends `sortBy=date&sortOrder=desc` as query parameters THEN `ApplicationFilter` silently ignores them because it only recognizes the combined `sort` parameter (e.g. `-created_at`)

1.11 WHEN the frontend sends `excludeStatus`, `startDate`, or `endDate` query parameters THEN `ApplicationFilter` silently ignores them because these filter fields are not defined

1.12 WHEN the frontend sends `paymentStatus` (camelCase) THEN `ApplicationFilter` silently ignores it because it only recognizes `payment_status` (snake_case)

**Bug 5 — Draft logic split across localStorage, applications, and application_drafts (MEDIUM)**

1.13 WHEN `useMultiDraft.createDraft()` sends `draft_name` through `applicationService.create()` THEN `ApplicationCreateSerializer` silently drops the `draft_name` field because it is not defined in the serializer, so drafts are created without their user-provided name

1.14 WHEN the frontend treats draft applications (status=draft in the applications table) as the canonical draft source THEN the separate `application_drafts` table with its own `ApplicationDraft` model is bypassed, creating two parallel draft systems with no synchronization

**Bug 6 — DB migration ownership drifting (MEDIUM)**

1.15 WHEN `verify_schema_static.py` runs its table verification THEN it only checks 26 tables and misses `program_fees`, `webhook_event_logs`, `error_logs`, and `sse_events` which exist in the database, giving a false-positive "all tables verified" result

1.16 WHEN `apply-migrations.ts` looks for SQL files under `./migrations` (relative to its own location in `backend/migrations/`) THEN it cannot find migration scripts that live in `backend/scripts/` (e.g. `lenco_payment_integration.sql`, `create_error_logs_table.sql`), so newer tables are never applied by the migration runner

**Bug 7 — Type drift in shared frontend DB types (MEDIUM)**

1.17 WHEN the frontend reads `ApplicationGrade.grade` as a `string` type THEN it mismatches the backend `ApplicationGrade.grade` which is `IntegerField()` (1-9 ECZ scale), causing potential comparison and sorting bugs

1.18 WHEN the frontend `ApplicationDocument` type uses `file_path`, `file_name`, and `status` fields THEN these don't match the backend `ApplicationDocument` model which uses `document_name`, `verification_status`, `uploaded_at`, and `system_generated`, causing undefined field access at runtime

**Bug 8 — Legacy duplicate frontend surfaces (LOW)**

1.19 WHEN `notifications.ts` exports both `notificationService` (object literal) and `NotificationService` (class) THEN consumers have two overlapping APIs for the same functionality, increasing maintenance burden and confusion

1.20 WHEN `data/applications.ts` calls `POST /applications/bulk` for bulk status updates THEN the backend returns 404 because the actual route is `POST /applications/bulk-status/`

1.21 WHEN the legacy `ApplicationsTable` component in `src/components/admin/ApplicationsTable.tsx` exists alongside the active `ApplicationsTable` in `src/components/admin/applications/ApplicationsTable.tsx` THEN imports can resolve to the wrong component

### Expected Behavior (Correct)

**Bug 1 — Payment verification returns fresh status**

2.1 WHEN `PaymentService.verify_payment()` calls `_update_payment_status()` THEN the method SHALL either refresh the payment object from the database or use `new_status` directly in the returned `PaymentVerificationResult`, so the caller always receives the current status

2.2 WHEN the payment polling task calls `verify_payment()` for a payment that Lenco has marked successful THEN the returned `PaymentVerificationResult.status` SHALL be `successful`, and the wizard SHALL immediately reflect the updated payment state

**Bug 2 — Admin Settings endpoints aligned**

2.3 WHEN the frontend calls `PATCH /api/v1/admin/settings/{id}/` to update a setting (changed from PUT to PATCH) THEN the backend SHALL accept the request and return the updated setting

2.4 WHEN the frontend calls `POST /api/v1/admin/settings/import/` to bulk-import settings THEN the backend SHALL accept an array of settings, upsert them, and return the import results

2.5 WHEN the frontend calls `POST /api/v1/admin/settings/reset/` to reset settings THEN the backend SHALL restore default settings and return confirmation

**Bug 3 — Document endpoints implemented**

2.6 WHEN the frontend calls `GET /api/v1/documents/{id}/signed-url/` THEN the backend SHALL return a time-limited signed URL for the document's R2 object

2.7 WHEN the frontend calls `GET /api/v1/documents/{id}/download/` THEN the backend SHALL redirect to or stream the document content

2.8 WHEN the frontend calls `GET /api/v1/documents/{id}/info/` THEN the backend SHALL return the document metadata (type, name, size, verification status, timestamps)

2.9 WHEN the frontend calls `DELETE /api/v1/documents/{id}/` THEN the backend SHALL soft-delete or remove the document record and return confirmation

**Bug 4 — Application filters aligned**

2.10 WHEN the frontend sends `sortBy` and `sortOrder` as separate query parameters THEN `ApplicationFilter` SHALL translate them into the combined sort format (e.g. `sortBy=date&sortOrder=desc` → `-created_at`)

2.11 WHEN the frontend sends `excludeStatus`, `startDate`, or `endDate` query parameters THEN `ApplicationFilter` SHALL apply them as queryset filters

2.12 WHEN the frontend sends `paymentStatus` (camelCase) THEN `ApplicationFilter` SHALL recognize it as an alias for `payment_status`

**Bug 5 — Draft system unified**

2.13 WHEN `useMultiDraft.createDraft()` sends `draft_name` through `applicationService.create()` THEN `ApplicationCreateSerializer` SHALL accept and persist the `draft_name` field on the application record

2.14 WHEN the platform manages drafts THEN it SHALL use a single canonical draft system (either applications with status=draft or the application_drafts table, not both), with clear ownership and no data duplication

**Bug 6 — Schema verification and migration paths aligned**

2.15 WHEN `verify_schema_static.py` runs THEN it SHALL check all tables including `program_fees`, `webhook_event_logs`, `error_logs`, and `sse_events`

2.16 WHEN `apply-migrations.ts` runs THEN it SHALL find and apply all SQL migration scripts regardless of whether they live in `backend/migrations/` or `backend/scripts/`, using a single authoritative migration registry

**Bug 7 — Frontend types match backend models**

2.17 WHEN the frontend defines `ApplicationGrade.grade` THEN it SHALL be typed as `number` to match the backend `IntegerField()` (1-9 ECZ scale)

2.18 WHEN the frontend defines `ApplicationDocument` THEN it SHALL include `document_name`, `verification_status`, `uploaded_at`, and `system_generated` fields matching the backend model, and deprecated aliases (`file_path`, `file_name`, `status`) SHALL be marked with `@deprecated` JSDoc comments

**Bug 8 — Legacy duplicates cleaned up**

2.19 WHEN `notifications.ts` exports notification functionality THEN it SHALL export only `notificationService` (the object literal), with the duplicate `NotificationService` class removed and its unique methods (template-based sends) merged into the object

2.20 WHEN `data/applications.ts` calls the bulk status endpoint THEN it SHALL use `POST /applications/bulk-status/` matching the backend route

2.21 WHEN the admin applications UI needs a table component THEN only the active `ApplicationsTable` in `src/components/admin/applications/ApplicationsTable.tsx` SHALL exist, with the legacy duplicate in `src/components/admin/ApplicationsTable.tsx` removed

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `verify_payment()` is called for a payment already in a terminal state (successful, failed) THEN the system SHALL CONTINUE TO return the current state without calling the Lenco API

3.2 WHEN `verify_payment()` encounters a Lenco API timeout or error THEN the system SHALL CONTINUE TO return the pending status with an error message, without crashing

3.3 WHEN the frontend calls `GET /api/v1/admin/settings/` to list settings THEN the system SHALL CONTINUE TO return the settings list unchanged

3.4 WHEN the frontend calls `GET /api/v1/admin/settings/{id}/` to read a single setting THEN the system SHALL CONTINUE TO return the setting unchanged

3.5 WHEN the frontend calls `DELETE /api/v1/admin/settings/{id}/` to delete a setting THEN the system SHALL CONTINUE TO delete the setting and return confirmation

3.6 WHEN the frontend calls `POST /api/v1/documents/upload/` to upload a document THEN the system SHALL CONTINUE TO accept the upload and return the document record

3.7 WHEN the frontend calls `GET /api/v1/documents/{id}/extract/` to extract text THEN the system SHALL CONTINUE TO return extracted text

3.8 WHEN the frontend sends `status`, `payment_status`, `program`, `intake`, `institution`, or `search` query parameters THEN `ApplicationFilter` SHALL CONTINUE TO filter applications correctly using the existing filter fields

3.9 WHEN the frontend sends the `sort` parameter in the existing format (e.g. `-created_at`) THEN `ApplicationFilter` SHALL CONTINUE TO sort correctly

3.10 WHEN a student creates a full application (not a draft) through the wizard THEN `ApplicationCreateSerializer` SHALL CONTINUE TO validate and persist all existing fields unchanged

3.11 WHEN `verify_schema_static.py` checks the original 26 tables THEN it SHALL CONTINUE TO verify their models, foreign keys, and indexes correctly

3.12 WHEN `apply-migrations.ts` applies the existing numbered migration files (001-011) THEN it SHALL CONTINUE TO apply them in order without changes

3.13 WHEN the frontend reads `Application`, `Program`, `Intake`, `Subject`, or `Institution` types THEN they SHALL CONTINUE TO have the same shape and field names

3.14 WHEN `notificationService.send()`, `.list()`, `.markRead()`, `.markAllRead()`, `.delete()`, `.getPreferences()`, or `.updatePreferences()` are called THEN they SHALL CONTINUE TO work identically

3.15 WHEN the Lenco webhook processor receives a valid webhook event THEN it SHALL CONTINUE TO validate the HMAC signature, log the event, and delegate to PaymentService unchanged

3.16 WHEN the payment polling task runs for pending payments THEN it SHALL CONTINUE TO poll and update payments, now returning the correct status from verify_payment()
