# Bugfix Requirements Document

## Introduction

Three production issues observed on ***REMOVED*** after a Vercel deployment:

1. **Stale JS chunk 404s** — Users with cached `index.html` request old Vite code-split chunks that no longer exist on Vercel, resulting in broken pages instead of automatic recovery.
2. **drf-spectacular schema warnings** — Two APIView classes use `@extend_schema` at the class level with `operation_id`, which causes schema generation warnings for non-ViewSet views.
3. **console.log in production utility files** — Dev-only diagnostic functions in `performance-utils.ts` and `accessibility-utils.ts` use raw `console.log`/`console.group` instead of the canonical `logger` from `@/lib/logger`, producing noise in the production console.

Auth 401s are expected behavior (expired sessions) and are explicitly excluded from this spec.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a new build is deployed to Vercel AND a user has a cached `index.html` from the previous deployment THEN the browser requests old chunk URLs (e.g. `exportUtils-CitzSXZt.js`, `Applications-BmdqbC1l.js`, etc.) that return 404, and the existing `LazyLoadErrorBoundary` shows a manual retry button instead of automatically recovering via a full page reload

1.2 WHEN a chunk load fails due to a stale deployment AND the `chunkAutoReloadPolicy` denies the reload (e.g. idle-route-protection on dashboard) THEN the user sees a broken error boundary UI with no automatic recovery path

1.3 WHEN `python3 manage.py spectacular --file /tmp/schema.yaml` is run THEN drf-spectacular emits warnings for `TimelineHistoryView` and `AdminNotificationHistoryView` because `@extend_schema` with `operation_id` is applied at the class level on non-ViewSet APIView classes instead of on the individual HTTP methods

1.4 WHEN the app runs in production THEN `logPerformanceMetrics()` in `performance-utils.ts` emits 5 `console.log` calls plus `console.group`/`console.groupEnd` to the browser console, bypassing the canonical `logger` from `@/lib/logger`

1.5 WHEN the app runs in production THEN `logContrastValidation()` in `accessibility-utils.ts` emits up to 2 `console.log` calls to the browser console, bypassing the canonical `logger` from `@/lib/logger`

### Expected Behavior (Correct)

2.1 WHEN a chunk load fails due to a stale deployment (404 on a dynamically imported module) THEN the system SHALL automatically trigger a full page reload (subject to the chunk auto-reload policy limits) to fetch the new `index.html` with correct chunk references, without requiring manual user interaction

2.2 WHEN a chunk load fails AND the auto-reload policy allows it THEN the system SHALL reload the page within the existing policy constraints (max reloads per session, cooldown period) and clear the reload guard on successful app boot so future deployments can trigger recovery again

2.3 WHEN `python3 manage.py spectacular --file /tmp/schema.yaml` is run THEN the schema SHALL generate without warnings for `TimelineHistoryView` and `AdminNotificationHistoryView` by using `@extend_schema` on the individual `get` methods (or `@extend_schema_view(get=extend_schema(...))`) instead of at the class level

2.4 WHEN `logPerformanceMetrics()` is called THEN the function SHALL use the canonical `logger` from `@/lib/logger` (which already gates output to development mode) instead of raw `console.log`/`console.group` calls

2.5 WHEN `logContrastValidation()` is called THEN the function SHALL use the canonical `logger` from `@/lib/logger` instead of raw `console.log` calls

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a chunk load fails AND the auto-reload policy denies the reload (session limit reached, cooldown active) THEN the system SHALL CONTINUE TO show the `LazyLoadErrorBoundary` fallback UI with manual retry and reload buttons as a last resort

3.2 WHEN the app boots successfully after a reload THEN the system SHALL CONTINUE TO clear the chunk reload session storage guards (`mihas_chunk_reload`, `mihas_chunk_reload_ts`, `mihas_chunk_reload_count`) so future deployments can trigger recovery

3.3 WHEN a non-chunk error occurs (e.g. runtime JS error, network timeout on API call) THEN the `LazyLoadErrorBoundary` SHALL CONTINUE TO catch and display the error without triggering an automatic page reload

3.4 WHEN `@extend_schema` decorators are updated on `TimelineHistoryView` and `AdminNotificationHistoryView` THEN the generated OpenAPI schema SHALL CONTINUE TO include the same operation IDs, tags, parameters, and response schemas as before

3.5 WHEN `logPerformanceMetrics()` is called in development mode THEN the function SHALL CONTINUE TO output the same performance metric information (FCP, LCP, FID, CLS, TTFB with thresholds and pass/fail indicators)

3.6 WHEN `logContrastValidation()` is called in development mode THEN the function SHALL CONTINUE TO output the same contrast ratio information with pass/fail indicators and color suggestions

3.7 WHEN the `importWithChunkRecovery` utility in `lazyImportRecovery.ts` handles a stale chunk error THEN it SHALL CONTINUE TO use its existing guard key mechanism to prevent infinite reload loops
