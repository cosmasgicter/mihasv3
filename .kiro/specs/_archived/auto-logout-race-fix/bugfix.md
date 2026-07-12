# Bugfix Requirements Document

## Introduction

When a logged-in user reloads the student dashboard page, they are unexpectedly logged out. The root cause is a race condition between two independent token refresh attempts that occur during page reload. The first refresh succeeds and blacklists the old refresh token's JTI in Redis. The second refresh (triggered by `useSessionListener`) sends the same old refresh token before the browser has applied the new `Set-Cookie`, causing the backend to reject it as already-blacklisted. This triggers the auth failure cascade and logs the user out.

The bug affects any authenticated page reload when the access token has expired (30-minute lifetime), but is most commonly observed on the student dashboard because `applicationSessionManager.resolveDraftApplicationId()` fires an API call before the session is validated.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the page reloads and the access token has expired AND an early API call (e.g., `GET /api/v1/applications/?mine=true&status=draft&pageSize=1`) fires before session validation THEN the API client's 401 interceptor triggers a token refresh that succeeds, blacklisting the old refresh token's JTI in Redis

1.2 WHEN the first refresh from 1.1 completes and clears `refreshPromise = null` AND `useSessionListener` subsequently calls `authService.refresh()` THEN `attemptRefresh()` starts a new refresh request instead of reusing the result of the first refresh

1.3 WHEN the second refresh request sends the old refresh token cookie (because the browser has not yet applied the `Set-Cookie` from the first refresh response) THEN the backend rejects it with 401 `TOKEN_EXPIRED` because the old JTI is already blacklisted in Redis

1.4 WHEN the second refresh fails with 401 THEN the frontend triggers the auth failure cascade (`onAuthFailure` callback), clears all caches, and redirects the user to the sign-in page

### Expected Behavior (Correct)

2.1 WHEN the page reloads and the access token has expired AND multiple components independently trigger token refresh attempts THEN only one actual refresh request SHALL be sent to the backend, and all callers SHALL receive the result of that single refresh

2.2 WHEN a token refresh has recently succeeded (within a short cooldown window) AND another component requests a refresh THEN the system SHALL return the cached success result instead of initiating a new refresh request to the backend

2.3 WHEN `useSessionListener` performs its initial session check on page reload THEN it SHALL reuse the same refresh deduplication mechanism as the API client's 401 interceptor, preventing a second refresh from racing with the first

2.4 WHEN the page reloads with an expired access token THEN the user SHALL remain logged in after the session is re-validated, without being redirected to the sign-in page

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the access token is valid (not expired) and the user reloads the page THEN the system SHALL CONTINUE TO validate the session without triggering any token refresh

3.2 WHEN a genuine authentication failure occurs (e.g., refresh token is truly expired after 7 days, or user is deactivated) THEN the system SHALL CONTINUE TO trigger the auth failure cascade and redirect to sign-in

3.3 WHEN a single 401 response occurs during normal API usage (not during page reload race) THEN the system SHALL CONTINUE TO attempt exactly one token refresh and retry the failed request

3.4 WHEN the user explicitly signs out THEN the system SHALL CONTINUE TO clear all auth state, blacklist the refresh token, and redirect to sign-in

3.5 WHEN the refresh token cookie is genuinely missing (not just a race condition) THEN the backend SHALL CONTINUE TO return `NO_REFRESH_TOKEN` error code and the frontend SHALL CONTINUE TO handle it as an auth failure

3.6 WHEN a tab regains focus after being hidden THEN the system SHALL CONTINUE TO re-validate the session via `AuthContext` visibility change handling

---

## Bug Condition

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type PageReloadState
  OUTPUT: boolean

  // The bug triggers when ALL of the following are true:
  // 1. The page is reloading (not initial visit)
  // 2. The access token has expired
  // 3. An early API call fires before session validation completes
  // 4. The first refresh succeeds and clears the promise lock
  // 5. useSessionListener triggers a second refresh before the new cookie is applied
  RETURN X.isPageReload
     AND X.accessTokenExpired
     AND X.earlyApiCallFiredBeforeSessionCheck
     AND X.refreshPromiseClearedBeforeSecondAttempt
END FUNCTION
```

## Property Specification

```pascal
// Property: Fix Checking — No spurious logout on page reload
FOR ALL X WHERE isBugCondition(X) DO
  result ← reloadPage'(X)
  ASSERT result.userRemainsAuthenticated = true
     AND result.refreshRequestCount <= 1
     AND result.noAuthFailureCascade = true
END FOR
```

## Preservation Goal

```pascal
// Property: Preservation Checking — Existing auth behavior unchanged
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT reloadPage(X) = reloadPage'(X)
END FOR
```

This ensures that for all non-buggy inputs (valid tokens, genuine auth failures, explicit sign-outs, normal 401 recovery), the fixed code behaves identically to the original.
