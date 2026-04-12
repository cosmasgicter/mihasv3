# Implementation Plan

## Group A: Bug 1 (P0 — Hardcoded Secrets in MCP Config Files)

- [x] 1. Write bug condition exploration test for hardcoded secrets
  - **Property 1: Bug Condition** - Hardcoded Secrets in MCP Config Files
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate secrets are present in committed config files
  - **Scoped PBT Approach**: Scope to concrete failing cases — parse `.kiro/mcp.json` and `.kiro/settings/mcp.json`, assert no values match secret patterns (`ctx7sk-`, `eyJhbG`, `sbp_`, non-empty real tokens)
  - Test that all secret values in both MCP config files are either `""` or `"<YOUR_KEY_HERE>"` (from Bug Condition in design: `isBugCondition_Bug1`)
  - Test that `.gitignore` contains `.kiro/settings/mcp.json`
  - Run test on UNFIXED code — expect FAILURE (secrets are present, gitignore entry missing)
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the bug exists)
  - Document counterexamples found (e.g., `"CONTEXT7_API_KEY": "ctx7sk-dbfa3364-..."` found in `.kiro/mcp.json`)
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 2. Write preservation tests for MCP config structure (BEFORE implementing fix)
  - **Property 2: Preservation** - MCP Config Structure Intact
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: `.kiro/mcp.json` contains valid JSON with server entries, command/args/env key names on unfixed code
  - Observe: `.kiro/settings/mcp.json` contains valid JSON with all expected server entries and env key names on unfixed code
  - Write tests asserting: both files are valid JSON, all server entry names are preserved, all config keys (command, args, env key names, disabled flags) are present
  - Verify tests pass on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline structure to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2_

- [x] 3. Fix Bug 1 — Replace hardcoded secrets with placeholders


  - [x] 3.2 Replace secrets in `.kiro/settings/mcp.json`
    - Replace `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN` values with `""`
    - Replace `CONTEXT7_API_KEY` value in context7 headers with `""`
    - _Bug_Condition: isBugCondition_Bug1(file) where file.path == ".kiro/settings/mcp.json" and secret values are non-empty real keys_
    - _Expected_Behavior: All secret values are "" or "<YOUR_KEY_HERE>"_
    - _Preservation: JSON structure, server entries, command/args/env key names remain intact_
    - _Requirements: 2.2_

  - [x] 3.3 Add `.kiro/settings/mcp.json` to `.gitignore`
    - Add `.kiro/settings/mcp.json` entry to `.gitignore`
    - _Bug_Condition: ".kiro/settings/mcp.json" not in .gitignore_
    - _Expected_Behavior: Entry present in .gitignore_
    - _Requirements: 2.3_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Secrets Replaced with Placeholders
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms secrets are replaced and gitignore is updated
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - MCP Config Structure Intact
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions — JSON structure preserved)
    - _Requirements: 3.1, 3.2_

- [x] 4. Checkpoint — Bug 1 complete
  - Ensure all Bug 1 tests pass. Ask the user if questions arise.


## Group B: Bug 3 (P1 — Cache-Control Headers on Authenticated Responses)

- [x] 5. Write bug condition exploration test for missing Cache-Control headers
  - **Property 1: Bug Condition** - Missing Cache-Control on Authenticated Responses
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate authenticated responses lack Cache-Control headers
  - **Scoped PBT Approach**: Use property-based testing — generate random authenticated request scenarios (various paths, status codes) and assert `Cache-Control: no-store, private` is present in the response
  - Test `SecurityHeadersMiddleware` with mock authenticated requests — assert `response["Cache-Control"] == "no-store, private"` (from Bug Condition in design: `isBugCondition_Bug3`)
  - Run test on UNFIXED code — expect FAILURE (middleware does not set Cache-Control)
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the bug exists)
  - Document counterexamples found (e.g., "authenticated GET /api/v1/applications/ returns response without Cache-Control header")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.5_

- [x] 6. Write preservation property tests for unauthenticated responses (BEFORE implementing fix)
  - **Property 2: Preservation** - No Cache-Control on Unauthenticated Responses
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: `SecurityHeadersMiddleware` with anonymous request does NOT add `Cache-Control` on unfixed code
  - Observe: Existing security headers (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy) are present on all responses
  - Write property-based test: for all unauthenticated requests, `Cache-Control: no-store, private` is NOT added by the middleware
  - Write property-based test: for all requests (auth and unauth), existing security headers remain present
  - Verify tests pass on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.7_

- [x] 7. Fix Bug 3 — Add Cache-Control to SecurityHeadersMiddleware

  - [x] 7.1 Add Cache-Control logic to `SecurityHeadersMiddleware.__call__` in `backend/apps/common/middleware.py`
    - After `response = self.get_response(request)`, check `hasattr(request, 'user') and request.user.is_authenticated`
    - If authenticated, set `response["Cache-Control"] = "no-store, private"`
    - Do NOT add Cache-Control for unauthenticated/anonymous requests
    - _Bug_Condition: request.user.is_authenticated == True AND "Cache-Control" NOT IN response.headers_
    - _Expected_Behavior: response["Cache-Control"] == "no-store, private" for authenticated responses_
    - _Preservation: Unauthenticated responses unchanged, existing security headers preserved_
    - _Requirements: 2.5, 3.7_

  - [x] 7.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Cache-Control on Authenticated Responses
    - **IMPORTANT**: Re-run the SAME test from task 5 — do NOT write a new test
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.5_

  - [x] 7.3 Verify preservation tests still pass
    - **Property 2: Preservation** - No Cache-Control on Unauthenticated Responses
    - **IMPORTANT**: Re-run the SAME tests from task 6 — do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - _Requirements: 3.7_

- [x] 8. Checkpoint — Bug 3 complete
  - Ensure all Bug 3 tests pass. Ask the user if questions arise.


## Group C: Bug 4 (P1 — Scaffold View Permissions)

- [x] 9. Write bug condition exploration test for scaffold views using AllowAny
  - **Property 1: Bug Condition** - Scaffold Views Require Authentication
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate scaffold views allow unauthenticated access
  - **Scoped PBT Approach**: For each of the 7 affected views, assert `permission_classes == [IsAuthenticated]` and `authentication_classes` is not `[]`
  - Test all 7 views: `SourceAnalyticsView`, `OutreachAnalyticsView`, `DailyDigestReportView` (in `backend/apps/analytics/views.py`), `EmailMessageListView`, `EmailThreadListView` (in `backend/apps/integrations/email_views.py`), `ResumeListView`, `DocumentVersionListView` (in `backend/apps/documents/job_views.py`)
  - Assert each view's `permission_classes` contains `IsAuthenticated` (from Bug Condition in design: `isBugCondition_Bug4`)
  - Run test on UNFIXED code — expect FAILURE (views have `AllowAny`)
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the bug exists)
  - Document counterexamples found (e.g., "`SourceAnalyticsView.permission_classes == [AllowAny]`")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12_

- [x] 10. Write preservation property tests for already-authenticated views (BEFORE implementing fix)
  - **Property 2: Preservation** - Already-Authenticated Views Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: `FunnelAnalyticsView` has `permission_classes = [IsAuthenticated]` on unfixed code
  - Observe: `ResumeVariantCreateView`, `CoverLetterGenerateView`, `QuestionBankAnswerView`, `ZohoConnectView` have `permission_classes = [IsAuthenticated]` on unfixed code
  - Observe: `EmailDeliveryWebhookView` has `permission_classes = []` (unauthenticated webhook) on unfixed code
  - Write property-based test: for all already-authenticated views, `permission_classes` contains `IsAuthenticated`
  - Write test: `EmailDeliveryWebhookView` remains unauthenticated (webhook endpoint)
  - Verify tests pass on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.4, 3.5_

- [x] 11. Fix Bug 4 — Change scaffold view permissions to IsAuthenticated

  - [x] 11.1 Update `backend/apps/analytics/views.py`
    - `SourceAnalyticsView`: Change `permission_classes = [AllowAny]` to `[IsAuthenticated]`, remove `authentication_classes = []`
    - `OutreachAnalyticsView`: Change `permission_classes = [AllowAny]` to `[IsAuthenticated]`, remove `authentication_classes = []`
    - `DailyDigestReportView`: Change `permission_classes = [AllowAny]` to `[IsAuthenticated]`, remove `authentication_classes = []`
    - _Bug_Condition: view.permission_classes == [AllowAny] AND view.authentication_classes == []_
    - _Expected_Behavior: view.permission_classes == [IsAuthenticated], authentication_classes removed_
    - _Preservation: FunnelAnalyticsView already has IsAuthenticated — do not change_
    - _Requirements: 2.6, 2.7, 2.8_

  - [x] 11.2 Update `backend/apps/integrations/email_views.py`
    - `EmailMessageListView`: Change `permission_classes = [AllowAny]` to `[IsAuthenticated]`, remove `authentication_classes = []`
    - `EmailThreadListView`: Change `permission_classes = [AllowAny]` to `[IsAuthenticated]`, remove `authentication_classes = []`
    - Do NOT change `ZohoConnectView` (already `IsAuthenticated`) or `EmailDeliveryWebhookView` (webhook, must stay unauthenticated)
    - _Bug_Condition: view.permission_classes == [AllowAny] AND view.authentication_classes == []_
    - _Expected_Behavior: view.permission_classes == [IsAuthenticated], authentication_classes removed_
    - _Preservation: ZohoConnectView and EmailDeliveryWebhookView unchanged_
    - _Requirements: 2.9, 2.10_

  - [x] 11.3 Update `backend/apps/documents/job_views.py`
    - `ResumeListView`: Change `permission_classes = [AllowAny]` to `[IsAuthenticated]`, remove `authentication_classes = []`
    - `DocumentVersionListView`: Change `permission_classes = [AllowAny]` to `[IsAuthenticated]`, remove `authentication_classes = []`
    - Do NOT change `ResumeVariantCreateView`, `CoverLetterGenerateView`, `QuestionBankAnswerView` (already `IsAuthenticated`)
    - _Bug_Condition: view.permission_classes == [AllowAny] AND view.authentication_classes == []_
    - _Expected_Behavior: view.permission_classes == [IsAuthenticated], authentication_classes removed_
    - _Preservation: Already-authenticated write views unchanged_
    - _Requirements: 2.11, 2.12_

  - [x] 11.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Scaffold Views Require Authentication
    - **IMPORTANT**: Re-run the SAME test from task 9 — do NOT write a new test
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12_

  - [x] 11.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Already-Authenticated Views Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 10 — do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - _Requirements: 3.4, 3.5_

- [x] 12. Checkpoint — Bug 4 complete
  - Ensure all Bug 4 tests pass. Ask the user if questions arise.


## Group D: Bug 5 (P1 — Admin URL + OpenAPI Gating)

- [x] 13. Write bug condition exploration test for admin URL and public OpenAPI docs
  - **Property 1: Bug Condition** - Admin URL Obscured and Docs Gated
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate admin is at `/admin/` and docs are publicly accessible
  - **Scoped PBT Approach**: Test concrete cases — `/admin/` should return 404, unauthenticated requests to `/api/v1/schema/`, `/api/v1/docs/`, `/api/v1/redoc/` with `DEBUG=False` should return 403
  - Test URL resolution: `reverse("admin:index")` should NOT resolve to `/admin/` (from Bug Condition in design: `isBugCondition_Bug5`)
  - Test `IsAuthenticatedOrDebug` permission: `DEBUG=False` + anonymous → deny, `DEBUG=False` + authenticated → allow, `DEBUG=True` → always allow
  - Run test on UNFIXED code — expect FAILURE (admin at `/admin/`, docs publicly accessible)
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the bug exists)
  - Document counterexamples found (e.g., "`/admin/` resolves to Django admin login page")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.13, 2.14_

- [x] 14. Write preservation property tests for admin functionality and dev docs access (BEFORE implementing fix)
  - **Property 2: Preservation** - Admin Functionality and Dev Docs Access
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: Health check endpoints (`/health/live/`, `/health/ready/`) are accessible without auth on unfixed code
  - Observe: Public endpoints (login, register, catalog reads, etc.) remain accessible without auth on unfixed code
  - Write property-based test: for `DEBUG=True`, OpenAPI endpoints allow access without authentication
  - Write test: health check endpoints remain publicly accessible
  - Verify tests pass on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.8, 3.9, 3.10_

- [x] 15. Fix Bug 5 — Move admin URL and gate OpenAPI docs

  - [x] 15.1 Create `IsAuthenticatedOrDebug` permission class in `backend/apps/common/permissions.py`
    - Create new file with `IsAuthenticatedOrDebug(BasePermission)` that returns `True` if `settings.DEBUG` else checks `request.user.is_authenticated`
    - _Requirements: 2.14_

  - [x] 15.2 Update `backend/config/urls.py`
    - Change `path("admin/", admin.site.urls)` to `path("mihas-admin-panel/", admin.site.urls)`
    - Update OpenAPI views to use `permission_classes=[IsAuthenticatedOrDebug]`:
      - `SpectacularAPIView.as_view(permission_classes=[IsAuthenticatedOrDebug])`
      - `SpectacularSwaggerView.as_view(url_name="schema", permission_classes=[IsAuthenticatedOrDebug])`
      - `SpectacularRedocView.as_view(url_name="schema", permission_classes=[IsAuthenticatedOrDebug])`
    - _Bug_Condition: admin at "/admin/" (predictable) AND OpenAPI docs publicly accessible in production_
    - _Expected_Behavior: admin at "/mihas-admin-panel/", OpenAPI requires auth when DEBUG=False_
    - _Preservation: Health checks, public endpoints unchanged. Admin works at new path. Docs accessible in DEBUG=True_
    - _Requirements: 2.13, 2.14_

  - [x] 15.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Admin URL Obscured and Docs Gated
    - **IMPORTANT**: Re-run the SAME test from task 13 — do NOT write a new test
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.13, 2.14_

  - [x] 15.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Admin Functionality and Dev Docs Access
    - **IMPORTANT**: Re-run the SAME tests from task 14 — do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - _Requirements: 3.8, 3.9, 3.10_

- [x] 16. Checkpoint — Bug 5 complete
  - Ensure all Bug 5 tests pass. Ask the user if questions arise.


## Group E: Bug 2 (P1 — CSP Documentation)

- [x] 17. Write bug condition exploration test for undocumented CSP unsafe-inline
  - **Property 1: Bug Condition** - CSP Risk Documented
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate `unsafe-inline` is present without risk documentation
  - **Scoped PBT Approach**: Scope to concrete case — parse `apps/admissions/vercel.json`, find CSP header, assert risk documentation exists alongside `unsafe-inline`
  - Test that `apps/admissions/vercel.json` contains documentation of the `unsafe-inline` risk (e.g., `X-CSP-Note` header or equivalent) (from Bug Condition in design: `isBugCondition_Bug2`)
  - Run test on UNFIXED code — expect FAILURE (no risk documentation present)
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the bug exists)
  - Document counterexamples found (e.g., "CSP contains `unsafe-inline` with no risk documentation in vercel.json")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.4_

- [x] 18. Write preservation tests for CSP allowed sources (BEFORE implementing fix)
  - **Property 2: Preservation** - CSP Allowed Sources Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: CSP `script-src` includes `'self'`, `https://va.vercel-scripts.com`, `https://pay.lenco.co`, `https://pay.sandbox.lenco.co` on unfixed code
  - Observe: All other headers in `vercel.json` are present and unchanged on unfixed code
  - Write test: CSP directive values (all allowed sources) are preserved exactly
  - Write test: All existing non-CSP headers in `vercel.json` are preserved
  - Verify tests pass on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.6_

- [x] 19. Fix Bug 2 — Add CSP risk documentation to vercel.json

  - [x] 19.1 Add `X-CSP-Note` header to `apps/admissions/vercel.json`
    - Add a new header entry in the headers array: `{ "key": "X-CSP-Note", "value": "TODO: Replace unsafe-inline with nonce-based CSP when server-side rendering is feasible. See docs/security-api-audit-2026-04.md finding H2. Current unsafe-inline is required because Vercel static deploys cannot inject per-request nonces." }`
    - Do NOT modify the existing CSP header value or any other headers
    - _Bug_Condition: CSP contains "unsafe-inline" AND no documented risk comment exists_
    - _Expected_Behavior: Risk documentation header present alongside unsafe-inline CSP_
    - _Preservation: CSP directive values unchanged, all other headers unchanged_
    - _Requirements: 2.4_

  - [x] 19.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - CSP Risk Documented
    - **IMPORTANT**: Re-run the SAME test from task 17 — do NOT write a new test
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.4_

  - [x] 19.3 Verify preservation tests still pass
    - **Property 2: Preservation** - CSP Allowed Sources Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 18 — do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - _Requirements: 3.6_

- [x] 20. Checkpoint — Bug 2 complete
  - Ensure all Bug 2 tests pass. Ask the user if questions arise.

## Final Checkpoint

- [x] 21. Final validation — all 5 bugs remediated
  - Run all exploration tests (tasks 1, 5, 9, 13, 17) — all should PASS on fixed code
  - Run all preservation tests (tasks 2, 6, 10, 14, 18) — all should PASS on fixed code
  - Run existing backend test suite: `cd backend && python3 -m pytest`
  - Run admissions frontend tests: `cd apps/admissions && bun run test`
  - Verify OpenAPI schema generation: `cd backend && python3 manage.py spectacular --file /tmp/schema.yaml`
  - Confirm no regressions across the platform
  - Ask the user if questions arise
