# Dashboard Auth Resilience Bugfix Design

## Overview

Three related resilience bugs on the admissions student dashboard cause user-visible errors and console noise when stale state collides with backend reality. Bug 1: the `deleteDraft` flow treats 404 responses from already-deleted applications as failures, showing error toasts. Bug 2: auth refresh failures produce console noise during the redirect cascade. Bug 3: the SSE client may fire additional HEAD probes after setting `authFailed = true` due to in-flight probe promises.

## Glossary

- **Bug_Condition (C)**: The set of conditions that trigger each bug — stale draft 404, auth refresh 401, or SSE post-authFailed probes
- **Property (P)**: The desired behavior — 404 treated as success, clean auth redirect, no probes after authFailed
- **Preservation**: Existing behavior that must remain unchanged — successful deletes, successful auth refresh, normal SSE reconnection
- **`deleteDraft`**: Method in `ApplicationSessionManager` (`lib/applicationSession.ts`) that deletes all draft applications via `Promise.allSettled`
- **`applicationService.delete`**: Service method (`services/applications.ts`) that calls `DELETE /api/v1/applications/{id}/`
- **`ApiClient.executeRequest`**: Core request method (`services/client.ts`) that enhances errors via `ApiErrorHandler.enhanceError` before throwing
- **`probeEndpointForAuth`**: HEAD request in `sseClient.ts` used to detect 401/403 when EventSource.onerror fires
- **`authFailed`**: Boolean flag in SSE client that stops reconnection when auth failure is detected

## Bug Details

### Bug Condition

The bugs manifest across three related scenarios where stale client state meets backend rejection:

1. **DELETE 404**: `deleteDraft` calls `applicationService.delete` for each draft ID. When the backend returns 404, `ApiClient.executeRequest` runs the error through `ApiErrorHandler.enhanceError` which rewrites the error object. The `applicationService.delete` catch checks `error.status === 404`, but the enhanced error may not preserve the raw `.status` property. Even if the service-level catch works, `deleteDraft` uses `Promise.allSettled` and counts any `rejected` result as a failure without distinguishing 404 from real errors.

2. **Auth refresh 401**: When `/api/v1/auth/refresh/` returns 401 (blacklisted JTI), the `performRefresh` method returns `false`, triggering `onAuthFailure`. The cascade works correctly, but `logger.warn` calls in the 401 intercept path and any downstream SSE probe failures produce console output visible in production monitoring.

3. **SSE authFailed race**: After `authFailed = true` is set in the probe callback, the `connect()` method correctly checks the flag. However, if `onerror` fires while a previous `probeEndpointForAuth()` promise is still in flight, a second probe may be dispatched before the first probe's callback sets `authFailed`. The cooldown mitigates this but doesn't eliminate it if the first probe takes longer than expected.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { scenario: 'delete_404' | 'auth_refresh_401' | 'sse_auth_probe' }
  OUTPUT: boolean

  IF input.scenario == 'delete_404' THEN
    RETURN apiResponse.status == 404
           AND applicationId WAS previously valid
           AND deleteDraft counts this as a failure
  ELSE IF input.scenario == 'auth_refresh_401' THEN
    RETURN refreshResponse.status == 401
           AND console output is produced during redirect cascade
  ELSE IF input.scenario == 'sse_auth_probe' THEN
    RETURN authFailed == true
           AND (probeEndpointForAuth is called OR connect() schedules network requests)
  END IF
END FUNCTION
```

### Examples

- Student clicks "Clear All Drafts", one draft was already deleted server-side → 404 from DELETE → error toast shown despite successful outcome
- Student's refresh token JTI is blacklisted from a previous session → 401 on refresh → `logger.warn` lines appear in production console before redirect
- SSE `onerror` fires twice in quick succession → first probe detects 401 and sets `authFailed` → second probe was already dispatched and fires a redundant HEAD request

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Successful draft deletions (200 responses) must continue to work, clear localStorage, show success toast
- Non-404 errors (500, 403, network failure) on draft delete must continue to be treated as genuine failures
- Successful auth refresh (200 with rotated tokens) must continue to retry the original request transparently
- SSE reconnection on non-auth errors (network timeout, QUIC failure) must continue to use exponential backoff
- SSE `retriesExhausted` state from rapid failures must continue to prevent reconnection
- Dashboard "Continue Application" card and draft auto-save must remain intact
- `mihas:post-auth-redirect` sessionStorage entry must be preserved during auth cascade redirect

**Scope:**
All inputs that do NOT involve (a) 404 on draft DELETE, (b) 401 on auth refresh, or (c) SSE probes after authFailed should be completely unaffected by this fix.

## Hypothesized Root Cause

Based on code analysis:

1. **DELETE 404 — Error enhancement strips status**: `ApiClient.executeRequest` passes 4xx errors through `ApiErrorHandler.enhanceError` which creates a new `Error` object. The `applicationService.delete` catch checks `'status' in error && error.status === 404`, but the enhanced error may not carry the `.status` property. Even if the service catch works, `deleteDraft` in `applicationSession.ts` uses `Promise.allSettled` and treats all `rejected` results as failures — it never checks whether the rejection reason was a 404.

2. **Auth refresh 401 — Console noise from logger.warn**: The `logger.warn('[API Client] 401 Unauthorized - attempting token refresh')` call in `executeRequest` fires before the refresh attempt. When refresh fails, the `onAuthFailure` cascade is correct, but the warn-level log is visible in production. Additionally, any SSE probes that fire during the redirect window produce network errors in the console.

3. **SSE authFailed race — Probe dispatched before flag check**: In `onerror`, the code calls `probeEndpointForAuth()` which is async. If a second `onerror` fires while the first probe is in flight, the second call passes the cooldown check (10s hasn't elapsed since the first probe started) — actually the cooldown should block it. The real issue is that `connect()` is called from `scheduleReconnect` via `setTimeout`, and the `authFailed` check at the top of `connect()` should catch it. The actual gap is: after `authFailed` is set, if `scheduleReconnect` was already called and a `setTimeout` is pending, that timeout will call `connect()` which will check `authFailed` and return. This is already handled. The remaining concern is the probe cooldown not being tight enough — if the page stays mounted for >10s after auth failure, a new `onerror` from a stale EventSource could trigger another probe.

## Correctness Properties

Property 1: Bug Condition — DELETE 404 Treated as Success

_For any_ draft deletion where `applicationService.delete` receives a 404 response, the `deleteDraft` method SHALL treat that deletion as successful (not count it as a failed delete), clear the stale localStorage reference for that application ID, and return `{ success: true }` when all deletions are either 200 or 404.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation — Non-404 Errors Remain Failures

_For any_ draft deletion where `applicationService.delete` receives a non-404 error (500, 403, network failure), the `deleteDraft` method SHALL continue to count it as a failed delete and return `{ success: false }` with an appropriate error message.

**Validates: Requirements 3.1, 3.2**

Property 3: Bug Condition — Auth Refresh 401 Clean Redirect

_For any_ auth refresh attempt where `/api/v1/auth/refresh/` returns 401, the auth cascade SHALL redirect to sign-in, clear caches, and dispatch `mihas:auth-expired` without producing `console.error` or `console.warn` output that would appear in production monitoring.

**Validates: Requirements 2.4**

Property 4: Preservation — Successful Auth Refresh Unchanged

_For any_ auth refresh attempt where `/api/v1/auth/refresh/` returns 200 with rotated tokens, the system SHALL continue to retry the original failed request with new credentials and complete the operation transparently.

**Validates: Requirements 3.3**

Property 5: Bug Condition — SSE No Probes After authFailed

_For any_ state where `authFailed === true`, the SSE client's `connect()` method SHALL return immediately without scheduling any network requests, and `probeEndpointForAuth()` SHALL not be called.

**Validates: Requirements 2.5**

Property 6: Preservation — SSE Non-Auth Reconnection Unchanged

_For any_ SSE connection error that is NOT an auth failure (network timeout, QUIC failure), the SSE client SHALL continue to apply exponential backoff reconnection and rapid-failure detection leading to polling fallback.

**Validates: Requirements 3.4, 3.5**

## Fix Implementation

### Changes Required


**File**: `apps/admissions/src/services/applications.ts`
**Function**: `applicationService.delete`

**Specific Changes**:
1. **Harden 404 detection**: The existing catch already checks for `.status === 404`, but verify that `ApiErrorHandler.enhanceError` preserves the `.status` property on the thrown error. If not, check the error message for 404 indicators as a fallback. Alternatively, intercept the 404 before `enhanceError` runs.

**File**: `apps/admissions/src/lib/applicationSession.ts`
**Function**: `ApplicationSessionManager.deleteDraft`

**Specific Changes**:
2. **Treat 404 rejections as successes in allSettled**: After `Promise.allSettled`, filter `failedDeletes` to exclude rejections where the reason has `.status === 404` or where the error indicates a not-found condition. Only count genuinely failed deletes.
3. **Clear stale references per-ID**: After the delete loop, call `clearStaleApplicationDraftReference(id)` for each draft ID that was attempted (whether 200 or 404), not just on overall success.
4. **Clear localStorage even on partial success**: Move `this.clearAllLocalStorage()` to run after the delete loop regardless of individual 404s, since the goal (removal) is achieved.

**File**: `apps/admissions/src/services/client.ts`
**Function**: `ApiClient.performRefresh`

**Specific Changes**:
5. **Suppress console noise on expected 401**: The `performRefresh` method already catches errors silently. The `logger.warn` in the 401 intercept path of `executeRequest` is appropriate for debugging but should use `console.debug` level for the refresh-failure path to reduce production noise.

**File**: `apps/admissions/src/lib/sseClient.ts`
**Function**: `createSSEClient` (internal `onerror` handler)

**Specific Changes**:
6. **Guard probe dispatch with authFailed check**: Before calling `probeEndpointForAuth()` in the `onerror` handler, check `if (authFailed) return` to prevent any probe dispatch after auth failure is detected.
7. **Clear pending reconnect timeout on authFailed**: When `authFailed` is set to `true` in the probe callback, also call `clearReconnectTimeout()` (already done) — verify this is sufficient to prevent any scheduled `connect()` from firing.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix.

**Test Plan**: Write unit tests that mock API responses to return 404 for draft deletions, 401 for auth refresh, and simulate SSE onerror sequences. Run on unfixed code to observe failures.

**Test Cases**:
1. **DELETE 404 Test**: Mock `applicationService.delete` to throw with `.status = 404` for one draft ID → `deleteDraft` returns `{ success: false }` (will fail on unfixed code)
2. **Mixed 200/404 Test**: Mock two deletes, one 200 and one 404 → `deleteDraft` returns `{ success: false }` (will fail on unfixed code)
3. **SSE authFailed Probe Test**: Set `authFailed = true`, trigger `onerror` → probe is still dispatched (will fail on unfixed code)

**Expected Counterexamples**:
- `deleteDraft` returns `{ success: false }` when all resources are actually gone (mix of 200 and 404)
- SSE client dispatches HEAD probe after `authFailed` is set

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed functions produce the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  IF input.scenario == 'delete_404' THEN
    result := deleteDraft_fixed(input.userId)
    ASSERT result.success == true
    ASSERT localStorage does not contain stale applicationId
  ELSE IF input.scenario == 'auth_refresh_401' THEN
    result := executeRequest_fixed(input.endpoint, input.options)
    ASSERT no console.error or console.warn produced
    ASSERT auth-expired event dispatched
  ELSE IF input.scenario == 'sse_auth_probe' THEN
    ASSERT probeEndpointForAuth NOT called
    ASSERT no network requests scheduled
  END IF
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed functions produce the same result as the original functions.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT deleteDraft_original(input) == deleteDraft_fixed(input)
  ASSERT executeRequest_original(input) == executeRequest_fixed(input)
  ASSERT sseClient_original(input) == sseClient_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing with fast-check is recommended for the DELETE 404 scenario because:
- It can generate many combinations of 200/404/500 responses across multiple draft IDs
- It catches edge cases like all-404, single-404-among-many, and mixed error codes
- It provides strong guarantees that non-404 errors still fail correctly

**Test Cases**:
1. **Successful Delete Preservation**: Verify that all-200 responses continue to return `{ success: true }` and clear localStorage
2. **Real Error Preservation**: Verify that 500/403/network errors continue to return `{ success: false }`
3. **Auth Refresh Success Preservation**: Verify that successful refresh still retries the original request
4. **SSE Non-Auth Reconnection Preservation**: Verify that network errors still trigger exponential backoff

### Unit Tests

- Test `applicationService.delete` with 404 response returns `{ success: true }`
- Test `deleteDraft` with mixed 200/404 responses returns `{ success: true }`
- Test `deleteDraft` with 500 response returns `{ success: false }`
- Test `deleteDraft` calls `clearStaleApplicationDraftReference` for each draft ID
- Test SSE `connect()` returns immediately when `authFailed === true`
- Test SSE `onerror` handler does not call `probeEndpointForAuth` when `authFailed === true`

### Property-Based Tests

- Generate random arrays of draft IDs with random response codes (200, 404, 500, 403) and verify: success iff all responses are 200 or 404
- Generate random SSE error sequences and verify: no probes after authFailed is set
- Generate random auth refresh outcomes and verify: successful refresh retries original request, failed refresh triggers clean redirect

### Integration Tests

- Test full "Clear All Drafts" flow with mocked API returning mix of 200/404 → success toast shown
- Test auth cascade from 401 → refresh failure → redirect without console errors
- Test SSE connection → auth failure → no further network activity
