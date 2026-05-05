# Implementation Plan: Codebase Issues Remediation

## Overview

Address all 35+ issues identified across frontend (admissions + jobs-ops), backend (Django API), and database layers. Work is organized in 5 phases by priority: jobs-ops production blockers → backend audit remediation → database hygiene → jobs-ops hardening → admissions improvements. Each phase has a checkpoint to verify changes before proceeding.

## Tasks

### PHASE 1: Jobs-Ops Critical Production Blockers

- [ ] 1. Jobs-Ops Error Handling Components
  - [x] 1.1 Create `ErrorDisplay` component at `apps/jobs-ops/src/components/ui/ErrorDisplay.tsx`
    - Props: `message`, `variant` (page/section/inline), `onRetry`, `onGoBack`, `showSupport`
    - Return `null` for empty/whitespace-only messages
    - Use `role="alert"` only when message is non-empty
    - Retry button calls `onRetry` or reloads the page
    - Style with Tailwind, consistent with jobs-ops dark theme
    - _Requirements: 1.3_
    - _Design: Section 1_

  - [x] 1.2 Create `ErrorBoundary` component at `apps/jobs-ops/src/components/ui/ErrorBoundary.tsx`
    - Class component with `componentDidCatch` error catching
    - Props: `children`, `fallback`, `level` (page/section), `onError`
    - Default fallback renders `ErrorDisplay` with retry action
    - Log errors to console; forward to GlitchTip via `onError` callback if provided
    - _Requirements: 1.1, 1.2, 1.4_
    - _Design: Section 1_

  - [x] 1.3 Wrap router outlet in `JobsOpsShell.tsx` with `ErrorBoundary`
    - Import `ErrorBoundary` and wrap `<Outlet />` with `<ErrorBoundary level="page">`
    - _Requirements: 1.2_

- [ ] 2. Jobs-Ops Auth Refresh Interceptor
  - [x] 2.1 Add CSRF token management to jobs-ops API client
    - Create in-memory CSRF store: `getCsrfToken()`, `setCsrfToken()`, `clearCsrfToken()`
    - Capture CSRF token from `X-CSRF-Token` response header on every API response
    - Include CSRF token in `X-CSRF-Token` request header for state-changing requests
    - File: `apps/jobs-ops/src/services/api/client.ts`
    - _Requirements: 2.4_
    - _Design: Section 2_

  - [x] 2.2 Implement 401 intercept-refresh-retry in jobs-ops API client
    - Add `refreshAccessToken()` with promise deduplication
    - On 401: attempt refresh via `POST /api/v1/auth/refresh/` with CSRF token
    - On successful refresh: capture new CSRF token, retry original request
    - On failed refresh: clear auth state, redirect to sign-in
    - Concurrent 401s share a single refresh promise
    - File: `apps/jobs-ops/src/services/api/client.ts`
    - _Requirements: 2.1, 2.2, 2.3_
    - _Design: Section 2_

  - [x] 2.3 Implement 403 CSRF recovery in jobs-ops API client
    - On 403 with CSRF error: fetch `GET /api/v1/auth/session/?refresh_csrf=1`
    - Capture fresh CSRF token from response header
    - Retry original request with new CSRF token
    - Max 1 CSRF recovery attempt per request to prevent loops
    - File: `apps/jobs-ops/src/services/api/client.ts`
    - _Requirements: 2.4_
    - _Design: Section 2_

- [ ] 3. Jobs-Ops Session Re-validation
  - [x] 3.1 Create `useVisibilityRevalidation` hook
    - File: `apps/jobs-ops/src/hooks/useVisibilityRevalidation.ts`
    - Listen for `visibilitychange` events
    - On tab visible: check session via `GET /api/v1/auth/session/` (throttled to 30s)
    - On invalid session: call `onInvalid` callback
    - On network error: do nothing (user may be offline)
    - _Requirements: 3.1, 3.2, 3.3_
    - _Design: Section 3_

  - [x] 3.2 Integrate visibility re-validation in AuthContext
    - Call `useVisibilityRevalidation` in the auth provider
    - Pass logout/redirect function as `onInvalid`
    - File: `apps/jobs-ops/src/auth/AuthContext.tsx`
    - _Requirements: 3.2_

- [ ] 4. Jobs-Ops Accessibility Baseline
  - [x] 4.1 Add ARIA landmarks to `JobsOpsShell.tsx`
    - Sidebar: `<nav aria-label="Main navigation">`
    - Main content: `<main id="main-content" role="main">`
    - Right panel: `<aside aria-label="Platform info">`
    - _Requirements: 5.1_
    - _Design: Section 5_

  - [x] 4.2 Add keyboard navigation and focus indicators to Sidebar
    - All nav items focusable via Tab
    - Active item: `aria-current="page"`
    - Collapse toggle: `aria-expanded`, `aria-label`
    - Visible focus ring on all interactive elements (Tailwind `focus-visible:ring-2`)
    - _Requirements: 5.2_

  - [x] 4.3 Add focus trap and accessibility to CommandPalette
    - `role="dialog"`, `aria-modal="true"`, `aria-label="Command palette"`
    - On open: focus moves to search input
    - Tab cycles within palette (search → results → close)
    - Escape closes and returns focus to trigger button
    - _Requirements: 5.3_

  - [x] 4.4 Add accessible labels to all icon-only buttons
    - Audit all icon-only buttons in sidebar, header, and feature pages
    - Add `aria-label` describing the action (e.g., "Toggle sidebar", "Open command palette")
    - Quick stats in sidebar get descriptive `aria-label`
    - _Requirements: 5.4_

- [ ] 5. Jobs-Ops Test Setup and Critical Path Tests
  - [x] 5.1 Configure Vitest for jobs-ops
    - Add dev dependencies: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `msw`, `jsdom`
    - Create `apps/jobs-ops/vitest.config.ts` with jsdom environment
    - Add `"test": "vitest run"` script to `apps/jobs-ops/package.json`
    - Create `apps/jobs-ops/tests/setup.ts` with testing-library matchers
    - _Requirements: 4.4_
    - _Design: Section 4_

  - [x] 5.2 Write API client unit tests
    - File: `apps/jobs-ops/tests/unit/apiClient.test.ts`
    - Test 401 triggers refresh and retries original request
    - Test concurrent 401s deduplicate refresh calls
    - Test failed refresh clears auth and redirects
    - Test CSRF token captured from response headers
    - Test 403 CSRF error triggers recovery flow
    - Test envelope unwrapping extracts `data` field
    - Use MSW for API mocking
    - _Requirements: 4.1_

  - [x] 5.3 Write auth context unit tests
    - File: `apps/jobs-ops/tests/unit/authContext.test.ts`
    - Test session bootstrap calls `GET /api/v1/auth/session/?refresh_csrf=1`
    - Test logout clears React Query cache and CSRF token
    - Test auth failure callback redirects to sign-in
    - _Requirements: 4.2_

  - [x] 5.4 Write router configuration tests
    - File: `apps/jobs-ops/tests/unit/router.test.ts`
    - Test all defined routes resolve to components
    - Test protected routes redirect unauthenticated users
    - _Requirements: 4.3_

- [ ] 6. Checkpoint — Verify Phase 1
  - Run `bun run type-check` and `bun run lint` in `apps/jobs-ops/`
  - Run `bun run test` in `apps/jobs-ops/` (new Vitest suite)
  - Run `vite build` in `apps/jobs-ops/` to verify no build errors
  - Verify error boundary renders fallback on simulated error
  - _Requirements: 1.1–5.4_

### PHASE 2: Backend Audit Remediation

- [ ] 7. API Envelope Consistency
  - [x] 7.1 Fix `SessionView.get()` for unauthenticated users
    - Wrap unauthenticated response in `{"success": true, "data": {"authenticated": false}}`
    - File: `backend/apps/accounts/session_views.py`
    - _Requirements: 6.1_
    - _Design: Section 6_

  - [x] 7.2 Fix catalog views to use envelope format
    - Ensure `ProgramListView`, `IntakeListView`, `SubjectListView`, `InstitutionListView` use the standard renderer
    - Remove any `renderer_classes` overrides that bypass the envelope renderer
    - File: `backend/apps/catalog/views.py`
    - _Requirements: 6.2_

  - [x] 7.3 Fix analytics views to use envelope format
    - Ensure all analytics endpoints return `{"success": true, "data": ...}`
    - File: `backend/apps/analytics/views.py`
    - _Requirements: 6.3_

  - [x] 7.4 Fix integrations views to use envelope format
    - Ensure all integrations endpoints return `{"success": true, "data": ...}`
    - File: `backend/apps/integrations/views.py`
    - _Requirements: 6.4_

  - [x] 7.5 Write tests for envelope consistency
    - Test SessionView unauthenticated response shape
    - Test catalog list endpoint response shape
    - Test analytics endpoint response shape
    - Test integrations endpoint response shape
    - File: `backend/tests/unit/test_envelope_consistency.py`
    - _Requirements: 6.1–6.5_

- [ ] 8. Payment Endpoint Rate Limiting
  - [x] 8.1 Create payment throttle classes
    - `PaymentInitiateThrottle` (5/min), `PaymentVerifyThrottle` (10/min), `MobileMoneyThrottle` (5/min)
    - Add throttle rates to `REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']` in settings
    - File: `backend/apps/documents/throttles.py`, `backend/config/settings/base.py`
    - _Requirements: 7.1, 7.2, 7.3_
    - _Design: Section 7_

  - [x] 8.2 Apply throttle classes to payment views
    - Add `throttle_classes` to `PaymentInitiateView`, `PaymentVerifyView`, `MobileMoneyInitiateView`
    - File: `backend/apps/documents/views.py`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 8.3 Write rate limiting tests
    - Test 429 response after exceeding limit
    - Test `Retry-After` header present in 429 response
    - Test different limits for different endpoints
    - File: `backend/tests/unit/test_payment_rate_limiting.py`
    - _Requirements: 7.4_

- [ ] 9. Security Fixes
  - [x] 9.1 Remove `IsAuthenticatedOrDebug` permission class
    - Search all usages and replace with `IsAuthenticated`
    - Delete the class from `backend/apps/common/permissions.py`
    - Run tests to verify no breakage
    - _Requirements: 8.1, 8.2, 8.3_
    - _Design: Section 8_

  - [x] 9.2 Fix idempotency task name in Celery Beat schedule
    - Change bare task name to `apps.common.tasks.cleanup_idempotency_keys`
    - File: `backend/config/settings/base.py`
    - _Requirements: 9.1, 9.2_
    - _Design: Section 9_

  - [x] 9.3 Add entity ID extraction to AuditMiddleware
    - Add regex pattern to extract entity IDs from `/api/v1/{resource}/{id}/` paths
    - Populate `entity_id` field in AuditLog records
    - File: `backend/apps/common/middleware.py`
    - _Requirements: 10.1, 10.2, 10.3_
    - _Design: Section 10_

  - [x] 9.4 Optimize ReadOnlyMiddleware
    - Cache `READ_ONLY_MODE` env var check at `__init__` time
    - Skip all checks when env var is not set (no DB query)
    - File: `backend/apps/common/middleware.py`
    - _Requirements: 11.1, 11.2_
    - _Design: Section 11_

  - [x] 9.5 Write tests for security fixes
    - Test `IsAuthenticated` replaces debug bypass
    - Test AuditMiddleware extracts entity ID from various URL patterns
    - Test ReadOnlyMiddleware fast path when env var unset
    - Test idempotency task is discoverable by Celery
    - File: `backend/tests/unit/test_security_fixes.py`
    - _Requirements: 8.3, 9.2, 10.2, 11.1_

- [ ] 10. Checkpoint — Verify Phase 2
  - Run `python -m pytest tests/unit/ -x -q --tb=short` from `backend/`
  - Run `python manage.py check`
  - Regenerate OpenAPI schema: `python manage.py spectacular --file /tmp/schema.yaml`
  - _Requirements: 6.1–11.2_

### PHASE 3: Database Hygiene

- [ ] 11. Archive Stale SQL Scripts
  - [x] 11.1 Move stale scripts to archive directory
    - Create `backend/scripts/archive/` directory
    - Move the 7 fully-applied SQL scripts to archive
    - Create `backend/scripts/archive/README.md` documenting these are historical
    - _Requirements: 12.1, 12.2_
    - _Design: Section 12_

  - [x] 11.2 Add re-run guard to `idempotency_redesign.sql`
    - Add `DO $$ BEGIN IF EXISTS ... END $$;` guard before DROP TABLE
    - _Requirements: 12.3_

- [ ] 12. N+1 Query Optimization
  - [x] 12.1 Add `select_related`/`prefetch_related` to application list views
    - `ApplicationListView`: `select_related('program', 'intake', 'user', 'user__profile')`
    - `prefetch_related('documents', 'conditions', 'amendments')`
    - File: `backend/apps/applications/admin_views.py`
    - _Requirements: 13.1_
    - _Design: Section 13_

  - [x] 12.2 Add `select_related` to student and interview views
    - Student views: `select_related('program', 'intake')`
    - Interview views: `select_related('application', 'application__user', 'application__program')`
    - Files: `backend/apps/applications/student_views.py`, `backend/apps/applications/interview_views.py`
    - _Requirements: 13.3_

  - [x] 12.3 Add `select_related` to document and job application views
    - Document views: `select_related('application', 'uploaded_by')`
    - Job application views: `select_related('job', 'user')`
    - Files: `backend/apps/applications/document_views.py`, `backend/apps/jobs/views.py`
    - _Requirements: 13.2, 13.4_

  - [x] 12.4 Write query count tests for list endpoints
    - Use `assertNumQueries` to verify O(1) query count for list views
    - Test with 5+ records to catch N+1 patterns
    - File: `backend/tests/unit/test_query_optimization.py`
    - _Requirements: 13.5_

- [ ] 13. Checkpoint — Verify Phase 3
  - Run `python -m pytest tests/unit/ -x -q --tb=short` from `backend/`
  - Verify stale scripts are in archive directory
  - _Requirements: 12.1–13.5_

### PHASE 4: Jobs-Ops Frontend Hardening

- [ ] 14. Jobs-Ops Loading States
  - [x] 14.1 Create `PageSkeleton` component
    - File: `apps/jobs-ops/src/components/ui/PageSkeleton.tsx`
    - Animated pulse skeleton matching jobs-ops dark theme
    - Configurable: header, cards, table variants
    - _Requirements: 14.1, 14.2_
    - _Design: Section 14_

  - [x] 14.2 Apply loading states to all feature pages
    - Each feature page: show `PageSkeleton` when `isLoading`, `ErrorDisplay` when `isError`
    - Apply to: overview, jobs, job-applications, automation, outreach, email, documents, integrations, sources, analytics, review, audit
    - _Requirements: 14.1, 14.2, 14.3_

- [ ] 15. Jobs-Ops Dirty State Protection
  - [x] 15.1 Create `useUnsavedChanges` hook
    - File: `apps/jobs-ops/src/hooks/useUnsavedChanges.ts`
    - Register `beforeunload` handler when `isDirty` is true
    - Use React Router `useBlocker` for in-app navigation blocking
    - Render confirmation dialog with "Stay" and "Leave" options
    - _Requirements: 15.1, 15.2, 15.3_
    - _Design: Section 14_

- [ ] 16. Jobs-Ops Chunk Auto-Reload
  - [x] 16.1 Add stale chunk error handler to `main.tsx`
    - Listen for dynamic import errors
    - Reload page once per session (use `sessionStorage` flag)
    - Prevent infinite reload loops
    - File: `apps/jobs-ops/src/main.tsx`
    - _Requirements: 16.1, 16.2_
    - _Design: Section 14_

- [ ] 17. Checkpoint — Verify Phase 4
  - Run `bun run type-check` and `bun run lint` in `apps/jobs-ops/`
  - Run `bun run test` in `apps/jobs-ops/`
  - Run `vite build` in `apps/jobs-ops/`
  - _Requirements: 14.1–16.2_

### PHASE 5: Admissions Frontend Improvements

- [ ] 18. Split Admissions API Client
  - [x] 18.1 Extract HTTP client core to `httpClient.ts`
    - Core fetch wrapper with timeout, retry, base URL configuration
    - File: `apps/admissions/src/services/httpClient.ts`
    - _Requirements: 17.1_
    - _Design: Section 17_

  - [x] 18.2 Extract auth interceptor to `authInterceptor.ts`
    - 401 refresh logic, 403 CSRF recovery, promise deduplication
    - File: `apps/admissions/src/services/authInterceptor.ts`
    - _Requirements: 17.1_

  - [x] 18.3 Extract CSRF manager to `csrfManager.ts`
    - In-memory CSRF token store, capture from headers, recovery flow
    - File: `apps/admissions/src/services/csrfManager.ts`
    - _Requirements: 17.1_

  - [x] 18.4 Reduce `client.ts` to re-exports
    - Import and re-export from the three new modules
    - All existing imports from `services/client` continue to work
    - File: `apps/admissions/src/services/client.ts`
    - _Requirements: 17.2, 17.3_

  - [x] 18.5 Verify no runtime behavior change
    - Run `bun run test` in `apps/admissions/`
    - Run `bun run build` in `apps/admissions/`
    - Run `bun run lint` in `apps/admissions/`
    - _Requirements: 17.3_

- [ ] 19. Admissions Feature-Level Error Boundaries
  - [x] 19.1 Wrap wizard steps in error boundaries
    - Each step component in `applicationWizard/steps/` wrapped in `<ErrorBoundary level="section">`
    - Error reports forwarded to GlitchTip
    - _Requirements: 18.1, 18.2, 18.3_
    - _Design: Section 18_

  - [x] 19.2 Wrap dashboard cards in error boundaries
    - Each card section in student and admin dashboards wrapped
    - _Requirements: 18.1, 18.2_

  - [x] 19.3 Wrap admin panels in error boundaries
    - Review panel, metrics panel, and other admin feature sections wrapped
    - _Requirements: 18.1, 18.2_

- [ ] 20. Final Checkpoint — Full Verification
  - Run all jobs-ops checks: `bun run type-check`, `bun run lint`, `bun run test`, `vite build`
  - Run all admissions checks: `bun run test`, `bun run build`, `bun run lint`
  - Run all backend checks: `python -m pytest tests/unit/ tests/property/ -x -q --tb=short`
  - Run `python manage.py check`
  - Regenerate OpenAPI schema: `python manage.py spectacular --file /tmp/schema.yaml`
  - Verify no regressions across all layers
  - _Requirements: All_

## Notes

- Phase 1 is the highest priority — jobs-ops is missing fundamental production safety features
- Phase 2 addresses known audit findings that are documented but unfixed
- Phase 3 is low-risk housekeeping that reduces confusion and improves performance
- Phase 4 brings jobs-ops to parity with admissions on UX resilience patterns
- Phase 5 is code quality improvement for the admissions app (no user-facing changes)
- Each phase has a checkpoint to verify changes before proceeding to the next
- Backend tests should be run after every backend change to catch regressions early
- The jobs-ops test setup (task 5.1) should be done early in Phase 1 so subsequent tasks can include tests
- No new database tables are introduced in any phase
- All frontend changes target existing app-local code — no changes to `shared/`
