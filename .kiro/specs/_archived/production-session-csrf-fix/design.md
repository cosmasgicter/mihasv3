# Production Session & CSRF Fix — Bugfix Design

## Overview

Every authenticated session-dependent endpoint returns HTTP 500 because `_generate_csrf_token(user)` and `LogoutView.post` receive a `JWTUser` object but `CSRFToken.user` is a ForeignKey to `Profile`. The fix resolves the `JWTUser`→`Profile` type mismatch in the two affected backend code paths, cleans up the frontend cache-reset URL pollution, and hardens the logout auth-state cleanup to prevent stale role routing.

## Glossary

- **Bug_Condition (C)**: Any code path that passes a `JWTUser` instance where a `Profile` FK or FK lookup is expected — specifically `_generate_csrf_token()` called from `SessionView.get` and `CSRFToken.objects.filter(user=request.user)` in `LogoutView.post`
- **Property (P)**: CSRF token creation and deletion succeed without `ValueError`, returning valid session data and completing logout cleanly
- **Preservation**: `LoginView`, `RefreshView`, `CSRFEnforcementMiddleware`, cookie handling, and all non-CSRF code paths must remain unchanged
- **JWTUser**: Lightweight in-memory user object built from JWT payload in `backend/apps/accounts/authentication.py` — has `.id` (UUID) but is not a Django model instance
- **Profile**: Django model in `backend/apps/accounts/models.py` mapped to the `profiles` table — the FK target for `CSRFToken.user`
- **`_generate_csrf_token(user)`**: Helper in `backend/apps/accounts/views.py` that creates a `CSRFToken` row and returns the raw token string
- **`runOneTimeRuntimeCacheReset()`**: Function in `apps/admissions/src/main.tsx` that clears service workers and caches on first load after deployment

## Bug Details

### Bug Condition

The bug manifests when `SessionView.get` or `LogoutView.post` is called by an authenticated user. The JWT middleware sets `request.user` to a `JWTUser` instance. `_generate_csrf_token(request.user)` passes this directly to `CSRFToken.objects.create(user=user, ...)`, and `LogoutView.post` passes it to `CSRFToken.objects.filter(user=request.user).delete()`. Django's FK machinery rejects both because `CSRFToken.user` expects a `Profile` instance.

**Formal Specification:**
```
FUNCTION isBugCondition(request, codePath)
  INPUT: request of type HttpRequest, codePath of type String
  OUTPUT: boolean

  LET user = request.user

  RETURN (user IS INSTANCE OF JWTUser)
         AND (
           (codePath == "SessionView.get"
            AND _generate_csrf_token CALLED WITH user DIRECTLY)
           OR
           (codePath == "LogoutView.post"
            AND CSRFToken.objects.filter(user=user) CALLED DIRECTLY)
         )
END FUNCTION
```

### Examples

- `GET /api/v1/auth/session/` with valid access_token cookie → `_generate_csrf_token(JWTUser)` → `CSRFToken.objects.create(user=JWTUser)` → `ValueError` → HTTP 500
- `POST /api/v1/auth/logout/` with valid access_token cookie → `CSRFToken.objects.filter(user=JWTUser).delete()` → `ValueError` → HTTP 500
- `POST /api/v1/auth/login/` → `_generate_csrf_token(Profile)` → works correctly (LoginView looks up Profile from DB)
- `POST /api/v1/auth/refresh/` → `_generate_csrf_token(Profile)` → works correctly (RefreshView looks up Profile from DB)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `LoginView.post` calls `_generate_csrf_token(user)` with a `Profile` instance looked up from DB — must continue to work
- `RefreshView.post` calls `_generate_csrf_token(user)` with a `Profile` instance looked up from DB — must continue to work
- `CSRFEnforcementMiddleware` validates tokens using `user_id=user.pk` (already correct, no FK assignment) — must continue to work
- Cookie set/clear logic in `_set_auth_cookies` and `_clear_auth_cookies` — must remain unchanged
- `DeviceSession.objects.create(user=user)` in `LoginView` with `Profile` — must remain unchanged
- Frontend API client intercept-refresh-retry pattern — must remain unchanged
- `runOneTimeRuntimeCacheReset()` skip logic when localStorage key matches — must remain unchanged

**Scope:**
All inputs that do NOT involve `SessionView.get` or `LogoutView.post` code paths should be completely unaffected by this fix. This includes:
- Login, register, password-reset flows
- Token refresh flow
- CSRF middleware validation
- All non-auth API endpoints

## Hypothesized Root Cause

Based on code analysis, the confirmed root causes are:

1. **`_generate_csrf_token` type mismatch**: The function accepts any object as `user` and passes it directly to `CSRFToken.objects.create(user=user)`. When called from `SessionView.get`, `request.user` is a `JWTUser` (not a `Profile`), causing Django's FK assignment to raise `ValueError`. `LoginView` and `RefreshView` are unaffected because they look up `Profile` from the database before calling this function.

2. **`LogoutView` FK filter mismatch**: `CSRFToken.objects.filter(user=request.user).delete()` passes the `JWTUser` object directly to a FK filter. Django attempts to use the object as a `Profile` instance for the FK lookup, which fails.

3. **URL pollution after cache reset**: `runOneTimeRuntimeCacheReset()` appends `?_cache_reset=post-qa-2026-04-02` via `window.location.replace()` but never strips the parameter after the page reloads with the reset already acknowledged in localStorage.

4. **Incomplete auth state cleanup on logout**: The `signOut` function in `useSessionListener.ts` calls `queryClient.clear()` and `clearCsrfToken()` but does not explicitly null out the session query data before clearing, and does not remove all role-related cached state, which can cause stale role routing when a different user logs in on the same browser.

## Correctness Properties

Property 1: Bug Condition — CSRF Token Generation with JWTUser

_For any_ authenticated request to `SessionView.get` where `request.user` is a `JWTUser` instance, the fixed `_generate_csrf_token` function SHALL resolve the user to a `Profile` instance via `Profile.objects.get(id=user.id)` and successfully create a `CSRFToken` row, returning a valid raw token string without raising `ValueError`.

**Validates: Requirements 2.1, 2.3, 2.4**

Property 2: Bug Condition — Logout CSRF Token Deletion with JWTUser

_For any_ authenticated request to `LogoutView.post` where `request.user` is a `JWTUser` instance, the fixed logout code SHALL filter CSRF tokens by `user_id=request.user.id` instead of `user=request.user`, successfully deleting the user's tokens and returning HTTP 200.

**Validates: Requirements 2.2**

Property 3: Preservation — Login and Refresh Token Generation

_For any_ call to `_generate_csrf_token` where the `user` argument is already a `Profile` instance (as in `LoginView.post` and `RefreshView.post`), the fixed function SHALL produce the same result as the original function, preserving existing CSRF token creation behavior.

**Validates: Requirements 3.1, 3.2, 3.3**

Property 4: Preservation — CSRF Middleware Validation

_For any_ state-changing request validated by `CSRFEnforcementMiddleware`, the middleware SHALL continue to look up tokens using `user_id=user.pk` and reject invalid tokens with HTTP 403, completely unaffected by the fix.

**Validates: Requirements 3.3, 3.4**

## Fix Implementation

### Changes Required

**File**: `backend/apps/accounts/views.py`

**Function**: `_generate_csrf_token(user)`

**Specific Changes**:
1. **Resolve JWTUser to Profile**: Add a type check at the top of `_generate_csrf_token`. If `user` is not a `Profile` instance, look up `Profile.objects.get(id=user.id)` and use that for the `CSRFToken.objects.create()` call. If `user` is already a `Profile`, pass it through unchanged.

**Function**: `LogoutView.post`

**Specific Changes**:
2. **Use `user_id` for FK filter**: Change `CSRFToken.objects.filter(user=request.user).delete()` to `CSRFToken.objects.filter(user_id=request.user.id).delete()`. This bypasses Django's FK instance check by using the raw UUID directly.

---

**File**: `apps/admissions/src/main.tsx`

**Function**: `runOneTimeRuntimeCacheReset()`

**Specific Changes**:
3. **Strip `_cache_reset` query param after reset**: After the page reloads with the `_cache_reset` param in the URL, the function's early-return path (where localStorage already matches) should check for and remove the `_cache_reset` query parameter from the current URL using `history.replaceState`.

---

**File**: `apps/admissions/src/hooks/auth/useSessionListener.ts`

**Function**: `signOut` callback

**Specific Changes**:
4. **Explicit session nullification before clear**: Before `queryClient.clear()`, explicitly set the session query data to `null` via `queryClient.setQueryData(['auth', 'session'], null)`. Also clear any user-profile queries and remove `localStorage`/`sessionStorage` keys that may carry role-specific state.

---

**Investigation** (separate from the core fix):
5. **Application wizard 400 errors**: Investigate `ApplicationCreateSerializer` field expectations vs. what the wizard sends. This is a separate issue from the CSRF/session bug and will be scoped as an investigation task.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm the root cause analysis by observing the `ValueError` when `JWTUser` is passed to FK fields.

**Test Plan**: Write tests that construct a `JWTUser` from a JWT payload and pass it to `_generate_csrf_token()` and `CSRFToken.objects.filter(user=...)`. Run these tests on the UNFIXED code to observe `ValueError` failures.

**Test Cases**:
1. **SessionView CSRF generation**: Call `_generate_csrf_token(JWTUser(...))` — expect `ValueError` on unfixed code
2. **LogoutView CSRF deletion**: Call `CSRFToken.objects.filter(user=JWTUser(...)).delete()` — expect `ValueError` on unfixed code
3. **Full SessionView.get request**: Simulate authenticated GET to `/api/v1/auth/session/` with JWTUser — expect HTTP 500 on unfixed code
4. **Full LogoutView.post request**: Simulate authenticated POST to `/api/v1/auth/logout/` with JWTUser — expect HTTP 500 on unfixed code

**Expected Counterexamples**:
- `ValueError: Cannot assign "<JWTUser object>": "CSRFToken.user" must be a "Profile" instance`
- Confirmed cause: direct FK assignment with non-model object

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL request WHERE isBugCondition(request) DO
  result := _generate_csrf_token_fixed(request.user)
  ASSERT result IS valid_token_string
  ASSERT CSRFToken.objects.filter(user_id=request.user.id).exists()
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL user WHERE user IS INSTANCE OF Profile DO
  ASSERT _generate_csrf_token_original(user) BEHAVES SAME AS _generate_csrf_token_fixed(user)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (random Profile instances)
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all Profile-typed inputs

**Test Plan**: Observe behavior on UNFIXED code first for `LoginView` and `RefreshView` flows (which already pass `Profile` instances), then write property-based tests capturing that behavior.

**Test Cases**:
1. **Login CSRF preservation**: Verify `LoginView.post` continues to generate valid CSRF tokens with `Profile` instances after the fix
2. **Refresh CSRF preservation**: Verify `RefreshView.post` continues to generate valid CSRF tokens with `Profile` instances after the fix
3. **CSRF middleware preservation**: Verify `CSRFEnforcementMiddleware` token validation is unaffected by the fix
4. **Cookie handling preservation**: Verify auth cookie set/clear behavior is unchanged

### Unit Tests

- Test `_generate_csrf_token` with `JWTUser` input (should succeed after fix)
- Test `_generate_csrf_token` with `Profile` input (should continue to succeed)
- Test `LogoutView.post` CSRF deletion with `JWTUser` as `request.user`
- Test `SessionView.get` returns valid response with `X-CSRF-Token` header
- Test URL param cleanup in `runOneTimeRuntimeCacheReset` (frontend unit test)

### Property-Based Tests

- Generate random UUID/email/role combinations, construct both `JWTUser` and `Profile` objects, verify `_generate_csrf_token` succeeds for both types (hypothesis)
- Generate random `Profile` instances and verify CSRF token creation/lookup round-trip is identical before and after fix (hypothesis)
- Generate random auth states and verify `signOut` fully clears all cached data (fast-check)

### Integration Tests

- Test full session flow: login → session check → verify CSRF token in response header
- Test full logout flow: login → logout → verify cookies cleared and CSRF tokens deleted
- Test role switch: student login → logout → admin login → verify correct dashboard routing
