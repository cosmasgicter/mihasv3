# Requirements Document

## Introduction

Comprehensive API endpoint hardening for the MIHAS admissions portal (https://apply.mihas.edu.zm). This feature systematically addresses security gaps across all 11 API endpoints in `api-src/`, ensuring consistent input validation, CSRF protection, rate limiting, error handling, auth enforcement, method validation, query parameter sanitization, security headers, session validation, and idempotency support. The portal serves real students and administrators in Zambia and must meet production-grade security standards.                           
## Glossary

- **Endpoint**: A Vercel serverless function in `api-src/` that handles HTTP requests via query parameter routing (`?action=xxx`)
- **Action**: A sub-route within an endpoint, dispatched via the `action` query parameter
- **Hardening_Layer**: A cross-cutting security concern applied uniformly across all endpoints
- **Validation_Middleware**: The Zod-based `validateBody`/`validateQuery` functions from `lib/validation/middleware.ts`
- **CSRF_Guard**: The `requireCsrf` middleware from `lib/csrf.ts` that validates SHA-256 hashed tokens on state-changing requests
- **Arcjet_Shield**: The `withArcjetProtection` wrapper from `lib/arcjet.ts` providing shield rules, bot detection, and rate limiting
- **Auth_Middleware**: The `requireAuth`/`requireRole` functions from `lib/auth/middleware.ts`
- **Error_Envelope**: The standardized `{ success, data/error, code }` JSON response format from `lib/errorHandler.ts`
- **Method_Guard**: Explicit validation that an endpoint action only accepts its declared HTTP methods
- **Security_Header**: HTTP response headers that mitigate common web attacks (CSP, HSTS, X-Frame-Options, etc.)
- **Idempotency_Key**: A client-supplied key in the `Idempotency-Key` header used to deduplicate state-changing requests
- **Session_Validator**: Logic that confirms a user's tracked session is still active before processing requests

## Requirements

### Requirement 1: Uniform Zod Input Validation

**User Story:** As a security engineer, I want all API endpoint actions to validate inputs through Zod schemas, so that malformed or malicious payloads are rejected before reaching business logic.

#### Acceptance Criteria

1. WHEN a POST, PUT, PATCH, or DELETE request is received by any endpoint action, THE Validation_Middleware SHALL parse the request body against the corresponding Zod schema before executing business logic
2. WHEN a GET request includes query parameters used for filtering or pagination, THE Validation_Middleware SHALL parse those parameters against a Zod schema
3. IF the Zod validation fails, THEN THE Validation_Middleware SHALL return HTTP 400 with field-level error messages in the Error_Envelope format
4. THE Validation_Middleware SHALL validate the `action` query parameter against an allowlist of known actions for each endpoint
5. WHEN the `handleScheduleInterview` action in `applications.ts` receives a POST request, THE Validation_Middleware SHALL validate the body using a Zod schema instead of manual field checks
6. WHEN the `handleUpdateSetting` action in `admin.ts` receives a PUT request, THE Validation_Middleware SHALL validate the body using a Zod schema instead of raw `req.body` casting
7. WHEN the `handleDeleteSetting` action in `admin.ts` receives a DELETE request, THE Validation_Middleware SHALL validate the identifier using a Zod schema
8. WHEN the `handleCheckDuplicate` action in `notifications.ts` receives a POST request, THE Validation_Middleware SHALL validate the body using a Zod schema instead of manual destructuring
9. WHEN the `handlePreferences` POST action in `notifications.ts` receives a request, THE Validation_Middleware SHALL validate the body using a Zod schema instead of raw destructuring


### Requirement 2: Consistent CSRF Protection

**User Story:** As a security engineer, I want all state-changing endpoints to enforce CSRF token validation, so that cross-site request forgery attacks are prevented.

#### Acceptance Criteria

1. THE CSRF_Guard SHALL validate the `X-CSRF-Token` header on all POST, PUT, PATCH, and DELETE requests from authenticated users
2. WHEN a state-changing request is missing the `X-CSRF-Token` header, THE CSRF_Guard SHALL return HTTP 403 with code `CSRF_VALIDATION_FAILED`
3. WHEN a state-changing request contains an invalid or expired CSRF token, THE CSRF_Guard SHALL return HTTP 403 with code `CSRF_VALIDATION_FAILED`
4. THE `health.ts` endpoint SHALL remain exempt from CSRF validation since it only serves GET requests
5. THE `bootstrap.ts` endpoint SHALL enforce CSRF validation on POST requests when the caller is authenticated
6. WHILE the `auth.ts` endpoint processes login, register, logout, forgot-password, reset-password, or refresh actions, THE CSRF_Guard SHALL skip validation for those unauthenticated or stale-session-safe actions

### Requirement 3: Comprehensive Rate Limiting

**User Story:** As a security engineer, I want all endpoints to have appropriate Arcjet rate limiting, so that abuse and denial-of-service attacks are mitigated.

#### Acceptance Criteria

1. THE Arcjet_Shield SHALL wrap every exported endpoint handler with route-type-specific rate limits
2. WHEN the `health.ts` endpoint receives requests, THE Arcjet_Shield SHALL apply rate limiting to prevent health-check abuse
3. WHEN the `bootstrap.ts` endpoint receives requests, THE Arcjet_Shield SHALL apply rate limiting to prevent repeated database seeding
4. THE Arcjet_Shield SHALL apply the `admin` rate limit profile (60 requests per 10 minutes) to the `admin.ts` endpoint
5. THE Arcjet_Shield SHALL apply the `auth` rate limit profile (60 requests per 5 minutes) to the `auth.ts` endpoint
6. THE Arcjet_Shield SHALL apply the `session` rate limit profile (30 requests per 10 minutes) to the `sessions.ts` endpoint
7. WHEN the `applications.ts` endpoint receives a public tracking request (`?action=track`), THE Arcjet_Shield SHALL apply the `session` rate limit profile separately from authenticated application flows
8. IF the Arcjet service is unavailable, THEN THE Arcjet_Shield SHALL fail secure by returning HTTP 503 with code `SECURITY_SERVICE_ERROR`

### Requirement 4: Uniform Error Response Format

**User Story:** As a frontend developer, I want all API endpoints to return errors in a consistent envelope format, so that the client can handle errors uniformly.

#### Acceptance Criteria

1. THE Error_Envelope SHALL format all error responses as `{ success: false, error: string, code: string }` with sanitized messages
2. THE Error_Envelope SHALL format all success responses as `{ success: true, data: T }`
3. IF an unexpected error occurs in any endpoint, THEN THE Error_Envelope SHALL return HTTP 500 with a generic message and code `INTERNAL_ERROR` without exposing stack traces
4. THE Error_Envelope SHALL sanitize all error messages to remove PII (emails, UUIDs, tokens, file paths, IP addresses, phone numbers) before including them in responses
5. WHEN the `health.ts` endpoint encounters an error, THE Error_Envelope SHALL use `sendError` instead of raw `res.status().json()` for consistency
6. THE Error_Envelope SHALL set the `Content-Type: application/json` header on all error and success responses

### Requirement 5: Consistent Auth Middleware Enforcement

**User Story:** As a security engineer, I want all protected endpoint actions to enforce authentication and authorization consistently, so that unauthorized access is prevented.

#### Acceptance Criteria

1. WHEN an unauthenticated request reaches a protected endpoint action, THE Auth_Middleware SHALL return HTTP 401 with code `AUTHENTICATION_REQUIRED`
2. WHEN an authenticated user with insufficient role accesses an admin-only action, THE Auth_Middleware SHALL return HTTP 403 with code `INSUFFICIENT_PERMISSIONS`
3. THE `handleDocuments` and `handleGrades` actions in `applications.ts` SHALL enforce authentication before returning data
4. THE `handleSummary` action in `applications.ts` SHALL enforce authentication before returning application summary data
5. WHILE a reviewer-role user accesses the `applications.ts` endpoint, THE Auth_Middleware SHALL block all write operations (POST, PUT, PATCH, DELETE) with HTTP 403
6. THE `handleRegisterSlip` action in `documents.ts` SHALL validate the request body using a Zod schema before processing
7. WHEN the `admin.ts` endpoint processes the `migrate` action with a valid `MIGRATE_SECRET`, THE Auth_Middleware SHALL allow the request without standard role checks

### Requirement 6: Explicit HTTP Method Validation

**User Story:** As a security engineer, I want all endpoint actions to explicitly reject unexpected HTTP methods, so that method-based attacks are prevented.

#### Acceptance Criteria

1. WHEN an endpoint action receives an HTTP method it does not support, THE Method_Guard SHALL return HTTP 405 with the message "Method not allowed"
2. THE `email.ts` endpoint handler SHALL validate the HTTP method at the top level before dispatching to action handlers
3. THE `notifications.ts` endpoint handler SHALL validate the HTTP method for the `preferences` action, rejecting methods other than GET and POST
4. THE `catalog.ts` endpoint handler SHALL reject HTTP methods other than GET, POST, PUT, and DELETE at the top level
5. THE `payments.ts` endpoint handler SHALL reject HTTP methods other than GET at the top level before action dispatch
6. WHEN the `applications.ts` endpoint receives a request without a recognized action or ID, THE Method_Guard SHALL reject methods other than GET and POST

### Requirement 7: Query Parameter Sanitization

**User Story:** As a security engineer, I want all query parameters to be validated and sanitized, so that injection attacks via URL parameters are prevented.

#### Acceptance Criteria

1. WHEN an endpoint reads the `action` query parameter, THE Endpoint SHALL validate it against an explicit allowlist of known action values
2. IF an unrecognized `action` value is provided, THEN THE Endpoint SHALL return HTTP 400 with a descriptive error listing valid actions
3. WHEN the `applications.ts` endpoint reads the `id` query parameter, THE Validation_Middleware SHALL validate it as a valid UUID format
4. WHEN the `applications.ts` endpoint reads pagination parameters (`page`, `pageSize`), THE Validation_Middleware SHALL validate them as positive integers with upper bounds
5. WHEN the `admin.ts` endpoint reads the `userId` query parameter for user deactivation, THE Validation_Middleware SHALL validate it as a valid UUID format
6. WHEN the `documents.ts` endpoint reads the `path` query parameter, THE Validation_Middleware SHALL validate it against path traversal patterns (e.g., `../`, null bytes)
7. WHEN the `catalog.ts` endpoint reads the `type` query parameter, THE Validation_Middleware SHALL validate it against the allowlist: programs, intakes, subjects, institutions


### Requirement 8: Security Response Headers

**User Story:** As a security engineer, I want all API responses to include consistent security headers, so that common web attacks are mitigated at the transport layer.

#### Acceptance Criteria

1. THE Hardening_Layer SHALL add `X-Content-Type-Options: nosniff` to all API responses
2. THE Hardening_Layer SHALL add `X-Frame-Options: DENY` to all API responses
3. THE Hardening_Layer SHALL add `Cache-Control: no-store` to all authenticated API responses unless explicitly overridden for cacheable data
4. THE Hardening_Layer SHALL add `Referrer-Policy: strict-origin-when-cross-origin` to all API responses
5. THE `health.ts` endpoint SHALL set `Access-Control-Allow-Methods` to `GET, OPTIONS` only, not the full method set
6. WHEN the `catalog.ts` endpoint returns cacheable public data, THE Hardening_Layer SHALL set `Cache-Control: public, max-age=300` instead of `no-store`
7. THE Hardening_Layer SHALL implement a shared `setSecurityHeaders` utility function that all endpoints call to apply consistent headers

### Requirement 9: Session Validation on Authenticated Endpoints

**User Story:** As a security engineer, I want all authenticated endpoints to verify that the user's session is still active, so that revoked sessions cannot access protected resources.

#### Acceptance Criteria

1. WHEN an authenticated request is processed, THE Session_Validator SHALL verify the session ID from the JWT is still active in the `device_sessions` table
2. IF the session has been revoked or is inactive, THEN THE Session_Validator SHALL return HTTP 401 with code `SESSION_REVOKED`
3. THE Session_Validator SHALL update the `last_active` timestamp on the session record for each successful validation
4. WHILE the `auth.ts` endpoint processes a refresh action, THE Session_Validator SHALL verify the session is active before issuing new tokens
5. THE Auth_Middleware SHALL integrate session validation as part of the `requireAuth` flow so all protected endpoints benefit automatically

### Requirement 10: Idempotency Support for State-Changing Operations

**User Story:** As a frontend developer, I want state-changing API operations to support idempotency keys, so that network retries do not create duplicate records.

#### Acceptance Criteria

1. WHEN a POST request includes an `Idempotency-Key` header, THE Endpoint SHALL check for a cached response with the same scoped key before executing the operation
2. IF a cached response exists for the idempotency key within the 24-hour window, THEN THE Endpoint SHALL return the cached response without re-executing the operation
3. WHEN a state-changing operation completes successfully with an idempotency key, THE Endpoint SHALL store the response in the `idempotency_keys` table
4. THE Endpoint SHALL scope idempotency keys by `userId:endpoint:key` to prevent cross-user collisions
5. THE Endpoint SHALL validate idempotency key format: alphanumeric with colons, underscores, and hyphens, maximum 128 characters
6. THE `applications.ts` endpoint SHALL support idempotency keys on the create application action
7. THE `email.ts` endpoint SHALL support idempotency keys on the send action to prevent duplicate email queuing
8. THE `notifications.ts` endpoint SHALL support idempotency keys on the create and send actions
9. THE Endpoint SHALL periodically clean up expired idempotency keys older than 24 hours

### Requirement 11: Bootstrap Endpoint Hardening

**User Story:** As a security engineer, I want the bootstrap endpoint to be properly secured, so that database seeding cannot be triggered by unauthorized users.

#### Acceptance Criteria

1. THE `bootstrap.ts` endpoint SHALL require either a valid `MIGRATE_SECRET` or admin authentication before executing any operations
2. THE `bootstrap.ts` endpoint SHALL be wrapped with Arcjet protection using the `admin` rate limit profile
3. WHEN the `bootstrap.ts` endpoint is called without valid credentials, THE Endpoint SHALL return HTTP 403 with code `INSUFFICIENT_PERMISSIONS`
4. THE `bootstrap.ts` endpoint SHALL validate the HTTP method, accepting only POST requests
5. THE `bootstrap.ts` endpoint SHALL use the Error_Envelope format for all responses

### Requirement 12: Hardening Middleware Composition

**User Story:** As a developer, I want a standardized middleware composition pattern, so that all endpoints apply security layers in the correct order.

#### Acceptance Criteria

1. THE Hardening_Layer SHALL enforce the following middleware execution order for all endpoints: CORS → Security Headers → Arcjet → CSRF → Auth → Method Validation → Input Validation → Business Logic
2. WHEN a middleware layer rejects a request, THE Hardening_Layer SHALL short-circuit and return the error response without executing subsequent layers
3. THE Hardening_Layer SHALL provide a shared `applySecurityHeaders` function that endpoints call after CORS handling
4. THE Hardening_Layer SHALL log blocked requests with sanitized context for security audit purposes without exposing PII
5. IF a new endpoint is added to the system, THEN THE Hardening_Layer SHALL provide documentation or a template showing the required middleware composition order

### Requirement 13: Catch-All Route Hardening

**User Story:** As a security engineer, I want unmatched API routes to return secure, consistent error responses, so that attackers cannot probe for information.

#### Acceptance Criteria

1. WHEN a request matches the catch-all route (`[...path].ts`), THE Endpoint SHALL return HTTP 404 with code `NOT_FOUND` in the Error_Envelope format
2. THE catch-all route SHALL be wrapped with Arcjet protection to prevent route-probing abuse
3. THE catch-all route SHALL set security response headers consistent with all other endpoints
4. THE catch-all route SHALL not reveal internal routing information, file paths, or available endpoints in its error response
