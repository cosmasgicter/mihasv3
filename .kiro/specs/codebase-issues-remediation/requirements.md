# Requirements Document

## Introduction

A comprehensive codebase analysis identified 35+ issues across the frontend (admissions and jobs-ops apps), backend (Django API), and database layers. This spec addresses all findings organized by severity: critical production blockers first, then consistency gaps, performance improvements, and housekeeping. The jobs-ops app has the largest gap — it lacks error handling, auth refresh, testing, and accessibility. The backend has known audit items (envelope consistency, rate limiting, debug auth bypass). The database layer has hybrid migration risks and potential N+1 queries.

## Glossary

- **Jobs-Ops App**: The AI job operations dashboard at `apps/jobs-ops/`, a React 18 + TypeScript + Vite SPA.
- **Admissions App**: The student admissions SPA at `apps/admissions/`.
- **API Envelope**: The standard `{"success": true, "data": ...}` response format used by all authenticated endpoints.
- **Auth Refresh Interceptor**: Client-side logic that catches 401 responses, refreshes the access token via `POST /api/v1/auth/refresh/`, and retries the original request.
- **Error Boundary**: A React component that catches JavaScript errors in its child component tree and renders a fallback UI.
- **N+1 Query**: A database access pattern where a list query triggers one additional query per item, causing O(N) queries instead of O(1).
- **Stale SQL Scripts**: Raw SQL files in `backend/scripts/` that have been fully applied to production and are no longer needed for execution.
- **IsAuthenticatedOrDebug**: A DRF permission class that bypasses authentication when `DEBUG=True`.

## Requirements

### PHASE 1: Jobs-Ops Critical Production Blockers

### Requirement 1: Jobs-Ops Error Boundaries

**User Story:** As a jobs-ops operator, I want the app to gracefully handle JavaScript errors instead of showing a white screen, so that I can continue working even when a component fails.

#### Acceptance Criteria

1. WHEN an unhandled JavaScript error occurs in any jobs-ops route component, THE app SHALL render a fallback error UI with a retry action instead of a blank screen.
2. THE jobs-ops app SHALL have an `ErrorBoundary` component at the app shell level wrapping the router outlet.
3. THE jobs-ops app SHALL have an `ErrorDisplay` component for inline error rendering with retry, go-back, and descriptive message support.
4. WHEN the `ErrorBoundary` catches an error, THE app SHALL log the error to the console and to GlitchTip if configured.

### Requirement 2: Jobs-Ops 401 Auth Refresh Interceptor

**User Story:** As a jobs-ops operator, I want expired access tokens to be refreshed automatically, so that I don't get logged out in the middle of my work.

#### Acceptance Criteria

1. WHEN the jobs-ops API client receives a 401 response, THE client SHALL attempt to refresh the access token via `POST /api/v1/auth/refresh/` before retrying the original request.
2. WHEN multiple concurrent requests receive 401, THE client SHALL deduplicate refresh attempts so only one refresh request is in-flight at a time.
3. IF the refresh request itself fails, THEN THE client SHALL clear auth state and redirect to the sign-in page.
4. THE jobs-ops API client SHALL include CSRF token handling consistent with the admissions app pattern (in-memory store, recovery via `?refresh_csrf=1`).

### Requirement 3: Jobs-Ops Session Re-validation

**User Story:** As a jobs-ops operator, I want my session to be re-validated when I return to the tab after being away, so that I see current data and don't operate on a stale session.

#### Acceptance Criteria

1. WHEN the browser tab regains visibility after being hidden, THE jobs-ops app SHALL re-validate the session via `GET /api/v1/auth/session/`.
2. IF the session is no longer valid, THEN THE app SHALL redirect to the sign-in page.
3. THE re-validation SHALL NOT fire more frequently than once per 30 seconds to avoid unnecessary requests.

### Requirement 4: Jobs-Ops Basic Test Coverage

**User Story:** As a developer, I want critical jobs-ops paths covered by tests, so that regressions are caught before deployment.

#### Acceptance Criteria

1. THE jobs-ops app SHALL have unit tests for the API client (401 refresh, CSRF handling, envelope unwrapping).
2. THE jobs-ops app SHALL have unit tests for the auth context (session bootstrap, logout cascade).
3. THE jobs-ops app SHALL have unit tests for the router configuration (all routes resolve, protected routes redirect).
4. THE jobs-ops app SHALL have a working `bun run test` command configured with Vitest.

### Requirement 5: Jobs-Ops Accessibility Baseline

**User Story:** As a jobs-ops operator using assistive technology, I want the dashboard to be navigable with a keyboard and screen reader, so that I can perform my work without a mouse.

#### Acceptance Criteria

1. THE jobs-ops shell layout SHALL have proper ARIA landmarks (`main`, `navigation`, `complementary`).
2. ALL interactive elements in the jobs-ops sidebar and header SHALL be keyboard-focusable with visible focus indicators.
3. THE command palette (Cmd+K) SHALL trap focus while open and return focus to the trigger element on close.
4. ALL jobs-ops icon-only buttons SHALL have accessible labels via `aria-label` or visually hidden text.

### PHASE 2: Backend Audit Remediation

### Requirement 6: API Envelope Consistency

**User Story:** As a frontend developer, I want all authenticated API endpoints to return the standard envelope format, so that I can use a single response parser.

#### Acceptance Criteria

1. `SessionView.get()` SHALL return `{"success": true, "data": ...}` for both authenticated and unauthenticated users.
2. ALL catalog views (`ProgramListView`, `IntakeListView`, `SubjectListView`, `InstitutionListView`) SHALL return the standard envelope format.
3. ALL analytics views SHALL return the standard envelope format.
4. ALL integrations views SHALL return the standard envelope format.
5. WHEN a view returns a list, THE response SHALL use the paginated envelope `{"success": true, "data": {"results": [...], "page": N, "pageSize": N, "totalCount": N}}` for paginated endpoints or `{"success": true, "data": [...]}` for unpaginated lists.

### Requirement 7: Payment Endpoint Rate Limiting

**User Story:** As a platform operator, I want payment endpoints rate-limited per user, so that abuse and accidental rapid-fire requests are prevented.

#### Acceptance Criteria

1. `PaymentInitiateView` SHALL be rate-limited to 5 requests per minute per authenticated user.
2. `PaymentVerifyView` SHALL be rate-limited to 10 requests per minute per authenticated user.
3. `MobileMoneyInitiateView` SHALL be rate-limited to 5 requests per minute per authenticated user.
4. WHEN a rate limit is exceeded, THE endpoint SHALL return HTTP 429 with a descriptive error message and `Retry-After` header.

### Requirement 8: Remove IsAuthenticatedOrDebug Permission Class

**User Story:** As a security engineer, I want the debug auth bypass removed, so that no endpoint is accidentally unprotected in development.

#### Acceptance Criteria

1. THE `IsAuthenticatedOrDebug` permission class SHALL be removed from the codebase.
2. ALL views that currently use `IsAuthenticatedOrDebug` SHALL be updated to use `IsAuthenticated` or an appropriate permission class.
3. THE change SHALL NOT break any existing tests.

### Requirement 9: Fix Idempotency Task Name

**User Story:** As a developer, I want the Celery Beat task name for idempotency cleanup to use the correct dotted module path, so that the task is discoverable and consistent with other tasks.

#### Acceptance Criteria

1. THE `cleanup-idempotency-keys` entry in `CELERY_BEAT_SCHEDULE` SHALL use the full dotted path `apps.common.tasks.cleanup_idempotency_keys` instead of a bare task name.
2. THE task SHALL continue to execute on its existing schedule (daily at 03:00 UTC).

### Requirement 10: AuditMiddleware Entity ID Population

**User Story:** As an auditor, I want audit log entries to include the entity ID from URL path segments, so that I can trace actions to specific resources.

#### Acceptance Criteria

1. THE `AuditMiddleware` SHALL extract entity IDs from URL path segments matching `/api/v1/{resource}/{id}/` patterns.
2. THE extracted entity ID SHALL be stored in the `entity_id` field of the `AuditLog` record.
3. IF no entity ID is present in the URL, THE `entity_id` field SHALL remain null.

### Requirement 11: ReadOnlyMiddleware Optimization

**User Story:** As a developer, I want the ReadOnlyMiddleware to not query the database on every write request when the env var is not set, so that unnecessary DB overhead is eliminated.

#### Acceptance Criteria

1. WHEN the `READ_ONLY_MODE` environment variable is not set or is empty, THE `ReadOnlyMiddleware` SHALL skip all checks and pass the request through without any database query.
2. WHEN `READ_ONLY_MODE` is set to a truthy value, THE middleware SHALL block write requests as before.

### PHASE 3: Database Hygiene

### Requirement 12: Archive Stale SQL Scripts

**User Story:** As a developer, I want stale SQL scripts moved to an archive directory, so that the active scripts directory only contains relevant files.

#### Acceptance Criteria

1. THE 7 fully-applied SQL scripts identified in the audit SHALL be moved to `backend/scripts/archive/`.
2. A `README.md` in `backend/scripts/archive/` SHALL document that these scripts have been applied and are kept for historical reference only.
3. THE `idempotency_redesign.sql` script SHALL have a re-run guard added (check if table exists before DROP).

### Requirement 13: N+1 Query Audit for List Endpoints

**User Story:** As a developer, I want list endpoints optimized with `select_related`/`prefetch_related`, so that page load times are predictable under load.

#### Acceptance Criteria

1. `ApplicationListView` SHALL use `select_related` for foreign key fields (program, intake, user) and `prefetch_related` for many-to-many or reverse relations (documents, conditions).
2. `JobApplicationListView` SHALL use `select_related` for foreign key fields (job, user).
3. `InterviewListView` SHALL use `select_related` for foreign key fields (application, application__user).
4. `DocumentListView` SHALL use `select_related` for foreign key fields (application, uploaded_by).
5. ALL list endpoints that return related model data SHALL include appropriate `select_related`/`prefetch_related` calls in their querysets.

### PHASE 4: Jobs-Ops Frontend Hardening

### Requirement 14: Jobs-Ops Loading States

**User Story:** As a jobs-ops operator, I want consistent loading indicators across all data views, so that I know when data is being fetched.

#### Acceptance Criteria

1. ALL jobs-ops feature pages that fetch data SHALL show a skeleton or spinner during initial load.
2. THE loading state SHALL be consistent across all feature pages (same component, same animation).
3. WHEN a query errors, THE page SHALL show the `ErrorDisplay` component (from Requirement 1) with a retry action.

### Requirement 15: Jobs-Ops Dirty State Protection

**User Story:** As a jobs-ops operator, I want to be warned before navigating away from unsaved form changes, so that I don't lose my work.

#### Acceptance Criteria

1. WHEN a jobs-ops form has unsaved changes and the user attempts to navigate away, THE app SHALL show a confirmation dialog.
2. THE app SHALL register a `beforeunload` handler when forms have dirty state.
3. THE confirmation dialog SHALL offer "Stay" and "Leave" options.

### Requirement 16: Jobs-Ops Chunk Auto-Reload

**User Story:** As a jobs-ops operator, I want the app to handle stale JavaScript chunks after a deployment, so that I don't see broken pages.

#### Acceptance Criteria

1. WHEN a dynamic import fails due to a stale chunk, THE app SHALL attempt to reload the page once.
2. THE reload SHALL be controlled to prevent infinite reload loops (max 1 reload per session).

### PHASE 5: Admissions Frontend Improvements

### Requirement 17: Split Admissions API Client

**User Story:** As a developer, I want the 905-line API client split into focused modules, so that the code is easier to navigate and maintain.

#### Acceptance Criteria

1. THE `apps/admissions/src/services/client.ts` file SHALL be split into: `httpClient.ts` (core fetch wrapper), `authInterceptor.ts` (401/403 handling), `csrfManager.ts` (CSRF token lifecycle), and `client.ts` (re-exports for backward compatibility).
2. ALL existing imports from `services/client` SHALL continue to work without changes.
3. THE split SHALL NOT change any runtime behavior.

### Requirement 18: Comprehensive Error Boundaries

**User Story:** As a student, I want each major section of the admissions app to handle errors independently, so that a failure in one section doesn't break the entire page.

#### Acceptance Criteria

1. EACH feature section in the admissions app (wizard steps, dashboard cards, admin panels) SHALL be wrapped in an error boundary.
2. THE error boundary SHALL render the existing `ErrorDisplay` component with a section-level retry action.
3. THE error boundary SHALL report caught errors to GlitchTip.

