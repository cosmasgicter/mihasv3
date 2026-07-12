# Implementation Plan: Single Source of Truth Consolidation

## Overview

Systemic refactor to consolidate all duplicated and competing logic into single sources of truth for HTTP requests, auth state, CSRF lifecycle, token refresh, logout, and admin role determination. The implementation follows a bottom-up approach: enhance the ApiClient first, then migrate callers, then remove dead code, then add tests.

## Tasks

- [x] 1. Enhance ApiClient with 401 refresh-retry, CSRF 403 retry, and endpoint normalization
  - [x] 1.1 Add refresh deduplication to ApiClient
    - Add private `refreshPromise` field and `attemptRefresh()` method to `src/services/client.ts`
    - Port the promise-lock pattern from `authController.ts` `deduplicatedRefresh`
    - Add `configureApiClientAuthFailure` export function to replace `configureAuthController`
    - _Requirements: 1.2, 1.3, 3.1, 3.8_
  - [x] 1.2 Add 401 intercept-refresh-retry logic to ApiClient
    - In `executeRequest`, catch 401 responses on non-auth endpoints (exclude `/api/auth?action=refresh`, login, register)
    - Call `attemptRefresh()`, on success retry original request once, on failure call `onAuthFailure()` and throw `AuthenticationError`
    - Capture CSRF token from refresh response
    - _Requirements: 1.2, 1.3, 1.8, 3.7, 4.6_
  - [x] 1.3 Add CSRF 403 retry logic to ApiClient
    - Detect 403 responses with CSRF-related error codes (`CSRF_INVALID`, `CSRF_MISSING`)
    - Re-fetch CSRF token via GET `/api/auth?action=session`, update CSRF Token Store
    - Retry the original state-changing request once with the new token
    - _Requirements: 6.7_
  - [x] 1.4 Add endpoint normalization to ApiClient
    - Ensure all endpoint paths passed to `request()` are prefixed with `/api/` when missing
    - Handle edge cases: already prefixed, absolute URLs, empty strings
    - _Requirements: 8.1, 8.3_

  - [x] 1.5 Write property tests for ApiClient CSRF handling (Properties 4, 5)
    - **Property 4: CSRF token captured from every response**
    - **Property 5: CSRF token attached to all state-changing requests**
    - Create `tests/property/apiClientCsrf.property.test.ts`
    - **Validates: Requirements 1.4, 3.7, 6.2, 6.4, 6.5**
  - [x] 1.6 Write property test for refresh deduplication (Property 7)
    - **Property 7: Refresh deduplication — N concurrent 401s produce exactly 1 refresh call**
    - Create `tests/property/refreshDeduplication.property.test.ts`
    - **Validates: Requirements 3.8, 10.5**
  - [x] 1.7 Write unit tests for ApiClient 401 retry
    - Create `tests/unit/apiClient401Retry.test.ts`
    - Test: 401 → refresh succeeds → retry succeeds
    - Test: 401 → refresh fails → `onAuthFailure` called
    - Test: 401 on refresh endpoint → no recursive refresh
    - Test: 401 on login endpoint → no refresh attempt
    - _Requirements: 1.2, 1.3, 10.5_
  - [x] 1.8 Write unit tests for ApiClient CSRF 403 retry
    - Create `tests/unit/apiClientCsrf403Retry.test.ts`
    - Test: 403 CSRF error → re-fetch → retry succeeds
    - Test: 403 non-CSRF error → no retry
    - _Requirements: 6.7_

- [x] 2. Checkpoint — Verify ApiClient enhancements
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Migrate useSessionListener from authRequest to ApiClient
  - [x] 3.1 Replace authRequest calls in useSessionListener with apiClient
    - Update `src/hooks/auth/useSessionListener.ts` queryFn to use `apiClient.request('/api/auth?action=session')`
    - Update `signIn` to use `apiClient.request('/api/auth?action=login', ...)`
    - Update `signUp` to use `apiClient.request('/api/auth?action=register', ...)`
    - Update `requestPasswordReset` and `updatePassword` to use `apiClient.request`
    - _Requirements: 1.1, 1.5, 2.1_
  - [x] 3.2 Inline logout cleanup in useSessionListener
    - Replace `logoutWithTwoPhaseClear()` call with inline: clear CSRF → clear React Query cache → POST logout via apiClient → clear secure storage
    - Ensure `signOut` clears the CSRF Token Store via `clearCsrfToken()`
    - _Requirements: 4.1, 4.2, 6.6_
  - [x] 3.3 Remove hardcoded email from checkIsAdmin
    - Remove the `cosmas@beanola.com` hardcoded email check from `checkIsAdmin` in `useSessionListener`
    - Ensure admin status is determined solely by `isAdminRole(role)` from `src/lib/auth/roles.ts`
    - _Requirements: 5.1, 5.2, 5.5_
  - [x] 3.4 Replace configureAuthController with configureApiClientAuthFailure in AuthContext
    - Update `src/contexts/AuthContext.tsx` useEffect to call `configureApiClientAuthFailure` instead of `configureAuthController`
    - _Requirements: 1.5_

  - [x] 3.5 Write property test for admin role determination (Property 8)
    - **Property 8: Admin status determined solely by role**
    - Create `tests/property/adminRoleCheck.property.test.ts`
    - **Validates: Requirements 5.1, 5.5, 10.3**
  - [x] 3.6 Write unit tests for checkIsAdmin and signOut cleanup
    - Create `tests/unit/checkIsAdminNoEmail.test.ts` — verify no email literals in source, verify role-only logic
    - Create `tests/unit/signOutCleanup.test.ts` — verify CSRF clear, cache clear, POST logout, secure storage clear
    - _Requirements: 5.5, 4.2, 10.3_

- [x] 4. Migrate useProfileQuery from authRequest to ApiClient
  - [x] 4.1 Replace authRequest calls in useProfileQuery with apiClient
    - Update `src/hooks/auth/useProfileQuery.ts` queryFn to use `apiClient.request('/api/auth?action=profile')`
    - Update `updateProfile` mutation to use `apiClient.request('/api/auth?action=profile', { method: 'PATCH', ... })`
    - Ensure the read query uses cache key `['user-profile', userId]` matching `useSessionListener`
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 5. Checkpoint — Verify migrations compile and pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Remove authController.ts and competing session check paths
  - [x] 6.1 Delete authController.ts
    - Delete `src/services/authController.ts`
    - Remove all imports of `authRequest`, `logoutWithTwoPhaseClear`, `configureAuthController`, `requestRefresh`, `deduplicatedRefresh` across the codebase
    - _Requirements: 1.5, 3.6_
  - [x] 6.2 Remove competing session check hooks and utilities
    - Remove `useAuthSession` and `useAuthUser` from `src/hooks/queries/useQueryConfig.ts`
    - Remove `checkSession` and `makeAuthenticatedRequest` from `src/lib/sessionUtils.ts`
    - Remove `getCurrentUser` from `src/services/offlineSync.ts`, replace with React Query cache read from `['auth', 'session']`
    - Remove `refreshCsrfToken` from `src/services/offlineSync.ts`
    - _Requirements: 1.6, 2.2, 2.3, 2.5, 2.9, 6.3_
  - [x] 6.3 Migrate inline session checks in components to useAuth()
    - Update `AuthStatusChecker` component to use `useAuth()` instead of direct API call
    - Update `AuthenticationGuard` component to use `useAuth()` instead of direct API call
    - Update `useApplicationSubmit` hook to use `useAuth()` instead of inline session fetch
    - Replace raw `fetch('/api/auth?action=session')` in `useApplicationFileUploads` with `useAuth()` or `apiClient.request`
    - Replace raw `fetch('/api/auth?action=session')` in `useWizardController` with `useAuth()` or `apiClient.request`
    - _Requirements: 1.7, 2.10, 2.11, 2.12,8.2_

- [x] 7. Remove competing refresh, logout, and role paths
  - [x] 7.1 Remove competing token refresh paths
    - Delete `src/hooks/auth/useTokenRefresh.ts`
    - Remove `useRefreshSession` mutation from `src/hooks/queries/useAuthMutations.ts`
    - Remove `refreshSession` function from `src/lib/api/authApi.ts`
    - Remove `SessionManagerImpl.refreshSession` (covered by session.ts deletion in task 8)
    - Remove `authPersistence.checkAndRefreshSession` (covered by authPersistence.ts deletion in task 8)
    - Remove `authRefresh.refreshAuthSession` and `ensureValidSession` (covered by authRefresh.ts deletion in task 8)
    - _Requirements: 3.2, 3.3, 3.4, 3.5_
  - [x] 7.2 Remove competing logout paths
    - Remove `useSignOut` mutation from `src/hooks/queries/useAuthMutations.ts`
    - Remove `logout` function from `src/lib/api/authApi.ts`
    - Remove `sessionManager.clearSession` (covered by session.ts deletion in task 8)
    - _Requirements: 4.3, 4.4, 4.5_
  - [x] 7.3 Remove useRoleQuery and fix admin role callers
    - Delete `src/hooks/auth/useRoleQuery.ts`
    - Remove `fetchUserRole` function from `src/lib/api/authApi.ts`
    - Migrate all callers of `useRoleQuery().isAdmin` to use `useAuth().isAdmin`
    - _Requirements: 5.3, 5.4, 5.6_

- [x] 8. Delete dead code modules
  - [x] 8.1 Delete orphaned module files
    - Delete `src/lib/api/authApi.ts` (after migrating any remaining callers: login, register, requestPasswordReset, resetPassword, verifyEmail)
    - Delete `src/lib/session.ts` (SessionManagerImpl, setupSessionTimeout)
    - Delete `src/lib/authRefresh.ts` (refreshAuthSession, ensureValidSession)
    - Delete `src/lib/authPersistence.ts` (AuthPersistence)
    - Delete `src/lib/sessionUtils.ts` (checkSession, makeAuthenticatedRequest)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.7_
  - [x] 8.2 Relocate useUpdateUser and delete useAuthMutations.ts
    - Move `useUpdateUser` mutation from `src/hooks/queries/useAuthMutations.ts` to an appropriate location (e.g., `src/hooks/auth/useProfileQuery.ts` or a new dedicated file)
    - Delete `src/hooks/queries/useAuthMutations.ts`
    - _Requirements: 7.6_
  - [x] 8.3 Clean up all broken imports and re-exports
    - Update all import statements referencing deleted modules
    - Remove re-exports from index files that referenced deleted modules
    - Verify no TypeScript compilation errors remain
    - _Requirements: 7.8, 7.9_

- [x] 9. Checkpoint — Verify full compilation and no broken imports
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Write codebase invariant property tests and update existing tests
  - [x] 10.1 Write codebase invariant property tests (Properties 1, 2, 3, 6)
    - **Property 1: No imports from deleted modules**
    - **Property 2: No raw fetch to auth endpoints**
    - **Property 3: All endpoint strings use /api/ prefix**
    - **Property 6: Only ApiClient writes to CSRF Token Store**
    - Create `tests/property/singleSourceOfTruth.property.test.ts`
    - Scan all `.ts`/`.tsx` files in `src/` and verify each invariant
    - **Validates: Requirements 1.5, 1.6, 1.7, 2.2–2.13, 7.1–7.7, 8.1–8.3, 10.1, 10.2, 10.4**
  - [x] 10.2 Update existing auth tests to reflect consolidated architecture
    - Update `tests/unit/auth-context-thin-wrapper.test.ts` — add assertions that deleted modules don't exist, update references
    - Update `tests/unit/authStateUnification.test.ts` — reflect consolidated architecture
    - _Requirements: 10.6_

- [x] 11. Final checkpoint — Full test suite and compilation verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major phase
- Property tests validate universal correctness properties from the design document
- The implementation order is bottom-up: enhance ApiClient → migrate callers → remove dead code → verify with tests
- This is a pure refactor — no new features, no API changes, no database changes
