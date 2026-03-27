# Requirements Document

## Introduction

This specification addresses all findings from the MIHAS Full-Stack Audit Report (2026-03-27). The audit identified 8 critical issues, 28 warnings, and 25 notes across security, database, backend/API, frontend, performance, accessibility, and code quality. All remediations must be backward-compatible, production-safe, and preserve existing functionality for the live admissions portal at apply.mihas.edu.zm.

### Prioritization

Requirements are organized into three implementation sprints based on CTO priority scoring (`Severity × Blast Radius / Cost-to-fix`):

- **Sprint 1 (Critical — ship this week):** Data integrity + security vulnerabilities that pose immediate risk
- **Sprint 2 (High — next sprint):** Input validation gaps, performance, and hardening
- **Sprint 3 (Medium — following sprint):** Documentation, accessibility, and polish

TypeScript strict mode (former R8) is moved to a separate backlog item — enabling `strictFunctionTypes` on a 500+ file codebase cascades into dozens of type errors and is a separate initiative, not a remediation task.

## Glossary

- **API_Handler**: A Vercel serverless function in `api-src/` that processes HTTP requests via query-parameter routing
- **Neon_Driver**: The `@neondatabase/serverless` HTTP driver used for all database operations
- **Arcjet_Perimeter**: The security middleware (`lib/arcjet.ts`) providing shield rules, bot detection, and rate limiting
- **Health_Endpoint**: The `api-src/health.ts` handler exposing system diagnostics via `?action=` routing
- **Auth_Handler**: The `api-src/auth.ts` handler managing login, registration, token refresh, and password reset
- **Admin_Handler**: The `api-src/admin.ts` handler managing dashboard, user, settings, and migration operations
- **Applications_Handler**: The `api-src/applications.ts` handler managing application CRUD and review operations
- **Documents_Handler**: The `api-src/documents.ts` handler managing file upload and OCR extraction
- **Validation_Pipeline**: The Zod-based input validation system in `lib/validation/`
- **RBAC_System**: Role-Based Access Control embedded in JWT tokens, enforced by `lib/auth/permissions.ts`
- **AuthContext**: The React context provider (`src/contexts/AuthContext.tsx`) managing frontend auth state

## Sprint 1 — Critical (Data Integrity + Security)

### Requirement 1: Neon Serverless Transaction Isolation (D-1) — P0

**User Story:** As a backend engineer, I want database transactions to be truly atomic, so that concurrent operations cannot observe partial transaction state (e.g., application approved but no status history record).

**Rollback Plan:** If the new Neon transaction API behaves differently, revert to the manual BEGIN/COMMIT pattern and document the isolation limitation.

#### Acceptance Criteria

1. THE Neon_Driver abstraction in `lib/db.ts` SHALL use Neon's `transaction()` API for all transactional operations instead of manual `BEGIN`/`COMMIT`/`ROLLBACK`
2. WHEN a transaction callback throws an error, THE Neon_Driver SHALL automatically rollback the transaction
3. WHEN a transaction callback completes successfully, THE Neon_Driver SHALL automatically commit the transaction
4. THE Neon_Driver SHALL remove the manual `BEGIN`/`COMMIT`/`ROLLBACK` implementation

### Requirement 2: Remove Hardcoded Admin Email Bypass (S-13, Q-4) — P0

**User Story:** As a security engineer, I want the admin route guard to rely solely on the RBAC system, so that no hardcoded backdoor exists in production.

#### Acceptance Criteria

1. THE AdminRoute component in `src/components/AdminRoute.tsx` SHALL remove the hardcoded email bypass check (line 88)
2. THE AdminRoute component SHALL determine admin access exclusively through the RBAC_System role checks

### Requirement 3: Parameterized SQL Queries in Auth Handler (S-1) — P1

**User Story:** As a security engineer, I want all SQL queries in the auth handler to use parameterized placeholders, so that no SQL injection vector exists even if constants are later refactored to dynamic values.

#### Acceptance Criteria

1. WHEN the Auth_Handler executes a login cooldown check, THE Auth_Handler SHALL use parameterized `$N` placeholders for the interval value instead of template literal interpolation (line 283)
2. WHEN the Auth_Handler executes a registration rate-limit query, THE Auth_Handler SHALL use parameterized `$N` placeholders for all interval values instead of template literal interpolation (lines 438, 447)
3. WHEN the Auth_Handler executes a password reset rate-limit query, THE Auth_Handler SHALL use parameterized `$N` placeholders for the interval value instead of template literal interpolation (line 758)
4. THE Auth_Handler SHALL contain zero instances of SQL template literal interpolation (`${...}` inside SQL strings)

### Requirement 4: Authenticated Health Endpoint Diagnostics (S-5) — P1

**User Story:** As a security engineer, I want health endpoint diagnostic actions to require admin authentication, so that database schema details, environment variable status, and error logs are not publicly accessible.

#### Acceptance Criteria

1. WHEN a request targets `?action=ping`, THE Health_Endpoint SHALL respond without requiring authentication
2. WHEN a request targets `?action=db`, `?action=env`, or `?action=errors`, THE Health_Endpoint SHALL require admin or super_admin authentication before responding
3. IF an unauthenticated request targets a protected health action, THEN THE Health_Endpoint SHALL return a 401 error

### Requirement 5: Arcjet Fail-Closed in Production (S-9) — P1

**User Story:** As a security engineer, I want Arcjet to reject all requests in production when the API key is missing, so that the security perimeter cannot be silently bypassed.

#### Acceptance Criteria

1. WHILE `NODE_ENV` equals `production`, WHEN `ARCJET_KEY` is not set, THE Arcjet_Perimeter SHALL reject all requests with a 503 error instead of passing them through
2. WHILE `NODE_ENV` does not equal `production`, WHEN `ARCJET_KEY` is not set, THE Arcjet_Perimeter SHALL log a warning and pass requests through (existing dev behavior)

### Requirement 6: Delete Dead Code — interpolateParams and Duplicate Query Builders (D-5, Q-2, Q-3) — P1

**User Story:** As a developer, I want dead code and duplicate implementations removed, so that the codebase is maintainable and dangerous unused functions cannot be accidentally invoked.

#### Acceptance Criteria

1. THE Neon_Driver in `lib/db.ts` SHALL not contain the `interpolateParams` function
2. THE Neon_Driver in `lib/db.ts` SHALL not contain the duplicate `userQueries`, `sessionQueries`, and `auditQueries` query builders
3. All callers SHALL import query builders exclusively from `lib/queries.ts`

## Sprint 2 — High (Validation, Performance, Hardening)

### Requirement 7: Zod Validation for Document Reference Resolution (S-4) — P2

**User Story:** As a security engineer, I want the document reference resolution handler to validate input through the Zod pipeline, so that no handler bypasses the validation system.

#### Acceptance Criteria

1. THE Documents_Handler SHALL define a Zod schema for the `handleResolveReference` function covering `reference` (required string) and `applicationId` (optional UUID) fields
2. WHEN the `handleResolveReference` function receives a request, THE Documents_Handler SHALL validate `req.body` against the Zod schema before processing
3. IF the validation fails, THEN THE Documents_Handler SHALL return a 400 error with field-level error details

### Requirement 8: HTTP Method Enforcement on Applications Handler (A-1) — P2

**User Story:** As a backend engineer, I want the applications handler to enforce an HTTP method allowlist at the top level, so that new actions cannot accidentally accept unintended methods.

#### Acceptance Criteria

1. THE Applications_Handler SHALL validate the HTTP method against an allowlist (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) before processing any action
2. IF the HTTP method is not in the allowlist, THEN THE Applications_Handler SHALL return a 405 error with an `Allow` header listing permitted methods

### Requirement 9: Cache Neon Connection at Module Level (D-2, P-3) — P2

**User Story:** As a backend engineer, I want the Neon connection instance cached at module level, so that connection string parsing overhead is eliminated on every query.

#### Acceptance Criteria

1. THE Neon_Driver in `lib/db.ts` SHALL create the `neon()` instance once at module level and reuse it for all queries
2. THE Neon_Driver SHALL not call `neon(connectionString)` inside `executeNeonQuery` on every invocation

### Requirement 10: Missing Database Indexes (D-3) — P2

**User Story:** As a backend engineer, I want indexes on frequently queried columns, so that login cooldown checks, CSRF validation, and audit queries perform efficiently.

#### Acceptance Criteria

1. THE database SHALL have a composite index on `login_attempts(email_hash, attempted_at)`
2. THE database SHALL have a composite index on `csrf_tokens(user_id, expires_at)`
3. THE database SHALL have a composite index on `password_reset_tokens(user_id, created_at)`
4. THE database SHALL have a composite index on `audit_logs(action, created_at)`
5. THE database SHALL have an index on `applications(public_tracking_code)`
6. THE database SHALL have a composite index on `application_documents(application_id, document_type)`
7. THE indexes SHALL be created using `CREATE INDEX IF NOT EXISTS` in a new migration file

### Requirement 11: Fix Action Validation Timing in Applications Handler (A-2) — P2

**User Story:** As a backend engineer, I want the action parameter always validated against the allowlist, so that requests with both `id` and `action` parameters cannot bypass validation.

#### Acceptance Criteria

1. THE Applications_Handler SHALL validate the `action` parameter against the allowlist regardless of whether an `id` query parameter is present
2. IF both `id` and an invalid `action` are provided, THEN THE Applications_Handler SHALL return a 400 error

### Requirement 12: Documents Rate Limit Type (A-4) — P2

**User Story:** As a security engineer, I want the documents endpoint to have a dedicated rate limit, so that file upload abuse is prevented.

#### Acceptance Criteria

1. THE Arcjet_Perimeter SHALL define a `documents` route type with a stricter rate limit (20 requests per 10 minutes)
2. THE Documents_Handler SHALL use `withArcjetProtection(handler, 'documents')` instead of `'general'`

### Requirement 13: SQL Column Allowlist in Admin Handler (S-2) — P2

**User Story:** As a security engineer, I want all dynamic SQL column names in the admin handler validated against a strict allowlist, so that column injection is impossible regardless of future code changes.

#### Acceptance Criteria

1. THE Admin_Handler SHALL define a constant allowlist of permitted column names for each dynamic SQL operation
2. WHEN a column name is not present in the allowlist, THE Admin_Handler SHALL reject the request with a 400 error
3. THE Admin_Handler SHALL use parameterized `$N` placeholders for all data values in dynamically constructed queries

### Requirement 14: Fixed SQL SET Clauses (S-3) — P2

**User Story:** As a security engineer, I want profile update and interview rescheduling queries to use fixed SQL with COALESCE for optional fields, so that dynamic SET clause construction is eliminated.

#### Acceptance Criteria

1. WHEN the Auth_Handler processes a profile update, THE Auth_Handler SHALL use a fixed query with COALESCE for optional fields instead of dynamically building SET clauses
2. WHEN the Applications_Handler processes an interview reschedule, THE Applications_Handler SHALL use a fixed query with COALESCE for optional fields instead of dynamically building SET clauses
3. THE Auth_Handler and Applications_Handler SHALL contain zero instances of dynamic `SET` clause construction via `join(', ')`

### Requirement 15: Split Large Bundle Chunk (F-2, P-1) — P2

**User Story:** As a frontend engineer, I want the largest bundle chunk reduced significantly, so that initial load times on 3G connections in Zambia are acceptable.

#### Acceptance Criteria

1. THE Bundle_Splitter SHALL dynamically import `tesseract.js` only when OCR functionality is needed, not in the main bundle
2. THE Bundle_Splitter SHALL produce no single chunk larger than 2MB after splitting
3. THE service worker precache limit in `vite.config.ts` SHALL be reduced from 10MB to 3MB

## Sprint 3 — Medium (Documentation, Accessibility, Polish)

### Requirement 16: Rate Limit Documentation Alignment (S-10) — P3

**User Story:** As a developer, I want rate limit documentation to match the actual code configuration, so that security reviews are accurate.

#### Acceptance Criteria

1. THE steering docs SHALL be updated to reflect the actual Arcjet rate limit values configured in code
2. THE Auth_Handler rate limit (60/5min) and Admin_Handler rate limit (60/10min) SHALL be documented accurately

### Requirement 17: CSRF Consideration for Refresh Token Endpoint (S-6) — P3

**User Story:** As a security engineer, I want the refresh token endpoint evaluated for CSRF protection, so that forced token rotation attacks are mitigated.

#### Acceptance Criteria

1. THE Auth_Handler SHALL either add CSRF validation to the `refresh` action, or add an inline code comment documenting the explicit risk acceptance with rationale

### Requirement 18: Cookie SameSite Documentation Fix (S-7) — P3

**User Story:** As a developer, I want cookie documentation to match the actual implementation.

#### Acceptance Criteria

1. THE cookie manager JSDoc in `lib/auth/cookies.ts` SHALL state `SameSite=Lax` instead of `SameSite=Strict`

### Requirement 19: CSP Font-Src and Cross-Domain Headers (S-11, S-12) — P3

**User Story:** As a security engineer, I want security headers to be comprehensive.

#### Acceptance Criteria

1. THE CSP header in `vercel.json` SHALL include `font-src 'self'`
2. THE security headers in `vercel.json` SHALL include `X-Permitted-Cross-Domain-Policies: none`

### Requirement 20: Fix N+1 Query in Health Check (D-4) — P3

**User Story:** As a backend engineer, I want the health check database diagnostic to use a single query instead of N+1 sequential queries.

#### Acceptance Criteria

1. WHEN the Health_Endpoint processes `?action=db`, THE Health_Endpoint SHALL retrieve table statistics using a single query against `information_schema` instead of issuing separate `COUNT(*)` queries per table
2. THE Health_Endpoint SHALL return equivalent information (table names and approximate row counts)

### Requirement 21: Secure Migrate Action in Admin Handler (A-3) — P3

**User Story:** As a security engineer, I want the admin migrate action to have additional access controls beyond a shared secret.

#### Acceptance Criteria

1. THE Admin_Handler `migrate` action SHALL require either admin JWT authentication or the `MIGRATE_SECRET` check (current behavior), plus log the migration attempt to the audit trail
2. THE audit log entry SHALL include the IP address and whether JWT or secret auth was used

### Requirement 22: Audit Console.log Statements (F-1) — P3

**User Story:** As a developer, I want production console output audited.

#### Acceptance Criteria

1. THE Vite build configuration SHALL strip `console.log`, `console.info`, and `console.debug` in production builds (verify existing terser config)
2. THE developer SHALL verify that console.log calls in `src/hooks/usePWA.ts`, `src/hooks/useServiceWorkerUpdate.ts`, `src/hooks/useRealtime.ts`, `src/hooks/useErrorHandler.ts`, `src/services/cacheMonitor.ts`, and `src/services/pushNotificationManager.ts` are stripped by terser

### Requirement 23: Fix AuthContext useMemo Dependencies (F-3) — P3

**User Story:** As a frontend engineer, I want the AuthContext memoization to be effective, so that unnecessary re-renders are prevented.

#### Acceptance Criteria

1. THE AuthContext provider SHALL destructure individual values from the auth object and list them as explicit `useMemo` dependencies instead of depending on the entire auth object reference

### Requirement 24: ARIA Live Regions for Form Validation Errors (AC-1) — P3

**User Story:** As a student using a screen reader, I want form validation errors announced automatically.

**Scope:** Application wizard (4 steps) and login/register forms only (highest traffic forms).

#### Acceptance Criteria

1. WHEN a form validation error occurs in the application wizard or auth forms, THE form component SHALL announce the error via an `aria-live="polite"` region
2. THE form components SHALL associate error messages with their input fields using `aria-describedby`

### Requirement 25: Focus Management on Route Transitions (AC-2) — P3

**User Story:** As a student using a screen reader, I want focus moved to the main content area after route transitions.

#### Acceptance Criteria

1. WHEN a route transition completes, THE routing system SHALL move focus to the main content heading or a designated focus target
2. THE focus management SHALL not interfere with browser back/forward navigation behavior

### Requirement 26: Fix Health.ts TypeScript Errors (Q-5) — P3

**User Story:** As a developer, I want the health endpoint to compile without TypeScript errors.

#### Acceptance Criteria

1. THE Health_Endpoint SHALL resolve all TypeScript diagnostic errors
2. THE Health_Endpoint return type annotations SHALL be compatible with `VercelResponse`
3. THE Health_Endpoint Neon driver typing SHALL correctly reference the query interface

## Backlog (Separate Initiative)

### TypeScript Strict Mode (Q-1) — Tracked Separately

Enabling `strictFunctionTypes` and `strictBindCallApply` on a 500+ file codebase will cascade into dozens of type errors across the entire project. This is a separate tech debt initiative requiring its own spec, not a remediation task. Track in the project backlog with a dedicated spike to assess blast radius before committing to a timeline.
