# Implementation Plan

## Phase 1 — Backend First

- [x] 1. Write bug condition exploration tests (backend)
  - **Property 1: Bug Condition** — SSE 406, Logout CSRF, Admin Refresh, Legacy Endpoints
  - **CRITICAL**: These tests MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: These tests encode the expected behavior — they will validate the fixes when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate each backend bug exists
  - **Evidence First**: Before writing tests, query `ErrorLog` table for production evidence per CTO guidance:
    - `SELECT * FROM error_logs WHERE endpoint LIKE '%/events/stream%' OR message LIKE '%406%' ORDER BY created_at DESC LIMIT 20;`
    - `SELECT * FROM error_logs WHERE message LIKE '%CSRF%' OR endpoint LIKE '%/auth/logout%' ORDER BY created_at DESC LIMIT 20;`
    - `SELECT * FROM error_logs WHERE endpoint LIKE '%/admin/dashboard%' OR (source = 'backend' AND entity_type = 'admin') ORDER BY created_at DESC LIMIT 20;`
  - **Scoped PBT Approach**: Scope each property to the concrete failing case(s):
    - **Bug 1 (SSE)**: Test `GET /api/v1/events/stream/` with `Accept: text/event-stream` — assert 200 with `Content-Type: text/event-stream` (will FAIL with 406 on unfixed code because `EnvelopeRenderer` cannot satisfy the accept header)
    - **Bug 6 (Logout CSRF)**: Test `POST /api/v1/auth/logout/` without CSRF token — assert request is not blocked by CSRF middleware (will FAIL with 403 `CSRF_VALIDATION_FAILED` on unfixed code because logout is not in `EXEMPT_PATTERNS`)
    - **Bug 8 (Admin Refresh)**: Test admin dashboard endpoints return valid JSON on authenticated GET — assert no 500 or HTML error pages (will FAIL if backend throws unhandled exceptions)
    - **Bug 9 (Legacy Endpoints)**: Audit frontend `apiClient.request` calls against backend URL patterns — assert all used methods/paths are supported (will FAIL if any legacy patterns are unsupported)
  - Test file: `backend/tests/property/test_post_migration_qa_bugs.py` using pytest + hypothesis
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct — it proves the bugs exist)
  - Document counterexamples found to understand root cause
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.6, 1.8, 1.9_

- [x] 2. Write preservation property tests for backend (BEFORE implementing fixes)
  - **Property 2: Preservation** — Backend Behavior Unchanged for Non-Bug Inputs
  - **IMPORTANT**: Follow observation-first methodology
  - **Observe behavior on UNFIXED code** for non-buggy inputs:
    - Observe: `GET /api/v1/events/poll/` returns JSON notifications correctly (SSE polling fallback)
    - Observe: `POST /api/v1/auth/login/` with valid CSRF token succeeds (CSRF enforcement on non-exempt endpoints)
    - Observe: `PATCH /api/v1/applications/{id}/` with valid CSRF token succeeds (existing API contracts)
    - Observe: `POST /api/v1/applications/{id}/review/` with `{new_status: "approved"}` succeeds (review endpoint)
    - Observe: `POST /api/v1/applications/{id}/review/` with legacy `{status: "approved"}` is normalized to `new_status` (legacy normalization)
    - Observe: `PUT /api/v1/applications/{id}/` succeeds (PUT support on detail view)
  - Write property-based tests using hypothesis:
    - For all non-exempt POST/PUT/PATCH/DELETE paths, CSRF enforcement still requires valid token (from Preservation Req 3.6)
    - For all GET requests to `/api/v1/events/poll/`, response is valid JSON with notifications array (from Preservation Req 3.1)
    - For all application PATCH/PUT requests with valid auth+CSRF, response is 200 with application data (from Preservation Req 3.9)
    - For all review POST requests with `new_status` field, response processes correctly (from Preservation Req 3.9)
  - Test file: `backend/tests/property/test_post_migration_qa_preservation.py` using pytest + hypothesis
  - Verify tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.5, 3.6, 3.8, 3.9_

- [ ] 3. Fix Phase 1 backend bugs (SSE, Logout CSRF, Admin Refresh, Legacy Endpoints)

  - [x] 3.1 Fix Bug 1 — SSE 406/CORS content negotiation
    - Override `perform_content_negotiation` on `SSEStreamView` to always select `ServerSentEventRenderer` for SSE requests, bypassing DRF's global `DEFAULT_RENDERER_CLASSES` (`EnvelopeRenderer`-only) content negotiation
    - Alternatively, add a `content_negotiation_class` override that accepts `text/event-stream`
    - Verify `CORS_ALLOW_HEADERS` includes `last-event-id` (already present via `default_headers` extension in `base.py`)
    - Verify `CORS_EXPOSE_HEADERS` includes any SSE-specific response headers if needed
    - File: `backend/apps/common/sse.py`
    - File: `backend/config/settings/base.py` (verify CORS config)
    - _Bug_Condition: isBugCondition_SSE(request) where request.headers['Accept'] == 'text/event-stream' AND globalRendererClasses == [EnvelopeRenderer]_
    - _Expected_Behavior: SSEStreamView returns 200 with Content-Type: text/event-stream and valid CORS headers_
    - _Preservation: SSE polling fallback at /api/v1/events/poll/ continues returning JSON notifications (Req 3.1)_
    - _Requirements: 1.1, 2.1, 3.1_

  - [x] 3.2 Fix Bug 6 — Logout CSRF exemption + error code alignment
    - Add `re.compile(r"^/api/v1/auth/logout/?$")` to `EXEMPT_PATTERNS` in `CSRFEnforcementMiddleware`
    - File: `backend/apps/common/middleware.py`
    - Security note: Logout CSRF exemption is low-risk (logout is not destructive) and prevents trapping users in broken session state
    - _Bug_Condition: isBugCondition_Logout(request) where request.path == '/api/v1/auth/logout/' AND path NOT IN EXEMPT_PATTERNS_
    - _Expected_Behavior: POST /api/v1/auth/logout/ completes without CSRF 403, clears auth cookies_
    - _Preservation: CSRF enforcement remains active on all other non-exempt state-changing endpoints (Req 3.6)_
    - _Requirements: 1.6, 2.6, 3.6_

  - [x] 3.3 Fix Bug 8 — Admin dashboard refresh backend exceptions
    - Query `ErrorLog` for 500s on admin dashboard endpoints
    - Check admin dashboard API endpoints for unhandled exceptions
    - Ensure all admin dashboard endpoints return structured JSON error responses (not HTML or generic 500)
    - Verify SPA fallback configuration serves index.html for `/admin/*` routes
    - File: backend admin dashboard views (identify specific files from ErrorLog evidence)
    - _Bug_Condition: isBugCondition_AdminRefresh(context) where route == '/admin/dashboard' AND isPageRefresh AND backendThrowsException_
    - _Expected_Behavior: Admin dashboard refresh returns valid JSON data with 200 or structured error response with diagnostic status code_
    - _Preservation: Admin dashboard continues displaying statistics and activity when data loads successfully (Req 3.8)_
    - _Requirements: 1.8, 2.8, 3.8_

  - [x] 3.4 Fix Bug 9 — Legacy endpoint/method audit and compatibility
    - Grep frontend code for all `apiClient.request` calls with `PUT`, `PATCH`, `DELETE` methods
    - Cross-reference against `backend/apps/applications/urls.py` and other URL patterns
    - Identify any mismatches and add backend support or frontend normalization
    - Verify: `ApplicationDetailView` handles PUT+PATCH ✓, `/details/` alias exists ✓, `ApplicationReviewView` handles POST+PATCH with `_normalize_legacy_review_payload` ✓
    - Fix any remaining incompatibilities found during audit
    - _Bug_Condition: isBugCondition_LegacyEndpoints(request) where method NOT IN backendSupportedMethods(path) OR path NOT IN backendRegisteredPaths_
    - _Expected_Behavior: All frontend API calls use compatible methods/paths, returning valid responses instead of 404/405_
    - _Preservation: Existing PATCH for application updates and POST for reviews with new_status continue working (Req 3.9)_
    - _Requirements: 1.9, 2.9, 3.9_

  - [x] 3.5 Verify bug condition exploration tests now pass (backend)
    - **Property 1: Expected Behavior** — SSE 406, Logout CSRF, Admin Refresh, Legacy Endpoints
    - **IMPORTANT**: Re-run the SAME tests from task 1 — do NOT write new tests
    - The tests from task 1 encode the expected behavior
    - When these tests pass, it confirms the expected behavior is satisfied
    - Run bug condition exploration tests from `backend/tests/property/test_post_migration_qa_bugs.py`
    - **EXPECTED OUTCOME**: Tests PASS (confirms backend bugs are fixed)
    - _Requirements: 2.1, 2.6, 2.8, 2.9_

  - [x] 3.6 Verify preservation tests still pass (backend)
    - **Property 2: Preservation** — Backend Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from `backend/tests/property/test_post_migration_qa_preservation.py`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all backend tests still pass after fixes (no regressions)

- [x] 4. Checkpoint — Phase 1 backend fixes verified
  - Run full backend test suite: `cd backend && python3 -m pytest`
  - Ensure all tests pass, ask the user if questions arise
  - Backend is ready to deploy before frontend changes

## Phase 2 — Frontend (after backend is live)

- [x] 5. Write bug condition exploration tests (frontend)
  - **Property 1: Bug Condition** — SW Staleness, Version Prompt, Catalog, Logout CSRF Frontend, Admin Routing
  - **CRITICAL**: These tests MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: These tests encode the expected behavior — they will validate the fixes when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate each frontend bug exists
  - **Scoped PBT Approach**: Scope each property to the concrete failing case(s):
    - **Bug 2+3 (SW + Version)**: Test that `static-v1` cache entries for old bundle URLs are purged on SW activation with new manifest (will FAIL — stale bundles persist). Test that two manifests with same `VITE_APP_VERSION` but different content produce distinct `APP_VERSION` strings (will FAIL — fingerprint collision). Test mobile prompt positioning is above bottom nav bar (will FAIL — obscured by nav)
    - **Bug 4 (Catalog)**: Test `normalizeCollection` with all Django response shapes after envelope unwrapping: `{results: [...], count: N}`, raw array, `{programs: [...]}` (may PASS if normalizer already handles these — confirms non-issue or surfaces edge case)
    - **Bug 6 (Frontend CSRF)**: Test that `apiClient` CSRF 403 retry triggers on `errorCode === 'CSRF_VALIDATION_FAILED'` (will FAIL — frontend checks for `CSRF_INVALID`/`CSRF_MISSING` only)
    - **Bug 7 (Admin Routing)**: Test `normalizeAuthUser` with Django login response where `role` is missing or nested under `user_metadata` — assert it returns the correct admin role (will FAIL — defaults to `'student'`)
  - Test file: `apps/admissions/tests/property/postMigrationQaBugs.property.test.ts` using vitest + fast-check
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct — it proves the bugs exist)
  - Document counterexamples found to understand root cause
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.2, 1.3, 1.4, 1.6, 1.7_

- [x] 6. Write preservation property tests for frontend (BEFORE implementing fixes)
  - **Property 2: Preservation** — Frontend Behavior Unchanged for Non-Bug Inputs
  - **IMPORTANT**: Follow observation-first methodology
  - **Observe behavior on UNFIXED code** for non-buggy inputs:
    - Observe: `normalizeCollection` with raw array input returns normalized items correctly
    - Observe: `normalizeCollection` with `{results: [...]}` paginated input returns normalized items correctly
    - Observe: `normalizeCollection` with `{programs: [...]}` keyed input returns normalized items correctly
    - Observe: `normalizeAuthUser` with payload containing top-level `role: 'student'` returns `{role: 'student'}`
    - Observe: `extractAuthUser` with `{user: {id, email, role: 'student'}}` envelope returns correct user
    - Observe: `apiClient.unwrapApiResponse` with `{success: true, data: {...}}` returns inner data
    - Observe: Service worker caches same-origin static assets normally when no new build is deployed
  - Write property-based tests using fast-check:
    - For all valid catalog response shapes (raw array, paginated, keyed), `normalizeCollection` returns a non-empty array when items exist (from Preservation Req 3.4)
    - For all user payloads with explicit top-level `role`, `normalizeAuthUser` preserves the role value (from Preservation Req 3.7)
    - For all `{success: true, data: T}` envelopes, `unwrapApiResponse` returns `T` (from Preservation Req 3.9)
    - For all student user logins, route resolution navigates to `/student/dashboard` (from Preservation Req 3.7)
  - Test file: `apps/admissions/tests/property/postMigrationQaPreservation.property.test.ts` using vitest + fast-check
  - Verify tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.2, 3.3, 3.4, 3.7, 3.9_

- [ ] 7. Fix Phase 2 frontend bugs (SW, Version, Catalog, CSRF Frontend, Admin Routing)

  - [x] 7.1 Fix Bug 2+3 — Service worker staleness + version prompt (coupled fix)
    - Bump `CACHE_RESET_VERSION` in `apps/admissions/src/main.tsx` to a new value (e.g., `'post-qa-2026-04-XX'`) to trigger fresh one-time cache reset
    - Fix `static-v1` cache: on SW activation, purge stale JS/CSS bundle entries not in current precache manifest
    - Add explicit `NetworkOnly` route for cross-origin API requests to `api.mihas.edu.zm` to prevent any caching
    - Fix version comparison in `applyDiscoveredVersion` in `useServiceWorkerUpdate.ts` to use robust comparison accounting for manifest fingerprint changes even when `VITE_APP_VERSION` is static
    - Fix mobile prompt positioning in `ServiceWorkerUpdatePrompt.tsx`: adjust `bottom-[calc(env(safe-area-inset-bottom)+5.5rem)]` to account for actual bottom nav bar height
    - Files: `apps/admissions/src/main.tsx`, `apps/admissions/src/service-worker.ts`, `apps/admissions/src/hooks/useServiceWorkerUpdate.ts`, `apps/admissions/src/components/ServiceWorkerUpdatePrompt.tsx`
    - _Bug_Condition: isBugCondition_SWStale — localStorage already has CACHE_RESET_VERSION AND new build deployed; isBugCondition_VersionPrompt — currentSWVersion == newSWVersion AND actual build differs_
    - _Expected_Behavior: Fresh assets served after deploy, distinct version strings in prompt, mobile prompt visible and tappable_
    - _Preservation: SW continues caching same-origin static assets normally when no new build deployed (Req 3.2), genuine updates still show prompt (Req 3.3)_
    - _Requirements: 1.2, 1.3, 2.2, 2.3, 3.2, 3.3_

  - [x] 7.2 Fix Bug 4 — Catalog normalizer defensive fallback
    - Verify `normalizeCollection` handles all Django response shapes after envelope unwrapping
    - Add defensive logging when items array is empty but response is non-null (to capture unexpected shapes in production)
    - Add fallback: if response is a non-null object with none of the expected keys, attempt to extract any array-valued property as items
    - File: `apps/admissions/src/services/catalog.ts`
    - _Bug_Condition: isBugCondition_Catalog — unwrapped response is not array, not {results}, not {programs}/{intakes}_
    - _Expected_Behavior: normalizeCollection extracts items from any Django response shape, returns non-empty collection when items exist_
    - _Preservation: Existing response shapes (raw array, keyed object, paginated) continue normalizing correctly (Req 3.4)_
    - _Requirements: 1.4, 2.4, 3.4_

  - [x] 7.3 Fix Bug 6 (frontend side) — CSRF error code mismatch in apiClient
    - Update CSRF 403 retry condition in `apiClient` from `errorCode === 'CSRF_INVALID' || errorCode === 'CSRF_MISSING'` to also include `errorCode === 'CSRF_VALIDATION_FAILED'`
    - This matches the actual error code returned by `CSRFEnforcementMiddleware` (`code: 'CSRF_VALIDATION_FAILED'`)
    - File: `apps/admissions/src/services/client.ts`
    - _Bug_Condition: Frontend checks wrong CSRF error codes, retry never triggers for CSRF_VALIDATION_FAILED_
    - _Expected_Behavior: apiClient retries on CSRF_VALIDATION_FAILED by re-fetching CSRF token from session endpoint_
    - _Preservation: Existing 401 retry, envelope unwrapping, and cache invalidation continue working (Req 3.9)_
    - _Requirements: 1.6, 2.6, 3.6_

  - [x] 7.4 Fix Bug 7 — Admin routing role resolution + cache clearing
    - QA narrowing first: check Django login response shape for `role` field location
    - Fix `normalizeAuthUser` in `useSessionListener.ts` to extract `role` from correct location in Django response (check `user.role`, `user.user_metadata.role`, `user.app_metadata.role`)
    - Ensure `signIn` atomically seeds the correct role before navigation and clears stale session/route caches
    - Ensure route guard waits for role resolution before rendering
    - File: `apps/admissions/src/hooks/auth/useSessionListener.ts`
    - _Bug_Condition: isBugCondition_AdminRouting — user.role == 'admin' AND normalizeAuthUser defaults to 'student' because role is missing/nested differently_
    - _Expected_Behavior: Admin login navigates to /admin/dashboard with correct role resolved_
    - _Preservation: Student login continues navigating to /student/dashboard with correct route guards (Req 3.7)_
    - _Requirements: 1.7, 2.7, 3.7_

  - [x] 7.5 Verify bug condition exploration tests now pass (frontend)
    - **Property 1: Expected Behavior** — SW Staleness, Version Prompt, Catalog, CSRF Frontend, Admin Routing
    - **IMPORTANT**: Re-run the SAME tests from task 5 — do NOT write new tests
    - The tests from task 5 encode the expected behavior
    - When these tests pass, it confirms the expected behavior is satisfied
    - Run bug condition exploration tests from `apps/admissions/tests/property/postMigrationQaBugs.property.test.ts`
    - **EXPECTED OUTCOME**: Tests PASS (confirms frontend bugs are fixed)
    - _Requirements: 2.2, 2.3, 2.4, 2.6, 2.7_

  - [x] 7.6 Verify preservation tests still pass (frontend)
    - **Property 2: Preservation** — Frontend Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 6 — do NOT write new tests
    - Run preservation property tests from `apps/admissions/tests/property/postMigrationQaPreservation.property.test.ts`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all frontend tests still pass after fixes (no regressions)

- [x] 8. Checkpoint — Phase 2 frontend fixes verified
  - Run full frontend test suite: `cd apps/admissions && bun run test`
  - Ensure all tests pass, ask the user if questions arise
  - Frontend is ready to deploy after backend is live

## Phase 3 — Investigation (parallel)

- [x] 9. Bug 5 — Payment page discovery and fix
  - **Discovery Task**: The exact failing endpoint, status code, and response body are unknown
  - Step 1: Query `ErrorLog` for production evidence:
    - `SELECT * FROM error_logs WHERE entity_type = 'payments' OR endpoint LIKE '%payment%' OR endpoint LIKE '%finance%' ORDER BY created_at DESC LIMIT 20;`
  - Step 2: Reproduce in browser — navigate to payment page, capture network tab (endpoint, status, response body)
  - Step 3: Check if payment endpoint exists in Django URL patterns
  - Step 4: Check if frontend payment service uses correct endpoint path and method
  - Step 5: Identify root cause (missing endpoint, auth failure, response shape mismatch, CSRF issue, or backend exception)
  - Step 6: Design and implement fix based on findings
  - Step 7: Write exploration test confirming the bug, then verify fix resolves it
  - Step 8: Write preservation test ensuring existing payment flows (when data is valid) continue working
  - _Bug_Condition: isBugCondition_Payment — user navigates to payment page AND payment API call fails (exact condition TBD)_
  - _Expected_Behavior: Payment page loads successfully or displays specific diagnostic error (endpoint, status, error code)_
  - _Preservation: Payment display continues working when payment data and endpoint respond correctly (Req 3.5)_
  - _Requirements: 1.5, 2.5, 3.5_

- [x] 10. Final checkpoint — All phases complete
  - Run full backend test suite: `cd backend && python3 -m pytest`
  - Run full frontend test suite: `cd apps/admissions && bun run test`
  - Verify all 9 bug conditions are addressed (8 fixed, 1 investigated and fixed)
  - Verify all preservation tests pass (no regressions)
  - Ensure all tests pass, ask the user if questions arise
