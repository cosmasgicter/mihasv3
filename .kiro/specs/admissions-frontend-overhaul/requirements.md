# Requirements Document

## Introduction

Complete overhaul of the MIHAS admissions React frontend (`apps/admissions/`) to consume the Django 5 + DRF backend at `api.mihas.edu.zm` instead of the legacy Vercel Functions API. The frontend currently has 45 files using old `?action=` query-parameter API paths, 15 service files, 64 hooks, and a `normalizeEndpoint()` translation layer in `client.ts` that rewrites REST-style paths into legacy query-parameter form. This spec covers: rewriting the API client and all service/hook layers to use Django `/api/v1/` REST paths, migrating auth context to Django JWT cookies, updating SSE/real-time endpoints, removing backend-only Node.js dependencies from `package.json`, verifying the Neon database schema, and updating steering files to reflect the current architecture.

## Glossary

- **API_Client**: The `ApiClient` class in `apps/admissions/src/services/client.ts` responsible for all HTTP communication with the backend
- **Service_Layer**: The 15 service files in `apps/admissions/src/services/` and `apps/admissions/src/lib/api/` that wrap API_Client calls with domain-specific methods
- **Hook_Layer**: The 64+ React hooks in `apps/admissions/src/hooks/` that consume Service_Layer methods and manage React Query cache
- **Auth_Context**: The authentication context and related hooks in `apps/admissions/src/contexts/` and `apps/admissions/src/hooks/auth/` managing login state, CSRF tokens, and session lifecycle
- **Django_API**: The Django 5 + DRF backend deployed on Koyeb at `api.mihas.edu.zm`, serving all routes under `/api/v1/`
- **Legacy_Contract**: The current frontend API convention using `/api/{resource}?action={action}` query-parameter routing targeting the defunct Vercel Functions backend
- **REST_Contract**: The Django backend convention using resource-style paths like `/api/v1/auth/login/`, `/api/v1/applications/{id}/`
- **Response_Envelope**: The `{"success": true, "data": ...}` wrapper returned by Django_API on all successful responses
- **CSRF_Token**: The cross-site request forgery token exchanged via the `X-CSRF-Token` response/request header
- **SSE_Client**: The Server-Sent Events client in `apps/admissions/src/lib/sseClient.ts` used by the `useRealtime` hook
- **Neon_Database**: The managed Neon Postgres database (project ID: wild-bar-37055823) with 26 tables backing both frontend and backend
- **Steering_Files**: The `.kiro/steering/` documents (`tech.md`, `structure.md`, `product.md`) that guide AI-assisted development
- **Admissions_App**: The React 18 + TypeScript SPA at `apps/admissions/`, built with Vite, deployed to Vercel at `apply.mihas.edu.zm`

## Requirements

### Requirement 1: API Client Core Migration

**User Story:** As a frontend developer, I want the API client to send requests directly to Django REST-style `/api/v1/` paths, so that the frontend communicates with the production backend without a translation layer.

#### Acceptance Criteria

1. THE API_Client SHALL read the backend base URL from the `VITE_API_BASE_URL` environment variable (defaulting to `***REMOVED***`) and use it for all outbound requests
2. THE API_Client SHALL remove the `normalizeEndpoint()` method and the `supportedResources` set that translates REST paths into legacy `?action=` query-parameter form
3. THE API_Client SHALL send all requests with `credentials: 'include'` to transmit HTTP-only cookies cross-origin from `apply.mihas.edu.zm` to `api.mihas.edu.zm`
4. THE API_Client SHALL prepend `/api/v1` to all endpoint paths that do not already start with `/api/v1/` or an absolute URL
5. WHEN a state-changing request (POST, PUT, PATCH, DELETE) is made, THE API_Client SHALL attach the CSRF token from the CSRF Token Store in the `X-CSRF-Token` request header
6. WHEN a response is received, THE API_Client SHALL read the `X-CSRF-Token` response header and update the CSRF Token Store if a new value is present
7. THE API_Client SHALL update the `isAuthExcludedEndpoint()` method to match Django REST paths (`/api/v1/auth/login/`, `/api/v1/auth/register/`, `/api/v1/auth/refresh/`) instead of legacy query-parameter patterns
8. THE API_Client SHALL update the `performRefresh()` method to POST to `/api/v1/auth/refresh/` instead of `/api/auth?action=refresh`
9. THE API_Client SHALL update the `handleCsrf403()` method to fetch the CSRF token from `/api/v1/auth/session/` instead of `/api/auth?action=session`
10. THE API_Client SHALL update `SHORT_TIMEOUT_PATTERNS` to reference `/api/v1/health/` and `/api/v1/auth/session/` instead of legacy paths
11. THE API_Client SHALL update `getQueryInvalidationPatterns()` to parse Django REST-style URL paths instead of extracting `action` and `id` from query parameters
12. THE `unwrapApiResponse()` method SHALL continue to unwrap the `{"success": true, "data": ...}` envelope, as the Django_API uses the same envelope format


### Requirement 2: Auth Service Migration

**User Story:** As a student or admin, I want login, logout, registration, session checks, and password reset to call the correct Django endpoints, so that authentication works against the production backend.

#### Acceptance Criteria

1. WHEN a user submits login credentials, THE Service_Layer SHALL POST to `/api/v1/auth/login/` with `{email, password}` as the request body
2. WHEN a user registers, THE Service_Layer SHALL POST to `/api/v1/auth/register/` with `{email, password, firstName, lastName}` as the request body
3. WHEN a user logs out, THE Service_Layer SHALL POST to `/api/v1/auth/logout/` to clear server-side session and auth cookies
4. WHEN a token refresh is needed, THE Service_Layer SHALL POST to `/api/v1/auth/refresh/` and capture the rotated CSRF token from the response header
5. WHEN the frontend checks session validity, THE Service_Layer SHALL GET `/api/v1/auth/session/` and capture the CSRF token from the response header
6. WHEN a user requests a password reset, THE Service_Layer SHALL POST to `/api/v1/auth/password-reset/` with `{email}` as the request body
7. WHEN a user confirms a password reset, THE Service_Layer SHALL POST to `/api/v1/auth/password-reset/confirm/` with `{token, newPassword}` as the request body
8. THE Service_Layer SHALL remove all references to legacy query-parameter auth paths (`/auth?action=login`, `/auth?action=register`, `/auth?action=refresh`, `/auth?action=session`, `/auth?action=logout`)

### Requirement 3: Applications Service Migration

**User Story:** As a student, I want all application CRUD, status updates, interview scheduling, and export operations to use Django REST paths, so that my application workflow functions correctly.

#### Acceptance Criteria

1. THE Service_Layer SHALL GET `/api/v1/applications/` with query parameters for listing applications with pagination, filtering, and sorting
2. THE Service_Layer SHALL GET `/api/v1/applications/{id}/` to retrieve a single application by ID, replacing the legacy `/applications?id={id}` pattern
3. THE Service_Layer SHALL GET `/api/v1/applications/{id}/details/` to retrieve an application with related documents, grades, and status history
4. THE Service_Layer SHALL POST to `/api/v1/applications/` to create a new application
5. THE Service_Layer SHALL PUT to `/api/v1/applications/{id}/` to update an existing application, replacing the legacy `/applications?id={id}` PUT pattern
6. THE Service_Layer SHALL DELETE `/api/v1/applications/{id}/` to delete an application
7. WHEN an admin updates application status, THE Service_Layer SHALL PATCH `/api/v1/applications/{id}/review/` with `{status, notes, force}` as the request body
8. WHEN an admin updates payment status, THE Service_Layer SHALL PATCH `/api/v1/applications/{id}/review/` with `{paymentStatus, verificationNotes, force}` as the request body
9. THE Service_Layer SHALL GET `/api/v1/applications/{id}/documents/` to retrieve documents for an application
10. THE Service_Layer SHALL GET `/api/v1/applications/{id}/grades/` to retrieve grades for an application
11. THE Service_Layer SHALL GET `/api/v1/applications/{id}/summary/` to retrieve the application summary
12. THE Service_Layer SHALL POST to `/api/v1/applications/{id}/interviews/` to schedule an interview, replacing the legacy PATCH-with-action pattern
13. THE Service_Layer SHALL PUT to `/api/v1/applications/{id}/interviews/` to reschedule an interview
14. THE Service_Layer SHALL DELETE `/api/v1/applications/{id}/interviews/` to cancel an interview
15. THE Service_Layer SHALL GET `/api/v1/applications/export/` with query parameters for admin CSV/Excel export
16. THE Service_Layer SHALL GET `/api/v1/applications/track/` with `{applicationNumber}` or `{trackingCode}` for public application tracking
17. THE Service_Layer SHALL POST to `/api/v1/applications/bulk-status/` for admin bulk status updates
18. THE Service_Layer SHALL POST to `/api/v1/applications/draft/` for auto-save draft persistence
19. THE Service_Layer SHALL handle the Django pagination response format `{page, pageSize, totalCount, results}` and map it to the existing `PaginatedApplicationsResponse` interface
20. THE Service_Layer SHALL remove all legacy `?action=` PATCH patterns (update_status, update_payment_status, verify_document, send_notification, generate_acceptance_letter, generate_finance_receipt, schedule_interview, reschedule_interview, cancel_interview)

### Requirement 4: Catalog Service Migration

**User Story:** As a student, I want to browse programs, intakes, subjects, and institutions from the Django API, so that I can select the correct options when applying.

#### Acceptance Criteria

1. THE Service_Layer SHALL GET `/api/v1/catalog/programs/` to list available programs
2. THE Service_Layer SHALL GET `/api/v1/catalog/intakes/` to list available intakes
3. THE Service_Layer SHALL GET `/api/v1/catalog/subjects/` to list available subjects
4. THE Service_Layer SHALL GET `/api/v1/catalog/institutions/` to list available institutions
5. THE Service_Layer SHALL remove the legacy `normalizeEndpoint` catalog translation that converted `/catalog/programs` to `/api/catalog?type=programs`

### Requirement 5: Documents Service Migration

**User Story:** As a student, I want document upload and OCR extraction to use Django REST paths, so that my application documents are processed correctly.

#### Acceptance Criteria

1. WHEN a student uploads a document, THE Service_Layer SHALL POST to `/api/v1/documents/upload/` with a `FormData` body containing the file and metadata
2. WHEN OCR extraction is requested, THE Service_Layer SHALL POST to `/api/v1/documents/{id}/extract/` to trigger server-side extraction via Celery
3. THE Service_Layer SHALL remove all legacy query-parameter document paths (`/documents?action=upload`, `/documents?action=extract`)

### Requirement 6: Notifications Service Migration

**User Story:** As a student, I want notification preferences and notification listing to use Django REST paths, so that I receive timely updates about my application.

#### Acceptance Criteria

1. THE Service_Layer SHALL GET `/api/v1/notifications/` to list notifications for the current user
2. THE Service_Layer SHALL GET and PUT `/api/v1/notifications/preferences/` to read and update notification preferences
3. THE Service_Layer SHALL remove all legacy query-parameter notification paths (`/notifications?action=preferences`, `/notifications?action=list`)

### Requirement 7: Admin Services Migration

**User Story:** As an admin, I want dashboard, user management, and audit log endpoints to use Django REST paths, so that administrative workflows function correctly.

#### Acceptance Criteria

1. THE Service_Layer SHALL GET `/api/v1/admin/dashboard/` to retrieve dashboard statistics
2. THE Service_Layer SHALL GET `/api/v1/admin/users/` with pagination and filtering query parameters to list users
3. THE Service_Layer SHALL GET `/api/v1/admin/users/{id}/` to retrieve a single user
4. THE Service_Layer SHALL PUT `/api/v1/admin/users/{id}/` to update user details or role
5. THE Service_Layer SHALL GET `/api/v1/admin/users/export/` to export users as CSV
6. THE Service_Layer SHALL GET `/api/v1/admin/audit-logs/` with filtering query parameters to query audit logs
7. THE Service_Layer SHALL update `lib/api/adminApi.ts` to replace all 16 occurrences of legacy admin API paths with Django REST paths
8. THE Service_Layer SHALL remove the legacy `normalizeEndpoint` admin translation that converted `/admin/users/{id}/role` to `/api/admin?action=update-role&id={id}`

### Requirement 8: Session Service Migration

**User Story:** As a student, I want session listing and revocation to use Django REST paths, so that I can manage my active device sessions.

#### Acceptance Criteria

1. THE Service_Layer SHALL GET `/api/v1/sessions/` to list active sessions for the current user
2. THE Service_Layer SHALL POST to `/api/v1/sessions/{id}/revoke/` to revoke a specific session
3. THE Service_Layer SHALL POST to `/api/v1/sessions/revoke-all/` to revoke all sessions except the current one
4. THE Service_Layer SHALL remove all legacy session paths (`/sessions?action=connect`, `/sessions?action=poll`)


### Requirement 9: Hook Layer Migration

**User Story:** As a frontend developer, I want all React hooks that make API calls to use the migrated service methods and correct React Query cache keys, so that data fetching and mutations work against the Django backend.

#### Acceptance Criteria

1. THE Hook_Layer SHALL update all hooks in `hooks/auth/` (useSessionListener, useProfileQuery, useRoleVerification) to use migrated auth service methods and Django REST paths for session validation
2. THE Hook_Layer SHALL update all hooks in `hooks/queries/` (useApplicationDataQueries, useApplicationQueries, useNotificationQueries, useStorageQueries) to use migrated service methods
3. THE Hook_Layer SHALL update all hooks in `hooks/admin/` (useApplicationActions, useApplicationBulkActions, useApplicationDocuments, useApplicationFilters, useApplicationsData, useApplicationStatusHistory, useApplicationStatusUpdate) to use migrated admin and application service methods
4. THE Hook_Layer SHALL update `useAdminDashboardPolling` to poll `/api/v1/admin/dashboard/` instead of the legacy admin dashboard path
5. THE Hook_Layer SHALL update `useStudentDashboardPolling` to use migrated application service methods
6. THE Hook_Layer SHALL update `useUserManagement` to use migrated admin user service methods
7. THE Hook_Layer SHALL update `useSignOutAction` to call the migrated auth logout method
8. THE Hook_Layer SHALL update `useEmailNotifications` to use migrated notification service methods
9. THE Hook_Layer SHALL update `usePushNotifications` to use migrated notification preference endpoints
10. THE Hook_Layer SHALL update React Query cache keys in `applicationQueryInvalidation.ts` to align with Django REST path patterns instead of legacy query-parameter patterns
11. WHEN a hook references a raw `fetch()` call to a legacy endpoint, THE Hook_Layer SHALL replace the raw call with the corresponding migrated service method

### Requirement 10: Auth Context and CSRF Migration

**User Story:** As a student or admin, I want authentication state, CSRF token handling, and session lifecycle to work correctly with Django JWT cookies served cross-origin, so that login persists across page refreshes and CSRF protection remains intact.

#### Acceptance Criteria

1. THE Auth_Context SHALL expect `access_token` and `refresh_token` as HTTP-only cookies set by Django_API with `Domain=.mihas.edu.zm`, `SameSite=Lax`, `Secure=true`
2. THE Auth_Context SHALL extract the CSRF token from the `X-CSRF-Token` response header on login, refresh, and session check responses, and store it in the CSRF Token Store
3. THE Auth_Context SHALL remove any references to Vercel Functions auth endpoints or Vercel-specific auth cookie handling
4. THE Auth_Context SHALL update the session validation flow to call `/api/v1/auth/session/` on page load and after visibility change events
5. WHEN the API_Client receives a 401 response, THE Auth_Context SHALL attempt a single token refresh via `/api/v1/auth/refresh/` before triggering sign-out
6. IF the token refresh fails, THEN THE Auth_Context SHALL clear local auth state, dispatch an auth failure event, and redirect to the login page
7. THE Auth_Context SHALL ensure that `credentials: 'include'` is set on all cross-origin requests to `api.mihas.edu.zm` so that cookies are transmitted

### Requirement 11: Response Envelope and Pagination Handling

**User Story:** As a frontend developer, I want the response envelope unwrapping and pagination mapping to handle the Django API response format correctly, so that all service consumers receive data in the expected shape.

#### Acceptance Criteria

1. THE API_Client SHALL continue to unwrap the `{"success": true, "data": ...}` envelope via the existing `unwrapApiResponse()` method, as the Django_API uses the same envelope format
2. WHEN a paginated list response is received, THE Service_Layer SHALL map the Django pagination format `{page, pageSize, totalCount, results}` to the frontend interfaces that expect `{page, pageSize, totalCount, applications}` or equivalent domain-specific field names
3. WHEN an error response is received, THE API_Client SHALL parse the Django error envelope `{"success": false, "error": "<message>", "code": "<error_code>"}` and surface the error message and code to callers
4. WHEN a response contains `fieldErrors`, THE API_Client SHALL format field-level validation errors from the Django serializer error format into user-facing messages
5. IF a non-JSON response is received (file download, CSV export), THEN THE API_Client SHALL skip envelope unwrapping and return the raw response body

### Requirement 12: SSE and Real-Time Migration

**User Story:** As a student, I want real-time application status updates and notifications delivered via SSE from the Django backend, so that I see live updates without manual refresh.

#### Acceptance Criteria

1. THE SSE_Client SHALL connect to `/api/v1/events/stream/` on `api.mihas.edu.zm` for Server-Sent Events, replacing the legacy `/api/sessions?action=connect` endpoint
2. THE SSE_Client SHALL send cross-origin SSE requests with `withCredentials: true` to transmit auth cookies to `api.mihas.edu.zm`
3. WHEN SSE connection fails after the configured retry limit, THE `useRealtime` hook SHALL fall back to polling `/api/v1/events/poll/` instead of the legacy `/api/sessions?action=poll`
4. THE `useRealtime` hook SHALL update the `SSE_ENDPOINT` constant to `/api/v1/events/stream/` and the `POLLING_ENDPOINT` constant to `/api/v1/events/poll/`
5. THE `useRealtime` hook SHALL enable SSE by default (`enabled: true`) since the Django backend supports persistent SSE connections without the Vercel Hobby 10-second function timeout limitation
6. THE `useRealtime` hook SHALL update the polling fallback to use `apiClient.request()` instead of raw `fetch()` to benefit from CSRF handling and cookie credentials

### Requirement 13: Raw Fetch and Storage Migration

**User Story:** As a frontend developer, I want all raw `fetch()` calls and storage helper API calls migrated to Django REST paths, so that no legacy endpoint references remain in the codebase.

#### Acceptance Criteria

1. THE Admissions_App SHALL update `lib/storage.ts` to replace all 6 occurrences of legacy API paths with Django REST paths
2. THE Admissions_App SHALL update `lib/api/adminApi.ts` to replace all 16 occurrences of legacy admin API paths with Django REST paths
3. THE Admissions_App SHALL replace any raw `fetch('/api/...')` calls found in hooks, components, or pages with the corresponding migrated service method or `apiClient.request()` call
4. THE Admissions_App SHALL update `lib/connectionFix.ts` (used by `syncGradesWithRecovery`) to use Django REST paths for grade sync operations
5. IF a raw `fetch()` call cannot be replaced with a service method, THEN THE Admissions_App SHALL use `apiClient.request()` with the correct Django REST path

### Requirement 14: Backend-Only Dependency Removal

**User Story:** As a frontend developer, I want all Node.js backend dependencies removed from the admissions `package.json`, so that the frontend bundle is clean and the build does not include server-side packages.

#### Acceptance Criteria

1. THE Admissions_App SHALL remove the following production dependencies from `apps/admissions/package.json`: `@arcjet/decorate`, `@arcjet/node`, `@neondatabase/serverless`, `bcryptjs`, `cors`, `express`, `jose`, `node-fetch`, `pg`, `resend`, `web-push`
2. THE Admissions_App SHALL remove the following type-only dependencies from `apps/admissions/package.json`: `@types/bcryptjs`, `@types/pg`, `@types/web-push`
3. THE Admissions_App SHALL remove the `@vercel/node` dev dependency since Vercel Functions are no longer used
4. THE Admissions_App SHALL remove the `dev:api` and `dev:full` scripts from `package.json` since `local-server.js` does not exist
5. THE Admissions_App SHALL remove the `@aws-sdk/client-sqs` dependency since SQS is not used by the frontend
6. THE Admissions_App SHALL verify that no remaining source file imports from any removed package before deletion
7. AFTER dependency removal, THE Admissions_App SHALL run `bun install` to regenerate the lockfile without the removed packages

### Requirement 15: Neon Database Schema Verification

**User Story:** As a developer, I want to verify that all 26 Neon database tables exist and match the Django model definitions, so that the frontend can trust the backend data contract.

#### Acceptance Criteria

1. THE verification process SHALL confirm that all 26 tables exist in the Neon_Database (project ID: wild-bar-37055823): `profiles`, `applications`, `application_documents`, `application_grades`, `application_status_history`, `application_drafts`, `application_interviews`, `programs`, `intakes`, `program_intakes`, `course_requirements`, `subjects`, `institutions`, `payments`, `notifications`, `user_notification_preferences`, `email_queue`, `device_sessions`, `csrf_tokens`, `password_reset_tokens`, `login_attempts`, `audit_logs`, `idempotency_keys`, `settings`, `user_permission_overrides`, `migration_history`
2. THE verification process SHALL confirm that foreign key relationships between tables match the Django model `ForeignKey` and `ManyToManyField` definitions
3. THE verification process SHALL confirm that indexes exist for columns commonly used in query filters: `applications.user_id`, `applications.status`, `applications.program`, `applications.institution`, `audit_logs.entity_type`, `audit_logs.actor_id`, `device_sessions.user_id`, `notifications.user_id`
4. IF a table is missing or a column type mismatch is found, THEN THE verification process SHALL produce a report listing all discrepancies with the expected vs actual schema

### Requirement 16: Steering Files Update

**User Story:** As a developer using AI-assisted tooling, I want the steering files to accurately reflect the current architecture, so that AI suggestions align with the real codebase state.

#### Acceptance Criteria

1. THE Steering_Files SHALL update `tech.md` to remove all references to Vercel Functions, legacy `/api/...` query-parameter routing, and the `normalizeEndpoint()` translation layer
2. THE Steering_Files SHALL update `tech.md` to document that the frontend API client sends requests directly to `/api/v1/` paths on `api.mihas.edu.zm`
3. THE Steering_Files SHALL update `structure.md` to remove references to `local-server.js`, `dev:api` script, and legacy API handler modules
4. THE Steering_Files SHALL update `structure.md` to document that `apps/admissions/src/services/client.ts` sends requests directly to Django REST paths without a translation layer
5. THE Steering_Files SHALL update `product.md` to remove the "Migration Reality" section describing the frontend/backend contract mismatch, replacing it with a statement that the frontend consumes the Django `/api/v1/` contract directly
6. THE Steering_Files SHALL update all three files to reflect the monorepo structure: `backend/` for Django API, `apps/admissions/` for the React frontend, `shared/` for cross-app code

### Requirement 17: Frontend Build Verification

**User Story:** As a developer, I want the admissions frontend to build, type-check, and pass tests after all migration changes, so that the deployment pipeline remains green.

#### Acceptance Criteria

1. AFTER all migration changes are applied, THE Admissions_App SHALL pass `bun run build` from `apps/admissions/` without TypeScript errors
2. AFTER all migration changes are applied, THE Admissions_App SHALL pass `tsc --noEmit` from `apps/admissions/` without type errors
3. AFTER all migration changes are applied, THE Admissions_App SHALL pass `bun run test` from `apps/admissions/` with all existing tests passing or updated tests passing
4. IF an existing test imports from a deleted legacy module, THEN THE test SHALL be updated to import from the migrated module or removed if the test is no longer relevant
5. IF an existing test asserts against legacy query-parameter URL patterns, THEN THE test SHALL be updated to assert against Django REST URL patterns
6. THE Admissions_App SHALL produce no new ESLint errors after migration changes

### Requirement 18: Environment Variable Configuration

**User Story:** As a DevOps engineer, I want the frontend environment variables correctly configured for the Django backend, so that the Vercel deployment connects to the right API.

#### Acceptance Criteria

1. THE Admissions_App SHALL read `VITE_API_BASE_URL` as the sole environment variable for the backend API base URL
2. THE Admissions_App SHALL default `VITE_API_BASE_URL` to `***REMOVED***` in production when the variable is not set
3. THE Admissions_App SHALL support `VITE_API_BASE_URL=http://localhost:8000` for local development against the Django dev server
4. THE Admissions_App SHALL remove any references to `NEXT_PUBLIC_API_BASE_URL` or other non-Vite environment variable prefixes for the API base URL
5. THE Admissions_App SHALL document the required environment variables in a `.env.example` file at `apps/admissions/.env.example`
