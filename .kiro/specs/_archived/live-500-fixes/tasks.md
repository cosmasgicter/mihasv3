# Implementation Plan: live-500-fixes

## Overview

Fix the remaining HTTP 500 errors and frontend rendering failures on the live MIHAS platform. The fixes are small and targeted: backend model `auto_now_add` additions, frontend `normalizeRecentActivity()` null-timestamp tolerance, SSE log suppression, and verification of already-fixed endpoints.

## Tasks

- [x] 1. Backend model fixes — auto_now_add on created_at fields
  - [x] 1.1 Add `auto_now_add=True` to `AuditLog.created_at` in `backend/apps/common/models.py`
    - Change `created_at = models.DateTimeField(null=True, blank=True)` to `created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)`
    - No migration needed — model is `managed = False`
    - _Requirements: 4.1, 4.3, 6.2_

  - [x] 1.2 Add `auto_now_add=True` to `ApplicationStatusHistory.created_at` in `backend/apps/applications/models.py`
    - Change `created_at = models.DateTimeField(null=True, blank=True)` to `created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)`
    - No migration needed — model is `managed = False`
    - _Requirements: 4.1, 4.4, 3.2_

  - [x] 1.3 Fix `ApplicationStatusHistory.ip_address` max_length from 45 to 64 in `backend/apps/applications/models.py`
    - SHA-256 hex digests are 64 characters; current `max_length=45` would truncate
    - _Requirements: 5.2, 5.3_

  - [x]* 1.4 Write property test for timestamp auto-population (Property 3)
    - **Property 3: Timestamp auto-population on model creation**
    - Test that `AuditLog.objects.create()` and `ApplicationStatusHistory.objects.create()` produce non-null `created_at`
    - Place in `backend/tests/property/test_live_500_fixes.py`
    - **Validates: Requirements 3.2, 4.1, 4.3, 4.4, 6.2**

  - [x]* 1.5 Write property test for SHA-256 hash field length (Property 4)
    - **Property 4: SHA-256 hash values fit in model CharField max_length**
    - Test that `hashlib.sha256(input).hexdigest()` output (64 chars) fits in `AuditLog.ip_address` and `ApplicationStatusHistory.ip_address` max_length
    - Place in `backend/tests/property/test_live_500_fixes.py`
    - **Validates: Requirements 5.2, 5.3, 6.4**

- [x] 2. Checkpoint — Run backend tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Frontend normalizeRecentActivity() fix — tolerate null timestamps
  - [x] 3.1 Fix `normalizeRecentActivity()` in `apps/admissions/src/services/admin/dashboard.ts`
    - When `created_at` is present but null (not a string), fall back to `new Date().toISOString()` instead of empty string
    - The current code checks `typeof item.created_at === 'string'` which fails for null, causing `timestamp` to be `''`, which causes the item to be filtered out
    - Update the timestamp resolution chain to handle null values with a fallback
    - _Requirements: 2.3, 8.1, 8.7_

  - [x]* 3.2 Write property test for recent activity normalizer (Property 2)
    - **Property 2: Recent activity normalizer preserves items with null timestamps**
    - Test that entries with null `created_at` are not dropped, and receive a fallback timestamp
    - Use `fast-check` to generate arrays of audit log entries with mixed null/string/undefined `created_at`
    - Place in `apps/admissions/tests/property/dashboardNormalizer.property.test.ts`
    - **Validates: Requirements 2.3, 8.1**

  - [x]* 3.3 Write property test for dashboard stats normalizer (Property 1)
    - **Property 1: Dashboard normalizer maps backend response to valid stats**
    - Test that `normalizeStats()` produces valid `AdminDashboardStats` with all numeric fields finite and never NaN
    - Use `fast-check` to generate backend response shapes with null/missing/extra fields
    - Place in `apps/admissions/tests/property/dashboardNormalizer.property.test.ts`
    - **Validates: Requirements 8.1, 8.7**

- [x] 4. Frontend SSE error log suppression
  - [x] 4.1 Suppress repeated SSE error logs in `apps/admissions/src/lib/sseClient.ts`
    - In the `onerror` handler, only log on the first error and then use `console.debug` for subsequent reconnection attempts
    - In `scheduleReconnect()`, downgrade the reconnect scheduling log from `console.log` to `console.debug` after the first attempt
    - On successful reconnection (`onopen`), log recovery at `console.log` level
    - _Requirements: 1.3, 8.2_

- [x] 5. Checkpoint — Run frontend tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Verification of already-fixed endpoints
  - [x] 6.1 Write unit test verifying `ApplicationReviewView.post()` does not contain debug wrapper
    - Verify the review view code does not use `traceback.format_exc()` or catch generic `Exception` with traceback exposure
    - Place in `backend/tests/unit/test_live_500_fixes.py`
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 6.2 Write unit test verifying SSE stream endpoint returns correct content type
    - Test that `SSEStreamView.get()` returns `text/event-stream` content type
    - Place in `backend/tests/unit/test_live_500_fixes.py`
    - _Requirements: 1.1, 1.4_

  - [x] 6.3 Write unit test verifying admin dashboard endpoint returns expected response shape
    - Test that `AdminDashboardView` returns JSON with `applications`, `users`, and `recent_activity` keys
    - Place in `backend/tests/unit/test_live_500_fixes.py`
    - _Requirements: 2.1, 2.2_

  - [x]* 6.4 Write property test for AuditMiddleware error resilience (Property 5)
    - **Property 5: AuditMiddleware error resilience**
    - Test that when `_create_audit_entry()` raises, the original response passes through unmodified
    - Place in `backend/tests/property/test_live_500_fixes.py`
    - **Validates: Requirements 6.3**

  - [x]* 6.5 Write property test for no traceback strings in error responses (Property 7)
    - **Property 7: No traceback strings in error responses**
    - Test that DRF exception handler responses never contain `Traceback (most recent call last)` or `File "` patterns
    - Place in `backend/tests/property/test_live_500_fixes.py`
    - **Validates: Requirements 7.3, 9.6**

- [x] 7. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster delivery
- The dashboard stats mapping (`normalizeStats()`) is already correct — the real bug is in `normalizeRecentActivity()` dropping items with null timestamps
- No Django migrations are needed — all models use `managed = False`
- The debug wrapper removal and SSE sync conversion are already done in prior work; task 6 just adds verification tests
- Property tests use `hypothesis` (backend) and `fast-check` (frontend), both already in the project
