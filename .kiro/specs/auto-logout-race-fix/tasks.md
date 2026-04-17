# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Sequential Double-Refresh Race
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the promise lock clears too eagerly, allowing a second `performRefresh()` call
  - **Scoped PBT Approach**: Scope the property to the concrete race scenario — call `attemptRefresh()`, await it, then call `attemptRefresh()` again immediately with a mocked `performRefresh()` that succeeds first and fails second (simulating blacklisted JTI)
  - **Test file**: `apps/admissions/tests/property/autoLogoutRaceBugCondition.property.test.ts`
  - **Bug Condition from design**: `isBugCondition(input)` where `input.previousRefreshSucceededWithinCooldownWindow AND input.refreshPromise === null AND input.browserHasNotAppliedNewCookie AND input.callerIsIndependentCodePath`
  - Test case 1: Sequential double refresh — call `attemptRefresh()`, await, call again immediately. Assert `performRefresh()` is called only once (will FAIL on unfixed code — it gets called twice)
  - Test case 2: Race with promise lock clear — call `attemptRefresh()`, await (lock clears), call within 100ms. Assert second call returns cached `true` without new network request (will FAIL on unfixed code)
  - Test case 3: Multiple concurrent callers after lock clear — await first `attemptRefresh()`, then fire 3 concurrent calls. Assert only one additional `performRefresh()` call (will FAIL on unfixed code — all 3 call performRefresh)
  - Use fast-check to generate varying delays (0–200ms) between first and second refresh calls
  - Mock `performRefresh()` to return `true` on first call, `false` on subsequent calls (simulates JTI blacklist rejection)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the bug exists: `performRefresh()` is called multiple times within the cooldown window)
  - Document counterexamples found (e.g., "second `attemptRefresh()` at delay=0ms called `performRefresh()` again and got `false`")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Cooldown Refresh Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - **Test file**: `apps/admissions/tests/property/autoLogoutRacePreservation.property.test.ts`
  - **Preservation Requirements from design**: Single 401 recovery, failed refresh cascade, concurrent in-flight deduplication, cooldown expiry — all must behave identically before and after fix
  - Observe on UNFIXED code:
    - Single refresh call with `performRefresh()` returning `true` → `attemptRefresh()` returns `true`, `performRefresh` called exactly once
    - Single refresh call with `performRefresh()` returning `false` → `attemptRefresh()` returns `false`, no cooldown set, auth failure cascade fires
    - Concurrent in-flight calls (while `refreshPromise` is non-null) → all share the same promise, `performRefresh` called exactly once
    - After cooldown window elapses (>5000ms) → new `attemptRefresh()` call makes a real `performRefresh()` request
  - Write property-based tests with fast-check:
    - Property: for all `performRefresh()` results in `{true, false}`, a single `attemptRefresh()` call returns that result and calls `performRefresh()` exactly once
    - Property: for all concurrent caller counts (1–10), when `refreshPromise` is in-flight, all callers share the same promise and `performRefresh()` is called exactly once
    - Property: when `performRefresh()` returns `false`, `lastRefreshResult` is never set to `true` (failures are never cached)
    - Property: for all time deltas > REFRESH_COOLDOWN_MS after a successful refresh, a new `attemptRefresh()` call invokes `performRefresh()` (cooldown expired)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6_

- [x] 3. Implement refresh cooldown fix in `ApiClient.attemptRefresh()`

  - [x] 3.1 Add cooldown fields and modify `attemptRefresh()` in `apps/admissions/src/services/client.ts`
    - Add `private lastRefreshSuccessTime: number = 0` field to `ApiClient`
    - Add `private lastRefreshResult: boolean = false` field to `ApiClient`
    - Add `private static readonly REFRESH_COOLDOWN_MS = 5000` constant to `ApiClient`
    - At the top of `attemptRefresh()`, check if `lastRefreshResult === true` and `(Date.now() - lastRefreshSuccessTime) < REFRESH_COOLDOWN_MS` — if so, return `true` immediately
    - After a successful `performRefresh()` (result is `true`), set `lastRefreshSuccessTime = Date.now()` and `lastRefreshResult = true`
    - Do NOT cache failures — only successful refreshes set the cooldown
    - Do NOT modify `performRefresh()`, `refreshAuthSession()`, `useSessionListener`, or any backend code
    - _Bug_Condition: isBugCondition(input) where input.previousRefreshSucceededWithinCooldownWindow AND refreshPromise === null_
    - _Expected_Behavior: attemptRefresh() returns true from cache within cooldown window; performRefresh() called at most once per cooldown period_
    - _Preservation: Single 401 recovery, failed refresh cascade, concurrent deduplication, tab refocus revalidation all unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.5, 3.6_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Sequential Double-Refresh Race
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior (only one `performRefresh()` call within cooldown window)
    - When this test passes, it confirms the cooldown prevents the second refresh from reaching the backend
    - Run `bun run test:admissions` targeting `autoLogoutRaceBugCondition.property.test.ts`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed — second `attemptRefresh()` returns cached `true`)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Cooldown Refresh Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run `bun run test:admissions` targeting `autoLogoutRacePreservation.property.test.ts`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions — single refresh, failed refresh, concurrent dedup, cooldown expiry all work as before)
    - Confirm all preservation tests still pass after fix

- [x] 4. Checkpoint — Ensure all tests pass
  - Run `bun run test:admissions` to execute the full admissions test suite
  - Verify both `autoLogoutRaceBugCondition.property.test.ts` and `autoLogoutRacePreservation.property.test.ts` pass
  - Verify no other existing tests have regressed
  - Ask the user if questions arise
