# Implementation Plan

- [x] 1. Write bug condition exploration tests
  - **Property 1: Bug Condition** - CORS Header Missing & Pagination Zero-Page
  - **CRITICAL**: These tests MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: These tests encode the expected behavior — they will validate the fixes when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate the three bug vectors
  - **Backend CORS test** (`backend/tests/property/test_production_cors_pagination_fix_exploration.py`):
    - Import `CORS_ALLOW_HEADERS` from `config.settings.base` and assert `"x-csrf-token"` is in the list
    - Import `AUTH_COOKIE_SAMESITE` from `config.settings.prod` and assert it equals `"None"`
    - These assertions will FAIL on unfixed code (confirms `x-csrf-token` is missing and `SameSite` is `"Lax"`)
  - **Frontend pagination test** (`apps/admissions/tests/property/production-cors-pagination-fix-exploration.test.ts`):
    - Use `fast-check` to generate page values of 0 and verify the clamped output
    - Extract the page-clamping logic: given `page=0`, assert the value sent to the API is `>= 1`
    - Test `buildQueryString` with `page: 0` and assert the query string contains `page=1`, not `page=0`
    - Test `filters.page || 0` default path: when `filters.page` is `undefined`, assert the resolved page is `1`, not `0`
    - These assertions will FAIL on unfixed code (confirms `page=0` is sent)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct — it proves the bugs exist)
  - Document counterexamples found to understand root cause
  - Mark task complete when tests are written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing CORS Headers & Valid Pagination Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - **Backend preservation test** (`backend/tests/property/test_production_cors_pagination_fix_preservation.py`):
    - Observe: `default_headers` items (`accept`, `accept-language`, `content-type`, `authorization`, etc.) are in `CORS_ALLOW_HEADERS` on unfixed code
    - Observe: `"cache-control"` and `"last-event-id"` are in `CORS_ALLOW_HEADERS` on unfixed code
    - Observe: `AUTH_COOKIE_SECURE = True` and `AUTH_COOKIE_HTTPONLY = True` on unfixed code
    - Write property test: for all headers in `default_headers`, assert they remain in `CORS_ALLOW_HEADERS` after fix
    - Write property test: `AUTH_COOKIE_SECURE` and `AUTH_COOKIE_HTTPONLY` remain `True`
  - **Frontend preservation test** (`apps/admissions/tests/property/production-cors-pagination-fix-preservation.test.ts`):
    - Observe: `buildQueryString({ page: 1 })` produces `?page=1` on unfixed code
    - Observe: `buildQueryString({ page: 5, status: "pending" })` produces `?page=5&status=pending` on unfixed code
    - Use `fast-check` to generate `page` values in range `[1, 1000]` and assert `buildQueryString` output contains `page=N` unchanged
    - Use `fast-check` to generate random non-page params (`status`, `search`, `sortBy`, `sortOrder`) and assert they serialize identically
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 3. Fix CORS, cookie SameSite, and pagination bugs

  - [x] 3.1 Add `x-csrf-token` to `CORS_ALLOW_HEADERS` in `backend/config/settings/base.py`
    - Change line ~204 from `list(dict.fromkeys([*default_headers, "cache-control", "last-event-id"]))` to `list(dict.fromkeys([*default_headers, "cache-control", "last-event-id", "x-csrf-token"]))`
    - This allows the browser to send the `X-CSRF-Token` header in cross-origin preflight requests
    - Fixes CORS rejection for all state-changing requests and SSE connections from `apply.mihas.edu.zm`
    - _Bug_Condition: isBugCondition_CORS(input) where input.headers CONTAINS "X-CSRF-Token" AND "x-csrf-token" NOT IN CORS_ALLOW_HEADERS_
    - _Expected_Behavior: "x-csrf-token" IN response.headers["Access-Control-Allow-Headers"] AND response.status ≠ 403_
    - _Preservation: All existing default_headers, "cache-control", and "last-event-id" remain in CORS_ALLOW_HEADERS_
    - _Requirements: 1.1, 1.2, 1.5, 2.1, 2.2, 2.5_

  - [x] 3.2 Change `AUTH_COOKIE_SAMESITE` to `"None"` in `backend/config/settings/prod.py`
    - Change line ~28 from `AUTH_COOKIE_SAMESITE = "Lax"` to `AUTH_COOKIE_SAMESITE = "None"`
    - Cross-origin credentialed requests require `SameSite=None; Secure` — `Secure=True` is already set
    - Only `prod.py` needs this change; `dev.py` uses same-origin (localhost)
    - Verify `AUTH_COOKIE_SECURE = True` and `AUTH_COOKIE_HTTPONLY = True` remain unchanged
    - _Bug_Condition: isBugCondition_Cookie(input) where input.origin ≠ input.destination AND input.credentials = "include" AND SameSite = "Lax"_
    - _Expected_Behavior: AUTH_COOKIE_SAMESITE = "None" AND AUTH_COOKIE_SECURE = True_
    - _Preservation: AUTH_COOKIE_HTTPONLY = True unchanged, AUTH_COOKIE_SECURE = True unchanged_
    - _Requirements: 1.1, 2.1, 2.2_

  - [x] 3.3 Fix `page: 0` to `page: 1` in `apps/admissions/src/hooks/useStudentDashboardPolling.ts`
    - Change `page: 0` to `page: 1` in `useStudentDashboardPolling` fetchData callback (~line 113)
    - Change `page: 0` to `page: 1` in `useStudentApplicationCount` queryFn (~line 195)
    - Change `page: 0` to `page: 1` in `useHasApplicationWithStatus` queryFn (~line 226)
    - All three occurrences pass `page: 0` to `applicationService.list()` which Django rejects with 404
    - _Bug_Condition: isBugCondition_Pagination(input) where input.page = 0_
    - _Expected_Behavior: queryString CONTAINS "page=1" AND NOT "page=0"_
    - _Preservation: All other params (pageSize, sortBy, sortOrder, mine) unchanged_
    - _Requirements: 1.3, 2.3_

  - [x] 3.4 Fix page default in `apps/admissions/src/data/applications.ts`
    - Change `page: filters.page || 0` to `page: Math.max(filters.page || 1, 1)` in `applicationsData.useList` queryFn (~line 88)
    - Change error fallback `page: 0` to `page: 1` in the abort-signal catch block (~line 99)
    - Ensures page parameter defaults to 1 and is never less than 1
    - _Bug_Condition: isBugCondition_Pagination(input) where input.page = 0 OR input.page is undefined_
    - _Expected_Behavior: resolved page >= 1 always_
    - _Preservation: Valid page values (>= 1) pass through unchanged; non-page params unaffected_
    - _Requirements: 1.4, 2.4_

  - [x] 3.5 Verify bug condition exploration tests now pass
    - **Property 1: Expected Behavior** - CORS Header Present & Pagination Clamped
    - **IMPORTANT**: Re-run the SAME tests from task 1 — do NOT write new tests
    - The tests from task 1 encode the expected behavior
    - When these tests pass, it confirms the expected behavior is satisfied
    - Run backend exploration test: `cd backend && python3 -m pytest tests/property/test_production_cors_pagination_fix_exploration.py -v`
    - Run frontend exploration test: `cd apps/admissions && bun run test -- --run tests/property/production-cors-pagination-fix-exploration.test.ts`
    - **EXPECTED OUTCOME**: Tests PASS (confirms bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.6 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing CORS Headers & Valid Pagination Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run backend preservation test: `cd backend && python3 -m pytest tests/property/test_production_cors_pagination_fix_preservation.py -v`
    - Run frontend preservation test: `cd apps/admissions && bun run test -- --run tests/property/production-cors-pagination-fix-preservation.test.ts`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full backend test suite: `cd backend && python3 -m pytest`
  - Run full admissions frontend test suite: `cd apps/admissions && bun run test -- --run`
  - Run admissions type-check: `cd apps/admissions && bun run lint`
  - Ensure all tests pass, ask the user if questions arise.
