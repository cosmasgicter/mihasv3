# Stale Chunk Recovery Bugfix Design

## Overview

After a Vercel deployment, users with cached `index.html` request old Vite code-split chunks that no longer exist, resulting in 404s. The existing `LazyLoadErrorBoundary` catches these errors but only shows a manual retry button instead of automatically recovering via a full page reload. Additionally, two backend APIView classes use `@extend_schema` at the class level (causing drf-spectacular warnings), and two frontend utility files use raw `console.log` instead of the canonical `logger`.

The fix strategy is:
1. Enhance `LazyLoadErrorBoundary` to auto-reload on chunk 404s when the existing `chunkAutoReloadPolicy` allows it, falling back to the manual UI when the policy denies.
2. Move `@extend_schema` from class level to method level on `TimelineHistoryView` and `AdminNotificationHistoryView`.
3. Replace `console.log`/`console.group` with `logger` calls in `performance-utils.ts` and `accessibility-utils.ts`.

## Glossary

- **Bug_Condition (C)**: A chunk load error is caught by `LazyLoadErrorBoundary` and the auto-reload policy allows a reload, but no automatic reload occurs — the user sees only a manual retry button.
- **Property (P)**: When a chunk load error occurs and the reload policy allows it, the boundary should automatically trigger `window.location.reload()` without user interaction.
- **Preservation**: When the reload policy denies the reload (session-limit, cooldown, idle-route-protection), the boundary must continue to show the manual retry/reload fallback UI. Non-chunk errors must never trigger auto-reload.
- **LazyLoadErrorBoundary**: React error boundary in `apps/admissions/src/components/LazyLoadErrorBoundary.tsx` that catches chunk load failures from `React.lazy`.
- **chunkAutoReloadPolicy**: Pure function in `apps/admissions/src/lib/chunkAutoReloadPolicy.ts` that evaluates whether an automatic reload is allowed based on session limits, cooldown, and idle-route protection.
- **lazyImportRecovery**: Utility in `apps/admissions/src/lib/lazyImportRecovery.ts` that wraps dynamic imports with chunk recovery logic using session storage guards.

## Bug Details

### Bug Condition

The bug manifests in three independent areas:

**Area 1 (Primary):** When a user has a cached `index.html` from a previous Vercel deployment and navigates to a lazy-loaded route, the browser requests old chunk URLs that return 404. `LazyLoadErrorBoundary` catches the error and identifies it as a chunk error (`isChunkError = true`), but only renders a manual "Try again" / "Reload page" button pair. It does not consult `chunkAutoReloadPolicy` or trigger an automatic reload.

**Area 2:** `TimelineHistoryView` and `AdminNotificationHistoryView` use `@extend_schema` at the class level with `operation_id`, which causes drf-spectacular warnings for non-ViewSet APIView classes.

**Area 3:** `logPerformanceMetrics()` and `logContrastValidation()` use raw `console.log`/`console.group` instead of the canonical `logger` from `@/lib/logger`.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { error: Error, reloadPolicy: ChunkReloadPolicyDecision }
  OUTPUT: boolean

  isChunkError := error.name == 'ChunkLoadError'
                  OR error.message CONTAINS 'Loading chunk'
                  OR error.message CONTAINS 'Failed to fetch dynamically imported module'
                  OR error.message CONTAINS 'Importing a module script failed'

  RETURN isChunkError
         AND reloadPolicy.allow == true
         AND NOT autoReloadTriggered(error)
END FUNCTION
```

### Examples

- User on `/dashboard` with stale `index.html` clicks a link to `/student/application/123`. The lazy chunk `Applications-BmdqbC1l.js` returns 404. The boundary catches the error, identifies it as a chunk error, but only shows "Try again" / "Reload page" buttons. **Expected:** The boundary consults the reload policy; if allowed, it calls `window.location.reload()` automatically.
- User on `/` (idle-protected route) has been idle for 10+ minutes. A chunk error occurs. The reload policy returns `{ allow: false, cause: 'idle-route-protection' }`. **Expected:** The boundary shows the manual retry/reload UI (current behavior is correct for this case, but the boundary doesn't even check the policy today).
- Running `python3 manage.py spectacular --file /tmp/schema.yaml` emits warnings about `operation_id` on class-level `@extend_schema` for `TimelineHistoryView`. **Expected:** No warnings.
- `logPerformanceMetrics({ fcp: 450, lcp: 1200 })` in production emits `console.group` and `console.log` calls. **Expected:** Uses `logger.debug()` which is gated to development mode only.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- When the reload policy denies the reload (session-limit, cooldown-active, idle-route-protection), the `LazyLoadErrorBoundary` must continue to show the manual retry and reload buttons as a last resort (Req 3.1)
- Successful app boot must continue to clear session storage guards (`mihas_chunk_reload`, `mihas_chunk_reload_ts`, `mihas_chunk_reload_count`) so future deployments can trigger recovery (Req 3.2)
- Non-chunk errors (runtime JS errors, network timeouts on API calls) must not trigger automatic page reloads (Req 3.3)
- The generated OpenAPI schema must retain the same operation IDs, tags, parameters, and response schemas after moving `@extend_schema` to method level (Req 3.4)
- `logPerformanceMetrics()` in development mode must continue to output the same performance metric information (FCP, LCP, FID, CLS, TTFB with thresholds and pass/fail indicators) (Req 3.5)
- `logContrastValidation()` in development mode must continue to output the same contrast ratio information with pass/fail indicators and color suggestions (Req 3.6)
- The `importWithChunkRecovery` utility must continue to use its existing guard key mechanism to prevent infinite reload loops (Req 3.7)

**Scope:**
All inputs that do NOT involve chunk load errors caught by `LazyLoadErrorBoundary` should be completely unaffected by this fix. This includes:
- Mouse clicks, form submissions, and other user interactions
- Non-chunk runtime errors caught by the outer `ErrorBoundary`
- API call failures and network errors
- The `importWithChunkRecovery` utility's own recovery mechanism (separate from the boundary)

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **Missing policy integration in LazyLoadErrorBoundary**: The boundary's `getDerivedStateFromError` correctly identifies chunk errors, but the component never imports or calls `evaluateChunkAutoReloadPolicy`. The `handleReload` method exists but is only wired to a manual button click, not to an automatic trigger on chunk error detection. The boundary needs to: (a) read reload state from session storage, (b) call `evaluateChunkAutoReloadPolicy`, (c) if allowed, increment the reload count, persist it, and call `window.location.reload()`, (d) if denied, fall through to the existing manual UI.

2. **Class-level `@extend_schema` on non-ViewSet APIViews**: `TimelineHistoryView` in `history_views.py` uses `@extend_schema(operation_id="timeline_history_list", ...)` as a class decorator. `AdminNotificationHistoryView` in `notification_views.py` uses the same pattern. drf-spectacular expects `operation_id` on method-level decorators for APIView classes (not ViewSets). The other views in `notification_views.py` already use `@extend_schema_view(get=extend_schema(...))` correctly.

3. **Raw console calls in utility files**: `logPerformanceMetrics()` in `performance-utils.ts` uses `console.group`, `console.log`, and `console.groupEnd` directly. `logContrastValidation()` in `accessibility-utils.ts` uses `console.log` directly. Both already have `process.env.NODE_ENV !== 'development'` guards, but the canonical `logger` from `@/lib/logger` already handles environment gating internally, so the functions should delegate to it.

## Correctness Properties

Property 1: Bug Condition - Auto-Reload on Chunk Error When Policy Allows

_For any_ chunk load error caught by `LazyLoadErrorBoundary` where `evaluateChunkAutoReloadPolicy` returns `{ allow: true }`, the boundary SHALL automatically trigger `window.location.reload()` without requiring user interaction, after persisting the updated reload count and timestamp to session storage.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation - Manual Fallback When Policy Denies

_For any_ chunk load error caught by `LazyLoadErrorBoundary` where `evaluateChunkAutoReloadPolicy` returns `{ allow: false }`, the boundary SHALL render the manual retry/reload fallback UI with "Try again" and "Reload page" buttons, preserving the existing user-facing recovery path.

**Validates: Requirements 3.1, 3.3**

Property 3: Preservation - Non-Chunk Errors Never Auto-Reload

_For any_ error caught by `LazyLoadErrorBoundary` where `isChunkError` is false, the boundary SHALL NOT trigger an automatic page reload, and SHALL render the standard error fallback UI with only a "Try again" button.

**Validates: Requirements 3.3**

Property 4: Preservation - OpenAPI Schema Equivalence

_For any_ schema generation run after moving `@extend_schema` to method level, the output SHALL contain the same `operation_id`, `tags`, `parameters`, and `responses` for `TimelineHistoryView.get` and `AdminNotificationHistoryView.get` as the original class-level decoration.

**Validates: Requirements 2.3, 3.4**

Property 5: Preservation - Logger Output Equivalence

_For any_ call to `logPerformanceMetrics()` or `logContrastValidation()` in development mode, the output content (metric names, values, thresholds, pass/fail indicators) SHALL be equivalent to the original `console.log` output, routed through the canonical `logger` instead.

**Validates: Requirements 2.4, 2.5, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `apps/admissions/src/components/LazyLoadErrorBoundary.tsx`

**Specific Changes**:
1. **Import policy function**: Import `evaluateChunkAutoReloadPolicy` from `@/lib/chunkAutoReloadPolicy` and `logger` from `@/lib/logger`.
2. **Add session storage constants**: Define constants for the three session storage keys (`mihas_chunk_reload`, `mihas_chunk_reload_ts`, `mihas_chunk_reload_count`) and policy defaults (`maxPerSession = 3`, `cooldownMs = 30_000`).
3. **Add auto-reload logic in `componentDidCatch` or `componentDidUpdate`**: After `getDerivedStateFromError` sets `isChunkError = true`, read the current reload count and last reload timestamp from session storage, get the current route from `window.location.pathname`, evaluate the policy, and if `allow === true`: increment the reload count, persist the new count and timestamp, log the recovery attempt via `logger`, and call `window.location.reload()`.
4. **Preserve fallback UI**: If the policy returns `allow: false`, fall through to the existing `render()` method which shows the manual retry/reload buttons. Log the denial reason via `logger.warn`.

**File**: `backend/apps/applications/history_views.py`

**Specific Changes**:
1. **Move `@extend_schema` from class level to method level**: Remove the `@extend_schema(...)` class decorator from `TimelineHistoryView`. Add `@extend_schema(...)` with the same parameters directly on the `get` method.

**File**: `backend/apps/common/notification_views.py`

**Specific Changes**:
1. **Move `@extend_schema` from class level to method level**: Remove the `@extend_schema(...)` class decorator from `AdminNotificationHistoryView`. Add `@extend_schema(...)` with the same parameters directly on the `get` method.

**File**: `apps/admissions/src/lib/performance-utils.ts`

**Specific Changes**:
1. **Import logger**: Add `import { logger } from '@/lib/logger'`.
2. **Replace console calls in `logPerformanceMetrics`**: Replace `console.group('🚀 Performance Metrics')` with `logger.debug('🚀 Performance Metrics')`. Replace each `console.log(...)` with `logger.debug(...)`. Remove `console.groupEnd()` (logger doesn't support grouping; the metrics are individual log entries). Remove the manual `process.env.NODE_ENV !== 'development'` guard since `logger.debug` is already gated to development mode.

**File**: `apps/admissions/src/lib/accessibility-utils.ts`

**Specific Changes**:
1. **Import logger**: Add `import { logger } from '@/lib/logger'`.
2. **Replace console calls in `logContrastValidation`**: Replace `console.log(...)` calls with `logger.debug(...)`. Remove the manual `process.env.NODE_ENV !== 'development'` guard since `logger.debug` is already gated to development mode.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that render `LazyLoadErrorBoundary` with a child component that throws a chunk load error, and assert that `window.location.reload` is called. Run these tests on the UNFIXED code to observe failures and understand the root cause.

**Test Cases**:
1. **Chunk Error Auto-Reload Test**: Render boundary, throw `ChunkLoadError`, assert `window.location.reload()` is called (will fail on unfixed code — boundary only shows buttons)
2. **Policy-Allowed Reload Test**: Render boundary with fresh session storage (no prior reloads), throw chunk error, assert reload is triggered (will fail on unfixed code)
3. **Session Storage Persistence Test**: After auto-reload trigger, assert that `mihas_chunk_reload_count` is incremented in session storage (will fail on unfixed code)
4. **Schema Warning Test**: Run `spectacular --file` and check stderr for warnings about `TimelineHistoryView` (will show warnings on unfixed code)

**Expected Counterexamples**:
- `window.location.reload` is never called when a chunk error is caught by the boundary
- The boundary does not read or write session storage reload state
- Possible causes: boundary has no integration with `evaluateChunkAutoReloadPolicy`, no auto-reload code path exists

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := LazyLoadErrorBoundary_fixed.componentDidCatch(input.error)
  policyDecision := evaluateChunkAutoReloadPolicy(currentState)
  IF policyDecision.allow THEN
    ASSERT window.location.reload WAS CALLED
    ASSERT sessionStorage['mihas_chunk_reload_count'] == previousCount + 1
    ASSERT sessionStorage['mihas_chunk_reload_ts'] IS RECENT
  END IF
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT LazyLoadErrorBoundary_original.render(input) == LazyLoadErrorBoundary_fixed.render(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (various error types, policy states)
- It catches edge cases that manual unit tests might miss (e.g., boundary conditions on reload count)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for non-chunk errors and policy-denied chunk errors, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Non-Chunk Error Preservation**: Render boundary, throw a generic `Error('runtime crash')`, verify no reload is triggered and the standard error UI is shown — same behavior before and after fix
2. **Policy-Denied Fallback Preservation**: Render boundary with `reloadCount >= maxPerSession`, throw chunk error, verify the manual retry/reload UI is rendered — same as current behavior
3. **Session Storage Cleanup Preservation**: Verify `App.tsx` useEffect still clears `mihas_chunk_reload`, `mihas_chunk_reload_ts`, `mihas_chunk_reload_count` on successful boot
4. **Schema Output Preservation**: Compare OpenAPI schema output before and after moving `@extend_schema` to method level — operation IDs, tags, parameters, responses must match
5. **Logger Output Preservation**: In development mode, verify `logPerformanceMetrics` and `logContrastValidation` produce equivalent output content through `logger.debug` as they did through `console.log`

### Unit Tests

- Test `LazyLoadErrorBoundary` auto-reload trigger when policy allows
- Test `LazyLoadErrorBoundary` fallback UI when policy denies (each denial reason)
- Test session storage read/write for reload count and timestamp
- Test that non-chunk errors never trigger auto-reload
- Test `logPerformanceMetrics` calls `logger.debug` instead of `console.log`
- Test `logContrastValidation` calls `logger.debug` instead of `console.log`

### Property-Based Tests

- Generate random error types (chunk errors, runtime errors, network errors) and verify the boundary correctly distinguishes chunk errors from non-chunk errors and only auto-reloads for chunk errors when policy allows (fast-check)
- Generate random `ChunkReloadPolicyInput` states (varying `reloadCount`, `lastReloadAt`, `route`, `lastActivityAt`) and verify the boundary respects every policy decision (fast-check)
- Generate random `WebVitalsMetrics` partial objects and verify `logPerformanceMetrics` produces logger output for each provided metric (fast-check)

### Integration Tests

- Test full chunk error recovery flow: throw chunk error → policy check → auto-reload → app boot → session storage cleared
- Test `python3 manage.py spectacular --file /tmp/schema.yaml` produces no warnings after decorator move
- Test that `LazyLoadErrorBoundary` works correctly when nested inside the outer `ErrorBoundary` in `App.tsx`
