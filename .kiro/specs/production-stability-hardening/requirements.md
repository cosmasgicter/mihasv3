# Requirements Document

## Introduction

Production stability hardening for the MIHAS admissions platform, covering three areas: (1) automated intake date lifecycle management to replace manual database edits, (2) complete removal and verification of PWA artifacts that caused auto-logout and stale data issues, and (3) session and auth flow stabilization to eliminate duplicate session calls, token refresh 401 failures, and visibility-change race conditions.

## Glossary

- **Intake_Manager**: A Celery periodic task (or Django management command) responsible for computing and creating intake records with correct date windows based on the intake pattern.
- **Intake**: A `catalog.Intake` model row representing an enrollment period (e.g., "January 2026") with fields `name`, `year`, `start_date`, `application_start_date`, `application_deadline`, `is_active`.
- **Intake_Pattern**: The recurring schedule of 3 intakes per year cycle — January (Year N), July (Year N), January (Year N+1) — with fixed month offsets for application windows.
- **Catalog_API**: The `IntakeListCreateView` at `GET /api/v1/catalog/intakes/` that filters active intakes by `application_start_date` and `application_deadline`.
- **SW_Unregistration**: The one-time service worker unregistration code in `main.tsx` that calls `navigator.serviceWorker.getRegistrations()` and unregisters all registrations.
- **Session_Listener**: The `useSessionListener` hook that manages the single `['auth', 'session']` React Query entry via `GET /api/v1/auth/session/`.
- **Auth_Context**: The `AuthProvider` component that wires session validation, visibility-change revalidation, and the auth failure callback.
- **API_Client**: The `ApiClient` class in `services/client.ts` that handles 401 intercept-refresh-retry, CSRF token rotation, and auth failure cascades.
- **Refresh_Endpoint**: `POST /api/v1/auth/refresh/` — the `RefreshView` that extracts the `refresh_token` cookie, calls `rotate_tokens`, and sets new HTTP-only cookies.
- **JTI_Blacklist**: The Redis-backed set of revoked refresh token JTI values, checked during `verify_token` with fail-closed semantics.
- **Visibility_Guard**: The `hasHiddenOnce` flag in `AuthContext` that prevents the `visibilitychange` handler from firing a session revalidation on initial page load.

## Requirements

### Requirement 1: Intake Date Computation

**User Story:** As a platform administrator, I want intake application windows to be computed automatically from the intake start date, so that I do not need to manually set dates in the database.

#### Acceptance Criteria

1. WHEN a new Intake is created with a `start_date` in January, THE Intake_Manager SHALL set `application_start_date` to February 1 of the preceding year (11 months before the intake start).
2. WHEN a new Intake is created with a `start_date` in July, THE Intake_Manager SHALL set `application_start_date` to August 1 of the preceding year (11 months before the intake start).
3. WHEN a new Intake is created, THE Intake_Manager SHALL set `application_deadline` to 2 calendar months after the intake `start_date`.
4. FOR ALL computed Intake date windows, THE Intake_Manager SHALL guarantee that `application_start_date` is earlier than `start_date` and `start_date` is earlier than `application_deadline`.

### Requirement 2: Intake Auto-Creation

**User Story:** As a platform administrator, I want the system to automatically create future intakes following the January/July pattern, so that there are always 2 open intakes available for applicants.

#### Acceptance Criteria

1. THE Intake_Manager SHALL ensure that at least 2 Intake records have `application_start_date <= today <= application_deadline` at any point in time.
2. WHEN fewer than 2 intakes are currently open for applications, THE Intake_Manager SHALL create the next Intake in the January/July pattern with computed dates.
3. WHEN creating a new Intake, THE Intake_Manager SHALL derive the `name` field from the pattern (e.g., "January 2027", "July 2027") and set `year` to the intake start year.
4. WHEN creating a new Intake, THE Intake_Manager SHALL set `is_active` to `true` and `current_enrollment` to `0`.
5. IF an Intake with the same `name` and `year` already exists, THEN THE Intake_Manager SHALL skip creation and log a warning instead of creating a duplicate.

### Requirement 3: Intake Management Scheduling

**User Story:** As a platform operator, I want intake management to run on a schedule, so that new intakes are created without manual intervention.

#### Acceptance Criteria

1. THE Intake_Manager SHALL be registered as a Celery Beat periodic task in `CELERY_BEAT_SCHEDULE`.
2. THE Intake_Manager SHALL execute once per day at a configurable time (default: 04:00 UTC).
3. THE Intake_Manager SHALL be idempotent — running the task multiple times on the same day SHALL produce the same result as running it once.
4. IF the Celery Beat task fails, THEN THE Intake_Manager SHALL log the error and dispatch an alert email via the existing `ErrorLog` pipeline.
5. THE Intake_Manager SHALL also be callable as a Django management command for manual execution and testing.

### Requirement 4: PWA Dependency Removal

**User Story:** As a developer, I want all PWA dependencies and build artifacts removed from the codebase, so that no stale service worker or cache logic can cause auto-logout or stale data issues.

#### Acceptance Criteria

1. THE Admissions_App SHALL remove `vite-plugin-pwa` and all `workbox-*` packages from `package.json` dependencies.
2. THE Admissions_App SHALL remove the `vite-plugin-pwa/client` type reference from `vite-env.d.ts` and `tsconfig.build.json`.
3. THE Admissions_App SHALL not include `manifest.webmanifest` in the production build output.
4. THE Admissions_App SHALL not include any service worker JavaScript file in the production build output.
5. THE Vite_Config SHALL not reference `vite-plugin-pwa` or any PWA plugin in its plugin array.

### Requirement 5: PWA Test Cleanup

**User Story:** As a developer, I want test files that reference deleted PWA modules removed or updated, so that the test suite does not contain dead references.

#### Acceptance Criteria

1. THE Admissions_App SHALL remove or update `tests/unit/serviceWorkerCache.test.ts` so that the test file does not import or reference deleted service worker modules.
2. THE Admissions_App SHALL remove or update `tests/property/swAuthEndpointsNeverCached.property.test.ts` so that the test file does not reference deleted Workbox routing logic.
3. THE Admissions_App SHALL remove or update `tests/property/postMigrationQaBugs.property.test.ts` so that service worker activation and cache purge test cases do not reference deleted modules.
4. THE Admissions_App SHALL remove or update `tests/unit/appGlobalLazyLoading.test.ts` so that assertions do not reference `ServiceWorkerUpdatePrompt` or `OfflineIndicator` components.
5. WHEN the test suite runs after cleanup, THE Admissions_App SHALL produce zero test failures related to missing PWA modules.

### Requirement 6: PWA Runtime Artifact Cleanup

**User Story:** As a developer, I want runtime code that references service worker caching cleaned up, so that the codebase does not contain dead code paths.

#### Acceptance Criteria

1. THE `cacheMonitor.ts` SHALL remove the `ServiceWorkerCacheMetrics` interface and all `collectServiceWorkerMetrics` logic.
2. THE `pushNotificationManager.ts` SHALL be evaluated for removal or marked as dead code, since push notifications depend on a service worker registration that no longer exists.
3. THE `lazyImportRecovery.ts` SHALL retain its service worker unregistration logic as a defensive cleanup measure for users with stale registrations.
4. THE `hardReload.ts` SHALL retain its service worker unregistration logic as a defensive cleanup measure for users with stale registrations.
5. THE `main.tsx` SHALL retain the one-time SW unregistration block until a sufficient rollover period has passed (minimum 90 days after PWA removal).

### Requirement 7: Session Call Deduplication

**User Story:** As a user, I want the application to make exactly one session validation call on page load, so that unnecessary network requests do not slow down the initial experience or cause race conditions.

#### Acceptance Criteria

1. WHEN the application mounts, THE Session_Listener SHALL issue exactly one `GET /api/v1/auth/session/` request.
2. THE Session_Listener SHALL configure the React Query session entry with `refetchOnMount: true` and `refetchOnWindowFocus: false` to prevent duplicate mount-time fetches.
3. THE Auth_Context visibility-change handler SHALL not fire a session revalidation until the document has transitioned to `hidden` at least once (the `hasHiddenOnce` guard).
4. THE `useAuthCheck` hook SHALL configure its session query observer with `refetchOnMount: false` so that it subscribes to the existing cache entry without triggering an additional fetch.
5. WHEN the user returns to the tab after it was hidden, THE Auth_Context SHALL invalidate the `['auth', 'session']` query exactly once per visibility transition.

### Requirement 8: Token Refresh Reliability

**User Story:** As a user, I want token refresh to succeed when my access token expires but my refresh token is still valid, so that I am not unexpectedly logged out.

#### Acceptance Criteria

1. WHEN the `access_token` cookie has expired and the `refresh_token` cookie is valid and not blacklisted, THE Refresh_Endpoint SHALL return HTTP 200 with new rotated cookies.
2. WHEN the `refresh_token` cookie is missing, THE Refresh_Endpoint SHALL return HTTP 401 with code `INVALID_TOKEN`.
3. WHEN the `refresh_token` has expired, THE Refresh_Endpoint SHALL return HTTP 401 with code `TOKEN_EXPIRED`.
4. WHEN the `refresh_token` JTI is blacklisted in Redis, THE Refresh_Endpoint SHALL return HTTP 401 with code `TOKEN_EXPIRED`.
5. IF Redis is unreachable during JTI blacklist lookup, THEN THE JTI_Blacklist SHALL fail-closed and treat the token as blacklisted, causing the Refresh_Endpoint to return HTTP 401.
6. WHEN the Refresh_Endpoint returns HTTP 200, THE Refresh_Endpoint SHALL include a rotated `X-CSRF-Token` header in the response.
7. WHEN the API_Client receives a 401 on a non-auth endpoint, THE API_Client SHALL attempt exactly one token refresh via `POST /api/v1/auth/refresh/` before retrying the original request.
8. IF the token refresh attempt fails, THEN THE API_Client SHALL invoke the `onAuthFailure` callback to clear caches, dispatch `mihas:auth-expired`, and redirect to sign-in.

### Requirement 9: Visibility Change Session Revalidation

**User Story:** As a user, I want my session to be revalidated when I return to the tab after being away, so that I see current auth state without waiting for a data fetch to 401.

#### Acceptance Criteria

1. WHEN the document transitions from `hidden` to `visible` and the Visibility_Guard `hasHiddenOnce` flag is `true`, THE Auth_Context SHALL call `queryClient.invalidateQueries` for the `['auth', 'session']` key.
2. WHEN the document transitions from `hidden` to `visible` and the Visibility_Guard `hasHiddenOnce` flag is `false`, THE Auth_Context SHALL not trigger any session revalidation.
3. WHEN a `pageshow` event fires with `event.persisted === true` (back-forward cache restoration), THE Auth_Context SHALL set `pendingValidation: true` on the session cache and invalidate the session query.
4. THE Auth_Context SHALL set the `hasHiddenOnce` flag to `true` only when `document.visibilityState` transitions to `hidden`.

### Requirement 10: Auth Failure Cascade

**User Story:** As a user, I want a clean logout experience when my session is truly expired, so that I am redirected to sign-in without stale data lingering in the UI.

#### Acceptance Criteria

1. WHEN the `onAuthFailure` callback fires, THE Auth_Context SHALL clear the React Query cache, clear the CSRF token store, and clear secure storage.
2. WHEN the `onAuthFailure` callback fires, THE Auth_Context SHALL dispatch a `mihas:auth-expired` custom event with `from` and `signInPath` in the detail payload.
3. THE Auth_Context SHALL not perform a hard `window.location` redirect on auth failure — navigation SHALL be driven by route guards listening for the `mihas:auth-expired` event.
4. WHEN the `onAuthFailure` callback fires, THE Auth_Context SHALL attempt to preserve the current URL in `sessionStorage` under `mihas:post-auth-redirect` for post-login redirect.
