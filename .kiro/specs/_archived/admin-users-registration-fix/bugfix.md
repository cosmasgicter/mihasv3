# Bugfix Requirements Document

## Introduction

Multiple production bugs are affecting the MIHAS admissions portal (apply.mihas.edu.zm) across several API endpoints. These range from critical HTTP 500 errors that completely break admin user management and silently drop registration audit trails, to CORS misconfigurations that cause 403 Forbidden errors on all state-changing PATCH requests, to a pervasive Node.js deprecation warning that floods logs across every API endpoint. The bugs span `api-src/admin.ts`, `api-src/auth.ts`, `lib/arcjet.ts`, and potentially dependency code. All issues were identified from production Vercel function logs.

## Bug Analysis

### Current Behavior (Defect)

**Admin Users Endpoint — SQL Parameterization (HTTP 500)**

1.1 WHEN an admin requests the users list via `GET /api/admin?action=users` without role or search filters THEN the system returns HTTP 500 with error "bind message supplies 2 parameters, but prepared statement requires 0" because the SQL query in `handleUsers()` at `api-src/admin.ts` line ~647 uses JavaScript template literal interpolation (`LIMIT ${paramIndex} OFFSET ${paramIndex + 1}`) which embeds the literal values of `paramIndex` (e.g. `LIMIT 1 OFFSET 2`) into the SQL string instead of creating `$N` placeholders, while `limit` and `offset` are still appended to the bind params array, causing a parameter count mismatch.

1.2 WHEN an admin requests the users list via `GET /api/admin?action=users` with a role filter but no search filter THEN the system returns HTTP 500 with error "bind message supplies 3 parameters, but prepared statement requires 1" because `paramIndex` is 2 after the role filter, so the SQL embeds `LIMIT 2 OFFSET 3` as literal text while the params array contains `[role, limit, offset]` — 3 params but only 1 placeholder (`$1` for role).

1.3 WHEN an admin requests the users list via `GET /api/admin?action=users` with both role and search filters THEN the system returns HTTP 500 with error "bind message supplies 4 parameters, but prepared statement requires 2" due to the same template literal interpolation bug — `paramIndex` is 3, so SQL has `LIMIT 3 OFFSET 4` as literal text while params array has `[role, search, limit, offset]`.

1.4 WHEN the admin users list 500 error occurs THEN the admin dashboard user management page is completely non-functional on every page load, for every filter combination, blocking all administrative user management operations.

**Registration — VARCHAR Overflow (Silent Audit Trail Failure)**

1.5 WHEN a new user registers via `POST /api/auth?action=register` THEN the `recordRegistrationAttempt()` function at `api-src/auth.ts` line ~775 inserts `reg:${ipHash}` into the `email_hash` column, where `ipHash` is a 64-character SHA-256 hex digest, producing a 68-character string (`reg:` prefix = 4 chars + 64 chars = 68 chars) that exceeds the `login_attempts.email_hash` column's `VARCHAR(64)` limit, causing the INSERT to fail with "value too long for type character varying(64)".

1.6 WHEN the `recordRegistrationAttempt()` INSERT fails due to VARCHAR overflow THEN the error is caught silently (logged to console but not propagated), so the registration itself succeeds with HTTP 201 but the audit trail entry is missing from `login_attempts`, creating a security blind spot where registration attempts are not tracked.

1.7 WHEN the `checkRegistrationRateLimit()` function at `api-src/auth.ts` line ~748 queries `login_attempts` with `WHERE email_hash = $1` using the same `reg:${ipHash}` value THEN it finds zero matching rows (because the INSERT always fails), so the IP-based registration rate limit (3 per IP per 10 minutes) is never enforced via the database fallback mechanism, allowing unlimited registrations from the same IP if Arcjet rate limiting is unavailable.

**CORS/CSRF — Missing Header in Arcjet Preflight (403 on PATCH)**

1.8 WHEN a browser sends a CORS preflight OPTIONS request before a PATCH request to any API endpoint (e.g. `/api/applications`) THEN the `withArcjetProtection()` wrapper in `lib/arcjet.ts` line ~229 intercepts the OPTIONS request and responds with `Access-Control-Allow-Headers: 'Content-Type, Authorization'` — missing the `X-CSRF-Token` header — before `handleCors()` from `lib/cors.ts` is ever called.

1.9 WHEN the Arcjet preflight response omits `X-CSRF-Token` from `Access-Control-Allow-Headers` THEN the browser blocks the subsequent PATCH request that includes the `X-CSRF-Token` header because the preflight did not authorize it, resulting in a 403 Forbidden error on the client side for all PATCH requests to protected endpoints.

1.10 WHEN the Arcjet preflight response omits `X-CSRF-Token` from `Access-Control-Allow-Headers` THEN it also omits the `Access-Control-Expose-Headers: X-CSRF-Token` header that `lib/cors.ts` normally sets, preventing the browser from reading the `X-CSRF-Token` response header on non-preflight requests that pass through the Arcjet wrapper's early OPTIONS return.

1.11 WHEN multiple PATCH requests to `/api/applications` are rejected with 403 THEN student application updates (draft saves, grade syncs, status changes) fail silently or show errors, potentially causing data loss for in-progress applications.

**Node.js Deprecation Warning — url.parse() (Log Noise + Security)**

1.12 WHEN any API endpoint is called (`/api/catalog`, `/api/applications`, `/api/sessions`, `/api/notifications`, `/api/admin`, `/api/auth`, `/api/health`, `/api/documents`, `/api/payments`) THEN the Vercel function logs emit `[DEP0169] DeprecationWarning: url.parse() is deprecated` on every single request, indicating that either a dependency (likely `@vercel/node`, `@arcjet/node`, or `@neondatabase/serverless`) or the Node.js runtime itself is using the legacy `url.parse()` API internally.

1.13 WHEN the `url.parse()` deprecation warning fires on every request THEN it floods the production logs with noise, making it significantly harder to identify and diagnose real errors (such as the 500s and 403s described above) among the warning messages.

1.14 WHEN the deprecated `url.parse()` function is used (by a dependency) THEN it poses a potential security concern because `url.parse()` has known hostname spoofing vulnerabilities that the WHATWG `URL` constructor does not have, though the actual risk depends on how the dependency uses the parsed result.

### Expected Behavior (Correct)

**Admin Users Endpoint — SQL Parameterization**

2.1 WHEN an admin requests the users list via `GET /api/admin?action=users` without role or search filters THEN the system SHALL return HTTP 200 with a paginated list of users, using proper `$N` SQL parameter placeholders for LIMIT and OFFSET (e.g. `LIMIT $1 OFFSET $2`) so the bind parameter count matches the placeholder count exactly.

2.2 WHEN an admin requests the users list via `GET /api/admin?action=users` with a role filter but no search filter THEN the system SHALL return HTTP 200 with a filtered, paginated list of users, with LIMIT and OFFSET using `$N` placeholders that correctly follow the role parameter's placeholder index.

2.3 WHEN an admin requests the users list via `GET /api/admin?action=users` with both role and search filters THEN the system SHALL return HTTP 200 with a filtered, paginated list of users, with all `$N` placeholders sequentially numbered and matching the bind parameter array length.

2.4 WHEN the admin users list endpoint is fixed THEN the admin dashboard user management page SHALL be fully functional for all filter combinations (no filters, role only, search only, role + search), returning correct paginated results on every page load.

**Registration — VARCHAR Overflow**

2.5 WHEN a new user registers via `POST /api/auth?action=register` THEN the system SHALL successfully record the registration attempt in the `login_attempts` table with an `email_hash` value that fits within the `VARCHAR(64)` column limit, either by truncating/hashing the prefixed value to 64 characters or by altering the column to accommodate the prefix.

2.6 WHEN the `recordRegistrationAttempt()` function stores a registration attempt THEN the audit trail entry SHALL be present in `login_attempts` for every successful registration, with no silent failures.

2.7 WHEN the `checkRegistrationRateLimit()` function queries `login_attempts` for registration attempts from a given IP THEN it SHALL find matching rows and correctly enforce the 3-per-IP-per-10-minutes rate limit via the database fallback mechanism, using the same key format that `recordRegistrationAttempt()` stores.

**CORS/CSRF — Arcjet Preflight Headers**

2.8 WHEN a browser sends a CORS preflight OPTIONS request to any API endpoint THEN the response SHALL include `X-CSRF-Token` in the `Access-Control-Allow-Headers` header, matching the headers listed in `lib/cors.ts` (`Content-Type, Authorization, X-CSRF-Token`).

2.9 WHEN a browser sends a CORS preflight OPTIONS request to any API endpoint THEN the response SHALL include `Access-Control-Expose-Headers: X-CSRF-Token` so the browser can read CSRF tokens from response headers.

2.10 WHEN a browser sends a PATCH request to `/api/applications` with a valid `X-CSRF-Token` header THEN the request SHALL NOT be blocked by CORS preflight failure and SHALL proceed to the handler for normal authentication, CSRF validation, and ownership checks.

2.11 WHEN PATCH requests to `/api/applications` succeed THEN student application updates (draft saves, grade syncs, status changes) SHALL complete successfully without 403 errors caused by CORS misconfiguration.

**Node.js Deprecation Warning — url.parse()**

2.12 WHEN any API endpoint is called THEN the system SHALL either suppress the `[DEP0169]` deprecation warning via `process.removeAllListeners('warning')` filtering or by replacing the `url.parse()` call if it originates from application code, reducing log noise in production.

2.13 WHEN the deprecation warning is addressed THEN production logs SHALL be cleaner, making it easier to identify and diagnose real errors without wading through repeated deprecation warnings on every request.

2.14 WHEN the source of the `url.parse()` usage is identified THEN the system SHALL document whether it originates from application code (fixable directly) or a dependency (requires suppression or dependency update), and apply the appropriate mitigation.

### Unchanged Behavior (Regression Prevention)

**Admin Users Endpoint**

3.1 WHEN an admin requests the users list with valid pagination parameters THEN the system SHALL CONTINUE TO return the correct page of results with proper `totalCount`, `page`, `pageSize`, and `totalPages` metadata.

3.2 WHEN an admin requests the users list with the `includeInactive=true` parameter THEN the system SHALL CONTINUE TO include deactivated users in the results.

3.3 WHEN the count query for the admin users list is executed THEN the system SHALL CONTINUE TO return the correct total count of matching users for pagination metadata, using the same WHERE clause filters as the data query but without LIMIT/OFFSET.

3.4 WHEN an admin performs PUT/POST/DELETE operations on the users endpoint THEN the system SHALL CONTINUE TO route to `handleUpdateUser` and `handleDeactivateUser` respectively without being affected by the LIMIT/OFFSET fix.

**Registration and Login Attempts**

3.5 WHEN the `recordLoginAttempt()` function is called during normal login flows THEN the system SHALL CONTINUE TO correctly store the SHA-256 hashed email (exactly 64 hex characters, no prefix) and IP values in the `login_attempts` table without truncation or format changes.

3.6 WHEN the `checkLoginCooldown()` and `checkAccountLockout()` functions query the `login_attempts` table THEN the system SHALL CONTINUE TO correctly identify login attempts by email hash and enforce progressive backoff (5 failures → 15-min cooldown) and account lockout (10 consecutive failures → 30-min lock).

3.7 WHEN a user registers successfully THEN the system SHALL CONTINUE TO return HTTP 201 with the user profile, tokens, and CSRF token, regardless of whether the audit trail recording succeeds or fails.

3.8 WHEN the Arcjet registration rate limit is active THEN the system SHALL CONTINUE TO enforce the Arcjet-level rate limit (3 per IP per 10 minutes) independently of the database fallback rate limit.

**CORS and Security**

3.9 WHEN a CORS preflight OPTIONS request is received THEN the system SHALL CONTINUE TO return HTTP 204 with appropriate CORS headers and SHALL CONTINUE TO bypass Arcjet protection for OPTIONS requests (preventing preflight from being blocked as "bot").

3.10 WHEN a non-OPTIONS request is received THEN the system SHALL CONTINUE TO apply Arcjet shield rules, bot detection, and rate limiting before the handler executes.

3.11 WHEN a state-changing request (POST/PATCH/PUT/DELETE) is received without a valid CSRF token THEN the system SHALL CONTINUE TO reject it with 403 and code `CSRF_VALIDATION_FAILED`.

3.12 WHEN Arcjet blocks a request (shield, bot, rate limit) THEN the system SHALL CONTINUE TO return 403 with code `SECURITY_VIOLATION` and log the block reason.

3.13 WHEN the `handleCors()` function in `lib/cors.ts` sets CORS headers on non-OPTIONS requests THEN the system SHALL CONTINUE TO set the full set of headers including `Access-Control-Expose-Headers: X-CSRF-Token`.

**General API Behavior**

3.14 WHEN any API endpoint returns a successful response THEN the system SHALL CONTINUE TO wrap it in the `{ success: true, data: ... }` envelope via `sendSuccess()`.

3.15 WHEN any API endpoint encounters an error THEN the system SHALL CONTINUE TO return sanitized error responses via `sendError()` without exposing stack traces or internal state.
