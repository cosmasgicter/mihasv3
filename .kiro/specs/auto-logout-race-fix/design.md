# Auto-Logout Race Condition Bugfix Design

## Overview

During page reload with an expired access token, two independent code paths race to refresh the token: the API client's 401 interceptor (triggered by an early `resolveDraftApplicationId()` call) and `useSessionListener`'s session recovery logic. The first refresh succeeds and blacklists the old refresh token's JTI in Redis. The second refresh fires with the same old cookie (browser hasn't applied `Set-Cookie` yet), hits the blacklisted JTI, gets 401, and triggers the auth failure cascade — logging the user out.

The fix adds a **refresh cooldown** to `ApiClient.attemptRefresh()`. After a successful refresh, the result and a timestamp are cached. Subsequent calls within the cooldown window return the cached success immediately, preventing the second refresh from ever reaching the backend with a stale token.

## Glossary

- **Bug_Condition (C)**: Page reload with expired access token where two independent refresh attempts race — the first succeeds and blacklists the old JTI, the second sends the same (now-blacklisted) token before the browser applies the new `Set-Cookie`
- **Property (P)**: After a successful refresh, subsequent refresh calls within the cooldown window return the cached success without making a new network request
- **Preservation**: All existing auth behaviors (single 401 recovery, genuine auth failure logout, explicit sign-out, tab refocus revalidation) remain unchanged
- **`attemptRefresh()`**: Method in `apps/admissions/src/services/client.ts` that deduplicates concurrent refresh calls via a promise lock (`refreshPromise`)
- **`performRefresh()`**: Method in `apps/admissions/src/services/client.ts` that makes the actual `POST /api/v1/auth/refresh/` request
- **`refreshAuthSession()`**: Public entrypoint on `ApiClient` used by `authService.refresh()` — delegates to `attemptRefresh()`
- **JTI blacklist**: Redis-backed set in `backend/apps/accounts/tokens.py` where `rotate_tokens()` stores old refresh token JTIs; `is_jti_blacklisted()` is fail-closed on Redis errors
- **Cooldown window**: Time period (e.g., 5 seconds) after a successful refresh during which subsequent refresh calls return the cached result

## Bug Details

### Bug Condition

The bug manifests when a page reloads with an expired access token and an early API call (e.g., `applicationService.list()` from `resolveDraftApplicationId()`) fires before `useSessionListener` completes its session check. The API client's 401 interceptor calls `attemptRefresh()`, which succeeds and clears `refreshPromise = null` in its `finally` block. Then `useSessionListener`'s `queryFn` calls `authService.refresh()` → `apiClient.refreshAuthSession()` → `attemptRefresh()`, which sees `refreshPromise === null` and starts a **new** refresh request. This second request sends the old refresh token cookie (browser hasn't applied the `Set-Cookie` from the first response), which the backend rejects because the old JTI is already blacklisted.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type RefreshAttemptState
  OUTPUT: boolean

  RETURN input.previousRefreshSucceededWithinCooldownWindow
     AND input.refreshPromise === null
     AND input.browserHasNotAppliedNewCookie
     AND input.callerIsIndependentCodePath
END FUNCTION
```

### Examples

- **Dashboard reload with expired token**: User reloads `/student/dashboard`. `resolveDraftApplicationId()` fires `GET /api/v1/applications/?mine=true&status=draft&pageSize=1` → 401 → `attemptRefresh()` succeeds → `refreshPromise` clears → `useSessionListener` calls `authService.refresh()` → new `attemptRefresh()` sends old cookie → 401 → `onAuthFailure()` → logout. **Expected**: User stays logged in.
- **Any authenticated page reload after 30 min idle**: Access token (30-min lifetime) has expired. Any early API call triggers the same race. **Expected**: Single refresh, user stays authenticated.
- **Rapid concurrent callers**: Three components all call `refreshAuthSession()` within 100ms of each other after a successful refresh. **Expected**: Only one network request; all three get `true`.
- **Genuine token expiry (7 days)**: Refresh token itself is expired. `performRefresh()` returns `false`. No cooldown caching of failures. **Expected**: Auth failure cascade fires correctly.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- The 401 interceptor in `executeRequest()` must continue to catch 401 responses, call `attemptRefresh()`, and retry the original request on success
- The promise-lock deduplication (`refreshPromise`) for truly concurrent in-flight requests must continue to work
- `onAuthFailure()` must still fire when refresh genuinely fails (expired refresh token, deactivated user, Redis fail-closed)
- Explicit sign-out via `authService.logout()` must continue to clear all state and redirect
- Tab refocus session revalidation via `AuthContext` visibility change handler must continue to work
- `authService.refresh()` calling `apiClient.refreshAuthSession()` must remain the single refresh path

**Scope:**
All inputs that do NOT involve a second refresh attempt within the cooldown window of a successful refresh should be completely unaffected by this fix. This includes:
- Normal API requests with valid access tokens
- Single 401 recovery (one refresh + retry)
- Genuine auth failures (expired refresh token, blacklisted JTI from a previous session)
- Explicit sign-out
- Tab refocus revalidation after the cooldown has elapsed

## Hypothesized Root Cause

Based on the bug analysis, the root cause is a **temporal gap** in the refresh deduplication:

1. **Promise-lock clears too eagerly**: `attemptRefresh()` sets `refreshPromise = null` in its `finally` block as soon as the refresh completes. This is correct for deduplicating truly concurrent requests, but it creates a window where a slightly-delayed caller (like `useSessionListener`) starts a brand new refresh.

2. **Cookie propagation delay**: The browser receives the `Set-Cookie` header from the first refresh response but may not have applied it to the cookie jar by the time the second `fetch()` fires. This means the second request sends the **old** refresh token cookie.

3. **Backend JTI blacklist is immediate**: `rotate_tokens()` calls `blacklist_jti()` synchronously during the first refresh. The old JTI is blacklisted in Redis before the second request arrives. `is_jti_blacklisted()` is fail-closed, so even Redis latency won't help.

4. **Two independent refresh triggers**: The API client's 401 interceptor and `useSessionListener`'s session recovery are independent code paths that both call `attemptRefresh()` but can't coordinate timing beyond the promise lock.

The fix targets root cause #1: extend the deduplication window beyond the promise lock by caching the success result for a short cooldown period.

## Correctness Properties

Property 1: Bug Condition - Refresh Cooldown Prevents Duplicate Requests

_For any_ call to `attemptRefresh()` that occurs within the cooldown window (e.g., 5 seconds) after a previous successful refresh, the method SHALL return `true` immediately from the cached result without calling `performRefresh()` or making any network request.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Non-Cooldown Refresh Behavior Unchanged

_For any_ call to `attemptRefresh()` that occurs outside the cooldown window (more than N seconds after the last successful refresh, or when no previous refresh has succeeded), the method SHALL behave identically to the original implementation: call `performRefresh()`, use the promise lock for concurrent deduplication, and return the actual result.

**Validates: Requirements 3.1, 3.2, 3.3, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `apps/admissions/src/services/client.ts`

**Class**: `ApiClient`

**Specific Changes**:

1. **Add cooldown state fields**: Add two private fields to `ApiClient`:
   - `private lastRefreshSuccessTime: number = 0` — timestamp of last successful refresh
   - `private lastRefreshResult: boolean = false` — cached result of last refresh
   - `private static readonly REFRESH_COOLDOWN_MS = 5000` — cooldown window (5 seconds)

2. **Modify `attemptRefresh()` to check cooldown**: Before checking `refreshPromise`, check if a refresh succeeded within the cooldown window. If so, return `true` immediately:
   ```typescript
   private async attemptRefresh(): Promise<boolean> {
     // Cooldown: if a refresh succeeded recently, return cached success
     const now = Date.now();
     if (this.lastRefreshResult && (now - this.lastRefreshSuccessTime) < ApiClient.REFRESH_COOLDOWN_MS) {
       return true;
     }

     if (this.refreshPromise) return this.refreshPromise;
     this.refreshPromise = this.performRefresh();
     try {
       const result = await this.refreshPromise;
       if (result) {
         this.lastRefreshSuccessTime = Date.now();
         this.lastRefreshResult = true;
       }
       return result;
     } finally {
       this.refreshPromise = null;
     }
   }
   ```

3. **Do NOT cache failures**: Only cache successful refreshes. Failed refreshes should not set the cooldown, ensuring genuine auth failures are never masked.

4. **No changes to `performRefresh()`**: The actual refresh logic remains untouched.

5. **No changes to `useSessionListener`**: The hook already calls `authService.refresh()` → `apiClient.refreshAuthSession()` → `attemptRefresh()`, so it automatically benefits from the cooldown.

6. **No backend changes**: The backend token rotation, JTI blacklisting, and `RefreshView` remain unchanged.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that simulate the race condition by calling `attemptRefresh()` twice in sequence (not concurrently) with a mocked `performRefresh()` that succeeds on the first call and fails on the second (simulating the blacklisted JTI). Run these tests on the UNFIXED code to observe that the second call makes a new network request and fails.

**Test Cases**:
1. **Sequential Double Refresh**: Call `attemptRefresh()`, await it, then call `attemptRefresh()` again immediately. Assert that `performRefresh()` is called twice on unfixed code (will fail — demonstrates the bug)
2. **Race with Promise Lock Clear**: Call `attemptRefresh()`, await it (promise lock clears), then call `attemptRefresh()` within 100ms. Assert the second call reuses the first result (will fail on unfixed code)
3. **Concurrent Callers After Lock Clear**: Start `attemptRefresh()`, await it, then start 3 concurrent `attemptRefresh()` calls. Assert only one additional `performRefresh()` call is made (will fail on unfixed code — all 3 will call performRefresh)

**Expected Counterexamples**:
- `performRefresh()` is called multiple times within a short window after the first success
- The second `performRefresh()` call returns `false` (simulating blacklisted JTI rejection)
- Possible cause confirmed: promise lock clears in `finally` block, allowing new refresh attempts immediately

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := attemptRefresh_fixed(input)
  ASSERT result === true
  ASSERT performRefresh.callCount === 1
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT attemptRefresh_original(input) = attemptRefresh_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (varying time deltas, success/failure combinations, concurrent caller counts)
- It catches edge cases like cooldown boundary conditions (exactly at 5000ms)
- It provides strong guarantees that behavior is unchanged for all non-cooldown scenarios

**Test Plan**: Observe behavior on UNFIXED code first for non-race scenarios (single refresh, failed refresh, concurrent in-flight refresh), then write property-based tests capturing that behavior.

**Test Cases**:
1. **Single 401 Recovery Preservation**: Verify that a single 401 → refresh → retry flow works identically before and after the fix
2. **Failed Refresh Preservation**: Verify that when `performRefresh()` returns `false`, the auth failure cascade fires identically
3. **Concurrent In-Flight Deduplication Preservation**: Verify that truly concurrent calls (while `refreshPromise` is non-null) still share the same promise
4. **Cooldown Expiry Preservation**: Verify that after the cooldown window elapses, a new refresh call makes a real network request

### Unit Tests

- Test that `attemptRefresh()` returns cached `true` when called within cooldown window after success
- Test that `attemptRefresh()` calls `performRefresh()` when called after cooldown window expires
- Test that failed refreshes do not set the cooldown (no caching of failures)
- Test that the promise lock still works for truly concurrent calls during a refresh
- Test that `refreshAuthSession()` delegates to `attemptRefresh()` and benefits from cooldown

### Property-Based Tests

- Generate random sequences of `attemptRefresh()` calls with varying time deltas (0ms to 10000ms) and verify: within cooldown → cached result, outside cooldown → new `performRefresh()` call
- Generate random success/failure sequences for `performRefresh()` and verify: only successes set the cooldown, failures never mask subsequent attempts
- Generate random concurrent caller counts (1-10) and verify: at most one `performRefresh()` call per cooldown window

### Integration Tests

- Test full page reload simulation: mock API client with 401 on first request, successful refresh, then `useSessionListener` calling `authService.refresh()` — verify user stays authenticated
- Test that `AuthContext`'s `onAuthFailure` callback is NOT invoked during the race condition scenario
- Test that `AuthContext`'s `onAuthFailure` callback IS invoked when refresh genuinely fails (outside cooldown)
