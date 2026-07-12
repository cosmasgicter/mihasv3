# Requirements Document

## Introduction

The MIHAS admissions platform has accumulated multiple overlapping implementations for core concerns through iterative development. This systemic refactor consolidates all duplicated and competing logic into single sources of truth for each concern: API request handling, authentication state, session management, CSRF token lifecycle, token refresh, logout, and admin role determination.

### Forensic Analysis Summary

The following competing code paths were identified:

**API Request Clients (2 competing implementations):**
- `apiClient` (`src/services/client.ts`) — the canonical `ApiClient` class with caching, retry, envelope unwrapping
- `authRequest` (`src/services/authController.ts`) — a separate fetch wrapper with its own 401 handling, refresh deduplication, and CSRF capture

Both attach CSRF tokens, both capture CSRF from responses, both handle 401s, but they do so with different logic. `useSessionListener` uses `authRequest` while most hooks/services use `apiClient`. This means auth operations and non-auth operations go through different code paths with different error handling, different retry logic, and different CSRF capture timing.

**Session Check Paths (7+ competing implementations):**
1. `useSessionListener` queryFn → `authRequest('/api/auth?action=session')` — the canonical React Query path
2. `useAuthSession` (`useQueryConfig.ts`) → `apiClient.request('/api/auth?action=session')` — separate query, different client
3. `useAuthUser` (`useQueryConfig.ts`) → `apiClient.request('/api/auth?action=session')` — yet another query extracting `.user`
4. `checkSession` (`src/lib/sessionUtils.ts`) → `apiClient.request('/auth?action=session')` — imperative, note missing `/api` prefix
5. `sessionManager.isSessionValid` (`src/lib/session.ts`) → `apiClient.request('/api/auth?action=session')` — class-based singleton
6. `authPersistence.checkAndRefreshSession` (`src/lib/authPersistence.ts`) → `apiClient.request('/api/auth?action=session')` — interval-based
7. `authRefresh.refreshAuthSession` (`src/lib/authRefresh.ts`) → `apiClient.request('/api/auth?action=session')` — checks then refreshes
8. `offlineSync.getCurrentUser` (`src/services/offlineSync.ts`) → `apiClient.request('/auth?action=session')` — note missing `/api` prefix
9. `AuthStatusChecker` component → `apiClient.request('/auth?action=session')` — note missing `/api` prefix
10. `AuthenticationGuard` component → `apiClient.request('/auth?action=session')` — note missing `/api` prefix
11. `useApplicationSubmit` → `apiClient.request('/api/auth?action=session')` — inline session check before submit
12. `useApplicationFileUploads` → raw `fetch('/api/auth?action=session')` — bypasses both clients entirely
13. `useWizardController` → raw `fetch('/api/auth?action=session')` — bypasses both clients entirely
14. `getSession` (`src/lib/api/authApi.ts`) → `authRequest('/api/auth?action=session')` — standalone function

**Token Refresh Paths (6+ competing implementations):**
1. `authController.requestRefresh` — raw fetch with CSRF, deduplication lock
2. `useTokenRefresh` hook — interval-based via `authRequest`, runs alongside authPersistence
3. `sessionManager.refreshSession` — via `apiClient`, own deduplication lock
4. `authPersistence.checkAndRefreshSession` — via `apiClient`, proactive refresh on visibility change
5. `authRefresh.refreshAuthSession` — via `apiClient`, checks session then refreshes
6. `useRefreshSession` mutation (`useAuthMutations.ts`) — via `apiClient`, React Query mutation
7. `refreshSession` (`src/lib/api/authApi.ts`) — via `authRequest`, standalone function

**Logout Paths (4 competing implementations):**
1. `logoutWithTwoPhaseClear` (`authController.ts`) — clears state, clears caches, clears CSRF, then POSTs logout
2. `useSignOut` mutation (`useAuthMutations.ts`) — POSTs logout via `apiClient`, then `queryClient.clear()`
3. `sessionManager.clearSession` (`session.ts`) — POSTs logout via `apiClient` only
4. `logout` (`authApi.ts`) — POSTs logout via `authRequest`

**Admin Role Determination (3 competing paths):**
1. `checkIsAdmin` in `useSessionListener` — checks `user.role`, `user.user_metadata.role`, `user.app_metadata.role`, hardcoded email
2. `useRoleQuery` hook — fetches role from `/api/auth?action=roles` endpoint, hardcoded email check
3. `AuthContext.isAdmin` — delegates to `useSessionListener.checkIsAdmin`

Components use a mix: some use `useAuth().isAdmin` (from AuthContext/useSessionListener), others use `useRoleQuery().isAdmin` (separate API call). These can disagree.

**CSRF Token Lifecycle (fragmented across 4+ files):**
1. `src/lib/csrfToken.ts` — in-memory module-level variable, lost on page refresh
2. `src/services/client.ts` — captures from response headers on both GET and non-GET
3. `src/services/authController.ts` — captures from response headers on all responses
4. `src/services/offlineSync.ts` — has its own `refreshCsrfToken()` that does a raw fetch and tries body fallback
5. Server-side `lib/csrf.ts` — `generateToken` was destructive (deleted all existing tokens)

**Orphaned/Dead Utilities:**
- `src/lib/sessionUtils.ts` — `makeAuthenticatedRequest` appears unused (0 callers)
- `src/lib/api/authApi.ts` — standalone functions that duplicate `useSessionListener` logic
- `src/hooks/queries/useQueryConfig.ts` — `useAuthSession` and `useAuthUser` duplicate `useSessionListener`
- `src/lib/session.ts` — `SessionManagerImpl` duplicates authController refresh deduplication
- `src/lib/authRefresh.ts` — `refreshAuthSession`/`ensureValidSession` duplicate other refresh paths

## Glossary

- **ApiClient**: The canonical HTTP client class in `src/services/client.ts` that handles caching, retry, timeout, envelope unwrapping, and CSRF token attachment
- **AuthRequest**: The competing HTTP function in `src/services/authController.ts` that handles auth-specific requests with 401 refresh and redirect logic
- **AuthContext**: The React context provider (`src/contexts/AuthContext.tsx`) that exposes user identity, auth state, and auth operations to the component tree
- **SessionListener**: The hook `useSessionListener` in `src/hooks/auth/useSessionListener.ts` that manages the canonical auth session via React Query
- **CSRF_Token_Store**: The in-memory module-level variable in `src/lib/csrfToken.ts` that holds the current CSRF token
- **React_Query_Cache**: The TanStack React Query cache that serves as the single source of truth for server state
- **Auth_Store**: The Zustand store in `src/stores/authStore.ts` that holds retry/backoff/error state only
- **Platform**: The MIHAS admissions web application as a whole
- **Session_Endpoint**: The server endpoint `/api/auth?action=session` that validates the current JWT cookie and returns user data
- **Refresh_Endpoint**: The server endpoint `/api/auth?action=refresh` that rotates JWT tokens


## Requirements

### Requirement 1: Unified API Request Client

**User Story:** As a developer, I want a single API request path for all HTTP calls, so that CSRF capture, 401 handling, retry logic, and error handling behave consistently across the entire application.

#### Acceptance Criteria

1. THE Platform SHALL route all HTTP requests to backend endpoints through the ApiClient (`src/services/client.ts`) as the sole request mechanism.
2. WHEN the ApiClient receives a 401 response on a non-auth request, THE ApiClient SHALL attempt a single token refresh via the Refresh_Endpoint before retrying the original request.
3. WHEN the token refresh in the ApiClient fails, THE ApiClient SHALL clear auth state in the React_Query_Cache and redirect to the sign-in page.
4. WHEN the ApiClient receives any HTTP response, THE ApiClient SHALL capture the `X-CSRF-Token` header value and store it in the CSRF_Token_Store.
5. THE Platform SHALL remove the `authRequest` function from `src/services/authController.ts` and migrate all callers to use the ApiClient.
6. THE Platform SHALL remove the `makeAuthenticatedRequest` function from `src/lib/sessionUtils.ts`.
7. THE Platform SHALL remove all raw `fetch()` calls to `/api/auth` endpoints in `src/pages/student/applicationWizard/hooks/useApplicationFileUploads.ts` and `src/pages/student/applicationWizard/hooks/useWizardController.ts`, replacing them with ApiClient calls.
8. IF the ApiClient encounters a network error, THEN THE ApiClient SHALL retry the request according to the existing exponential backoff strategy without duplicating retry logic elsewhere.

---

### Requirement 2: Single Auth Session Source of Truth

**User Story:** As a developer, I want exactly one code path that determines the current user's authentication state, so that all components see consistent auth data and there are no race conditions between competing session queries.

#### Acceptance Criteria

1. THE Platform SHALL use the `useSessionListener` hook (via AuthContext) as the sole mechanism for determining user identity, authentication status, and profile data.
2. THE Platform SHALL remove the `useAuthSession` hook from `src/hooks/queries/useQueryConfig.ts`.
3. THE Platform SHALL remove the `useAuthUser` hook from `src/hooks/queries/useQueryConfig.ts`.
4. THE Platform SHALL remove the `getSession` function from `src/lib/api/authApi.ts`.
5. THE Platform SHALL remove the `checkSession` function from `src/lib/sessionUtils.ts`.
6. THE Platform SHALL remove the `SessionManagerImpl` class and `sessionManager` singleton from `src/lib/session.ts`.
7. THE Platform SHALL remove the `AuthPersistence` class and `authPersistence` singleton from `src/lib/authPersistence.ts`.
8. THE Platform SHALL remove the `refreshAuthSession` and `ensureValidSession` functions from `src/lib/authRefresh.ts`.
9. THE Platform SHALL remove the `getCurrentUser` function from `src/services/offlineSync.ts` and replace it with a call that reads from the React_Query_Cache `['auth', 'session']` key.
10. WHEN a component needs to verify the user is authenticated before an operation, THE component SHALL use `useAuth()` from AuthContext rather than making an independent session API call.
11. THE `AuthStatusChecker` component SHALL use `useAuth()` from AuthContext instead of calling the Session_Endpoint directly.
12. THE `AuthenticationGuard` component SHALL use `useAuth()` from AuthContext instead of calling the Session_Endpoint directly.
13. THE `useApplicationSubmit` hook SHALL use `useAuth()` from AuthContext instead of calling the Session_Endpoint directly.

---

### Requirement 3: Single Token Refresh Mechanism

**User Story:** As a developer, I want exactly one token refresh mechanism, so that refresh requests are properly deduplicated and tokens are rotated consistently without competing timers.

#### Acceptance Criteria

1. THE Platform SHALL use the ApiClient's 401-triggered refresh (with deduplication) as the sole automatic token refresh mechanism.
2. THE Platform SHALL remove the `useTokenRefresh` hook from `src/hooks/auth/useTokenRefresh.ts`.
3. THE Platform SHALL remove the `useRefreshSession` mutation from `src/hooks/queries/useAuthMutations.ts`.
4. THE Platform SHALL remove the `refreshSession` function from `src/lib/api/authApi.ts`.
5. THE Platform SHALL remove the interval-based refresh from `AuthPersistence` (covered by Requirement 2.7).
6. THE Platform SHALL remove the `requestRefresh` and `deduplicatedRefresh` functions from `src/services/authController.ts` after migrating the ApiClient to handle refresh internally.
7. WHEN a token refresh succeeds, THE ApiClient SHALL capture the new CSRF token from the refresh response header and update the CSRF_Token_Store.
8. WHEN multiple concurrent requests receive 401 responses, THE ApiClient SHALL deduplicate refresh attempts so that only one refresh request is in-flight at a time, and all waiting requests retry after the single refresh completes.

---

### Requirement 4: Single Logout Path

**User Story:** As a developer, I want exactly one logout implementation, so that all auth state, caches, CSRF tokens, and server sessions are cleared consistently regardless of where logout is triggered.

#### Acceptance Criteria

1. THE Platform SHALL use the `signOut` function from `useSessionListener` (exposed via `useAuth().signOut`) as the sole logout mechanism.
2. WHEN `signOut` is called, THE SessionListener SHALL clear the CSRF_Token_Store, clear the React_Query_Cache, POST to the logout endpoint via the ApiClient, and clear encrypted session data from localStorage.
3. THE Platform SHALL remove the `useSignOut` mutation from `src/hooks/queries/useAuthMutations.ts`.
4. THE Platform SHALL remove the `logout` function from `src/lib/api/authApi.ts`.
5. THE Platform SHALL remove the `clearSession` method from `SessionManagerImpl` in `src/lib/session.ts` (covered by Requirement 2.6).
6. WHEN the ApiClient detects an unrecoverable 401 (refresh failed), THE ApiClient SHALL invoke the same logout cleanup as `signOut` before redirecting.

---

### Requirement 5: Single Admin Role Determination

**User Story:** As a developer, I want exactly one way to determine if a user is an admin, so that role-based UI rendering is consistent and does not require a separate API call that can disagree with the JWT-embedded role.

#### Acceptance Criteria

1. THE Platform SHALL determine admin status from the JWT-embedded role in the session user object using `isAdminRole()` from `src/lib/auth/roles.ts`, without making a separate API call to `/api/auth?action=roles`.
2. THE AuthContext SHALL expose `isAdmin` derived from `checkIsAdmin(user)` in `useSessionListener` as the sole admin role indicator.
3. THE Platform SHALL remove the `useRoleQuery` hook from `src/hooks/auth/useRoleQuery.ts` and migrate all callers to use `useAuth().isAdmin`.
4. THE Platform SHALL remove the `fetchUserRole` function from `src/lib/api/authApi.ts`.
5. THE `checkIsAdmin` function SHALL remove the hardcoded email check (`cosmas@beanola.com`) and rely solely on the role field from the user object.
6. WHEN a component needs to check admin status, THE component SHALL use `useAuth().isAdmin` from AuthContext.

---

### Requirement 6: Consolidated CSRF Token Lifecycle

**User Story:** As a developer, I want a single, predictable CSRF token lifecycle, so that tokens are captured reliably on page load, preserved across navigation, and attached to all state-changing requests without competing capture paths.

#### Acceptance Criteria

1. THE CSRF_Token_Store (`src/lib/csrfToken.ts`) SHALL remain the single in-memory store for the current CSRF token.
2. WHEN the Platform loads or refreshes a page, THE ApiClient SHALL acquire a CSRF token from the Session_Endpoint response header during the initial session check and store it in the CSRF_Token_Store.
3. THE Platform SHALL remove the `refreshCsrfToken` function from `src/services/offlineSync.ts` and use the CSRF_Token_Store value instead.
4. THE ApiClient SHALL be the sole code path that captures CSRF tokens from response headers, eliminating duplicate capture in `authController.ts`.
5. WHEN the CSRF_Token_Store contains a token, THE ApiClient SHALL attach it as the `X-CSRF-Token` header on all POST, PUT, PATCH, and DELETE requests.
6. WHEN `signOut` is called, THE Platform SHALL clear the CSRF_Token_Store.
7. IF a state-changing request fails with a CSRF validation error (403 with CSRF-related error code), THEN THE ApiClient SHALL re-fetch the CSRF token from the Session_Endpoint and retry the request once.

---

### Requirement 7: Dead Code Removal

**User Story:** As a developer, I want all orphaned and superseded modules removed, so that the codebase has no misleading dead code that could be accidentally reintroduced or cause confusion.

#### Acceptance Criteria

1. THE Platform SHALL delete `src/lib/api/authApi.ts` after migrating all callers (login, logout, register, getSession, fetchUserRole, refreshSession, requestPasswordReset, resetPassword, verifyEmail) to use the canonical paths.
2. THE Platform SHALL delete `src/lib/session.ts` (SessionManagerImpl, setupSessionTimeout) after confirming zero callers.
3. THE Platform SHALL delete `src/lib/authRefresh.ts` (refreshAuthSession, ensureValidSession) after confirming zero callers.
4. THE Platform SHALL delete `src/lib/authPersistence.ts` (AuthPersistence) after confirming zero callers.
5. THE Platform SHALL delete `src/hooks/auth/useTokenRefresh.ts` after confirming zero callers.
6. THE Platform SHALL delete `src/hooks/queries/useAuthMutations.ts` after migrating the `useUpdateUser` mutation to a more appropriate location.
7. THE Platform SHALL delete `src/lib/sessionUtils.ts` after confirming zero callers.
8. WHEN a module is deleted, THE Platform SHALL update all import statements and re-exports that referenced the deleted module.
9. THE Platform SHALL verify that no TypeScript compilation errors exist after all deletions.

---

### Requirement 8: Consistent Endpoint URL Formatting

**User Story:** As a developer, I want all API endpoint URLs to use a consistent format, so that requests are not silently routed incorrectly due to missing prefixes.

#### Acceptance Criteria

1. THE ApiClient SHALL normalize all endpoint paths to include the `/api/` prefix when the caller omits it.
2. THE Platform SHALL audit and fix all endpoint URLs that use `/auth?action=` instead of `/api/auth?action=` (found in `sessionUtils.ts`, `offlineSync.ts`, `AuthStatusChecker.tsx`, `AuthenticationGuard.tsx`).
3. WHEN a caller passes an endpoint path without the `/api/` prefix, THE ApiClient SHALL prepend `/api/` to ensure consistent routing.

---

### Requirement 9: Profile Query Consolidation

**User Story:** As a developer, I want a single profile-fetching path, so that profile data is consistent across the application and not fetched through competing hooks with different cache keys.

#### Acceptance Criteria

1. THE Platform SHALL use the profile query in `useSessionListener` (query key `['user-profile', userId]`) as the canonical profile data source.
2. THE `useProfileQuery` hook (`src/hooks/auth/useProfileQuery.ts`) SHALL read from the same React_Query_Cache key `['user-profile', userId]` used by `useSessionListener`, and SHALL NOT define its own independent `queryFn` that fetches from the profile endpoint.
3. THE `useProfileQuery` hook SHALL retain its `updateProfile` mutation capability as the sole profile update mechanism.
4. WHEN profile data is needed in a component, THE component SHALL use either `useAuth().profile` for read-only access or `useProfileQuery().updateProfile` for mutations.

---

### Requirement 10: Test Coverage for Consolidation

**User Story:** As a developer, I want property-based and unit tests that verify the single-source-of-truth invariants, so that future changes cannot reintroduce competing code paths.

#### Acceptance Criteria

1. THE Platform SHALL include a property test verifying that no source file in `src/` imports from deleted modules (`src/lib/api/authApi.ts`, `src/lib/session.ts`, `src/lib/authRefresh.ts`, `src/lib/authPersistence.ts`, `src/hooks/auth/useTokenRefresh.ts`, `src/lib/sessionUtils.ts`).
2. THE Platform SHALL include a property test verifying that no source file in `src/` contains raw `fetch()` calls to `/api/auth` endpoints.
3. THE Platform SHALL include a unit test verifying that `checkIsAdmin` does not contain hardcoded email addresses.
4. THE Platform SHALL include a property test verifying that all endpoint strings in `src/` that reference auth actions use the `/api/` prefix.
5. THE Platform SHALL include a unit test verifying that the ApiClient's refresh deduplication allows only one in-flight refresh at a time.
6. THE Platform SHALL update existing tests in `tests/unit/auth-context-thin-wrapper.test.ts` and `tests/unit/authStateUnification.test.ts` to reflect the consolidated architecture.
