# Requirements Document — Comprehensive System Audit

## Introduction

Full-stack audit of the MIHAS monorepo covering security, frontend quality (admissions and jobs-ops), backend correctness, infrastructure reliability, design system consistency, documentation hygiene, and test coverage. The audit produces actionable findings organized by priority with verifiable acceptance criteria for each area.

## Glossary

- **Platform**: The MIHAS monorepo comprising `apps/admissions/`, `apps/jobs-ops/`, and `backend/`
- **Admissions_App**: The React SPA in `apps/admissions/` deployed to Vercel
- **Jobs_Ops_App**: The React SPA in `apps/jobs-ops/` deployed to Vercel
- **Backend**: The Django 5 + DRF API in `backend/` deployed to Koyeb
- **CSP**: Content Security Policy header controlling script/resource loading
- **CSRF_Middleware**: Custom `CSRFEnforcementMiddleware` in `backend/apps/common/middleware.py`
- **Rate_Limiter**: Custom `RateLimitMiddleware` in `backend/apps/common/middleware.py`
- **Audit_Middleware**: Custom `AuditMiddleware` in `backend/apps/common/middleware.py`
- **Error_Pipeline**: The self-hosted error monitoring flow from `errorReporter.ts` → `ErrorReportView` → `ErrorLog` → throttled alert email
- **Envelope_Renderer**: `EnvelopeRenderer` in `backend/apps/common/renderers.py` producing `{success, data}` responses
- **Design_Tokens**: CSS custom properties and Tailwind config values defining the visual language
- **CWV**: Core Web Vitals — FCP, LCP, CLS, INP metrics
- **N_Plus_One**: A database query pattern where a parent query triggers N additional child queries
- **Celery_Worker**: Background task processor using Redis as broker
- **Neon_Pooler**: Neon Postgres built-in connection pooler endpoint
- **R2_Storage**: Cloudflare R2 object storage accessed via `django-storages` S3 backend
- **OpenAPI_Schema**: The drf-spectacular generated schema at `/api/v1/schema/`

## Requirements

### Requirement 1: CSP Policy Audit

**User Story:** As a security engineer, I want to evaluate the `unsafe-eval` directive in the CSP policy, so that the platform minimizes script injection risk while maintaining Zod v4 JIT compatibility.

**Priority:** Critical

#### Acceptance Criteria

1. WHEN the Admissions_App CSP header is inspected, THE Platform SHALL document whether `unsafe-eval` is required by Zod v4 JIT compilation or can be replaced with a safer alternative
2. IF `unsafe-eval` cannot be removed, THEN THE Platform SHALL document the specific risk, the Zod dependency that requires it, and a mitigation plan with a target removal date
3. IF a Zod configuration or alternative validation library eliminates the `unsafe-eval` requirement, THEN THE Platform SHALL implement the alternative and remove `unsafe-eval` from the CSP header in `apps/admissions/vercel.json`
4. THE Platform SHALL verify that the CSP header blocks inline script execution except for explicitly allowed sources

### Requirement 2: Cookie Security Audit

**User Story:** As a security engineer, I want to verify cookie security attributes, so that session tokens are protected against cross-site attacks.

**Priority:** Critical

#### Acceptance Criteria

1. THE Platform SHALL document the current `SameSite` attribute value for all auth cookies and the security trade-off of the chosen value
2. WHEN auth cookies are set by the Backend, THE Backend SHALL use `Secure=True` and `HttpOnly=True` attributes regardless of the `SameSite` value
3. IF any cookie uses `SameSite=None`, THEN THE Platform SHALL document the cross-origin requirement that necessitates it and verify that `Secure=True` is also set
4. THE Platform SHALL verify that no auth tokens are stored in `localStorage` or `sessionStorage`

### Requirement 3: CORS Configuration Audit

**User Story:** As a security engineer, I want to verify CORS allowed origins, so that only trusted domains can make cross-origin requests.

**Priority:** Critical

#### Acceptance Criteria

1. THE Platform SHALL enumerate all values in `CORS_ALLOWED_ORIGINS` and `CORS_ALLOWED_ORIGIN_REGEXES` environment variables across all deployment environments
2. WHEN a CORS preflight request arrives from an origin not in the allowed list, THE Backend SHALL reject the request with no `Access-Control-Allow-Origin` header
3. THE Platform SHALL verify that no wildcard (`*`) origin is configured in any production environment
4. THE Platform SHALL verify that `CORS_ALLOW_CREDENTIALS=True` is only used with explicit origin lists, not with wildcard origins

### Requirement 4: JWT Token Rotation Audit

**User Story:** As a security engineer, I want to verify the JWT refresh flow, so that token rotation works correctly across cross-origin requests.

**Priority:** Critical

#### Acceptance Criteria

1. WHEN an access token expires, THE Admissions_App SHALL automatically refresh the token using the refresh cookie without user intervention
2. WHEN a refresh token is used, THE Backend SHALL rotate the refresh token and blacklist the previous one
3. IF a blacklisted refresh token is presented, THEN THE Backend SHALL reject the request and force re-authentication
4. WHEN token refresh occurs cross-origin, THE Platform SHALL verify that cookies are correctly sent and received with CORS credentials
5. THE Platform SHALL verify that `ACCESS_TOKEN_LIFETIME` is 15 minutes and `REFRESH_TOKEN_LIFETIME` is 7 days as configured

### Requirement 5: Rate Limiting Audit

**User Story:** As a security engineer, I want to verify rate limiting coverage, so that all endpoints are protected against abuse.

**Priority:** Critical

#### Acceptance Criteria

1. THE Platform SHALL enumerate all API endpoints and verify each has rate limiting applied via the Rate_Limiter middleware
2. WHEN a client exceeds the rate limit for an endpoint, THE Backend SHALL return HTTP 429 with a `Retry-After` header
3. THE Platform SHALL verify that authentication endpoints (`/api/v1/auth/login/`, `/api/v1/auth/register/`, `/api/v1/auth/password-reset/`) have stricter rate limits than general endpoints
4. THE Platform SHALL verify that the error reporting endpoint (`/api/v1/errors/report/`) enforces its 10-requests-per-5-minutes-per-IP limit
5. IF Redis is unavailable, THEN THE Rate_Limiter SHALL degrade gracefully without blocking legitimate requests

### Requirement 6: CSRF Enforcement Audit

**User Story:** As a security engineer, I want to verify CSRF protection, so that state-changing requests cannot be forged.

**Priority:** Critical

#### Acceptance Criteria

1. WHEN a state-changing request (POST, PUT, PATCH, DELETE) is made by an authenticated user, THE CSRF_Middleware SHALL require a valid `X-CSRF-Token` header
2. IF the `X-CSRF-Token` header is missing or invalid on a state-changing request, THEN THE Backend SHALL return HTTP 403
3. THE Platform SHALL verify that CSRF-exempt endpoints (error reporting, health checks, login) are explicitly listed and justified
4. THE Platform SHALL verify the end-to-end CSRF flow: token issuance → frontend storage → header attachment → backend validation

### Requirement 7: Error Monitoring Pipeline Audit

**User Story:** As an operations engineer, I want to verify the error monitoring pipeline, so that errors are captured, logged, and alerted on reliably.

**Priority:** High

#### Acceptance Criteria

1. WHEN a backend 500 error occurs, THE Backend SHALL create an `ErrorLog` row with source `backend` and dispatch a throttled alert email
2. WHEN the Admissions_App captures a `window.onerror` or `unhandledrejection` event, THE Admissions_App SHALL batch and POST the error to `/api/v1/errors/report/` within 5 seconds
3. WHEN the Backend receives a frontend error report, THE Backend SHALL create an `ErrorLog` row with source `frontend` and dispatch a throttled alert email
4. THE Platform SHALL verify that alert throttling limits to one alert per unique error message per 15 minutes
5. IF Redis is unavailable for throttle checks, THEN THE Backend SHALL dispatch the alert anyway (fail-open behavior)
6. THE Platform SHALL verify that `ErrorLog` rows are queryable and contain timestamp, source, message, and stack trace fields

### Requirement 8: Secrets Management Audit

**User Story:** As a security engineer, I want to verify that no secrets exist in source code, so that credentials are protected.

**Priority:** Critical

#### Acceptance Criteria

1. THE Platform SHALL scan all source files for hardcoded API keys, passwords, tokens, and connection strings
2. THE Platform SHALL verify that all secrets listed in `REQUIRED_ENV_VARS` are environment-backed and not committed to the repository
3. THE Platform SHALL verify that the `SECRET_KEY` default value `insecure-dev-key-change-me` is overridden in all non-development environments
4. THE Platform SHALL verify that the secrets rotation runbook at `docs/runbooks/secrets-rotation.md` covers all current secrets and matches the actual rotation procedures
5. THE Platform SHALL verify that no PII, secrets, or document bodies appear in log output or audit trail records

### Requirement 9: Input Validation Audit

**User Story:** As a security engineer, I want to verify that all API endpoints validate input, so that malformed or malicious data is rejected at the boundary.

**Priority:** Critical

#### Acceptance Criteria

1. THE Platform SHALL verify that every DRF view uses a serializer for input validation on state-changing endpoints
2. WHEN invalid input is submitted to any API endpoint, THE Backend SHALL return HTTP 400 with a structured error response in the envelope format
3. THE Platform SHALL verify that file upload endpoints validate content type, file extension, and file size before processing
4. THE Platform SHALL verify that no endpoint accepts raw `request.data` without serializer validation
5. THE Platform SHALL verify that query parameters on list endpoints are validated and sanitized

### Requirement 10: File Upload Security Audit

**User Story:** As a security engineer, I want to verify file upload protections, so that malicious files cannot be uploaded or executed.

**Priority:** Critical

#### Acceptance Criteria

1. THE Platform SHALL verify that all file upload endpoints validate the MIME type against an allowlist of permitted content types
2. THE Platform SHALL verify that file size limits are enforced before the file is fully read into memory
3. THE Platform SHALL verify that uploaded files are stored in R2_Storage with non-guessable keys and served via time-limited signed URLs
4. THE Platform SHALL verify that uploaded file names are sanitized to prevent path traversal attacks
5. IF a file fails content type validation, THEN THE Backend SHALL reject the upload with HTTP 400 and a descriptive error message


### Requirement 11: TypeScript Strict Mode Verification

**User Story:** As a frontend engineer, I want to verify that TypeScript strict mode causes no runtime regressions, so that the stricter type checking improves code quality without breaking functionality.

**Priority:** High

#### Acceptance Criteria

1. THE Admissions_App SHALL compile with zero TypeScript errors under `strict: true` and `noUncheckedIndexedAccess: true`
2. WHEN the Admissions_App test suite runs, THE Admissions_App SHALL pass all existing tests without failures caused by strict mode changes
3. THE Platform SHALL verify that no `@ts-ignore` or `as any` casts were added solely to suppress strict mode errors
4. THE Platform SHALL verify that `noUncheckedIndexedAccess` does not cause runtime `undefined` access in array or object indexing paths

### Requirement 12: Admissions Test Suite Health

**User Story:** As a QA engineer, I want to verify that all admissions tests pass reliably, so that the test suite provides trustworthy quality signals.

**Priority:** High

#### Acceptance Criteria

1. WHEN `bun run test` is executed in `apps/admissions/`, THE Admissions_App SHALL pass all test files with zero failures
2. THE Platform SHALL identify and document any flaky tests that produce inconsistent pass/fail results across multiple runs
3. THE Platform SHALL verify that property tests in `apps/admissions/tests/property/` use deterministic seeds or are resilient to randomness
4. THE Platform SHALL verify that integration tests in `apps/admissions/tests/integration/` do not depend on external services or network access
5. THE Platform SHALL verify that E2E tests in `apps/admissions/tests/e2e/` have proper setup/teardown and do not leak state between tests

### Requirement 13: Admissions Bundle Size Audit

**User Story:** As a performance engineer, I want to verify the bundle stays under 500KB, so that the app loads quickly on Zambian mobile networks.

**Priority:** High

#### Acceptance Criteria

1. WHEN the Admissions_App is built for production, THE Admissions_App SHALL produce a main bundle (entry chunk) smaller than 500KB gzipped
2. THE Platform SHALL identify all vendor chunks exceeding 200KB and verify each is loaded lazily
3. THE Platform SHALL verify that the manual chunk splitting in `vite.config.ts` correctly separates Excel, PDF, OCR, and chart libraries into lazy-loaded vendor chunks
4. THE Platform SHALL verify that `terserOptions` with `drop_console` and `drop_debugger` are active in production builds
5. THE Platform SHALL produce a bundle analysis report listing all chunks, their sizes, and their loading strategy (eager vs lazy)

### Requirement 14: Core Web Vitals Audit

**User Story:** As a performance engineer, I want to verify Core Web Vitals targets, so that the app meets performance standards for users on slow connections.

**Priority:** High

#### Acceptance Criteria

1. THE Admissions_App SHALL measure First Contentful Paint (FCP) and document the result against the 1.5-second target on a simulated 3G connection
2. THE Admissions_App SHALL measure Largest Contentful Paint (LCP) and document the result against the 2.5-second target on a simulated 3G connection
3. THE Admissions_App SHALL measure Cumulative Layout Shift (CLS) and document the result against the 0.1 target
4. THE Platform SHALL verify that critical rendering path resources are not blocked by non-essential scripts or stylesheets
5. THE Platform SHALL verify that the app shell renders a meaningful skeleton before data fetches complete

### Requirement 15: Lazy Loading and Code Splitting Audit

**User Story:** As a performance engineer, I want to verify that heavy components are code-split, so that initial load time is minimized.

**Priority:** High

#### Acceptance Criteria

1. THE Platform SHALL verify that all route-level page components in `apps/admissions/src/pages/` are lazily loaded via `React.lazy` or dynamic imports
2. THE Platform SHALL verify that heavy feature components (document generation, OCR, charts, PDF export) are dynamically imported
3. THE Platform SHALL verify that a `LazyLoadErrorBoundary` wraps all lazily loaded components to handle chunk load failures
4. WHEN a lazy chunk fails to load, THE Admissions_App SHALL display a retry prompt instead of a blank screen
5. THE Platform SHALL verify that the service worker precaches critical chunks but does not block initial render

### Requirement 16: Service Worker and Offline Support Audit

**User Story:** As a reliability engineer, I want to verify offline support, so that students on unstable Zambian connections can continue using the app.

**Priority:** High

#### Acceptance Criteria

1. THE Admissions_App SHALL register a service worker using the `injectManifest` strategy from `vite-plugin-pwa`
2. WHEN the app goes offline, THE Admissions_App SHALL serve cached pages and display an offline indicator
3. WHEN the app comes back online, THE Admissions_App SHALL sync any queued offline operations in FIFO order
4. THE Platform SHALL verify that the service worker cache invalidation works correctly when a new version is deployed
5. THE Platform SHALL verify that the service worker file at `/service-worker.js` has `Cache-Control: no-cache` headers to prevent stale worker caching

### Requirement 17: Error Boundaries Audit

**User Story:** As a frontend engineer, I want to verify that all pages have error boundaries, so that component failures are contained and recoverable.

**Priority:** Medium

#### Acceptance Criteria

1. THE Platform SHALL verify that every route-level page component in the Admissions_App is wrapped by an error boundary
2. WHEN a component within an error boundary throws, THE Admissions_App SHALL display a user-friendly error message with a retry action
3. THE Platform SHALL verify that error boundaries log the error to the Error_Pipeline before displaying the fallback UI
4. THE Platform SHALL verify that error boundaries do not catch errors in event handlers (only render/lifecycle errors)

### Requirement 18: Loading and Empty States Audit

**User Story:** As a UX engineer, I want to verify that all data-fetching pages show loading indicators and handle empty data, so that users always see meaningful feedback.

**Priority:** Medium

#### Acceptance Criteria

1. THE Platform SHALL verify that every page performing data fetches in the Admissions_App displays a skeleton or spinner during loading
2. THE Platform SHALL verify that every list page in the Admissions_App displays an empty state message when no data is returned
3. THE Platform SHALL verify that loading states use consistent skeleton components from the design system
4. WHEN a data fetch fails, THE Admissions_App SHALL display an error state with a retry action instead of a blank page

### Requirement 19: Mobile Responsiveness Audit

**User Story:** As a UX engineer, I want to verify that all pages work on mobile devices, so that students applying on phones have a usable experience.

**Priority:** High

#### Acceptance Criteria

1. THE Platform SHALL verify that all interactive elements in the Admissions_App have a minimum touch target size of 44x44 pixels
2. THE Platform SHALL verify that all pages render correctly at viewport widths of 320px, 375px, and 414px
3. THE Platform SHALL verify that the bottom navigation on mobile does not overlap page content
4. THE Platform SHALL verify that form inputs do not cause horizontal scrolling on mobile viewports
5. THE Platform SHALL verify that modal dialogs are scrollable and dismissible on mobile devices


### Requirement 20: Jobs-Ops Test Coverage Gap

**User Story:** As a QA engineer, I want to establish minimum test coverage for the Jobs-Ops app, so that the critical operator dashboard has quality gates beyond type-check and lint.

**Priority:** Critical

#### Acceptance Criteria

1. THE Platform SHALL document the current test coverage state of the Jobs_Ops_App (expected: zero test files)
2. THE Platform SHALL produce a minimum viable test plan covering: API service layer correctness, route resolution, and critical component rendering
3. THE Platform SHALL verify that `bun run type-check` passes with zero errors in the Jobs_Ops_App
4. THE Platform SHALL verify that `bun run lint` passes with zero errors in the Jobs_Ops_App
5. THE Platform SHALL verify that `vite build` completes successfully for the Jobs_Ops_App

### Requirement 21: Jobs-Ops API Service Layer Audit

**User Story:** As a frontend engineer, I want to verify that all Jobs-Ops API services use the shared apiClient correctly, so that auth, CSRF, and error handling are consistent.

**Priority:** High

#### Acceptance Criteria

1. THE Platform SHALL enumerate all API service files in `apps/jobs-ops/src/services/api/` and verify each uses the shared `apiClient` instance
2. THE Platform SHALL verify that no API service file uses raw `fetch` or `axios` directly
3. THE Platform SHALL verify that all API service functions handle error responses using the envelope format
4. THE Platform SHALL verify that API service URLs match the Backend route patterns under `/api/v1/`

### Requirement 22: Jobs-Ops Route Structure Audit

**User Story:** As a frontend engineer, I want to verify that all routes resolve to components, so that no route leads to a blank page or crash.

**Priority:** High

#### Acceptance Criteria

1. THE Platform SHALL enumerate all routes defined in `apps/jobs-ops/src/app/router.tsx` and verify each resolves to an existing component
2. THE Platform SHALL verify that no route path is duplicated or shadowed by another route
3. THE Platform SHALL verify that the route structure matches the feature directory layout in `apps/jobs-ops/src/features/`
4. WHEN a user navigates to an undefined route, THE Jobs_Ops_App SHALL display a 404 page instead of a blank screen

### Requirement 23: Jobs-Ops Loading and Error States Audit

**User Story:** As a UX engineer, I want to verify that all Jobs-Ops pages handle loading and error states, so that operators see meaningful feedback during data fetches.

**Priority:** Medium

#### Acceptance Criteria

1. THE Platform SHALL verify that every page performing data fetches in the Jobs_Ops_App displays a loading indicator
2. WHEN a data fetch fails in the Jobs_Ops_App, THE Jobs_Ops_App SHALL display an error state with a retry action
3. THE Platform SHALL verify that loading states are consistent across all feature pages

### Requirement 24: Backend Serializer Coverage Audit

**User Story:** As a backend engineer, I want to verify that all DRF views use proper serializers, so that input validation and output formatting are consistent.

**Priority:** High

#### Acceptance Criteria

1. THE Platform SHALL enumerate all DRF views across all backend apps and verify each uses a serializer class for request validation
2. THE Platform SHALL verify that no view directly accesses `request.data` without serializer validation
3. THE Platform SHALL verify that all serializers define explicit field lists (no `fields = "__all__"` in production serializers)
4. THE Platform SHALL verify that nested serializer relationships use appropriate depth limits or explicit nested serializers

### Requirement 25: Database Query Performance Audit

**User Story:** As a backend engineer, I want to identify N+1 query patterns and missing indexes, so that database performance is optimized for Neon Postgres.

**Priority:** High

#### Acceptance Criteria

1. THE Platform SHALL document known N+1 query patterns in Django ORM querysets, including the existing interviews N+1, and identify any additional patterns where related objects are accessed without `select_related` or `prefetch_related`
2. THE Platform SHALL identify model fields used in `filter()`, `order_by()`, or `WHERE` clauses that lack database indexes and document the risk level of each
3. THE Platform SHALL verify that the Neon connection pooler is configured with `conn_max_age=600` and `conn_health_checks=True`
4. THE Platform SHALL verify that no view performs unbounded queries (queries without pagination or `LIMIT`)
5. THE Platform SHALL document any known slow queries and recommend indexing or query optimization strategies

### Requirement 26: Celery Task Reliability Audit

**User Story:** As a backend engineer, I want to verify that all Celery tasks have proper error handling and retries, so that background work is resilient to transient failures.

**Priority:** High

#### Acceptance Criteria

1. THE Platform SHALL enumerate all Celery tasks and verify each has `autoretry_for`, `retry_backoff`, and `max_retries` configured
2. THE Platform SHALL verify that all Celery tasks handle exceptions gracefully and log errors before retrying
3. THE Platform SHALL verify that `check_uptime_task` and `cleanup_audit_logs_task` run on their configured schedules
4. THE Platform SHALL verify that Celery Beat runs as exactly one instance to prevent duplicate task dispatches
5. IF a Celery task exhausts all retries, THEN THE Backend SHALL log the final failure and dispatch an alert

### Requirement 27: API Response Format Audit

**User Story:** As a backend engineer, I want to verify that all endpoints use the standard envelope format, so that frontend clients can rely on a consistent response structure.

**Priority:** High

#### Acceptance Criteria

1. THE Platform SHALL verify that all API endpoints return responses in the `{success, data}` envelope format via the Envelope_Renderer
2. THE Platform SHALL verify that error responses include `{success: false, error: {code, message, details}}` structure
3. THE Platform SHALL verify that paginated responses include `{page, pageSize, totalCount, results}` inside the `data` envelope
4. THE Platform SHALL verify that the `envelope_exception_handler` catches all DRF exceptions and formats them consistently

### Requirement 28: Pagination Audit

**User Story:** As a backend engineer, I want to verify that all list endpoints support pagination, so that large result sets do not cause performance issues.

**Priority:** Medium

#### Acceptance Criteria

1. THE Platform SHALL verify that all list endpoints use `StandardPagination` with a default page size of 20
2. THE Platform SHALL verify that pagination parameters (`page`, `page_size`) are validated and bounded
3. WHEN a client requests a page beyond the available data, THE Backend SHALL return an empty results list with the correct `totalCount`
4. THE Platform SHALL verify that no list endpoint returns unbounded result sets

### Requirement 29: Backend Authentication Edge Cases Audit

**User Story:** As a security engineer, I want to verify that JWT middleware handles all edge cases, so that authentication is robust against malformed or expired tokens.

**Priority:** Critical

#### Acceptance Criteria

1. WHEN a request contains an expired access token, THE Backend SHALL return HTTP 401 with a clear error message
2. WHEN a request contains a malformed JWT, THE Backend SHALL return HTTP 401 without leaking internal error details
3. WHEN a request contains no authentication credentials, THE Backend SHALL treat the request as anonymous and apply permission checks accordingly
4. THE Platform SHALL verify that the `JWTAuthenticationMiddleware` correctly extracts tokens from both cookies and `Authorization: Bearer` headers
5. THE Platform SHALL verify that the `JTI` blacklist check prevents reuse of revoked tokens

### Requirement 30: Audit Logging Completeness

**User Story:** As a compliance engineer, I want to verify that all state-changing operations are logged, so that an audit trail exists for security and operational review.

**Priority:** High

#### Acceptance Criteria

1. THE Audit_Middleware SHALL log all POST, PUT, PATCH, and DELETE requests with timestamp, user, endpoint, and response status
2. THE Platform SHALL verify that audit logs do not contain PII, passwords, or document body content
3. THE Platform SHALL verify that the `cleanup_audit_logs_task` retains standard logs for 90 days and security logs for 365 days
4. THE Platform SHALL verify that audit log records are queryable by timestamp, user, and endpoint

### Requirement 31: Health Check Audit

**User Story:** As an operations engineer, I want to verify that health probes are correct, so that deployment platforms can accurately determine service availability.

**Priority:** High

#### Acceptance Criteria

1. WHEN `/health/live/` is requested, THE Backend SHALL return HTTP 200 if the process is running
2. WHEN `/health/ready/` is requested, THE Backend SHALL return HTTP 200 only if the database and Redis connections are healthy
3. IF the database connection fails during a readiness check, THEN THE Backend SHALL return HTTP 503
4. THE Platform SHALL verify that health check endpoints are excluded from authentication, CSRF, rate limiting, and audit logging


### Requirement 32: Vercel Deployment Audit

**User Story:** As a DevOps engineer, I want to verify the Vercel deployment configuration, so that builds, headers, and rewrites work correctly in production.

**Priority:** High

#### Acceptance Criteria

1. THE Platform SHALL verify that `apps/admissions/vercel.json` build command, install command, and output directory are correct
2. THE Platform SHALL verify that the SPA rewrite rule correctly routes all non-asset paths to `/index.html`
3. THE Platform SHALL verify that security headers (HSTS, X-Frame-Options, X-Content-Type-Options, CSP, Permissions-Policy, Referrer-Policy) are present on all responses
4. THE Platform SHALL verify that static assets under `/assets/` have `Cache-Control: public, max-age=31536000, immutable`
5. THE Platform SHALL verify that the service worker file has `Cache-Control: no-cache, no-store, must-revalidate`

### Requirement 33: Koyeb Backend Deployment Audit

**User Story:** As a DevOps engineer, I want to verify the Koyeb deployment configuration, so that the backend runs reliably with proper health checks and scaling.

**Priority:** High

#### Acceptance Criteria

1. THE Platform SHALL verify that the Docker configuration uses the correct entrypoint (`uvicorn config.asgi:application`)
2. THE Platform SHALL verify that liveness and readiness probes point to `/health/live/` and `/health/ready/` respectively
3. THE Platform SHALL verify that the Celery Beat worker runs as exactly one instance
4. THE Platform SHALL verify that environment variables for database, Redis, JWT, S3/R2, and email are configured in the Koyeb service
5. THE Platform SHALL document the current scaling configuration and verify it handles expected load

### Requirement 34: Neon Postgres Connection Audit

**User Story:** As a database engineer, I want to verify connection pooling and query performance, so that the database layer is reliable under production load.

**Priority:** High

#### Acceptance Criteria

1. THE Platform SHALL verify that `DATABASE_URL` uses the Neon pooler endpoint with `?pgbouncer=true` or the pooled connection string
2. THE Platform SHALL verify that `CONN_MAX_AGE=600` and `conn_health_checks=True` are configured in Django database settings
3. THE Platform SHALL verify that `ssl_require=True` is set for all database connections
4. THE Platform SHALL verify that Celery workers use a separate connection configuration with lower pool limits
5. THE Platform SHALL document the current connection limit and utilization level

### Requirement 35: Redis (Upstash) Connection Audit

**User Story:** As an infrastructure engineer, I want to verify Redis connectivity and failover behavior, so that caching, rate limiting, and task queuing are reliable.

**Priority:** High

#### Acceptance Criteria

1. THE Platform SHALL verify that `REDIS_URL` uses TLS (`rediss://`) in production
2. THE Platform SHALL verify that `CELERY_BROKER_USE_SSL` is configured when using `rediss://` connections
3. IF Redis becomes unavailable, THEN THE Backend SHALL degrade gracefully: rate limiting fails open, cache misses are tolerated, and Celery tasks queue for retry
4. THE Platform SHALL verify that the Redis cache backend is used for rate limiting, throttle state, and uptime status tracking

### Requirement 36: R2 Storage Audit

**User Story:** As an infrastructure engineer, I want to verify the R2 storage workflow, so that file uploads and downloads are secure and reliable.

**Priority:** High

#### Acceptance Criteria

1. THE Platform SHALL verify that `django-storages` is configured with the correct S3-compatible endpoint, bucket, and credentials for Cloudflare R2
2. THE Platform SHALL verify that signed URLs expire after 15 minutes (`AWS_QUERYSTRING_EXPIRE = 900`)
3. THE Platform SHALL verify that `AWS_DEFAULT_ACL = None` prevents public access to uploaded objects
4. THE Platform SHALL verify that the S3v4 signature version is used for all R2 operations
5. THE Platform SHALL verify that uploaded files are retrievable via signed URLs and inaccessible via direct bucket URLs

### Requirement 37: Environment Variables Documentation Audit

**User Story:** As a DevOps engineer, I want to verify that all required environment variables are documented and set, so that deployments do not fail due to missing configuration.

**Priority:** Medium

#### Acceptance Criteria

1. THE Platform SHALL verify that every variable in `REQUIRED_ENV_VARS` is documented in `.env.example` with a description
2. THE Platform SHALL verify that the Vite env validation plugin checks all required `VITE_*` variables during production builds
3. THE Platform SHALL verify that no environment variable has a dangerous default value in production (e.g., `insecure-dev-key-change-me`)
4. THE Platform SHALL produce a complete environment variable inventory mapping each variable to its purpose, required environments, and source of truth

### Requirement 38: Design Token Consistency Audit

**User Story:** As a design engineer, I want to verify that all components use design tokens, so that the visual language is consistent across the platform.

**Priority:** Medium

#### Acceptance Criteria

1. THE Platform SHALL verify that all color values in component styles reference Tailwind config tokens or CSS custom properties, not hardcoded hex/rgb values
2. THE Platform SHALL verify that all spacing values use the Tailwind spacing scale, not arbitrary pixel values
3. THE Platform SHALL verify that all font sizes and weights reference the typography scale defined in the Tailwind config
4. THE Platform SHALL identify any component using inline styles with hardcoded values that should use design tokens

### Requirement 39: Color System and Contrast Audit

**User Story:** As an accessibility engineer, I want to verify WCAG contrast ratios, so that text is readable for users with visual impairments.

**Priority:** High

#### Acceptance Criteria

1. THE Platform SHALL verify that all text-on-background color combinations in the Admissions_App meet WCAG 2.1 AA contrast ratio (4.5:1 for normal text, 3:1 for large text)
2. THE Platform SHALL verify that interactive elements (buttons, links, form controls) have sufficient contrast against their backgrounds
3. THE Platform SHALL verify that focus indicators are visible with at least 3:1 contrast ratio against adjacent colors
4. THE Platform SHALL document any color combinations that fail contrast requirements and provide corrected values

### Requirement 40: Typography and Spacing Consistency Audit

**User Story:** As a design engineer, I want to verify consistent font and spacing usage, so that the UI feels cohesive.

**Priority:** Medium

#### Acceptance Criteria

1. THE Platform SHALL verify that all text elements use fonts defined in the Tailwind config, not system fonts or unregistered font families
2. THE Platform SHALL verify that heading hierarchy (h1-h6) follows a consistent size and weight scale
3. THE Platform SHALL verify that component spacing follows the Tailwind spacing scale (4px increments)
4. THE Platform SHALL identify any component with inconsistent padding, margin, or gap values

### Requirement 41: Component Library Consistency Audit

**User Story:** As a frontend engineer, I want to verify that Radix UI and Tailwind patterns are used consistently, so that the component library is maintainable.

**Priority:** Medium

#### Acceptance Criteria

1. THE Platform SHALL verify that all dialog, dropdown, tooltip, and popover components use Radix UI primitives
2. THE Platform SHALL verify that no component re-implements functionality already provided by an existing Radix UI primitive
3. THE Platform SHALL verify that Tailwind utility classes follow consistent ordering conventions
4. THE Platform SHALL verify that the Jobs_Ops_App uses Lucide icons consistently and does not mix icon libraries

### Requirement 42: Accessibility Audit

**User Story:** As an accessibility engineer, I want to verify ARIA attributes, keyboard navigation, and screen reader support, so that the platform is usable by people with disabilities.

**Priority:** High

#### Acceptance Criteria

1. THE Platform SHALL verify that all interactive elements have appropriate ARIA roles, labels, and states
2. THE Platform SHALL verify that all pages are navigable using keyboard only (Tab, Shift+Tab, Enter, Escape, Arrow keys)
3. THE Platform SHALL verify that focus management works correctly in modals, dialogs, and dropdown menus (focus trap on open, restore on close)
4. THE Platform SHALL verify that all form inputs have associated labels (via `htmlFor`/`id` or `aria-label`)
5. THE Platform SHALL verify that dynamic content updates are announced to screen readers via ARIA live regions

### Requirement 43: Animation and Reduced Motion Audit

**User Story:** As an accessibility engineer, I want to verify reduced-motion support, so that users who are sensitive to motion can use the platform comfortably.

**Priority:** Medium

#### Acceptance Criteria

1. THE Platform SHALL verify that all CSS animations and transitions respect the `prefers-reduced-motion: reduce` media query
2. THE Platform SHALL verify that essential state changes (loading, success, error) remain visible even with reduced motion enabled
3. THE Platform SHALL verify that animations do not cause layout shifts that affect CLS scores
4. THE Platform SHALL verify that no animation runs for longer than 500ms without user initiation

### Requirement 44: Documentation Freshness Audit

**User Story:** As a developer, I want to identify stale and legacy documentation, so that the docs directory contains only accurate, current information.

**Priority:** Medium

#### Acceptance Criteria

1. THE Platform SHALL enumerate all files in `docs/` and classify each as current, stale, or legacy based on whether it references the current architecture (Django backend, Vercel frontend, Neon Postgres)
2. THE Platform SHALL identify documents that reference removed technologies (Supabase, Cloudflare Pages, NestJS, Spring Boot) and mark them for archival or deletion
3. THE Platform SHALL verify that `docs/reports/` files older than 6 months that describe completed work are candidates for archival
4. THE Platform SHALL produce a recommended cleanup list with action (keep, archive, delete) for each document

### Requirement 45: Architecture Documentation Audit

**User Story:** As a developer, I want to verify that architecture documentation matches the current system state, so that onboarding and decision-making are based on accurate information.

**Priority:** Medium

#### Acceptance Criteria

1. THE Platform SHALL verify that `.kiro/steering/structure.md` accurately describes the current directory layout and placement guidance
2. THE Platform SHALL verify that `.kiro/steering/tech.md` accurately describes the current technology stack and commands
3. THE Platform SHALL verify that `.kiro/steering/product.md` accurately describes the current product areas and business rules
4. THE Platform SHALL verify that `docs/design/` documents reflect the current system architecture, not planned or abandoned designs

### Requirement 46: API Documentation Audit

**User Story:** As a developer, I want to verify that the OpenAPI schema is current, so that API consumers have accurate documentation.

**Priority:** Medium

#### Acceptance Criteria

1. WHEN `python3 manage.py spectacular --file /tmp/schema.yaml` is run, THE Backend SHALL generate a valid OpenAPI 3.0 schema with zero warnings
2. THE Platform SHALL verify that all API endpoints are represented in the generated schema
3. THE Platform SHALL verify that request/response schemas in the OpenAPI spec match the actual serializer definitions
4. THE Platform SHALL verify that the Swagger UI at `/api/v1/docs/` renders correctly and allows interactive testing

### Requirement 47: Deployment and Runbook Documentation Audit

**User Story:** As an operations engineer, I want to verify that deployment guides and runbooks are accurate, so that operational procedures can be followed reliably.

**Priority:** Medium

#### Acceptance Criteria

1. THE Platform SHALL verify that `docs/runbooks/secrets-rotation.md` covers all secrets in `REQUIRED_ENV_VARS` plus R2 keys, Resend API key, and Redis URL
2. THE Platform SHALL verify that deployment documentation describes the current Vercel + Koyeb deployment topology
3. THE Platform SHALL verify that no deployment guide references removed platforms (Cloudflare Pages, Netlify, self-hosted Spring Boot)
4. THE Platform SHALL verify that the production deployment guide includes rollback procedures

### Requirement 48: Admissions Test Coverage Analysis

**User Story:** As a QA engineer, I want to analyze the admissions test suite for coverage gaps, so that untested critical paths are identified and prioritized.

**Priority:** High

#### Acceptance Criteria

1. THE Platform SHALL produce a coverage map of the admissions test suite organized by test type (unit, integration, property, E2E, UI)
2. THE Platform SHALL identify critical user flows (registration, application wizard, payment, document upload) and verify each has at least one integration or E2E test
3. THE Platform SHALL identify API service functions in `apps/admissions/src/services/` that lack corresponding test coverage
4. THE Platform SHALL verify that property tests cover round-trip properties for data serialization (auto-save, date formatting, API envelope parsing)

### Requirement 49: Jobs-Ops Test Coverage Plan

**User Story:** As a QA engineer, I want a minimum viable test plan for the Jobs-Ops app, so that the zero-test-coverage gap is addressed with the highest-value tests first.

**Priority:** Critical

#### Acceptance Criteria

1. THE Platform SHALL produce a prioritized test plan for the Jobs_Ops_App covering: API service layer tests, route resolution tests, and critical component render tests
2. THE Platform SHALL identify the top 10 highest-risk untested code paths in the Jobs_Ops_App based on complexity and user impact
3. THE Platform SHALL define a minimum viable test configuration (Vitest setup, test utilities, mock patterns) for the Jobs_Ops_App
4. THE Platform SHALL estimate the effort required to achieve the minimum viable test coverage

### Requirement 50: Backend Test Coverage Analysis

**User Story:** As a QA engineer, I want to analyze the backend test suite for coverage gaps, so that untested endpoints and business logic are identified.

**Priority:** High

#### Acceptance Criteria

1. THE Platform SHALL produce a coverage map of the backend test suite organized by app (`accounts`, `applications`, `catalog`, `documents`, `common`, `jobs`, `outreach`, `automation`, `integrations`, `analytics`)
2. THE Platform SHALL identify backend apps with zero or minimal test coverage and prioritize them by risk
3. THE Platform SHALL verify that property tests in `backend/tests/property/` cover schema validation, middleware behavior, and migration invariants
4. THE Platform SHALL verify that the contract test in `backend/tests/contract/` validates frontend-backend API parity

### Requirement 51: Integration and E2E Test Audit

**User Story:** As a QA engineer, I want to verify that end-to-end flows are tested, so that critical user journeys are validated across the full stack.

**Priority:** High

#### Acceptance Criteria

1. THE Platform SHALL verify that Playwright E2E tests in `apps/admissions/tests/e2e/` cover the application submission flow and accessibility checks
2. THE Platform SHALL verify that Playwright configuration in `apps/admissions/playwright.config.ts` targets appropriate browsers and viewport sizes
3. THE Platform SHALL identify critical cross-boundary flows (frontend → backend → database → response) that lack integration test coverage
4. THE Platform SHALL verify that integration tests use proper test fixtures and do not depend on production data or external services

### Requirement 52: Property Test Correctness Audit

**User Story:** As a QA engineer, I want to verify that property tests cover all correctness properties, so that invariants, round-trips, and edge cases are systematically tested.

**Priority:** High

#### Acceptance Criteria

1. THE Platform SHALL verify that round-trip properties exist for all serialization paths (auto-save data, date formatting, API envelope parsing, Zambian grade formatting)
2. THE Platform SHALL verify that idempotency properties exist for operations that should be safe to retry (offline sync, cache operations, token refresh deduplication)
3. THE Platform SHALL verify that metamorphic properties exist for filtering and search operations (filter results are subsets, sort preserves count)
4. THE Platform SHALL verify that error condition properties exist for all input validation paths (malformed data produces structured errors)
5. THE Platform SHALL verify that backend Hypothesis property tests cover JWT middleware, rate limiting, RBAC, and response envelope formatting
