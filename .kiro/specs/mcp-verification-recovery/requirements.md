# Requirements Document

## Introduction

The MIHAS Application System (https://apply.mihas.edu.zm) has undergone a major migration from Supabase to Neon Postgres with custom JWT auth, Vercel serverless functions, and Cloudflare R2 storage. Multiple prior specs have addressed individual migration concerns, but no comprehensive end-to-end verification has been performed against the live runtime. This spec defines a verification-first execution plan that treats every prior fix as "trust but verify" — validating against live Neon schema/data, deployed API behavior, and end-to-end UI flows. It also covers applying pending database migrations, completing the Cloudflare R2 document migration, closing known loopholes, and verifying all 24 identified business issues.

## Glossary

- **Neon_MCP**: The Neon MCP tool used to execute SQL queries and DDL against the live Neon Postgres database
- **Migration_File**: A numbered SQL file in `migrations/` (e.g., `001_extensions.sql`) that defines schema changes to be applied in order
- **R2_Storage**: The Cloudflare R2 storage adapter at `lib/storage.ts` used for document upload, download, and signed URL generation
- **Legacy_URL**: A document URL referencing the old Supabase storage domain that has not yet been migrated to R2_Storage
- **Business_Issue**: One of the 24 identified user-facing or admin-facing problems documented in the codex handoff
- **Contract_Check**: An automated test that validates the shape and structure of an API response against expected schemas
- **Smoke_Test**: A lightweight end-to-end test that exercises a critical user flow to confirm basic functionality
- **Envelope**: The standard API response shape `{ success: boolean, data: T }` returned by all backend endpoints via `sendSuccess()`
- **Action_Router**: The query-parameter-based routing pattern (`?action=xxx`) used by consolidated Vercel serverless functions
- **Idempotency_Key**: A unique identifier used to prevent duplicate processing of the same event or notification
- **SSE_Polling_Hybrid**: The real-time update strategy combining Server-Sent Events with polling fallback, replacing Supabase Realtime
- **Application_Wizard**: The 4-step student application form (Personal Info → Academic History → Program Selection → Document Upload) with 8-second auto-save
- **Core_Entity**: A database table critical to system operation: `profiles`, `applications`, `application_documents`, `notifications`, `user_notification_preferences`, `programs`, `intakes`, `institutions`, `audit_logs`

## Requirements

### Requirement 1: Migration State Discovery and Application

**User Story:** As a system operator, I want all pending database migrations applied to Neon in order, so that the live schema matches the codebase expectations and no features fail due to missing tables, columns, or indexes.

#### Acceptance Criteria

1. WHEN the migration discovery runs, THE System SHALL query the Neon database for the current migration version or migration tracking state
2. WHEN the migration discovery runs, THE System SHALL list all local Migration_File entries in the `migrations/` directory
3. WHEN comparing applied vs. local migrations, THE System SHALL compute the set of migrations not yet applied to Neon
4. WHEN pending migrations exist, THE System SHALL apply them in numerical order, aborting on the first failure
5. IF a migration fails, THEN THE System SHALL capture the SQL error, identify the root cause, and log the failure details before halting
6. WHEN all pending migrations have been applied, THE System SHALL log a success summary with the count of migrations applied

### Requirement 2: Schema Verification Post-Migration

**User Story:** As a developer, I want to verify that all Core_Entity tables exist with their expected columns and constraints in Neon, so that API endpoints can reliably query the database.

#### Acceptance Criteria

1. WHEN schema verification runs, THE System SHALL confirm the existence of these Core_Entity tables: `profiles`, `applications`, `application_documents`, `notifications`, `user_notification_preferences`, `programs`, `intakes`, `institutions`, `audit_logs`
2. WHEN verifying each Core_Entity, THE System SHALL validate that required columns exist with correct data types
3. WHEN verifying foreign key relationships, THE System SHALL confirm that `applications.program_id` references `programs.id`, `applications.intake_id` references `intakes.id`, and `applications.institution_id` references `institutions.id`
4. IF a Core_Entity table is missing or has incorrect structure, THEN THE System SHALL report the discrepancy with the expected vs. actual schema

### Requirement 3: Data Integrity Verification

**User Story:** As a system operator, I want to detect and report data integrity issues in the live database, so that corrupted or orphaned records do not cause runtime failures.

#### Acceptance Criteria

1. WHEN data integrity checks run, THE System SHALL verify that all foreign key references in `applications` resolve to existing rows in `programs`, `intakes`, and `institutions`
2. WHEN data integrity checks run, THE System SHALL detect and report any `applications` rows with null or invalid `status` values
3. WHEN data integrity checks run, THE System SHALL identify orphaned `application_documents` rows that reference non-existent `applications`
4. WHEN data integrity checks run, THE System SHALL detect `profiles` rows with missing or empty `email` fields
5. IF integrity violations are found, THEN THE System SHALL produce a report listing each violation with the affected table, row ID, and nature of the issue

### Requirement 4: Performance Index Verification

**User Story:** As a developer, I want to verify that database indexes exist on frequently queried columns, so that API response times remain acceptable under load.

#### Acceptance Criteria

1. WHEN index verification runs, THE System SHALL confirm indexes exist on `applications.status`, `applications.created_at`, and `applications.user_id`
2. WHEN index verification runs, THE System SHALL confirm indexes exist on `profiles.email` and `profiles.role`
3. WHEN index verification runs, THE System SHALL confirm indexes exist on `notifications.user_id` and `notifications.created_at`
4. IF a required index is missing, THEN THE System SHALL generate the appropriate `CREATE INDEX` statement and apply it via migration

### Requirement 5: Application Tracking Verification

**User Story:** As a prospective student, I want to track my application status using my application number without logging in, so that I can check my progress from any device.

#### Acceptance Criteria

1. WHEN a user submits an application number on the public tracker page, THE System SHALL send a request to the tracking endpoint without requiring authentication
2. WHEN the tracking endpoint receives a valid application number, THE System SHALL return only public-safe fields (application number, status, program name, submission date)
3. WHEN the tracking endpoint receives an invalid application number, THE System SHALL return a clear "not found" message without revealing internal details
4. THE tracking endpoint SHALL enforce rate limiting to prevent abuse
5. THE frontend tracker component SHALL call the correct backend endpoint with the correct request contract

### Requirement 6: Password Reset Flow Verification

**User Story:** As a user who forgot their password, I want to reset it via email, so that I can regain access to my account.

#### Acceptance Criteria

1. WHEN a user requests a password reset, THE auth Action_Router SHALL support a `forgot-password` action that creates a time-limited reset token
2. WHEN a reset token is created, THE System SHALL send a reset email via Resend with a link containing the token
3. WHEN a user submits a new password with a valid reset token, THE auth Action_Router SHALL support a `reset-password` action that updates the password hash
4. WHEN a reset token has been used once, THE System SHALL invalidate the token to prevent reuse
5. WHEN a reset token has expired, THE System SHALL reject the reset attempt with a clear expiration message
6. IF the email delivery fails, THEN THE System SHALL queue the email for retry

### Requirement 7: Display Name Normalization

**User Story:** As a logged-in user, I want to see my actual name displayed in greetings and headers, so that the interface feels personalized rather than showing "User" or my email prefix.

#### Acceptance Criteria

1. WHEN displaying a user's name, THE System SHALL use this precedence: `profile.full_name` → `firstName + lastName` → email local-part → "User"
2. WHEN the session payload is constructed on login, THE auth system SHALL include the canonical `full_name` field derived from the profile
3. WHEN the profile is updated, THE System SHALL update the display name in the session on the next token refresh

### Requirement 8: Application Wizard Text Integrity

**User Story:** As a student filling out the application wizard, I want all labels, instructions, and placeholder text to display correctly in readable English, so that I can understand what information is required.

#### Acceptance Criteria

1. THE Application_Wizard SHALL display all static text content as valid UTF-8 without mojibake or corrupted characters
2. WHEN the wizard renders form labels and instructions, THE System SHALL use hardcoded or properly encoded string literals
3. IF corrupted text patterns are detected in source files, THEN THE System SHALL replace them with clean UTF-8 equivalents

### Requirement 9: Document Download and R2 Migration

**User Story:** As a student, I want to download my uploaded documents and generated receipts from the dashboard, so that I can access my application materials at any time.

#### Acceptance Criteria

1. WHEN a student clicks a document download button, THE System SHALL retrieve the document from R2_Storage using a signed URL
2. WHEN the documents endpoint processes a download request, THE endpoint SHALL use the R2_Storage adapter exclusively with no legacy Supabase storage references
3. WHEN a Legacy_URL is encountered in `application_documents`, THE migration job SHALL fetch the original file, upload it to R2_Storage, verify the checksum, and update the database reference in a transaction
4. WHEN the R2 migration job runs, THE job SHALL be idempotent so that re-running it does not create duplicate files or corrupt references
5. WHEN the migration completes, THE System SHALL verify a random sample of migrated documents by downloading and comparing checksums
6. THE System SHALL maintain rollback metadata (old URL snapshot) for all migrated documents

### Requirement 10: Draft Management Reliability

**User Story:** As a student, I want my application drafts to save reliably and reconcile between local and server storage, so that I never lose my progress.

#### Acceptance Criteria

1. WHEN the Application_Wizard auto-saves at 8-second intervals, THE System SHALL persist the draft to the server via the API without blocking the UI
2. WHEN a student returns to a draft application, THE System SHALL reconcile local and server drafts by using the most recently updated version
3. WHEN a draft save fails due to a network error, THE System SHALL retain the local draft and retry on the next interval
4. WHEN a student explicitly deletes a draft, THE System SHALL remove it from both local storage and the server

### Requirement 11: Student Payment Flow Verification

**User Story:** As a student, I want to view my payment status, upload payment proof, and see verification results, so that I can complete the payment step of my application.

#### Acceptance Criteria

1. WHEN the payment page loads, THE System SHALL display all of the student's applications with their current payment statuses
2. WHEN a student uploads payment proof, THE System SHALL store the document via R2_Storage and update the application payment status
3. WHEN an admin verifies a payment, THE System SHALL update the payment status and notify the student
4. WHEN the payment page encounters an API error, THE System SHALL display a user-friendly error message and allow retry

### Requirement 12: Interview Workflow Verification

**User Story:** As an admin, I want to schedule interviews and have students see their interview details, so that the interview process runs smoothly.

#### Acceptance Criteria

1. WHEN an admin schedules an interview, THE System SHALL create the interview record via the `/applications?action=schedule-interview` endpoint
2. WHEN a student views their application, THE System SHALL display scheduled interview details (date, time, location, status)
3. WHEN an interview status changes, THE System SHALL log the change in the audit trail

### Requirement 13: Notification System Verification

**User Story:** As a user, I want to receive relevant notifications without duplicates, so that I stay informed about my application status without being spammed.

#### Acceptance Criteria

1. WHEN a notification is created, THE System SHALL assign an Idempotency_Key based on the event type and entity ID
2. WHEN a duplicate notification event occurs (same Idempotency_Key), THE System SHALL skip creation and log the deduplication
3. THE System SHALL enforce mandatory email notifications for operational events (application status changes, payment verification, interview scheduling)
4. WHEN a user configures notification preferences, THE System SHALL respect opt-out for non-mandatory channels only
5. WHEN the notification preferences page loads, THE System SHALL display current preferences with correct default values

### Requirement 14: Admin Users Page Verification

**User Story:** As an admin, I want to view, create, update, and delete user accounts, so that I can manage the system's user base.

#### Acceptance Criteria

1. WHEN the admin users page loads, THE System SHALL fetch and display the list of users from `/admin?action=users`
2. WHEN the frontend user service calls the backend, THE service SHALL use the correct request contract matching the Action_Router
3. WHEN an admin creates a new user, THE System SHALL validate the input and create the user with the specified role
4. WHEN an admin updates a user's role, THE System SHALL enforce that only `super_admin` users can promote to `admin` or `super_admin`
5. IF the users endpoint returns an empty list, THEN THE System SHALL display an appropriate empty state rather than an error

### Requirement 15: Programs and Intakes Data Integrity

**User Story:** As an admin, I want programs to display their associated institution names and intakes to show correct deadlines, so that catalog data is accurate.

#### Acceptance Criteria

1. WHEN the programs list is fetched, THE catalog endpoint SHALL join program data with institution names so that no program shows "institution unknown"
2. WHEN the intakes list is fetched, THE catalog endpoint SHALL return intake records with valid `application_deadline` dates
3. WHEN a program or intake is created or updated, THE System SHALL validate foreign key references before persisting
4. THE System SHALL verify that all existing `programs.institution_id` values reference valid `institutions` rows

### Requirement 16: Admin Applications Pagination

**User Story:** As an admin, I want to browse applications with working pagination and "load more" functionality, so that I can review applications efficiently.

#### Acceptance Criteria

1. WHEN the admin applications page loads, THE System SHALL fetch the first page of applications with correct `totalCount` and `hasMore` indicators
2. WHEN an admin clicks "load more", THE System SHALL fetch the next page and append results without duplicates
3. WHEN the server returns pagination metadata, THE `totalCount` SHALL accurately reflect the total number of matching applications
4. THE frontend pagination logic SHALL correctly compute `hasMore` based on loaded count vs. `totalCount`

### Requirement 17: Real-Time Updates Verification

**User Story:** As a student, I want to see application status changes reflected on my dashboard without manual refresh, so that I know immediately when an admin takes action.

#### Acceptance Criteria

1. WHEN an admin approves or rejects an application, THE SSE_Polling_Hybrid SHALL propagate the status change to the student's dashboard within the polling interval
2. WHEN SSE connection fails, THE System SHALL fall back to polling without user intervention
3. WHEN polling receives data identical to the current state, THE System SHALL not trigger unnecessary re-renders

### Requirement 18: Endpoint and Contract Alignment

**User Story:** As a developer, I want all frontend service paths to match backend Action_Router cases exactly, so that no API call silently fails with a 400 "Invalid action" response.

#### Acceptance Criteria

1. THE System SHALL verify that every `action` parameter used in frontend service modules has a corresponding `case` in the backend Action_Router
2. THE System SHALL verify that request body shapes sent by frontend services match what the backend handler expects
3. THE System SHALL verify that response shapes returned by the backend match the TypeScript interfaces used by frontend services
4. IF a mismatch is found, THEN THE System SHALL report the specific endpoint, action, and nature of the discrepancy

### Requirement 19: Production Stub Elimination

**User Story:** As a system operator, I want no stub or placeholder implementations in production-critical code paths, so that all features either work fully or are explicitly disabled.

#### Acceptance Criteria

1. WHEN auditing production code paths, THE System SHALL identify any functions that return hardcoded/mock data instead of real API responses
2. WHEN a stub is found in a production-critical path (analytics, workflow, dashboard preloader, document generation), THE System SHALL either implement the real functionality or remove the feature behind a feature flag
3. THE System SHALL verify that the dashboard preloader fetches real data from API endpoints rather than returning static defaults

### Requirement 20: Session and Profile Consistency

**User Story:** As a user, I want my session, profile, and auth state to be consistent across all pages, so that I don't see stale data or get unexpectedly logged out.

#### Acceptance Criteria

1. WHEN a user logs in, THE auth system SHALL populate the session with a consistent user object shape containing `id`, `email`, `role`, `firstName`, `lastName`, and `full_name`
2. WHEN the profile is fetched on different pages, THE System SHALL return the same object shape regardless of which endpoint or service is used
3. WHEN a session refresh occurs, THE System SHALL update the cached user object in React Query and Zustand stores
4. THE System SHALL verify that no page accesses auth/session/profile data through inconsistent object paths

### Requirement 21: Audit Trail Completeness

**User Story:** As a super admin, I want all critical state changes logged in the audit trail with actor, action, and entity details, so that I can investigate any system activity.

#### Acceptance Criteria

1. WHEN an application status changes, THE System SHALL create an audit log entry with the actor ID, action type, entity type, entity ID, and timestamp
2. WHEN a user account is created, updated, or deleted, THE System SHALL create an audit log entry
3. WHEN a payment is verified or rejected, THE System SHALL create an audit log entry
4. THE audit log entries SHALL never contain PII (no names, emails, or personal data in the log payload)
5. WHEN the admin audit trail page loads, THE System SHALL display paginated audit entries with filtering and sorting

### Requirement 22: Mobile Responsiveness Verification

**User Story:** As a student on a mobile device, I want all pages to be usable without horizontal scrolling or overlapping elements, so that I can complete my application on my phone.

#### Acceptance Criteria

1. THE System SHALL verify that all student-facing pages (dashboard, wizard, payment, profile, tracker) render correctly at 375px viewport width
2. THE System SHALL verify that all admin-facing pages (dashboard, users, applications, programs, intakes, audit) render correctly at 375px viewport width
3. WHEN tables are displayed on mobile, THE System SHALL use responsive patterns (horizontal scroll within container, card layout, or column hiding) rather than overflowing the viewport
4. THE System SHALL verify that all interactive elements (buttons, links, form inputs) meet minimum 44px tap target size

### Requirement 23: Scalability Recommendations

**User Story:** As a system architect, I want a concrete scalability plan for handling thousands of daily users, so that the system can grow without degradation.

#### Acceptance Criteria

1. THE System SHALL document recommended caching strategies for high-traffic endpoints (catalog, application list, dashboard stats)
2. THE System SHALL document recommended database indexing beyond current indexes for scale scenarios
3. THE System SHALL document idempotency patterns for all write operations to support safe retries
4. THE System SHALL document observability recommendations (logging, metrics, alerting) for production monitoring
5. THE System SHALL document connection pooling configuration recommendations for Neon under high concurrency

</content>
</invoke>