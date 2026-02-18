# Requirements Document

## Introduction

This specification covers the migration recovery and engineering hardening of the MIHAS Application System — a production university admissions portal at https://apply.mihas.edu.zm. The system recently migrated from Supabase to Neon Postgres with custom JWT auth and Vercel serverless functions. Several frontend components still use the legacy API client with envelope-wrapped responses, some service contracts have inconsistencies, and the codebase carries migration debt (dual API clients, Supabase remnants in cache logic, aggressive reload strategies). This spec addresses all remaining issues to bring the platform to production-grade reliability.

## Glossary

- **Legacy_API_Client**: The older API client at `src/lib/apiClient.ts` that returns `{ success, data }` envelope-wrapped responses requiring manual unwrapping by callers.
- **New_API_Client**: The newer API client at `src/services/client.ts` (`ApiClient` class) that automatically unwraps the `{ success, data }` envelope, returning the inner payload directly.
- **Envelope**: The standard API response shape `{ success: boolean, data: T }` returned by all backend endpoints via `sendSuccess()`.
- **Payment_Page**: The student-facing payment page at `src/pages/student/Payment.tsx`.
- **Dashboard_Preloader**: The service at `src/services/dashboardPreloader.ts` that prefetches dashboard data into React Query cache.
- **Metrics_Service**: The service at `src/services/metricsTracking.ts` that calculates application metrics.
- **Reload_Control**: The module at `src/lib/reloadControl.ts` that manages automatic page reloads on chunk errors.
- **PWA_Config**: The PWA configuration at `src/lib/pwaConfig.ts` defining cache strategies and fallback paths.
- **Contract_Test**: An automated test that validates the shape/structure of API responses against expected TypeScript interfaces.
- **SLO**: Service Level Objective — a target reliability metric (e.g., 99.5% API success rate).

## Requirements

### Requirement 1: Migrate Payment Page to New API Client

**User Story:** As a student, I want the payment page to reliably display my applications and payment statuses, so that I can complete my application fee payment without encountering empty or broken screens.

#### Acceptance Criteria

1. WHEN the Payment_Page loads, THE Payment_Page SHALL import and use the New_API_Client (`applicationService` from `src/services/applications.ts`) instead of the Legacy_API_Client (`applicationsApi` from `src/lib/apiClient`).
2. WHEN the New_API_Client returns a paginated response object with an `applications` array, THE Payment_Page SHALL extract the `applications` array from the response and render each application row.
3. WHEN the New_API_Client returns an empty applications array, THE Payment_Page SHALL display the "No Applications Yet" empty state with a "Start Application" button.
4. IF the New_API_Client request fails, THEN THE Payment_Page SHALL display a user-friendly error message and allow retry.
5. WHEN applications are loaded, THE Payment_Page SHALL correctly filter applications by payment status to separate pending payments from completed payments.

### Requirement 2: Consolidate Legacy API Client Usage

**User Story:** As a developer, I want all frontend components to use a single API client with consistent response handling, so that response-shape bugs cannot be reintroduced.

#### Acceptance Criteria

1. THE System SHALL migrate all components currently importing from `src/lib/apiClient.ts` to use the New_API_Client (`src/services/client.ts`) or the appropriate service module in `src/services/`.
2. WHEN a component is migrated, THE component SHALL remove all manual envelope unwrapping (checks for `response.success`, `response.data`, `response.error`).
3. WHEN all components have been migrated, THE Legacy_API_Client file SHALL be marked with a deprecation notice and its exported APIs SHALL be re-implemented as thin wrappers around the New_API_Client.
4. THE System SHALL ensure that the following files are migrated: `Payment.tsx`, `Interview.tsx`, `Dashboard.tsx`, `SignUpPage.tsx`, `NotificationPreferences.tsx`, `EligibilityDashboard.tsx`, `ApplicationVersions.tsx`, `UserImport.tsx`, `TestNotifications.tsx`, `ReportsGenerator.tsx`, `AnalyticsDashboard.tsx`.

### Requirement 3: Remove Supabase Remnants from Cache Logic

**User Story:** As a developer, I want all Supabase references removed from active code paths, so that the codebase accurately reflects the Neon Postgres architecture.

#### Acceptance Criteria

1. WHEN the `getCacheStrategy` function in PWA_Config evaluates a URL, THE function SHALL NOT reference `supabase.co` in its hostname check.
2. THE PWA_Config `getCacheStrategy` function SHALL route API requests based solely on the `/api/` path prefix.

### Requirement 4: Harden Reload Strategy for Constrained Networks

**User Story:** As a student on a mobile network in Zambia, I want the application to handle deployment-related chunk errors gracefully without causing repeated page reloads, so that I can continue using the portal without disruption.

#### Acceptance Criteria

1. WHEN a chunk preload error, dynamic import error, or MIME type error occurs, THE Reload_Control SHALL allow at most one automatic reload per build version per error fingerprint per browser session.
2. WHEN the automatic reload guard has already been consumed for a given error, THE Reload_Control SHALL NOT trigger another reload and SHALL log the blocked attempt.
3. WHEN a user manually clicks a "Retry" or "Refresh" button in an error boundary, THE System SHALL perform a single reload regardless of the auto-reload guard state.
4. THE System SHALL limit the total number of `window.location.reload()` call sites to error boundaries and the centralized Reload_Control module only.

### Requirement 5: Validate Interview Service Routes

**User Story:** As an admin, I want interview scheduling and listing to work correctly, so that I can manage applicant interviews without encountering 404 errors.

#### Acceptance Criteria

1. THE interviews service (`src/services/interviews.ts`) SHALL route all requests through the `/applications` endpoint using query parameter actions (`action=schedule-interview`, `action=interviews`).
2. WHEN scheduling an interview, THE interviews service SHALL send a POST request to `/applications?action=schedule-interview` with the interview data.
3. WHEN listing interviews, THE interviews service SHALL send a GET request to `/applications?action=interviews` with optional `applicationId` filter.
4. THE System SHALL include a contract test verifying that the interview service routes resolve to valid backend actions.

### Requirement 6: Validate Admin Service Contracts

**User Story:** As an admin, I want audit logs and eligibility appeals to load correctly in the admin dashboard, so that I can review system activity and manage student appeals.

#### Acceptance Criteria

1. WHEN the admin audit service requests audit logs, THE service SHALL send a GET request to `/admin?action=audit-log` and THE backend SHALL return a paginated response with `entries`, `page`, `pageSize`, `totalPages`, and `totalCount` fields.
2. WHEN the eligibility appeals service requests appeals, THE service SHALL send a GET request to `/admin?action=appeals` and THE backend SHALL return a paginated response with `appeals`, `totalCount`, `page`, and `pageSize` fields.
3. THE admin audit service SHALL handle the unwrapped response from the New_API_Client without additional `result.data` access patterns.
4. THE eligibility appeals service SHALL handle the unwrapped response from the New_API_Client without additional `result.data` access patterns.

### Requirement 7: Implement API Contract Tests

**User Story:** As a developer, I want automated contract tests for all key API endpoints, so that response shape regressions are caught before deployment.

#### Acceptance Criteria

1. THE System SHALL include contract tests that validate the response shape of the following endpoints: `/api/applications` (list, details), `/api/admin` (dashboard, stats, users, audit-log, appeals), `/api/catalog` (programs, intakes, subjects), `/api/auth` (session, login), `/api/notifications` (preferences).
2. WHEN a contract test runs, THE test SHALL verify that the response contains the expected top-level fields with correct types.
3. WHEN a contract test runs against a paginated endpoint, THE test SHALL verify the presence of pagination fields (`page`, `pageSize`, `totalCount` or equivalent).
4. THE contract tests SHALL use Zod schemas that match the TypeScript interfaces used by frontend services.
5. THE contract tests SHALL be runnable via `bun run test` using Vitest.

### Requirement 8: Improve Dashboard Data Freshness

**User Story:** As an admin, I want the dashboard to display real, up-to-date statistics from the database, so that I can make informed decisions about application processing.

#### Acceptance Criteria

1. WHEN the admin dashboard loads, THE Dashboard_Preloader SHALL fetch real-time statistics from `/admin?action=stats` and `/admin?action=dashboard` endpoints.
2. WHEN the Metrics_Service calculates metrics, THE Metrics_Service SHALL derive all values from actual application data returned by the API.
3. IF an API call in the Dashboard_Preloader fails due to a transient network error, THEN THE Dashboard_Preloader SHALL return empty/zero defaults and log a warning without throwing.
4. WHEN the Metrics_Service `trackApplicationEvent` method calls a nonexistent endpoint, THE Metrics_Service SHALL gracefully handle the 404 and log a warning without throwing.

### Requirement 9: Tune React Query Stale and Refetch Policies

**User Story:** As a student on a constrained mobile network, I want the application to minimize unnecessary API calls, so that the portal remains responsive and does not consume excessive data.

#### Acceptance Criteria

1. THE System SHALL configure React Query with a minimum `staleTime` of 30 seconds for critical dashboard queries to prevent immediate refetching.
2. THE System SHALL disable `refetchOnWindowFocus` for non-critical queries (catalog data, static configuration).
3. WHEN catalog data (programs, intakes, subjects) is fetched, THE System SHALL cache it with a `staleTime` of at least 5 minutes since this data changes infrequently.
4. THE System SHALL NOT configure `refetchInterval` shorter than 30 seconds for any polling query.

### Requirement 10: Session Lifecycle Hardening

**User Story:** As a user, I want my authentication session to be secure and reliable, so that I am not unexpectedly logged out or exposed to session hijacking.

#### Acceptance Criteria

1. WHEN a user logs in, THE auth system SHALL issue an access token (15-minute expiry) and a refresh token (7-day expiry) as HTTP-only cookies.
2. WHEN an access token expires, THE System SHALL automatically attempt a token refresh via `/api/auth?action=refresh` before returning a 401 to the user.
3. WHEN a refresh token is used, THE auth system SHALL rotate the refresh token (issue a new one and invalidate the old one) to prevent replay attacks.
4. THE System SHALL include tests verifying cookie issuance, token refresh, token expiration, and role-based access control enforcement.

### Requirement 11: Admin Authorization Matrix Tests

**User Story:** As a security-conscious developer, I want automated tests verifying that each admin action enforces the correct role requirements, so that unauthorized access is prevented.

#### Acceptance Criteria

1. THE System SHALL include tests verifying that all admin API actions require `admin` or `super_admin` role.
2. THE System SHALL include tests verifying that `set-password` action requires `super_admin` role specifically.
3. THE System SHALL include tests verifying that `student` and `reviewer` roles receive 403 responses for admin actions.
4. WHEN a role-based access test runs, THE test SHALL verify both the HTTP status code and the error code in the response.

### Requirement 12: Asset Pipeline Validation

**User Story:** As a developer, I want all referenced static assets to exist in the repository, so that offline fallbacks and image rendering work correctly.

#### Acceptance Criteria

1. THE System SHALL include a validation check that all image paths referenced in PWA_Config precache list exist in the `public/` directory.
2. THE System SHALL include a validation check that all fallback paths in PWA_Config exist in the `public/` directory.
3. WHEN the asset validation runs, THE validation SHALL report any missing assets as test failures.
