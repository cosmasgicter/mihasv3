# Implementation Plan: Audit Remediation

## Overview

Remediate all 26 findings from the MIHAS Full-Stack Audit Report across three sprints. Each task maps to specific requirements and design sections. All changes target the existing TypeScript codebase (api-src/, lib/, src/) with bundling via `bun run scripts/bundle-api.mjs` after API changes.

## Tasks

### Sprint 1 — Critical (Data Integrity + Security)

- [x] 1. Fix Neon transaction isolation and clean up dead code in lib/db.ts
  - [x] 1.1 Replace manual BEGIN/COMMIT/ROLLBACK with Neon transaction() callback API
    - In `lib/db.ts`, replace the `transaction()` function body with `neon().transaction(async (tx) => { ... })` pattern
    - Add `getNeonInstance()` module-level cached factory (also satisfies R9)
    - Preserve the existing `transaction(operations: QueryConfig[]): Promise<QueryResult<T>[]>` signature
    - Automatic rollback on thrown errors, automatic commit on success
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 9.1, 9.2_

  - [x] 1.2 Delete dead code: interpolateParams and duplicate query builders
    - Remove `interpolateParams` function from `lib/db.ts`
    - Remove `userQueries`, `sessionQueries`, `auditQueries` objects from `lib/db.ts`
    - Verify no imports reference these from `lib/db.ts` (all callers use `lib/queries.ts`)
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 1.3 Write property test for transaction atomicity (Property 1)
    - Create `tests/property/audit-remediation-transactions.test.ts`
    - **Property 1: Transaction atomicity (all-or-nothing)**
    - Test that failed operations result in full rollback, successful operations are all committed
    - **Validates: Requirements 1.1, 1.2, 1.3**

  - [x] 1.4 Write unit test verifying dead code removal
    - In `tests/unit/audit-remediation-code-structure.test.ts`, verify `lib/db.ts` does not export `interpolateParams`, `userQueries`, `sessionQueries`, `auditQueries`
    - Verify `lib/db.ts` does not contain `BEGIN`/`COMMIT`/`ROLLBACK` query strings
    - _Requirements: 1.4, 6.1, 6.2, 6.3_

- [x] 2. Remove hardcoded admin email bypass in AdminRoute
  - [x] 2.1 Delete the email bypass block in src/components/AdminRoute.tsx
    - Remove the `if (user.email === 'cosmas@beanola.com')` block (line ~88)
    - Ensure the existing `if (!isAdmin)` check remains as the sole access gate
    - _Requirements: 2.1, 2.2_

  - [x] 2.2 Write property test for admin route role-only access (Property 2)
    - In `tests/property/audit-remediation-ui.test.ts`
    - **Property 2: Admin route access determined exclusively by role**
    - Generate random user objects with various emails and roles, verify access is role-only
    - **Validates: Requirements 2.1, 2.2**

  - [x] 2.3 Write unit test verifying no hardcoded email in AdminRoute
    - In `tests/unit/audit-remediation-code-structure.test.ts`, verify `AdminRoute.tsx` source does not contain hardcoded email strings
    - _Requirements: 2.1_

- [x] 3. Parameterize SQL queries in auth handler
  - [x] 3.1 Replace template literal SQL interpolation in api-src/auth.ts
    - Replace `INTERVAL '${LOGIN_COOLDOWN_MINUTES} minutes'` with `INTERVAL '1 minute' * $N` pattern (line ~283)
    - Replace `INTERVAL '${REGISTRATION_RATE_WINDOW_MINUTES} minutes'` with parameterized form (lines ~438, ~447)
    - Replace password reset interval interpolation with parameterized form (line ~758)
    - Pass interval constants as query parameters
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 3.2 Bundle API after auth.ts changes
    - Run `bun run scripts/bundle-api.mjs`
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 3.3 Write unit test verifying zero SQL template interpolation in auth.ts
    - In `tests/unit/audit-remediation-code-structure.test.ts`, scan `api-src/auth.ts` source for `${` inside SQL string patterns
    - _Requirements: 3.4_

- [x] 4. Authenticate health endpoint diagnostic actions
  - [x] 4.1 Add requireRole gate for protected health actions in api-src/health.ts
    - Import `requireRole` from `../lib/auth/middleware` and error classes
    - Keep `?action=ping` and default (no action) public
    - Gate `?action=db`, `?action=env`, `?action=errors` behind `requireRole(req, ['admin', 'super_admin'])`
    - Return 401 for unauthenticated requests to protected actions
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 4.2 Bundle API after health.ts changes
    - Run `bun run scripts/bundle-api.mjs`
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 4.3 Write property test for health endpoint auth gate (Property 3)
    - In `tests/property/audit-remediation-security.test.ts`
    - **Property 3: Health endpoint protected actions require admin authentication**
    - Generate random combinations of actions and auth states
    - **Validates: Requirements 4.1, 4.2, 4.3**

- [x] 5. Arcjet fail-closed in production
  - [x] 5.1 Add production check to withArcjetProtection in lib/arcjet.ts
    - When `ARCJET_KEY` is missing and `NODE_ENV === 'production'`, return 503 with `SECURITY_SERVICE_ERROR`
    - When `ARCJET_KEY` is missing and not production, log warning and pass through (existing behavior)
    - _Requirements: 5.1, 5.2_

  - [x] 5.2 Add documents rate limit type to lib/arcjet.ts
    - Add `'documents'` to `RouteType` union
    - Add `documents: { window: "10m", max: 20 }` to `rateLimitConfigs`
    - _Requirements: 12.1_

  - [x] 5.3 Update api-src/documents.ts to use documents rate limit
    - Change `withArcjetProtection(handler, 'general')` to `withArcjetProtection(handler, 'documents')`
    - Run `bun run scripts/bundle-api.mjs`
    - _Requirements: 12.2_

  - [x] 5.4 Write property test for Arcjet fail-closed/open behavior (Property 4)
    - In `tests/property/audit-remediation-security.test.ts`
    - **Property 4: Arcjet fail-closed in production, fail-open in development**
    - Generate random requests with mocked NODE_ENV and ARCJET_KEY states
    - **Validates: Requirements 5.1, 5.2**

- [x] 6. Checkpoint — Sprint 1 complete
  - Ensure all tests pass with `bun run test`
  - Verify `bun run scripts/bundle-api.mjs` succeeds
  - Ask the user if questions arise.


### Sprint 2 — High (Validation, Performance, Hardening)

- [x] 7. Add Zod validation for document reference resolution
  - [x] 7.1 Add resolveReferenceSchema to lib/validation/documents.ts
    - Define schema: `reference` (required string, min 1), `applicationId` (optional UUID)
    - Export from `lib/validation/index.ts`
    - _Requirements: 7.1_

  - [x] 7.2 Apply validation in handleResolveReference in api-src/documents.ts
    - Call `validateBody(resolveReferenceSchema, req, res)` before processing
    - Return 400 with field-level Zod errors on validation failure
    - Run `bun run scripts/bundle-api.mjs`
    - _Requirements: 7.2, 7.3_

  - [x] 7.3 Write property test for document reference validation (Property 5)
    - In `tests/property/audit-remediation-validation.test.ts`
    - **Property 5: Document reference validation rejects invalid input**
    - Generate random invalid bodies (missing reference, non-string, bad UUID)
    - **Validates: Requirements 7.2, 7.3**

- [x] 8. HTTP method enforcement and action validation on applications handler
  - [x] 8.1 Add top-level HTTP method allowlist in api-src/applications.ts
    - Add `ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']` check at handler entry
    - Return 405 with `Allow` header for disallowed methods
    - _Requirements: 8.1, 8.2_

  - [x] 8.2 Fix action validation timing — remove !id condition
    - Change `if (action && !id && !VALID_ACTIONS.includes(action))` to `if (action && !VALID_ACTIONS.includes(action))`
    - Invalid actions now rejected regardless of `id` presence
    - _Requirements: 11.1, 11.2_

  - [x] 8.3 Bundle API after applications.ts changes
    - Run `bun run scripts/bundle-api.mjs`
    - _Requirements: 8.1, 8.2, 11.1, 11.2_

  - [x] 8.4 Write property test for method rejection (Property 6)
    - In `tests/property/audit-remediation-validation.test.ts`
    - **Property 6: Applications handler rejects disallowed HTTP methods**
    - Generate random HTTP method strings, verify 405 for non-allowlisted
    - **Validates: Requirements 8.1, 8.2**

  - [x] 8.5 Write property test for action validation independence (Property 7)
    - In `tests/property/audit-remediation-validation.test.ts`
    - **Property 7: Action validation is independent of id parameter presence**
    - Generate random id/action combinations with invalid actions
    - **Validates: Requirements 11.1, 11.2**

- [x] 9. Database indexes migration
  - [x] 9.1 Create migrations/add_audit_remediation_indexes.sql
    - Add 6 indexes using `CREATE INDEX IF NOT EXISTS`:
      - `idx_login_attempts_email_hash_attempted_at` on `login_attempts(email_hash, attempted_at)`
      - `idx_csrf_tokens_user_id_expires_at` on `csrf_tokens(user_id, expires_at)`
      - `idx_password_reset_tokens_user_id_created_at` on `password_reset_tokens(user_id, created_at)`
      - `idx_audit_logs_action_created_at` on `audit_logs(action, created_at)`
      - `idx_applications_public_tracking_code` on `applications(public_tracking_code)`
      - `idx_application_documents_app_id_doc_type` on `application_documents(application_id, document_type)`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x] 9.2 Write unit test verifying migration file contains all indexes
    - In `tests/unit/audit-remediation-code-structure.test.ts`, read migration file and verify all 6 `CREATE INDEX IF NOT EXISTS` statements present
    - _Requirements: 10.7_

- [x] 10. SQL column allowlist in admin handler
  - [x] 10.1 Formalize column allowlist constant in api-src/admin.ts
    - Define `ALLOWED_USER_COLUMNS` as a `const` array
    - Validate any dynamic column references against the allowlist
    - Return 400 for unknown column names
    - _Requirements: 13.1, 13.2, 13.3_

  - [x] 10.2 Write property test for column allowlist (Property 8)
    - In `tests/property/audit-remediation-validation.test.ts`
    - **Property 8: Column allowlist rejects unknown columns in admin handler**
    - Generate random column name strings, verify rejection of non-allowlisted
    - **Validates: Requirements 13.1, 13.2**

- [x] 11. Fixed SQL SET clauses with COALESCE
  - [x] 11.1 Replace dynamic SET construction in handleProfile (api-src/auth.ts)
    - Use fixed `UPDATE profiles SET full_name = COALESCE($1, full_name), ...` query
    - Pass `null` for fields not in request body
    - Eliminate `join(', ')` dynamic SET construction
    - _Requirements: 14.1, 14.3_

  - [x] 11.2 Replace dynamic SET construction in interview reschedule (api-src/applications.ts)
    - Use fixed COALESCE query for interview rescheduling
    - Eliminate `join(', ')` dynamic SET construction
    - _Requirements: 14.2, 14.3_

  - [x] 11.3 Bundle API after auth.ts and applications.ts changes
    - Run `bun run scripts/bundle-api.mjs`
    - _Requirements: 14.1, 14.2, 14.3_

  - [x] 11.4 Write property test for COALESCE field preservation (Property 9)
    - In `tests/property/audit-remediation-transactions.test.ts`
    - **Property 9: Fixed COALESCE queries preserve unmodified fields**
    - Generate random subsets of profile fields, verify omitted fields unchanged
    - **Validates: Requirements 14.1, 14.2**

- [-] 12. Split large bundle chunk and reduce service worker cache limit
  - [x] 12.1 Verify tesseract.js is in separate vendor-ocr chunk in vite.config.ts
    - Confirm `manualChunks` already isolates tesseract.js
    - Add further lazy-loading splits if any chunk exceeds 2MB
    - _Requirements: 15.1, 15.2_

  - [x] 12.2 Reduce service worker precache limit in vite.config.ts
    - Change `maximumFileSizeToCacheInBytes` from 10MB to 3MB in VitePWA config
    - _Requirements: 15.3_

  - [x] 12.3 Write unit test verifying cache limit and chunk config
    - In `tests/unit/audit-remediation-config.test.ts`, verify `maximumFileSizeToCacheInBytes` ≤ 3MB
    - Verify terser config includes `drop_console: true`
    - _Requirements: 15.3, 22.1_

- [ ] 13. Checkpoint — Sprint 2 complete
  - Ensure all tests pass with `bun run test`
  - Verify `bun run scripts/bundle-api.mjs` succeeds
  - Verify `bun run build` succeeds and no chunk exceeds 2MB
  - Ask the user if questions arise.


### Sprint 3 — Medium (Documentation, Accessibility, Polish)

- [x] 14. Rate limit documentation and CSRF risk acceptance
  - [x] 14.1 Update .kiro/steering/tech.md Arcjet Rate Limits table
    - Change auth rate limit to `60 requests / 5 minutes`
    - Change admin rate limit to `60 requests / 10 minutes`
    - Match actual values in `lib/arcjet.ts`
    - _Requirements: 16.1, 16.2_

  - [x] 14.2 Add CSRF risk acceptance comment for refresh endpoint in api-src/auth.ts
    - Add inline comment at the `refresh` action documenting: refresh uses HTTP-only cookies with SameSite=Lax, CSRF-forced rotation is low-risk since attacker cannot read new tokens
    - Run `bun run scripts/bundle-api.mjs`
    - _Requirements: 17.1_

- [x] 15. Cookie documentation and security header fixes
  - [x] 15.1 Fix SameSite JSDoc in lib/auth/cookies.ts
    - Change `setAuthCookies` JSDoc from "SameSite=Strict" to "SameSite=Lax" (line ~97)
    - _Requirements: 18.1_

  - [x] 15.2 Add font-src and cross-domain header to vercel.json
    - Add `font-src 'self'` to the CSP header value
    - Add `{ "key": "X-Permitted-Cross-Domain-Policies", "value": "none" }` to security headers
    - _Requirements: 19.1, 19.2_

  - [x] 15.3 Write unit test verifying vercel.json security headers
    - In `tests/unit/audit-remediation-config.test.ts`, verify CSP includes `font-src 'self'` and `X-Permitted-Cross-Domain-Policies` header exists
    - _Requirements: 19.1, 19.2_

- [-] 16. Fix N+1 query in health check database diagnostic
  - [x] 16.1 Replace per-table COUNT(*) loop with single query in api-src/health.ts
    - Use `pg_stat_user_tables` or `information_schema` for approximate row counts in one query
    - Return equivalent information (table names + approximate counts)
    - Run `bun run scripts/bundle-api.mjs`
    - _Requirements: 20.1, 20.2_

  - [x] 16.2 Write property test for single-query health check (Property 13)
    - In `tests/property/audit-remediation-security.test.ts`
    - **Property 13: Health endpoint database check returns equivalent information in a single query**
    - Verify at most one database query is issued for any set of tables
    - **Validates: Requirements 20.1, 20.2**

- [ ] 17. Secure migrate action with audit logging
  - [x] 17.1 Add audit logging to handleMigrate in api-src/admin.ts
    - Log migration attempt to audit trail regardless of auth method (JWT or MIGRATE_SECRET)
    - Include IP address and authentication method in audit entry
    - Run `bun run scripts/bundle-api.mjs`
    - _Requirements: 21.1, 21.2_

  - [x] 17.2 Write property test for migration audit logging (Property 12)
    - In `tests/property/audit-remediation-security.test.ts`
    - **Property 12: Migration action always produces an audit log entry**
    - Generate random migration requests with JWT/secret auth
    - **Validates: Requirements 21.1, 21.2**

- [ ] 18. Verify console.log stripping in production build
  - [x] 18.1 Audit terser config in vite.config.ts
    - Verify `pure_funcs: ['console.log', 'console.info', 'console.debug']` and `drop_console: true` are present
    - Verify files listed in R22 (`usePWA.ts`, `useServiceWorkerUpdate.ts`, `useRealtime.ts`, `useErrorHandler.ts`, `cacheMonitor.ts`, `pushNotificationManager.ts`) use `console.log` that will be stripped
    - _Requirements: 22.1, 22.2_

- [x] 19. Fix AuthContext useMemo dependencies
  - [x] 19.1 Destructure individual values in src/contexts/AuthContext.tsx
    - Destructure `user`, `profile`, `loading`, `profileLoading`, `isAdmin`, `signIn`, `signUp`, `signOut`, `requestPasswordReset`, `updatePassword` from `auth`
    - List each as explicit `useMemo` dependency instead of `[auth]`
    - _Requirements: 23.1_

  - [x] 19.2 Write unit test verifying useMemo dependencies are individual values
    - In `tests/unit/audit-remediation-code-structure.test.ts`, verify `AuthContext.tsx` useMemo deps are not `[auth]`
    - _Requirements: 23.1_

- [ ] 20. ARIA live regions for form validation errors
  - [x] 20.1 Add aria-live regions to application wizard steps
    - Add `aria-live="polite"` container for validation error announcements in each wizard step component
    - Add `aria-describedby` linking inputs to their error messages
    - Target: `src/components/forms/` wizard step components
    - _Requirements: 24.1, 24.2_

  - [x] 20.2 Add aria-live regions to auth forms (login/register)
    - Add `aria-live="polite"` container for validation errors in login and register forms
    - Add `aria-describedby` linking inputs to their error messages
    - Target: `src/components/auth/` login and register components
    - _Requirements: 24.1, 24.2_

  - [x] 20.3 Write property test for ARIA live regions (Property 10)
    - In `tests/property/audit-remediation-ui.test.ts`
    - **Property 10: ARIA live regions announce form validation errors**
    - Generate random validation error states, verify aria-live and aria-describedby presence
    - **Validates: Requirements 24.1, 24.2**

- [ ] 21. Focus management on route transitions
  - [x] 21.1 Add useEffect for focus management in router layout
    - In `src/routes/` layout component, add a `useEffect` that moves focus to main content heading after route changes
    - Use `document.getElementById('main-content')` or similar focus target
    - Ensure it does not interfere with browser back/forward navigation
    - _Requirements: 25.1, 25.2_

  - [x] 21.2 Write property test for focus management (Property 11)
    - In `tests/property/audit-remediation-ui.test.ts`
    - **Property 11: Focus moves to main content after route transitions**
    - Generate random route paths, verify focus target after transition
    - **Validates: Requirement 25.1**

- [ ] 22. Fix health.ts TypeScript errors
  - [x] 22.1 Fix return type annotations in api-src/health.ts
    - Change return types from `VercelResponse` to `void` where appropriate
    - Fix Neon driver typing to use tagged template literals instead of `.query()` method
    - Run `bun run scripts/bundle-api.mjs`
    - _Requirements: 26.1, 26.2, 26.3_

  - [x] 22.2 Write unit test verifying zero TypeScript errors in health.ts
    - In `tests/unit/audit-remediation-code-structure.test.ts`, verify `api-src/health.ts` compiles without diagnostic errors
    - _Requirements: 26.1_

- [ ] 23. Final checkpoint — All sprints complete
  - Ensure all tests pass with `bun run test`
  - Verify `bun run scripts/bundle-api.mjs` succeeds
  - Verify `bun run build` succeeds
  - Verify `bun run lint` passes
  - Ask the user if questions arise.

## Notes

- Every task is mandatory — no optional tasks in this remediation
- Each task references specific requirements for traceability
- After any `api-src/` change, run `bun run scripts/bundle-api.mjs` to regenerate `api/` bundles
- Shared utilities live at project root `lib/`, not `api/lib/`
- All migrations use `IF NOT EXISTS` for idempotent re-runs
- Property tests use `fast-check` with `numRuns: 100` for security-critical properties
- Checkpoints at sprint boundaries ensure incremental validation
