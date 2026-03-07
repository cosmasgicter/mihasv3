# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Fault Condition** — SQL Parameterization & CSRF Refresh Bugs
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the SQL parameterization bug and CSRF exemption gap
  - **Scoped PBT Approach**: Use fast-check to generate random subsets of allowed fields and verify generated SQL
  - Create test file: `tests/property/production-site-fixes/sqlParameterization.fault.property.test.ts`
  - Test 1a — ApplicationQueries.update() in lib/queries.ts: generate random subsets of allowed update fields, call update('test-id', fields), assert the returned SQL text contains dollar-sign-N placeholders (e.g., $2, $3) for each field — NOT bare integers like = 2
  - Test 1b — handleCreate placeholder generation in api-src/applications.ts: extract or replicate the VALUES placeholder logic, generate arrays of 1-20 values, assert each placeholder starts with dollar sign (like $1) not bare integer
  - Test 1c — handleDetails filter conditions in api-src/applications.ts: generate random filter combinations (user_id, status, programme_id, intake_id), assert each WHERE condition uses dollar-sign-N parameter references
  - Test 1d — handleExport filter conditions in api-src/applications.ts: same pattern as handleDetails, verify LIMIT/OFFSET also use dollar-sign-N
  - Test 1e — handleProfile PATCH in api-src/auth.ts: generate random subsets of profile fields (phone, first_name, last_name, etc.), assert the SET clause uses dollar-sign-N and WHERE clause uses dollar-sign-N
  - Test 1f — CSRF exempt actions: assert csrfExemptActions array includes 'refresh'
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL — SQL tests find bare integers instead of dollar-sign-N placeholders; CSRF test finds 'refresh' missing from exempt list
  - Document counterexamples found (e.g., "update() produces status = 2 instead of status = $2")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.2, 1.3, 1.8, 1.9, 1.10, 1.12, 1.14, 1.25_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** — Static Queries, Auth Flows & CSRF Enforcement
  - **IMPORTANT**: Follow observation-first methodology
  - Create test file: `tests/property/production-site-fixes/preservation.property.test.ts`
  - Observe on UNFIXED code: static query builders (ApplicationQueries.findById, ApplicationQueries.delete, DocumentQueries.findByApplication, GradeQueries.findByApplication) already produce correct $1, $2 parameterized SQL
  - Observe on UNFIXED code: CSRF enforcement works correctly for non-exempt actions
  - Observe on UNFIXED code: csrfExemptActions correctly includes login, register, forgot-password, reset-password, password-reset-request, password-reset
  - Observe on UNFIXED code: handleById() reschedule_interview section in api-src/applications.ts already has correct dollar-dollar-pIdx syntax — these must remain correct after fix
  - Observe on UNFIXED code: api-src/admin.ts already has correct dollar-dollar-paramIndex syntax — these must remain correct after fix
  - Test 2a — Static query preservation: for random valid IDs, verify findById, delete, checkOwnership SQL contains $1 placeholder
  - Test 2b — CSRF exempt list preservation: verify all currently exempt actions remain exempt after fix
  - Test 2c — CSRF enforcement preservation: verify non-exempt state-changing actions still require CSRF validation
  - Test 2d — Response envelope preservation: verify sendSuccess() and sendError() produce { success: boolean, data/error } envelope
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS — these behaviors are already correct and must be preserved
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.6, 3.7, 3.8, 3.9, 3.11, 3.12_

- [x] 3. Fix SQL parameterization bug across all affected files

  - [x] 3.1 Fix ApplicationQueries.update() in lib/queries.ts
    - Line ~1247: the template literal produces "field = 2" instead of "field = $2" — add the missing dollar sign before the paramIndex interpolation
    - Change the backtick expression from using single-dollar paramIndex to double-dollar paramIndex so JS template literal outputs the literal dollar sign
    - _Bug_Condition: isBugCondition(input) where query uses dynamic paramIndex without dollar prefix_
    - _Expected_Behavior: SQL contains $N parameter placeholders for all dynamic values_
    - _Preservation: Static queries (findById, delete, checkOwnership) remain unchanged_
    - _Requirements: 1.8, 1.10, 1.11, 1.12, 2.8, 2.9, 2.10, 2.11, 2.12_

  - [x] 3.2 Fix handleCreate() in api-src/applications.ts
    - Line ~289: VALUES placeholders produce "1, 2, 3" instead of "$1, $2, $3" — add dollar sign prefix
    - Change the map callback to output dollar-sign-prefixed indices
    - _Bug_Condition: INSERT VALUES placeholders are bare integers_
    - _Expected_Behavior: INSERT VALUES contains $1, $2, $3 parameter placeholders_
    - _Requirements: 1.10, 2.10_

  - [x] 3.3 Fix handleDetails() in api-src/applications.ts
    - Lines ~332-393: all dynamic WHERE conditions produce "a.user_id = 2" instead of "a.user_id = $2"
    - Fix all filter conditions: user_id, status, programme_id, intake_id
    - Fix LIMIT and OFFSET to use dollar-sign-N placeholders
    - Add dollar sign prefix to all paramIndex interpolations in this function
    - _Bug_Condition: WHERE/LIMIT/OFFSET conditions use bare integers as parameter references_
    - _Expected_Behavior: All dynamic conditions use $N parameter placeholders_
    - _Requirements: 1.8, 2.8, 2.24_

  - [x] 3.4 Fix handleExport() in api-src/applications.ts
    - Lines ~1489-1643: same pattern as handleDetails — all filter conditions and LIMIT/OFFSET missing dollar sign
    - Fix all dynamic parameter references to use dollar-sign-N placeholders
    - _Bug_Condition: Export query filter conditions use bare integers_
    - _Expected_Behavior: All export query conditions use $N parameter placeholders_
    - _Requirements: 1.25, 2.25_

  - [x] 3.5 Fix handleProfile() PATCH in api-src/auth.ts
    - Line ~1224: SET clause produces "phone = 1" instead of "phone = $1" — add dollar sign prefix
    - Line ~1250: WHERE clause produces "WHERE id = 2" instead of "WHERE id = $2" — add dollar sign prefix
    - _Bug_Condition: Profile UPDATE SET and WHERE clauses use bare integers_
    - _Expected_Behavior: Profile UPDATE uses $N parameter placeholders_
    - _Requirements: 1.3, 1.16, 2.3, 2.16_

  - [x] 3.6 Add 'refresh' to CSRF exempt actions in api-src/auth.ts
    - Line ~81: add 'refresh' to the csrfExemptActions array
    - Result: csrfExemptActions should include login, register, forgot-password, reset-password, password-reset-request, password-reset, AND refresh
    - _Bug_Condition: 'refresh' NOT IN csrfExemptActions causes 403 on token refresh_
    - _Expected_Behavior: POST /api/auth?action=refresh skips CSRF validation and returns 200 with new tokens_
    - _Preservation: All other non-exempt actions still require CSRF validation_
    - _Requirements: 1.1, 1.2, 2.1, 2.2_

  - [x] 3.7 Remove inline script from index.html to fix CSP violation
    - Remove the inline script tag (console error suppressor for browser extensions)
    - This is not critical functionality — it just suppresses noisy console errors from browser extensions
    - Removing it is cleaner than adding a CSP hash exception
    - _Bug_Condition: CSP script-src 'self' blocks inline script_
    - _Expected_Behavior: No CSP violations on page load_
    - _Requirements: 1.5, 2.5_

  - [x] 3.8 Bundle API changes
    - Run: bun run scripts/bundle-api.mjs to bundle api-src/ into api/
    - Verify bundled files in api/ reflect the SQL and CSRF fixes
    - NEVER edit files in api/ directly — only edit api-src/ source files
    - _Requirements: 2.1, 2.2, 2.3, 2.8, 2.12, 2.14_

  - [x] 3.9 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** — SQL Parameterization & CSRF Refresh Fixed
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the SQL parameterization bug is fixed and CSRF refresh exemption works
    - Run: bun run vitest --run tests/property/production-site-fixes/sqlParameterization.fault.property.test.ts
    - **EXPECTED OUTCOME**: Test PASSES (confirms bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.8, 2.9, 2.10, 2.12, 2.25_

  - [x] 3.10 Verify preservation tests still pass
    - **Property 2: Preservation** — Static Queries, Auth Flows & CSRF Enforcement
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run: bun run vitest --run tests/property/production-site-fixes/preservation.property.test.ts
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm static queries, CSRF enforcement, response envelope all unchanged
    - _Requirements: 3.1, 3.2, 3.6, 3.7, 3.8, 3.9, 3.11, 3.12_

- [x] 4. Add missing email-slip action in api-src/applications.ts

  - [x] 4.1 Implement handleEmailSlip() function
    - Add case 'email-slip' to the handler switch statement
    - Implement function that: requires auth, fetches application by ID, verifies ownership or admin role, generates/retrieves the slip PDF, sends via Resend email queue
    - Use existing sendSuccess()/sendError() response envelope
    - Validate input with Zod schema
    - _Bug_Condition: No handler for email-slip action — falls through to default 400_
    - _Expected_Behavior: POST /api/applications?action=email-slip sends slip email and returns 200_
    - _Requirements: 1.14, 2.14_

  - [x] 4.2 Bundle and verify
    - Run: bun run scripts/bundle-api.mjs
    - _Requirements: 2.14_

- [x] 5. Fix frontend data flow issues

  - [x] 5.1 Fix profile completion calculation
    - Audit calculateCanonicalProfileCompletion() to ensure it uses profiles table data (not old user_metadata)
    - Ensure all fields populated during registration (first_name, last_name, phone, sex, date_of_birth, residence_town, country) are counted
    - _Requirements: 1.16, 2.16_

  - [x] 5.2 Fix auto-save API integration
    - Verify the application wizard passes an onSave callback to useAutoSave that calls PUT /api/applications?id=xxx
    - After the SQL fix (task 3), the API side should work — ensure the frontend is wired up
    - Verify draft count reflects actual drafts from the API
    - _Requirements: 1.19, 2.19_

  - [x] 5.3 Fix dashboard progress stats
    - Replace hardcoded stats ("932h avg time", "31 completed", "0 in progress") with actual data from API
    - Use data from GET /api/applications response (which works after SQL fix)
    - _Requirements: 1.20, 2.20_

  - [x] 5.4 Fix session date formatting
    - Apply date normalization to ISO timestamps before setting on date input fields
    - Use pattern: new Date(isoString).toISOString().split('T')[0] for yyyy-MM-dd format
    - Ensure profile/settings page displays sessions correctly
    - _Requirements: 1.15, 2.15_

  - [x] 5.5 Fix slip popup not closing
    - Ensure the close/X handler on the "Generating application slip" popup sets visibility state to false
    - Clear any pending generation state on close
    - _Requirements: 1.23, 2.23_

- [x] 6. Fix UI/UX alignment issues

  - [x] 6.1 Fix education step subject add button placement
    - Move "Add Subject" button to render after the subject list (not above)
    - Auto-scroll to new subject form when added
    - _Requirements: 1.26, 2.26_

  - [x] 6.2 Fix sign-in/sign-up page alignment
    - Ensure clear labeling distinguishing new account creation from returning user login
    - Fix form alignment and spacing
    - _Requirements: 1.29, 2.29_

  - [x] 6.3 Fix sidebar collapsed state
    - Fix visual presentation when desktop sidebar is collapsed
    - _Requirements: 1.30, 2.30_

  - [x] 6.4 Fix color saturation on dashboard
    - Adjust Tailwind color classes to use balanced, non-oversaturated tones
    - _Requirements: 1.31, 2.31_

  - [x] 6.5 Fix mobile responsiveness
    - Audited layout for mobile viewports — already has proper touch targets (44px min), container-mobile class, safe-area insets, responsive grids, mobile card views, bottom nav, iOS zoom prevention
    - _Requirements: 1.32, 2.32_

- [x] 7. Fix admin management pages

  - [x] 7.1 Fix users page layout and role management
    - Verified: Users page already has full CRUD, mobile card view + desktop table, role management with permissions dialog, bulk operations, activity log, import/export
    - _Requirements: 1.33, 2.33_

  - [x] 7.2 Fix institution management
    - Verified: Programs page already has full institution CRUD with tabbed UI (Programs/Institutions), create/edit/archive dialogs, inline institution creation from program dialogs, proper validation
    - _Requirements: 1.34, 2.34_

  - [x] 7.3 Fix audit page
    - Verified: AuditTrail page (src/pages/admin/AuditTrail.tsx) already has filtering (action, actor, entity, category, date range), timeline view with expandable cards, export (CSV/JSON/PDF), pagination, category breakdown, action frequency summary
    - _Requirements: 1.35, 2.35_

  - [x] 7.4 Fix settings page
    - Verified: Settings page already has guided configuration (portal name, online applications toggle, contact email/phone, application fee, application limit), advanced key management, import/export, reset to defaults, search/filter by visibility
    - _Requirements: 1.36, 2.36_

- [x] 8. Fix PWA issues

  - [x] 8.1 Fix manifest icons
    - Removed 4 SVG icon entries from public/manifest.json — kept only PNG icons (192x192, 512x512, both regular and maskable)
    - Verified PNG icon files exist at declared paths in public/icons/
    - _Requirements: 1.38, 2.38_

  - [x] 8.2 Add manifest screenshots
    - Verified: screenshot files exist at public/screenshots/ (student-dashboard-wide.png 1440x900, application-wizard-mobile.png 1080x1920)
    - Manifest already declares both wide and mobile screenshots
    - _Requirements: 1.39, 2.39_

  - [x] 8.3 Fix install prompt flow
    - Verified: useInstallPrompt hook properly captures beforeinstallprompt, prevents default mini-infobar, calls prompt() on user interaction, clears on appinstalled event
    - _Requirements: 1.37, 2.37_

- [x] 9. Checkpoint — Ensure all tests pass
  - Ran full test suite: bun run vitest --run tests/unit/ (72 files, 825 tests)
  - Production-site-fixes tests: 20/20 passed (sqlParameterization + preservation)
  - profileFieldMapping test: 8/8 passed
  - 38 pre-existing failures in 5 test files (health, sessions, applications.status-updates, mobileResponsiveness, tooltip) — confirmed these fail identically on pre-fix code (git stash verified)
  - No regressions introduced by our changes
  - API bundled successfully: 12/12 endpoints
