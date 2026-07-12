# Session Auto-Logout Fix — Bugfix Design

## Overview

Users are prematurely logged out of the MIHAS platform due to two compounding bugs: (1) the Dockerfile's `collectstatic` step fails because `LENCO_API_SECRET_KEY` and `LENCO_PUBLIC_KEY` are missing from the build-time placeholder environment variables, blocking all deployments for 3+ days; and (2) `_set_auth_cookies` hardcodes the access token cookie `max_age` to 15 minutes instead of reading from `settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"]` (30 minutes), causing the browser to delete the cookie before the JWT expires.

The fix adds two build-time placeholders to the Dockerfile and replaces the hardcoded `max_age` with a settings-derived value. The `prod.py` Lenco runtime validation check is intentionally preserved.

## Glossary

- **Bug_Condition (C)**: The two conditions that trigger the bugs — (1) Docker build with `DJANGO_SETTINGS_MODULE=config.settings.prod` when `LENCO_API_SECRET_KEY` and `LENCO_PUBLIC_KEY` are absent from the build environment, and (2) any login/token-refresh call that invokes `_set_auth_cookies`
- **Property (P)**: (1) `collectstatic` succeeds during Docker build; (2) access token cookie `max_age` equals `settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()`
- **Preservation**: The `prod.py` Lenco runtime validation, refresh token cookie lifetime, all other cookie attributes, JWT `exp` claim computation, and all unrelated property tests must remain unchanged
- **`_set_auth_cookies`**: Helper function in `backend/apps/accounts/views.py` that sets `access_token` and `refresh_token` HTTP-only cookies on the response
- **`SIMPLE_JWT`**: Django settings dict in `backend/config/settings/base.py` containing `ACCESS_TOKEN_LIFETIME` (timedelta, currently 30 min) and `REFRESH_TOKEN_LIFETIME` (timedelta, currently 7 days)
- **`prod.py` Lenco check**: The `if not LENCO_API_SECRET_KEY or not LENCO_PUBLIC_KEY: raise ImproperlyConfigured(...)` guard in `backend/config/settings/prod.py` that enforces real Lenco credentials at runtime

## Bug Details

### Bug Condition

The bug manifests in two independent locations:

**Bug A (Dockerfile):** The `collectstatic` RUN step uses `DJANGO_SETTINGS_MODULE=config.settings.prod`, which imports `prod.py`. `prod.py` checks `LENCO_API_SECRET_KEY` and `LENCO_PUBLIC_KEY` and raises `ImproperlyConfigured` if either is falsy. Since these two variables are not provided as build-time placeholders (unlike the other 11 variables), Django fails to load settings and `collectstatic` cannot run.

**Bug B (Cookie max_age):** Every call to `_set_auth_cookies` sets the access token cookie with `max_age=15 * 60` (900s), but `SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"]` is `timedelta(minutes=30)` (1800s). The browser deletes the cookie 15 minutes before the JWT expires, causing a 401 on the next request.

**Formal Specification:**
```
FUNCTION isBugCondition_A(build_env)
  INPUT: build_env of type Dict[str, str]  -- Docker build environment variables
  OUTPUT: boolean

  RETURN build_env["DJANGO_SETTINGS_MODULE"] == "config.settings.prod"
         AND (build_env.get("LENCO_API_SECRET_KEY", "") == ""
              OR build_env.get("LENCO_PUBLIC_KEY", "") == "")
END FUNCTION

FUNCTION isBugCondition_B(cookie_call)
  INPUT: cookie_call of type CookieSetCall  -- arguments passed to response.set_cookie for access_token
  OUTPUT: boolean

  access_lifetime := settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()
  RETURN cookie_call.key == "access_token"
         AND cookie_call.max_age != int(access_lifetime)
END FUNCTION
```

### Examples

- **Bug A:** `docker build` → `prod.py` raises `ImproperlyConfigured("LENCO_API_SECRET_KEY and LENCO_PUBLIC_KEY are required in production.")` → `collectstatic` never runs → image build fails → no deployment for 3+ days
- **Bug B:** User logs in → `_set_auth_cookies` sets `access_token` cookie with `max_age=900` → JWT is valid for 1800s → at t=901s browser deletes cookie → next API call has no token → 401 → auto-logout
- **Bug B edge case:** If `ACCESS_TOKEN_LIFETIME` is changed to e.g. 60 minutes in settings, the cookie would still expire at 15 minutes because the value is hardcoded
- **Combined:** Even after fixing Bug A and deploying the 30-minute JWT lifetime, users would still be logged out at 15 minutes unless Bug B is also fixed

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- The `prod.py` Lenco validation check (`if not LENCO_API_SECRET_KEY or not LENCO_PUBLIC_KEY: raise ImproperlyConfigured(...)`) must remain intact — it correctly enforces real credentials at runtime
- All 11 existing build-time placeholder variables in the Dockerfile must remain unchanged
- The refresh token cookie `max_age` must remain `7 * 24 * 60 * 60` (7 days)
- Cookie attributes `domain`, `samesite`, `secure`, `httponly`, and `path` must continue using their settings-derived values
- The JWT `exp` claim in `tokens.py` must continue using `settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"]`
- All existing property tests (password hashing, JWT lifecycle, login throttling, etc.) must continue to pass

**Scope:**
All inputs that do NOT involve (1) the Dockerfile `collectstatic` build step or (2) the `_set_auth_cookies` access token `max_age` should be completely unaffected by this fix. This includes:
- All API endpoints and their response formats
- Authentication flow logic (login, refresh, logout)
- Token generation and verification in `tokens.py`
- All other Django settings
- Frontend code (no changes needed)

## Hypothesized Root Cause

Based on the bug description and code analysis:

1. **Missing Dockerfile placeholders (Bug A):** When the Lenco payment integration was added, `prod.py` gained a startup check for `LENCO_API_SECRET_KEY` and `LENCO_PUBLIC_KEY`. The Dockerfile's `collectstatic` RUN step was not updated to include these as build-time placeholders. The other 11 required env vars already have placeholders, but these two were missed.

2. **Hardcoded cookie max_age (Bug B):** The `_set_auth_cookies` function was written with `max_age=15 * 60` matching the original 15-minute access token lifetime. When `ACCESS_TOKEN_LIFETIME` was later changed to 30 minutes in `base.py`, the hardcoded cookie value was not updated. The comment `# Access token cookie (15 min)` confirms the original intent but the value was never parameterized.

3. **Test validates the bug:** The property test `test_set_auth_cookies_uses_correct_attributes` asserts `access_call["max_age"] == 15 * 60`, which locks in the incorrect hardcoded value rather than testing against the settings-derived lifetime.

## Correctness Properties

Property 1: Bug Condition A — Dockerfile collectstatic succeeds with Lenco placeholders

_For any_ Docker build where `DJANGO_SETTINGS_MODULE=config.settings.prod` and `LENCO_API_SECRET_KEY` and `LENCO_PUBLIC_KEY` are provided as non-empty build-time placeholders, the `collectstatic` management command SHALL execute successfully without `ImproperlyConfigured` errors.

**Validates: Requirements 2.1**

Property 2: Bug Condition B — Cookie max_age matches settings lifetime

_For any_ call to `_set_auth_cookies`, the access token cookie `max_age` SHALL equal `int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds())`, ensuring the cookie lifetime is always derived from the canonical JWT configuration.

**Validates: Requirements 2.2, 2.3**

Property 3: Preservation — Dockerfile Lenco runtime check intact

_For any_ runtime environment where `LENCO_API_SECRET_KEY` or `LENCO_PUBLIC_KEY` is empty or missing, `prod.py` SHALL continue to raise `ImproperlyConfigured`, preserving the runtime credential enforcement.

**Validates: Requirements 3.1, 3.2**

Property 4: Preservation — Refresh token and cookie attributes unchanged

_For any_ call to `_set_auth_cookies`, the refresh token cookie `max_age` SHALL remain `7 * 24 * 60 * 60` (604800 seconds), and all cookie attributes (`domain`, `samesite`, `secure`, `httponly`, `path`) SHALL continue to use their settings-derived values.

**Validates: Requirements 3.3, 3.4**

Property 5: Preservation — Property test validates settings-derived max_age

_For any_ execution of the `test_set_auth_cookies_uses_correct_attributes` property test, the assertion SHALL validate that `access_call["max_age"]` equals `int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds())` rather than a hardcoded value.

**Validates: Requirements 2.4, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `backend/Dockerfile`

**Change**: Add `LENCO_API_SECRET_KEY` and `LENCO_PUBLIC_KEY` build-time placeholders

**Specific Changes**:
1. **Add two env vars to the collectstatic RUN step**: Insert `LENCO_API_SECRET_KEY=build-time-placeholder` and `LENCO_PUBLIC_KEY=build-time-placeholder` into the existing multi-line `RUN` command, alongside the other 11 placeholder variables. This satisfies the `prod.py` truthiness check during build without exposing real credentials.

---

**File**: `backend/apps/accounts/views.py`

**Function**: `_set_auth_cookies`

**Specific Changes**:
2. **Derive access token max_age from settings**: Replace `max_age=15 * 60` with `max_age=int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds())`. This ensures the cookie lifetime always matches the JWT lifetime regardless of future configuration changes.
3. **Update the comment**: Change `# Access token cookie (15 min)` to `# Access token cookie — lifetime from settings` to reflect the dynamic nature of the value.

---

**File**: `backend/tests/property/test_auth_properties.py`

**Class**: `TestAuthCookieAttributes`

**Specific Changes**:
4. **Update max_age assertion**: In `test_set_auth_cookies_uses_correct_attributes`, change `self.assertEqual(access_call["max_age"], 15 * 60)` to `self.assertEqual(access_call["max_age"], int(django_settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()))`. This validates the fix rather than the bug.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that invoke `_set_auth_cookies` and inspect the `max_age` value passed to `set_cookie`. Run these tests on the UNFIXED code to observe the mismatch between the hardcoded value and the settings value.

**Test Cases**:
1. **Cookie max_age mismatch test**: Call `_set_auth_cookies` and assert `access_call["max_age"] == int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds())` — will fail on unfixed code because the hardcoded value is 900, not 1800
2. **Dockerfile placeholder test**: Verify that the Dockerfile RUN step includes `LENCO_API_SECRET_KEY` and `LENCO_PUBLIC_KEY` — will fail on unfixed code because they are absent
3. **Settings vs cookie drift test**: Assert `access_call["max_age"] == int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds())` for any `ACCESS_TOKEN_LIFETIME` value — will fail on unfixed code for any lifetime ≠ 15 minutes

**Expected Counterexamples**:
- `access_call["max_age"]` is 900 but `settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()` is 1800.0
- Possible causes: hardcoded literal `15 * 60` in `_set_auth_cookies` instead of reading from settings

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL access_token_lifetime WHERE access_token_lifetime is a valid timedelta DO
  WITH settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"] = access_token_lifetime:
    result := _set_auth_cookies_fixed(response, access, refresh)
    ASSERT response.set_cookie was called with max_age = int(access_token_lifetime.total_seconds())
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL (access_token, refresh_token, cookie_settings) DO
  result_original := _set_auth_cookies_original(response, access_token, refresh_token)
  result_fixed := _set_auth_cookies_fixed(response, access_token, refresh_token)

  -- Refresh token cookie must be identical
  ASSERT original_refresh_call == fixed_refresh_call

  -- All cookie attributes except access max_age must be identical
  FOR attr IN [domain, samesite, secure, httponly, path] DO
    ASSERT original_access_call[attr] == fixed_access_call[attr]
  END FOR
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (random roles, tokens, settings combinations)
- It catches edge cases that manual unit tests might miss (e.g., unusual timedelta values)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for refresh token cookies and non-max_age attributes, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Refresh token max_age preservation**: Verify refresh token cookie `max_age` remains `7 * 24 * 60 * 60` after fix
2. **Cookie attribute preservation**: Verify `domain`, `samesite`, `secure`, `httponly`, `path` remain unchanged for both cookies after fix
3. **Dockerfile existing placeholders preservation**: Verify all 11 existing build-time placeholder variables remain in the Dockerfile after adding the 2 new ones
4. **prod.py Lenco check preservation**: Verify the `ImproperlyConfigured` raise is still present and functional

### Unit Tests

- Test `_set_auth_cookies` sets access token `max_age` to `int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds())`
- Test `_set_auth_cookies` with overridden `ACCESS_TOKEN_LIFETIME` values (e.g., 5 min, 60 min) to confirm dynamic behavior
- Test refresh token `max_age` remains `7 * 24 * 60 * 60` regardless of access token lifetime changes
- Test Dockerfile contains `LENCO_API_SECRET_KEY=build-time-placeholder` and `LENCO_PUBLIC_KEY=build-time-placeholder`

### Property-Based Tests

- Generate random `ACCESS_TOKEN_LIFETIME` timedelta values and verify `_set_auth_cookies` always uses `int(lifetime.total_seconds())` as the access cookie `max_age`
- Generate random roles and token pairs and verify all non-max_age cookie attributes remain consistent with settings
- Generate random cookie settings combinations and verify preservation of `domain`, `samesite`, `secure`, `httponly`, `path`

### Integration Tests

- Test full login flow produces cookies with settings-derived `max_age`
- Test token refresh flow produces cookies with settings-derived `max_age`
- Test that `prod.py` still raises `ImproperlyConfigured` when Lenco env vars are empty at runtime
