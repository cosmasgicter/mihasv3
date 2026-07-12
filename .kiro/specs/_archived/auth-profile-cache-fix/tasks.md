# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Cache Isolation & Auth State Bugs
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the three bugs exist
  - **Scoped PBT Approach**: Scope properties to concrete failing cases for reproducibility
  - Test file: `tests/property/auth-profile-cache-fix-exploration.test.ts`
  - Use fast-check with `numRuns: 10` per project convention
  - **Bug 1 (Stale Cache)**: Create a `QueryClient`, seed it with random query keys (1-10 entries using `fc.array(fc.string())`), call the current `signOut` logic, assert `queryClient.getQueryCache().getAll().length === 0` — from `isBugCondition` where `signOutClearsCache_withoutFullClear` returns true
  - **Bug 2 (Admin Mobile Logout)**: Generate `{ isAdmin: true, isMobile: true, isStudentRoute: false }`, evaluate the `mobileActions` condition `!isAdmin && isStudentRoute`, assert result is truthy — from `isBugCondition` where `mobileActionsIsUndefined` returns true
  - **Bug 3 (Profile Loading)**: Generate `{ user: { id: fc.uuid() }, profileLoading: true, sessionLoading: false }`, call `resolveAuthLoadingState`, assert that `profileLoading` is exposed in the hook return — from `isBugCondition` where `resolveAuthLoadingState returns false` while profile is null
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bugs exist)
  - Document counterexamples found:
    - `queryClient.getQueryCache().getAll()` returns non-empty after `signOut` completes
    - `mobileActions` is `undefined` when `isAdmin === true`
    - `resolveAuthLoadingState({ sessionLoading: false, user: {...}, profileLoading: true })` returns `false` while profile is null
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Sign-In Seeding, Student Mobile Header, Route Loading
  - **IMPORTANT**: Follow observation-first methodology
  - Test file: `tests/property/auth-profile-cache-fix-preservation.test.ts`
  - Use fast-check with `numRuns: 10` per project convention
  - **Preservation P4 (Sign-In Cache Seeding)**: Observe on unfixed code that `signIn` seeds `['auth', 'session']` and `['user-profile', userId]` atomically from login response. Write property: for all valid login responses (`fc.record({ user: arbUser, profile: arbProfile })`), after `signIn`, `queryClient.getQueryData(['auth', 'session'])` equals `{ user }` and `queryClient.getQueryData(['user-profile', userId])` equals `profile` — from Preservation Requirements Req 3.1, 3.6
  - **Preservation P5 (Student Mobile Header)**: Observe on unfixed code that student users on mobile get `mobileActions !== undefined`. Write property: for all `{ isAdmin: false, isStudentRoute: true, isMobile: true }`, the condition `!isAdmin && isStudentRoute` evaluates to `true` — from Preservation Requirements Req 3.3
  - **Preservation P6 (Route Loading State)**: Observe on unfixed code that `resolveAuthLoadingState` returns `false` when `user` is truthy. Write property: for all `{ user: arbUser, sessionLoading: false, profileLoading: fc.boolean() }`, `resolveAuthLoadingState` returns `false` — from Preservation Requirements Req 3.2
  - **Preservation P6b (Best-Effort Logout)**: Observe on unfixed code that when logout API throws, local state is still cleared. Write property: for all error types (`fc.oneof(fc.constant(new Error('Network error')), fc.constant(new TypeError('fetch failed')))`), `signOut` still dispatches `authSignedOut` event and `mihas:auth-redirect` event — from Preservation Requirements Req 3.4
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 3. Fix for auth profile cache, admin mobile logout, and profile loading state

  - [x] 3.1 Restructure `signOut` in `useSessionListener.ts` for cache isolation
    - Move logout API POST to execute FIRST (before cache clearing), wrapped in try/finally
    - Replace granular cache clearing (`setQueryData`, `removeQueries`, `invalidateQueries`) with `queryClient.clear()` in the finally block
    - Keep `clearCsrfToken()` before the API call (local-only operation)
    - Keep `secureStorage.clearSession()` after cache clearing
    - Keep event dispatches (`authSignedOut`, `mihas:auth-redirect`) after all cleanup
    - _Bug_Condition: isBugCondition(input) where input.action == 'signOut' AND signOutClearsCache_withoutFullClear returns true_
    - _Expected_Behavior: queryClient.getQueryCache().getAll().length == 0 after signOut completes_
    - _Preservation: Best-effort server logout — cache clears even when API POST fails (Req 3.4)_
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.4_

  - [x] 3.2 Expose `profileLoading` from `useSessionListener` hook
    - Add `profileLoading` to the return object of `useSessionListener()`
    - Do NOT change `resolveAuthLoadingState` — its route-guard behavior is correct
    - _Bug_Condition: isBugCondition(input) where input.action == 'dashboardRender' AND profileLoading == true AND profile == null_
    - _Expected_Behavior: state.profileLoading == true when profile query is in-flight_
    - _Preservation: resolveAuthLoadingState continues to return false when user is truthy (Req 3.2)_
    - _Requirements: 1.4, 2.4_

  - [x] 3.3 Add `profileLoading` to `AuthContext.tsx`
    - Add `profileLoading: boolean` to `AuthContextType` interface
    - Include `auth.profileLoading` in the `useMemo` value object and dependency array
    - _Requirements: 2.4_

  - [x] 3.4 Extend `mobileActions` in `AppLayout.tsx` for admin users
    - Change condition from `!isAdmin && isStudentRoute` to include admin users
    - For admin users: render a logout button only (skip profile settings and notification bell which are student-specific)
    - For student users: keep existing full action set (profile, notifications, logout) unchanged
    - Ensure admin logout button uses the same `handleSignOut` flow and `isSigningOut` state
    - _Bug_Condition: isBugCondition(input) where input.action == 'mobileRender' AND isAdmin == true AND isMobile == true_
    - _Expected_Behavior: mobileActions CONTAINS logoutButton for admin users_
    - _Preservation: Student mobile header unchanged (Req 3.3)_
    - _Requirements: 1.3, 2.3, 3.3_

  - [x] 3.5 Update admin Dashboard diagnostics to use `profileLoading`
    - Import `profileLoading` from `useAuth()` context
    - Update "Profile loaded" diagnostic: show "loading..." when `profileLoading === true && profile === null`, "yes" when profile exists, "no" only when `profileLoading === false && profile === null`
    - _Requirements: 2.4_

  - [x] 3.6 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Cache Isolation & Auth State Bugs
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1: `bun run vitest run tests/property/auth-profile-cache-fix-exploration.test.ts`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.7 Verify preservation tests still pass
    - **Property 2: Preservation** - Sign-In Seeding, Student Mobile Header, Route Loading
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2: `bun run vitest run tests/property/auth-profile-cache-fix-preservation.test.ts`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite: `bun run vitest run tests/property/auth-profile-cache-fix-exploration.test.ts tests/property/auth-profile-cache-fix-preservation.test.ts`
  - Verify no regressions in existing tests: `bun run vitest run`
  - Run API bundler if any `api-src/` files were changed: `bun run scripts/bundle-api.mjs`
  - Ensure all tests pass, ask the user if questions arise.
