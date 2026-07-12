# Production CORS & Pagination Bugfix Design

## Overview

The production admissions frontend (`***REMOVED***`) is non-functional for authenticated users due to three interrelated bugs: (1) CORS rejects the `X-CSRF-Token` header because it is missing from `CORS_ALLOW_HEADERS` in `base.py`, (2) pagination sends `page=0` which Django's 1-based `PageNumberPagination` rejects with 404, and (3) SSE connections fail in a reconnect loop because the same CORS misconfiguration blocks cross-origin EventSource requests. Additionally, the `SameSite=Lax` cookie attribute prevents cookies from being sent on cross-origin credentialed requests from `apply.mihas.edu.zm` to `api.mihas.edu.zm`, causing 403s on session validation.

The fix is surgical: add `x-csrf-token` to `CORS_ALLOW_HEADERS`, change `AUTH_COOKIE_SAMESITE` to `None` in `prod.py`, and clamp all frontend page parameters to `>= 1`.

## Glossary

- **Bug_Condition (C)**: The set of conditions that trigger the bugs — cross-origin requests with `X-CSRF-Token` header being blocked, `page=0` being sent to a 1-based paginator, and `SameSite=Lax` cookies not being sent cross-origin
- **Property (P)**: The desired behavior — CORS preflight allows `x-csrf-token`, cookies are sent cross-origin, and page parameters are always >= 1
- **Preservation**: Existing behaviors that must remain unchanged — dev CORS permissiveness, standard header acceptance, valid page handling, credential cookie flow, SSE intentional disconnect behavior, and origin restriction enforcement
- **`CORS_ALLOW_HEADERS`**: The list in `backend/config/settings/base.py` (line ~204) that controls which request headers the browser is allowed to send cross-origin
- **`AUTH_COOKIE_SAMESITE`**: The cookie attribute in `backend/config/settings/prod.py` (line ~28) that controls whether cookies are sent on cross-site requests
- **`_set_auth_cookies`**: The function in `backend/apps/accounts/views.py` that sets `access_token` and `refresh_token` cookies using settings values
- **`buildQueryString`**: The function in `apps/admissions/src/services/client.ts` (line ~972) that serializes query parameters into a URL query string

## Bug Details

### Bug Condition

The bugs manifest across three vectors:

1. **CORS header rejection**: When the frontend sends any request with the `X-CSRF-Token` header from `apply.mihas.edu.zm` to `api.mihas.edu.zm`, the browser's preflight check fails because `x-csrf-token` is not in `CORS_ALLOW_HEADERS`. This blocks all state-changing authenticated requests and SSE connections.

2. **Cookie SameSite rejection**: When the browser attempts to send `access_token` and `refresh_token` cookies cross-origin (from `apply.mihas.edu.zm` to `api.mihas.edu.zm`), the `SameSite=Lax` attribute prevents cookies from being included on cross-origin requests that are not top-level navigations. This causes 403 on `/api/v1/auth/session/` even if CORS headers were correct.

3. **Zero-based pagination**: When `useStudentDashboardPolling`, `useStudentApplicationCount`, `useHasApplicationWithStatus`, or `applicationsData.useList` call `applicationService.list()` with `page: 0`, Django's `PageNumberPagination` returns 404 because it expects 1-based page numbers.

**Formal Specification:**
```
FUNCTION isBugCondition_CORS(input)
  INPUT: input of type HTTPRequest
  OUTPUT: boolean

  RETURN input.origin = "***REMOVED***"
     AND input.destination = "***REMOVED***"
     AND (input.headers CONTAINS "X-CSRF-Token" OR input.type = "EventSource")
     AND "x-csrf-token" NOT IN server.CORS_ALLOW_HEADERS
END FUNCTION

FUNCTION isBugCondition_Cookie(input)
  INPUT: input of type HTTPRequest
  OUTPUT: boolean

  RETURN input.origin ≠ input.destination
     AND input.credentials = "include"
     AND server.AUTH_COOKIE_SAMESITE = "Lax"
END FUNCTION

FUNCTION isBugCondition_Pagination(input)
  INPUT: input of type PaginationParams
  OUTPUT: boolean

  RETURN input.page = 0
END FUNCTION
```

### Examples

- **CORS**: Frontend sends `PUT /api/v1/notifications/read-all/` with `X-CSRF-Token: abc123` → browser blocks with "Request header field x-csrf-token is not allowed by Access-Control-Allow-Headers in preflight response"
- **Cookie**: Frontend sends `GET /api/v1/auth/session/` with `credentials: 'include'` → browser omits `access_token` cookie because `SameSite=Lax` blocks cross-origin credentialed requests → backend returns 403
- **Pagination**: `useStudentDashboardPolling` calls `applicationService.list({ page: 0, pageSize: 50 })` → backend returns 404 because `page=0` is invalid for Django's 1-based pagination
- **SSE**: `sseClient.ts` opens `EventSource` to `api.mihas.edu.zm` with `withCredentials: true` → CORS preflight fails → `[SSEClient] Scheduling reconnect in 1000ms` loops indefinitely
- **Edge case**: `applicationsData.useList` with no explicit page filter defaults to `filters.page || 0` → sends `page=0` → 404

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Development CORS must continue to allow all origins via `CORS_ALLOW_ALL_ORIGINS = True` in `dev.py`
- Standard headers (`Content-Type`, `Authorization`, `Accept`, etc.) must continue to be accepted via `default_headers`
- Valid page numbers (`page >= 1`) must continue to return correct paginated results
- `credentials: 'include'` must continue to send and receive HTTP-only auth cookies
- SSE intentional disconnects (page hidden, user logout) must not trigger reconnection
- Production CORS must continue to reject requests from origins not in `CORS_ALLOWED_ORIGINS` or matching `CORS_ALLOWED_ORIGIN_REGEXES`
- `buildQueryString` must continue to correctly serialize all non-page parameters (status, search, sortBy, etc.)
- `AUTH_COOKIE_HTTPONLY = True` must remain unchanged
- `AUTH_COOKIE_SECURE = True` must remain unchanged in production

**Scope:**
All inputs that do NOT involve the `X-CSRF-Token` header, cross-origin cookie delivery, or `page=0` should be completely unaffected by this fix. This includes:
- Requests with only standard CORS headers
- Same-origin requests (development)
- Requests with `page >= 1`
- Mouse/keyboard interactions unrelated to API calls

## Hypothesized Root Cause

Based on the bug description and code review, the confirmed root causes are:

1. **Missing `x-csrf-token` in `CORS_ALLOW_HEADERS`**: In `backend/config/settings/base.py` line ~204, `CORS_ALLOW_HEADERS` is constructed as `list(dict.fromkeys([*default_headers, "cache-control", "last-event-id"]))`. The `x-csrf-token` header is not included, even though the `CSRFEnforcementMiddleware` requires it on all state-changing requests and the login response sets it via `response["X-CSRF-Token"]`. The header is listed in `CORS_EXPOSE_HEADERS` (so the browser can read it from responses) but not in `CORS_ALLOW_HEADERS` (so the browser cannot send it in requests).

2. **`SameSite=Lax` blocks cross-origin cookies**: Both `base.py` and `prod.py` set `AUTH_COOKIE_SAMESITE = "Lax"`. When the frontend at `apply.mihas.edu.zm` makes `fetch()` calls with `credentials: 'include'` to `api.mihas.edu.zm`, the browser treats these as cross-site requests. `SameSite=Lax` only sends cookies on top-level navigations (GET requests triggered by link clicks), not on `fetch()` or `XMLHttpRequest` calls. The cookies need `SameSite=None; Secure` to be sent cross-origin.

3. **Zero-based page parameter**: Three call sites in `useStudentDashboardPolling.ts` pass `page: 0` to `applicationService.list()`, and `data/applications.ts` uses `filters.page || 0` which defaults to 0. Django's `PageNumberPagination` is 1-based and returns 404 for `page=0`.

4. **SSE failure is a symptom**: The SSE reconnect loop is caused by the same CORS misconfiguration (root cause 1). Once `x-csrf-token` is in `CORS_ALLOW_HEADERS` and cookies flow correctly, SSE connections from the allowed origin will succeed.

## Correctness Properties

Property 1: Bug Condition - CORS Allows X-CSRF-Token Header

_For any_ cross-origin request from an allowed origin that includes the `X-CSRF-Token` header, the server's CORS configuration SHALL include `x-csrf-token` in the `Access-Control-Allow-Headers` preflight response, allowing the browser to proceed with the actual request.

**Validates: Requirements 2.1, 2.2, 2.5**

Property 2: Bug Condition - Cookies Sent Cross-Origin

_For any_ cross-origin credentialed request from `apply.mihas.edu.zm` to `api.mihas.edu.zm`, the production cookie configuration SHALL use `SameSite=None` with `Secure=True`, allowing the browser to include `access_token` and `refresh_token` cookies in the request.

**Validates: Requirements 2.1, 2.2**

Property 3: Bug Condition - Page Parameter Always >= 1

_For any_ pagination request where the caller passes `page=0` or omits the page parameter, the frontend SHALL send `page=1` (or greater) to the backend, and the backend SHALL return a valid paginated response.

**Validates: Requirements 2.3, 2.4**

Property 4: Preservation - Non-CSRF Headers Unchanged

_For any_ request that uses only standard CORS headers (no `X-CSRF-Token`), the CORS configuration SHALL produce the same preflight response as the original configuration, preserving existing header acceptance behavior.

**Validates: Requirements 3.2, 3.4**

Property 5: Preservation - Valid Page Numbers Unchanged

_For any_ pagination request where `page >= 1`, the frontend SHALL send the exact same page value as before the fix, preserving correct pagination behavior.

**Validates: Requirements 3.3, 3.7**

Property 6: Preservation - Development CORS Unchanged

_For any_ request in the development environment, `CORS_ALLOW_ALL_ORIGINS = True` in `dev.py` SHALL continue to allow all origins, and the base `CORS_ALLOW_HEADERS` change SHALL not affect development behavior.

**Validates: Requirements 3.1**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `backend/config/settings/base.py`

**Setting**: `CORS_ALLOW_HEADERS` (line ~204)

**Specific Changes**:
1. **Add `x-csrf-token` to `CORS_ALLOW_HEADERS`**: Change the list construction to include `"x-csrf-token"` alongside `"cache-control"` and `"last-event-id"`. This allows the browser to send the `X-CSRF-Token` header in cross-origin requests.
   - Before: `list(dict.fromkeys([*default_headers, "cache-control", "last-event-id"]))`
   - After: `list(dict.fromkeys([*default_headers, "cache-control", "last-event-id", "x-csrf-token"]))`

**File**: `backend/config/settings/prod.py`

**Setting**: `AUTH_COOKIE_SAMESITE` (line ~28)

**Specific Changes**:
2. **Change `AUTH_COOKIE_SAMESITE` to `"None"` in prod.py**: Cross-origin credentialed requests require `SameSite=None; Secure` cookies. `Secure=True` is already set. Only `prod.py` needs this change because `dev.py` uses `AUTH_COOKIE_DOMAIN = None` (localhost) which is same-origin.
   - Before: `AUTH_COOKIE_SAMESITE = "Lax"`
   - After: `AUTH_COOKIE_SAMESITE = "None"`

**File**: `apps/admissions/src/hooks/useStudentDashboardPolling.ts`

**Function**: `useStudentDashboardPolling`, `useStudentApplicationCount`, `useHasApplicationWithStatus`

**Specific Changes**:
3. **Change `page: 0` to `page: 1`** in all three `applicationService.list()` calls within this file. There are 3 occurrences, all passing `page: 0`.

**File**: `apps/admissions/src/data/applications.ts`

**Function**: `applicationsData.useList`

**Specific Changes**:
4. **Change `filters.page || 0` to `Math.max(filters.page || 1, 1)`**: Ensure the page parameter defaults to 1 and is never less than 1. The `|| 0` fallback is the root cause of the zero-page default.

5. **Change error fallback `page: 0` to `page: 1`**: In the abort-signal catch block, the fallback response uses `page: 0` which should be `page: 1` for consistency.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that check the CORS configuration for `x-csrf-token` inclusion, verify cookie `SameSite` attributes, and assert pagination parameters. Run these tests on the UNFIXED code to observe failures.

**Test Cases**:
1. **CORS Header Test**: Assert `"x-csrf-token"` is in `settings.CORS_ALLOW_HEADERS` (will fail on unfixed code)
2. **Cookie SameSite Test**: Assert `settings.AUTH_COOKIE_SAMESITE == "None"` in production settings (will fail on unfixed code — currently `"Lax"`)
3. **Pagination Zero Test**: Call `applicationService.list({ page: 0 })` and assert the query string contains `page=1` (will fail on unfixed code — sends `page=0`)
4. **Pagination Default Test**: Call `applicationsData.useList({})` and assert page defaults to 1 (will fail on unfixed code — defaults to 0)

**Expected Counterexamples**:
- `"x-csrf-token"` is NOT in `CORS_ALLOW_HEADERS` → confirms root cause 1
- `AUTH_COOKIE_SAMESITE` is `"Lax"` not `"None"` → confirms root cause 2
- Query string contains `page=0` instead of `page=1` → confirms root cause 3

### Fix Checking

**Goal**: Verify that for all inputs where the bug conditions hold, the fixed code produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition_CORS(input) DO
  ASSERT "x-csrf-token" IN settings.CORS_ALLOW_HEADERS
END FOR

FOR ALL input WHERE isBugCondition_Cookie(input) DO
  ASSERT settings.AUTH_COOKIE_SAMESITE = "None"
  ASSERT settings.AUTH_COOKIE_SECURE = True
END FOR

FOR ALL input WHERE isBugCondition_Pagination(input) DO
  result := buildQueryString_fixed({ page: input.page, ...rest })
  ASSERT result CONTAINS "page=1" OR result CONTAINS "page=N" WHERE N >= 1
  ASSERT NOT result CONTAINS "page=0"
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug conditions do NOT hold, the fixed code produces the same result as the original code.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition_CORS(input) DO
  ASSERT CORS_ALLOW_HEADERS_original ⊂ CORS_ALLOW_HEADERS_fixed
  // All previously allowed headers are still allowed
END FOR

FOR ALL input WHERE NOT isBugCondition_Pagination(input) AND input.page >= 1 DO
  ASSERT buildQueryString(input) = buildQueryString_fixed(input)
END FOR

FOR ALL input WHERE input.environment = "development" DO
  ASSERT CORS_ALLOW_ALL_ORIGINS = True  // dev.py unchanged
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many page values (1, 2, 100, 999) to verify they pass through unchanged
- It catches edge cases like `page=1` being accidentally modified
- It provides strong guarantees that `buildQueryString` behavior is unchanged for valid inputs

**Test Plan**: Observe behavior on UNFIXED code first for valid page numbers and standard headers, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Standard Header Preservation**: Verify that `default_headers` items are still in `CORS_ALLOW_HEADERS` after the fix
2. **Valid Page Preservation**: Verify that `page=1`, `page=2`, ..., `page=N` produce identical query strings before and after the fix
3. **Non-Page Param Preservation**: Verify that `status`, `search`, `sortBy`, `sortOrder` parameters are unaffected by the pagination fix
4. **Cookie Secure Preservation**: Verify that `AUTH_COOKIE_SECURE = True` and `AUTH_COOKIE_HTTPONLY = True` remain unchanged

### Unit Tests

- Test that `CORS_ALLOW_HEADERS` contains `x-csrf-token` alongside all `default_headers`
- Test that `AUTH_COOKIE_SAMESITE` is `"None"` in production settings
- Test that `AUTH_COOKIE_SECURE` remains `True` (required for `SameSite=None`)
- Test that `page: 0` is clamped to `page: 1` in `applicationsData.useList`
- Test that `page: 0` is replaced with `page: 1` in `useStudentDashboardPolling`
- Test that the abort-signal fallback uses `page: 1`

### Property-Based Tests

- Generate random page numbers (0 through 1000) and verify: if page <= 0, output is `page=1`; if page >= 1, output is `page=N` unchanged
- Generate random subsets of CORS headers and verify `x-csrf-token` is always present in the final `CORS_ALLOW_HEADERS` list
- Generate random query parameter combinations and verify non-page parameters are serialized identically before and after the fix

### Integration Tests

- Test full cross-origin request flow: preflight OPTIONS → actual request with `X-CSRF-Token` header → successful response
- Test cookie delivery: login → set cookies with `SameSite=None; Secure` → subsequent cross-origin request includes cookies
- Test pagination end-to-end: frontend calls `applicationService.list()` with default params → backend returns valid paginated response (not 404)
- Test SSE connection: EventSource from allowed origin with `withCredentials: true` → connection established without reconnect loop
