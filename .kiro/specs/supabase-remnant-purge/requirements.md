# Requirements Document

## Introduction

The MIHAS admissions platform has fully migrated from Supabase to Neon Postgres with custom JWT auth and Vercel Serverless Functions. However, approximately 30+ frontend files still import from the deprecated `@/lib/supabase` stub module. These remnants cause runtime failures: the stub returns errors/null data, which triggers infinite re-render loops in polling hooks, UI duplication on dashboards, and broken functionality across services (offline sync, analytics, application tracking, admin notifications, error handling). This spec covers the systematic purge of all Supabase remnants and their replacement with proper API client calls via the existing `apiClient` and domain-specific services.

## Glossary

- **API_Client**: The `apiClient` singleton exported from `src/services/client.ts` that handles all HTTP requests to Vercel Serverless Functions with auth cookies
- **Supabase_Stub**: The deprecated `src/lib/supabase.ts` module that provides mock objects returning errors for backward compatibility
- **Polling_Hook**: React hooks (`useStudentDashboardPolling`, `useAdminDashboardPolling`) that periodically fetch data for dashboard updates
- **Domain_Service**: Existing API-backed service modules in `src/services/` (e.g., `applicationService`, `authService`, `catalogService`) that use API_Client
- **SSE_Client**: The Server-Sent Events client at `src/lib/sseClient.ts` used for real-time admin dashboard updates
- **Application_Wizard**: The multi-step student application form with auto-save functionality
- **Query_Hook**: React Query-based hooks in `src/hooks/queries/` that currently use Supabase_Stub for data fetching

## Requirements

### Requirement 1: Purge Direct Supabase Data Fetching from Hooks

**User Story:** As a student, I want the dashboard polling and data hooks to fetch data from the API so that I see accurate, up-to-date application information without UI glitches.

#### Acceptance Criteria

1. WHEN a Query_Hook fetches data, THE Query_Hook SHALL use API_Client or a Domain_Service instead of Supabase_Stub
2. WHEN `useApplicationQueries` fetches application data, THE hook SHALL delegate to `applicationService` methods
3. WHEN `useAnalyticsQueries` fetches analytics data, THE hook SHALL delegate to the analytics Domain_Service or API_Client
4. WHEN `useNotificationQueries` fetches notifications, THE hook SHALL delegate to `notificationService`
5. WHEN `useStorageQueries` performs file operations, THE hook SHALL delegate to `documentService`
6. WHEN `useApplicationsWithCounts` fetches application counts, THE hook SHALL delegate to `applicationService`
7. WHEN `useApplicationSubmitFixed` submits an application, THE hook SHALL delegate to `applicationService`
8. IF a Query_Hook receives an API error, THEN THE Query_Hook SHALL propagate the error to the calling component without causing re-render loops

### Requirement 2: Purge Supabase from Application Wizard Hooks

**User Story:** As a student, I want the application wizard to save drafts and track analytics through the API so that my progress is reliably persisted.

#### Acceptance Criteria

1. WHEN `useWizardController` saves a draft, THE hook SHALL use API_Client to persist draft data instead of Supabase_Stub
2. WHEN `useAnalytics` tracks a wizard event, THE hook SHALL send analytics via API_Client instead of Supabase_Stub
3. WHEN `useMultiDraft` loads or saves drafts, THE hook SHALL use API_Client instead of Supabase_Stub
4. WHEN the Application_Wizard auto-saves at 8-second intervals, THE auto-save mechanism SHALL continue functioning with API_Client

### Requirement 3: Purge Supabase from Frontend Services

**User Story:** As a system operator, I want all frontend services to communicate through the API layer so that data flows through a single, secure channel.

#### Acceptance Criteria

1. WHEN `offlineDataManager` prefetches data for offline use, THE service SHALL use `catalogService` and `applicationService` instead of Supabase_Stub
2. WHEN `offlineSync` synchronizes queued changes, THE service SHALL use API_Client instead of Supabase_Stub
3. WHEN `optimizedApplications` fetches application lists, THE service SHALL delegate to `applicationService`
4. WHEN `dashboardPreloader` preloads dashboard data, THE service SHALL use Domain_Services instead of Supabase_Stub
5. WHEN `eligibilityAppealsService` manages appeals, THE service SHALL use API_Client instead of Supabase_Stub
6. WHEN `detailedEligibilityService` checks eligibility, THE service SHALL use API_Client instead of Supabase_Stub
7. WHEN `alternativePathwayService` evaluates pathways, THE service SHALL use API_Client instead of Supabase_Stub

### Requirement 4: Purge Supabase from Library Utilities

**User Story:** As a developer, I want all shared library utilities to use the API layer so that there are no hidden Supabase dependencies in the codebase.

#### Acceptance Criteria

1. WHEN `errorHandling` logs an error, THE module SHALL use API_Client to send error data instead of Supabase_Stub
2. WHEN `adminNotifications` broadcasts a notification, THE module SHALL use API_Client instead of Supabase_Stub
3. WHEN `applicationSession` cleans up session data, THE module SHALL use API_Client instead of Supabase_Stub
4. WHEN `networkDiagnostics` tests connectivity, THE module SHALL test the API health endpoint instead of Supabase_Stub
5. WHEN `maintenance` logs task execution, THE module SHALL use API_Client instead of Supabase_Stub
6. WHEN `multiChannelNotifications` sends notifications, THE module SHALL use `notificationService` instead of Supabase_Stub
7. WHEN `authDebug` performs diagnostics, THE module SHALL use API_Client instead of Supabase_Stub
8. WHEN `regulatoryGuidelines` fetches guidelines, THE module SHALL use API_Client instead of Supabase_Stub

### Requirement 5: Purge Supabase from Data Layer and Pages

**User Story:** As a student or admin, I want all pages and data modules to load data from the API so that the UI displays correct information.

#### Acceptance Criteria

1. WHEN `data/applications.ts` fetches application statistics, THE module SHALL use `applicationService` instead of Supabase_Stub
2. WHEN `data/analytics.ts` checks database connectivity, THE module SHALL use the health API endpoint instead of Supabase_Stub
3. WHEN `useApplicationTracker` searches for applications, THE hook SHALL use API_Client instead of Supabase_Stub
4. WHEN `useEmailNotifications` fetches notifications, THE hook SHALL use `notificationService` instead of Supabase_Stub
5. WHEN `useErrorHandling` logs errors, THE hook SHALL use API_Client instead of Supabase_Stub

### Requirement 6: Remove Supabase Type Dependencies

**User Story:** As a developer, I want all type imports to come from local type definitions so that the codebase has no dependency on the Supabase stub module for types.

#### Acceptance Criteria

1. WHEN a file needs the `Application` type, THE file SHALL import it from `src/types/` or a co-located type file instead of `@/lib/supabase`
2. WHEN a file needs the `UserProfile` type, THE file SHALL import it from `src/types/` instead of `@/lib/supabase`
3. WHEN a file needs `Program`, `Intake`, or `Institution` types, THE file SHALL import them from `src/types/` instead of `@/lib/supabase`
4. THE type definitions in `src/types/` SHALL match the shapes returned by the API endpoints

### Requirement 7: Remove the Supabase Stub Module

**User Story:** As a developer, I want the deprecated Supabase stub module removed so that no future code can accidentally depend on it.

#### Acceptance Criteria

1. WHEN all imports from `@/lib/supabase` have been migrated, THE `src/lib/supabase.ts` file SHALL be deleted
2. WHEN the Supabase_Stub is deleted, THE build SHALL complete with zero import errors referencing `@/lib/supabase`
3. WHEN the Supabase_Stub is deleted, THE `useSupabaseQuery` hook SHALL be deleted or fully rewritten to use API_Client

### Requirement 8: Prevent Re-render Loops in Polling Hooks

**User Story:** As a student, I want the dashboard to render stably without flickering or duplicated UI elements.

#### Acceptance Criteria

1. WHEN Polling_Hook data changes, THE hook SHALL use a ref-based comparison to detect actual changes before triggering callbacks
2. WHEN Polling_Hook receives identical data on consecutive polls, THE hook SHALL not trigger the `onDataChange` callback
3. WHEN the student dashboard polls for updates, THE dashboard SHALL not re-render more than once per polling interval
