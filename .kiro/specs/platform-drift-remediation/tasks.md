# Implementation Tasks — Platform Drift Remediation

## HIGH Priority

### Bug 1: Payment verification returns stale status

- [ ] 1.1 Fix `verify_payment()` to return fresh status after `_update_payment_status()`
  - [ ] 1.1.1 Add `payment.refresh_from_db()` after `self._update_payment_status(payment, new_status, data)` in `backend/apps/documents/payment_service.py`
  - [ ] 1.1.2 Verify the `PaymentVerificationResult` is built from the refreshed `payment` object
- [ ] 1.2 Write property test: verify_payment returns DB-consistent status (Bug 1 fix checking)
  - [ ] 1.2.1 Create `backend/tests/property/test_drift_bug1_fix.py` with Hypothesis test: for all valid Lenco status mappings on pending payments, `verify_payment()` returns the new status
  - [ ] 1.2.2 Mock Lenco API to return generated statuses from `_LENCO_STATUS_MAP` keys
- [ ] 1.3 Write property test: terminal payments are not re-verified (Bug 1 preservation)
  - [ ] 1.3.1 Create `backend/tests/property/test_drift_bug1_preservation.py` with Hypothesis test: for all payments in terminal states, `verify_payment()` returns current status without HTTP call

### Bug 2: Admin Settings frontend/backend drift

- [ ] 2.1 Fix frontend `adminApi.updateSetting()` to use PATCH instead of PUT
  - [ ] 2.1.1 Change `method: 'PUT'` to `method: 'PATCH'` in `apps/admissions/src/lib/api/adminApi.ts` `updateSetting()` function
- [ ] 2.2 Implement `POST /admin/settings/import/` backend endpoint
  - [ ] 2.2.1 Create `AdminSettingsImportView` in `backend/apps/accounts/admin_views.py` — accepts `{settings: [...]}`, upserts each setting, returns `{imported: [...], errors: [...]}`
  - [ ] 2.2.2 Register the view at `settings/import/` in `backend/apps/accounts/admin_urls.py`
- [ ] 2.3 Implement `POST /admin/settings/reset/` backend endpoint
  - [ ] 2.3.1 Create `AdminSettingsResetView` in `backend/apps/accounts/admin_views.py` — restores default settings, returns confirmation
  - [ ] 2.3.2 Register the view at `settings/reset/` in `backend/apps/accounts/admin_urls.py`
- [ ] 2.4 Write frontend property test: admin settings uses PATCH (Bug 2 fix checking)
  - [ ] 2.4.1 Create `apps/admissions/tests/property/test_drift_bug2_fix.test.ts` with fast-check test: for all valid setting payloads, `updateSetting()` sends PATCH
- [ ] 2.5 Write backend integration test: import and reset endpoints (Bug 2 fix checking)
  - [ ] 2.5.1 Create `backend/tests/unit/test_drift_bug2_endpoints.py` with pytest tests for import and reset endpoints
- [ ] 2.6 Write backend preservation test: existing GET/PATCH/DELETE unchanged (Bug 2 preservation)
  - [ ] 2.6.1 Create `backend/tests/property/test_drift_bug2_preservation.py` with Hypothesis test: for all valid settings, GET/PATCH/DELETE behave identically to before

### Bug 3: Document/storage endpoints not backed by Django

- [ ] 3.1 Implement `GET /documents/{id}/signed-url/` endpoint
  - [ ] 3.1.1 Create `DocumentSignedUrlView` in `backend/apps/documents/views.py` — generates time-limited signed URL from R2 via django-storages
  - [ ] 3.1.2 Register at `<uuid:document_id>/signed-url/` in `document_urlpatterns`
- [ ] 3.2 Implement `GET /documents/{id}/download/` endpoint
  - [ ] 3.2.1 Create `DocumentDownloadView` in `backend/apps/documents/views.py` — redirects to signed URL
  - [ ] 3.2.2 Register at `<uuid:document_id>/download/` in `document_urlpatterns`
- [ ] 3.3 Implement `GET /documents/{id}/info/` endpoint
  - [ ] 3.3.1 Create `DocumentInfoView` in `backend/apps/documents/views.py` — returns document metadata
  - [ ] 3.3.2 Register at `<uuid:document_id>/info/` in `document_urlpatterns`
- [ ] 3.4 Implement `DELETE /documents/{id}/` endpoint
  - [ ] 3.4.1 Create `DocumentDeleteView` in `backend/apps/documents/views.py` — soft-deletes document record
  - [ ] 3.4.2 Register at `<uuid:document_id>/` (DELETE method) in `document_urlpatterns`
- [ ] 3.5 Write backend integration tests for new document endpoints (Bug 3 fix checking)
  - [ ] 3.5.1 Create `backend/tests/unit/test_drift_bug3_endpoints.py` with pytest tests for signed-url, download, info, and delete
- [ ] 3.6 Write backend preservation test: upload and extract unchanged (Bug 3 preservation)
  - [ ] 3.6.1 Create `backend/tests/property/test_drift_bug3_preservation.py` with Hypothesis test: for all valid documents, upload and extract endpoints behave identically

## MEDIUM Priority

### Bug 4: Application filters drift

- [ ] 4.1 Add camelCase filter aliases to `ApplicationFilter`
  - [ ] 4.1.1 Add `sortBy` and `sortOrder` CharFilter fields with custom `filter_sort_by` method in `backend/apps/applications/filters.py`
  - [ ] 4.1.2 Add `excludeStatus` CharFilter with `filter_exclude_status` method
  - [ ] 4.1.3 Add `startDate` and `endDate` DateFilter fields on `created_at`
  - [ ] 4.1.4 Add `paymentStatus` as alias for `payment_status`
- [ ] 4.2 Write property test: camelCase filter params produce correct querysets (Bug 4 fix checking)
  - [ ] 4.2.1 Create `backend/tests/property/test_drift_bug4_fix.py` with Hypothesis test: for all generated filter combinations, camelCase params produce correctly filtered/sorted querysets
- [ ] 4.3 Write property test: existing snake_case filters unchanged (Bug 4 preservation)
  - [ ] 4.3.1 Create `backend/tests/property/test_drift_bug4_preservation.py` with Hypothesis test: for all existing filter params, behavior is identical

### Bug 5: Draft logic split

- [ ] 5.1 Add `draft_name` field to `ApplicationCreateSerializer`
  - [ ] 5.1.1 Add `draft_name = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")` to `ApplicationCreateSerializer` in `backend/apps/applications/serializers.py`
  - [ ] 5.1.2 Ensure `draft_name` is included in the `create()` method's field mapping
- [ ] 5.2 Write property test: draft_name accepted and persisted (Bug 5 fix checking)
  - [ ] 5.2.1 Create `backend/tests/property/test_drift_bug5_fix.py` with Hypothesis test: for all valid draft names, serializer accepts and validates them
- [ ] 5.3 Write property test: payloads without draft_name unchanged (Bug 5 preservation)
  - [ ] 5.3.1 Create `backend/tests/property/test_drift_bug5_preservation.py` with Hypothesis test: for all valid payloads without draft_name, serializer behavior is identical

### Bug 6: DB migration ownership drifting

- [ ] 6.1 Update `EXPECTED_TABLES` in `verify_schema_static.py`
  - [ ] 6.1.1 Add `program_fees`, `webhook_event_logs`, `error_logs`, `sse_events` to `EXPECTED_TABLES` list
  - [ ] 6.1.2 Add corresponding FK relationships to `EXPECTED_FK_RELATIONSHIPS` if applicable
- [ ] 6.2 Update `apply-migrations.ts` to scan `backend/scripts/` for SQL files
  - [ ] 6.2.1 Modify the migration file discovery in `apply-migrations.ts` to also scan `../scripts/` for `*.sql` files
- [ ] 6.3 Write test: all managed=False tables in EXPECTED_TABLES (Bug 6 fix checking)
  - [ ] 6.3.1 Create `backend/tests/property/test_drift_bug6_fix.py` with pytest parametrize: for all Django models with managed=False, their db_table is in EXPECTED_TABLES

### Bug 7: Type drift in shared frontend DB types

- [ ] 7.1 Fix `ApplicationGrade.grade` type from `string` to `number`
  - [ ] 7.1.1 Change `grade: string` to `grade: number` in `apps/admissions/src/types/database.ts`
- [ ] 7.2 Align `ApplicationDocument` fields with backend model
  - [ ] 7.2.1 Add `document_name`, `verification_status`, `uploaded_at`, `system_generated` fields to `ApplicationDocument` in `apps/admissions/src/types/database.ts`
  - [ ] 7.2.2 Mark `file_path`, `file_name` with `/** @deprecated Use document_name instead */` JSDoc comments
- [ ] 7.3 Write frontend contract test: types match backend serializer output (Bug 7 fix checking)
  - [ ] 7.3.1 Create `apps/admissions/tests/property/test_drift_bug7_types.test.ts` with fast-check test: for all generated grade values (1-9), they are assignable to `number` type

## LOW Priority

### Bug 8: Legacy duplicate frontend surfaces

- [ ] 8.1 Remove duplicate `NotificationService` class
  - [ ] 8.1.1 Merge unique template methods from `NotificationService` class into `notificationService` object in `apps/admissions/src/services/notifications.ts`
  - [ ] 8.1.2 Remove the `NotificationService` class export
  - [ ] 8.1.3 Update any imports that reference `NotificationService` to use `notificationService`
- [ ] 8.2 Fix bulk status URL
  - [ ] 8.2.1 Change `/applications/bulk` to `/applications/bulk-status/` in `apps/admissions/src/data/applications.ts`
- [ ] 8.3 Remove legacy `ApplicationsTable` component
  - [ ] 8.3.1 Delete `apps/admissions/src/components/admin/ApplicationsTable.tsx` (the legacy duplicate)
  - [ ] 8.3.2 Verify no imports reference the deleted file
- [ ] 8.4 Write frontend tests: legacy cleanup verified (Bug 8 fix checking)
  - [ ] 8.4.1 Create `apps/admissions/tests/unit/test_drift_bug8_cleanup.test.ts` with Vitest tests: single notification export, correct bulk URL, no legacy component file

## Final Checkpoint

- [ ] 9. Final validation — all 8 bugs remediated
  - Run all backend property tests: `cd backend && python3 -m pytest tests/property/test_drift_*.py -v`
  - Run all backend unit tests: `cd backend && python3 -m pytest tests/unit/test_drift_*.py -v`
  - Run all frontend tests: `cd apps/admissions && bun run test`
  - Run existing backend test suite: `cd backend && python3 -m pytest --timeout=30 -x -q`
  - Verify OpenAPI schema generation: `cd backend && python3 manage.py spectacular --file /tmp/schema.yaml`
  - Confirm no regressions across the platform
