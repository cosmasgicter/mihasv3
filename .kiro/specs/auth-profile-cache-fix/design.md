# Auth Profile Cache Fix — Bugfix Design

## Overview

Three related bugs in the MIHAS authentication and navigation system cause: (1) stale profile data leaking across user sessions due to incomplete cache clearing during sign-out, (2) admin users lacking a logout button in the mobile page header, and (3) the admin dashboard reporting "Profile loaded: no" because `resolveAuthLoadingState` ignores profile hydration state.

The fix restructures the `signOut` callback in `useSessionListener.ts` to call `queryClient.clear()` after the logout API call, extends the `AppLayout.tsx` mobile header actions to include admin users, and updates `resolveAuthLoadingState` to expose profile loading state so consumers can distinguish "no profile" from "profile still loading."

## Glossary

- **Bug_Condition (C)**: The set of conditions that trigger each of the three bugs — stale cache on re-login, missing admin mobile logout, profile diagnostic false-negative
- **Property (P)**: The desired behavior — complete cache isolation between sessions, consistent logout affordance across roles, accurate profile loading diagnostics
- **Preservation**: Existing behaviors that must remain unchanged — atomic cache seeding on sign-in, staleTime-based caching, student mobile header, best-effort server logout, auto-refresh flow, predicate-based stale query removal
- **`signOut`**: The callback in `src/hooks/auth/useSessionListener.ts` that clears auth state and posts the logout API call
- **`resolveAuthLoadingState`**: The function in `src/hooks/auth/useSessionListener.ts` that determines whether the auth system is still bootstrapping
- **`mobileActions`**: The JSX block in `src/components/navigation/AppLayout.tsx` that renders mobile header action buttons (profile, notifications, logout)
- **`queryClient.clear()`**: React Query method that removes all queries from the cache, including inactive ones

## Bug Details

### Bug Condition

The bugs manifest across three independent conditions that share a root in the auth/session lifecycle:

**Bug 1 (Stale Cache):** When a user signs out and a different user signs in, the `signOut` function clears specific query keys (`['user-profile']`, `['auth', 'session']`) and runs `removeQueries` with a predicate, but never calls `queryClient.clear()`. Non-auth cached queries (e.g., admin dashboard stats, application lists keyed by the previous user) survive the sign-out and are served to the new session.

**Bug 2 (Admin Mobile Logout):** When an admin user views the portal on mobile, the `mobileActions` variable in `AppLayout.tsx` evaluates to `undefined` because the condition is `!isAdmin && isStudentRoute`. Admin users get no header-level logout button — only the bottom nav overflow menu and the `AdminNavigation` sidebar footer.

**Bug 3 (Profile Diagnostic):** When an admin logs in, `resolveAuthLoadingState` returns `false` as soon as `user` is truthy, even though the profile query hasn't resolved yet. The dashboard reads `profile` as `null` and displays "Profile loaded: no."

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { action: 'signOut' | 'mobileRender' | 'dashboardRender', context: AuthContext }
  OUTPUT: boolean

  IF input.action == 'signOut' THEN
    RETURN signOutClearsCache_withoutFullClear(input.context.queryClient)
           AND newSessionInheritsStaleQueries()
  END IF

  IF input.action == 'mobileRender' THEN
    RETURN input.context.isAdmin == true
           AND input.context.isMobile == true
           AND mobileActionsIsUndefined(input.context)
  END IF

  IF input.action == 'dashboardRender' THEN
    RETURN input.context.user != null
           AND input.context.profileLoading == true
           AND resolveAuthLoadingState returns false
           AND profile == null
  END IF

  RETURN false
END FUNCTION
```

### Examples

- **Stale cache:** User A (student) signs out → User B (admin) signs in → Dashboard shows User A's cached application list because `queryClient.clear()` was never called
- **Stale cache (race):** User A signs out, logout POST is in-flight, profile query for User A resolves from cache → User B signs in and sees User A's profile briefly
- **Admin mobile logout:** Admin on iPhone opens portal → mobile header shows page title and back button but no logout icon → admin must scroll to bottom nav overflow to find "Logout"
- **Profile diagnostic:** Admin signs in → dashboard renders immediately → `profile` is `null` (query still loading) → diagnostics show "Profile loaded: no" → 200ms later profile resolves but diagnostic already rendered with stale value

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Sign-in must continue to seed `['auth', 'session']` and `['user-profile', userId]` atomically from the login response, providing immediate access without a separate session round-trip (Req 3.1)
- Authenticated page navigation must continue to serve cached session and profile data respecting configured `staleTime` (10min session, 5min profile) (Req 3.2)
- Student mobile header must continue to display profile settings button, notification bell, and logout button exactly as currently implemented (Req 3.3)
- Failed logout API calls must still clear local auth state and redirect to sign-in (best-effort server logout) (Req 3.4)
- Token auto-refresh via `/api/auth?action=refresh` must continue to work without disruption (Req 3.5)
- The `signIn` function must continue to use predicate-based `removeQueries` to clear stale non-auth data while preserving freshly-seeded auth and profile caches (Req 3.6)

**Scope:**
All inputs that do NOT involve the three bug conditions should be completely unaffected by this fix. This includes:
- Normal authenticated navigation and data fetching
- Desktop sign-out flow (already has logout button visible)
- Student mobile experience (already has header logout)
- Password reset and registration flows

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **Incomplete Cache Clearing on Sign-Out (Bug 1 & 2)**: The `signOut` callback in `useSessionListener.ts` (lines 202-240) clears CSRF, sets session to null, removes `['user-profile']` queries, removes non-auth queries via predicate, and invalidates auth/profile queries — but never calls `queryClient.clear()`. Additionally, this clearing happens BEFORE the logout API POST, creating a window where in-flight queries can re-populate the cache with stale data before the new session begins.

2. **Conditional Exclusion of Admin from Mobile Header (Bug 3 — AppLayout)**: In `AppLayout.tsx`, the `mobileActions` variable is gated by `!isAdmin && isStudentRoute`. This was likely intentional when `AdminNavigation` was the sole admin layout, but `AppLayout` wraps both admin and student routes, and the `MobilePageHeader` is rendered for all authenticated users. The condition should include admin users with an appropriate action set.

3. **Profile Loading State Ignored (Bug 4 — resolveAuthLoadingState)**: The function accepts `profileLoading` as a parameter but never uses it. It returns `false` whenever `user` is truthy, regardless of whether the profile has been fetched. This was a deliberate optimization to prevent blocking route rendering on profile hydration, but it causes downstream consumers (like the admin dashboard diagnostics) to see `profile === null` during the loading window.

## Correctness Properties

Property 1: Bug Condition — Cache Isolation Between Sessions

_For any_ sign-out followed by a sign-in with a different user, the fixed `signOut` function SHALL call `queryClient.clear()` after the logout API call completes (or fails), ensuring that zero cached queries from the previous session are accessible to the new session.

**Validates: Requirements 2.1, 2.2**

Property 2: Bug Condition — Admin Mobile Logout Affordance

_For any_ authenticated admin user viewing the portal on a mobile device, the fixed `AppLayout.tsx` SHALL render a logout button in the mobile page header that triggers the same `signOut` flow as the student mobile header logout button.

**Validates: Requirements 2.3**

Property 3: Bug Condition — Profile Loading Accuracy

_For any_ authenticated user where the profile query is still loading (`profileLoading === true` and `profile === null`), the fixed `useSessionListener` SHALL expose a `profileLoading` state that consumers can use to distinguish "profile not yet loaded" from "profile does not exist."

**Validates: Requirements 2.4**

Property 4: Preservation — Sign-In Cache Seeding

_For any_ successful sign-in, the fixed code SHALL produce the same cache seeding behavior as the original code, atomically setting `['auth', 'session']` and `['user-profile', userId]` from the login response without a separate session round-trip.

**Validates: Requirements 3.1, 3.6**

Property 5: Preservation — Student Mobile Header

_For any_ authenticated student user on mobile, the fixed code SHALL render the same mobile header actions (profile settings, notification bell, logout) as the original code.

**Validates: Requirements 3.3**

Property 6: Preservation — Best-Effort Server Logout

_For any_ sign-out where the logout API call fails, the fixed code SHALL still clear all local auth state and redirect to sign-in, matching the original best-effort behavior.

**Validates: Requirements 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/hooks/auth/useSessionListener.ts`

**Function**: `signOut`

**Specific Changes**:
1. **Restructure sign-out sequence**: Move the logout API POST to execute FIRST (before any cache clearing), wrapped in try/finally so cache clearing always happens
2. **Replace granular cache clearing with `queryClient.clear()`**: After the API call completes (or fails), call `queryClient.clear()` to remove ALL cached queries, eliminating any possibility of stale data surviving across sessions
3. **Keep CSRF clearing first**: CSRF token should still be cleared before the API call since it's a local-only operation
4. **Keep secure storage clearing**: Continue clearing secure storage after cache clearing

**File**: `src/hooks/auth/useSessionListener.ts`

**Function**: `resolveAuthLoadingState`

**Specific Changes**:
5. **No change to `resolveAuthLoadingState` itself**: The function's current behavior (not blocking route rendering on profile hydration) is correct for route guards. Instead, expose `profileLoading` from the hook return value so consumers can handle it independently.
6. **Add `profileLoading` to hook return**: Return `profileLoading` from `useSessionListener` so `AuthContext` and downstream consumers can access it

**File**: `src/contexts/AuthContext.tsx`

**Specific Changes**:
7. **Add `profileLoading` to AuthContextType**: Expose `profileLoading` boolean in the auth context interface and provider value

**File**: `src/components/navigation/AppLayout.tsx`

**Function**: `AppLayoutContent`

**Specific Changes**:
8. **Extend mobileActions condition**: Change `!isAdmin && isStudentRoute` to `user` (or `isStudentRoute || isAdminRoute`) so admin users also get a logout button in the mobile header
9. **Render admin-appropriate actions**: For admin users, render a logout button (skip profile settings and notification bell which are student-specific)

**File**: `src/pages/admin/Dashboard.tsx`

**Specific Changes**:
10. **Use `profileLoading` for diagnostic**: Update the "Profile loaded" diagnostic to show "loading..." when `profileLoading` is true and `profile` is null, instead of showing "no"

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write unit tests that exercise the `signOut` function's cache clearing behavior, the `mobileActions` conditional, and the `resolveAuthLoadingState` return values. Run these tests on the UNFIXED code to observe failures.

**Test Cases**:
1. **Stale Cache Test**: Create a QueryClient, seed it with user A's data, call `signOut`, verify that non-auth queries survive (will fail — they DO survive on unfixed code, confirming the bug)
2. **Sign-Out Sequence Test**: Mock the logout API call with a delay, verify that cache clearing happens before the API call completes (will demonstrate the race condition on unfixed code)
3. **Admin Mobile Actions Test**: Render `AppLayoutContent` with `isAdmin=true` on mobile, assert that `mobileActions` includes a logout button (will fail on unfixed code — `mobileActions` is `undefined`)
4. **Profile Loading State Test**: Call `resolveAuthLoadingState` with `user` truthy and `profileLoading=true`, verify it returns `false` (confirms the function ignores profile loading — this is the current behavior we need to work around)

**Expected Counterexamples**:
- `queryClient.getQueryCache().getAll()` returns non-empty after `signOut` completes
- `mobileActions` is `undefined` when `isAdmin === true`
- `resolveAuthLoadingState({ sessionLoading: false, user: {...}, profileLoading: true })` returns `false` while profile is null

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  IF input.action == 'signOut' THEN
    result := signOut_fixed(input.context)
    ASSERT queryClient.getQueryCache().getAll().length == 0
    ASSERT logoutApiCalledBeforeCacheClear()
  END IF

  IF input.action == 'mobileRender' THEN
    rendered := renderAppLayout_fixed(input.context)
    ASSERT rendered.mobileActions CONTAINS logoutButton
  END IF

  IF input.action == 'dashboardRender' THEN
    state := useSessionListener_fixed()
    ASSERT state.profileLoading == true WHEN profile query is in-flight
  END IF
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT signIn_original(input) == signIn_fixed(input)
  ASSERT studentMobileHeader_original(input) == studentMobileHeader_fixed(input)
  ASSERT resolveAuthLoadingState_original(input) == resolveAuthLoadingState_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (random user roles, random query cache states, random loading states)
- It catches edge cases that manual unit tests might miss (e.g., sign-out during token refresh)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for sign-in cache seeding, student mobile rendering, and non-admin loading states, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Sign-In Cache Seeding Preservation**: Verify that `signIn` still atomically seeds `['auth', 'session']` and `['user-profile', userId]` after the fix
2. **Student Mobile Header Preservation**: Verify that student users on mobile still see profile settings, notification bell, and logout button
3. **Route Loading Preservation**: Verify that `resolveAuthLoadingState` still returns `false` when `user` is truthy (route rendering is not blocked)
4. **Best-Effort Logout Preservation**: Verify that when the logout API fails, local state is still cleared and redirect occurs

### Unit Tests

- Test `signOut` calls `queryClient.clear()` after logout API POST
- Test `signOut` clears cache even when logout API throws
- Test `signOut` sequence: CSRF clear → API POST → `queryClient.clear()` → secure storage clear → event dispatch → redirect
- Test `mobileActions` renders logout button for admin users on mobile
- Test `mobileActions` renders full action set (profile, notifications, logout) for student users on mobile
- Test `profileLoading` is exposed from `useSessionListener` return value
- Test admin dashboard diagnostics show "loading..." when `profileLoading` is true

### Property-Based Tests

- Generate random `{ role, isMobile, isStudentRoute }` tuples and verify that mobile header always includes a logout button for authenticated users on mobile (fast-check)
- Generate random query cache states (with 1-10 random query keys), run `signOut`, verify cache is empty afterward (fast-check)
- Generate random `{ sessionLoading, user, profileLoading }` states and verify `resolveAuthLoadingState` matches expected behavior for route guards (fast-check)
- Generate random sign-in responses and verify cache seeding preserves auth and profile data (fast-check)

### Integration Tests

- Test full sign-out → sign-in flow with two different users, verify zero data leakage
- Test admin mobile navigation end-to-end: render admin layout on mobile viewport, verify logout button is accessible and functional
- Test admin dashboard render with delayed profile query, verify diagnostics transition from "loading..." to "yes"

### API Endpoint Tests

- Test `POST /api/auth?action=logout` returns success and clears cookies
- Test `POST /api/auth?action=login` returns user and profile in response envelope
- Test `GET /api/auth?action=session` returns current session after login
- Run `bun run scripts/bundle-api.mjs` after any `api-src/` changes to ensure bundled output is current
