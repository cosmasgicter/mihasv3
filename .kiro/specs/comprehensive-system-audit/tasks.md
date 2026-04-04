# Implementation Plan: Comprehensive System Audit

## Overview

Full-stack audit of the MIHAS monorepo executed in 5 phases following the CTO's shipping order: Security → Production Stability → Backend Quality → Frontend Quality → Design & Docs. Each phase investigates, verifies, documents findings, and writes property tests for correctness invariants. Findings are recorded in `findings.md` with severity, evidence, and remediation.

## Tasks

### Phase 1 — Security (Req 1–10, 29)

- [x] 1. Audit CSP policy and cookie security
  - [x] 1.1 Analyze CSP header in `apps/admissions/vercel.json` and determine if `unsafe-eval` is required by Zod v4 JIT
    - Search `node_modules/zod/` for `new Function` and `eval` usage
    - Test admissions build with `unsafe-eval` removed
    - Document whether `zod.setGlobalConfig({ jitless: true })` or alternative eliminates the requirement
    - Verify CSP blocks inline scripts (no `unsafe-inline` in `script-src`)
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.2 Verify cookie security attributes across all environments
    - Read `backend/config/settings/base.py` and `prod.py` for `AUTH_COOKIE_*` settings
    - Verify `Secure=True`, `HttpOnly=True` on all auth cookies
    - Verify `SameSite=None` is justified by cross-origin requirement (api.mihas.edu.zm → apply.mihas.edu.zm)
    - Search frontend for `localStorage.setItem`/`sessionStorage.setItem` with token keys
    - Produce cookie attribute matrix per environment
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 1.3 Verify CORS configuration across all environments
    - Enumerate `CORS_ALLOWED_ORIGINS` and `CORS_ALLOWED_ORIGIN_REGEXES` from all settings and `.env.*` files
    - Verify `CORS_ALLOW_ALL_ORIGINS = False` in production
    - Verify `CORS_ALLOW_CREDENTIALS = True` paired with explicit origin lists
    - Review regex patterns for overly permissive matches
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 2. Audit JWT, rate limiting, and CSRF flows
  - [x] 2.1 Trace JWT refresh flow end-to-end
    - Trace frontend `apiClient` 401 interceptor → refresh endpoint
    - Trace backend `JWTCookieAuthentication` and `JWTAuthenticationMiddleware` token extraction and validation
    - Verify `ROTATE_REFRESH_TOKENS=True`, `BLACKLIST_AFTER_ROTATION=True`
    - Verify `ACCESS_TOKEN_LIFETIME=15min`, `REFRESH_TOKEN_LIFETIME=7days`
    - Verify cross-origin cookie handling with CORS credentials
    - Check frontend refresh deduplication for concurrent 401s
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 2.2 Verify rate limiting coverage and Redis fallback
    - Read `RateLimitMiddleware` in `middleware.py`, enumerate scopes and limits
    - Map each API endpoint to its rate limit scope
    - Verify auth endpoints have stricter limits than general endpoints
    - Verify error reporting endpoint enforces 10-req/5-min/IP
    - Verify Redis-unavailable fallback (fail-open behavior)
    - Run existing property tests in `backend/tests/property/test_rate_limiting.py`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 2.3 Verify CSRF enforcement flow
    - Trace token issuance, frontend storage, header attachment, backend validation
    - Read `CSRFEnforcementMiddleware` exempt patterns and verify justifications
    - Verify POST/PUT/PATCH/DELETE without valid `X-CSRF-Token` returns 403
    - Verify CSRF token is session-bound
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 3. Audit error pipeline, secrets, and input validation
  - [x] 3.1 Verify error monitoring pipeline end-to-end
    - Verify backend 500 path: `envelope_exception_handler` → `ErrorLog.create(source='backend')` → throttled alert
    - Verify frontend path: `errorReporter.ts` → batch POST → `ErrorReportView` → `ErrorLog.create(source='frontend')` → throttled alert
    - Verify throttle: `cache.add(key, 1, 900)` — 15-min TTL per unique message hash
    - Verify fail-open: if `cache.add` throws, alert dispatches anyway
    - Verify `ErrorLog` schema has timestamp, source, message, stack_trace fields
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 3.2 Scan for hardcoded secrets across all source files
    - Grep for API key patterns (`sk_live_`, `pk_live_`), connection strings, JWT keys, generic password/secret/token patterns
    - Verify `.gitignore` excludes all `.env*` files
    - Verify `REQUIRED_ENV_VARS` matches actual secrets used
    - Verify `SECRET_KEY` default is overridden in non-dev environments
    - Review `docs/runbooks/secrets-rotation.md` for completeness
    - Verify no PII/secrets in log output or audit trail
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 3.3 Verify input validation and file upload security
    - Enumerate all DRF views with POST/PUT/PATCH, verify serializer usage
    - Verify no endpoint accepts raw `request.data` without serializer
    - Verify no serializer uses `fields = "__all__"`
    - Verify query parameters on list endpoints are validated
    - For file upload endpoints in `backend/apps/documents/`: verify MIME allowlist, size limits, filename sanitization
    - Verify uploaded files get non-guessable R2 keys and signed URLs
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 4. Audit backend auth edge cases
  - [x] 4.1 Verify JWT middleware edge case handling
    - Verify expired token → 401 with clear message (no internal details)
    - Verify malformed JWT → 401 without stack trace leakage
    - Verify no credentials → anonymous request with permission checks
    - Verify token precedence when both cookie and Bearer header present
    - Verify JTI blacklist check prevents reuse of revoked tokens
    - Run existing tests in `backend/tests/property/test_jwt_middleware.py` and `backend/tests/unit/test_jwt_middleware.py`
    - _Requirements: 29.1, 29.2, 29.3, 29.4, 29.5_

  - [x]* 4.2 Write property tests for auth edge cases
    - **Property: Expired tokens always produce 401 without internal details**
    - **Property: Malformed JWTs always produce 401 without stack traces**
    - **Property: Blacklisted JTIs are always rejected**
    - **Validates: Requirements 29.1, 29.2, 29.5**

- [x] 5. Create Phase 1 findings report and checkpoint
  - Compile all Phase 1 findings into `findings.md` with severity, evidence, and remediation
  - Record finding IDs in format `P1-SEC-{SEQ}`
  - Remediate any Critical findings before proceeding
  - _Requirements: 1–10, 29_

- [x] 6. Phase 1 Checkpoint — Ensure all security audit tasks are complete
  - Ensure all tests pass, ask the user if questions arise.

### Phase 2 — Production Stability (Req 11–16, 20, 32–35)

- [ ] 7. Audit TypeScript strict mode and test suite health
  - [ ] 7.1 Verify TypeScript strict mode in admissions app
    - Verify `tsconfig.json` has `strict: true` and `noUncheckedIndexedAccess: true`
    - Run `cd apps/admissions && bun run build` and verify zero TS errors
    - Grep for `@ts-ignore` and `as any` casts, document any added solely for strict mode suppression
    - Verify `noUncheckedIndexedAccess` does not cause runtime `undefined` access
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [ ] 7.2 Verify admissions test suite health
    - Run `cd apps/admissions && bun run test` three times, identify flaky tests
    - Verify property tests use deterministic seeds or are resilient to randomness
    - Verify integration tests do not depend on external services
    - Verify E2E tests have proper setup/teardown and no state leakage
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [ ] 8. Audit bundle size and Core Web Vitals
  - [ ] 8.1 Analyze admissions bundle size
    - Run production build, analyze chunk sizes
    - Verify main bundle (entry chunk) < 500KB gzipped
    - Identify vendor chunks > 200KB, verify lazy loading
    - Verify manual chunk splitting in `vite.config.ts` for Excel, PDF, OCR, chart libraries
    - Verify `terserOptions` with `drop_console` and `drop_debugger` active in production
    - Produce bundle analysis report
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [ ] 8.2 Measure Core Web Vitals
    - Measure FCP against 1.5s target on simulated 3G
    - Measure LCP against 2.5s target on simulated 3G
    - Measure CLS against 0.1 target
    - Verify critical rendering path is not blocked by non-essential scripts
    - Verify app shell renders skeleton before data fetches complete
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [ ] 9. Audit lazy loading and service worker
  - [ ] 9.1 Verify lazy loading and code splitting
    - Verify all route-level pages in `apps/admissions/src/pages/` use `React.lazy` or dynamic imports
    - Verify heavy feature components (document generation, OCR, charts, PDF) are dynamically imported
    - Verify `LazyLoadErrorBoundary` wraps all lazily loaded components
    - Verify chunk load failure shows retry prompt (not blank screen)
    - Verify service worker precaches critical chunks without blocking initial render
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [ ] 9.2 Verify service worker and offline support
    - Verify `injectManifest` strategy from `vite-plugin-pwa`
    - Verify offline behavior: cached pages served, offline indicator displayed
    - Verify online recovery: queued operations sync in FIFO order
    - Verify cache invalidation on new version deployment
    - Verify `/service-worker.js` has `Cache-Control: no-cache` headers
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

- [ ] 10. Audit jobs-ops quality gates and deployment configs
  - [ ] 10.1 Verify jobs-ops test coverage gap and quality gates
    - Document current test coverage state (expected: zero test files)
    - Verify `bun run type-check` passes with zero errors
    - Verify `bun run lint` passes with zero errors
    - Verify `vite build` completes successfully
    - Produce minimum viable test plan covering API service layer, route resolution, critical component rendering
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_

  - [ ] 10.2 Verify Vercel deployment configuration
    - Verify `apps/admissions/vercel.json` build command, install command, output directory
    - Verify SPA rewrite rule routes non-asset paths to `/index.html`
    - Verify security headers (HSTS, X-Frame-Options, X-Content-Type-Options, CSP, Permissions-Policy, Referrer-Policy)
    - Verify static assets have `Cache-Control: public, max-age=31536000, immutable`
    - Verify service worker has `Cache-Control: no-cache, no-store, must-revalidate`
    - _Requirements: 32.1, 32.2, 32.3, 32.4, 32.5_

  - [ ] 10.3 Verify Koyeb backend deployment configuration
    - Verify Docker entrypoint uses `uvicorn config.asgi:application`
    - Verify liveness/readiness probes point to `/health/live/` and `/health/ready/`
    - Verify Celery Beat runs as exactly one instance
    - Verify environment variables for database, Redis, JWT, S3/R2, email are configured
    - Document scaling configuration
    - _Requirements: 33.1, 33.2, 33.3, 33.4, 33.5_

  - [ ] 10.4 Verify Neon Postgres and Redis connections
    - Verify `DATABASE_URL` uses Neon pooler endpoint with `?pgbouncer=true`
    - Verify `CONN_MAX_AGE=600` and `conn_health_checks=True`
    - Verify `ssl_require=True` for all database connections
    - Verify Celery workers use separate connection config with lower pool limits
    - Verify `REDIS_URL` uses TLS (`rediss://`) in production
    - Verify `CELERY_BROKER_USE_SSL` is configured for `rediss://`
    - Verify Redis graceful degradation: rate limiting fails open, cache misses tolerated, Celery tasks queue for retry
    - _Requirements: 34.1, 34.2, 34.3, 34.4, 34.5, 35.1, 35.2, 35.3, 35.4_

- [ ] 11. Create Phase 2 findings report and checkpoint
  - Compile all Phase 2 findings into `findings.md` with severity, evidence, and remediation
  - Record finding IDs in format `P2-{AREA}-{SEQ}`
  - _Requirements: 11–16, 20, 32–35_

- [ ] 12. Phase 2 Checkpoint — Ensure all production stability audit tasks are complete
  - Ensure all tests pass, ask the user if questions arise.

### Phase 3 — Backend Quality (Req 24–28, 30–31, 36, 50)

- [ ] 13. Audit backend serializer coverage and query performance
  - [ ] 13.1 Verify DRF serializer coverage across all backend apps
    - Enumerate all DRF views with POST/PUT/PATCH across all apps
    - Verify each uses a serializer class for request validation
    - Verify no view directly accesses `request.data` without serializer
    - Verify no serializer uses `fields = "__all__"` in production
    - Verify nested serializer relationships use appropriate depth limits
    - _Requirements: 24.1, 24.2, 24.3, 24.4_

  - [ ] 13.2 Document N+1 query patterns and missing indexes
    - Document known N+1 patterns (interviews N+1 already documented)
    - Identify additional querysets accessing related objects without `select_related`/`prefetch_related`
    - Identify model fields used in `filter()`/`order_by()` without indexes
    - Verify no view performs unbounded queries (no pagination or LIMIT)
    - Document known slow queries and recommend optimization
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5_

- [ ] 14. Audit Celery tasks and API response format
  - [ ] 14.1 Verify Celery task reliability
    - Enumerate all Celery tasks, verify `autoretry_for`, `retry_backoff`, `max_retries`
    - Verify exception handling and error logging before retry
    - Verify `check_uptime_task` and `cleanup_audit_logs_task` schedules
    - Verify Celery Beat runs as exactly one instance
    - Verify exhausted-retry tasks log final failure and dispatch alert
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5_

  - [ ] 14.2 Verify API response format consistency
    - Verify all endpoints use `{success, data}` envelope via `EnvelopeRenderer`
    - Verify error responses use `{success: false, error: {code, message, details}}`
    - Verify paginated responses include `{page, pageSize, totalCount, results}`
    - Verify `envelope_exception_handler` catches all DRF exceptions
    - _Requirements: 27.1, 27.2, 27.3, 27.4_

- [ ] 15. Audit pagination, audit logging, health checks, and R2 storage
  - [ ] 15.1 Verify pagination across all list endpoints
    - Verify all list endpoints use `StandardPagination` with default page size 20
    - Verify pagination parameters are validated and bounded
    - Verify page-beyond-data returns empty results with correct `totalCount`
    - Verify no list endpoint returns unbounded result sets
    - _Requirements: 28.1, 28.2, 28.3, 28.4_

  - [ ] 15.2 Verify audit logging completeness
    - Verify `AuditMiddleware` logs all POST/PUT/PATCH/DELETE with timestamp, user, endpoint, status
    - Verify audit logs contain no PII, passwords, or document bodies
    - Verify `cleanup_audit_logs_task` retains standard 90 days, security 365 days
    - Verify audit records are queryable by timestamp, user, endpoint
    - _Requirements: 30.1, 30.2, 30.3, 30.4_

  - [ ] 15.3 Verify health check endpoints
    - Verify `/health/live/` returns 200 if process running
    - Verify `/health/ready/` returns 200 only if DB and Redis healthy
    - Verify DB failure → 503 on readiness check
    - Verify health checks excluded from auth, CSRF, rate limiting, audit
    - _Requirements: 31.1, 31.2, 31.3, 31.4_

  - [ ] 15.4 Verify R2 storage configuration
    - Verify `django-storages` S3-compatible config for Cloudflare R2
    - Verify signed URLs expire after 15 minutes
    - Verify `AWS_DEFAULT_ACL = None` prevents public access
    - Verify S3v4 signature version
    - Verify files retrievable via signed URLs, inaccessible via direct bucket URLs
    - _Requirements: 36.1, 36.2, 36.3, 36.4, 36.5_

- [ ] 16. Analyze backend test coverage
  - Produce coverage map by app (accounts, applications, catalog, documents, common, jobs, outreach, automation, integrations, analytics)
  - Identify apps with zero or minimal test coverage, prioritize by risk
  - Verify property tests cover schema validation, middleware behavior, migration invariants
  - Verify contract tests validate frontend-backend API parity
  - _Requirements: 50.1, 50.2, 50.3, 50.4_

- [ ] 17. Create Phase 3 findings report and checkpoint
  - Compile all Phase 3 findings into `findings.md` with severity, evidence, and remediation
  - Record finding IDs in format `P3-{AREA}-{SEQ}`
  - _Requirements: 24–28, 30–31, 36, 50_

- [ ] 18. Phase 3 Checkpoint — Ensure all backend quality audit tasks are complete
  - Ensure all tests pass, ask the user if questions arise.

### Phase 4 — Frontend Quality (Req 17–19, 21–23, 48–49, 51–52)

- [ ] 19. Audit error boundaries, loading states, and mobile responsiveness
  - [ ] 19.1 Verify error boundaries in admissions app
    - Verify every route-level page is wrapped by an error boundary
    - Verify error boundary shows user-friendly message with retry action
    - Verify error boundary logs to Error_Pipeline before showing fallback
    - _Requirements: 17.1, 17.2, 17.3, 17.4_

  - [ ] 19.2 Verify loading and empty states in admissions app
    - Verify every data-fetching page shows skeleton or spinner during loading
    - Verify every list page shows empty state message when no data returned
    - Verify loading states use consistent skeleton components
    - Verify failed fetches show error state with retry action
    - _Requirements: 18.1, 18.2, 18.3, 18.4_

  - [ ] 19.3 Verify mobile responsiveness in admissions app
    - Verify all interactive elements have 44x44px minimum touch targets
    - Verify pages render correctly at 320px, 375px, 414px viewports
    - Verify bottom navigation doesn't overlap content on mobile
    - Verify form inputs don't cause horizontal scrolling
    - Verify modals are scrollable and dismissible on mobile
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

- [ ] 20. Audit jobs-ops API, routes, and states
  - [ ] 20.1 Verify jobs-ops API service layer
    - Enumerate all API service files in `apps/jobs-ops/src/services/api/`
    - Verify each uses shared `apiClient` instance
    - Verify no raw `fetch` or `axios` usage
    - Verify error handling uses envelope format
    - Verify API URLs match backend route patterns
    - _Requirements: 21.1, 21.2, 21.3, 21.4_

  - [ ] 20.2 Verify jobs-ops route structure
    - Enumerate all routes in `apps/jobs-ops/src/app/router.tsx`
    - Verify each resolves to an existing component
    - Verify no duplicate or shadowed routes
    - Verify route structure matches feature directory layout
    - Verify undefined routes show 404 page
    - _Requirements: 22.1, 22.2, 22.3, 22.4_

  - [ ] 20.3 Verify jobs-ops loading and error states
    - Verify every data-fetching page shows loading indicator
    - Verify failed fetches show error state with retry
    - Verify loading states are consistent across feature pages
    - _Requirements: 23.1, 23.2, 23.3_

- [ ] 21. Analyze test coverage and produce test plans
  - [ ] 21.1 Analyze admissions test coverage
    - Produce coverage map by test type (unit, integration, property, E2E, UI)
    - Identify critical flows (registration, wizard, payment, upload) with test coverage
    - Identify untested API service functions
    - Verify property tests cover round-trip serialization properties
    - _Requirements: 48.1, 48.2, 48.3, 48.4_

  - [ ] 21.2 Produce jobs-ops minimum viable test plan
    - Produce prioritized test plan: API services, route resolution, critical components
    - Identify top 10 highest-risk untested code paths
    - Define minimum viable test configuration (Vitest setup, mocks, utilities)
    - Estimate effort for minimum viable test coverage
    - _Requirements: 49.1, 49.2, 49.3, 49.4_

  - [ ] 21.3 Audit integration, E2E, and property test correctness
    - Verify Playwright E2E tests cover application submission and accessibility
    - Verify Playwright config targets appropriate browsers and viewports
    - Identify cross-boundary flows lacking integration test coverage
    - Verify round-trip, idempotency, metamorphic, and error condition properties
    - Verify backend Hypothesis tests cover JWT, rate limiting, RBAC, envelope formatting
    - _Requirements: 51.1, 51.2, 51.3, 51.4, 52.1, 52.2, 52.3, 52.4, 52.5_

- [ ] 22. Create Phase 4 findings report and checkpoint
  - Compile all Phase 4 findings into `findings.md` with severity, evidence, and remediation
  - Record finding IDs in format `P4-{AREA}-{SEQ}`
  - _Requirements: 17–19, 21–23, 48–49, 51–52_

- [ ] 23. Phase 4 Checkpoint — Ensure all frontend quality audit tasks are complete
  - Ensure all tests pass, ask the user if questions arise.

### Phase 5 — Design & Docs (Req 37–47)

- [ ] 24. Audit design tokens, color contrast, and typography
  - [ ] 24.1 Verify design token consistency
    - Verify all color values reference Tailwind tokens or CSS custom properties
    - Verify all spacing values use Tailwind spacing scale
    - Verify all font sizes/weights reference typography scale
    - Identify components using inline styles with hardcoded values
    - _Requirements: 38.1, 38.2, 38.3, 38.4_

  - [ ] 24.2 Verify color system and WCAG contrast
    - Verify text-on-background combinations meet WCAG 2.1 AA (4.5:1 normal, 3:1 large)
    - Verify interactive elements have sufficient contrast
    - Verify focus indicators have 3:1 contrast
    - Document failing combinations with corrected values
    - _Requirements: 39.1, 39.2, 39.3, 39.4_

  - [ ] 24.3 Verify typography and spacing consistency
    - Verify all text uses fonts from Tailwind config
    - Verify heading hierarchy follows consistent scale
    - Verify component spacing follows 4px increment scale
    - Identify inconsistent padding/margin/gap values
    - _Requirements: 40.1, 40.2, 40.3, 40.4_

- [ ] 25. Audit component library, accessibility, and animations
  - [ ] 25.1 Verify component library consistency
    - Verify dialogs, dropdowns, tooltips, popovers use Radix UI primitives
    - Verify no re-implementation of existing Radix UI functionality
    - Verify Tailwind utility class ordering conventions
    - Verify jobs-ops uses Lucide icons consistently
    - _Requirements: 41.1, 41.2, 41.3, 41.4_

  - [ ] 25.2 Verify accessibility (ARIA, keyboard, screen reader)
    - Verify interactive elements have ARIA roles, labels, states
    - Verify keyboard-only navigation (Tab, Shift+Tab, Enter, Escape, arrows)
    - Verify focus management in modals/dialogs/dropdowns
    - Verify form inputs have associated labels
    - Verify dynamic content uses ARIA live regions
    - _Requirements: 42.1, 42.2, 42.3, 42.4, 42.5_

  - [ ] 25.3 Verify animation and reduced motion support
    - Verify all animations respect `prefers-reduced-motion: reduce`
    - Verify essential state changes visible with reduced motion
    - Verify animations don't cause layout shifts affecting CLS
    - Verify no animation > 500ms without user initiation
    - _Requirements: 43.1, 43.2, 43.3, 43.4_

- [ ] 26. Audit documentation freshness and accuracy
  - [ ] 26.1 Classify all docs files
    - Enumerate all files in `docs/`, classify as current/stale/legacy
    - Identify docs referencing removed tech (Supabase, Cloudflare Pages, NestJS, Spring Boot)
    - Identify `docs/reports/` files > 6 months old for archival
    - Produce cleanup list with action (keep, archive, delete) per document
    - _Requirements: 44.1, 44.2, 44.3, 44.4_

  - [ ] 26.2 Verify architecture and steering documentation
    - Verify `.kiro/steering/structure.md` matches current directory layout
    - Verify `.kiro/steering/tech.md` matches current tech stack and commands
    - Verify `.kiro/steering/product.md` matches current product areas
    - Verify `docs/design/` reflects current architecture
    - _Requirements: 45.1, 45.2, 45.3, 45.4_

  - [ ] 26.3 Verify API and deployment documentation
    - Run `python3 manage.py spectacular --file /tmp/schema.yaml`, verify zero warnings
    - Verify all endpoints represented in OpenAPI schema
    - Verify Swagger UI at `/api/v1/docs/` renders correctly
    - Verify secrets rotation runbook covers all current secrets
    - Verify deployment docs describe Vercel + Koyeb topology
    - Verify no deployment guide references removed platforms
    - _Requirements: 46.1, 46.2, 46.3, 46.4, 47.1, 47.2, 47.3, 47.4_

  - [ ] 26.4 Verify environment variable documentation
    - Verify every `REQUIRED_ENV_VARS` variable documented in `.env.example`
    - Verify Vite env validation plugin checks all required `VITE_*` variables
    - Verify no dangerous default values in production
    - Produce complete env var inventory
    - _Requirements: 37.1, 37.2, 37.3, 37.4_

- [ ] 27. Create Phase 5 findings report and checkpoint
  - Compile all Phase 5 findings into `findings.md` with severity, evidence, and remediation
  - Record finding IDs in format `P5-{AREA}-{SEQ}`
  - _Requirements: 37–47_

- [ ] 28. Phase 5 Checkpoint — Ensure all design & docs audit tasks are complete
  - Ensure all tests pass, ask the user if questions arise.

### Final

- [ ] 29. Produce consolidated audit report
  - Merge all phase findings into a single `audit-report.md`
  - Summary: total findings by severity (critical/high/medium/low)
  - Remediation priority matrix: severity × blast radius / cost-to-fix
  - Top 10 highest-priority remediation items with owners and target dates
  - Tech debt ratio estimate: maintenance work / total engineering capacity
  - _Requirements: All_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each phase produces a findings report before the checkpoint
- Critical findings in Phase 1 should be remediated before proceeding to Phase 2
- The consolidated audit report (Task 29) is the final deliverable
- Property tests written during the audit become permanent regression tests
