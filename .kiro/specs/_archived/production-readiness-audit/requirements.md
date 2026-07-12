# Requirements Document

## Introduction

Comprehensive production readiness audit and remediation for the MIHAS Application System (apply.mihas.edu.zm), a live admissions portal for Mukuba Institute of Health and Allied Sciences, Zambia. This spec is informed by a complete E2E production test that verified all 27+ API endpoints, auth flows, CSRF protection, security headers, email queue, notification system, application review flow, and payment receipt endpoint. The audit addresses all remaining issues discovered during testing and ensures the system achieves best-in-class performance, reliability, and mobile UX for Zambian students on unreliable connections.

### Context from E2E Testing

**Bugs Found & Fixed:**
- CRITICAL SECURITY: Admin users endpoint leaked password_hash, refresh_token_hash, reset_token_hash via SELECT * — fixed with explicit column list
- BUG: Notification history returned INTERNAL_ERROR due to uuid=text type mismatch in audit_logs JOIN — fixed by removing ::text cast

**Verified Working:**
- All 27+ API endpoints tested and functional
- Auth flow (login, logout, refresh, register, forgot-password)
- CSRF protection enforced on all state-changing requests
- Security headers (CSP, HSTS, X-Frame-Options, etc.)
- Email queue processing (Resend integration)
- Notification system (create, send, mark-read)
- Application review flow (approve/reject) with audit trail
- Payment receipt endpoint (correctly rejects unverified)

**Known Issues Still Open:**
- Screen auto-refreshing / jittering on the frontend
- Skeleton loading system needs verification
- Mobile responsiveness needs thorough audit
- DB/backend/frontend type sync issues
- Some documents reference old Cloudflare R2 URLs
- 36 API errors logged in audit_logs (all from Mar 7-8)

### Previous Specs Completed
- **deep-forensic-db-audit**: Line-by-line DB schema cross-reference, migration verification, interface fidelity
- **ui-ux-performance-overhaul**: Design tokens, UI primitive consolidation, skeleton system, mobile navigation, Core Web Vitals
- **production-remediation**: Auth state unification, auto-save race conditions, double-submit prevention, multi-tab auth, SSE lifecycle, polling leaks, token refresh, RBAC, offline sync, service worker, error display, file upload validation

This spec covers the final remediation pass: systematic verification that all prior fixes are working in production, plus the remaining open issues.

## Glossary

- **Application_System**: The MIHAS admissions portal (React 18 + TypeScript + Vite + Tailwind CSS) deployed on Vercel at apply.mihas.edu.zm
- **Auditor**: The systematic audit process that cross-references DB schemas, TypeScript interfaces, API responses, and frontend type definitions
- **Neon_DB**: The Neon Serverless Postgres database (project: wild-bar-37055823) used for all data storage
- **API_Layer**: Vercel serverless functions in `api-src/` using query-parameter routing with Arcjet protection
- **API_Client**: The `ApiClient` class in `src/services/client.ts` that unwraps `{ success, data }` envelopes
- **Auth_System**: Custom JWT authentication using jose for tokens and bcrypt for password hashing, with HTTP-only cookies
- **React_Query**: TanStack Query used for server state management with cache invalidation and polling
- **SSE_Client**: Server-Sent Events client in `src/lib/sseClient.ts` with reconnection and battery-friendly behavior
- **Skeleton_Screen**: A low-fidelity placeholder UI that mirrors the layout of incoming content, shown during data loading
- **Jitter**: Visible screen flickering or layout shifts caused by rapid re-renders, refetch intervals, or SSE reconnection loops
- **R2_URL**: A Cloudflare R2 storage URL from the pre-migration era that may still exist in document records
- **Touch_Target**: An interactive element sized for reliable thumb interaction on mobile devices (minimum 44×44px)
- **CLS**: Cumulative Layout Shift, a Core Web Vital measuring visual stability during page load
- **FCP**: First Contentful Paint, the time until the first text or image is rendered
- **LCP**: Largest Contentful Paint, the time until the largest visible content element is rendered
- **Bundle_Size**: The total size of JavaScript delivered to the browser, measured gzipped
- **Production_Score**: A weighted assessment across security, performance, reliability, mobile UX, data integrity, error handling, and monitoring

## Requirements

### Requirement 1: DB/Backend/Frontend Type Sync Audit

**User Story:** As a developer, I want all TypeScript interfaces in the frontend and backend to exactly match the actual Neon Postgres column names and types, so that no runtime errors occur from type mismatches between layers.

#### Acceptance Criteria

1. THE Auditor SHALL query `information_schema.columns` via Neon_DB for all 28 tables and produce a ground-truth column inventory including column_name, data_type, is_nullable, and column_default
2. THE Auditor SHALL compare every TypeScript interface in `lib/queries.ts` against the ground-truth column inventory, reporting fields that exist in the interface but not in the database, and columns that exist in the database but not in the interface
3. THE Auditor SHALL compare every TypeScript interface in `src/types/` that models API response data against the actual API response shapes returned by each endpoint, reporting any mismatches in field names or types
4. THE Auditor SHALL scan all `api-src/*.ts` files for inline SQL column references (in SELECT, INSERT, UPDATE, DELETE, and JOIN statements) and verify every referenced column exists in the corresponding Neon_DB table
5. THE Auditor SHALL verify that all frontend service functions in `src/services/` that consume API responses use field names matching the actual API response payload (after envelope unwrapping), not stale or renamed fields
6. WHEN a type mismatch is found between any two layers (DB ↔ backend interface, backend interface ↔ API response, API response ↔ frontend type), THE Auditor SHALL report the exact file, line, field name, expected type, and actual type
7. THE Auditor SHALL specifically verify the `audit_logs` table JOIN conditions used in `api-src/notifications.ts` and `api-src/admin.ts` to confirm the uuid=text type mismatch fix is correctly applied and no similar mismatches exist in other JOINs
8. THE Auditor SHALL verify that the `profiles` table column list used in `api-src/admin.ts` (the users endpoint) uses an explicit column list and does not use SELECT *, confirming the security fix for password_hash/token leakage is in place

### Requirement 2: Jittering and Auto-Refresh Investigation and Fix

**User Story:** As a student using the application on a mobile phone, I want the screen to remain stable without flickering, jumping, or auto-refreshing, so that I can read content and interact with forms without frustration.

#### Acceptance Criteria

1. THE Auditor SHALL inventory all React Query `refetchInterval` configurations across the codebase (in hooks, query options, and QueryClient defaults) and report each interval value, the query key it applies to, and the component that consumes it
2. THE Auditor SHALL inventory all SSE/polling reconnection logic in `src/lib/sseClient.ts`, `src/hooks/useStudentDashboardPolling.ts`, `src/hooks/useAdminDashboardPolling.ts`, and any `useRealtime` hooks, identifying reconnection timers, retry intervals, and visibility change handlers
3. THE Auditor SHALL identify all Zustand store subscriptions that trigger component re-renders by scanning for `useAuthStore`, `useApplicationStore`, `useToastStore`, and other store hooks, reporting any stores where frequent updates (more than once per second) could cause visible re-renders
4. WHEN a React Query refetch interval is set below 10 seconds on a non-critical query (anything other than auth session), THE Application_System SHALL increase the interval to at least 30 seconds or use event-driven invalidation instead
5. WHEN the SSE_Client reconnects after a disconnect, THE Application_System SHALL use exponential backoff starting at 2 seconds with a maximum of 60 seconds, and SHALL NOT trigger a full page data refetch on each reconnection attempt
6. THE Application_System SHALL ensure that React Query cache updates from polling or SSE do not cause layout shifts by using `keepPreviousData: true` (or `placeholderData` in v5) on all dashboard and list queries
7. THE Application_System SHALL ensure that the auth session check (`useSessionListener`) does not trigger cascading re-renders across the component tree by using React Query's `select` option to extract only the fields each component needs
8. WHEN the browser tab is hidden for more than 5 minutes, THE Application_System SHALL pause all polling intervals and SSE connections, resuming only when the tab becomes visible again

### Requirement 3: Skeleton Loading System Verification

**User Story:** As a student waiting for data to load, I want skeleton screens that match the layout of the real content and transition smoothly without layout shift, so that the application feels fast and professional.

#### Acceptance Criteria

1. THE Auditor SHALL verify that every lazy-loaded page route in `src/routes/config.tsx` has a corresponding Suspense fallback that renders a skeleton matching the target page layout, not a generic spinner
2. THE Auditor SHALL verify that `DashboardSkeleton` renders placeholder elements matching the actual student dashboard layout: stat cards row, applications list, and notification panel
3. THE Auditor SHALL verify that `AdminTableSkeleton` renders placeholder elements matching the actual admin table layout: filter bar, table header, and table rows with correct column count
4. THE Auditor SHALL verify that `WizardSkeleton` renders placeholder elements matching the actual application wizard layout: progress stepper, form fields area, and navigation buttons
5. THE Auditor SHALL verify that `AppShellSkeleton` renders placeholder elements matching the app shell: header bar, sidebar (desktop) or bottom nav (mobile), and content area
6. WHEN data loading completes, THE Application_System SHALL transition from skeleton to real content without visible layout shift (CLS contribution < 0.05 from skeleton-to-content transition)
7. THE Application_System SHALL ensure skeleton animations respect `prefers-reduced-motion` by disabling shimmer effects when the user prefers reduced motion
8. WHEN a data fetch fails after showing a skeleton, THE Application_System SHALL transition to an error state with a retry button, not remain in the skeleton state indefinitely
9. THE Application_System SHALL ensure no nested skeletons appear (e.g., a page skeleton inside a route-level Suspense fallback inside an app-level skeleton), limiting to one visible skeleton per content area

### Requirement 4: Mobile Responsiveness Audit

**User Story:** As a student on a mobile phone in Zambia (the primary access method), I want every page to be fully usable on screens as narrow as 320px with comfortable touch targets, so that I can complete my application from my phone without frustration.

#### Acceptance Criteria

1. THE Auditor SHALL test all public pages (landing page, sign-in, sign-up, forgot-password, reset-password) on viewports of 320px, 375px, and 768px, verifying no horizontal overflow, no overlapping elements, and no text truncation that hides critical information
2. THE Auditor SHALL test all student pages (dashboard, application wizard all 4 steps, application detail, payment, interview, settings, notification settings) on viewports of 320px, 375px, and 768px with the same criteria
3. THE Auditor SHALL test all admin pages (dashboard, applications list, application detail modal, users, settings, audit trail, monitoring, intakes, programs, batch operations) on viewports of 320px, 375px, and 768px
4. THE Application_System SHALL ensure all interactive elements (buttons, links, form inputs, checkboxes, radio buttons, select dropdowns, file upload zones) have a minimum touch target size of 44×44 CSS pixels on mobile viewports
5. THE Application_System SHALL ensure the application wizard step navigation is usable on 320px screens with step indicators that do not overflow or overlap
6. THE Application_System SHALL ensure the admin sidebar collapses cleanly on mobile with a hamburger menu toggle, and the collapsed state does not leave visual artifacts or block content
7. THE Application_System SHALL ensure all data tables on mobile either switch to a card-based layout or provide a horizontally scrollable table with a visible scroll affordance
8. THE Application_System SHALL ensure the bottom navigation bar on mobile does not overlap with page content by adding sufficient bottom padding to the content area
9. THE Application_System SHALL ensure all modals and dialogs are full-screen on mobile viewports (below 768px) with proper padding and a clearly visible close button
10. THE Application_System SHALL ensure form inputs on mobile have a minimum height of 44px and adequate spacing (minimum 12px) between fields to prevent mis-taps

### Requirement 5: Remaining Bug Hunt and Remediation

**User Story:** As a developer, I want all remaining bugs from the E2E test systematically identified and fixed, so that the production system has zero known defects.

#### Acceptance Criteria

1. THE Auditor SHALL query the `audit_logs` table for all entries with action containing 'error' or 'fail' from the Mar 7-8 timeframe (the 36 logged API errors), categorize each error by endpoint and error type, and determine which errors indicate bugs versus expected behavior (e.g., rate limiting, invalid input)
2. THE Auditor SHALL scan all `api-src/*.ts` files for any remaining `SELECT *` queries and replace each with an explicit column list that excludes sensitive fields (password_hash, refresh_token_hash, reset_token_hash, token_hash)
3. THE Auditor SHALL scan all document records in the `application_documents` table for `file_path` values containing old Cloudflare R2 URLs (patterns like `r2.cloudflarestorage.com`, `pub-*.r2.dev`, or any non-current storage domain) and report the count and affected application IDs
4. THE Auditor SHALL scan all `api-src/*.ts` and `lib/*.ts` files for type cast operations (e.g., `::text`, `::uuid`, `::integer`) in SQL strings and verify each cast is correct for the actual column types in Neon_DB
5. THE Auditor SHALL verify that all API endpoints return proper HTTP status codes: 200 for success, 400 for validation errors, 401 for unauthenticated, 403 for unauthorized/CSRF failure, 404 for not found, 409 for conflicts, 429 for rate limiting, and 500 only for unexpected server errors
6. THE Auditor SHALL verify that all error responses use the `sendError()` envelope from `lib/errorHandler.ts` and never return bare error objects or expose stack traces
7. WHEN a remaining SELECT * query is found, THE Application_System SHALL replace it with an explicit column list within the same remediation pass
8. WHEN an old R2 URL is found in document records, THE Auditor SHALL report the migration path needed (whether the files were migrated to the current storage or are permanently lost)

### Requirement 6: Performance Optimization and Bundle Analysis

**User Story:** As a product owner, I want the application to achieve FCP <1.5s, LCP <2.5s, main bundle <500KB gzipped, and Lighthouse >90, so that students on slow 3G connections in Zambia have a fast, reliable experience.

#### Acceptance Criteria

1. THE Auditor SHALL analyze the Vite build output to determine the current main bundle size (gzipped), the number and sizes of lazy-loaded chunks, and the total JavaScript delivered for the landing page and sign-in page
2. THE Auditor SHALL identify the top 10 largest dependencies by contribution to bundle size and recommend tree-shaking or lazy-loading opportunities for any dependency contributing more than 50KB gzipped
3. THE Application_System SHALL ensure all page-level components are lazy-loaded via `React.lazy()` with dynamic `import()`, verified by checking `src/routes/config.tsx` for any non-lazy route definitions
4. THE Application_System SHALL ensure the main entry bundle (excluding lazy chunks) contains only: React runtime, React Router, Zustand core, React Query core, Tailwind CSS utilities, and the app shell — targeting below 200KB gzipped
5. THE Auditor SHALL verify that Vite's code splitting configuration in `vite.config.ts` produces separate vendor chunks for large libraries (React, React DOM, React Query, Zustand, Radix UI, React Hook Form, Zod)
6. THE Application_System SHALL ensure all images use `loading="lazy"` for below-the-fold content and explicit `width`/`height` attributes to prevent CLS
7. THE Application_System SHALL ensure CSS is optimized: critical CSS inlined, unused Tailwind utilities purged, and no duplicate style definitions
8. THE Auditor SHALL verify that `console.log` removal is configured in the Vite terser options for production builds, preventing console output in production
9. THE Application_System SHALL ensure the service worker precaches the app shell, critical CSS, and the most common route chunks (landing, sign-in, student dashboard) for instant subsequent loads
10. THE Auditor SHALL measure or estimate FCP and LCP for the landing page and sign-in page based on bundle analysis and critical rendering path, identifying any blocking resources

### Requirement 7: Production Readiness Scoring

**User Story:** As a product owner, I want a scored assessment of the system's production readiness across all critical dimensions, so that I can prioritize remaining work and have confidence in the system's quality.

#### Acceptance Criteria

1. THE Auditor SHALL score the system on a 0-100 scale across 7 dimensions: Security, Performance, Reliability, Mobile UX, Data Integrity, Error Handling, and Monitoring — with each dimension weighted equally
2. THE Security score SHALL be based on: CSRF protection coverage, security header presence, Arcjet rate limiting coverage, input validation coverage (Zod schemas on all endpoints), file upload validation, password hashing strength, JWT token management, and absence of sensitive data leaks (SELECT * with password fields)
3. THE Performance score SHALL be based on: estimated FCP, estimated LCP, main bundle size, code splitting effectiveness, lazy loading coverage, image optimization, CSS optimization, and service worker caching strategy
4. THE Reliability score SHALL be based on: error boundary coverage, API error handling consistency, retry logic presence, graceful degradation for external APIs, auto-save reliability, offline queue functionality, and absence of unhandled promise rejections
5. THE Mobile_UX score SHALL be based on: touch target compliance (44×44px minimum), responsive layout coverage, bottom navigation presence, form input sizing, modal responsiveness, table responsiveness, and absence of horizontal overflow on 320px viewports
6. THE Data_Integrity score SHALL be based on: TypeScript interface fidelity to DB schema, API response shape consistency, absence of phantom columns in SQL, foreign key constraint coverage, audit trail completeness, and absence of orphaned records
7. THE Error_Handling score SHALL be based on: error boundary coverage on all page routes, user-friendly error messages (no raw error codes), retry mechanisms on failed operations, toast notification deduplication, and graceful handling of network errors
8. THE Monitoring score SHALL be based on: audit log coverage for state changes, error logging without PII, health check endpoint functionality, and ability to diagnose issues from logs alone
9. THE Auditor SHALL produce a final composite Production_Score as the weighted average of all 7 dimension scores
10. FOR EACH dimension scoring below 80, THE Auditor SHALL list the specific deficiencies and recommended remediations with priority (critical, high, medium, low)
