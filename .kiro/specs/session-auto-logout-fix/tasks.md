# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** — Cookie max_age Mismatch
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate Bug B (hardcoded cookie max_age)
  - **Scoped PBT Approach**: The bug is deterministic — scope the property to the concrete case: call `_set_auth_cookies` and assert `access_call["max_age"] == int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds())`
  - Write a property-based test in `backend/tests/property/test_auth_properties.py` (new test method in `TestAuthCookieAttributes` or a small standalone class) that:
    - Generates random roles via `_roles` strategy
    - Calls `_set_auth_cookies(response, access, refresh)` with a mock response
    - Asserts `access_call["max_age"] == int(django_settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds())`
  - Also verify Bug A: write a simple assertion that reads `backend/Dockerfile` and checks it contains `LENCO_API_SECRET_KEY=build-time-placeholder` and `LENCO_PUBLIC_KEY=build-time-placeholder`
  - Run on UNFIXED code — expect FAILURE:
    - Bug B: `access_call["max_age"]` is `900` but `SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()` is `1800.0`
    - Bug A: Dockerfile does not contain the Lenco placeholder lines
  - Document counterexamples found to confirm root cause
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** — Refresh Token, Cookie Attributes, and prod.py Lenco Check
  - **IMPORTANT**: Follow observation-first methodology
  - Observe on UNFIXED code:
    - `_set_auth_cookies` sets refresh token cookie with `max_age=7 * 24 * 60 * 60` (604800)
    - Cookie attributes `domain`, `samesite`, `secure`, `httponly`, `path` use settings-derived values
    - `prod.py` raises `ImproperlyConfigured` when `LENCO_API_SECRET_KEY` or `LENCO_PUBLIC_KEY` is empty
    - All 11 existing Dockerfile build-time placeholder variables are present
  - Write property-based tests capturing observed behavior:
    - For all roles: refresh token `max_age` is `604800`
    - For all roles: both cookies have `domain`, `samesite`, `secure`, `httponly`, `path` matching settings
    - Dockerfile contains all 11 original placeholder env vars unchanged
    - `prod.py` contains the `ImproperlyConfigured` Lenco guard
  - These tests can be added as new methods in `TestAuthCookieAttributes` or as a small new class in `backend/tests/property/test_auth_properties.py`
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix session auto-logout bugs

  - [x] 3.1 Add Lenco build-time placeholders to Dockerfile
    - In `backend/Dockerfile`, add `LENCO_API_SECRET_KEY=build-time-placeholder \` and `LENCO_PUBLIC_KEY=build-time-placeholder \` to the `collectstatic` RUN step, alongside the existing 11 placeholder variables
    - This satisfies the `prod.py` truthiness check during `docker build` without exposing real credentials
    - _Bug_Condition: isBugCondition_A(build_env) where LENCO_API_SECRET_KEY and LENCO_PUBLIC_KEY are absent_
    - _Expected_Behavior: collectstatic succeeds with Lenco placeholders present_
    - _Preservation: All 11 existing placeholders unchanged; prod.py Lenco runtime check intact_
    - _Requirements: 2.1, 3.1, 3.2_

  - [x] 3.2 Derive access token cookie max_age from settings
    - In `backend/apps/accounts/views.py`, in `_set_auth_cookies`:
      - Replace `max_age=15 * 60` with `max_age=int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds())`
      - Update comment from `# Access token cookie (15 min)` to `# Access token cookie — lifetime from settings`
    - _Bug_Condition: isBugCondition_B(cookie_call) where cookie_call.max_age != int(ACCESS_TOKEN_LIFETIME.total_seconds())_
    - _Expected_Behavior: access token cookie max_age == int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds())_
    - _Preservation: Refresh token max_age stays 7 * 24 * 60 * 60; all other cookie attributes unchanged_
    - _Requirements: 2.2, 2.3, 3.3, 3.4_

  - [x] 3.3 Update property test assertion to validate settings-derived max_age
    - In `backend/tests/property/test_auth_properties.py`, in `test_set_auth_cookies_uses_correct_attributes`:
      - Change `self.assertEqual(access_call["max_age"], 15 * 60)` to `self.assertEqual(access_call["max_age"], int(django_settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()))`
    - _Requirements: 2.4, 3.6_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** — Cookie max_age Matches Settings
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.2, 2.3_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** — Refresh Token, Cookie Attributes, and prod.py Lenco Check
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint — Ensure all tests pass
  - Run `cd backend && python3 -m pytest` to verify all backend tests pass
  - Run `cd backend && python3 manage.py check` to verify Django system checks pass
  - Ensure all tests pass, ask the user if questions arise
