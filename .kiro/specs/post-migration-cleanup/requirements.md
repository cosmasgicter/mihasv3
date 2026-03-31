# Requirements Document

## Introduction

Post-migration cleanup for the MIHAS admissions frontend overhaul. The CTO review of the completed migration identified four areas of tech debt: 72 legacy test files excluded from `tsconfig.json` that target the defunct Vercel Functions backend and should be deleted, dead code in `adminApi.ts` (`HtmlResponseError`, `parseJsonResponse`, `isHtmlResponse`) that is no longer called by production code, three unimplemented backend endpoints in `applications.ts` (`verifyDocument`, `generateAcceptanceLetter`, `generateFinanceReceipt`) that currently throw "not implemented" errors, and a missing documentation comment on the `downloadFile()` raw `fetch()` fallback for absolute URLs in `storage.ts`. All four areas are scoped to `apps/admissions/` and `backend/`.

## Glossary

- **Admissions_App**: The React 18 + TypeScript SPA at `apps/admissions/`, built with Vite
- **Legacy_Test_File**: A test file under `apps/admissions/tests/` that imports from non-existent directories (e.g., `../../../api/...`) targeting the defunct Vercel Functions backend
- **TSConfig_Exclude_List**: The `exclude` array in `apps/admissions/tsconfig.json` that lists files excluded from TypeScript compilation
- **Admin_API_Module**: The file `apps/admissions/src/lib/api/adminApi.ts` containing admin API helper functions
- **Application_Service**: The file `apps/admissions/src/services/applications.ts` containing application domain service methods
- **Storage_Module**: The file `apps/admissions/src/lib/storage.ts` containing file upload, download, and URL helpers
- **Django_API**: The Django 5 + DRF backend at `backend/`, serving all routes under `/api/v1/`
- **Steering_Files**: The `.kiro/steering/` documents (`tech.md`, `structure.md`, `product.md`) that guide AI-assisted development

## Requirements

### Requirement 1: Delete Legacy Test Files

**User Story:** As a developer, I want all 72 legacy test files that target the defunct Vercel Functions backend removed from disk and from the tsconfig exclude list, so that the repo contains no dead test code and the TypeScript config is clean.

#### Acceptance Criteria

1. THE Admissions_App SHALL delete from disk every test file listed in the `exclude` array of `apps/admissions/tsconfig.json` that resides under the `tests/` directory
2. AFTER deleting the Legacy_Test_Files, THE Admissions_App SHALL remove the corresponding entries from the `exclude` array in `apps/admissions/tsconfig.json`, retaining only non-test exclusions (`node_modules`, `dist`, `src/analysis`, `src/analysis/**/*`)
3. AFTER removing the Legacy_Test_Files and updating the TSConfig_Exclude_List, THE Admissions_App SHALL pass `tsc --noEmit` from `apps/admissions/` without type errors
4. AFTER removing the Legacy_Test_Files and updating the TSConfig_Exclude_List, THE Admissions_App SHALL pass `bun run test` from `apps/admissions/` with all remaining tests passing
5. IF a Legacy_Test_File does not exist on disk, THEN THE cleanup process SHALL skip deletion for that file and still remove the entry from the TSConfig_Exclude_List

### Requirement 2: Remove Dead Code from Admin API Module

**User Story:** As a developer, I want unused exports (`HtmlResponseError`, `parseJsonResponse`, `isHtmlResponse`) removed from `adminApi.ts`, so that the module contains only code that is actively called by the application.

#### Acceptance Criteria

1. THE Admin_API_Module SHALL remove the `HtmlResponseError` class, the `parseJsonResponse` function, and the `isHtmlResponse` function from `apps/admissions/src/lib/api/adminApi.ts`
2. WHEN removing dead code, THE cleanup process SHALL verify that no source file under `apps/admissions/src/` imports `HtmlResponseError`, `parseJsonResponse`, or `isHtmlResponse` from the Admin_API_Module
3. AFTER removing the dead code, THE Admissions_App SHALL pass `tsc --noEmit` from `apps/admissions/` without type errors
4. AFTER removing the dead code, THE Admissions_App SHALL pass `bun run test` from `apps/admissions/` with all remaining tests passing
5. IF a test file under `apps/admissions/tests/` imports from the removed exports, THEN THE cleanup process SHALL delete or update that test file to remove the dependency


### Requirement 3: Implement Document Verification Backend Endpoint

**User Story:** As an admin, I want a Django endpoint for document verification, so that the `verifyDocument` method in the frontend application service calls a real backend instead of throwing a "not implemented" error.

**Routing decision:** The endpoint is routed through `/api/v1/applications/{id}/verify-document/` (application-centric) rather than `/api/v1/documents/{id}/verify/` because: (a) all existing application sub-resource actions (documents, grades, review, interviews) are nested under the application ID in `backend/apps/applications/urls.py`, (b) document verification is an admin review action in the context of an application, not a document-lifecycle operation, (c) the frontend `verifyDocument` method already lives in `applicationService` with the application ID as the primary key.

#### Acceptance Criteria

1. THE Django_API SHALL expose a POST endpoint at `/api/v1/applications/{id}/verify-document/` that accepts `{documentId, documentType, status, notes}` in the request body and updates the `verification_status` field on the matching `ApplicationDocument` record
2. WHEN a valid verification request is received, THE Django_API SHALL return a `{"success": true, "data": ...}` response containing the updated document record
3. IF the application ID does not exist, THEN THE Django_API SHALL return a 404 response with `{"success": false, "error": "Application not found"}`
4. IF the `documentId` does not belong to the specified application, THEN THE Django_API SHALL return a 404 response with `{"success": false, "error": "Document not found for this application"}`
5. IF the requesting user does not have admin permissions, THEN THE Django_API SHALL return a 403 response with `{"success": false, "error": "Permission denied"}`
6. THE Application_Service SHALL update the `verifyDocument` method to call `apiClient.request('/applications/{id}/verify-document/', ...)` with method POST instead of throwing an error
7. THE Django_API SHALL include the new endpoint URL pattern in `backend/apps/applications/urls.py`
8. THE Django_API SHALL log the document verification action in the audit trail via `AuditLog.objects.create()` with `entity_type="application_documents"`

### Requirement 4: Implement Acceptance Letter Generation Backend Endpoint

**User Story:** As an admin, I want a Django endpoint for generating acceptance letters, so that the `generateAcceptanceLetter` method in the frontend application service calls a real backend instead of throwing a "not implemented" error.

**Generation model:** Async via Celery. The endpoint returns 202 with a task ID immediately. The frontend polls or receives an SSE event when the PDF is ready. This follows the existing pattern used by `DocumentExtractView` which also returns 202 + task ID for async Celery work.

#### Acceptance Criteria

1. THE Django_API SHALL expose a POST endpoint at `/api/v1/applications/{id}/acceptance-letter/` that enqueues a Celery task to generate an acceptance letter PDF for the specified application
2. WHEN a valid generation request is received, THE Django_API SHALL return a 202 response with `{"success": true, "data": {"task_id": "<celery_task_id>", "application_id": "<id>", "status": "queued"}}` immediately without waiting for PDF generation to complete
3. WHEN the Celery task completes, THE task SHALL store the generated PDF in R2 storage and create an `ApplicationDocument` record with `document_type="acceptance_letter"` and `system_generated=True`
4. IF the application ID does not exist, THEN THE Django_API SHALL return a 404 response with `{"success": false, "error": "Application not found"}`
5. IF the application status is not in an accepted state (`approved`), THEN THE Django_API SHALL return a 400 response with `{"success": false, "error": "Application must be in accepted status to generate an acceptance letter"}`
6. IF the requesting user does not have admin permissions, THEN THE Django_API SHALL return a 403 response with `{"success": false, "error": "Permission denied"}`
7. THE Application_Service SHALL update the `generateAcceptanceLetter` method to call `apiClient.request('/applications/{id}/acceptance-letter/', ...)` with method POST instead of throwing an error, and return the task metadata from the 202 response
8. THE Django_API SHALL include the new endpoint URL pattern in `backend/apps/applications/urls.py`
9. THE Django_API SHALL log the acceptance letter generation action in the audit trail
10. THE Celery task SHALL use the existing `idempotency_keys` table to prevent duplicate generation if the same request is submitted twice within a short window

### Requirement 5: Implement Finance Receipt Generation Backend Endpoint

**User Story:** As an admin, I want a Django endpoint for generating finance receipts, so that the `generateFinanceReceipt` method in the frontend application service calls a real backend instead of throwing a "not implemented" error.

**Generation model:** Async via Celery, same pattern as acceptance letter generation (Req 4). Note: a `PaymentReceiptView` already exists at `/api/v1/payments/{id}/receipt/` for viewing receipt data. This new endpoint generates a formatted PDF receipt document, which is a different operation.

#### Acceptance Criteria

1. THE Django_API SHALL expose a POST endpoint at `/api/v1/applications/{id}/finance-receipt/` that enqueues a Celery task to generate a finance receipt PDF for the specified application
2. WHEN a valid generation request is received, THE Django_API SHALL return a 202 response with `{"success": true, "data": {"task_id": "<celery_task_id>", "application_id": "<id>", "status": "queued"}}` immediately without waiting for PDF generation to complete
3. WHEN the Celery task completes, THE task SHALL store the generated PDF in R2 storage and create an `ApplicationDocument` record with `document_type="finance_receipt"` and `system_generated=True`
4. IF the application ID does not exist, THEN THE Django_API SHALL return a 404 response with `{"success": false, "error": "Application not found"}`
5. IF the application has no completed payment (no `Payment` record with `status="verified"` for this application), THEN THE Django_API SHALL return a 400 response with `{"success": false, "error": "Application must have a completed payment to generate a finance receipt"}`
6. IF the requesting user does not have admin permissions, THEN THE Django_API SHALL return a 403 response with `{"success": false, "error": "Permission denied"}`
7. THE Application_Service SHALL update the `generateFinanceReceipt` method to call `apiClient.request('/applications/{id}/finance-receipt/', ...)` with method POST instead of throwing an error, and return the task metadata from the 202 response
8. THE Django_API SHALL include the new endpoint URL pattern in `backend/apps/applications/urls.py`
9. THE Django_API SHALL log the finance receipt generation action in the audit trail
10. THE Celery task SHALL use the existing `idempotency_keys` table to prevent duplicate generation if the same request is submitted twice within a short window

### Requirement 6: Backend Tests for New Endpoints

**User Story:** As a developer, I want backend tests covering the three new Django endpoints, so that document verification, acceptance letter generation, and finance receipt generation are verified to work correctly.

#### Acceptance Criteria

1. THE backend test suite SHALL include tests for the `/api/v1/applications/{id}/verify-document/` endpoint covering: successful verification, missing application (404), document not belonging to application (404), unauthorized user (403), and response envelope format
2. THE backend test suite SHALL include tests for the `/api/v1/applications/{id}/acceptance-letter/` endpoint covering: successful 202 task queued response, missing application (404), invalid application status (400), unauthorized user (403), and idempotency (duplicate request returns same task or is rejected)
3. THE backend test suite SHALL include tests for the `/api/v1/applications/{id}/finance-receipt/` endpoint covering: successful 202 task queued response, missing application (404), missing payment (400), unauthorized user (403), and idempotency (duplicate request returns same task or is rejected)
4. THE backend tests SHALL verify that the verify-document endpoint returns the standard `{"success": true, "data": ...}` envelope on success
5. THE backend tests SHALL verify that the acceptance-letter and finance-receipt endpoints return 202 with `{"success": true, "data": {"task_id": ..., "status": "queued"}}` on success
6. THE backend tests SHALL verify that each endpoint requires admin-level authentication
7. THE backend tests SHALL verify that audit log entries are created for each successful operation
8. AFTER adding the new tests, THE backend test suite SHALL pass `python3 -m pytest` from `backend/` with all tests passing

### Requirement 7: Document the downloadFile Raw Fetch Behavior

**User Story:** As a developer, I want the `downloadFile()` raw `fetch()` fallback for absolute URLs documented with a code comment and noted in steering files, so that future contributors understand why raw fetch is intentional for external CDN resources.

#### Acceptance Criteria

1. THE Storage_Module SHALL include a code comment above the `if (/^https?:\/\//.test(path))` branch in `downloadFile()` explaining that raw `fetch(path)` is intentional for absolute URLs (external CDN links such as R2 signed URLs) because these requests target external origins and bypassing CSRF/cookie handling is correct behavior
2. THE Steering_Files SHALL note in `tech.md` under the "Conventions For New Code" or "API Contract" section that `downloadFile()` in `lib/storage.ts` uses raw `fetch()` for absolute URLs as an expected pattern for external resource downloads
3. THE Steering_Files SHALL note in `structure.md` under the "Known Migration-Sensitive Areas" section that the `downloadFile()` raw fetch for absolute URLs is intentional and documented


### Requirement 8: Build and Test Verification

**User Story:** As a developer, I want the admissions frontend and Django backend to build, type-check, and pass all tests after all cleanup changes, so that the deployment pipeline remains green.

#### Acceptance Criteria

1. AFTER all cleanup changes are applied, THE Admissions_App SHALL pass `bun run build` from `apps/admissions/` without errors
2. AFTER all cleanup changes are applied, THE Admissions_App SHALL pass `tsc --noEmit` from `apps/admissions/` without type errors
3. AFTER all cleanup changes are applied, THE Admissions_App SHALL pass `bun run test` from `apps/admissions/` with all tests passing
4. AFTER all cleanup changes are applied, THE Admissions_App SHALL pass `bun run lint` from `apps/admissions/` without new ESLint errors
5. AFTER all cleanup changes are applied, THE Django_API SHALL pass `python3 -m pytest` from `backend/` with all tests passing
