# Bugfix Requirements Document

## Introduction

This bugfix addresses 8 issues discovered during a ScoutQA production readiness audit of the MIHAS-KATC Admissions Portal (https://apply.mihas.edu.zm). The bugs span both the React frontend (Settings, Dashboard, SSE client, LandingPage, font loading) and the Django backend (sessions, token refresh, application tracking), covering UI state management defects, accessibility violations, SSE connection lifecycle gaps, image/font loading resilience, and backend endpoint reliability issues.

## Bug Analysis

### Current Behavior (Defect)

**Bug 1 — Unsaved changes indicator persists after successful save (Settings.tsx)**

1.1 WHEN a student edits profile fields on the Settings page and successfully saves (confirmed by success toast and `saveStatus.tone === 'success'` banner) THEN the system continues to display "You have unsaved changes" below the Save button and the `beforeunload` navigation guard remains active because the `onSubmit` handler in `Settings.tsx` calls `reset()` with a merged object of `formValues` and `updatedProfile`, but if `updateProfile()` returns a partial object or fields with different shapes (e.g. `date_of_birth` as `null` vs `undefined`, or `sex` as a raw string vs the expected union type), React Hook Form's `isDirty` comparison against `defaultValues` may still evaluate to `true`

1.2 WHEN a student saves profile changes and the `updateProfile` response omits fields that were in the original `defaultValues` THEN the system's `reset()` call produces a `defaultValues` object with missing keys, causing React Hook Form to treat those fields as dirty even though no user edit occurred

**Bug 2 — Empty alert element rendered on dashboard (Dashboard.tsx)**

1.3 WHEN the student dashboard renders and one of the error state variables (`applicationsError`, `intakesError`, `interviewsError`) is set to an empty string `''` (which is falsy in JavaScript) THEN the `ErrorDisplay` component is not rendered because the conditional checks (`applicationsError ?`, `intakesError ?`, `interviewsError ?`) correctly gate on truthiness — however, if an error state is set to a whitespace-only string or a non-empty error message that is later cleared to `''` during a race condition between `loadDashboardData` and SSE event handlers, a brief render cycle may produce an `ErrorDisplay` with `role="alert"` that is immediately emptied, leaving an orphaned ARIA landmark in the DOM

1.4 WHEN the `ErrorDisplay` component is rendered with `variant="inline"` or `variant="section"` THEN the component always renders a `div` with `role="alert"` regardless of whether the `message` prop contains meaningful content, because the component has no guard against empty or whitespace-only messages

**Bug 3 — SSE client auth state not cleaned up on logout (sseClient.ts, useSessionListener.ts)**

1.5 WHEN a user logs out via the `signOut` function in `useSessionListener.ts` THEN the system does NOT call `getDefaultSSEClient().disconnect()` or `getDefaultSSEClient().resetAuthFailure()` — the SSE client singleton retains its `authFailed` or `intentionalDisconnect` state from the previous session, and a subsequent login may inherit stale connection state that prevents SSE from reconnecting

1.6 WHEN the SSE client enters the `authFailed` state (after a 401/403 HEAD probe response) and the user subsequently logs out and logs back in THEN the system cannot establish a new SSE connection because `authFailed` remains `true` in the singleton, and `connect()` returns early with `if (intentionalDisconnect || authFailed) return`

1.7 WHEN multiple rapid SSE connection failures occur (e.g. due to QUIC/HTTP3 transport issues) and `retriesExhausted` is set to `true` THEN the system correctly falls back to polling, but after a successful re-authentication the SSE client cannot recover because neither `disconnect()` nor the logout flow resets `retriesExhausted`

**Bug 4 — Broken image loading on landing page (LandingPage.tsx, OptimizedImage.tsx)**

1.8 WHEN the homepage loads and the `ShapeLandingHero` component renders the proof panel image (`/images/programs/mihas-campus.webp`) and the image file does not exist at the expected path in `apps/admissions/public/images/programs/` THEN the `OptimizedImage` component's `onError` handler fires and renders a fallback placeholder — however, the fallback uses a fixed `width` and `height` from props (400×300) which may not match the responsive container dimensions, causing layout shift

1.9 WHEN accreditation badge images referenced in `LandingPageSections` fail to load in production (e.g. due to Vercel deployment path resolution differences between development and production) THEN the system renders broken image placeholders only if those images use the `OptimizedImage` component — any raw `<img>` elements without `onError` handlers render as empty 0×0 spaces with no visual indication of failure

**Bug 5 — Font loading fallback chain incomplete (tailwind.config.js, index.html)**

1.10 WHEN the application loads on a device where the Inter font is not locally installed AND no web font `@font-face` declaration exists for Inter THEN the browser attempts to resolve `Inter` from the Tailwind `fontFamily.sans` config (`['Inter', 'system-ui', 'sans-serif']`), fails, and falls back to `system-ui` — this produces a console font loading error and a visible font mismatch between pages that have loaded vs those that haven't, because there is no `font-display` strategy and the fallback chain in `tailwind.config.js` is missing intermediate fallbacks (`ui-sans-serif`, `-apple-system`, `BlinkMacSystemFont`)

1.11 WHEN the `index.html` comment states "No external font files are loaded" but the Tailwind config lists `Inter` as the primary font THEN the system creates an implicit dependency on the user's local font installation, which is unreliable across devices and operating systems

**Bug 6 — Sessions endpoint returning 500 (session_views.py)**

1.12 WHEN the frontend calls `GET /api/v1/sessions/` to list active sessions THEN the `SessionListView` returns a raw JSON list instead of the standard `{"success": true, "data": [...]}` envelope used by all other authenticated endpoints, which may cause frontend response parsing to fail if the API client expects the envelope format

1.13 WHEN the `SessionListView` queries `DeviceSession.objects.filter(user_id=user_id, is_active=True)` and the `user_id` is extracted via `str(getattr(request.user, "id", ""))` THEN the system may produce a 500 error if the JWTAuthenticationMiddleware fails to properly set `request.user` (e.g. during token expiry edge cases), because filtering by an empty string `user_id` against a UUID column raises a database type mismatch error

**Bug 7 — Token refresh returning 401 (views.py RefreshView)**

1.14 WHEN the frontend calls `POST /api/v1/auth/refresh/` to renew an expired access token and the `refresh_token` cookie is not sent with the request THEN the system returns 401 because the cookie's `domain` attribute (`.mihas.edu.zm`) or `SameSite` attribute (`Lax`) may not match the request origin in production, especially when the frontend at `apply.mihas.edu.zm` calls the API at `api.mihas.edu.zm`

1.15 WHEN the refresh token cookie IS sent but the token has been blacklisted (e.g. by a concurrent session revocation or a previous refresh rotation) THEN the system returns 401 with `"code": "TOKEN_EXPIRED"` — this is correct behavior, but the frontend may not distinguish between "token expired" (retry with re-login) and "cookie not sent" (configuration issue), leading to premature session expiration without actionable user feedback

**Bug 8 — Application tracking search returning 404 (views.py ApplicationTrackView)**

1.16 WHEN a user calls `GET /api/v1/applications/track/?code=MIHAS123456` with a tracking code that does not match any `application_number` or `public_tracking_code` in the database THEN the system correctly returns 404 — this is expected behavior, not a bug, because the audit used a test code that does not correspond to a real application

1.17 WHEN the tracking endpoint returns 404 for a non-existent code THEN the system returns `{"success": false, "error": "Application not found", "code": "NOT_FOUND"}` which is a generic error message that does not help the user understand whether they mistyped the code, whether the code format is wrong, or whether the application exists but is not yet trackable (e.g. still in draft status)

### Expected Behavior (Correct)

**Bug 1 — Unsaved changes indicator**

2.1 WHEN a student successfully saves profile changes on the Settings page THEN the system SHALL call `reset()` with a complete, type-safe merged object that includes all form fields with their server-returned values, ensuring React Hook Form's `isDirty` becomes `false`, the "You have unsaved changes" text disappears, and the `beforeunload` guard is removed

2.2 WHEN the `updateProfile` response omits optional fields THEN the system SHALL merge the response with the submitted `formValues` to produce a complete `defaultValues` object, using explicit fallbacks (e.g. `updatedProfile.date_of_birth ?? formValues.date_of_birth`) for every field to prevent `undefined` gaps

**Bug 2 — Empty alert element**

2.3 WHEN the student dashboard has no active error message (all error state variables are empty strings) THEN the system SHALL NOT render any element with `role="alert"` — the `ErrorDisplay` component SHALL only be present in the DOM when it receives a non-empty, non-whitespace `message` prop

2.4 WHEN the `ErrorDisplay` component receives an empty or whitespace-only `message` prop THEN the component SHALL return `null` and render nothing to the DOM, preventing orphaned ARIA landmarks that confuse screen readers

**Bug 3 — SSE connection lifecycle cleanup**

2.5 WHEN a user logs out via the `signOut` function THEN the system SHALL call `getDefaultSSEClient().disconnect()` to close the active SSE connection and clear all event handlers, AND call `getDefaultSSEClient().resetAuthFailure()` to clear the `authFailed` and `retriesExhausted` flags so that a subsequent login starts with a clean SSE state

2.6 WHEN the SSE client's `disconnect()` method is called during logout THEN the system SHALL also reset the `authFailed` flag internally (or the logout flow SHALL explicitly call `resetAuthFailure()` after `disconnect()`) to ensure no stale auth state persists across login boundaries

2.7 WHEN the SSE client encounters repeated connection failures and `retriesExhausted` becomes `true` THEN the system SHALL allow recovery after a successful re-authentication by resetting `retriesExhausted` when `resetAuthFailure()` is called

**Bug 4 — Image error handling**

2.8 WHEN any image rendered via `OptimizedImage` fails to load THEN the system SHALL display the existing fallback placeholder (which already exists in the component) with responsive dimensions that match the container rather than fixed pixel values, preventing layout shift

2.9 WHEN accreditation badge images or campus photos are referenced outside of the `OptimizedImage` component (e.g. raw `<img>` tags) THEN the system SHALL ensure all image elements use `OptimizedImage` or have an `onError` handler that provides a visible fallback, preventing empty 0×0 gaps

**Bug 5 — Font loading strategy**

2.10 WHEN the Inter font family fails to load or is not locally installed THEN the system SHALL gracefully degrade through an explicit fallback chain in `tailwind.config.js`: `['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif']` to maintain visual consistency across all devices

2.11 WHEN no `@font-face` declaration exists for Inter THEN the system SHALL either add a self-hosted Inter web font with `font-display: swap` to eliminate the dependency on local installation, OR document the local-only strategy explicitly and ensure the fallback chain produces visually acceptable results on devices without Inter

**Bug 6 — Sessions endpoint**

2.12 WHEN the frontend calls `GET /api/v1/sessions/` THEN the system SHALL return a response using the standard `{"success": true, "data": [...]}` envelope format consistent with all other authenticated API endpoints

2.13 WHEN the `user_id` extracted from `request.user` is empty or invalid THEN the system SHALL return a 401 or 403 response with a descriptive error message instead of allowing a database query with an invalid UUID that produces a 500 error

**Bug 7 — Token refresh**

2.14 WHEN the frontend calls `POST /api/v1/auth/refresh/` with a valid, non-expired, non-blacklisted refresh token THEN the system SHALL return new access and refresh tokens via HTTP-only cookies, maintaining the user's authenticated session without interruption

2.15 WHEN the refresh token cookie is not sent with the request (due to cookie configuration mismatch) THEN the system SHALL return a 401 response with a distinct error code (e.g. `"NO_REFRESH_TOKEN"`) that the frontend can use to differentiate between "missing cookie" and "expired/invalid token" scenarios, enabling appropriate user-facing messaging

**Bug 8 — Application tracking error messaging**

2.16 WHEN a user calls `GET /api/v1/applications/track/?code=MIHAS123456` with a code that does not match any application THEN the system SHALL return 404 with a descriptive error message such as `"No application found for the provided tracking code. Please verify the code and try again."` instead of the generic `"Application not found"`

2.17 WHEN the tracking code format does not match the expected pattern (e.g. `APP-YYYYMMDD-XXXXXXXX` for application numbers or `TRK-XXXXXXXXXXXX` for tracking codes) THEN the system SHALL return 400 with a message indicating the code format appears invalid, helping users identify typos before a database lookup is attempted

### Unchanged Behavior (Regression Prevention)

**Settings page**

3.1 WHEN a student modifies profile fields but has NOT yet saved THEN the system SHALL CONTINUE TO display the "You have unsaved changes" indicator and the `beforeunload` navigation guard

3.2 WHEN a student's save request fails with validation errors (server returns `fieldErrors`) THEN the system SHALL CONTINUE TO display inline field errors via `setError()` and keep the form in a dirty state so the user can correct and retry

3.3 WHEN the `useEffect` hydration logic in Settings detects new profile or metadata values THEN the system SHALL CONTINUE TO auto-populate non-dirty fields via `setValue()` without marking them as dirty

3.4 WHEN the `confirmDiscardChanges` function is called during navigation and the form is dirty THEN the system SHALL CONTINUE TO show the browser's native confirmation dialog

**Dashboard**

3.5 WHEN the student dashboard encounters a real error loading applications, intakes, or interviews THEN the system SHALL CONTINUE TO display the error in an `ErrorDisplay` component with a retry action and the `role="alert"` attribute

3.6 WHEN the dashboard is in its initial loading state THEN the system SHALL CONTINUE TO display the `DashboardSkeleton` loading placeholder

3.7 WHEN the dashboard receives SSE `application_update` events after initial load THEN the system SHALL CONTINUE TO invalidate React Query caches and schedule a dashboard reload via `scheduleDashboardReload(250)`

3.8 WHEN all three dashboard data sources return 403 errors THEN the system SHALL CONTINUE TO detect the all-403 condition and redirect to `/auth/signin` within 2 seconds

**SSE client**

3.9 WHEN the SSE client successfully connects and receives events THEN the system SHALL CONTINUE TO dispatch events to registered handlers, reset the retry count to 0 on successful connection, and reset the `hasLoggedError` flag

3.10 WHEN the page becomes hidden and `batteryFriendly` is enabled THEN the system SHALL CONTINUE TO disconnect SSE and reconnect when the page becomes visible again (unless `authFailed` or `retriesExhausted` is true)

3.11 WHEN the SSE client detects 3 rapid failures within the `RAPID_FAILURE_THRESHOLD_MS` window THEN the system SHALL CONTINUE TO set `retriesExhausted = true` and dispatch the `rapid_failure_fallback` error event for polling fallback

3.12 WHEN the SSE client's HEAD probe detects a 401 or 403 status THEN the system SHALL CONTINUE TO set `authFailed = true`, clear reconnect timeouts, and dispatch the `auth_failure` event

**Images and fonts**

3.13 WHEN images load successfully via `OptimizedImage` THEN the system SHALL CONTINUE TO display them with WebP `<picture>` source sets, responsive `srcSet` widths, and lazy loading (unless `lazy={false}`)

3.14 WHEN the Inter font loads successfully (locally installed) THEN the system SHALL CONTINUE TO render text using Inter as the primary typeface with no visible fallback flash

**Backend endpoints**

3.15 WHEN `GET /api/v1/sessions/` is called by an authenticated user with valid tokens THEN the system SHALL CONTINUE TO return the session list with `id`, `device_info`, `last_active`, and `created_at` fields, ordered by `-last_active`

3.16 WHEN `POST /api/v1/sessions/{id}/revoke/` is called THEN the system SHALL CONTINUE TO deactivate the target session and attempt to blacklist the associated refresh token JTI

3.17 WHEN `POST /api/v1/auth/refresh/` is called with an expired or blacklisted refresh token THEN the system SHALL CONTINUE TO return 401 with `"code": "TOKEN_EXPIRED"` and the frontend SHALL handle this by redirecting to sign-in

3.18 WHEN `GET /api/v1/applications/track/` is called without a `code` parameter THEN the system SHALL CONTINUE TO return 400 with `"Tracking code or application number required"`

3.19 WHEN `GET /api/v1/applications/track/` is called with a valid code that matches an existing application THEN the system SHALL CONTINUE TO return the application's public tracking data via `ApplicationTrackingSerializer`

3.20 WHEN the `LogoutView` processes a logout request THEN the system SHALL CONTINUE TO deactivate the device session, blacklist the refresh token JTI, delete CSRF tokens, and clear auth cookies
