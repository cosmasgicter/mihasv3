# Implementation Plan: Frontend-Django Alignment

## Overview

Systematic page-by-page alignment of the admissions frontend with the Django REST API. Implementation follows the priority order from the design: error visibility first, then auth, then dashboards, then individual pages, then polish. All changes are within `apps/admissions/`.

## Tasks

- [x] 1. Error visibility and logging infrastructure
  - [x] 1.1 Create `logApiError` utility in `apps/admissions/src/lib/apiErrorLogger.ts`
    - Implement the `logApiError(context, endpoint, error)` function per design section 3
    - Must extract `status` from error objects, `message` from Error instances, and handle unknown types
    - Must call `console.error` with context, endpoint, status, message, and original error
    - Must never throw regardless of input shape
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 1.2 Write property test for `logApiError` (Property 10)
    - **Property 10: Error logging includes all diagnostic fields**
    - Test with Error instances, plain strings, objects with/without status, null, undefined
    - Place in `apps/admissions/tests/property/frontend-django-alignment/error-logging.property.test.ts`
    - **Validates: Requirements 9.1**

- [x] 2. Auth flow and role resolution alignment
  - [x] 2.1 Reconcile `ADMIN_ROLES` in `apps/admissions/src/lib/auth/roles.ts`
    - Remove 4 phantom roles (`admissions_officer`, `registrar`, `finance_officer`, `academic_head`) from `ADMIN_ROLES`
    - Keep only `['admin', 'super_admin']` with a comment documenting the removed roles as future placeholders
    - Trim `REPORT_MANAGER_ROLES` to `['admin', 'super_admin']` with similar comment
    - _Requirements: 1.3_

  - [x] 2.2 Refactor duplicate `ADMIN_ROLES` in `UserRowCard.tsx` and `Users.tsx`
    - Replace local `const ADMIN_ROLES = new Set(['admin', 'super_admin'])` in `apps/admissions/src/components/admin/UserRowCard.tsx` with import from `lib/auth/roles.ts`
    - Replace local `const ADMIN_ROLES = new Set(['admin', 'super_admin'])` in `apps/admissions/src/pages/admin/Users.tsx` with import from `lib/auth/roles.ts`
    - Create a helper (e.g. `isAdminRoleSet` or use `isAdminRole` directly) so the Set-based `.has()` calls work with the canonical list
    - _Requirements: 1.3_

  - [x] 2.3 Add `console.warn` to `extractAuthUser` in `apps/admissions/src/hooks/auth/useSessionListener.ts`
    - When `normalizeAuthUser` returns `null` for a non-null input, log a warning with the response shape keys
    - Per design section 2: `console.warn('[auth] Unexpected auth response shape — could not extract user:', ...)`
    - _Requirements: 1.8_

  - [x] 2.4 Verify CSRF token capture from Django response headers
    - Confirm `apiClient` captures `X-CSRF-Token` from login response headers and stores it via `setCsrfToken`
    - Confirm `apiClient` captures `X-CSRF-Token` from session GET response headers
    - Confirm `apiClient` captures rotated `X-CSRF-Token` from refresh POST response headers
    - If any capture path is missing, add it
    - _Requirements: 1.10, 1.11_

  - [x] 2.5 Write property tests for auth extraction (Properties 1, 2, 3)
    - **Property 1: Auth user extraction handles both response shapes**
    - **Property 2: Admin role classification is consistent with backend ROLE_CHOICES**
    - **Property 3: Malformed auth responses produce null user**
    - Place in `apps/admissions/tests/property/frontend-django-alignment/auth-extraction.property.test.ts`
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.8**

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Student dashboard error handling
  - [x] 4.1 Refactor student dashboard to per-section error handling
    - In `apps/admissions/src/pages/student/Dashboard.tsx`, replace the single catch block with per-section try/catch for applications, intakes, and interviews
    - Each catch block must call `logApiError` with the section context and endpoint
    - Each section should have its own error state so partial failures show per-section errors with endpoint name and retry button
    - Display empty state UI when an endpoint returns an empty array (not an error)
    - _Requirements: 2.2, 2.3, 2.4, 2.6, 4.10, 9.1, 9.3_

  - [x] 4.2 Write property test for paginated applications normalization (Property 4)
    - **Property 4: Paginated applications normalization**
    - Test with `{results: [...]}`, `{applications: [...]}`, and raw array shapes
    - Place in `apps/admissions/tests/property/frontend-django-alignment/service-normalization.property.test.ts`
    - **Validates: Requirements 2.5, 4.4, 8.1**

- [x] 5. Admin dashboard shape validation
  - [x] 5.1 Add shape mismatch warning to admin dashboard normalizer
    - In `apps/admissions/src/services/admin/dashboard.ts`, add a `console.warn` when the response lacks expected top-level keys (`applications`, `users`, `recent_activity`)
    - Use `logApiError` for any errors in the admin dashboard service calls
    - _Requirements: 3.2, 3.3, 3.4, 9.1_

  - [x] 5.2 Write property test for admin dashboard normalization (Property 5)
    - **Property 5: Admin dashboard normalization with fallback**
    - Test with valid responses, empty objects, missing keys, wrong value types
    - Assert all numeric fields are finite and `systemHealth` is a valid enum value
    - Place in `apps/admissions/tests/property/frontend-django-alignment/service-normalization.property.test.ts`
    - **Validates: Requirements 3.1, 3.4**

- [x] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Service layer response shape alignment
  - [x] 7.1 Add `logApiError` and null resilience to `applications.ts`
    - In `apps/admissions/src/services/applications.ts`, replace `.catch(() => null)` on interview fetch (line ~143) with `logApiError` call
    - Ensure `normalizePaginatedApplications` handles null/undefined input with safe defaults
    - _Requirements: 4.1, 4.4, 4.7, 9.2_

  - [x] 7.2 Add `logApiError` and null resilience to `catalog.ts`
    - In `apps/admissions/src/services/catalog.ts`, ensure all normalizers handle null/undefined input
    - Add shape validation warnings when required fields are missing
    - _Requirements: 4.2, 4.3, 4.8, 4.9_

  - [x] 7.3 Add concurrency limiter and `logApiError` to `interviews.ts`
    - In `apps/admissions/src/services/interviews.ts`, replace `.catch(() => [])` (line ~89) with `logApiError` call
    - Replace `Promise.all` with `Promise.allSettled` and a semaphore pattern (max 5 concurrent requests)
    - Log individual failures via `logApiError` instead of silently catching
    - _Requirements: 4.6, 9.1_

  - [x] 7.4 Add `logApiError` to `documents.ts`
    - In `apps/admissions/src/services/documents.ts`, ensure error handling uses `logApiError`
    - Ensure null/undefined ApiClient returns produce safe defaults
    - _Requirements: 4.5, 4.7, 9.2_

  - [x] 7.5 Add `logApiError` to `notifications.ts`
    - In `apps/admissions/src/services/notifications.ts`, replace `catch { return false }` (line ~144) with `logApiError` + return false
    - _Requirements: 9.2_

  - [x] 7.6 Add `logApiError` to `offlineSync.ts`
    - In `apps/admissions/src/services/offlineSync.ts`, replace silent catch blocks with `logApiError` calls where appropriate
    - Keep the fail-safe behavior (don't re-throw) but ensure errors are logged
    - _Requirements: 9.2_

  - [x] 7.7 Write property tests for service normalizers (Properties 6, 7, 8, 9)
    - **Property 6: No double envelope unwrap**
    - **Property 7: Catalog field normalization**
    - **Property 8: Interview data normalization**
    - **Property 9: Service layer null/missing field resilience**
    - Place in `apps/admissions/tests/property/frontend-django-alignment/service-normalization.property.test.ts`
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.6, 4.7, 4.8, 4.9**

- [x] 8. Individual page alignment
  - [x] 8.1 Auth pages — audit and fix Django endpoint alignment
    - Audit sign-in, sign-up, password reset, and email verification pages against Django endpoints
    - Fix any payload shape mismatches (field names, structure) found during audit
    - Ensure field-level validation errors from Django (`fieldErrors`) are displayed next to form inputs
    - Ensure 409/duplicate-email errors show a clear message
    - Add `logApiError` calls to auth page error handlers
    - Deliverable: either "confirmed working, no changes" or list of fixes applied
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 9.1_

  - [x] 8.2 Application wizard — audit and fix Django endpoint alignment
    - Audit wizard program/intake loading against Django catalog endpoints
    - Fix any submission payload mismatches with `POST /api/v1/applications/` and `PATCH /api/v1/applications/{id}/`
    - Map Django validation errors to wizard steps with field-level display
    - Handle 404 for unavailable programs/intakes with user-facing message
    - Deliverable: either "confirmed working, no changes" or list of fixes applied
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 8.3 Payment page — audit and fix Django endpoint alignment
    - Audit payment status fetching from application model fields (`payment_status`, `payment_method`, `amount`, `paid_at`, `momo_ref`, `pop_url`)
    - Fix any mismatches with `POST /api/v1/payments/{id}/verify/` and `GET /api/v1/payments/{id}/receipt/`
    - Add specific error messages for payment failures (insufficient funds, gateway timeout)
    - Deliverable: either "confirmed working, no changes" or list of fixes applied
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 8.4 Admin application review — audit and fix Django endpoint alignment
    - Audit paginated application list fetching and mapping to frontend table format
    - Fix any mismatches in application detail fetching (documents, grades, status history, interviews)
    - Fix status change submissions (approve, reject, request info) to use correct Django endpoints and payloads
    - Handle 409 conflict with "modified by another user" message and reload option
    - Deliverable: either "confirmed working, no changes" or list of fixes applied
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 9. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Navigation and route guard polish
  - [x] 10.1 Verify nav sidebar reactivity to auth state changes
    - Confirm the navigation sidebar updates when user logs in, logs out, or session expires
    - If the sidebar doesn't react to auth state changes, wire it to `useAuth()` context
    - Deliverable: either "confirmed working, no changes" or fix applied
    - _Requirements: 10.1_

  - [x] 10.2 Add "Retry session" button to `AdminRoute` and `StudentRoute` timeout states
    - In `apps/admissions/src/components/AdminRoute.tsx`, replace the text-only timeout state with a "Retry session" button that calls `retrySessionCheck` (add `useAuthCheck` or equivalent)
    - In `apps/admissions/src/components/StudentRoute.tsx`, same change
    - Match the pattern already used in `ProtectedRoute`
    - _Requirements: 10.2, 10.3_

- [x] 11. SSE graceful degradation
  - [x] 11.1 Fix SSE fallback status in `apps/admissions/src/hooks/useRealtime.ts`
    - When falling back to polling after max retries, set `status: 'polling'` instead of `status: 'error'`
    - Clear the `error` string when polling starts successfully
    - Only set `error` state for truly unrecoverable failures
    - _Requirements: 11.2, 11.4_

- [x] 12. Verification test suite
  - [x] 12.1 Create student dashboard page verification test
    - Create `apps/admissions/tests/unit/page-verification/student-dashboard.test.tsx`
    - Mock ApiClient with actual Django response shapes for applications, intakes, interviews
    - Assert component renders without errors and displays data correctly
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 12.2 Create admin dashboard page verification test
    - Create `apps/admissions/tests/unit/page-verification/admin-dashboard.test.tsx`
    - Mock ApiClient with actual Django admin dashboard response shape
    - Assert component renders metrics, activity feed, and quick actions
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 12.3 Create application wizard step 1 verification test
    - Create `apps/admissions/tests/unit/page-verification/wizard-step1.test.tsx`
    - Mock ApiClient with Django catalog programs and intakes responses
    - Assert dropdowns populate correctly
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 12.4 Create payment page verification test
    - Create `apps/admissions/tests/unit/page-verification/payment-page.test.tsx`
    - Mock ApiClient with Django application response containing payment fields
    - Assert payment status displays correctly
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 12.5 Create sign-in page verification test
    - Create `apps/admissions/tests/unit/page-verification/signin-page.test.tsx`
    - Mock ApiClient with Django login response shape
    - Assert form submission and role-based redirect work correctly
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 13. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All test files go under `apps/admissions/tests/` following existing conventions
- Run tests via `cd apps/admissions && bun run test`
