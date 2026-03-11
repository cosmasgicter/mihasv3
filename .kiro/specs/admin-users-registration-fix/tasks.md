# Implementation Plan

- [x] 1. Write bug condition exploration tests
  - **Property 1: Fault Condition** - SQL Parameterization, VARCHAR Overflow, and CORS Preflight Bugs
  - **CRITICAL**: These tests MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: These tests encode the expected behavior — they will validate the fixes when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate all four bugs exist
  - **Scoped PBT Approach**: Use fast-check to generate filter combinations (role?, search?, page, limit) and verify SQL placeholder count matches params length; generate 64-char hex strings and verify `registrationKey()` output fits VARCHAR(64); verify OPTIONS responses include X-CSRF-Token
  - Test file: `tests/property/admin-users-registration-bugfix-exploration.test.ts`
  - SQL Parameterization tests:
    - Extract the SQL query building logic from `handleUsers()` in `api-src/admin.ts`
    - For all `(role?, search?, page, limit)` tuples, count dollar-N placeholders in generated SQL and compare to params array length
    - `isBugCondition_SQL`: action='users' AND method='GET' — bug fires for ALL filter combinations because LIMIT/OFFSET use template literals
    - No filters: SQL has `LIMIT 1 OFFSET 2` as literal text, params `[limit, offset]` — 0 placeholders vs 2 params
    - Role only: SQL has `WHERE role = $1 LIMIT 2 OFFSET 3`, params `[role, limit, offset]` — 1 placeholder vs 3 params
    - Role + search: SQL has `WHERE role = $1 AND (...LIKE $2...) LIMIT 3 OFFSET 4`, params `[role, search, limit, offset]` — 2 placeholders vs 4 params
    - Assert: `placeholderCount === params.length` (will FAIL on unfixed code, confirming the bug)
  - VARCHAR Overflow tests:
    - `isBugCondition_VARCHAR`: action='register' AND LENGTH('reg:' + ipHash) > 64
    - Generate random 64-char hex strings as ipHash values
    - Compute `'reg:' + ipHash` and assert `length <= 64` (will FAIL — 68 chars, confirming overflow)
    - Also assert that the key used for INSERT matches the key used for SELECT (consistency)
  - CORS Preflight tests:
    - `isBugCondition_CORS`: method='OPTIONS' AND request handled by withArcjetProtection()
    - Inspect the hardcoded headers in the OPTIONS block of `withArcjetProtection()`
    - Assert `X-CSRF-Token` is in `Access-Control-Allow-Headers` (will FAIL on unfixed code)
    - Assert `Access-Control-Expose-Headers` includes `X-CSRF-Token` (will FAIL on unfixed code)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct — it proves the bugs exist)
  - Document counterexamples found to understand root causes
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Admin, Auth, CORS, and API Behaviors
  - **IMPORTANT**: Follow observation-first methodology
  - Test file: `tests/property/admin-users-registration-bugfix-preservation.test.ts`
  - Observe behavior on UNFIXED code for non-buggy inputs, then write property-based tests:
  - Login hash preservation:
    - Observe: `recordLoginAttempt()` stores exactly 64-char SHA-256 hex digests of email with no prefix
    - Generate random email strings with fast-check, verify hash is exactly 64 hex chars, no `reg:` prefix, equals `sha256(email)`
    - Verify tests PASS on unfixed code (login flow is not affected by any of the four bugs)
  - Pagination metadata preservation:
    - Observe: count query uses same WHERE clause as data query but without LIMIT/OFFSET
    - Observe: `totalPages = Math.ceil(totalCount / pageSize)`, page/pageSize metadata returned correctly
    - Generate random `(page, pageSize)` tuples, verify metadata calculation is correct
    - Verify tests PASS on unfixed code
  - Arcjet non-OPTIONS preservation:
    - Observe: non-OPTIONS requests still go through Arcjet shield, bot detection, rate limiting
    - Generate random non-OPTIONS HTTP methods (GET, POST, PUT, PATCH, DELETE)
    - Verify Arcjet protection is applied before handler for all non-OPTIONS methods
    - Verify tests PASS on unfixed code
  - CSRF validation preservation:
    - Observe: state-changing requests without valid CSRF tokens are rejected with 403 + `CSRF_VALIDATION_FAILED`
    - Verify this behavior is unchanged on unfixed code
  - API response envelope preservation:
    - Observe: all successful responses use `{ success: true, data: ... }` envelope via `sendSuccess()`
    - Verify error responses use sanitized `sendError()` without stack traces
  - Registration response preservation:
    - Observe: registration returns HTTP 201 with profile, tokens, and CSRF token regardless of audit trail success
    - Verify this behavior on unfixed code
  - Run all preservation tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.15_

- [x] 3. Fix SQL parameterization in handleUsers()

  - [x] 3.1 Fix LIMIT/OFFSET placeholders in handleUsers() at api-src/admin.ts
    - Replace template literal interpolation `LIMIT ${paramIndex} OFFSET ${paramIndex + 1}` with proper PostgreSQL dollar-N placeholders `LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`
    - The JS template literal must output a literal `$` followed by the paramIndex number, producing `$1`, `$2`, etc. in the SQL string
    - Verify the fix for all 4 filter combinations: no filters, role only, search only, role + search
    - After fix: placeholder count must equal params array length for every combination
    - _Bug_Condition: isBugCondition_SQL(input) where action='users' AND method='GET' — LIMIT/OFFSET always use template literals instead of $N placeholders_
    - _Expected_Behavior: SQL query has exactly N dollar-sign placeholders where N equals params.length, query executes successfully returning HTTP 200_
    - _Preservation: PUT/POST/DELETE user operations continue routing to handleUpdateUser/handleDeactivateUser; pagination metadata (totalCount, page, pageSize, totalPages) calculated correctly; includeInactive=true continues to work_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4_

  - [x] 3.2 Verify SQL parameterization exploration test now passes
    - **Property 1: Expected Behavior** - SQL Parameter Count Matches Placeholder Count
    - **IMPORTANT**: Re-run the SAME SQL tests from task 1 — do NOT write new tests
    - The tests from task 1 assert `placeholderCount === params.length` for all filter combinations
    - When these tests pass, it confirms the SQL parameterization bug is fixed
    - Run SQL parameterization exploration tests from step 1
    - **EXPECTED OUTCOME**: Tests PASS (confirms SQL bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.3 Verify preservation tests still pass for admin users
    - **Property 2: Preservation** - Admin Users Pagination Metadata
    - **IMPORTANT**: Re-run the SAME preservation tests from task 2 — do NOT write new tests
    - Run pagination metadata and admin routing preservation tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions in admin user management)

- [x] 4. Fix registration VARCHAR overflow in api-src/auth.ts

  - [x] 4.1 Add registrationKey() helper function
    - Create a `registrationKey(ipHash: string): string` function that re-hashes `'reg:' + ipHash` through SHA-256 to produce a deterministic 64-char hex digest
    - Uses existing `createHash` import from `crypto` module already in the file
    - This preserves distinction from login email hashes (which are SHA-256 of email, not of `reg:` + IP)
    - Place the helper near the existing `recordRegistrationAttempt()` and `checkRegistrationRateLimit()` functions
    - _Requirements: 2.5_

  - [x] 4.2 Update recordRegistrationAttempt() to use registrationKey()
    - Replace inline `'reg:' + ipHash` concatenation with `registrationKey(ipHash)` for the `email_hash` INSERT value
    - The resulting key is exactly 64 chars, fitting VARCHAR(64) column constraint
    - Audit trail entries will now be successfully inserted for every registration
    - _Bug_Condition: isBugCondition_VARCHAR(input) where LENGTH('reg:' + ipHash) > 64 — always true since ipHash is 64-char SHA-256_
    - _Expected_Behavior: email_hash value fits VARCHAR(64), INSERT succeeds, audit trail row present_
    - _Preservation: recordLoginAttempt() continues storing raw 64-char SHA-256 email hashes without prefix or truncation_
    - _Requirements: 2.5, 2.6, 3.5_

  - [x] 4.3 Update checkRegistrationRateLimit() to use registrationKey()
    - Replace inline `'reg:' + ipHash` concatenation with `registrationKey(ipHash)` for the WHERE clause value
    - Ensures key consistency between INSERT (recordRegistrationAttempt) and SELECT (checkRegistrationRateLimit)
    - Database-backed rate limit (3 per IP per 10 minutes) will now function correctly
    - _Bug_Condition: checkRegistrationRateLimit uses same overflowing key, finds 0 rows, rate limit never enforced_
    - _Expected_Behavior: SELECT key matches INSERT key, rate limit query returns correct row count_
    - _Preservation: Arcjet-level registration rate limiting continues operating independently; checkLoginCooldown/checkAccountLockout continue using existing email_hash format_
    - _Requirements: 2.7, 3.6, 3.8_

  - [x] 4.4 Verify VARCHAR overflow exploration test now passes
    - **Property 1: Expected Behavior** - Registration Audit Key Fits VARCHAR(64)
    - **IMPORTANT**: Re-run the SAME VARCHAR tests from task 1 — do NOT write new tests
    - The tests from task 1 assert `registrationKey()` output length <= 64 and INSERT/SELECT key consistency
    - When these tests pass, it confirms the VARCHAR overflow bug is fixed
    - Run VARCHAR overflow exploration tests from step 1
    - **EXPECTED OUTCOME**: Tests PASS (confirms VARCHAR bug is fixed)
    - _Requirements: 2.5, 2.6, 2.7_

  - [x] 4.5 Verify preservation tests still pass for auth
    - **Property 2: Preservation** - Login Attempt Email Hash Format Unchanged
    - **IMPORTANT**: Re-run the SAME preservation tests from task 2 — do NOT write new tests
    - Run login hash preservation and registration response preservation tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions in login/registration flows)

- [x] 5. Fix CORS/CSRF preflight and url.parse() deprecation in lib/arcjet.ts

  - [x] 5.1 Delegate OPTIONS handling to handleCors() in withArcjetProtection()
    - Add `import { handleCors } from './cors'` at the top of `lib/arcjet.ts`
    - Replace the ~15 lines of hardcoded CORS headers in the OPTIONS block (~lines 218-230) with:
      ```
      if (req.method === 'OPTIONS') {
        handleCors(req, res);
        return;
      }
      ```
    - `handleCors()` already sets all required headers including `X-CSRF-Token` in `Access-Control-Allow-Headers` and `Access-Control-Expose-Headers`, and sends 204
    - This eliminates the DRY violation and ensures CORS headers stay in sync with `lib/cors.ts`
    - _Bug_Condition: isBugCondition_CORS(input) where method='OPTIONS' — Arcjet wrapper intercepts before handleCors() runs, responds with incomplete headers_
    - _Expected_Behavior: OPTIONS response includes X-CSRF-Token in Access-Control-Allow-Headers and Access-Control-Expose-Headers, matching lib/cors.ts_
    - _Preservation: Non-OPTIONS requests continue receiving full Arcjet protection; CSRF validation continues rejecting invalid tokens; Arcjet blocks continue returning 403 + SECURITY_VIOLATION_
    - _Requirements: 2.8, 2.9, 2.10, 2.11, 3.9, 3.10, 3.11, 3.12, 3.13_

  - [x] 5.2 Add url.parse() deprecation warning suppression
    - Add a targeted `process.emitWarning` override at module level in `lib/arcjet.ts`
    - Filter only `DEP0169` deprecation warnings, allow all other warnings to pass through
    - Handle both string-form and object-form warnings:
      - String form: `args[0] === 'DeprecationWarning' && args[1] === 'DEP0169'`
      - Object form: `warning.code === 'DEP0169'`
    - Place at top of file (after imports) since `lib/arcjet.ts` is imported by every API endpoint
    - _Bug_Condition: isBugCondition_Deprecation — fires on every API request from a dependency_
    - _Expected_Behavior: DEP0169 warnings suppressed, all other warnings pass through, production logs cleaner_
    - _Preservation: All non-DEP0169 warnings continue to be emitted normally_
    - _Requirements: 2.12, 2.13, 2.14_

  - [x] 5.3 Verify CORS preflight exploration test now passes
    - **Property 1: Expected Behavior** - CORS Preflight Includes CSRF Header
    - **IMPORTANT**: Re-run the SAME CORS tests from task 1 — do NOT write new tests
    - The tests from task 1 assert X-CSRF-Token is in Access-Control-Allow-Headers and Access-Control-Expose-Headers
    - When these tests pass, it confirms the CORS preflight bug is fixed
    - Run CORS preflight exploration tests from step 1
    - **EXPECTED OUTCOME**: Tests PASS (confirms CORS bug is fixed)
    - _Requirements: 2.8, 2.9, 2.10_

  - [x] 5.4 Verify preservation tests still pass for CORS and Arcjet
    - **Property 2: Preservation** - Arcjet Protection on Non-OPTIONS Requests
    - **IMPORTANT**: Re-run the SAME preservation tests from task 2 — do NOT write new tests
    - Run Arcjet non-OPTIONS preservation, CSRF validation preservation, and API envelope preservation tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions in security posture)

- [x] 6. Bundle and validate

  - [x] 6.1 Bundle API source files
    - Run `bun run scripts/bundle-api.mjs` to bundle `api-src/` → `api/`
    - Verify bundle completes without errors
    - Never edit files in `api/` directly — they are auto-generated from `api-src/`

  - [x] 6.2 Run full test suite
    - Run `bun run test` to execute all Vitest tests
    - Verify all exploration tests (task 1) now PASS
    - Verify all preservation tests (task 2) still PASS
    - Verify no other existing tests are broken

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: SQL parameterization tests pass for all filter combinations
  - Verify: VARCHAR overflow tests pass with registrationKey() producing 64-char output
  - Verify: CORS preflight tests pass with X-CSRF-Token in headers
  - Verify: All preservation tests pass confirming no regressions
  - Verify: Bundle completed successfully
  - Verify: Full test suite green
