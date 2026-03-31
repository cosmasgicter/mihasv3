# Design Document: Post-Migration Cleanup

## Overview

This feature addresses four categories of tech debt identified during the CTO review of the completed MIHAS admissions migration:

1. **Legacy test file deletion** — 72 test files under `apps/admissions/tests/` that import from the defunct Vercel Functions backend (`../../../api/...`). These are excluded in `tsconfig.json` and should be deleted along with their exclude entries.
2. **Dead code removal** — `HtmlResponseError`, `parseJsonResponse`, and `isHtmlResponse` in `adminApi.ts` are unused since the migration to `apiClient.request()`. They should be removed.
3. **Three new backend endpoints** — `verifyDocument`, `generateAcceptanceLetter`, and `generateFinanceReceipt` currently throw "not implemented" errors in the frontend `applicationService`. Each needs a real Django view, URL pattern, and updated frontend service method.
4. **Documentation** — The `downloadFile()` raw `fetch()` fallback for absolute URLs in `storage.ts` needs a code comment and steering file notes.

The cleanup is scoped entirely to `apps/admissions/` and `backend/`. No schema changes, no new models, no new tables.

## Architecture

### System Context

```mermaid
graph LR
    subgraph Frontend ["apps/admissions/"]
        A[applicationService] -->|POST /applications/{id}/verify-document/| B
        A -->|POST /applications/{id}/acceptance-letter/| B
        A -->|POST /applications/{id}/finance-receipt/| B
        B[apiClient]
    end

    subgraph Backend ["backend/"]
        C[ApplicationVerifyDocumentView] --> D[ApplicationDocument]
        E[AcceptanceLetterView] --> F[Celery: generate_acceptance_letter_task]
        G[FinanceReceiptView] --> H[Celery: generate_finance_receipt_task]
        F --> I[R2 Storage + ApplicationDocument]
        H --> I
        F --> J[IdempotencyKey]
        H --> J
        C --> K[AuditLog]
        E --> K
        G --> K
    end

    B -->|HTTP| C
    B -->|HTTP| E
    B -->|HTTP| G
```

### Routing Decision

All three new endpoints are nested under `/api/v1/applications/{id}/` in `backend/apps/applications/urls.py`. This is consistent with the existing sub-resource pattern (documents, grades, review, interviews) and matches the frontend where all three methods live in `applicationService` with the application ID as the primary key.

### Async Generation Pattern

Acceptance letter and finance receipt generation follow the existing `DocumentExtractView` pattern:
- POST returns **202 Accepted** immediately with `{task_id, application_id, status: "queued"}`
- A Celery task runs asynchronously, generates the PDF, stores it in R2, and creates an `ApplicationDocument` record
- Idempotency is enforced via the existing `idempotency_keys` table to prevent duplicate generation

Document verification is synchronous (simple field update) and returns 200.

## Components and Interfaces

### 1. Legacy Test File Cleanup (Frontend)

**Files affected:**
- Delete 72 test files listed in the `exclude` array of `apps/admissions/tsconfig.json` that reside under `tests/`
- Update `apps/admissions/tsconfig.json` to retain only non-test exclusions: `node_modules`, `dist`, `src/analysis`, `src/analysis/**/*`

**No new components.** This is a pure deletion task.

### 2. Dead Code Removal (Frontend)

**File:** `apps/admissions/src/lib/api/adminApi.ts`

Remove three exports:
- `HtmlResponseError` class (lines 18–24)
- `isHtmlResponse` function (lines 29–33)
- `parseJsonResponse` function (lines 38–50)

These were used by the old Vercel Functions API layer. All admin API calls now go through `apiClient.request()` which handles response parsing internally.

### 3. ApplicationVerifyDocumentView (Backend)

**New view** in `backend/apps/applications/views.py`:

```python
class ApplicationVerifyDocumentView(APIView):
    """POST /api/v1/applications/{id}/verify-document/"""
    permission_classes = [IsAdmin]
```

**Request body:**
```json
{
  "documentId": "uuid",
  "documentType": "string (optional)",
  "status": "verified | rejected",
  "notes": "string (optional)"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": { /* DocumentSerializer output */ }
}
```

**Serializer:** New `DocumentVerifySerializer` in `backend/apps/applications/views.py` (inline, following the existing pattern of view-local serializers like `ApplicationInterviewWriteSerializer`).

**Behavior:**
1. Look up Application by `application_id` path param → 404 if missing
2. Check admin permission → 403 if not admin
3. Look up ApplicationDocument by `documentId` where `application_id` matches → 404 if not found or doesn't belong to application
4. Update `verification_status`, `verified_by`, `verified_at`, `verification_notes` on the document
5. Create AuditLog entry with `entity_type="application_documents"`
6. Return updated document via `DocumentSerializer`

### 4. AcceptanceLetterView (Backend)

**New view** in `backend/apps/applications/views.py`:

```python
class AcceptanceLetterView(APIView):
    """POST /api/v1/applications/{id}/acceptance-letter/"""
    permission_classes = [IsAdmin]
```

**Request body:** Empty (application ID is in the URL path).

**Response (202):**
```json
{
  "task_id": "celery-task-id",
  "application_id": "uuid",
  "status": "queued"
}
```

**Behavior:**
1. Look up Application → 404 if missing
2. Check admin permission → 403
3. Validate `application.status == "approved"` → 400 if not
4. Check idempotency via `IdempotencyKey` → return cached response if duplicate
5. Enqueue `generate_acceptance_letter_task.delay(str(application.id))`
6. Store idempotency key
7. Create AuditLog entry
8. Return 202 with task metadata

### 5. FinanceReceiptView (Backend)

**New view** in `backend/apps/applications/views.py`:

```python
class FinanceReceiptView(APIView):
    """POST /api/v1/applications/{id}/finance-receipt/"""
    permission_classes = [IsAdmin]
```

**Request body:** Empty.

**Response (202):** Same shape as AcceptanceLetterView.

**Behavior:**
1. Look up Application → 404 if missing
2. Check admin permission → 403
3. Validate that a `Payment` with `status="verified"` exists for this application → 400 if not
4. Check idempotency → return cached response if duplicate
5. Enqueue `generate_finance_receipt_task.delay(str(application.id))`
6. Store idempotency key
7. Create AuditLog entry
8. Return 202 with task metadata

### 6. Celery Tasks (Backend)

**New file:** `backend/apps/applications/tasks.py`

Two tasks following the `extract_document_text_task` pattern in `backend/apps/documents/tasks.py`:

```python
@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_acceptance_letter_task(self, application_id):
    """Generate acceptance letter PDF, store in R2, create ApplicationDocument."""

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_finance_receipt_task(self, application_id):
    """Generate finance receipt PDF, store in R2, create ApplicationDocument."""
```

Each task:
1. Loads the Application record
2. Generates a real PDF file (initial implementation uses `reportlab` to produce a simple single-page PDF with application details — not an empty file, so R2 storage and ApplicationDocument creation are fully exercised in tests)
3. Stores the PDF in R2 via `MediaStorage`
4. Creates an `ApplicationDocument` record with `system_generated=True` and the appropriate `document_type`

**Note on PDF quality:** The initial implementation produces a functional but minimal PDF. Template refinement (branding, layout, multi-page) is a follow-up concern — the priority here is getting the async pipeline working end-to-end.

### 7. URL Patterns (Backend)

Three new entries in `backend/apps/applications/urls.py`:

```python
path("<uuid:application_id>/verify-document/", ApplicationVerifyDocumentView.as_view(), name="application-verify-document"),
path("<uuid:application_id>/acceptance-letter/", AcceptanceLetterView.as_view(), name="application-acceptance-letter"),
path("<uuid:application_id>/finance-receipt/", FinanceReceiptView.as_view(), name="application-finance-receipt"),
```

No changes to `backend/config/urls.py` — the applications app is already included.

### 8. Frontend Service Updates

**File:** `apps/admissions/src/services/applications.ts`

Update three methods that currently throw "not implemented" errors:

```typescript
verifyDocument: async (id: string, payload: { documentId?: string; documentType?: string; status: string; notes?: string }) => {
  return apiClient.request(`/applications/${encodeURIComponent(id)}/verify-document/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
},

generateAcceptanceLetter: async (id: string) => {
  return apiClient.request<{ task_id: string; application_id: string; status: string }>(
    `/applications/${encodeURIComponent(id)}/acceptance-letter/`,
    { method: 'POST' }
  )
},

generateFinanceReceipt: async (id: string) => {
  return apiClient.request<{ task_id: string; application_id: string; status: string }>(
    `/applications/${encodeURIComponent(id)}/finance-receipt/`,
    { method: 'POST' }
  )
},
```

### 9. Documentation Updates

**`apps/admissions/src/lib/storage.ts`:** Add a code comment above the `if (/^https?:\/\//.test(path))` branch in `downloadFile()` explaining that raw `fetch(path)` is intentional for absolute URLs (R2 signed URLs / external CDN links) because these requests target external origins where CSRF/cookie handling should be bypassed.

**`.kiro/steering/tech.md`:** Add a note under "Conventions For New Code" that `downloadFile()` in `lib/storage.ts` uses raw `fetch()` for absolute URLs as an expected pattern for external resource downloads.

**`.kiro/steering/structure.md`:** Add a note under "Known Migration-Sensitive Areas" that the `downloadFile()` raw fetch for absolute URLs is intentional and documented.

## Data Models

No new database tables or schema changes. All work uses existing models:

### Existing Models Used

| Model | Table | Usage |
|-------|-------|-------|
| `Application` | `applications` | Lookup target for all three new endpoints |
| `ApplicationDocument` | `application_documents` | Updated by verify-document; created by acceptance letter and finance receipt tasks |
| `Payment` | `payments` | Queried by finance receipt endpoint to validate verified payment exists |
| `AuditLog` | `audit_logs` | Created by all three new endpoints for audit trail |
| `IdempotencyKey` | `idempotency_keys` | Used by acceptance letter and finance receipt endpoints to prevent duplicate generation |

### ApplicationDocument Fields Used

For document verification (update):
- `verification_status` — set to the `status` from the request (`verified` / `rejected`)
- `verified_by` — set to `request.user.id`
- `verified_at` — set to `timezone.now()`
- `verification_notes` — set to `notes` from the request

For system-generated documents (create):
- `document_type` — `"acceptance_letter"` or `"finance_receipt"`
- `document_name` — generated filename
- `file_url` — R2 URL from `MediaStorage`
- `system_generated` — `True`
- `verification_status` — `"verified"` (system-generated documents are pre-verified)

### IdempotencyKey Fields Used

- `key` — composite of endpoint + application_id (e.g., `acceptance-letter:{application_id}`)
- `endpoint` — the URL path
- `response_json` — cached 202 response body
- `created_at` — auto-set, used for TTL cleanup

**Idempotency TTL:** 1 hour. Keys older than 1 hour are considered expired and a new generation request is allowed. This is long enough to prevent accidental double-clicks but short enough that an admin can intentionally regenerate a document the next day. The TTL check is performed at query time (`created_at > now() - 1 hour`), not via a background cleanup job.



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: No source imports of removed dead code

*For any* source file under `apps/admissions/src/`, the file shall not contain an import of `HtmlResponseError`, `parseJsonResponse`, or `isHtmlResponse` from `adminApi.ts`.

**Validates: Requirements 2.2**

### Property 2: Document verification updates status correctly

*For any* valid application with at least one document, and *for any* verification status in `{verified, rejected}`, posting a verification request to `/applications/{id}/verify-document/` with that status shall result in the target document's `verification_status` field being set to the requested status, and the response shall contain the updated document record.

**Validates: Requirements 3.1, 3.2**

### Property 3: Admin permission enforcement on new endpoints

*For any* user without admin or super_admin role, POST requests to `/applications/{id}/verify-document/`, `/applications/{id}/acceptance-letter/`, and `/applications/{id}/finance-receipt/` shall all return HTTP 403.

**Validates: Requirements 3.5, 4.6, 5.6**

### Property 4: Frontend service URL construction

*For any* application ID string, the `verifyDocument`, `generateAcceptanceLetter`, and `generateFinanceReceipt` methods in `applicationService` shall construct URLs matching the patterns `/applications/{id}/verify-document/`, `/applications/{id}/acceptance-letter/`, and `/applications/{id}/finance-receipt/` respectively.

**Validates: Requirements 3.6, 4.7, 5.7**

### Property 5: Audit log creation on successful operations

*For any* successful call to the verify-document, acceptance-letter, or finance-receipt endpoints, an `AuditLog` entry shall be created with the correct `entity_type` and `action` fields, and the `actor_id` shall match the requesting admin user's ID.

**Validates: Requirements 3.8, 4.9, 5.9**

### Property 6: Acceptance letter endpoint returns 202 for approved applications

*For any* application with `status="approved"` and *for any* admin user, POST to `/applications/{id}/acceptance-letter/` shall return HTTP 202 with a response body containing `task_id` (non-empty string), `application_id` (matching the request), and `status="queued"`.

**Validates: Requirements 4.1, 4.2**

### Property 7: Finance receipt endpoint returns 202 for applications with verified payment

*For any* application that has at least one `Payment` record with `status="verified"` and *for any* admin user, POST to `/applications/{id}/finance-receipt/` shall return HTTP 202 with a response body containing `task_id` (non-empty string), `application_id` (matching the request), and `status="queued"`.

**Validates: Requirements 5.1, 5.2**

### Property 8: Celery tasks create correct ApplicationDocument records

*For any* application ID, when `generate_acceptance_letter_task` or `generate_finance_receipt_task` completes successfully, an `ApplicationDocument` record shall exist with `application_id` matching the input, `system_generated=True`, and `document_type` equal to `"acceptance_letter"` or `"finance_receipt"` respectively.

**Validates: Requirements 4.3, 5.3**

### Property 9: Acceptance letter rejects non-approved applications

*For any* application with `status` not equal to `"approved"` (e.g., `draft`, `submitted`, `under_review`, `rejected`), POST to `/applications/{id}/acceptance-letter/` shall return HTTP 400.

**Validates: Requirements 4.5**

### Property 10: Finance receipt rejects applications without verified payment

*For any* application that has no `Payment` record with `status="verified"`, POST to `/applications/{id}/finance-receipt/` shall return HTTP 400.

**Validates: Requirements 5.5**

### Property 11: Idempotent generation requests

*For any* application eligible for acceptance letter or finance receipt generation, submitting the same POST request twice within the idempotency window shall return the same `task_id` in both responses, and shall not enqueue a second Celery task.

**Validates: Requirements 4.10, 5.10**

## Error Handling

### Backend Error Responses

All error responses follow the existing envelope format:

```json
{
  "success": false,
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| Endpoint | Condition | Status | Code |
|----------|-----------|--------|------|
| verify-document | Application not found | 404 | `NOT_FOUND` |
| verify-document | Document not found for application | 404 | `NOT_FOUND` |
| verify-document | Non-admin user | 403 | `INSUFFICIENT_PERMISSIONS` |
| verify-document | Invalid request body | 400 | `VALIDATION_ERROR` |
| acceptance-letter | Application not found | 404 | `NOT_FOUND` |
| acceptance-letter | Application not approved | 400 | `INVALID_STATUS` |
| acceptance-letter | Non-admin user | 403 | `INSUFFICIENT_PERMISSIONS` |
| finance-receipt | Application not found | 404 | `NOT_FOUND` |
| finance-receipt | No verified payment | 400 | `PAYMENT_REQUIRED` |
| finance-receipt | Non-admin user | 403 | `INSUFFICIENT_PERMISSIONS` |

### Celery Task Error Handling

Both generation tasks follow the existing `extract_document_text_task` pattern:
- `max_retries=3` with exponential backoff (60s, 120s, 240s)
- On permanent failure, log the error but do not create a broken ApplicationDocument record
- Task failures do not affect the original 202 response (already returned to the client)

### Frontend Error Handling

The updated `applicationService` methods rely on `apiClient.request()` which already handles:
- Response envelope unwrapping
- 401 → automatic token refresh
- Error parsing with field-level details
- Network errors with retryable detection

No additional frontend error handling is needed beyond what `apiClient` provides.

### Frontend 202 Response Handling (Scope Boundary)

The `generateAcceptanceLetter` and `generateFinanceReceipt` methods return the task metadata (`{task_id, application_id, status}`) to the caller. This spec does not include UI for surfacing "generation in progress" state or discovering the completed document — that is a follow-up concern. The admin can refresh the application documents list to see the generated document once the Celery task completes, or a future SSE event (`document_processed`) can notify the UI automatically.

## Testing Strategy

### Dual Testing Approach

This feature uses both unit tests and property-based tests:

- **Unit tests** verify specific examples, edge cases, error conditions, and integration points
- **Property tests** verify universal properties across randomly generated inputs

### Frontend Tests

**Library:** Vitest + fast-check

**Property tests** (`apps/admissions/tests/property/`):

| Property | Test File | Min Iterations |
|----------|-----------|----------------|
| P1: No dead code imports | `services.property.test.ts` (extend existing) | 100 |
| P4: URL construction | `services.property.test.ts` (extend existing) | 100 |

Each property test must include a comment tag:
```
// Feature: post-migration-cleanup, Property {number}: {property_text}
```

**Unit tests** (`apps/admissions/tests/unit/`):
- Verify `adminApi.ts` no longer exports `HtmlResponseError`, `parseJsonResponse`, `isHtmlResponse`
- Verify `tsconfig.json` exclude list contains only non-test entries

### Backend Tests

**Library:** pytest + hypothesis

**Property tests** (`backend/tests/property/`):

| Property | Test File | Min Iterations |
|----------|-----------|----------------|
| P2: Verify-document updates status | `test_application_endpoints.py` | 100 |
| P3: Admin permission enforcement | `test_application_endpoints.py` | 100 |
| P5: Audit log creation | `test_application_endpoints.py` | 100 |
| P6: Acceptance letter 202 response | `test_application_endpoints.py` | 100 |
| P7: Finance receipt 202 response | `test_application_endpoints.py` | 100 |
| P8: Celery task creates ApplicationDocument | `test_application_tasks.py` | 100 |
| P9: Acceptance letter rejects non-approved | `test_application_endpoints.py` | 100 |
| P10: Finance receipt rejects no payment | `test_application_endpoints.py` | 100 |
| P11: Idempotent generation | `test_application_endpoints.py` | 100 |

Each property test must include a comment tag:
```python
# Feature: post-migration-cleanup, Property {number}: {property_text}
```

**Unit tests** (`backend/tests/unit/`):
- Endpoint-level tests for each of the three new views covering success, 404, 400, 403 cases
- Verify audit log entries are created with correct fields
- Verify idempotency key storage and retrieval
- Verify Celery task creates ApplicationDocument with correct fields

### Property-Based Testing Configuration

- **Frontend:** fast-check with `fc.configureGlobal({ numRuns: 100 })` or per-test `{ numRuns: 100 }`
- **Backend:** hypothesis with `@settings(max_examples=100)` or `@given()` with default settings (100+ examples)
- Each correctness property is implemented by a single property-based test
- Property tests must not be implemented from scratch — use the fast-check and hypothesis libraries
