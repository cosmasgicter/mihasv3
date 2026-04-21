# Implementation Plan: Auth Architecture Simplification

## Overview

Simplify the MIHAS auth architecture by removing the redundant `JWTAuthenticationMiddleware`, enforcing an unambiguous 401/403 status contract, reclassifying views to explicit auth strategies, and reducing frontend auth complexity. Backend changes deploy first (safe — middleware removal + exception handler fix), then frontend changes follow.

## Tasks

- [x] 1. Backend: Remove JWTAuthenticationMiddleware and fix exception handler
  - [x] 1.1 Remove `JWTAuthenticationMiddleware` from MIDDLEWARE list in `backend/config/settings/base.py`
    - Delete the `"apps.common.middleware.JWTAuthenticationMiddleware"` entry (line 8 in MIDDLEWARE)
    - Update the middleware ordering comments to reflect the new numbering (CSRFEnforcementMiddleware becomes position 8, AuditMiddleware becomes 9, etc.)
    - Do NOT delete the `JWTAuthenticationMiddleware` class from `backend/apps/common/middleware.py` yet (keep for reference until all tests pass)
    - _Requirements: 1.1, 1.2, 4.1, 4.3_

  - [x] 1.2 Fix `envelope_exception_handler` in `backend/apps/common/exceptions.py` to force 401 for auth exceptions
    - Add logic after `response = exception_handler(exc, context)` to check `isinstance(exc, (AuthenticationFailed, NotAuthenticated))`
    - When true, force `response.status_code = 401` regardless of DRF's default
    - Preserve the exception's error code via `exc.get_codes()` (e.g., `TOKEN_EXPIRED`, `INVALID_TOKEN`, `AUTHENTICATION_REQUIRED`)
    - Move the auth-specific code extraction before the generic `error_code_map` lookup
    - _Requirements: 3.1, 3.4, 3.5, 3.6_

  - [x] 1.3 Write property tests for the 401/403 status contract
    - **Property 1: AuthenticationFailed always produces 401**
    - Create `backend/tests/property/test_auth_status_contract.py`
    - Use Hypothesis to generate arbitrary `AuthenticationFailed` exceptions with random error codes and verify `envelope_exception_handler` always returns status 401
    - **Property 2: NotAuthenticated always produces 401**
    - Verify `NotAuthenticated` exceptions always map to 401 with code `AUTHENTICATION_REQUIRED`
    - **Property 3: PermissionDenied always produces 403**
    - Verify `PermissionDenied` exceptions always map to 403, never 401
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.6**

- [x] 2. Checkpoint — Backend auth contract
  - Ensure all tests pass with `cd backend && python3 -m pytest`. Ask the user if questions arise.

- [x] 3. Backend: Reclassify views to explicit auth strategies
  - [x] 3.1 Reclassify catalog views in `backend/apps/catalog/views.py`
    - `ProgramListCreateView`, `IntakeListCreateView`, `SubjectListView`, `InstitutionListView` already use `get_authenticators()` returning `OptionalJWTCookieAuthentication` for GET
    - Update the class-level `authentication_classes = []` to `authentication_classes = [OptionalJWTCookieAuthentication]` on each view so the declaration matches the runtime behavior
    - Add the import `from apps.accounts.authentication import OptionalJWTCookieAuthentication` at the top of the file if not already present
    - _Requirements: 2.2, 2.4, 2.5_

  - [x] 3.2 Reclassify `ApplicationTrackView` in `backend/apps/applications/views.py`
    - Change `authentication_classes = []` to `authentication_classes = [OptionalJWTCookieAuthentication]`
    - Add the import for `OptionalJWTCookieAuthentication` if not already present
    - _Requirements: 2.2, 2.4, 2.5_

  - [x] 3.3 Reclassify job views in `backend/apps/jobs/views.py`
    - Change `JobListView` and `JobDetailView` from `authentication_classes = []` to `authentication_classes = [OptionalJWTCookieAuthentication]`
    - Add the import for `OptionalJWTCookieAuthentication`
    - _Requirements: 2.2, 2.4, 2.5_

  - [x] 3.4 Verify auth-exempt views remain unchanged
    - Confirm these views keep `authentication_classes = []` with `permission_classes = [AllowAny]`: `LoginView`, `RegisterView`, `RefreshView`, `PasswordResetRequestView`, `PasswordResetConfirmView`, `LivenessView`, `ReadinessView`, `PlatformMetaView`, `ErrorReportView`, `LencoWebhookView`, `TelegramWebhookView`, `EmailDeliveryWebhookView`
    - No code changes needed — just verify the design's auth-exempt list matches reality
    - _Requirements: 2.1_

  - [x] 3.5 Write unit tests for view auth classification
    - Create `backend/tests/unit/test_view_auth_classification.py`
    - Test that each reclassified view uses `OptionalJWTCookieAuthentication` for GET requests
    - Test that auth-exempt views use `authentication_classes = []`
    - Test that protected views inherit the DRF default `JWTCookieAuthentication`
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 4. Checkpoint — Backend reclassification
  - Ensure all tests pass with `cd backend && python3 -m pytest`. Ask the user if questions arise.

- [x] 5. Frontend: Simplify ApiClient refresh logic
  - [x] 5.1 Remove cooldown timers and cached refresh state from `ApiClient` in `apps/admissions/src/services/client.ts`
    - Remove properties: `lastRefreshSuccessTime`, `lastRefreshFailureTime`, `lastRefreshResult`
    - Remove static constants: `REFRESH_COOLDOWN_MS`, `REFRESH_FAILURE_COOLDOWN_MS`
    - Simplify `attemptRefresh()` to a pure promise-lock: if `refreshPromise` exists, await it; otherwise start `performRefresh()`, dispatch `dispatchAuthRecovered()` on success, and clear the lock in `finally`
    - Remove the cooldown checks at the top of `attemptRefresh()`
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 5.2 Remove the 403 `TOKEN_EXPIRED` intercept block from `ApiClient.executeRequest()`
    - Delete the entire `if (response.status === 403 && !this.isAuthExcludedEndpoint(...) && errorCode === 'TOKEN_EXPIRED')` block (~60 lines, starting around line 855)
    - The backend now returns 401 directly for expired tokens, so the existing 401 intercept handles everything
    - Keep the 403 CSRF intercept block unchanged
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 5.3 Update `isPermissionDenial` in `apps/admissions/src/lib/sessionHardening.ts`
    - Remove the `if (errorCode === 'TOKEN_EXPIRED') return false` line — 403 with `TOKEN_EXPIRED` will no longer occur since the backend always returns 401 for auth failures
    - After this change, all 403s except CSRF codes are permission denials
    - _Requirements: 3.4, 5.5_

  - [x] 5.4 Write property tests for the frontend refresh logic
    - Create `apps/admissions/tests/property/authSimplificationRefresh.property.test.ts`
    - **Property 4: Concurrent 401s deduplicate to a single refresh call**
    - Use fast-check to generate N concurrent 401 responses and verify only one `performRefresh` call occurs
    - **Property 5: After refresh lock clears, next 401 triggers a fresh refresh**
    - Verify the promise-lock resets correctly after completion
    - **Validates: Requirements 6.1, 6.3**

- [x] 6. Frontend: Simplify AuthContext visibility handling
  - [x] 6.1 Remove payment-in-progress guards from `AuthContext` in `apps/admissions/src/contexts/AuthContext.tsx`
    - Remove the import: `import { isPaymentInProgress as _isPaymentInProgress } from '@/hooks/useApplicationPaymentAction'`
    - Remove the `if (_isPaymentInProgress()) return` guard in the auth failure callback (inside `configureApiClientAuthFailure`)
    - Remove the `if (_isPaymentInProgress()) return` guard in the `handleVisibilityChange` function
    - The visibility handler becomes: check `document.visibilityState`, debounce with `VISIBILITY_DEBOUNCE_MS`, and invalidate the session query
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 6.2 Write unit tests for simplified AuthContext visibility handling
    - Add tests to verify visibility change triggers session invalidation without payment guards
    - Verify the 3-second debounce still works
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 7. Checkpoint — Frontend simplification
  - Ensure all frontend tests pass with `cd apps/admissions && bun run test`. Type-check with `cd apps/admissions && ./node_modules/.bin/tsc -p tsconfig.build.json --noEmit`. Ask the user if questions arise.

- [-] 8. Update existing tests and cleanup
  - [x] 8.1 Update frontend tests that reference removed cooldown behavior
    - Update `apps/admissions/tests/property/autoLogoutRacePreservation.property.test.ts` — remove or update tests that assert `REFRESH_FAILURE_COOLDOWN_MS` and `REFRESH_COOLDOWN_MS` behavior
    - Update `apps/admissions/tests/property/test_bug4_client_refresh.test.ts` — remove tests that assert 403 `TOKEN_EXPIRED` triggers refresh (this path no longer exists)
    - Update `apps/admissions/tests/unit/sessionHardening.test.ts` — remove the test `'403 TOKEN_EXPIRED is NOT a permission denial'` since this case no longer applies
    - _Requirements: 5.5, 6.2, 11.2, 11.3_

  - [-] 8.2 Remove the `JWTAuthenticationMiddleware` class from `backend/apps/common/middleware.py`
    - Delete the entire class definition and its docstring
    - Update the module docstring at the top of the file to remove references to JWT authentication middleware
    - _Requirements: 1.1, 4.1, 4.3_

  - [ ] 8.3 Write backend integration test for end-to-end auth flow
    - Create `backend/tests/unit/test_auth_simplification_integration.py`
    - Test that a request with expired token to a protected view returns 401 (not 403)
    - Test that a request with expired token to a public-personalizable view returns 200 with `AnonymousUser`
    - Test that a request with valid token to a protected view returns 200
    - Test that CSRF 403 responses are unaffected by the auth changes
    - _Requirements: 3.1, 3.3, 3.4, 8.1, 8.2, 9.4, 11.1, 11.4_

- [ ] 9. Final checkpoint — Full test suite
  - Ensure all backend tests pass with `cd backend && python3 -m pytest`. Ensure all frontend tests pass with `cd apps/admissions && bun run test`. Type-check with `cd apps/admissions && ./node_modules/.bin/tsc -p tsconfig.build.json --noEmit`. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Backend changes (tasks 1–4) are safe to deploy independently before frontend changes
- The catalog views already have `get_authenticators()` returning `OptionalJWTCookieAuthentication` for GET — task 3.1 aligns the class-level declaration with the runtime behavior
- `SessionView` already uses `[OptionalJWTCookieAuthentication]` — no change needed
- `JWTCookieAuthentication.authenticate_header` already returns `'Bearer realm="api"'` — no change needed
- CSRF handling (Requirement 8) and cookie-based auth (Requirement 9) are preserved unchanged
- `useSessionListener` (Requirement 10) interface is unchanged
- Property tests use Hypothesis (backend) and fast-check (frontend) per repo conventions
