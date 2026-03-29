# Implementation Plan: Admissions Frontend Overhaul

## Overview

Migrate the MIHAS admissions React frontend from legacy Vercel Functions API conventions to the Django 5 + DRF backend. The migration proceeds in strict dependency order: API client core → service layer → hook layer → auth context + SSE → raw fetch → backend gaps → dependency cleanup → DB verification → steering files → build verification + tests. Each tier has a checkpoint.

## Tasks

- [ ] 1. API Client Core Migration
  - [x] 1.1 Rewrite `src/services/client.ts` — remove `normalizeEndpoint()` and `supportedResources`
    - Delete the `normalizeEndpoint()` method (~60 lines) and the `supportedResources` set
    - Delete `getResourceSegments()` if unused after removal
    - Update `request()` to call `toApiV1Path(endpoint)` instead of `this.normalizeEndpoint(endpoint, method)`
    - Ensure `toApiV1Path()` prepends `/api/v1` to paths not already prefixed, deduplicates slashes, and handles absolute URLs as passthrough
    - _Requirements: 1.2, 1.4_

  - [x] 1.2 Update `request()` to enforce `credentials: 'include'` and CSRF handling
    - Ensure every `fetch()` call in `request()` includes `credentials: 'include'`
    - For POST/PUT/PATCH/DELETE, attach `X-CSRF-Token` header from the CSRF Token Store (`lib/csrfToken.ts`)
    - On every response, read `X-CSRF-Token` header and update the store if present
    - _Requirements: 1.3, 1.5, 1.6, 10.7_

  - [x] 1.3 Update auth-related methods in `client.ts` to use Django REST paths
    - Update `isAuthExcludedEndpoint()` to match `/api/v1/auth/refresh/`, `/api/v1/auth/login/`, `/api/v1/auth/register/` instead of legacy `?action=` patterns
    - Update `performRefresh()` to POST to `/api/v1/auth/refresh/` instead of `/api/auth?action=refresh`
    - Update `handleCsrf403()` to fetch CSRF from `/api/v1/auth/session/` instead of `/api/auth?action=session`
    - _Requirements: 1.7, 1.8, 1.9_

  - [x] 1.4 Update timeout patterns and query invalidation in `client.ts`
    - Update `SHORT_TIMEOUT_PATTERNS` to `['/api/v1/health/', '/api/v1/auth/session/']`
    - Rewrite `getQueryInvalidationPatterns()` to parse REST-style URL path segments (`/resource/id/action/`) instead of extracting `action` and `id` from query parameters
    - _Requirements: 1.10, 1.11_

  - [x] 1.5 Update `unwrapApiResponse()` and error parsing
    - Verify `unwrapApiResponse()` still correctly unwraps `{success: true, data: ...}` envelope (no change expected)
    - Ensure non-JSON responses (file downloads, CSV exports) skip envelope unwrapping and return raw body
    - Ensure error responses parse `{success: false, error, code, fieldErrors}` and format `fieldErrors` into `"fieldLabel: message"` strings joined by semicolons, with `_root` displayed as `"General"`
    - _Requirements: 1.12, 11.1, 11.3, 11.4, 11.5_

  - [x] 1.6 Add `VITE_API_BASE_URL` environment variable support
    - Ensure `getApiBaseUrl()` reads `VITE_API_BASE_URL`, strips trailing slashes and `/api/v1` suffixes
    - Default to `***REMOVED***` when the variable is not set
    - Remove any references to `NEXT_PUBLIC_API_BASE_URL` or other non-Vite prefixes
    - Create `apps/admissions/.env.example` with `VITE_API_BASE_URL` documented
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

  - [x]* 1.7 Write property tests for API client core (Properties 1–7, 11–13)
    - **Property 1: API path prefix normalization (idempotent)** — generate random path strings, assert `toApiV1Path()` always returns `/api/v1/`-prefixed result, is idempotent, and produces no consecutive slashes
    - **Validates: Requirement 1.4**
    - **Property 2: Credentials inclusion on all requests** — generate random methods/endpoints, mock fetch, assert `credentials: 'include'`
    - **Validates: Requirements 1.3, 10.7**
    - **Property 3: CSRF token attachment on state-changing requests** — generate mutation methods + random tokens, assert `X-CSRF-Token` header present; assert absent for GET/HEAD
    - **Validates: Requirement 1.5**
    - **Property 4: CSRF token capture from responses** — generate responses with/without `X-CSRF-Token`, assert store updates
    - **Validates: Requirements 1.6, 10.2**
    - **Property 5: Auth-excluded endpoint classification** — generate random endpoints including the 3 auth paths, assert boolean classification
    - **Validates: Requirement 1.7**
    - **Property 6: Response envelope unwrapping with non-JSON passthrough** — generate objects with/without `{success, data}` shape, assert unwrap behavior
    - **Validates: Requirements 1.12, 11.1, 11.5**
    - **Property 7: Error response parsing with field-level errors** — generate error responses with/without fieldErrors, assert formatted output
    - **Validates: Requirements 11.3, 11.4**
    - **Property 11: Query invalidation pattern mapping for REST URLs** — generate REST URLs + methods, assert returned query keys derived from path segments
    - **Validates: Requirement 1.11**
    - **Property 12: 401 intercept-refresh-retry behavior** — generate endpoints, mock 401 responses, assert single refresh attempt + retry
    - **Validates: Requirement 10.5**
    - **Property 13: API base URL resolution** — generate random URL strings for env var, assert normalization
    - **Validates: Requirements 1.1, 18.1**
    - Test files: `tests/property/apiClient.property.test.ts`, `tests/property/apiConfig.property.test.ts`

- [x] 2. Checkpoint — API client core complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify `normalizeEndpoint` and `supportedResources` are fully removed from `client.ts`
  - Verify all `client.ts` paths reference `/api/v1/` Django REST routes

- [x] 3. Service Layer Migration
  - [x] 3.1 Migrate `src/services/auth.ts` to Django REST paths
    - Replace all query-parameter auth paths with Django REST paths per the design path mapping table
    - `register` → POST `/auth/register/`, `login` → POST `/auth/login/`, `logout` → POST `/auth/logout/`, `session` → GET `/auth/session/`, `refresh` → POST `/auth/refresh/`, `passwordReset` → POST `/auth/password-reset/`, `passwordResetConfirm` → POST `/auth/password-reset/confirm/`
    - Remove all legacy `?action=` auth path references
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x] 3.2 Migrate `src/services/applications.ts` to Django REST paths
    - Rewrite all endpoint paths per the design path mapping table
    - `list` → GET `/applications/`, `getById` → GET `/applications/{id}/`, `getDetails` → GET `/applications/{id}/details/`, `create` → POST `/applications/`, `update` → PUT `/applications/{id}/`, `delete` → DELETE `/applications/{id}/`
    - `updateStatus` → PATCH `/applications/{id}/review/`, `updatePaymentStatus` → PATCH `/applications/{id}/review/`
    - `scheduleInterview` → POST `/applications/{id}/interviews/`, `rescheduleInterview` → PUT `/applications/{id}/interviews/`, `cancelInterview` → DELETE `/applications/{id}/interviews/`
    - `exportApplications` → GET `/applications/export/`, `track` → GET `/applications/track/`, `bulkStatus` → POST `/applications/bulk-status/`, `saveDraft` → POST `/applications/draft/`
    - `getDocuments` → GET `/applications/{id}/documents/`, `getGrades` → GET `/applications/{id}/grades/`, `getSummary` → GET `/applications/{id}/summary/`
    - Map Django pagination `{page, pageSize, totalCount, results}` → `{page, pageSize, totalCount, applications}`
    - Remove all 20 legacy `?action=` PATCH patterns
    - _Requirements: 3.1–3.20, 11.2_

  - [x] 3.3 Migrate `src/services/catalog.ts` to Django REST paths
    - `getPrograms` → GET `/catalog/programs/`, `getIntakes` → GET `/catalog/intakes/`, `getSubjects` → GET `/catalog/subjects/`, `getInstitutions` → GET `/catalog/institutions/`
    - CRUD operations: POST/PUT/DELETE to `/catalog/{resource}/` and `/catalog/{resource}/{id}/`
    - Remove legacy `normalizeEndpoint` catalog translation (`/catalog?type=programs` etc.)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 3.4 Migrate `src/services/documents.ts` and `src/services/documentExtraction.ts`
    - `upload` → POST `/documents/upload/` with FormData body
    - `extract` / `extractPDFContent` → POST `/documents/{id}/extract/`
    - `getSignedUrl` → GET `/documents/{id}/signed-url/`
    - Remove legacy `?action=upload`, `?action=extract` paths
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 3.5 Migrate `src/services/notifications.ts`
    - `list` → GET `/notifications/`, `send` → POST `/notifications/`
    - `getPreferences` → GET `/notifications/preferences/`, `updatePreferences` → PUT `/notifications/preferences/`
    - `markRead` → PUT `/notifications/{id}/read/`, `markAllRead` → PUT `/notifications/read-all/`, `delete` → DELETE `/notifications/{id}/`
    - Remove legacy `?action=preferences`, `?action=list`, `?action=mark-read`, `?action=mark-all-read`, `?action=delete` paths
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 3.6 Migrate `src/services/sessionService.ts`
    - `listActiveSessions` → GET `/sessions/`, `terminateSessionById` → POST `/sessions/{id}/revoke/`, `terminateAllOtherSessions` → POST `/sessions/revoke-all/`
    - Remove legacy `/api/sessions?action=list`, `?action=revoke`, `?action=revoke-all` paths
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 3.7 Migrate `src/services/interviews.ts`
    - `schedule` → POST `/applications/{id}/interviews/`, `list` → GET `/applications/{id}/interviews/`
    - Remove legacy `?action=schedule-interview`, `?action=interviews` paths
    - _Requirements: 3.12, 3.13, 3.14_

  - [x] 3.8 Migrate admin services: `src/services/admin/dashboard.ts`, `admin/users.ts`, `admin/audit.ts`
    - Dashboard: `getOverview` → GET `/admin/dashboard/`
    - Users: `list` → GET `/admin/users/`, `create` → POST `/admin/users/`, `update` → PUT `/admin/users/{id}/`, `remove` → DELETE `/admin/users/{id}/`, `getPermissions` / `updatePermissions` → GET/PUT `/admin/users/{id}/`, `export` → GET `/admin/users/export/`
    - Audit: `list` → GET `/admin/audit-logs/` with query params
    - Remove legacy `?action=dashboard`, `?action=users`, `?action=audit-log`, `?action=update-role` patterns
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.8_

  - [x] 3.9 Migrate `src/services/offlineSync.ts` and `src/services/pushNotificationManager.ts`
    - offlineSync: draft sync → POST `/applications/draft/`, form submission → POST `/applications/`, server version fetch → GET `/applications/{id}/`
    - pushNotificationManager: push subscribe → POST `/notifications/push-subscribe/`
    - _Requirements: 3.4, 3.18_

  - [x]* 3.10 Write property tests for service layer (Properties 8–10)
    - **Property 8: REST URL construction with UUID path segments** — generate random UUIDs and sub-resource names, assert URL matches `/{resource}/{uuid}/{sub-resource}/` with trailing slash and no query params
    - **Validates: Requirements 3.2, 3.3, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 5.2, 7.3, 7.4, 8.2**
    - **Property 9: Pagination response field mapping** — generate random arrays + pagination metadata, assert `results` mapped to domain field with length preserved
    - **Validates: Requirements 3.19, 11.2**
    - **Property 10: Query parameter construction for list endpoints** — generate random filter combinations, assert each non-empty param appears exactly once, no `?action=` in base path
    - **Validates: Requirement 3.1**
    - Test file: `tests/property/services.property.test.ts`

- [x] 4. Checkpoint — Service layer complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify all 15 service files use only Django REST paths (no `?action=` patterns remain)

- [ ] 5. Hook Layer Migration
  - [x] 5.1 Update auth hooks in `src/hooks/auth/`
    - Update `useSessionListener`, `useProfileQuery`, `useRoleVerification` to use migrated auth service methods
    - Ensure session validation calls `/api/v1/auth/session/` via the auth service
    - _Requirements: 9.1_

  - [x] 5.2 Update query hooks in `src/hooks/queries/`
    - Update `useApplicationDataQueries`, `useApplicationQueries`, `useNotificationQueries`, `useStorageQueries` to use migrated service methods
    - _Requirements: 9.2_

  - [x] 5.3 Update admin hooks in `src/hooks/admin/`
    - Update `useApplicationActions`, `useApplicationBulkActions`, `useApplicationDocuments`, `useApplicationFilters`, `useApplicationsData`, `useApplicationStatusHistory`, `useApplicationStatusUpdate` to use migrated admin and application service methods
    - _Requirements: 9.3_

  - [x] 5.4 Update polling and dashboard hooks
    - Update `useAdminDashboardPolling` to poll `/api/v1/admin/dashboard/` via the admin dashboard service
    - Update `useStudentDashboardPolling` to use migrated application service methods
    - _Requirements: 9.4, 9.5_

  - [x] 5.5 Update user management and notification hooks
    - Update `useUserManagement` to use migrated admin user service methods
    - Update `useSignOutAction` to call the migrated auth logout method
    - Update `useEmailNotifications` and `usePushNotifications` to use migrated notification service methods
    - _Requirements: 9.6, 9.7, 9.8, 9.9_

  - [x] 5.6 Update React Query cache keys in `applicationQueryInvalidation.ts`
    - Verify cache key arrays align with Django REST path patterns
    - Update any keys that reference legacy query-parameter patterns
    - _Requirements: 9.10_

  - [-] 5.7 Replace any raw `fetch()` calls in hooks with migrated service methods
    - Scan all hooks for raw `fetch('/api/...')` calls and replace with corresponding service method or `apiClient.request()`
    - _Requirements: 9.11_

- [ ] 6. Checkpoint — Hook layer complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify no hook files contain legacy `?action=` patterns or raw `fetch('/api/...')` calls

- [ ] 7. Auth Context and SSE Migration
  - [~] 7.1 Migrate auth context in `src/contexts/` to Django JWT cookies
    - Remove any references to Vercel Functions auth endpoints or Vercel-specific cookie handling
    - Ensure auth context expects `access_token` and `refresh_token` as HTTP-only cookies set by Django with `Domain=.mihas.edu.zm`, `SameSite=Lax`, `Secure=true`
    - Update session validation flow to call `/api/v1/auth/session/` on page load and after visibility change events
    - Ensure 401 response triggers single token refresh via `/api/v1/auth/refresh/` before sign-out
    - On refresh failure: clear React Query cache, clear CSRF token store, clear secure storage, dispatch `mihas:auth-expired` event, redirect to login
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [~] 7.2 Migrate SSE client and `useRealtime` hook
    - Update `lib/sseClient.ts` default endpoint from `/api/sessions?action=connect` to `${API_BASE}/api/v1/events/stream/`
    - Verify `withCredentials: true` is set on EventSource for cross-origin cookie transmission
    - Update `useRealtime` hook: `SSE_ENDPOINT` → `${API_BASE}/api/v1/events/stream/`, `POLLING_ENDPOINT` → `/events/poll/`
    - Set SSE `enabled: true` by default (Django supports persistent connections, no Vercel 10s timeout)
    - Update polling fallback to use `apiClient.request()` instead of raw `fetch()` for CSRF handling and cookie credentials
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

- [ ] 8. Checkpoint — Auth context and SSE complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify auth context references only Django REST paths
  - Verify SSE endpoints point to `/api/v1/events/stream/` and `/api/v1/events/poll/`

- [ ] 9. Raw Fetch and Storage Migration
  - [~] 9.1 Migrate `src/lib/storage.ts` — replace all 6 raw `fetch()` calls
    - `uploadApplicationFile` / `uploadFile` → `apiClient.request('/documents/upload/', ...)` POST with FormData
    - `deleteFile` → `apiClient.request('/documents/{path}/', ...)` DELETE
    - `getFileUrl` → `apiClient.request('/documents/{path}/signed-url/')` GET
    - `downloadFile` → `apiClient.request('/documents/{path}/download/')` GET
    - `listFiles` → `apiClient.request('/documents/')` GET
    - `getFileInfo` → `apiClient.request('/documents/{path}/info/')` GET
    - _Requirements: 13.1_

  - [~] 9.2 Migrate `src/lib/api/adminApi.ts` — replace all 16 legacy admin API calls
    - Replace `adminFetch()` wrapper with `apiClient.request()` calls using Django REST paths
    - Settings: GET/POST/PUT/DELETE `/admin/settings/`, `/admin/settings/{id}/`, `/admin/settings/import/`, `/admin/settings/reset/`
    - Eligibility rules: GET/POST/PUT/DELETE `/admin/eligibility-rules/`, `/admin/eligibility-rules/{id}/`
    - Users/roles: GET `/admin/users/`, PUT `/admin/users/{id}/`
    - Notifications: GET `/notifications/`, PUT `/notifications/{id}/read/`, PUT `/notifications/read-all/`, DELETE `/notifications/{id}/`
    - Remove `adminFetch()`, `parseJsonResponse()`, and `HtmlResponseError` if no longer needed
    - _Requirements: 7.7, 13.2_

  - [~] 9.3 Migrate `src/lib/connectionFix.ts`
    - `testConnection` → `fetch(API_BASE + '/api/v1/health/live/')` (or `apiClient.request('/health/live/')`)
    - `syncGradesWithRecovery` → PUT `/applications/{id}/grades/` instead of PATCH with `action: 'sync_grades'`
    - _Requirements: 13.4_

  - [~] 9.4 Scan for and replace any remaining raw `fetch('/api/...')` calls
    - Search all files under `src/` for raw `fetch` calls to legacy API paths
    - Replace each with `apiClient.request()` using the correct Django REST path
    - _Requirements: 13.3, 13.5_

- [ ] 10. Checkpoint — Raw fetch migration complete
  - Ensure all tests pass, ask the user if questions arise.
  - Run `grep -r "action=" apps/admissions/src/` and verify zero matches for legacy query-parameter actions
  - Run `grep -r "normalizeEndpoint" apps/admissions/src/` and verify zero matches

- [ ] 11. Backend Notification Endpoints (Backend Gap)
  - [~] 11.1 Add missing notification endpoints to Django backend
    - Verify whether `PUT /api/v1/notifications/{id}/read/` (mark single notification as read) exists in `backend/apps/common/` — if missing, add the view + URL route
    - Verify whether `PUT /api/v1/notifications/read-all/` (mark all notifications as read) exists — if missing, add the view + URL route
    - Verify whether `DELETE /api/v1/notifications/{id}/` (delete a notification) exists — if missing, add the view + URL route
    - Ensure all new endpoints return the standard `{success: true, data: ...}` envelope
    - Add URL patterns in `backend/apps/common/urls.py` (or the appropriate notifications URL config)
    - _Requirements: 6.1, 6.2, 6.3_

  - [~]* 11.2 Write backend tests for new notification endpoints
    - Test mark-read, mark-all-read, and delete endpoints with valid and invalid notification IDs
    - Test authentication and authorization (only notification owner can modify)
    - Test response envelope format
    - _Requirements: 6.1, 6.2, 6.3_

- [ ] 12. Checkpoint — Backend notification endpoints complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify notification endpoints respond correctly via the Django test suite

- [ ] 13. Backend-Only Dependency Removal
  - [~] 13.1 Verify no source files import removed packages, then remove from `package.json`
    - Scan all files under `apps/admissions/src/` for imports from: `@arcjet/decorate`, `@arcjet/node`, `@neondatabase/serverless`, `bcryptjs`, `cors`, `express`, `jose`, `node-fetch`, `pg`, `resend`, `web-push`, `@aws-sdk/client-sqs`, `@vercel/node`
    - Remove any remaining import references found
    - Remove production deps: `@arcjet/decorate`, `@arcjet/node`, `@neondatabase/serverless`, `bcryptjs`, `cors`, `express`, `jose`, `node-fetch`, `pg`, `resend`, `web-push`, `@aws-sdk/client-sqs`
    - Remove type deps: `@types/bcryptjs`, `@types/pg`, `@types/web-push`
    - Remove dev dep: `@vercel/node`
    - _Requirements: 14.1, 14.2, 14.3, 14.5, 14.6_

  - [~] 13.2 Remove legacy scripts from `package.json`
    - Remove `dev:api` and `dev:full` scripts since `local-server.js` does not exist
    - _Requirements: 14.4_

  - [~] 13.3 Regenerate lockfile
    - Run `bun install` from `apps/admissions/` to regenerate the lockfile without removed packages
    - _Requirements: 14.7_

  - [~]* 13.4 Write property test for no imports from removed packages (Property 14)
    - **Property 14: No imports from removed backend packages** — scan all `.ts`/`.tsx` source files under `apps/admissions/src/`, assert no import statement references any removed package
    - **Validates: Requirement 14.6**
    - Test file: `tests/property/dependencies.property.test.ts`

- [ ] 14. Checkpoint — Dependency removal complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify removed packages are absent from `package.json` and lockfile

- [ ] 15. Neon Database Schema Verification
  - [~] 15.1 Verify all 26 tables exist and match Django model definitions
    - Run `backend/scripts/verify_migration.py` or write a verification query to confirm all 26 tables exist: `profiles`, `applications`, `application_documents`, `application_grades`, `application_status_history`, `application_drafts`, `application_interviews`, `programs`, `intakes`, `program_intakes`, `course_requirements`, `subjects`, `institutions`, `payments`, `notifications`, `user_notification_preferences`, `email_queue`, `device_sessions`, `csrf_tokens`, `password_reset_tokens`, `login_attempts`, `audit_logs`, `idempotency_keys`, `settings`, `user_permission_overrides`, `migration_history`
    - Verify foreign key relationships match Django model `ForeignKey` and `ManyToManyField` definitions
    - Verify indexes exist for commonly filtered columns: `applications.user_id`, `applications.status`, `applications.program`, `applications.institution`, `audit_logs.entity_type`, `audit_logs.actor_id`, `device_sessions.user_id`, `notifications.user_id`
    - If discrepancies found, produce a report listing expected vs actual schema
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

- [ ] 16. Checkpoint — Database verification complete
  - Ensure verification results are reviewed, ask the user if questions arise.

- [ ] 17. Steering Files Update
  - [~] 17.1 Update `.kiro/steering/tech.md`
    - Remove all references to Vercel Functions, legacy `/api/...` query-parameter routing, and `normalizeEndpoint()` translation layer
    - Document that the frontend API client sends requests directly to `/api/v1/` paths on `api.mihas.edu.zm`
    - _Requirements: 16.1, 16.2_

  - [~] 17.2 Update `.kiro/steering/structure.md`
    - Remove references to `local-server.js`, `dev:api` script, and legacy API handler modules
    - Document that `apps/admissions/src/services/client.ts` sends requests directly to Django REST paths without a translation layer
    - _Requirements: 16.3, 16.4_

  - [~] 17.3 Update `.kiro/steering/product.md`
    - Remove the "Migration Reality" section describing the frontend/backend contract mismatch
    - Replace with a statement that the frontend consumes the Django `/api/v1/` contract directly
    - _Requirements: 16.5_

  - [~] 17.4 Update all three steering files to reflect monorepo structure
    - Ensure `backend/` for Django API, `apps/admissions/` for React frontend, `shared/` for cross-app code are consistently documented
    - _Requirements: 16.6_

- [ ] 18. Checkpoint — Steering files complete
  - Ensure steering files are accurate, ask the user if questions arise.

- [ ] 19. Frontend Build Verification and Final Tests
  - [~] 19.1 Fix or update existing tests that reference legacy modules
    - Update tests that import from deleted legacy API handler modules to import from migrated modules
    - Update test assertions from legacy query-parameter URL patterns to Django REST URL patterns
    - Remove tests that are no longer relevant after migration
    - _Requirements: 17.4, 17.5_

  - [~] 19.2 Run full build and type-check verification
    - Run `tsc --noEmit` from `apps/admissions/` — fix any type errors
    - Run `bun run build` from `apps/admissions/` — fix any build errors
    - Run `bun run lint` from `apps/admissions/` — fix any new ESLint errors
    - _Requirements: 17.1, 17.2, 17.6_

  - [~] 19.3 Run full test suite
    - Run `bun run test` from `apps/admissions/` — ensure all tests pass
    - _Requirements: 17.3_

  - [~] 19.4 Run migration verification checks
    - `grep -r "action=" apps/admissions/src/` returns zero matches (no legacy query-parameter actions)
    - `grep -r "normalizeEndpoint" apps/admissions/src/` returns zero matches
    - `grep -r "supportedResources" apps/admissions/src/` returns zero matches
    - All 15 service files use only `/api/v1/`-prefixable paths
    - _Requirements: 1.2, 2.8, 3.20, 4.5, 5.3, 6.3, 8.4_

- [ ] 20. Final Checkpoint — All migration complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify the full build pipeline is green: build, type-check, lint, test
  - Confirm zero legacy endpoint references remain in the codebase

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at each migration tier
- Property tests validate universal correctness properties from the design document (14 properties total)
- The strict ordering (client → services → hooks → auth/SSE → raw fetch → backend → deps → DB → steering → build) prevents broken intermediate states
- All frontend file paths are relative to `apps/admissions/`
- Backend file paths (task 11) are relative to `backend/`
