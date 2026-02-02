# Requirements Document

## Introduction

This document specifies the requirements for completing the Supabase removal migration in the MIHAS admissions system. The backend migration is 100% complete (Neon Postgres + Cloudflare R2 + Custom JWT Auth), but the frontend still contains direct Supabase client calls that need to be replaced with API endpoint calls. This migration will achieve complete frontend-backend harmony and remove all legacy Supabase dependencies.

## Glossary

- **API_Client**: The centralized HTTP client (`src/lib/apiClient.ts`) that handles all frontend-to-backend communication with automatic credential handling
- **Supabase_Stub**: The mock Supabase client (`src/lib/supabase.ts`) that provides backward compatibility but returns errors for direct database calls
- **Application_Service**: The service layer (`src/services/applications.ts`) that wraps API calls for application-related operations
- **Catalog_Service**: The service layer (`src/services/catalog.ts`) that wraps API calls for programs, intakes, and subjects
- **Interview_API**: The new API endpoint for fetching interview data for student applications
- **Email_Check_API**: The new API endpoint for checking email availability during registration

## Requirements

### Requirement 1: Payment Page Migration

**User Story:** As a student, I want to view my application payment status, so that I can track which applications need payment and which are verified.

#### Acceptance Criteria

1. WHEN the Payment page loads, THE API_Client SHALL fetch applications via `/api/applications?action=list&mine=true` instead of direct Supabase calls
2. WHEN displaying payment status, THE Payment_Page SHALL use the same data structure returned by the API
3. IF the API call fails, THEN THE Payment_Page SHALL display an error message and allow retry
4. THE Payment_Page SHALL remove all imports from `@/lib/supabase`

### Requirement 2: Interview Page Migration

**User Story:** As a student, I want to view my scheduled interviews, so that I can prepare for and attend my admission interviews.

#### Acceptance Criteria

1. WHEN the Interview page loads, THE API_Client SHALL fetch interview data via `/api/applications?action=interviews` instead of direct Supabase calls
2. THE Interview_API endpoint SHALL return interviews with application details joined
3. WHEN filtering interviews, THE Interview_Page SHALL filter by user's applications on the server side
4. IF no interviews exist, THEN THE Interview_Page SHALL display an appropriate empty state
5. THE Interview_Page SHALL remove all imports from `@/lib/supabase`

### Requirement 3: Dashboard Interview Data Migration

**User Story:** As a student, I want to see my scheduled interviews on my dashboard, so that I have a quick overview of upcoming interviews.

#### Acceptance Criteria

1. WHEN the Dashboard loads, THE API_Client SHALL fetch scheduled interviews via `/api/applications?action=interviews` instead of direct Supabase calls
2. THE Dashboard SHALL display interview count and status indicators using API data
3. IF the interview fetch fails, THEN THE Dashboard SHALL gracefully degrade and show other dashboard data
4. THE Dashboard SHALL remove the direct `supabase.from('application_interviews')` call

### Requirement 4: Analytics Dashboard Migration

**User Story:** As a student, I want to see my application progress analytics, so that I can understand my completion rate and average time.

#### Acceptance Criteria

1. WHEN the Analytics Dashboard loads, THE API_Client SHALL fetch application statistics via `/api/applications?action=stats` instead of direct Supabase calls
2. THE Analytics_Dashboard SHALL calculate completion rate and average time from API response
3. IF the API call fails, THEN THE Analytics_Dashboard SHALL hide itself gracefully
4. THE Analytics_Dashboard SHALL remove all imports from `@/lib/supabase`

### Requirement 5: Email Availability Check Migration

**User Story:** As a new user, I want to check if my email is available during registration, so that I know if I can create an account.

#### Acceptance Criteria

1. WHEN a user enters an email on the SignUp page, THE API_Client SHALL check availability via `/api/auth?action=check-email` instead of direct Supabase calls
2. THE Email_Check_API endpoint SHALL return `{ available: boolean }` response
3. IF the email is already registered, THEN THE SignUp_Page SHALL display a message suggesting sign-in
4. THE SignUp_Page SHALL remove the `getSupabaseClient()` import and usage

### Requirement 6: Landing Page Status Check Migration

**User Story:** As a visitor, I want the landing page to load without Supabase configuration checks, so that the page loads quickly.

#### Acceptance Criteria

1. THE Landing_Page SHALL remove the `isSupabaseConfigured` status check and warning display
2. THE Landing_Page SHALL always assume the database is available (via API endpoints)
3. THE Landing_Page SHALL remove all imports from `@/lib/supabase` except type definitions if needed

### Requirement 7: Auth Debug Page Removal

**User Story:** As a developer, I want to remove the legacy auth debug page, so that the codebase is cleaner.

#### Acceptance Criteria

1. THE System SHALL delete the `src/pages/AuthDebugPage.tsx` file
2. THE System SHALL remove any route configuration for the auth debug page
3. IF any component imports AuthDebugPage, THEN THE System SHALL remove those imports

### Requirement 8: Backend Admin API Migration

**User Story:** As an admin, I want the admin API to use direct SQL queries, so that the system no longer depends on Supabase client.

#### Acceptance Criteria

1. THE Admin_API SHALL replace all `supabaseAdmin.from()` calls with direct SQL queries using `lib/db.ts`
2. WHEN fetching settings, THE Admin_API SHALL use parameterized SQL queries
3. WHEN creating/updating users, THE Admin_API SHALL use the `query()` function from `lib/db.ts`
4. THE Admin_API SHALL remove the `supabaseAdmin` import from `lib/supabaseClient.ts`

### Requirement 9: Legacy Supabase Client Removal

**User Story:** As a developer, I want to remove the legacy Supabase compatibility layer, so that the codebase is cleaner and has no deprecated code.

#### Acceptance Criteria

1. WHEN all frontend migrations are complete, THE System SHALL delete `lib/supabaseClient.ts`
2. THE System SHALL update any remaining imports to use `lib/db.ts` directly
3. THE System SHALL remove the `@deprecated` stub client from `src/lib/supabase.ts`
4. THE System SHALL keep only type exports in `src/lib/supabase.ts` if needed for backward compatibility

### Requirement 10: New API Endpoints

**User Story:** As a developer, I want new API endpoints for interview data and email checks, so that the frontend can fetch this data without direct database access.

#### Acceptance Criteria

1. THE Applications_API SHALL support `?action=interviews` to return user's interview data
2. THE Auth_API SHALL support `?action=check-email` to check email availability
3. WHEN fetching interviews, THE API SHALL join with applications table to filter by user_id
4. WHEN checking email, THE API SHALL return `{ available: true/false }` without exposing user data
5. THE API endpoints SHALL follow the existing query parameter routing pattern

### Requirement 11: Admin Component Migrations

**User Story:** As an admin, I want all admin components to use API calls, so that the admin interface works without direct Supabase access.

#### Acceptance Criteria

1. THE Settings_Page SHALL use the existing admin API instead of direct Supabase calls
2. THE Intakes_Page SHALL use catalog service instead of direct Supabase calls
3. THE Programs_Page SHALL use catalog service instead of direct Supabase calls
4. THE EligibilityManagement_Page SHALL use API calls instead of direct Supabase calls
5. THE Applications_Page SHALL use application service instead of direct Supabase calls
6. THE RoleManagement_Page SHALL use admin API instead of direct Supabase calls

### Requirement 12: Component Migrations

**User Story:** As a user, I want all UI components to work correctly after migration, so that the application functions as expected.

#### Acceptance Criteria

1. THE NotificationPreferences component SHALL use API calls instead of direct Supabase calls
2. THE AuthStatusChecker component SHALL use API calls instead of direct Supabase calls
3. THE EligibilityDashboard component SHALL use API calls instead of direct Supabase calls
4. THE ApplicationVersions component SHALL use API calls instead of direct Supabase calls
5. THE UserActivityLog component SHALL use API calls instead of direct Supabase calls
6. THE DatabaseMonitoring component SHALL use API calls instead of direct Supabase calls
7. THE ReportsGenerator component SHALL use API calls instead of direct Supabase calls
8. THE UserImport component SHALL use API calls instead of direct Supabase calls
9. THE TestNotifications component SHALL use API calls instead of direct Supabase calls
