# Implementation Plan: UI Overhaul and Critical Fixes

## Overview

Bug fixes ship first (production blockers), then new UI components, then landing page integration, then property tests. All frontend work targets `apps/admissions/`. The single backend-adjacent fix (grades sync) is a one-line HTTP method change. TypeScript throughout.

### CTO Review Context (from live DB + codebase audit)

- **Live DB**: 31 applications (21 approved, 7 rejected, 3 draft), 0 payments, 4 program fees — system is in active production use
- **SSE root cause**: The visibility handler resets `retryCount = 0` after `maxRetries` exhaustion, creating infinite 5-retry burst loops. Fix: add `retriesExhausted` flag.
- **QUIC errors**: `ERR_QUIC_PROTOCOL_ERROR` on SSE is a Koyeb HTTP/3 issue — treat as network error, not auth failure
- **No framer-motion**: All animations use pure CSS. Do NOT add framer-motion or the `motion` npm package.
- **Service worker**: Needs both `skipWaiting()` and `clients.claim()` for immediate takeover

## Tasks

- [x] 1. Fix SSE client auth-aware reconnect
  - [x] 1.1 Add auth-failure detection and reconnect suppression to `apps/admissions/src/lib/sseClient.ts`
    - Add `authFailed` boolean state to the SSE client module
    - Add `retriesExhausted` boolean state — set to true when `maxRetries` reached, prevents visibility-triggered reconnect loop
    - Implement fetch-based HEAD probe in `onerror` handler to detect 401/403 before scheduling reconnect
    - When probe returns 401 or 403: set `authFailed = true`, cancel pending reconnect timeout, dispatch `auth_failure` event with status code to all subscribed handlers, log a single `console.warn`
    - When `authFailed` is true, skip all reconnect scheduling
    - When `retryCount >= maxRetries`: set `retriesExhausted = true`, emit single summary log, stop reconnects
    - Fix `handleVisibilityChange`: do NOT reset `retryCount` or reconnect when `retriesExhausted` or `authFailed` is true — this prevents the infinite 5-retry burst loop
    - Change first-retry log from `console.log` to `console.debug` for consistency with subsequent retries
    - Export `resetAuthFailure()` method that sets `authFailed = false` and `retriesExhausted = false` to allow fresh connection after re-auth
    - Update `resetRetryCount()` to also reset `retriesExhausted = false`
    - Treat `ERR_QUIC_PROTOCOL_ERROR` and other transport errors as network errors (not auth failures) — apply normal backoff
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [x] 1.2 Write property test: SSE auth failure stops reconnect
    - **Property 1: SSE auth failure stops reconnect**
    - Create `apps/admissions/tests/property/sseAuthFailureStopsReconnect.property.test.ts`
    - For any SSE client with any `maxRetries`, a 401/403 response sets `authFailed = true` and no further reconnects are scheduled
    - **Validates: Requirements 7.1**

  - [x] 1.3 Write property test: SSE auth failure dispatches event to all handlers
    - **Property 2: SSE auth failure dispatches event to all handlers**
    - Create `apps/admissions/tests/property/sseAuthFailureDispatchesEvent.property.test.ts`
    - For any N subscribed handlers (N ≥ 0), exactly N invocations occur on auth failure, each receiving the HTTP status code
    - **Validates: Requirements 7.2**

  - [x] 1.4 Write property test: SSE auth failure reset round-trip
    - **Property 3: SSE auth failure reset round-trip**
    - Create `apps/admissions/tests/property/sseAuthFailureResetRoundTrip.property.test.ts`
    - `authFail → resetAuthFailure → connect` restores the client to a connectable state
    - **Validates: Requirements 7.4**

  - [x] 1.5 Write property test: SSE maxRetries cap
    - **Property 4: SSE maxRetries cap**
    - Create `apps/admissions/tests/property/sseMaxRetriesCap.property.test.ts`
    - For any `maxRetries = N` (N ≥ 0), total reconnect-triggered `connect()` calls never exceed N
    - **Validates: Requirements 7.6**

- [x] 2. Fix grades sync 405 error
  - [x] 2.1 Change HTTP method from PUT to POST in `apps/admissions/src/lib/connectionFix.ts`
    - In `syncGradesWithRecovery`, change `method: 'PUT'` to `method: 'POST'` for the `/api/v1/applications/{id}/grades/` call
    - _Requirements: 10.1_

  - [x] 2.2 Write unit tests for grades sync POST
    - Create test in `apps/admissions/tests/` verifying `connectionManager.makeRequest` is called with `method: 'POST'`
    - Test batch POST returns 200, single POST returns 201/200
    - _Requirements: 10.1, 10.3, 10.4_

- [x] 3. Fix file upload session check resilience
  - [x] 3.1 Implement retry-once logic in `apps/admissions/src/pages/student/applicationWizard/hooks/useApplicationFileUploads.ts`
    - Replace the single session check with `verifySessionWithRetry()` as specified in the design
    - On 401/403: wait 1 second, retry once. If retry also fails with 401/403, throw "Your session has expired. Please sign in again to continue uploading."
    - On network error (non-auth): proceed with upload, rely on upload endpoint's own auth
    - On success: proceed immediately without additional delay
    - Add `isAuthError` helper and `delay` utility
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 3.2 Write property test: File upload retries once on auth error
    - **Property 6: File upload retries once on auth error**
    - Create `apps/admissions/tests/property/fileUploadRetryOnAuthError.property.test.ts`
    - For any auth error (401/403), exactly 2 session verification calls are made (initial + one retry)
    - **Validates: Requirements 9.1**

  - [x] 3.3 Write property test: File upload proceeds on network error
    - **Property 7: File upload proceeds on network error**
    - Create `apps/admissions/tests/property/fileUploadProceedOnNetworkError.property.test.ts`
    - For any network error on session check, upload proceeds without throwing session-expired
    - **Validates: Requirements 9.3, 9.4**

- [x] 4. Fix service worker cache freshness
  - [x] 4.1 Update `apps/admissions/src/service-worker.ts` for auto skip-waiting and API cache clearing
    - Add `self.skipWaiting()` in the `install` event listener
    - In the `activate` handler, add `clients.claim()` so the new SW takes control of existing tabs immediately
    - In the `activate` handler, explicitly delete the API cache bucket (`API_CACHE`)
    - After activation, post `{ type: 'cache-updated' }` message to all clients
    - Preserve existing `NetworkOnly` strategy for `/api/v1/auth/` endpoints
    - _Requirements: 11.1, 11.3, 11.5_

  - [x] 4.2 Add client-side reload handler for `cache-updated` message
    - In the app shell (e.g., `main.tsx` or a service worker registration module), listen for `cache-updated` messages
    - Auto-reload if user is on Dashboard or Landing Page
    - Add 30-second activation timeout fallback — proceed without SW support and log warning
    - _Requirements: 11.2, 11.4, 11.6_

  - [x] 4.3 Write property test: Auth endpoints are never cached by service worker
    - **Property 9: Auth endpoints are never cached by service worker**
    - Create `apps/admissions/tests/property/swAuthEndpointsNeverCached.property.test.ts`
    - For any request URL matching `/api/v1/auth/*`, no response is ever stored in any cache bucket
    - **Validates: Requirements 11.5**

- [x] 5. Fix dashboard loading performance
  - [x] 5.1 Update `apps/admissions/src/pages/student/Dashboard.tsx` for parallel loading and auth-failure handling
    - Render skeleton/loading state within 200ms on mount (don't block on SSE)
    - When SSE client is in auth-failed state, skip SSE connection and load data via REST only
    - Fire applications, intakes, and interviews fetches in parallel
    - On individual 403: render inline error for that source only, render remaining successful sources
    - On all-403 (session expired): redirect to sign-in within 2 seconds
    - Do not trigger SSE reconnection during initial data load
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 5.2 Write property test: Dashboard partial failure resilience
    - **Property 5: Dashboard partial failure resilience**
    - Create `apps/admissions/tests/property/dashboardPartialFailure.property.test.ts`
    - For any combination where K sources (1 ≤ K ≤ 2) fail with 403 and (3 − K) succeed, error message count equals K and rendered data section count equals (3 − K)
    - **Validates: Requirements 8.3**

- [x] 6. Checkpoint — Verify all bug fixes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement InfiniteGrid component
  - [x] 7.1 Create `apps/admissions/src/components/smoothui/infinite-grid.tsx`
    - Pure CSS/SVG animated grid background — no canvas or WebGL
    - Props: `cellSize`, `lineColor`, `lineOpacity`, `speed`, `className`
    - Render as `position: absolute; inset: 0; z-index: 0` background layer
    - CSS `@keyframes` for subtle diagonal scroll animation on SVG pattern
    - `@media (prefers-reduced-motion: reduce)` disables animation, renders static grid
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 7.2 Write unit tests for InfiniteGrid
    - Test component mounts and produces SVG/CSS output
    - Test reduced motion renders static grid without animation classes
    - _Requirements: 1.1, 1.4_

- [x] 8. Implement Preloader
  - [x] 8.1 Add inline preloader HTML/CSS to `apps/admissions/index.html`
    - Add `<div id="preloader">` with 3-dots animation inside `<div id="root">`
    - Add inline `<style>` for preloader CSS (dots animation, centering, fade-out transition)
    - Add `<script>` with 10-second timeout to show "Taking longer than expected" message with refresh link
    - `prefers-reduced-motion` replaces animated dots with static "Loading..." text
    - _Requirements: 2.1, 2.3, 2.4, 2.5_

  - [x] 8.2 Add preloader removal logic to `apps/admissions/src/main.tsx`
    - After React mounts, fade out `#preloader` over 500ms via CSS transition, then remove from DOM
    - _Requirements: 2.2_

  - [x] 8.3 Write unit tests for Preloader
    - Test preloader element is removed from DOM after React mount
    - Test slow-load message becomes visible after 10s timeout
    - _Requirements: 2.2, 2.4_

- [x] 9. Implement AnimatedText / ShinyText component
  - [x] 9.1 Create `apps/admissions/src/components/smoothui/shiny-text.tsx`
    - CSS gradient shimmer animation using `background-clip: text` and `@keyframes`
    - Props: `text`, `as`, `className`, `animateOnEntry`
    - `IntersectionObserver` triggers animation once on viewport entry, then stays static
    - `prefers-reduced-motion` renders plain styled text without animation
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 9.2 Write unit tests for ShinyText
    - Test renders text with gradient animation class
    - Test reduced motion renders plain text without animation class
    - _Requirements: 3.1, 3.3_

- [x] 10. Implement TextRotate component
  - [x] 10.1 Create `apps/admissions/src/components/smoothui/text-rotate.tsx`
    - CSS `transform: rotateX()` transitions to flip between phrases
    - Props: `phrases`, `interval`, `duration`, `className`
    - `aria-live="polite"` region announces current phrase to screen readers
    - `prefers-reduced-motion` shows first phrase only (static)
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 10.2 Write unit tests for TextRotate
    - Test component cycles through phrases over time
    - Test `aria-live="polite"` attribute is present
    - Test reduced motion shows static text
    - _Requirements: 5.1, 5.3, 5.4_

- [x] 11. Implement TextEffect component
  - [x] 11.1 Create `apps/admissions/src/components/smoothui/text-effect.tsx`
    - `IntersectionObserver` with `triggerOnce: true` to animate on first viewport entry
    - Props: `children`, `effect` (`fadeUp` | `fadeIn` | `slideLeft` | `blur`), `delay`, `className`
    - Text visible in DOM before animation starts (no `display: none` or `visibility: hidden`)
    - CSS `opacity` and `transform` transitions — no layout shifts
    - `prefers-reduced-motion` renders immediately without animation
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 11.2 Write unit tests for TextEffect
    - Test animation class applied once on intersection
    - Test text content is in DOM without `visibility: hidden` before animation
    - _Requirements: 6.2, 6.4_

- [x] 12. Implement ShapeLandingHero component
  - [x] 12.1 Create `apps/admissions/src/components/smoothui/shape-landing-hero.tsx`
    - Props: `headline`, `description`, `rotatingPhrases`, `primaryCta`, `secondaryCta`, `imageSrc`, `imageAlt`
    - Integrates `InfiniteGrid` as background, `TextRotate` for rotating phrases, `ShinyText` for brand name
    - Responsive grid layout: stacked on mobile, side-by-side on desktop
    - Preserves `<h1>` heading hierarchy and existing `aria-label` patterns
    - Preserves existing CTA buttons with correct routing
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 12.2 Write unit tests for ShapeLandingHero
    - Test hero renders both CTA links with correct hrefs
    - Test hero contains exactly one `<h1>` element
    - _Requirements: 4.2, 4.5_

- [x] 13. Update smoothui barrel and integrate into Landing Page
  - [x] 13.1 Export new components from `apps/admissions/src/components/smoothui/index.ts`
    - Add exports for `InfiniteGrid`, `ShinyText`, `TextRotate`, `TextEffect`
    - `ShapeLandingHero` is imported directly by `LandingPage.tsx` (not through barrel)
    - _Requirements: 1.1, 3.1, 5.1, 6.1_

  - [x] 13.2 Wire new components into `apps/admissions/src/pages/LandingPage.tsx`
    - Replace existing `HeroSection` with `ShapeLandingHero`, passing current CTA config, campus image, and rotating phrases
    - Apply `TextEffect` to section headings (stats, features, accreditation, programs, CTA sections)
    - Apply `ShinyText` to the MIHAS-KATC brand name
    - Preserve all existing SEO structured data and semantic HTML
    - _Requirements: 1.1, 3.1, 4.1, 4.2, 5.1, 6.1_

- [x] 14. Checkpoint — Verify all UI components and integration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Backend property test for grades sync round-trip
  - [x] 15.1 Write property test: Grades sync POST round-trip
    - **Property 8: Grades sync POST round-trip**
    - Create `backend/tests/property/test_grades_sync_roundtrip.py`
    - Using Hypothesis: for any valid set of `{ subject_id: UUID, grade: integer }` pairs with unique subject IDs, POST then GET returns matching entries. Double POST does not create duplicates.
    - **Validates: Requirements 10.2, 10.5**

- [x] 16. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Bug fixes (tasks 1–5) are ordered by production impact: SSE storms → grades 405 → file upload → service worker → dashboard
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties from the design document
- Frontend tests: `cd apps/admissions && bun run test`
- Backend tests: `cd backend && python3 -m pytest tests/property/test_grades_sync_roundtrip.py`
