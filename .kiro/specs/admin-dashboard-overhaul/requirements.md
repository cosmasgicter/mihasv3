# Requirements Document

## Introduction

This spec addresses all known admin-facing production issues in the MIHAS admissions platform. The scope covers eight areas: session/auth refresh flood on browser refresh, admin dashboard UX (duplicate metrics, wrong recent activity data), applications page fixes, user management mobile improvements, intakes end-to-end fixes, program fees fixes, audit system end-to-end overhaul, and admin settings page fixes.

The platform uses Django 5 + DRF on the backend with cookie-based JWT auth (30-min access tokens, 7-day refresh tokens with Redis JTI blacklisting), and React 18 + TypeScript + React Query + Tailwind CSS on the frontend.

## Glossary

- **ApiClient**: The singleton HTTP client in `apps/admissions/src/services/client.ts` that handles all API requests, 401 intercept-refresh-retry, CSRF management, and timeout/retry logic.
- **AuthContext**: The React context provider in `apps/admissions/src/contexts/AuthContext.tsx` that manages authentication state, visibility-change session revalidation, and auth-failure cascades.
- **Refresh_Endpoint**: The `POST /api/v1/auth/refresh/` backend endpoint that rotates JWT access tokens using the HTTP-only refresh cookie.
- **Session_Query**: The React Query cache entry at key `['auth', 'session']` used by `useSessionListener` to track the current authenticated user.
- **RealtimeMetricsDisplay**: The animated counter component in `apps/admissions/src/components/admin/RealtimeMetricsDisplay.tsx` showing live application metrics with change indicators.
- **DashboardMetricsCards**: The simpler 4-card grid component in `apps/admissions/src/components/admin/dashboard/DashboardMetricsCards.tsx` showing today's applications, pending, approval rate, and avg processing time.
- **DashboardActivityFeed**: The recent activity list component in `apps/admissions/src/components/admin/dashboard/DashboardActivityFeed.tsx`.
- **AdminDashboardView**: The Django view at `GET /api/v1/admin/dashboard/` in `backend/apps/accounts/admin_views.py` that returns application stats, user counts, and recent activity.
- **Admin_Dashboard**: The admin dashboard page at `apps/admissions/src/pages/admin/Dashboard.tsx`.
- **Admin_Applications_Page**: The admin applications listing page at `apps/admissions/src/pages/admin/Applications.tsx`.
- **Admin_Users_Page**: The admin user management page at `apps/admissions/src/pages/admin/Users.tsx`.
- **Admin_Intakes_Page**: The admin intakes management page at `apps/admissions/src/pages/admin/Intakes.tsx`.
- **Admin_ProgramFees_Page**: The admin program fees page at `apps/admissions/src/pages/admin/ProgramFees.tsx`.
- **Admin_AuditTrail_Page**: The admin audit trail page at `apps/admissions/src/pages/admin/AuditTrail.tsx`.
- **Admin_Settings_Page**: The admin settings page at `apps/admissions/src/pages/admin/Settings.tsx`.
- **Refresh_Cooldown**: The 5-second window in `ApiClient.attemptRefresh()` during which a cached successful refresh result is returned instead of making a new refresh request.
- **Visibility_Handler**: The `visibilitychange` event listener in AuthContext that invalidates the Session_Query when the browser tab regains focus.

## Requirements

### Requirement 1: Prevent Auth Refresh Flood on Browser Refresh

**User Story:** As an admin, I want to press browser refresh on the admin dashboard without being logged out, so that I can reload the page safely without losing my session.

#### Acceptance Criteria

1. WHEN the browser page is refreshed (F5 or Ctrl+R), THE ApiClient SHALL serialize all concurrent token refresh attempts through a single in-flight promise, ensuring only one `POST /api/v1/auth/refresh/` request reaches the server at a time.
2. WHEN a token refresh attempt fails, THE ApiClient SHALL apply a failure cooldown of at least 2 seconds before allowing another refresh attempt, preventing rapid-fire retry loops.
3. WHILE a token refresh is in-flight, THE ApiClient SHALL queue all subsequent 401-triggered refresh requests to await the existing refresh promise rather than initiating parallel refresh calls.
4. WHEN the Visibility_Handler fires on tab refocus, THE AuthContext SHALL debounce the session query invalidation with a minimum interval of 3 seconds since the last invalidation, preventing duplicate session checks on rapid tab switches.
5. IF a token refresh fails with a network error (`net::ERR_CONNECTION_CLOSED`), THEN THE ApiClient SHALL wait for the failure cooldown period before retrying, rather than immediately cascading into additional refresh attempts.
6. WHEN multiple React Query observers trigger simultaneous session revalidation on page load, THE Session_Query SHALL deduplicate these into a single `GET /api/v1/auth/session/` request via React Query's built-in query deduplication.

### Requirement 2: Remove Duplicate Dashboard Metrics Section

**User Story:** As an admin, I want to see a single, clear metrics display on the dashboard without redundant data, so that I can quickly understand the current state of admissions.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL display the RealtimeMetricsDisplay component as the primary metrics section at the top of the dashboard content area.
2. THE Admin_Dashboard SHALL remove the DashboardMetricsCards component from the dashboard layout, eliminating the duplicate 4-card grid that shows the same data as RealtimeMetricsDisplay.
3. WHEN the Admin_Dashboard renders, THE Admin_Dashboard SHALL display exactly one metrics section containing application counts, pending count, approval rate, and processing time data.

### Requirement 3: Replace Recent Activity with Admissions-Relevant Data

**User Story:** As an admin, I want the dashboard "Recent Activity" section to show recent application submissions, status changes, and payments instead of generic audit log entries, so that I can monitor admissions operations at a glance.

#### Acceptance Criteria

1. THE AdminDashboardView SHALL return recent admissions activity (application submissions, status changes, payment completions) as the `recent_activity` field instead of generic `AuditLog` entries.
2. WHEN the AdminDashboardView computes recent activity, THE AdminDashboardView SHALL query `ApplicationStatusHistory` records ordered by `created_at` descending, limited to the 10 most recent entries.
3. THE AdminDashboardView SHALL include the application number, old status, new status, timestamp, and actor name (when available) in each recent activity entry.
4. WHEN a payment is completed for an application, THE AdminDashboardView SHALL include payment completion events in the recent activity feed alongside status changes.
5. THE DashboardActivityFeed SHALL render each activity item with the application number, a human-readable description of the status change or event, the timestamp, and the actor name when available.
6. IF no recent admissions activity exists, THEN THE DashboardActivityFeed SHALL display an empty state message indicating no recent admissions activity.

### Requirement 4: Admin Applications Page Fixes

**User Story:** As an admin, I want the applications page to work correctly with reliable filtering, sorting, and data display, so that I can efficiently review and manage student applications.

#### Acceptance Criteria

1. WHEN the Admin_Applications_Page loads, THE Admin_Applications_Page SHALL display the paginated list of applications with correct status badges, applicant names, and submission dates.
2. WHEN an admin applies a status filter on the Admin_Applications_Page, THE Admin_Applications_Page SHALL send the filter parameter to the backend and display only applications matching the selected status.
3. WHEN an admin searches by applicant name or application number, THE Admin_Applications_Page SHALL filter results using the backend search endpoint and update the displayed list.
4. WHEN an admin clicks on an application row, THE Admin_Applications_Page SHALL navigate to the application detail/review page for that application.
5. IF the applications API request fails, THEN THE Admin_Applications_Page SHALL display an error state with a retry action using the ErrorDisplay component.
6. THE Admin_Applications_Page SHALL support pagination controls that allow navigating between pages of results.

### Requirement 5: User Management Mobile Improvements

**User Story:** As an admin using a mobile device, I want the user management page to be fully usable on small screens, so that I can manage users from any device.

#### Acceptance Criteria

1. WHILE the viewport width is below 768px, THE Admin_Users_Page SHALL display user records in a card-based layout instead of a table layout, ensuring all user information is readable without horizontal scrolling.
2. WHILE the viewport width is below 768px, THE Admin_Users_Page SHALL stack the search input and filter controls vertically, using full-width inputs.
3. WHEN an admin taps a user card on mobile, THE Admin_Users_Page SHALL expand the card or navigate to show user detail actions (edit role, toggle active status, reset password).
4. THE Admin_Users_Page SHALL use touch-friendly tap targets with a minimum size of 44x44 CSS pixels for all interactive elements on mobile viewports.
5. WHEN the create user modal opens on a mobile viewport, THE Admin_Users_Page SHALL display the modal as a full-screen sheet that does not require horizontal scrolling.
6. THE Admin_Users_Page SHALL maintain all existing desktop functionality (search, role filter, create user, edit user, export CSV, pagination) on mobile viewports.

### Requirement 6: Intakes Management End-to-End Fixes

**User Story:** As an admin, I want the intakes management page to correctly create, edit, list, and delete intakes with proper validation, so that I can manage admissions intake periods reliably.

#### Acceptance Criteria

1. WHEN the Admin_Intakes_Page loads, THE Admin_Intakes_Page SHALL display all intakes with their name, start date, end date, capacity, enrollment count, and status.
2. WHEN an admin creates a new intake, THE Admin_Intakes_Page SHALL validate that the start date is before the end date, capacity is a positive integer, and the intake name is non-empty before submitting to the backend.
3. WHEN an admin edits an existing intake, THE Admin_Intakes_Page SHALL pre-populate the form with the current intake values and submit only changed fields to the backend.
4. WHEN an admin deletes an intake, THE Admin_Intakes_Page SHALL display a confirmation dialog before sending the delete request to the backend.
5. IF an intake API request fails (create, edit, or delete), THEN THE Admin_Intakes_Page SHALL display an inline error message describing the failure and preserve the form state for retry.
6. THE Admin_Intakes_Page SHALL display a utilization indicator (enrollment vs capacity) for each intake using color-coded progress or badge styling.
7. WHILE the viewport width is below 768px, THE Admin_Intakes_Page SHALL use a responsive card layout instead of a table for the intakes list.

### Requirement 7: Program Fees Fixes

**User Story:** As an admin, I want the program fees page to correctly display, create, edit, and delete fee configurations per program, so that I can manage application fee structures accurately.

#### Acceptance Criteria

1. WHEN the Admin_ProgramFees_Page loads, THE Admin_ProgramFees_Page SHALL display the list of programs and their associated fee configurations (local and international amounts, currency).
2. WHEN an admin selects a program, THE Admin_ProgramFees_Page SHALL fetch and display all fee records for that program from `GET /api/v1/programs/{id}/fees/`.
3. WHEN an admin creates a new fee for a program, THE Admin_ProgramFees_Page SHALL validate that the amount is a positive number and the residency type is specified before submitting.
4. WHEN an admin edits an existing fee, THE Admin_ProgramFees_Page SHALL pre-populate the form with current values and submit the update to `PUT /api/v1/programs/{id}/fees/{feeId}/`.
5. WHEN an admin deletes a fee, THE Admin_ProgramFees_Page SHALL display a confirmation dialog before sending the delete request.
6. IF a fee API request fails, THEN THE Admin_ProgramFees_Page SHALL display an inline error message and preserve form state for retry.
7. THE Admin_ProgramFees_Page SHALL display amounts formatted with the correct currency symbol and two decimal places.

### Requirement 8: Audit System End-to-End Overhaul

**User Story:** As an admin, I want the audit trail page to provide comprehensive, filterable, and paginated audit logs with correct data display, so that I can review all system activity for compliance and troubleshooting.

#### Acceptance Criteria

1. WHEN the Admin_AuditTrail_Page loads, THE Admin_AuditTrail_Page SHALL fetch and display paginated audit log entries from `GET /api/v1/admin/audit-logs/` ordered by `created_at` descending.
2. WHEN an admin filters by action type, entity type, date range, or retention category, THE Admin_AuditTrail_Page SHALL send filter parameters to the backend and display only matching entries.
3. THE Admin_AuditTrail_Page SHALL display each audit entry with the action, entity type, entity ID, actor information, timestamp, retention category, and a formatted view of the changes payload.
4. WHEN an admin expands an audit entry, THE Admin_AuditTrail_Page SHALL display the full changes JSON payload in a readable, formatted view.
5. THE Admin_AuditTrail_Page SHALL support pagination with page size selection and page navigation controls.
6. IF the audit log API request fails, THEN THE Admin_AuditTrail_Page SHALL display an error state with a retry action.
7. WHEN the audit log list is empty (no entries match filters), THE Admin_AuditTrail_Page SHALL display an empty state message.
8. THE Admin_AuditTrail_Page SHALL sanitize all displayed audit data (action names, entity types, changes payloads) to prevent XSS when rendering user-generated content.

### Requirement 9: Admin Settings Page Fixes

**User Story:** As an admin, I want the settings page to correctly load, display, create, edit, and delete system settings with proper validation and guided defaults, so that I can configure the platform reliably.

#### Acceptance Criteria

1. WHEN the Admin_Settings_Page loads, THE Admin_Settings_Page SHALL fetch and display all system settings from `GET /api/v1/admin/settings/` grouped by category.
2. WHEN an admin edits a setting value, THE Admin_Settings_Page SHALL validate the value type (string, number, boolean, JSON) before submitting the update.
3. WHEN an admin creates a new setting, THE Admin_Settings_Page SHALL validate that the key is non-empty, unique, and the value is valid for the selected type.
4. WHEN an admin resets settings to defaults, THE Admin_Settings_Page SHALL call `POST /api/v1/admin/settings/reset/` and refresh the settings list with the restored defaults.
5. WHEN an admin imports settings, THE Admin_Settings_Page SHALL call `POST /api/v1/admin/settings/import/` with the settings array and display the import results (imported keys and errors).
6. IF a settings API request fails, THEN THE Admin_Settings_Page SHALL display an inline error message and preserve form state for retry.
7. THE Admin_Settings_Page SHALL display each setting with its key, value, category, description, and public/private visibility indicator.
8. WHILE the viewport width is below 768px, THE Admin_Settings_Page SHALL use a responsive layout that does not require horizontal scrolling to view or edit settings.
