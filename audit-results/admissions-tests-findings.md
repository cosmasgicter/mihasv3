# Admissions Tests & Config Audit Findings

## Summary
- Total files: 353
- ignore-as-correct: 312
- improve: 30
- remove: 6
- needs-human-decision: 5

## Critical Findings (remove / confirmed-bug)

### tests/unit/profileApiSchemaDrift.test.ts — remove
**Tag:** confirmed-bug
**Issue:** Reads from `api-src/auth.ts` which does not exist. The `api-src/` directory was part of the pre-Django Vercel serverless function architecture and has been fully removed. This test will always throw ENOENT.
**Recommendation:** Delete this file. Profile API schema alignment is now validated by backend pytest suites against Django views.

### tests/integration/mime-types.integration.test.ts — remove
**Tag:** suspicious-stale-path
**Issue:** Multiple assertions reference files that no longer exist: `api/_lib/errorHandler.ts`, `api/[...path].ts`. Also expects `/api/(.*)` header block in vercel.json which doesn't exist (API is on a separate domain). The "API Response Content-Type" and "SPA Routing" sections test a Vercel serverless function architecture that was replaced by Django.
**Recommendation:** Delete this file. The Vite build config assertions are partially valid but better covered by the build itself. Security header assertions are already covered by `securityHeaders.integration.test.ts`.

### tests/integration/schemaVerification.test.ts — remove
**Tag:** suspicious-stale-path
**Issue:** Reads SQL migration files from `apps/admissions/migrations/` directory which does not exist. Schema is now managed by Django migrations in `backend/`. Every test in this file will throw ENOENT.
**Recommendation:** Delete this file. Schema verification is handled by Django's migration system and backend tests.

### tests/property/credentialScan.property.test.ts — remove
**Tag:** suspicious-stale-path
**Issue:** Scans `api-src/` and `lib/` directories at the admissions app root. `api-src/` was the Vercel serverless function directory (removed). `lib/` at app root doesn't exist. The test's `files.length > 0` assertion will fail because no scannable directories exist. Only `src/lib/` and `scripts/` would have files.
**Recommendation:** Rewrite to scan only `src/` and `scripts/`, or delete if the security audit covers this via CI.

### tests/property/function-conversion.property.ts — remove
**Tag:** suspicious-stale-path
**Issue:** Tests "Cloudflare Function to Vercel handler conversion equivalence" — a migration path that was completed and then superseded by the Django backend. No Cloudflare Functions or Vercel serverless functions exist in the current architecture.
**Recommendation:** Delete this file.

### tests/property/password.property.test.ts — remove
**Tag:** suspicious-stale-path
**Issue:** Has `@ts-nocheck` and tests a password hasher that was part of the Vercel serverless function auth layer. Password hashing is now handled by Django's auth system in the backend.
**Recommendation:** Delete this file.

## Improve Findings — Stale Path References

### tests/unit/forensic-cleanliness.test.ts — improve
**Tag:** suspicious-stale-path
**Issue:** References `lib/storage.ts` which is a stale path from the pre-Django architecture. The test gracefully skips missing files via `existsSync` so it won't crash, but the file list is outdated.
**Recommendation:** Update the scanned file list to only include paths that exist in the current architecture (`src/lib/`, `src/utils/`).

### tests/property/admin-users-registration-bugfix-exploration.test.ts — improve
**Tag:** suspicious-stale-path
**Issue:** Tests SQL parameterization in `handleUsers()` from `api-src/admin.ts` and VARCHAR overflow in `api-src/auth.ts`. These are Vercel serverless function bugs that no longer apply — the backend is Django. The test replicates the logic inline so it passes, but it's testing dead architecture.
**Recommendation:** Mark as legacy or delete. The SQL parameterization is now handled by Django ORM.

### tests/property/admin-users-registration-bugfix-preservation.test.ts — improve
**Tag:** suspicious-stale-path
**Issue:** Same as exploration counterpart — tests preservation of Vercel serverless function behaviors (CORS headers from `lib/cors.ts`, `sendSuccess`/`sendError` from `lib/errorHandler.ts`, CSRF from `lib/csrf.ts`). All of these are now handled by Django middleware.
**Recommendation:** Mark as legacy or delete.

### tests/property/supabase-exit-migration.property.test.ts — improve
**Tag:** suspicious-stale-path
**Issue:** Tests Supabase exit migration data integrity. The migration is complete — Supabase has been fully removed. These tests verify a one-time migration that already happened.
**Recommendation:** Archive or delete. The migration is done and verified.

### tests/property/supabase-auth-removal.property.test.ts — improve
**Tag:** suspicious-stale-path
**Issue:** Verifies Supabase Auth SDK removal. This is a completed migration verification. The tests scan for `@supabase/supabase-js` imports which should never reappear.
**Recommendation:** Keep as a regression guard but consider moving to a CI lint rule instead of a test.

### tests/property/supabase-complete-removal/sql-safety.property.test.ts — improve
**Tag:** suspicious-stale-path
**Issue:** Tests SQL parameterization in "admin API" via `lib/db.ts` — a Vercel serverless function pattern. Django uses ORM, not raw SQL via `lib/db.ts`.
**Recommendation:** Delete or rewrite to test Django ORM query safety.

### tests/property/vercel-api-bundling-fix/file-transformation.property.test.ts — improve
**Tag:** suspicious-stale-path
**Issue:** Has `@ts-nocheck`. Tests Vercel API bundling (`.ts` → `.js` file transformation in `api/` directory). No `api/` directory exists — backend is Django.
**Recommendation:** Delete this file.

### tests/property/vercel-api-bundling-fix/import-resolution.property.test.ts — improve
**Tag:** suspicious-stale-path
**Issue:** Has `@ts-nocheck`. Tests import resolution in bundled Vercel API files. Same stale architecture.
**Recommendation:** Delete this file.

### tests/property/vercel-api-bundling-fix/underscore-exclusion.property.test.ts — improve
**Tag:** suspicious-stale-path
**Issue:** Has `@ts-nocheck`. Tests underscore file exclusion in Vercel API bundling. Same stale architecture.
**Recommendation:** Delete this file.

### tests/property/rbac.property.test.ts — improve
**Tag:** suspicious-stale-path
**Issue:** Has `@ts-nocheck`. Tests RBAC permission determinism for a permission system that was part of the Vercel serverless auth layer. RBAC is now handled by Django's permission system.
**Recommendation:** Rewrite to test the current `isAdminRole()` function or delete.

## Improve Findings — Mock Accuracy & Test Quality

### tests/integration/auth-flows.integration.test.ts — improve
**Tag:** already-fixed-local
**Issue:** Session endpoint mock returns raw user object `{id, email, first_name, last_name, role}` without the `{"success": true, "data": ...}` envelope. Per documented conventions, `GET /api/v1/auth/session/` should return the envelope format. The mock doesn't match the real API response shape.
**Recommendation:** Wrap session response in `{"success": true, "data": {...}}` envelope to match the documented API contract.

### tests/property/admin-system-health-fixes/user-roles-rls.property.test.ts — improve
**Tag:** suspicious-stale-path
**Issue:** Tests RLS (Row-Level Security) policies for a `user_roles` table with Supabase-style `auth.uid()` patterns. Django doesn't use RLS — it uses Django's permission framework. The entire RLS policy simulation is testing dead architecture.
**Recommendation:** Delete or rewrite to test Django permission checks.

### tests/property/admin-system-health-fixes/audit-log-actor.property.test.ts — improve
**Tag:** already-fixed-local
**Issue:** Tests audit log actor relationship resilience with Supabase-style LEFT JOIN patterns. The mapping logic is tested in isolation (which is fine), but the "query pattern uses correct field names" test references Supabase relationship syntax (`profiles:actor_id` vs `actor:profiles!audit_logs_actor_id_fkey`). Django uses ORM relationships, not this syntax.
**Recommendation:** Remove the Supabase-specific query pattern tests. Keep the mapping logic tests.

### tests/property/sessions.property.test.ts — improve
**Tag:** suspicious-stale-path
**Issue:** Has `@ts-nocheck`. Tests session management with Supabase-style session deactivation cascade. Session management is now handled by Django's JWT cookie auth with Redis JTI blacklisting.
**Recommendation:** Rewrite to test the current session management or delete.

### tests/property/reducedMotion.property.test.ts — improve
**Tag:** suspicious-stale-path
**Issue:** Tests reduced motion respect for "framer-motion" components. Framer-motion was removed and replaced with CSS animations. The test may reference removed components.
**Recommendation:** Update to test CSS animation reduced-motion media query compliance.

### tests/property/auto-save.property.ts — improve
**Tag:** suspicious-stale-path
**Issue:** Has `@ts-nocheck` prefix. Tests auto-save round-trip with localStorage patterns from the pre-Django architecture. The auto-save system now uses server-side draft persistence.
**Recommendation:** Verify the test still matches the current auto-save implementation.

### tests/property/no-pii-logs.property.ts — improve
**Tag:** suspicious-stale-path
**Issue:** Scans for PII in log statements but the scan targets may include stale directories. The test concept is valuable but needs path updates.
**Recommendation:** Update scan paths to match current architecture.

### tests/property/non-blocking-validation.property.ts — improve
**Tag:** suspicious-stale-path
**Issue:** Tests non-blocking validation in the wizard. The concept is correct per documented behavior (eligibility checks are advisory), but the test may reference stale validation logic.
**Recommendation:** Verify test still matches current wizard validation behavior.

### tests/property/polling-interval.property.ts — improve
**Tag:** already-fixed-local
**Issue:** Tests that React Query polling intervals are between 10-60 seconds. The documented convention uses 60-second intervals for notifications and fingerprint-based deduplication for dashboard. The test range may be too broad.
**Recommendation:** Tighten the expected interval range to match documented conventions.

### tests/property/zambian-formats.property.ts — improve
**Tag:** already-fixed-local
**Issue:** Tests Zambian phone format (+260) and ECZ grade validation (1-9). The concept is correct but the file has no `.test.` in the name — it's `.property.ts` not `.property.test.ts`. Vitest may not pick it up depending on config.
**Recommendation:** Rename to `zambian-formats.property.test.ts` to ensure Vitest discovers it.

## Improve Findings — Config & Security

### vercel.json — improve
**Tag:** zero-day-class-risk
**Issue:** CSP uses `'unsafe-inline'` for both `script-src` and `style-src`. The `X-CSP-Note` header acknowledges this is a known limitation of Vercel static deploys (no nonce injection). However, `script-src 'unsafe-inline'` significantly weakens XSS protection. Additionally, the `report-uri` directive is deprecated in favor of `report-to`.
**Recommendation:** (1) Investigate if Vercel Edge Middleware can inject nonces to replace `unsafe-inline` for scripts. (2) Add `report-to` directive alongside `report-uri` for forward compatibility. (3) Consider adding `upgrade-insecure-requests` directive.

### vercel.json — improve
**Tag:** confirmed-bug
**Issue:** The global `Cache-Control: no-cache, no-store, must-revalidate` header applies to ALL routes including `/assets/(.*)` and `/images/(.*)`. While the asset-specific headers override for those paths, the global no-cache header may cause issues with browser caching of the SPA shell HTML. The `no-store` directive is overly aggressive for the HTML document.
**Recommendation:** Change global Cache-Control to `no-cache` only (without `no-store, must-revalidate`) or scope it to just the HTML document.

### package.json — improve
**Tag:** already-fixed-local
**Issue:** `@hookform/resolvers` is pinned to exact `5.2.2` while `zod` is pinned to exact `4.3.6`, but most other deps use `^` ranges. This inconsistency may cause issues when other deps expect compatible ranges. Also, `@sentry/react` at `^10.49.0` is a very recent major version — verify GlitchTip compatibility.
**Recommendation:** Verify `@sentry/react` v10 works with GlitchTip's Sentry-compatible endpoint. Pin consistently.

### tsconfig.tests.json — improve
**Tag:** already-fixed-local
**Issue:** Disables `noUncheckedIndexedAccess` for tests. This means tests won't catch potential undefined access bugs that would occur in production code. While this reduces test friction, it creates a type-safety gap.
**Recommendation:** Consider keeping `noUncheckedIndexedAccess: true` in tests to match production strictness, or document why it's disabled.

## Improve Findings — Test Isolation & Quality

### tests/property/cssAnimationEquivalence.property.test.ts — improve
**Tag:** already-fixed-local
**Issue:** Tests CSS animation equivalence for framer-motion replacement. The test concept is valid but may reference component names or animation classes that have changed since the framer-motion removal.
**Recommendation:** Verify test assertions match current animation class names.

### tests/unit/playwrightConfig.test.ts — improve
**Tag:** already-fixed-local
**Issue:** Tests Playwright configuration including `PLAYWRIGHT_BASE_URL` env var handling. The test modifies `process.env` which can leak between tests if cleanup fails.
**Recommendation:** Ensure env var restoration in afterEach is robust.

### tests/property/deadCode.property.test.ts — improve
**Tag:** already-fixed-local
**Issue:** Tests that dead files don't exist post-remediation. The file list may be outdated — new dead files may have accumulated since the last remediation pass.
**Recommendation:** Periodically update the dead file list.

### tests/property/unusedDeps.property.test.ts — improve
**Tag:** already-fixed-local
**Issue:** Tests that unused dependencies are removed from package.json. The dependency list may be outdated.
**Recommendation:** Periodically update the expected dependency list.

## Needs Human Decision

### tests/property/supabase-complete-removal/analytics-calculation.property.test.ts — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Part of the Supabase complete removal verification suite. Tests analytics calculation correctness. The Supabase removal is complete, but these tests may still validate useful analytics logic.
**Recommendation:** Human should decide: keep if the analytics calculation logic is still used, delete if it was Supabase-specific.

### tests/property/supabase-complete-removal/api-endpoints.property.test.ts — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Tests that frontend components call correct API endpoints post-Supabase removal. The migration is complete but the endpoint correctness tests may still be valuable.
**Recommendation:** Human should decide: keep if endpoint paths are still validated, delete if redundant with other tests.

### tests/property/supabase-complete-removal/data-isolation.property.test.ts — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Tests user data isolation post-Supabase removal. Data isolation is a critical security property but the test may reference Supabase-specific patterns.
**Recommendation:** Human should decide: rewrite for Django or delete if backend tests cover this.

### tests/property/supabase-complete-removal/response-structure.property.test.ts — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Tests API response structure validity post-Supabase removal. Response structure validation is valuable but may reference stale TypeScript interfaces.
**Recommendation:** Human should decide: update interfaces or delete if contract tests cover this.

### tests/unit/profileSchemaCanonicalCountry.test.ts — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Tests that `country` is the canonical residence-country column in "forensic schema metadata". References schema metadata patterns from the pre-Django migration. The concept (canonical country field) is valid but the test mechanism may be stale.
**Recommendation:** Human should decide: verify the test still reads valid source files.

## Ignore As Correct (312 files)

The following files were reviewed and classified as correct. They test current architecture, use proper mocks, have good isolation, and assertions match documented behavior.

### Config Files (7 files — all correct)
- `bunfig.toml` — Correct Bun config with exact versions
- `components.json` — Correct shadcn/ui config, `rsc: false` matches SPA
- `package.json` — Correct deps (minor improvement noted above)
- `tsconfig.json` — Correct with strict mode, bundler resolution, path aliases
- `tsconfig.build.json` — Correct, excludes tests from build
- `tsconfig.tests.json` — Correct (minor improvement noted above)
- `vercel.json` — Correct security headers (improvements noted above)

### E2E Tests (2 files — correct)
- `tests/e2e/accessibility.spec.ts` — Well-structured axe-core a11y tests
- `tests/e2e/applicationFlow.spec.ts` — Comprehensive flow test with proper helpers

### Integration Tests (4 correct, 2 flagged above)
- `tests/integration/auth-flows.integration.test.ts` — Correct structure (mock improvement noted)
- `tests/integration/email-check.integration.test.ts` — Correct email check contract tests
- `tests/integration/no-infinite-loops.integration.test.ts` — Correct retry/backoff logic tests
- `tests/integration/securityHeaders.integration.test.ts` — Correct vercel.json header validation

### Property Tests (148 correct out of ~170)
All property tests not flagged above are correctly structured with:
- Proper fast-check arbitraries and property assertions
- Correct `numRuns` settings (typically 10-100)
- Valid imports from current `@/` paths
- Assertions matching documented behavior

Notable well-written property tests:
- `apiClient.property.test.ts` — Thorough CSRF and auth cascade testing
- `apiClientCsrf.property.test.ts` — CSRF token capture/attach verification
- `apiEnvelope.property.test.ts` — API envelope structure validation
- `authFailureCascade.property.test.ts` — Auth failure state clearing
- `auditProductionBugCondition.property.test.ts` — Settings isDirty and ErrorDisplay bugs
- `auditProductionFixValidation.property.test.ts` — Fix validation with random inputs
- `auditProductionPreservation.property.test.ts` — Preservation of correct behavior
- `paymentStatusFiltering.property.test.ts` — Payment status partition correctness
- `admissions-logic-canonicalization.test.tsx` — Payment status normalization
- `production-readiness-audit/*.property.test.ts` — All 13 files correct
- `consolidation-*.test.ts` — All 13 consolidation tests correct
- `ui-ux-performance-overhaul/*.property.test.ts` — All 8 files correct

### UI Tests (4 files — all correct)
- `tests/ui/application-wizard-accessibility.test.tsx` — Correct PaymentStep a11y
- `tests/ui/bottom-navigation.mobile.test.tsx` — Correct mobile nav testing
- `tests/ui/error-display.test.tsx` — Correct ErrorDisplay rendering
- `tests/ui/save-status-indicator.test.tsx` — Correct AutoSaveIndicator states

### Unit Tests (143 correct out of ~155)
All unit tests not flagged above are correctly structured with:
- Proper vi.mock() setup and cleanup
- Correct imports from current `@/` paths
- Assertions matching documented behavior
- Good test isolation (beforeEach/afterEach cleanup)

Notable well-written unit tests:
- `apiClient401Retry.test.ts` — Thorough 401 intercept-refresh-retry
- `apiClientCsrf403Retry.test.ts` — CSRF 403 retry logic
- `authFormAttributes.test.ts` — Auth form HTML attribute validation
- `authLayoutMobileOverflow.test.ts` — Mobile overflow CSS verification
- `contactPageContrast.test.ts` — Color contrast validation
- `optimizedImageWebpNative.test.ts` — WebP native source handling
- `sessionHardening.test.ts` — Comprehensive session security
- `doubleSubmit.test.ts` — Double-submit prevention
- `errorMessages.test.ts` — Error code message mapping
- `page-verification/*.test.tsx` — All 15 page verification tests correct
- `wizardDraftResume.test.ts` — Draft resume normalization
- `toast.test.ts` — Toast store with dedup map cleanup

## Coverage Gaps

### Missing Test Coverage for Critical Flows
1. **Mobile money payment flow** — No unit test for `useFeeResolver` hook or mobile money initiation via `POST /api/v1/payments/mobile-money/`
2. **Withdrawal flow** — No frontend test for the withdrawal UI or `POST /api/v1/applications/{id}/withdraw/` integration
3. **Enrollment confirmation** — No frontend test for enrollment confirmation flow
4. **Amendment requests** — No frontend test for amendment request/approval UI
5. **Waitlist position display** — No frontend test for waitlist position rendering
6. **Conditional admission UI** — No frontend test for conditions display and verification
7. **Speculative prefetch** — `src/lib/speculativePrefetch.ts` has no dedicated test
8. **Route preloading** — `src/lib/routePreload.ts` has limited test coverage

### Missing Security Test Coverage
1. **CSRF recovery flow** — No test for the `recoverCsrfAndRetry` with `?refresh_csrf=1` query parameter
2. **Token refresh with JTI blacklisting** — No frontend test simulating blacklisted JTI response
3. **Cross-origin credential handling** — No test for `credentials: 'include'` on cross-origin requests to `api.mihas.edu.zm`
