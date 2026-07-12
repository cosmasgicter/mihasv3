# Implementation Plan

## Group A: Bug 4 — Session 403 (Highest Priority, Cascading Impact)

- [x] 1. Write bug condition exploration test — Session 403 expired JWT
  - **Property 1: Bug Condition** — Expired JWT Returns 403 Instead of 401
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the middleware returns 403 for expired tokens
  - **Scoped PBT Approach**: Scope the property to the concrete failing case: request with expired-but-present access token
  - Backend (hypothesis): Test that `JWTAuthenticationMiddleware` with an expired JWT sets `request._jwt_expired = True` and the response status is 401 (not 403)
  - Frontend (fast-check): Test that `ApiClient` triggers refresh flow when receiving 403 on a GET request to a session/auth endpoint without a CSRF error code
  - Bug condition from design: `isBugCondition_Bug4(input)` where `accessTokenPresent == true AND accessTokenExpired == true AND responseStatus == 403 AND NOT refreshFlowTriggered`
  - Expected behavior: middleware returns 401 for expired-but-present tokens; frontend triggers refresh on auth-related 403
  - Run tests on UNFIXED code — expect FAILURE (backend returns 403, frontend does not refresh on 403)
  - Document counterexamples: e.g., "expired JWT → middleware returns None → DRF returns 403 → no refresh attempted"
  - Backend test file: `backend/tests/property/test_bug4_session_403.py`
  - Frontend test file: `apps/admissions/tests/property/test_bug4_client_refresh.test.ts`
  - Backend command: `cd backend && python3 -m pytest tests/property/test_bug4_session_403.py -v`
  - Frontend command: `cd apps/admissions && bun run test -- tests/property/test_bug4_client_refresh.test.ts`
  - _Requirements: 1.7, 1.8, 1.9_

- [x] 2. Write preservation property tests — Session auth unchanged for valid tokens (BEFORE implementing fix)
  - **Property 2: Preservation** — Valid Token Auth and Genuine 403 Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: valid (non-expired) access tokens authenticate normally via middleware on unfixed code
  - Observe: genuine 403 authorization denials (permission issues, CSRF failures) are not intercepted for refresh on unfixed code
  - Observe: successful token refresh retries the original request exactly once on unfixed code
  - Backend (hypothesis): For any valid JWT token state, middleware authenticates normally without setting `_jwt_expired`
  - Backend (hypothesis): For any request with no token present, middleware returns None and DRF returns 403 (correct behavior for unauthenticated)
  - Frontend (fast-check): For any 403 response with a CSRF error code or on a non-GET request, `ApiClient` does NOT trigger refresh
  - Verify tests PASS on UNFIXED code
  - Backend test file: `backend/tests/property/test_bug4_preservation.py`
  - Frontend test file: `apps/admissions/tests/property/test_bug4_preservation.test.ts`
  - Backend command: `cd backend && python3 -m pytest tests/property/test_bug4_preservation.py -v`
  - Frontend command: `cd apps/admissions && bun run test -- tests/property/test_bug4_preservation.test.ts`
  - _Requirements: 3.8, 3.9, 3.10_

- [x] 3. Fix Bug 4 — Session 403 expired JWT silent auth failure

  - [x] 3.1 Implement backend middleware fix in `backend/apps/common/middleware.py`
    - In `JWTAuthenticationMiddleware._authenticate()`, when `ExpiredSignatureError` is caught, set `request._jwt_expired = True` before returning `None`
    - Add logic (middleware or DRF authentication class) to check `request._jwt_expired` and return 401 instead of letting DRF return 403 for `AnonymousUser` when the token was present but expired
    - _Bug_Condition: isBugCondition_Bug4(input) where accessTokenPresent == true AND accessTokenExpired == true_
    - _Expected_Behavior: Response status is 401 (not 403) for expired-but-present tokens, triggering frontend refresh flow_
    - _Preservation: Valid tokens authenticate normally; no-token requests still get 403; genuine permission 403s unchanged_
    - _Requirements: 1.7, 2.7, 2.8, 2.9, 3.8, 3.9_

  - [x] 3.2 Implement frontend ApiClient defense-in-depth in `apps/admissions/src/services/client.ts`
    - Handle auth-related 403 on GET requests: trigger refresh flow when a GET request to a session/auth endpoint returns 403 without a CSRF error code
    - On refresh failure, display "Your session has expired. Please sign in again." and redirect to login
    - _Bug_Condition: isBugCondition_Bug4(input) where responseStatus == 403 AND NOT refreshFlowTriggered_
    - _Expected_Behavior: ApiClient attempts token refresh on auth-related 403 before treating as permanent failure_
    - _Preservation: CSRF 403s and non-GET 403s continue through existing error handling; successful refresh retries original request once_
    - _Requirements: 1.8, 1.9, 2.7, 2.8, 2.9, 3.9, 3.10_

  - [x] 3.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** — Expired JWT Returns 401 and Triggers Refresh
    - **IMPORTANT**: Re-run the SAME tests from task 1 — do NOT write new tests
    - The tests from task 1 encode the expected behavior for Bug 4
    - When these tests pass, it confirms: middleware returns 401 for expired tokens, ApiClient triggers refresh on auth-related 403
    - Backend command: `cd backend && python3 -m pytest tests/property/test_bug4_session_403.py -v`
    - Frontend command: `cd apps/admissions && bun run test -- tests/property/test_bug4_client_refresh.test.ts`
    - **EXPECTED OUTCOME**: Tests PASS (confirms bug is fixed)
    - _Requirements: 2.7, 2.8, 2.9_

  - [x] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** — Valid Token Auth and Genuine 403 Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Backend command: `cd backend && python3 -m pytest tests/property/test_bug4_preservation.py -v`
    - Frontend command: `cd apps/admissions && bun run test -- tests/property/test_bug4_preservation.test.ts`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint — Bug 4 complete
  - Run full backend test suite: `cd backend && python3 -m pytest`
  - Run full frontend test suite: `cd apps/admissions && bun run test`
  - Run frontend lint: `cd apps/admissions && bun run lint`
  - Run TypeScript check: `cd apps/admissions && bunx tsc -p tsconfig.build.json --noEmit`
  - Ensure all tests pass, ask the user if questions arise

---

## Group B: Bug 1 — CSP/Print CSS (Quick Config Fix + CSP Tightening)

- [x] 5. Write bug condition exploration test — CSP print CSS inlined
  - **Property 3: Bug Condition** — Print CSS Inlined as data: URI
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the Vite config inlines CSS as data: URIs and CSP allows data: in style-src
  - **Scoped PBT Approach**: Scope the property to the concrete failing case: `assetsInlineLimit` is currently 4096, not 0; CSP includes `data:` in style-src
  - Test that `vite.config.ts` has `assetsInlineLimit: 0` (will fail on unfixed code where it is 4096)
  - Test that `vercel.json` CSP `style-src` does NOT contain `data:` (will fail on unfixed code where it does)
  - Bug condition from design: `isBugCondition_Bug1(input)` where `cssFileSize < config.assetsInlineLimit AND config.cspStyleSrc CONTAINS 'data:'`
  - Expected behavior: `assetsInlineLimit` is 0, preventing any CSS from being inlined as `data:` URIs; CSP style-src does not include `data:`
  - Run test on UNFIXED code — expect FAILURE (assetsInlineLimit is 4096, CSP includes data:)
  - Document counterexample: "assetsInlineLimit is 4096, print.css (2.2KB) is inlined as data:text/css;base64; CSP allows data: in style-src"
  - Test file: `apps/admissions/tests/unit/test_bug1_csp_config.test.ts`
  - Command: `cd apps/admissions && bun run test -- tests/unit/test_bug1_csp_config.test.ts`
  - _Requirements: 1.1, 1.2_

- [x] 6. Write preservation property tests — Non-CSS asset behavior unchanged (BEFORE implementing fix)
  - **Property 4: Preservation** — CSS Files Above Limit Still Separate
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: CSS files larger than the inline limit are emitted as separate files on unfixed code
  - Observe: the Vite config structure is valid and other build options are unchanged on unfixed code
  - Test that the Vite config preserves all other build settings when `assetsInlineLimit` changes
  - Note: with `assetsInlineLimit: 0`, ALL assets (including images, fonts, SVGs) will be emitted as separate files — this is the intended trade-off per design doc ("negligible with HTTP/2 and immutable cache headers")
  - Verify test PASSES on UNFIXED code
  - Test file: `apps/admissions/tests/unit/test_bug1_preservation.test.ts`
  - Command: `cd apps/admissions && bun run test -- tests/unit/test_bug1_preservation.test.ts`
  - _Requirements: 3.1, 3.2_

- [x] 7. Fix Bug 1 — CSP print CSS inlined as data: URI + tighten CSP

  - [x] 7.1 Set `assetsInlineLimit: 0` in `apps/admissions/vite.config.ts`
    - Change `assetsInlineLimit` from `4096` to `0` to prevent Vite from inlining any assets as `data:` URIs
    - This eliminates the need for `data:` in the CSP style directives
    - _Bug_Condition: isBugCondition_Bug1(input) where cssFileSize < config.assetsInlineLimit_
    - _Expected_Behavior: All CSS emitted as separate files, no data: URIs in style output_
    - _Preservation: Build output structure unchanged except for asset inlining; HTTP/2 + immutable cache headers mitigate extra requests_
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2_

  - [x] 7.2 Remove `data:` from `style-src` and `style-src-elem` in `apps/admissions/vercel.json`
    - Change `style-src 'self' 'unsafe-inline' data:` to `style-src 'self' 'unsafe-inline'`
    - Change `style-src-elem 'self' 'unsafe-inline' data:` to `style-src-elem 'self' 'unsafe-inline'`
    - This tightens the CSP now that no CSS is inlined as `data:` URIs
    - _Requirements: 2.2a_

  - [x] 7.3 Verify bug condition exploration test now passes
    - **Property 3: Expected Behavior** — Print CSS Emitted as Separate File, CSP Tightened
    - **IMPORTANT**: Re-run the SAME test from task 5 — do NOT write a new test
    - Command: `cd apps/admissions && bun run test -- tests/unit/test_bug1_csp_config.test.ts`
    - **EXPECTED OUTCOME**: Test PASSES (confirms assetsInlineLimit is now 0 and CSP no longer includes data: in style-src)
    - _Requirements: 2.1, 2.2, 2.2a_

  - [x] 7.4 Verify preservation tests still pass
    - **Property 4: Preservation** — CSS Files Above Limit Still Separate
    - **IMPORTANT**: Re-run the SAME test from task 6 — do NOT write new tests
    - Command: `cd apps/admissions && bun run test -- tests/unit/test_bug1_preservation.test.ts`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

- [x] 8. Checkpoint — Bug 1 complete
  - Run frontend lint: `cd apps/admissions && bun run lint`
  - Run TypeScript check: `cd apps/admissions && bunx tsc -p tsconfig.build.json --noEmit`
  - Ensure all tests pass, ask the user if questions arise

---

## Group C: Bug 2 — ApplicationStatus Error Handling (Depends on Bug 4 Backend Fix)

- [x] 9. Write bug condition exploration test — Auth errors swallowed in ApplicationStatus
  - **Property 5: Bug Condition** — AuthenticationError Caught as "Not Found"
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate AuthenticationError is swallowed by the queryFn catch block
  - **Scoped PBT Approach**: Scope the property to the concrete failing case: `applicationService.getById()` throws `AuthenticationError` (401)
  - Test (fast-check): For any error thrown by `applicationService.getById()`, if it is an `AuthenticationError` it MUST propagate (re-throw); if it is any other error, it is caught as "Application not found"
  - Bug condition from design: `isBugCondition_Bug2(input)` where `apiResponse.status IN [401, 403] AND sessionValid == false AND errorCaughtAs == 'Application not found or access denied'`
  - Expected behavior: `AuthenticationError` propagates to trigger auth redirect flow
  - Run test on UNFIXED code — expect FAILURE (AuthenticationError is caught and replaced with generic error)
  - Document counterexample: "AuthenticationError(401) → caught → throws 'Application not found or access denied' instead of propagating"
  - Test file: `apps/admissions/tests/property/test_bug2_auth_error.test.ts`
  - Command: `cd apps/admissions && bun run test -- tests/property/test_bug2_auth_error.test.ts`
  - _Requirements: 1.3, 1.4_

- [x] 10. Write preservation property tests — Valid 404 still shows Not Found (BEFORE implementing fix)
  - **Property 6: Preservation** — Non-Auth Errors Still Show Application Not Found
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: 404 errors from `getById()` show "Application Not Found" on unfixed code
  - Observe: valid session + valid app ID loads the full status page on unfixed code
  - Test (fast-check): For any non-AuthenticationError thrown by `getById()` (404, network error, generic Error), the queryFn catches it and throws "Application not found or access denied"
  - Verify test PASSES on UNFIXED code
  - Test file: `apps/admissions/tests/property/test_bug2_preservation.test.ts`
  - Command: `cd apps/admissions && bun run test -- tests/property/test_bug2_preservation.test.ts`
  - _Requirements: 3.3, 3.4_

- [x] 11. Fix Bug 2 — ApplicationStatus catches auth errors as "Not Found"

  - [x] 11.1 Update error handling in `apps/admissions/src/pages/student/ApplicationStatus.tsx`
    - Import `AuthenticationError` from `@/services/client`
    - In the `queryFn` catch block (~line 75), check if the error is an `AuthenticationError` and re-throw it before the generic catch
    - Keep generic catch for 404 and other non-auth errors to continue showing "Application not found"
    - _Bug_Condition: isBugCondition_Bug2(input) where apiResponse.status IN [401, 403] AND sessionValid == false_
    - _Expected_Behavior: AuthenticationError propagates to React Query error handling and global auth redirect flow_
    - _Preservation: 404 errors still show "Application Not Found"; valid sessions still load the page_
    - _Requirements: 1.3, 1.4, 2.3, 2.4, 3.3, 3.4_

  - [x] 11.2 Verify bug condition exploration test now passes
    - **Property 5: Expected Behavior** — AuthenticationError Propagates
    - **IMPORTANT**: Re-run the SAME test from task 9 — do NOT write a new test
    - Command: `cd apps/admissions && bun run test -- tests/property/test_bug2_auth_error.test.ts`
    - **EXPECTED OUTCOME**: Test PASSES (confirms AuthenticationError now propagates)
    - _Requirements: 2.3, 2.4_

  - [x] 11.3 Verify preservation tests still pass
    - **Property 6: Preservation** — Non-Auth Errors Still Show Application Not Found
    - **IMPORTANT**: Re-run the SAME test from task 10 — do NOT write new tests
    - Command: `cd apps/admissions && bun run test -- tests/property/test_bug2_preservation.test.ts`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

- [x] 12. Checkpoint — Bug 2 complete
  - Run frontend test suite: `cd apps/admissions && bun run test`
  - Run frontend lint: `cd apps/admissions && bun run lint`
  - Run TypeScript check: `cd apps/admissions && bunx tsc -p tsconfig.build.json --noEmit`
  - Ensure all tests pass, ask the user if questions arise

---

## Group D: Bug 3 — Wizard Grade Hydration Race (Independent Frontend Fix)

- [x] 13. Write bug condition exploration test — Grade validation race during hydration
  - **Property 7: Bug Condition** — Grade Validation Runs on Empty State During Hydration
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate validation runs against empty `selectedGrades` during async hydration
  - **Scoped PBT Approach**: Scope the property to the concrete failing case: education step during draft restoration with `gradesHydrated == false` and `serverGradeCount >= 5`
  - Test (fast-check): For any wizard state where `currentStep == 'education' AND restoringDraft == true AND gradesHydrated == false AND serverGradeCount >= 5`, validation either skips grade count check or shows loading indicator (not "0 added" error)
  - Bug condition from design: `isBugCondition_Bug3(input)` where `currentStep == 'education' AND restoringDraft == true AND gradesHydrated == false AND serverGradeCount >= 5`
  - Expected behavior: validation deferred during hydration; no false "0 added" error
  - Run test on UNFIXED code — expect FAILURE (validation runs on empty `selectedGrades` during hydration)
  - Document counterexample: "Draft with 7 grades → education step → validation runs before hydration → shows '0 added'"
  - Test file: `apps/admissions/tests/property/test_bug3_hydration_race.test.ts`
  - Command: `cd apps/admissions && bun run test -- tests/property/test_bug3_hydration_race.test.ts`
  - _Requirements: 1.5, 1.6_

- [x] 14. Write preservation property tests — Grade validation enforced after hydration (BEFORE implementing fix)
  - **Property 8: Preservation** — Grade Validation Correct After Hydration and for Fresh Apps
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: fresh applications with no grades show "0 added" validation on unfixed code
  - Observe: manual grade add/remove validates in real-time on unfixed code
  - Observe: fewer than 5 valid grades after hydration shows correct count on unfixed code
  - Test (fast-check): For any wizard state where `gradesHydrating == false` (hydration complete or never started), validation enforces minimum 5 valid subjects and displays correct count
  - Test (fast-check): For any combination of `selectedGrades` array lengths (0-20) with `gradesHydrating == false`, validation produces correct pass/fail result
  - Verify tests PASS on UNFIXED code
  - Test file: `apps/admissions/tests/property/test_bug3_preservation.test.ts`
  - Command: `cd apps/admissions && bun run test -- tests/property/test_bug3_preservation.test.ts`
  - _Requirements: 3.5, 3.6, 3.7_

- [x] 15. Fix Bug 3 — Wizard grade hydration race condition

  - [x] 15.1 Add `gradesHydrating` state to `apps/admissions/src/pages/student/applicationWizard/hooks/wizard/state/useWizardState.ts`
    - Add `gradesHydrating` boolean state, initialized as `false`
    - Expose setter to allow controller to toggle hydration state
    - _Bug_Condition: isBugCondition_Bug3(input) where restoringDraft == true AND gradesHydrated == false_
    - _Expected_Behavior: gradesHydrating flag tracks async hydration lifecycle_
    - _Requirements: 1.5, 1.6, 2.5, 2.6_

  - [x] 15.2 Wire hydration lifecycle in `apps/admissions/src/pages/student/applicationWizard/hooks/useWizardController.ts`
    - Set `gradesHydrating = true` before calling `hydrateServerGrades()` in the draft restoration flow
    - Set `gradesHydrating = false` after `hydrateServerGrades()` resolves (in both success and error paths via try/finally)
    - Expose `gradesHydrating` in the controller return value
    - _Bug_Condition: isBugCondition_Bug3(input) where hydrateServerGrades is async_
    - _Expected_Behavior: gradesHydrating is true during async hydration, false after completion_
    - _Preservation: Non-hydration flows unaffected; gradesHydrating stays false for fresh applications_
    - _Requirements: 1.5, 2.5, 2.6, 3.5_

  - [x] 15.3 Skip grade validation during hydration in `apps/admissions/src/pages/student/applicationWizard/index.tsx`
    - In the education step validation block (~lines 155-159), check `gradesHydrating` flag
    - When `gradesHydrating == true`: skip grade count validation or show loading indicator instead of "0 added" error
    - When `gradesHydrating == false`: enforce existing minimum 5 valid subjects validation
    - _Bug_Condition: isBugCondition_Bug3(input) where currentStep == 'education' AND gradesHydrated == false_
    - _Expected_Behavior: No false "0 added" error during hydration; correct validation after hydration completes_
    - _Preservation: Fresh applications still show "0 added"; manual grade changes still validate in real-time; fewer than 5 grades after hydration still blocked_
    - _Requirements: 1.5, 1.6, 2.5, 2.6, 3.5, 3.6, 3.7_

  - [x] 15.4 Verify bug condition exploration test now passes
    - **Property 7: Expected Behavior** — Grade Validation Deferred During Hydration
    - **IMPORTANT**: Re-run the SAME test from task 13 — do NOT write a new test
    - Command: `cd apps/admissions && bun run test -- tests/property/test_bug3_hydration_race.test.ts`
    - **EXPECTED OUTCOME**: Test PASSES (confirms no false "0 added" during hydration)
    - _Requirements: 2.5, 2.6_

  - [x] 15.5 Verify preservation tests still pass
    - **Property 8: Preservation** — Grade Validation Correct After Hydration and for Fresh Apps
    - **IMPORTANT**: Re-run the SAME tests from task 14 — do NOT write new tests
    - Command: `cd apps/admissions && bun run test -- tests/property/test_bug3_preservation.test.ts`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

- [x] 16. Checkpoint — Bug 3 complete
  - Run frontend test suite: `cd apps/admissions && bun run test`
  - Run frontend lint: `cd apps/admissions && bun run lint`
  - Run TypeScript check: `cd apps/admissions && bunx tsc -p tsconfig.build.json --noEmit`
  - Ensure all tests pass, ask the user if questions arise

---

## Group E: Bug 5 — Email Slip (New Feature, Lowest Priority)

- [x] 17. Write bug condition exploration test — Email slip endpoint missing
  - **Property 9: Bug Condition** — Email Slip Returns Hardcoded Error
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the email slip endpoint does not exist and frontend returns hardcoded error
  - **Scoped PBT Approach**: Scope the property to the concrete failing case: `sendEmail == true` with valid email
  - Backend (hypothesis): Test that `POST /api/v1/applications/{id}/email-slip/` with valid auth and email creates an `EmailQueue` record and dispatches `send_email_task` (will 404 on unfixed code)
  - Frontend (fast-check): Test that `slipService` calls the backend endpoint when `sendEmail == true` and email is present (will return hardcoded error on unfixed code)
  - Bug condition from design: `isBugCondition_Bug5(input)` where `sendEmail == true AND email IS NOT EMPTY AND backendEndpoint NOT EXISTS`
  - Expected behavior: backend creates EmailQueue record and dispatches via send_email_task; frontend calls backend and handles success/failure
  - Run tests on UNFIXED code — expect FAILURE (endpoint 404s, frontend returns hardcoded error)
  - Document counterexample: "POST /api/v1/applications/{id}/email-slip/ returns 404; slipService returns 'not implemented' error"
  - Backend test file: `backend/tests/property/test_bug5_email_slip.py`
  - Frontend test file: `apps/admissions/tests/property/test_bug5_slip_service.test.ts`
  - Backend command: `cd backend && python3 -m pytest tests/property/test_bug5_email_slip.py -v`
  - Frontend command: `cd apps/admissions && bun run test -- tests/property/test_bug5_slip_service.test.ts`
  - _Requirements: 1.10, 1.11_

- [x] 18. Write preservation property tests — Direct slip download unchanged (BEFORE implementing fix)
  - **Property 10: Preservation** — PDF Download and Missing Email Error Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: direct PDF slip download works via `generateApplicationSlip()` on unfixed code
  - Observe: "Missing applicant email address" error shows when no email is on file on unfixed code
  - Frontend (fast-check): For any request where `sendEmail == false`, `slipService` generates PDF locally via `generateApplicationSlip()` without any backend call
  - Frontend (fast-check): For any request where email is empty/missing, `slipService` returns "Missing applicant email address" error
  - Verify tests PASS on UNFIXED code
  - Test file: `apps/admissions/tests/property/test_bug5_preservation.test.ts`
  - Command: `cd apps/admissions && bun run test -- tests/property/test_bug5_preservation.test.ts`
  - _Requirements: 3.11, 3.12_

- [x] 19. Fix Bug 5 — Email slip sending not implemented

  - [x] 19.1 Create `EmailSlipView` in `backend/apps/applications/views.py`
    - Create `POST /api/v1/applications/{id}/email-slip/` endpoint
    - Validate requesting user owns the application
    - Accept `{ email }` in request body
    - Generate slip data from the application record
    - Render HTML email body with slip details
    - Create `EmailQueue` record and dispatch via `send_email_task.delay()`
    - Return `{ success: true, data: { queued_id } }` on success or appropriate error
    - _Bug_Condition: isBugCondition_Bug5(input) where sendEmail == true AND email IS NOT EMPTY AND endpoint NOT EXISTS_
    - _Expected_Behavior: Endpoint creates EmailQueue record and dispatches send_email_task; returns success with queued_id_
    - _Preservation: No impact on existing application views or other endpoints_
    - _Requirements: 1.10, 1.11, 2.10, 2.11, 2.12_

  - [x] 19.2 Register URL pattern in `backend/apps/applications/urls.py`
    - Add URL pattern for `applications/{id}/email-slip/` pointing to `EmailSlipView`
    - _Requirements: 2.10_

  - [x] 19.3 Replace hardcoded error in `apps/admissions/src/lib/slipService.ts`
    - When `sendEmail == true` and email is present, call `apiClient.request('/applications/{id}/email-slip/', { method: 'POST', body: JSON.stringify({ email }) })`
    - On success: set `emailed = true` and `queuedId` from response
    - On failure: set `emailError` with backend error message, fall back to download behavior
    - _Bug_Condition: isBugCondition_Bug5(input) where sendEmail == true AND email IS NOT EMPTY_
    - _Expected_Behavior: Frontend calls backend endpoint; handles success (confirmation) and failure (fallback to download)_
    - _Preservation: Direct PDF download path completely unchanged; missing-email error unchanged_
    - _Requirements: 1.10, 1.11, 2.10, 2.11, 2.12, 3.11, 3.12_

  - [x] 19.4 Verify bug condition exploration test now passes
    - **Property 9: Expected Behavior** — Email Slip Sends Via Backend
    - **IMPORTANT**: Re-run the SAME tests from task 17 — do NOT write new tests
    - Backend command: `cd backend && python3 -m pytest tests/property/test_bug5_email_slip.py -v`
    - Frontend command: `cd apps/admissions && bun run test -- tests/property/test_bug5_slip_service.test.ts`
    - **EXPECTED OUTCOME**: Tests PASS (confirms email slip endpoint works and frontend calls it)
    - _Requirements: 2.10, 2.11, 2.12_

  - [x] 19.5 Verify preservation tests still pass
    - **Property 10: Preservation** — PDF Download and Missing Email Error Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 18 — do NOT write new tests
    - Command: `cd apps/admissions && bun run test -- tests/property/test_bug5_preservation.test.ts`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

- [x] 20. Checkpoint — Bug 5 complete
  - Run full backend test suite: `cd backend && python3 -m pytest`
  - Run full frontend test suite: `cd apps/admissions && bun run test`
  - Run frontend lint: `cd apps/admissions && bun run lint`
  - Run TypeScript check: `cd apps/admissions && bunx tsc -p tsconfig.build.json --noEmit`
  - Ensure all tests pass, ask the user if questions arise

---

## Final Checkpoint

- [x] 21. Final validation — All 5 bugs fixed
  - Run full backend test suite: `cd backend && python3 -m pytest`
  - Run full frontend test suite: `cd apps/admissions && bun run test`
  - Run frontend lint: `cd apps/admissions && bun run lint`
  - Run TypeScript check: `cd apps/admissions && bunx tsc -p tsconfig.build.json --noEmit`
  - Verify all 10 property tests pass (5 bug condition + 5 preservation)
  - Confirm no regressions across the full test suite
  - Ask the user if questions arise
