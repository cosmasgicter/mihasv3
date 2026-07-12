# Implementation Plan: Post-Migration Cleanup

## Overview

Clean up four categories of tech debt from the MIHAS admissions migration: delete 72 legacy test files, remove dead code from `adminApi.ts`, implement three new backend endpoints (verify-document, acceptance-letter, finance-receipt) with Celery tasks, update frontend service methods, add documentation, and verify the full build/test pipeline.

Implementation order follows the CTO review priority: zero-risk deletions first, then backend endpoints, then frontend wiring, then tests, then final verification.

## Tasks

- [x] 1. Delete legacy test files and clean tsconfig.json
  - [x] 1.1 Delete all 72 legacy test files listed in the `exclude` array of `apps/admissions/tsconfig.json` that reside under `tests/`
    - Remove every file path in the `exclude` array that starts with `tests/`
    - Skip any file that does not exist on disk
    - _Requirements: 1.1, 1.5_
  - [x] 1.2 Update `apps/admissions/tsconfig.json` exclude array to retain only non-test exclusions
    - Keep only: `node_modules`, `dist`, `src/analysis`, `src/analysis/**/*`
    - Remove all `tests/...` entries from the exclude array
    - _Requirements: 1.2_

- [x] 2. Remove dead code from adminApi.ts
  - [x] 2.1 Remove `HtmlResponseError` class, `isHtmlResponse` function, and `parseJsonResponse` function from `apps/admissions/src/lib/api/adminApi.ts`
    - Verify no source file under `apps/admissions/src/` imports these symbols before removing
    - _Requirements: 2.1, 2.2_

- [x] 3. Document downloadFile() raw fetch behavior
  - [x] 3.1 Add code comment in `apps/admissions/src/lib/storage.ts`
    - Add a comment above the `if (/^https?:\/\//.test(path))` branch in `downloadFile()` explaining that raw `fetch(path)` is intentional for absolute URLs (R2 signed URLs / external CDN links) because these requests target external origins where CSRF/cookie handling should be bypassed
    - _Requirements: 7.1_
  - [x] 3.2 Update `.kiro/steering/tech.md`
    - Add a note under "Conventions For New Code" that `downloadFile()` in `lib/storage.ts` uses raw `fetch()` for absolute URLs as an expected pattern for external resource downloads
    - _Requirements: 7.2_
  - [x] 3.3 Update `.kiro/steering/structure.md`
    - Add a note under "Known Migration-Sensitive Areas" that the `downloadFile()` raw fetch for absolute URLs is intentional and documented
    - _Requirements: 7.3_

- [x] 4. Checkpoint — Verify zero-risk cleanup
  - Run `cd apps/admissions && bun run build` and `cd apps/admissions && bun run test` to confirm legacy file deletion, dead code removal, and documentation changes cause no regressions. Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement backend verify-document endpoint
  - [x] 5.1 Create `DocumentVerifySerializer` and `ApplicationVerifyDocumentView` in `backend/apps/applications/views.py`
    - Synchronous POST endpoint at `/api/v1/applications/{id}/verify-document/`
    - Accept `{documentId, documentType, status, notes}` in request body
    - Look up Application by `application_id` → 404 if missing
    - Look up ApplicationDocument by `documentId` where `application_id` matches → 404 if not found
    - Require `IsAdmin` permission → 403 if not admin
    - Update `verification_status`, `verified_by`, `verified_at`, `verification_notes` on the document
    - Create AuditLog entry with `entity_type="application_documents"`
    - Return 200 with `{"success": true, "data": <DocumentSerializer output>}`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.8_
  - [x] 5.2 Add URL pattern for verify-document in `backend/apps/applications/urls.py`
    - `path("<uuid:application_id>/verify-document/", ApplicationVerifyDocumentView.as_view(), name="application-verify-document")`
    - Import the new view in the urls module
    - _Requirements: 3.7_

- [x] 6. Implement backend acceptance-letter endpoint
  - [x] 6.1 Create `AcceptanceLetterView` in `backend/apps/applications/views.py`
    - Async POST endpoint at `/api/v1/applications/{id}/acceptance-letter/`
    - Require `IsAdmin` permission → 403 if not admin
    - Look up Application → 404 if missing
    - Validate `application.status == "approved"` → 400 if not
    - Check idempotency via `IdempotencyKey` with key `acceptance-letter:{application_id}` and 1-hour TTL → return cached response if duplicate
    - Enqueue `generate_acceptance_letter_task.delay(str(application.id))`
    - Store idempotency key with response JSON
    - Create AuditLog entry
    - Return 202 with `{"success": true, "data": {"task_id": ..., "application_id": ..., "status": "queued"}}`
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.6, 4.9, 4.10_
  - [x] 6.2 Add URL pattern for acceptance-letter in `backend/apps/applications/urls.py`
    - `path("<uuid:application_id>/acceptance-letter/", AcceptanceLetterView.as_view(), name="application-acceptance-letter")`
    - _Requirements: 4.8_

- [x] 7. Implement backend finance-receipt endpoint
  - [x] 7.1 Create `FinanceReceiptView` in `backend/apps/applications/views.py`
    - Async POST endpoint at `/api/v1/applications/{id}/finance-receipt/`
    - Require `IsAdmin` permission → 403 if not admin
    - Look up Application → 404 if missing
    - Validate that a `Payment` with `status="verified"` exists for this application → 400 if not
    - Check idempotency via `IdempotencyKey` with key `finance-receipt:{application_id}` and 1-hour TTL → return cached response if duplicate
    - Enqueue `generate_finance_receipt_task.delay(str(application.id))`
    - Store idempotency key with response JSON
    - Create AuditLog entry
    - Return 202 with `{"success": true, "data": {"task_id": ..., "application_id": ..., "status": "queued"}}`
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6, 5.9, 5.10_
  - [x] 7.2 Add URL pattern for finance-receipt in `backend/apps/applications/urls.py`
    - `path("<uuid:application_id>/finance-receipt/", FinanceReceiptView.as_view(), name="application-finance-receipt")`
    - _Requirements: 5.8_

- [x] 8. Implement Celery tasks for PDF generation
  - [x] 8.1 Create `backend/apps/applications/tasks.py` with `generate_acceptance_letter_task` and `generate_finance_receipt_task`
    - Follow the `extract_document_text_task` pattern in `backend/apps/documents/tasks.py`
    - Both tasks: `@shared_task(bind=True, max_retries=3, default_retry_delay=60)`
    - Each task loads the Application, generates a real PDF via `reportlab` (simple single-page with application details), stores in R2 via `MediaStorage`, creates an `ApplicationDocument` record with `system_generated=True` and appropriate `document_type`
    - `generate_acceptance_letter_task`: `document_type="acceptance_letter"`
    - `generate_finance_receipt_task`: `document_type="finance_receipt"`
    - On permanent failure, log error but do not create a broken ApplicationDocument record
    - Exponential backoff: 60s, 120s, 240s
    - _Requirements: 4.3, 5.3_

- [x] 9. Checkpoint — Verify backend endpoints
  - Run `cd backend && python3 -m pytest` to confirm all three new views, URL patterns, and Celery tasks are wired correctly. Ensure all tests pass, ask the user if questions arise.

- [x] 10. Update frontend service methods
  - [x] 10.1 Update `verifyDocument` in `apps/admissions/src/services/applications.ts`
    - Replace the `throw new Error(...)` stub with `apiClient.request('/applications/${encodeURIComponent(id)}/verify-document/', { method: 'POST', body: JSON.stringify(payload) })`
    - Remove the underscore prefixes from `_id` and `_payload` parameters
    - _Requirements: 3.6_
  - [x] 10.2 Update `generateAcceptanceLetter` in `apps/admissions/src/services/applications.ts`
    - Replace the `throw new Error(...)` stub with `apiClient.request<{ task_id: string; application_id: string; status: string }>('/applications/${encodeURIComponent(id)}/acceptance-letter/', { method: 'POST' })`
    - Remove the underscore prefix from `_id` parameter
    - _Requirements: 4.7_
  - [x] 10.3 Update `generateFinanceReceipt` in `apps/admissions/src/services/applications.ts`
    - Replace the `throw new Error(...)` stub with `apiClient.request<{ task_id: string; application_id: string; status: string }>('/applications/${encodeURIComponent(id)}/finance-receipt/', { method: 'POST' })`
    - Remove the underscore prefix from `_id` parameter
    - _Requirements: 5.7_

- [x] 11. Backend unit tests for new endpoints
  - [x] 11.1 Create `backend/tests/unit/test_application_endpoints.py` with unit tests for all three new views
    - Test verify-document: successful verification (200), missing application (404), document not belonging to application (404), unauthorized user (403), invalid request body (400), response envelope format
    - Test acceptance-letter: successful 202 response, missing application (404), non-approved application (400), unauthorized user (403), idempotency (duplicate returns cached response)
    - Test finance-receipt: successful 202 response, missing application (404), no verified payment (400), unauthorized user (403), idempotency (duplicate returns cached response)
    - Verify audit log entries are created for each successful operation
    - Use existing factories: `ApplicationFactory`, `ApplicationDocumentFactory`, `PaymentFactory`, `ProfileFactory` from `backend/tests/factories.py`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_
  - [x] 11.2 Create `backend/tests/unit/test_application_tasks.py` with unit tests for Celery tasks
    - Test `generate_acceptance_letter_task` creates ApplicationDocument with correct fields
    - Test `generate_finance_receipt_task` creates ApplicationDocument with correct fields
    - Verify `system_generated=True` and correct `document_type` on created records
    - Mock `MediaStorage` to avoid real R2 calls
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 12. Backend property tests for new endpoints
  - [x] 12.1 Write property test for document verification status update
    - **Property 2: Document verification updates status correctly**
    - **Validates: Requirements 3.1, 3.2**
    - Add to `backend/tests/property/test_application_endpoints.py`
    - Use hypothesis to generate random verification statuses from `{verified, rejected}` and verify the document's `verification_status` field matches
  - [x] 12.2 Write property test for admin permission enforcement
    - **Property 3: Admin permission enforcement on new endpoints**
    - **Validates: Requirements 3.5, 4.6, 5.6**
    - Add to `backend/tests/property/test_application_endpoints.py`
    - Use hypothesis to generate non-admin roles and verify all three endpoints return 403
  - [x] 12.3 Write property test for audit log creation
    - **Property 5: Audit log creation on successful operations**
    - **Validates: Requirements 3.8, 4.9, 5.9**
    - Add to `backend/tests/property/test_application_endpoints.py`
    - Verify AuditLog entry is created with correct `entity_type`, `action`, and `actor_id` for each endpoint
  - [x] 12.4 Write property test for acceptance letter 202 response
    - **Property 6: Acceptance letter endpoint returns 202 for approved applications**
    - **Validates: Requirements 4.1, 4.2**
    - Add to `backend/tests/property/test_application_endpoints.py`
    - Use hypothesis to generate approved applications and verify 202 response shape
  - [x] 12.5 Write property test for finance receipt 202 response
    - **Property 7: Finance receipt endpoint returns 202 for applications with verified payment**
    - **Validates: Requirements 5.1, 5.2**
    - Add to `backend/tests/property/test_application_endpoints.py`
    - Use hypothesis to generate applications with verified payments and verify 202 response shape
  - [x] 12.6 Write property test for Celery task ApplicationDocument creation
    - **Property 8: Celery tasks create correct ApplicationDocument records**
    - **Validates: Requirements 4.3, 5.3**
    - Add to `backend/tests/property/test_application_tasks.py`
    - Verify `system_generated=True` and correct `document_type` after task completion
  - [x] 12.7 Write property test for acceptance letter rejecting non-approved applications
    - **Property 9: Acceptance letter rejects non-approved applications**
    - **Validates: Requirements 4.5**
    - Add to `backend/tests/property/test_application_endpoints.py`
    - Use hypothesis to generate non-approved statuses (`draft`, `submitted`, `under_review`, `rejected`) and verify 400 response
  - [x] 12.8 Write property test for finance receipt rejecting applications without verified payment
    - **Property 10: Finance receipt rejects applications without verified payment**
    - **Validates: Requirements 5.5**
    - Add to `backend/tests/property/test_application_endpoints.py`
    - Verify 400 response when no Payment with `status="verified"` exists
  - [x] 12.9 Write property test for idempotent generation requests
    - **Property 11: Idempotent generation requests**
    - **Validates: Requirements 4.10, 5.10**
    - Add to `backend/tests/property/test_application_endpoints.py`
    - Submit same POST twice within idempotency window and verify same `task_id` returned, no second Celery task enqueued

- [x] 13. Frontend property tests
  - [x] 13.1 Write property test for no dead code imports
    - **Property 1: No source imports of removed dead code**
    - **Validates: Requirements 2.2**
    - Extend `apps/admissions/tests/property/services.property.test.ts`
    - Use fast-check to verify no source file under `apps/admissions/src/` imports `HtmlResponseError`, `parseJsonResponse`, or `isHtmlResponse` from `adminApi.ts`
  - [x] 13.2 Write property test for frontend service URL construction
    - **Property 4: Frontend service URL construction**
    - **Validates: Requirements 3.6, 4.7, 5.7**
    - Extend `apps/admissions/tests/property/services.property.test.ts`
    - Use fast-check to generate random application ID strings and verify `verifyDocument`, `generateAcceptanceLetter`, and `generateFinanceReceipt` construct URLs matching `/applications/{id}/verify-document/`, `/applications/{id}/acceptance-letter/`, `/applications/{id}/finance-receipt/`

- [x] 14. Final checkpoint — Full build and test verification
  - Run `cd apps/admissions && bun run build`, `cd apps/admissions && bun run test`, `cd apps/admissions && bun run lint`, and `cd backend && python3 -m pytest` to confirm everything passes end-to-end. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major phase
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Use `bun` for all frontend commands, `python3 -m pytest` for backend
- Celery tasks go in `backend/apps/applications/tasks.py`, views in `backend/apps/applications/views.py`
- Idempotency TTL is 1 hour, checked at query time (`created_at > now() - 1 hour`)
