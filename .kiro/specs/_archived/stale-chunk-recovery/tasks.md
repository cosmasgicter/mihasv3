# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Chunk Error Auto-Reload Not Triggered
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists in `LazyLoadErrorBoundary`
  - **Scoped PBT Approach**: Scope the property to chunk load errors where `evaluateChunkAutoReloadPolicy` would return `{ allow: true }` (fresh session, no prior reloads, non-idle route)
  - **Bug Condition**: `isBugCondition(input)` where `isChunkError(error) AND reloadPolicy.allow == true AND NOT autoReloadTriggered(error)` — the boundary catches the chunk error but never calls `window.location.reload()`
  - Test: Render `LazyLoadErrorBoundary` wrapping a child that throws a `ChunkLoadError`, mock `sessionStorage` with fresh state (reloadCount=0), mock `window.location.pathname` to a non-idle route
  - Assert `window.location.reload` is called automatically (Expected Behavior from design Property 1)
  - Assert `sessionStorage` key `mihas_chunk_reload_count` is incremented
  - Assert `sessionStorage` key `mihas_chunk_reload_ts` is set to a recent timestamp
  - Use fast-check to generate various chunk error message patterns: `'Loading chunk'`, `'Failed to fetch dynamically imported module'`, `'Importing a module script failed'`
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (boundary only renders manual buttons, never calls reload — this proves the bug exists)
  - Document counterexamples found: `window.location.reload` is never called, boundary has no integration with `evaluateChunkAutoReloadPolicy`
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 2.1, 2.2_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Chunk Errors and Policy-Denied Chunk Errors
  - **IMPORTANT**: Follow observation-first methodology
  - **Observe on UNFIXED code**:
    - Non-chunk errors (e.g. `new Error('runtime crash')`) → boundary renders error fallback UI with "Try again" button, NO "Reload page" button, NO auto-reload
    - Chunk errors when policy would deny (reloadCount >= maxPerSession) → boundary renders "Try again" + "Reload page" buttons, NO auto-reload
    - Chunk errors when policy would deny (cooldown active) → boundary renders "Try again" + "Reload page" buttons, NO auto-reload
  - **Property-based tests (fast-check)**:
    - For all non-chunk error messages (arbitrary strings not containing chunk error patterns), `LazyLoadErrorBoundary` renders fallback UI without "Reload page" button and `window.location.reload` is never called (Preservation Property 3 from design)
    - For all chunk errors where `evaluateChunkAutoReloadPolicy` returns `{ allow: false }` (generate random `reloadCount >= maxPerSession`, random `cooldownMs` with `sinceLastReloadMs < cooldownMs`, random idle-protected routes), boundary renders manual retry/reload UI (Preservation Property 2 from design)
  - Verify all preservation tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.3_

- [x] 3. Implement stale chunk recovery fixes

  - [x] 3.1 Enhance LazyLoadErrorBoundary with auto-reload on chunk errors
    - Import `evaluateChunkAutoReloadPolicy` from `@/lib/chunkAutoReloadPolicy` and `logger` from `@/lib/logger`
    - Define session storage key constants: `mihas_chunk_reload` (guard flag), `mihas_chunk_reload_ts` (last reload timestamp), `mihas_chunk_reload_count` (reload count)
    - Define policy defaults: `maxPerSession = 3`, `cooldownMs = 30_000`
    - In `componentDidCatch` (or `componentDidUpdate` when `isChunkError` becomes true):
      - Read `mihas_chunk_reload_count` and `mihas_chunk_reload_ts` from `sessionStorage`
      - Get current route from `window.location.pathname`
      - Get `lastActivityAt` from a reasonable source (e.g. `Date.now()` for active navigation)
      - Call `evaluateChunkAutoReloadPolicy({ now: Date.now(), lastReloadAt, reloadCount, maxPerSession: 3, cooldownMs: 30_000, route, lastActivityAt })`
      - If `allow === true`: increment `mihas_chunk_reload_count`, set `mihas_chunk_reload_ts` to `Date.now()`, log via `logger.warn('Auto-reloading due to stale chunk...')`, call `window.location.reload()`
      - If `allow === false`: log denial reason via `logger.warn(...)`, fall through to existing manual retry/reload UI
    - Preserve existing fallback UI rendering for policy-denied and non-chunk errors
    - _Bug_Condition: isBugCondition(input) where isChunkError(error) AND reloadPolicy.allow == true AND NOT autoReloadTriggered_
    - _Expected_Behavior: When chunk error + policy allows → auto-reload with session storage persistence (design Property 1)_
    - _Preservation: Policy-denied chunk errors show manual UI (design Property 2); non-chunk errors show standard fallback (design Property 3)_
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 3.3, 3.7_

  - [x] 3.2 Fix drf-spectacular schema warnings on TimelineHistoryView
    - In `backend/apps/applications/history_views.py`: remove `@extend_schema(...)` class-level decorator from `TimelineHistoryView`
    - Add `@extend_schema(...)` with the same `operation_id`, `tags`, `parameters`, and `responses` directly on the `get` method
    - Preserve all existing schema metadata (operation_id="timeline_history_list", tags=["applications"], parameters, responses)
    - _Bug_Condition: @extend_schema with operation_id at class level on non-ViewSet APIView_
    - _Expected_Behavior: Schema generates without warnings (design Property 4)_
    - _Preservation: Same operation_id, tags, parameters, responses in generated schema (Req 3.4)_
    - _Requirements: 1.3, 2.3, 3.4_

  - [x] 3.3 Fix drf-spectacular schema warnings on AdminNotificationHistoryView
    - In `backend/apps/common/notification_views.py`: the `AdminNotificationHistoryView` already uses `@extend_schema(...)` at class level
    - Move the `@extend_schema(...)` decorator to the `get` method (or wrap with `@extend_schema_view(get=extend_schema(...))`)
    - Preserve all existing schema metadata (operation_id="admin_notification_history", tags=["notifications"], parameters, responses)
    - _Bug_Condition: @extend_schema with operation_id at class level on non-ViewSet APIView_
    - _Expected_Behavior: Schema generates without warnings (design Property 4)_
    - _Preservation: Same operation_id, tags, parameters, responses in generated schema (Req 3.4)_
    - _Requirements: 1.3, 2.3, 3.4_

  - [x] 3.4 Replace console.log with logger in performance-utils.ts
    - In `apps/admissions/src/lib/performance-utils.ts`: import `logger` from `@/lib/logger`
    - In `logPerformanceMetrics()`: replace `console.group('🚀 Performance Metrics')` with `logger.debug('🚀 Performance Metrics')`
    - Replace each `console.log(...)` call with `logger.debug(...)`
    - Remove `console.groupEnd()` (logger doesn't support grouping; metrics are individual log entries)
    - Remove the manual `process.env.NODE_ENV !== 'development'` guard since `logger.debug` is already gated to development mode
    - _Bug_Condition: Raw console.log/console.group calls bypass canonical logger_
    - _Expected_Behavior: Uses logger.debug which gates output to development mode (design Property 5)_
    - _Preservation: Same metric content output in development mode (Req 3.5)_
    - _Requirements: 1.4, 2.4, 3.5_

  - [x] 3.5 Replace console.log with logger in accessibility-utils.ts
    - In `apps/admissions/src/lib/accessibility-utils.ts`: import `logger` from `@/lib/logger`
    - In `logContrastValidation()`: replace `console.log(...)` calls with `logger.debug(...)`
    - Remove the manual `process.env.NODE_ENV !== 'development'` guard since `logger.debug` is already gated to development mode
    - _Bug_Condition: Raw console.log calls bypass canonical logger_
    - _Expected_Behavior: Uses logger.debug which gates output to development mode (design Property 5)_
    - _Preservation: Same contrast ratio content output in development mode (Req 3.6)_
    - _Requirements: 1.5, 2.5, 3.6_

  - [x] 3.6 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Chunk Error Auto-Reload When Policy Allows
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior: when a chunk error occurs and the policy allows, `window.location.reload()` is called automatically
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed — auto-reload now triggers)
    - _Requirements: 2.1, 2.2_

  - [x] 3.7 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Chunk Errors and Policy-Denied Chunk Errors
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions — non-chunk errors still show standard fallback, policy-denied chunk errors still show manual UI)
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.3_

- [x] 4. Write unit tests for the changes

  - [x] 4.1 Unit tests for LazyLoadErrorBoundary auto-reload behavior
    - Test: chunk error with fresh session storage → `window.location.reload()` called
    - Test: chunk error with policy denial (session-limit) → manual UI rendered with "Try again" and "Reload page" buttons
    - Test: chunk error with policy denial (cooldown-active) → manual UI rendered
    - Test: chunk error with policy denial (idle-route-protection) → manual UI rendered
    - Test: session storage `mihas_chunk_reload_count` incremented after auto-reload trigger
    - Test: session storage `mihas_chunk_reload_ts` set to recent timestamp after auto-reload trigger
    - Test: non-chunk error → standard error fallback UI, no "Reload page" button, no auto-reload
    - Test: custom `fallbackMessage` prop still works for both chunk and non-chunk errors
    - Place tests in `apps/admissions/tests/unit/lazyLoadErrorBoundary.test.tsx`
    - _Requirements: 2.1, 2.2, 3.1, 3.3_

  - [x] 4.2 Unit tests for drf-spectacular schema decorator changes
    - Test: `TimelineHistoryView.get` method has `@extend_schema` decorator with correct `operation_id`
    - Test: `AdminNotificationHistoryView.get` method has `@extend_schema` decorator with correct `operation_id`
    - Test: schema generation produces no warnings for these views (run `spectacular --validate` or inspect schema output)
    - Place tests in `backend/tests/unit/test_schema_decorator_fixes.py`
    - _Requirements: 2.3, 3.4_

  - [x] 4.3 Unit tests for logger replacement in performance-utils.ts
    - Test: `logPerformanceMetrics({ fcp: 450 })` calls `logger.debug` with FCP metric string
    - Test: `logPerformanceMetrics({ lcp: 1200, cls: 0.05 })` calls `logger.debug` for each provided metric
    - Test: `logPerformanceMetrics({})` with no metrics does not call `logger.debug` for any metric line (only header)
    - Test: `console.log` and `console.group` are NOT called
    - Place tests in `apps/admissions/tests/unit/performanceUtilsLogger.test.ts`
    - _Requirements: 2.4, 3.5_

  - [x] 4.4 Unit tests for logger replacement in accessibility-utils.ts
    - Test: `logContrastValidation('test', '#000', '#fff')` calls `logger.debug` with contrast ratio info
    - Test: `logContrastValidation('test', '#777', '#888')` calls `logger.debug` with FAIL status and suggestion
    - Test: `console.log` is NOT called
    - Place tests in `apps/admissions/tests/unit/accessibilityUtilsLogger.test.ts`
    - _Requirements: 2.5, 3.6_

- [x] 5. Checkpoint - Ensure all tests pass
  - Run `cd apps/admissions && bun run test` to verify all frontend tests pass (property + unit)
  - Run `cd backend && python3 -m pytest tests/unit/test_schema_decorator_fixes.py` to verify backend tests pass
  - Run `cd backend && python3 manage.py spectacular --file /tmp/schema.yaml` to verify no schema warnings
  - Ensure all tests pass, ask the user if questions arise
