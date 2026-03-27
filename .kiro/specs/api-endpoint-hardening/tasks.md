# Implementation Plan: API Endpoint Hardening

## Overview

Systematically harden all 11 API endpoints + catch-all route by enforcing consistent security layers: shared security headers utility, action allowlists, Zod validation on unvalidated actions, method guards, CSRF enforcement, Arcjet wrapping, idempotency support, and path/UUID validation. All work is additive — no database schema changes, no new endpoints.

## Tasks

- [ ] 1. Create shared utility modules
  - [x] 1.1 Create `lib/securityHeaders.ts` with `setSecurityHeaders()` function
    - Export `setSecurityHeaders(res, options?)` that sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cache-Control: no-store` (overridable), `Referrer-Policy: strict-origin-when-cross-origin`
    - Accept optional `cacheControl` override for cacheable endpoints (e.g., catalog)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.7_

  - [x] 1.2 Create `lib/idempotency.ts` by extracting from `api-src/applications.ts`
    - Move `normalizeIdempotencyKey()`, `scopeIdempotencyKey()`, `checkIdempotencyKey()`, `storeIdempotencyKey()` into shared module
    - Validate key format: alphanumeric + colons, underscores, hyphens, max 128 chars
    - Scope keys as `{userId}:{endpoint}:{clientKey}`
    - 24-hour TTL with opportunistic cleanup of expired keys
    - Update `api-src/applications.ts` to import from `lib/idempotency.ts` instead of inline functions
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.9_

  - [x] 1.3 Create new Zod validation schemas in `lib/validation/`
    - `lib/validation/common.ts`: `uuidParamSchema`, `paginationQuerySchema`
    - `lib/validation/bootstrap.ts`: `bootstrapBodySchema` (email, password, secret)
    - `lib/validation/admin.ts`: Add `updateSettingBodySchema`, `deleteSettingQuerySchema`
    - `lib/validation/applications.ts`: Add `scheduleInterviewBodySchema`
    - `lib/validation/notifications.ts`: Add `checkDuplicateBodySchema`, `preferencesBodySchema`
    - `lib/validation/documents.ts`: Add `documentPathSchema` with path traversal prevention (reject `../`, `..\\`, `%00`, null bytes)
    - Update `lib/validation/index.ts` to re-export new schemas
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 7.3, 7.4, 7.5, 7.6_

  - [x]* 1.4 Write property tests for shared utilities
    - **Property 7: PII is sanitized from error messages** — generate random strings with embedded emails, UUIDs, JWTs, file paths, IPs, phone numbers and verify `sanitizeError()` replaces all PII
    - **Validates: Requirements 4.4**
    - **Property 16: Security headers are present on all API responses** — call `setSecurityHeaders()` on mock response and verify all four headers are set
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
    - **Property 19: Idempotency key scoping prevents cross-user collision** — for random user ID pairs and same key, verify scoped keys differ
    - **Validates: Requirements 10.4**
    - **Property 20: Idempotency key format validation** — for random strings with special chars or length > 128, verify `normalizeIdempotencyKey()` returns empty string
    - **Validates: Requirements 10.5**
    - Test file: `tests/property/api-hardening/shared-utilities.property.test.ts`

- [x] 2. Checkpoint - Ensure shared utilities compile and tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Harden low-traffic and simple endpoints
  - [x] 3.1 Harden `api-src/health.ts`
    - Wrap with `withArcjetProtection(handler, 'general')`
    - Call `setSecurityHeaders(res)` after CORS handling
    - Narrow `Access-Control-Allow-Methods` to `GET, OPTIONS` only (Req 8.5)
    - Add action allowlist validation: `ping`, `db`, `env`, `errors`, or default health check
    - _Requirements: 3.2, 8.1, 8.2, 8.3, 8.4, 8.5, 7.1, 7.2_

  - [x] 3.2 Harden `api-src/bootstrap.ts`
    - Wrap with `withArcjetProtection(handler, 'admin')`
    - Call `setSecurityHeaders(res)` after CORS handling
    - Add CSRF enforcement via `requireCsrf(req, res)` on POST
    - Replace manual body validation with `bootstrapBodySchema` Zod validation
    - Enforce POST-only method guard at top level
    - Ensure all responses use `sendError()`/`sendSuccess()` envelope
    - _Requirements: 3.3, 11.1, 11.2, 11.3, 11.4, 11.5, 2.5, 1.1_

  - [x] 3.3 Harden `api-src/[...path].ts`
    - Wrap with `withArcjetProtection(handler, 'general')`
    - Call `setSecurityHeaders(res)` after CORS handling
    - Verify 404 response uses Error_Envelope and does not leak internal info
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 8.1, 8.2, 8.3, 8.4_

  - [x]* 3.4 Write property tests for simple endpoint hardening
    - **Property 2: Unrecognized actions are rejected with descriptive errors** — generate random action strings not in health allowlist, verify HTTP 400 with valid action list in error
    - **Validates: Requirements 1.4, 7.1, 7.2**
    - **Property 23: Catch-all route does not leak internal information** — generate random URL paths, verify 404 response contains no file paths, endpoint names, or stack traces
    - **Validates: Requirements 13.4**
    - Test file: `tests/property/api-hardening/simple-endpoints.property.test.ts`

- [ ] 4. Harden authenticated endpoints (Group A: payments, catalog, sessions)
  - [x] 4.1 Harden `api-src/payments.ts`
    - Call `setSecurityHeaders(res)` after CORS handling
    - Add CSRF enforcement via `requireCsrf(req, res)` (currently missing)
    - Verify method guard (GET-only) is in place
    - Add action allowlist validation: `receipt`
    - _Requirements: 2.1, 8.1, 8.2, 8.3, 8.4, 6.5, 7.1_

  - [x] 4.2 Harden `api-src/catalog.ts`
    - Call `setSecurityHeaders(res)` after CORS handling
    - For public GET data, use `setSecurityHeaders(res, { cacheControl: 'public, max-age=300' })` (Req 8.6)
    - Add top-level method guard rejecting methods other than GET, POST, PUT, DELETE
    - Verify `type` query parameter validation against allowlist: `programs`, `intakes`, `subjects`, `institutions`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6, 6.4, 7.7_

  - [x] 4.3 Harden `api-src/sessions.ts`
    - Call `setSecurityHeaders(res)` after CORS handling
    - Add action allowlist validation: `list`, `track`, `revoke`, `revoke-all`, `connect`, `poll`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 7.1, 7.2_

  - [x]* 4.4 Write property tests for Group A endpoints
    - **Property 11: Unsupported HTTP methods are rejected** — for catalog endpoint, generate random HTTP methods not in GET/POST/PUT/DELETE, verify 405
    - **Validates: Requirements 6.1**
    - **Property 15: Catalog type parameter is validated against allowlist** — generate random strings not in programs/intakes/subjects/institutions, verify 400
    - **Validates: Requirements 7.7**
    - Test file: `tests/property/api-hardening/group-a-endpoints.property.test.ts`

- [x] 5. Checkpoint - Ensure all hardened endpoints compile and tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Harden complex endpoints (Group B: admin, applications, notifications)
  - [x] 6.1 Harden `api-src/admin.ts`
    - Call `setSecurityHeaders(res)` after CORS handling
    - Add action allowlist validation at top of handler (before auth): `dashboard`, `users`, `user-permissions`, `settings`, `register`, `stats`, `errors`, `bulk-email`, `bulk-status`, `export-users`, `migrate`, `set-password`, `import-settings`, `reset-settings`, `eligibility-rules`, `update-role`, `eligibility-assessments`, `audit-log`, `appeals`, `schema`
    - Replace raw `req.body` cast in `handleUpdateSetting` with `updateSettingBodySchema` Zod validation
    - Replace raw `req.body`/`req.query` in `handleDeleteSetting` with `deleteSettingQuerySchema` Zod validation
    - Validate `userId` query parameter as UUID format where used (e.g., deactivate user)
    - _Requirements: 1.4, 1.6, 1.7, 7.1, 7.2, 7.5, 8.1, 8.2, 8.3, 8.4_

  - [x] 6.2 Harden `api-src/applications.ts`
    - Call `setSecurityHeaders(res)` after CORS handling
    - Add action allowlist validation: `details`, `documents`, `grades`, `summary`, `review`, `interviews`, `schedule-interview`, `stats`, `export`, `email-slip`, `versions`, `track`
    - Replace manual field checks in `handleScheduleInterview` with `scheduleInterviewBodySchema` Zod validation
    - Validate `id` query parameter as UUID format using `uuidParamSchema`
    - Validate `page`/`pageSize` query parameters using `paginationQuerySchema`
    - _Requirements: 1.4, 1.5, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4_

  - [x] 6.3 Harden `api-src/notifications.ts`
    - Call `setSecurityHeaders(res)` after CORS handling
    - Add action allowlist validation: `preferences`, `history`, `list`, `mark-read`, `mark-all-read`, `delete`, `check-duplicate`, `create`, `send`, `push-subscribe`, `push-send`
    - Replace raw `req.body` destructuring in `handleCheckDuplicate` with `checkDuplicateBodySchema` Zod validation
    - Replace raw `req.body` destructuring in `handlePreferences` POST with `preferencesBodySchema` Zod validation
    - _Requirements: 1.4, 1.8, 1.9, 7.1, 7.2, 8.1, 8.2, 8.3, 8.4_

  - [x]* 6.4 Write property tests for Group B endpoints
    - **Property 1: Invalid input payloads are rejected with structured errors** — generate random invalid payloads for `scheduleInterviewBodySchema`, `updateSettingBodySchema`, `checkDuplicateBodySchema`, `preferencesBodySchema`, verify HTTP 400 with fieldErrors
    - **Validates: Requirements 1.1, 1.2, 1.3**
    - **Property 12: UUID parameters reject non-UUID strings** — generate random non-UUID strings, verify validation rejects them
    - **Validates: Requirements 7.3, 7.5**
    - **Property 13: Pagination parameters are validated** — generate random non-positive-integer or out-of-bounds values for page/pageSize, verify rejection or clamping
    - **Validates: Requirements 7.4**
    - Test file: `tests/property/api-hardening/group-b-endpoints.property.test.ts`

- [ ] 7. Harden remaining endpoints (Group C: email, documents)
  - [x] 7.1 Harden `api-src/email.ts`
    - Call `setSecurityHeaders(res)` after CORS handling
    - Add top-level method guard: reject methods other than GET and POST before action dispatch
    - Add action allowlist validation: `send`, `process-queue`, `retry-failed`, `queue-status`
    - Add idempotency support on `send` action using shared `lib/idempotency.ts`
    - _Requirements: 6.2, 7.1, 7.2, 8.1, 8.2, 8.3, 8.4, 10.7_

  - [x] 7.2 Harden `api-src/documents.ts`
    - Call `setSecurityHeaders(res)` after CORS handling
    - Add action allowlist validation: `upload`, `extract`, `download`, `delete`, `signed-url`, `register-slip`, `resolve-reference`
    - Add path traversal validation on `path` query parameter using `documentPathSchema` (reject `../`, `..\\`, `%00`)
    - Validate `handleRegisterSlip` body with Zod schema (Req 5.6)
    - _Requirements: 7.1, 7.2, 7.6, 5.6, 8.1, 8.2, 8.3, 8.4_

  - [x]* 7.3 Write property tests for Group C endpoints
    - **Property 14: Path traversal patterns are rejected** — generate random paths containing `../`, `..\\`, `%00`, encoded variants, verify 400 rejection
    - **Validates: Requirements 7.6**
    - **Property 18: Idempotency key round-trip** — for random valid keys, verify store then check returns cached response
    - **Validates: Requirements 10.1, 10.2, 10.3**
    - Test file: `tests/property/api-hardening/group-c-endpoints.property.test.ts`

- [x] 8. Checkpoint - Ensure all endpoints compile and tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Cross-cutting validation and response envelope tests
  - [x] 9.1 Verify middleware composition order across all endpoints
    - Audit each endpoint to confirm order: CORS → Security Headers → Arcjet → CSRF → Auth → Method Guard → Input Validation → Business Logic
    - Ensure short-circuit behavior: each middleware layer returns immediately on rejection without executing subsequent layers
    - _Requirements: 12.1, 12.2_

  - [x]* 9.2 Write property tests for response envelope and CSRF
    - **Property 3: CSRF enforcement on state-changing requests** — for random invalid/missing CSRF tokens on POST/PUT/PATCH/DELETE, verify 403 with code `CSRF_VALIDATION_FAILED`
    - **Validates: Requirements 2.1, 2.2, 2.3**
    - **Property 4: Error responses follow the envelope format** — for random error scenarios, verify response matches `{ success: false, error: string, code: string }`
    - **Validates: Requirements 4.1**
    - **Property 5: Success responses follow the envelope format** — for random success scenarios, verify response matches `{ success: true, data: T }`
    - **Validates: Requirements 4.2**
    - **Property 6: Unexpected errors produce generic 500 responses** — for random Error objects, verify 500 with code `INTERNAL_ERROR` and no stack traces
    - **Validates: Requirements 4.3**
    - **Property 24: Content-Type is application/json on all responses** — verify `Content-Type` header on `sendSuccess()` and `sendError()` calls
    - **Validates: Requirements 4.6**
    - Test file: `tests/property/api-hardening/response-envelope.property.test.ts`

  - [x]* 9.3 Write property tests for auth and session validation
    - **Property 8: Unauthenticated requests to protected endpoints are rejected** — verify 401 with code `AUTHENTICATION_REQUIRED` when no token present
    - **Validates: Requirements 5.1**
    - **Property 9: Insufficient role access is rejected** — verify 403 with code `INSUFFICIENT_PERMISSIONS` for wrong roles
    - **Validates: Requirements 5.2**
    - **Property 10: Reviewer role is blocked from write operations** — verify 403 for reviewer on POST/PUT/PATCH/DELETE to applications
    - **Validates: Requirements 5.5**
    - **Property 17: Revoked sessions are rejected** — verify 401 with code `SESSION_REVOKED` for inactive sessions
    - **Validates: Requirements 9.1, 9.2**
    - Test file: `tests/property/api-hardening/auth-session.property.test.ts`

  - [x]* 9.4 Write property test for log sanitization
    - **Property 22: Blocked request logs contain no PII** — generate random log messages with PII, verify sanitized output contains no emails, tokens, IPs, or phone numbers
    - **Validates: Requirements 12.4**
    - Test file: `tests/property/api-hardening/log-sanitization.property.test.ts`

- [ ] 10. Bundle and final checkpoint
  - [x] 10.1 Run `bun run scripts/bundle-api.mjs` to bundle all modified `api-src/` files to `api/`
    - Verify bundle completes without errors
    - Verify all 12 bundled files are present in `api/`

  - [x] 10.2 Final checkpoint - Ensure all tests pass
    - Run `bun run vitest --run tests/property/api-hardening/` to verify all property tests
    - Run `bun run vitest --run` to verify no regressions
    - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The middleware composition order (CORS → Security Headers → Arcjet → CSRF → Auth → Method Guard → Input Validation → Business Logic) must be followed in every endpoint
- All source edits are in `api-src/` — run the bundle script before deployment
- No database schema changes are needed — `idempotency_keys` table already exists
