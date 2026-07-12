# Design Document — Platform Drift Remediation

## Technical Context

### Affected Components

| Bug | Backend Files | Frontend Files |
|-----|--------------|----------------|
| 1 (HIGH) | `backend/apps/documents/payment_service.py` | — |
| 2 (HIGH) | `backend/apps/accounts/admin_views.py`, `backend/apps/accounts/admin_urls.py` | `apps/admissions/src/lib/api/adminApi.ts` |
| 3 (HIGH) | `backend/apps/documents/urls.py`, new views | `apps/admissions/src/services/documents.ts` |
| 4 (MEDIUM) | `backend/apps/applications/filters.py` | `apps/admissions/src/hooks/admin/useApplicationsData.ts` |
| 5 (MEDIUM) | `backend/apps/applications/serializers.py` | `apps/admissions/src/pages/student/applicationWizard/hooks/useMultiDraft.ts` |
| 6 (MEDIUM) | `backend/scripts/verify_schema_static.py`, `backend/migrations/apply-migrations.ts` | — |
| 7 (MEDIUM) | — | `apps/admissions/src/types/database.ts` |
| 8 (LOW) | — | `apps/admissions/src/services/notifications.ts`, `apps/admissions/src/data/applications.ts`, `apps/admissions/src/components/admin/ApplicationsTable.tsx` |

### Architecture Overview

The MIHAS platform is a monorepo with Django 5 + DRF backend and React 18 + TypeScript frontends. Frontend calls `/api/v1/...` directly with no translation layer. Models use `managed=False` with SQL migrations in `backend/scripts/` and `backend/migrations/`. Payment is via Lenco gateway with webhook + polling verification.

## Bug Conditions

### Bug 1: Payment Stale Status

```pascal
FUNCTION isBugCondition_Bug1(X)
  INPUT: X of type PaymentVerifyInput (payment_id where payment.status = 'pending' and Lenco returns a new status)
  OUTPUT: boolean
  
  RETURN X.payment.status = 'pending' AND lenco_api_returns_new_status(X)
END FUNCTION

// Property: Fix Checking — verify_payment returns fresh status
FOR ALL X WHERE isBugCondition_Bug1(X) DO
  result ← verify_payment'(X.payment_id)
  ASSERT result.status = new_status_from_lenco(X)
END FOR

// Property: Preservation — terminal payments unchanged
FOR ALL X WHERE NOT isBugCondition_Bug1(X) DO
  ASSERT verify_payment(X.payment_id) = verify_payment'(X.payment_id)
END FOR
```

### Bug 2: Admin Settings Drift

```pascal
FUNCTION isBugCondition_Bug2(X)
  INPUT: X of type AdminSettingsRequest
  OUTPUT: boolean
  
  RETURN X.method = 'PUT' AND X.path matches '/admin/settings/{id}/'
      OR X.path matches '/admin/settings/import/'
      OR X.path matches '/admin/settings/reset/'
END FUNCTION

// Property: Fix Checking — frontend uses PATCH, import/reset exist
FOR ALL X WHERE isBugCondition_Bug2(X) DO
  result ← send_request'(X)
  ASSERT result.status_code != 404 AND result.status_code != 405
END FOR

// Property: Preservation — existing GET/DELETE unchanged
FOR ALL X WHERE NOT isBugCondition_Bug2(X) DO
  ASSERT send_request(X) = send_request'(X)
END FOR
```

### Bug 3: Document Endpoints Missing

```pascal
FUNCTION isBugCondition_Bug3(X)
  INPUT: X of type DocumentRequest
  OUTPUT: boolean
  
  RETURN X.path matches '/documents/{id}/signed-url/'
      OR X.path matches '/documents/{id}/download/'
      OR X.path matches '/documents/{id}/info/'
      OR (X.method = 'DELETE' AND X.path matches '/documents/{id}/')
END FUNCTION

// Property: Fix Checking — document endpoints return non-404
FOR ALL X WHERE isBugCondition_Bug3(X) DO
  result ← send_request'(X)
  ASSERT result.status_code != 404
END FOR

// Property: Preservation — upload and extract unchanged
FOR ALL X WHERE NOT isBugCondition_Bug3(X) DO
  ASSERT send_request(X) = send_request'(X)
END FOR
```

### Bug 4: Application Filters Drift

```pascal
FUNCTION isBugCondition_Bug4(X)
  INPUT: X of type FilterParams
  OUTPUT: boolean
  
  RETURN 'sortBy' IN X.params
      OR 'sortOrder' IN X.params
      OR 'excludeStatus' IN X.params
      OR 'startDate' IN X.params
      OR 'endDate' IN X.params
      OR 'paymentStatus' IN X.params
END FUNCTION

// Property: Fix Checking — camelCase params produce correct querysets
FOR ALL X WHERE isBugCondition_Bug4(X) DO
  result ← ApplicationFilter'(X.params).qs
  ASSERT result is correctly filtered/sorted per X.params
END FOR

// Property: Preservation — existing snake_case params unchanged
FOR ALL X WHERE NOT isBugCondition_Bug4(X) DO
  ASSERT ApplicationFilter(X.params).qs = ApplicationFilter'(X.params).qs
END FOR
```

### Bug 5: Draft Name Dropped

```pascal
FUNCTION isBugCondition_Bug5(X)
  INPUT: X of type ApplicationCreatePayload
  OUTPUT: boolean
  
  RETURN 'draft_name' IN X.fields AND X.fields['draft_name'] is not empty
END FUNCTION

// Property: Fix Checking — draft_name persisted
FOR ALL X WHERE isBugCondition_Bug5(X) DO
  result ← ApplicationCreateSerializer'(X).validated_data
  ASSERT 'draft_name' IN result AND result['draft_name'] = X.fields['draft_name']
END FOR

// Property: Preservation — payloads without draft_name unchanged
FOR ALL X WHERE NOT isBugCondition_Bug5(X) DO
  ASSERT ApplicationCreateSerializer(X).is_valid() = ApplicationCreateSerializer'(X).is_valid()
END FOR
```

### Bug 6: Schema Verification Drift

```pascal
FUNCTION isBugCondition_Bug6(X)
  INPUT: X of type TableName
  OUTPUT: boolean
  
  RETURN X IN {'program_fees', 'webhook_event_logs', 'error_logs', 'sse_events'}
END FUNCTION

// Property: Fix Checking — all model tables in EXPECTED_TABLES
FOR ALL X WHERE isBugCondition_Bug6(X) DO
  ASSERT X IN EXPECTED_TABLES'
END FOR

// Property: Preservation — original 26 tables still verified
FOR ALL X WHERE NOT isBugCondition_Bug6(X) DO
  ASSERT verification_result(X) = verification_result'(X)
END FOR
```

### Bug 7: Type Drift

```pascal
FUNCTION isBugCondition_Bug7(X)
  INPUT: X of type FieldAccess
  OUTPUT: boolean
  
  RETURN (X.type = 'ApplicationGrade' AND X.field = 'grade')
      OR (X.type = 'ApplicationDocument' AND X.field IN {'file_path', 'file_name', 'status'})
END FUNCTION

// Property: Fix Checking — types match backend
FOR ALL X WHERE isBugCondition_Bug7(X) DO
  ASSERT frontend_type'(X.type, X.field) matches backend_model_type(X.type, X.field)
END FOR

// Property: Preservation — unchanged types stay the same
FOR ALL X WHERE NOT isBugCondition_Bug7(X) DO
  ASSERT frontend_type(X.type, X.field) = frontend_type'(X.type, X.field)
END FOR
```

### Bug 8: Legacy Duplicates

```pascal
FUNCTION isBugCondition_Bug8(X)
  INPUT: X of type CodeArtifact
  OUTPUT: boolean
  
  RETURN X = 'NotificationService class export'
      OR X = '/applications/bulk endpoint URL'
      OR X = 'legacy ApplicationsTable component'
END FUNCTION

// No formal property — these are code cleanup tasks verified by:
// 1. grep confirming single export
// 2. URL string matching bulk-status
// 3. file deletion of legacy component
```

## Implementation Plan

### Bug 1 Fix: Refresh payment status after DB write

In `PaymentService.verify_payment()`, after calling `self._update_payment_status(payment, new_status, data)`, refresh the in-memory object:

```python
if new_status:
    self._update_payment_status(payment, new_status, data)
    payment.refresh_from_db()
```

Alternatively, build the result using `new_status` directly instead of `payment.status`. The `refresh_from_db()` approach is safer because it also picks up any side effects from `_update_payment_status`.

### Bug 2 Fix: Align admin settings endpoints

1. **Frontend**: Change `adminApi.updateSetting()` from `PUT` to `PATCH`
2. **Backend**: Add `AdminSettingsImportView` handling `POST /admin/settings/import/` — accepts `{settings: [...]}`, upserts each, returns results
3. **Backend**: Add `AdminSettingsResetView` handling `POST /admin/settings/reset/` — restores default settings from a seed configuration
4. **Backend**: Register both new views in `admin_urls.py`

### Bug 3 Fix: Implement missing document endpoints

1. **Backend**: Add `DocumentSignedUrlView` — generates a time-limited signed URL from R2 via `django-storages`
2. **Backend**: Add `DocumentDownloadView` — redirects to signed URL or streams content
3. **Backend**: Add `DocumentInfoView` — returns document metadata from `ApplicationDocument` model
4. **Backend**: Add `DocumentDeleteView` — soft-deletes or removes the document record
5. **Backend**: Register all four views in `document_urlpatterns` with `<uuid:document_id>/` prefix

### Bug 4 Fix: Add camelCase filter aliases

1. **Backend**: Add `sortBy` and `sortOrder` as separate `CharFilter` fields in `ApplicationFilter` with a custom method that combines them into the existing sort logic
2. **Backend**: Add `excludeStatus` filter that excludes applications with the given status
3. **Backend**: Add `startDate` and `endDate` filters on `created_at`
4. **Backend**: Add `paymentStatus` as an alias for `payment_status`

### Bug 5 Fix: Accept draft_name in serializer

1. **Backend**: Add `draft_name = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")` to `ApplicationCreateSerializer`
2. **Frontend**: Document that `useMultiDraft` uses applications with `status=draft` as the canonical draft system
3. **Future**: Consider deprecating the `application_drafts` table or adding a migration to unify (out of scope for this fix — the immediate fix is accepting `draft_name`)

### Bug 6 Fix: Update schema verification and migration paths

1. **Backend**: Add `program_fees`, `webhook_event_logs`, `error_logs`, and `sse_events` to `EXPECTED_TABLES` in `verify_schema_static.py`
2. **Backend**: Add corresponding FK relationships to `EXPECTED_FK_RELATIONSHIPS`
3. **Backend**: Update `apply-migrations.ts` to also scan `../scripts/` for SQL files, or move all SQL migrations into `backend/migrations/` and update references

### Bug 7 Fix: Align frontend types with backend models

1. **Frontend**: Change `ApplicationGrade.grade` from `string` to `number`
2. **Frontend**: Add `document_name`, `verification_status`, `uploaded_at`, `system_generated` to `ApplicationDocument`
3. **Frontend**: Mark `file_path`, `file_name` as `@deprecated` aliases
4. **Frontend**: Add `points` removal or keep as optional (it exists in frontend but not backend — keep for now as computed field)

### Bug 8 Fix: Remove legacy duplicates

1. **Frontend**: Remove `NotificationService` class from `notifications.ts`, merge unique template methods into `notificationService` object
2. **Frontend**: Fix bulk status URL from `/applications/bulk` to `/applications/bulk-status/`
3. **Frontend**: Delete `src/components/admin/ApplicationsTable.tsx` (the legacy duplicate)
4. **Frontend**: Update any imports that referenced the deleted component

## Correctness Properties

### Property 1 (Bug 1): Payment verification returns DB-consistent status

```
FOR ALL payment P WHERE P.status = 'pending' AND Lenco returns status S mapped to new_status NS:
  result = verify_payment'(P.id)
  ASSERT result.status = NS
  ASSERT Payment.objects.get(id=P.id).status = NS
```

Test: Hypothesis property test with mocked Lenco API returning arbitrary valid statuses.

### Property 2 (Bug 1): Terminal payments are not re-verified

```
FOR ALL payment P WHERE P.status IN {'successful', 'failed'}:
  result = verify_payment'(P.id)
  ASSERT result.status = P.status
  ASSERT no HTTP call to Lenco API
```

Test: Hypothesis property test with payments in terminal states.

### Property 3 (Bug 2): Frontend admin settings uses correct HTTP methods

```
FOR ALL setting updates U:
  request = adminApi.updateSetting'(U)
  ASSERT request.method = 'PATCH'
```

Test: fast-check property test mocking apiClient and asserting method.

### Property 4 (Bug 4): camelCase filter params produce correct querysets

```
FOR ALL filter params F containing sortBy, sortOrder, excludeStatus, startDate, endDate, paymentStatus:
  qs = ApplicationFilter'(F).qs
  ASSERT qs is ordered/filtered correctly per F
```

Test: Hypothesis property test with generated filter parameter combinations.

### Property 5 (Bug 4): Existing snake_case filters unchanged

```
FOR ALL filter params F containing only status, payment_status, program, intake, institution, search, sort:
  ASSERT ApplicationFilter(F).qs.query = ApplicationFilter'(F).qs.query
```

Test: Hypothesis property test with existing filter parameters.

### Property 6 (Bug 5): draft_name accepted and persisted

```
FOR ALL draft_name DN WHERE len(DN) > 0 AND len(DN) <= 255:
  serializer = ApplicationCreateSerializer'(data={...valid_fields, draft_name: DN})
  ASSERT serializer.is_valid()
  ASSERT serializer.validated_data['draft_name'] = DN
```

Test: Hypothesis property test with generated draft names.

### Property 7 (Bug 5): Payloads without draft_name unchanged

```
FOR ALL valid application payloads P WHERE 'draft_name' NOT IN P:
  ASSERT ApplicationCreateSerializer(P).is_valid() = ApplicationCreateSerializer'(P).is_valid()
  ASSERT ApplicationCreateSerializer(P).validated_data = ApplicationCreateSerializer'(P).validated_data
```

Test: Hypothesis property test with valid payloads excluding draft_name.

### Property 8 (Bug 6): All managed=False tables in EXPECTED_TABLES

```
FOR ALL Django models M WHERE M._meta.managed = False:
  ASSERT M._meta.db_table IN EXPECTED_TABLES'
```

Test: Hypothesis/pytest parametrize over all Django models.

### Property 9 (Bug 7): Frontend grade type matches backend

```
FOR ALL grade values G WHERE 1 <= G <= 9:
  ASSERT typeof ApplicationGrade'.grade = number
  ASSERT G can be assigned to ApplicationGrade'.grade without type error
```

Test: fast-check property test with generated grade values, plus TypeScript compilation check.

### Property 10 (Bug 7): Frontend ApplicationDocument fields match backend

```
FOR ALL ApplicationDocument instances D from backend:
  ASSERT D.document_name is accessible as ApplicationDocument'.document_name
  ASSERT D.verification_status is accessible as ApplicationDocument'.verification_status
```

Test: fast-check contract test comparing frontend type keys with backend serializer output.

## Testing Strategy

| Bug | Backend Test | Frontend Test | E2E Test |
|-----|-------------|---------------|----------|
| 1 | Hypothesis: verify_payment status freshness + preservation | — | Stagehand: payment flow smoke |
| 2 | pytest: import/reset endpoint integration | fast-check: PATCH method property | Stagehand: admin settings smoke |
| 3 | pytest: signed-url/download/info/delete integration | — | — |
| 4 | Hypothesis: filter alias property + preservation | — | — |
| 5 | Hypothesis: draft_name acceptance + preservation | — | — |
| 6 | pytest: EXPECTED_TABLES completeness | — | — |
| 7 | — | fast-check: grade type + document field contract | — |
| 8 | — | Vitest: URL string + export uniqueness | — |
