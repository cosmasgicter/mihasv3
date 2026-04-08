# Requirements Document

## Introduction

This spec covers a combined UI/UX overhaul and critical production bug fix effort for the MIHAS admissions platform (`apps/admissions/`). The UI overhaul introduces modern visual components (infinite grid background, preloader, animated logo, redesigned hero, text effects) to make the landing page feel iconic and polished. The critical fixes address five production bugs: SSE reconnect storms on auth failures, slow student dashboard loading compounded by SSE noise, misleading "session expired" errors during document upload, a 405 Method Not Allowed error on grades sync, and stale service worker cache causing forced-update prompts and outdated dashboard data.

### CTO Review Notes (from live DB inspection via Neon MCP + codebase audit)

- **Live DB state**: 31 applications (21 approved, 7 rejected, 3 draft), 0 payment records, 4 active program fees. System is in active production use.
- **SSE `ERR_QUIC_PROTOCOL_ERROR`**: The `/api/v1/events/stream/` endpoint returns `ERR_QUIC_PROTOCOL_ERROR 200` — this is a server-side HTTP/3 (QUIC) protocol issue on the Koyeb hosting layer, not a client bug. The SSE client should handle this gracefully as a network error, not an auth failure.
- **SSE `maxRetries` is 5**: The client already has exponential backoff (1s→2s→4s→8s→16s, capped at 30s) and caps at 5 retries. The real problem is that after 5 retries it gives up silently, then the page visibility handler resets `retryCount` to 0 and reconnects — creating an infinite loop of 5-retry bursts.
- **EventSource API limitation**: `EventSource.onerror` does not expose HTTP status codes. The design's fetch-based HEAD probe before reconnect is the correct approach to distinguish auth failures (401/403) from network errors.
- **Grades sync 405**: Confirmed — `ApplicationGradesView` in `backend/apps/applications/views.py` only implements `get()` and `post()`. Frontend `syncGradesWithRecovery` sends PUT. One-line fix: change to POST.
- **Session expired on upload**: The `useApplicationFileUploads.ts` hook calls `/auth/session/` before every upload. On Koyeb's infrastructure, this endpoint occasionally returns 403 due to CSRF token rotation or cookie timing. The retry-once approach is correct.
- **Service worker stale cache**: The SW uses `NetworkFirst` for API calls (5s timeout) but `StaleWhileRevalidate` for static assets. On new deployments, old JS bundles may be served from cache. Adding `skipWaiting()` + `clients.claim()` + API cache purge on activation is the correct fix.
- **No framer-motion dependency**: The project does NOT use framer-motion. All animations should use pure CSS transitions/keyframes or the lightweight `motion` library if needed. Do NOT add framer-motion as a dependency.

## Glossary

- **Admissions_App**: The React 18 + TypeScript SPA at `apps/admissions/` serving the student and admin admissions experience
- **Landing_Page**: The public-facing page at `apps/admissions/src/pages/LandingPage.tsx` containing hero, stats, features, accreditation, programs, and CTA sections
- **SSE_Client**: The Server-Sent Events client at `apps/admissions/src/lib/sseClient.ts` that maintains a real-time connection to `/api/v1/events/stream/`
- **Service_Worker**: The Workbox-based service worker at `apps/admissions/src/service-worker.ts` managing precache, runtime caching, and offline fallback
- **Student_Dashboard**: The authenticated student dashboard at `apps/admissions/src/pages/student/Dashboard.tsx` displaying applications, intakes, interviews, and profile data
- **File_Upload_Hook**: The `useApplicationFileUploads` hook at `apps/admissions/src/pages/student/applicationWizard/hooks/useApplicationFileUploads.ts` handling document upload with session verification
- **Grades_Sync**: The `syncGradesWithRecovery` function at `apps/admissions/src/lib/connectionFix.ts` that syncs grade data to `PUT /api/v1/applications/{id}/grades/`
- **ApplicationGradesView**: The Django REST Framework view at `backend/apps/applications/views.py` serving `GET` and `POST` for `/api/v1/applications/{id}/grades/`
- **Infinite_Grid**: A CSS/SVG-based animated grid background component from the 21st.dev registry
- **Preloader**: A 3-dots animated loader displayed during initial page load before the app shell renders
- **Hero_Section**: The primary above-the-fold section of the Landing_Page containing headline, description, and call-to-action buttons
- **Text_Rotate**: An animated text component that cycles through multiple phrases with rotation transitions
- **Text_Effect**: A motion-based text animation component for entrance and emphasis effects
- **Shiny_Text**: An animated text component with a shimmering gradient highlight effect
- **Backoff_Strategy**: An algorithm that progressively increases delay between retry attempts (exponential: delay = initialBackoff × 2^attempt, capped at maxBackoff)
- **Auth_Failure**: An HTTP 401 Unauthorized or 403 Forbidden response from the backend indicating the user session is invalid or expired

## Requirements

### Requirement 1: Infinite Grid Background

**User Story:** As a visitor, I want the landing page to have a subtle animated grid background, so that the site feels modern and visually engaging.

#### Acceptance Criteria

1. THE Landing_Page SHALL render an animated infinite grid background behind the hero and CTA sections
2. WHILE the grid background is rendering, THE Admissions_App SHALL maintain a frame rate above 30 frames per second on mobile devices
3. THE Infinite_Grid component SHALL use CSS or SVG rendering without relying on WebGL or canvas to preserve accessibility and battery life
4. WHEN the user has `prefers-reduced-motion` enabled, THE Infinite_Grid SHALL render as a static grid pattern without animation

### Requirement 2: Preloader for Initial Page Load

**User Story:** As a visitor, I want to see a branded loading animation on first visit, so that the page feels polished while assets load.

#### Acceptance Criteria

1. WHEN the Admissions_App is loading for the first time, THE Preloader SHALL display a 3-dots animated loader centered on the viewport
2. WHEN all critical assets have loaded and the React app has mounted, THE Preloader SHALL fade out and be removed from the DOM within 500 milliseconds
3. THE Preloader SHALL be rendered inline in `index.html` so it appears before any JavaScript bundle executes
4. IF the Admissions_App fails to mount within 10 seconds, THEN THE Preloader SHALL display a "Taking longer than expected" message with a manual refresh link
5. WHEN the user has `prefers-reduced-motion` enabled, THE Preloader SHALL display a static loading indicator instead of the animated dots

### Requirement 3: Animated Logo Text

**User Story:** As a visitor, I want the MIHAS-KATC brand name to have a subtle animation or shiny text effect, so that the brand identity feels premium and memorable.

#### Acceptance Criteria

1. THE Landing_Page SHALL render the MIHAS-KATC brand text with either an animated text entrance effect or a shiny gradient shimmer effect
2. THE animated logo text SHALL play its animation once on initial viewport entry and remain static afterward
3. WHEN the user has `prefers-reduced-motion` enabled, THE animated logo text SHALL render as plain styled text without animation
4. THE animated logo text SHALL use the existing Tailwind CSS design tokens for colors and typography

### Requirement 4: Landing Page Hero Redesign

**User Story:** As a visitor, I want the landing page hero section to feel iconic and immersive, so that the first impression of MIHAS-KATC is compelling.

#### Acceptance Criteria

1. THE Hero_Section SHALL be redesigned with a shape-based or geometric landing hero layout inspired by modern SaaS landing patterns
2. THE Hero_Section SHALL preserve the existing call-to-action buttons ("Start Your Application" and "Learn More") with their current routing behavior
3. THE Hero_Section SHALL preserve the campus image or replace it with an equally compelling visual element
4. THE Hero_Section SHALL remain fully responsive across viewport widths from 320px to 2560px
5. THE Hero_Section SHALL preserve the existing SEO structured data and semantic HTML heading hierarchy (h1)
6. WHILE the Hero_Section is rendering on a mobile device, THE Admissions_App SHALL complete the largest contentful paint within 3 seconds on a 3G connection

### Requirement 5: Text Rotate on Landing Page

**User Story:** As a visitor, I want to see rotating text phrases in the hero section, so that the landing page communicates multiple value propositions dynamically.

#### Acceptance Criteria

1. THE Hero_Section SHALL include a Text_Rotate component that cycles through a configurable list of phrases
2. THE Text_Rotate component SHALL transition between phrases with a smooth rotation animation at a configurable interval
3. WHEN the user has `prefers-reduced-motion` enabled, THE Text_Rotate component SHALL display all phrases as a static comma-separated list or show only the first phrase
4. THE Text_Rotate component SHALL be keyboard-accessible and expose the current phrase to screen readers via an `aria-live` region

### Requirement 6: Text Effect on Landing Page

**User Story:** As a visitor, I want text elements on the landing page to have entrance animations, so that the content feels dynamic as I scroll.

#### Acceptance Criteria

1. THE Landing_Page SHALL apply motion-based text entrance effects to section headings as they enter the viewport
2. THE text entrance effects SHALL trigger once per element when the element first scrolls into view
3. WHEN the user has `prefers-reduced-motion` enabled, THE text entrance effects SHALL be disabled and text SHALL render immediately without animation
4. THE text entrance effects SHALL not block or delay the rendering of text content (text SHALL be visible in the DOM before animation starts)

### Requirement 7: SSE Client Auth-Aware Reconnect

**User Story:** As a developer, I want the SSE client to stop reconnecting after authentication failures, so that the browser console is not flooded with reconnect spam and unnecessary network requests are eliminated.

#### Acceptance Criteria

1. WHEN the SSE_Client receives a 401 or 403 response from `/api/v1/events/stream/`, THE SSE_Client SHALL stop all reconnection attempts immediately
2. WHEN the SSE_Client stops due to an Auth_Failure, THE SSE_Client SHALL dispatch an `auth_failure` event to all subscribed handlers with the HTTP status code
3. WHEN the SSE_Client stops due to an Auth_Failure, THE SSE_Client SHALL log a single warning message at `console.warn` level and suppress all subsequent reconnect log messages
4. WHEN the user re-authenticates after an Auth_Failure, THE SSE_Client SHALL allow a fresh connection attempt by resetting the auth-failure state
5. THE SSE_Client SHALL use `console.debug` instead of `console.log` for all reconnect scheduling messages after the first attempt (current behavior for retryCount > 0 is correct, but the first-attempt log at `console.log` level contributes to noise)
6. THE SSE_Client SHALL cap reconnection attempts at the configured `maxRetries` value (currently 5) and emit a single summary log when the limit is reached
7. WHEN the SSE_Client has exhausted all retries (`maxRetries` reached), THE visibility change handler SHALL NOT reset `retryCount` to 0 and reconnect — the client SHALL remain in a stopped state until explicitly reset via `resetRetryCount()` or `resetAuthFailure()`
8. WHEN the SSE_Client encounters an `ERR_QUIC_PROTOCOL_ERROR` or similar transport-level error, THE SSE_Client SHALL treat it as a network error (not an auth failure) and apply normal exponential backoff

### Requirement 8: Student Dashboard Loading Performance

**User Story:** As a student, I want the dashboard to load quickly after login, so that I can see my application status without long waits.

#### Acceptance Criteria

1. WHEN the Student_Dashboard mounts, THE Student_Dashboard SHALL render a skeleton or loading state within 200 milliseconds
2. WHEN the SSE_Client is in an auth-failure state, THE Student_Dashboard SHALL not wait for SSE connection before rendering dashboard data
3. WHEN any of the three parallel data fetches (applications, intakes, interviews) fails with a 403 status, THE Student_Dashboard SHALL render the remaining successful data sources and display an inline error for the failed source only
4. THE Student_Dashboard SHALL not trigger SSE reconnection attempts while the dashboard data is loading for the first time
5. WHEN the Student_Dashboard detects that the session endpoint returns 403, THE Student_Dashboard SHALL redirect to the sign-in page within 2 seconds instead of retrying indefinitely

### Requirement 9: Resilient Document Upload Session Check

**User Story:** As a student, I want document uploads to succeed even when the session check is temporarily unreliable, so that I do not lose my upload progress due to transient auth issues.

#### Acceptance Criteria

1. WHEN the File_Upload_Hook session verification call to `/auth/session/` returns a 401 or 403 status, THE File_Upload_Hook SHALL retry the session check once after a 1-second delay before failing
2. IF the session verification retry also fails with 401 or 403, THEN THE File_Upload_Hook SHALL display the message "Your session has expired. Please sign in again to continue uploading." and provide a sign-in link
3. IF the session verification fails due to a network error (not an auth error), THEN THE File_Upload_Hook SHALL proceed with the upload attempt and rely on the upload endpoint's own auth check
4. THE File_Upload_Hook SHALL not throw a generic "Session expired. Please refresh the page." error for transient network failures
5. WHEN the session verification succeeds, THE File_Upload_Hook SHALL proceed with the upload immediately without additional delay

### Requirement 10: Grades Sync 405 Fix

**User Story:** As a student, I want my grades to save correctly during the application wizard, so that my academic records are captured without errors.

#### Acceptance Criteria

1. THE Grades_Sync function SHALL send grade data using the HTTP POST method instead of PUT to `/api/v1/applications/{id}/grades/`
2. THE ApplicationGradesView POST handler SHALL continue to use `update_or_create` semantics so that repeated POST requests for the same subject update the existing grade rather than creating duplicates
3. WHEN the Grades_Sync function sends a batch of grades via POST, THE ApplicationGradesView SHALL return a 200 status with the list of upserted grades
4. WHEN the Grades_Sync function sends a single grade via POST, THE ApplicationGradesView SHALL return 201 for a new grade or 200 for an updated grade
5. FOR ALL valid grade payloads, syncing grades via POST then fetching grades via GET SHALL return a set of grades equivalent to the synced payload (round-trip property)

### Requirement 11: Service Worker Cache Freshness

**User Story:** As a student, I want the application to always show current data after login, so that I do not see stale dashboard information or get unexpected update prompts.

#### Acceptance Criteria

1. WHEN the Service_Worker activates a new version, THE Service_Worker SHALL send a `SKIP_WAITING` message automatically instead of waiting for user interaction
2. WHEN the Service_Worker detects a new version during a navigation request, THE Service_Worker SHALL force-reload the page after activation to ensure the client loads fresh assets
3. THE Service_Worker SHALL clear the API cache bucket on activation of a new version so that stale API responses are not served after deployment
4. WHEN the Admissions_App receives a `cache-updated` message from the Service_Worker, THE Admissions_App SHALL reload the page automatically if the user is on the Student_Dashboard or Landing_Page
5. THE Service_Worker SHALL not cache responses from `/api/v1/auth/` endpoints under any caching strategy (current NetworkOnly behavior SHALL be preserved)
6. IF the Service_Worker fails to activate within 30 seconds, THEN THE Admissions_App SHALL proceed without service worker support and log a warning
