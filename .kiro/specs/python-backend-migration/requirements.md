# Requirements Document

## Introduction

Migrate the MIHAS admissions portal backend from Vercel Serverless Functions (Node.js/Bun) to a Django 5 + Django REST Framework API hosted on Koyeb. The React 18 + TypeScript frontend remains on Vercel. The Neon Postgres database is shared between both backends during the transition and becomes the sole data store for the Django API post-cutover. The migration preserves all existing authentication, authorization, CRUD, and async processing behaviors while removing Vercel function-count constraints and enabling horizontal scaling of the backend independently.

## Glossary

- **MIHAS_Portal**: The MIHAS admissions web application comprising a React frontend and a backend API
- **Vercel_Backend**: The current backend implemented as Vercel Serverless Functions with query-parameter routing in `api-src/`
- **Django_API**: The target Django 5 + Django REST Framework backend to be deployed on Koyeb
- **Koyeb_Service**: The container hosting platform running the Django_API via Docker + uvicorn
- **Neon_Database**: The managed Neon Postgres database (26 tables) shared by both backends during migration
- **Frontend_App**: The React 18 + TypeScript SPA hosted on Vercel, consuming the backend API
- **Auth_System**: The JWT-based authentication system using access tokens (15 min) and refresh tokens (7 days) with HTTP-only cookies
- **RBAC_System**: The role-based access control system with four roles: student, admin, reviewer, super_admin
- **Celery_Worker**: The background task processor using Celery + Redis for emails, notifications, and long-running jobs
- **API_Gateway**: The versioned REST API surface prefixed with `/api/v1/`
- **Migration_Toolkit**: The set of ETL scripts, verification checks, and rollback procedures for data migration
- **Dual_Run_Mode**: A temporary operational state where both Vercel_Backend and Django_API serve traffic for validation

## Requirements

### Requirement 1: Django Project Scaffold and Environment Configuration

**User Story:** As a developer, I want a properly structured Django 5 + DRF project with environment-based settings, so that the backend can be developed, tested, and deployed across dev/staging/prod environments.

#### Acceptance Criteria

1. THE Django_API SHALL organize code into Django apps: `accounts`, `applications`, `documents`, `catalog`, and `common`
2. THE Django_API SHALL use environment-based settings split into `base.py`, `dev.py`, `staging.py`, and `prod.py` controlled by the `DJANGO_SETTINGS_MODULE` environment variable
3. THE Django_API SHALL connect to Neon_Database using the `DATABASE_URL` environment variable with SSL required
4. THE Django_API SHALL include a Dockerfile that builds the service image and runs uvicorn bound to `0.0.0.0:$PORT`
5. THE Django_API SHALL expose a liveness endpoint at `/health/live` that returns HTTP 200 without database access
6. WHEN the `/health/ready` endpoint is requested, THE Django_API SHALL verify connectivity to Neon_Database and Redis before returning HTTP 200
7. IF Neon_Database or Redis is unreachable during a readiness check, THEN THE Django_API SHALL return HTTP 503 with a descriptive error body
8. THE Django_API SHALL validate all required environment variables (`SECRET_KEY`, `DATABASE_URL`, `REDIS_URL`, `JWT_SIGNING_KEY`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`) at startup and refuse to start if any are missing

### Requirement 2: Authentication Parity with Existing JWT System

**User Story:** As a student or admin, I want to log in, refresh tokens, and log out using the same JWT semantics as the current system, so that the migration is transparent to end users.

#### Acceptance Criteria

1. WHEN a valid email and password are submitted to the login endpoint, THE Auth_System SHALL return an access token (15-minute expiry) and a refresh token (7-day expiry) set as HTTP-only secure cookies
2. WHEN a login request is received, THE Auth_System SHALL verify the password using bcrypt (12 rounds) and support one-time SHA-256 to bcrypt migration for legacy password hashes
3. WHEN a valid refresh token is submitted, THE Auth_System SHALL rotate both the access and refresh tokens and invalidate the previous refresh token
4. WHEN a logout request is received, THE Auth_System SHALL deactivate the current device session and clear all auth cookies
5. THE Auth_System SHALL generate a CSRF token on login and return it in the `X-CSRF-Token` response header
6. THE Auth_System SHALL require a valid CSRF token in the `X-CSRF-Token` request header for all POST, PUT, PATCH, and DELETE requests, except login, register, and password reset endpoints
7. IF 5 failed login attempts occur for the same email within 15 minutes, THEN THE Auth_System SHALL block further attempts for that email and return HTTP 429 with a `Retry-After` header
8. IF 10 consecutive failed login attempts occur for the same email, THEN THE Auth_System SHALL lock the account for 30 minutes and send a lockout notification email via Resend
9. WHEN a password reset is requested, THE Auth_System SHALL generate a 32-byte random token, store its SHA-256 hash in the `password_reset_tokens` table with a 1-hour expiry, and send a reset link via Resend
10. THE Auth_System SHALL never reveal whether an email exists in the system during password reset or login failure responses
11. THE Auth_System SHALL rate-limit password reset requests to 3 per email per 15-minute window
12. THE Auth_System SHALL rate-limit registration to 3 attempts per IP address per 10-minute window

### Requirement 3: Role-Based Access Control Parity

**User Story:** As an admin, I want the same RBAC enforcement on the Django API as the current system, so that permission boundaries are preserved during migration.

#### Acceptance Criteria

1. THE RBAC_System SHALL embed user permissions in the JWT payload and resolve permissions deterministically from the role without database lookup
2. THE RBAC_System SHALL enforce the following role hierarchy: super_admin (full access), admin (read users, manage applications, verify payments/documents, view analytics), reviewer (read/review applications, read documents), student (own resources only)
3. WHEN a student accesses a resource, THE RBAC_System SHALL verify that the resource belongs to the requesting user via ownership checks
4. WHEN a reviewer attempts a write operation on an application, THE RBAC_System SHALL deny the request with HTTP 403 and code `INSUFFICIENT_PERMISSIONS`
5. THE RBAC_System SHALL support per-user permission overrides stored in the `user_permission_overrides` table

### Requirement 4: Core Application Endpoints Migration

**User Story:** As a student, I want to create, view, update, and track my applications through the Django API with the same behavior as the current system, so that my application workflow is uninterrupted.

#### Acceptance Criteria

1. THE Django_API SHALL implement CRUD operations for applications with the same field set as the current `applications` table (user_id, application_number, public_tracking_code, full_name, nrc_number, passport_number, date_of_birth, sex, phone, email, residence_town, nationality, program, intake, institution, status)
2. WHEN a new application is created, THE Django_API SHALL validate the program, intake, and institution against the catalog tables and return field-level validation errors for invalid references
3. THE Django_API SHALL support application listing with pagination (page/pageSize), filtering (status, payment, program, institution, search), and sorting (date, name, ASC/DESC)
4. WHEN an application status is updated by an admin, THE Django_API SHALL insert a record into `application_status_history` and publish a real-time event to the application owner
5. THE Django_API SHALL provide a public tracking endpoint that accepts an application number or tracking code without authentication and returns application status, program, intake, submission date, and feedback summary
6. THE Django_API SHALL rate-limit the public tracking endpoint separately from authenticated endpoints
7. WHEN an admin approves an application with unverified payment, THE Django_API SHALL return an advisory warning and require a `force` flag to proceed
8. THE Django_API SHALL support interview scheduling (create, reschedule, cancel) with audit trail entries for each operation
9. THE Django_API SHALL support application draft auto-save via the `application_drafts` table
10. THE Django_API SHALL support bulk status updates and bulk email notifications for admin users

### Requirement 5: Catalog Endpoints Migration

**User Story:** As a student, I want to browse programs, intakes, subjects, and institutions through the Django API, so that I can select the correct options when applying.

#### Acceptance Criteria

1. THE Django_API SHALL serve GET endpoints for programs, intakes, subjects, and institutions with public caching (Cache-Control: public, max-age=300) for unauthenticated requests
2. THE Django_API SHALL support admin CRUD operations (create, update, soft-delete) for programs, intakes, and institutions with CSRF validation and audit logging
3. WHEN a program is listed, THE Django_API SHALL join institution data and return normalized fields including duration_years, application_fee, and institution details
4. WHEN an institution with active programs is soft-deleted, THE Django_API SHALL reject the operation with HTTP 409 Conflict
5. THE Django_API SHALL include inactive records in catalog responses only when the requesting user has an admin role

### Requirement 6: Document and Payment Endpoints Migration

**User Story:** As a student, I want to upload documents and manage payments through the Django API, so that my application materials are handled correctly.

#### Acceptance Criteria

1. THE Django_API SHALL accept document uploads with magic byte verification and MIME type validation before storing files in S3-compatible storage
2. WHEN a document is uploaded, THE Django_API SHALL create a record in `application_documents` with document_type, file_key, and verification_status
3. THE Django_API SHALL support OCR text extraction from uploaded documents using `pytesseract` (Python Tesseract wrapper) as a Celery background task, replacing the current client-side `tesseract.js` implementation
4. THE Django_API SHALL implement payment receipt generation and payment status verification endpoints
5. WHEN an admin verifies or rejects a payment, THE Django_API SHALL record the action in the audit log with the verifier identity and notes

### Requirement 7: Admin Dashboard and User Management Migration

**User Story:** As an admin, I want the same dashboard statistics, user management, and system settings capabilities on the Django API, so that administrative workflows continue without disruption.

#### Acceptance Criteria

1. THE Django_API SHALL provide a dashboard endpoint returning application counts by status, period totals (today/week/month), recent activity, and system health indicator
2. THE Django_API SHALL provide user listing with pagination, role filtering, search by name/email, and optional inclusion of inactive users
3. THE Django_API SHALL support admin user registration, role updates, password resets, and account deactivation with audit trail entries
4. THE Django_API SHALL implement system settings CRUD (key-value store) with category, description, and public/private visibility
5. THE Django_API SHALL support user CSV export with audit logging of the export action
6. THE Django_API SHALL provide an audit log query endpoint with filtering by entity type, action, actor, and date range

### Requirement 8: Notification and Email System Migration

**User Story:** As a student, I want to receive notifications and emails through the Django API with the same delivery guarantees, so that I stay informed about my application status.

#### Acceptance Criteria

1. THE Django_API SHALL store notifications in the `notifications` table with idempotency keys to prevent duplicate delivery
2. THE Django_API SHALL support user notification preference management (email_enabled, push_enabled, quiet_hours)
3. WHEN an email needs to be sent, THE Celery_Worker SHALL enqueue the email in the `email_queue` table with retry logic and send it asynchronously via the Resend API using the `RESEND_API_KEY` environment variable
4. IF an email delivery fails, THEN THE Celery_Worker SHALL retry with exponential backoff up to 3 attempts before marking the email as failed
5. THE Django_API SHALL enforce notification rate limiting per the existing notification policy
6. THE Django_API SHALL configure `RESEND_API_KEY` and `EMAIL_FROM` (default: `noreply@mihas.edu.zm`) as required environment variables for email delivery

### Requirement 9: Session and Real-Time Event Management

**User Story:** As a student, I want my device sessions tracked and real-time updates delivered through the Django API, so that I have the same session security and live update experience.

#### Acceptance Criteria

1. THE Django_API SHALL create a device session record on login containing device_info, ip_hash, and last_active timestamp
2. THE Django_API SHALL support session listing, individual session revocation, and revoke-all operations per user
3. WHEN a session is revoked, THE Django_API SHALL immediately invalidate the associated refresh token
4. THE Django_API SHALL implement Server-Sent Events (SSE) for real-time updates with an 8-second keepalive interval and polling fallback


### Requirement 10: API Versioning, Documentation, and Response Standards

**User Story:** As a frontend developer, I want the Django API to follow consistent versioning, documentation, and response envelope conventions, so that frontend integration is predictable and self-documenting.

#### Acceptance Criteria

1. THE API_Gateway SHALL prefix all routes with `/api/v1/` to support future versioning
2. THE Django_API SHALL generate an OpenAPI 3.0 schema using drf-spectacular and serve interactive documentation at `/api/v1/docs/` (Swagger UI) and `/api/v1/redoc/` (ReDoc)
3. THE Django_API SHALL wrap all successful responses in the envelope `{ "success": true, "data": <payload> }` matching the current Vercel_Backend format
4. THE Django_API SHALL wrap all error responses in the envelope `{ "success": false, "error": "<message>", "code": "<error_code>" }` matching the current Vercel_Backend format
5. THE Django_API SHALL use cursor-based or limit/offset pagination consistently across all list endpoints with `page`, `pageSize`, and `totalCount` fields
6. THE Django_API SHALL include a request ID in all responses for traceability

### Requirement 11: CORS, Security Headers, and Rate Limiting

**User Story:** As a security engineer, I want the Django API to enforce the same CORS, security header, and rate limiting policies as the current system, so that the security posture is maintained post-migration.

#### Acceptance Criteria

1. THE Django_API SHALL configure CORS to allow only the Vercel production domain (`https://apply.mihas.edu.zm`) and Vercel preview domains listed in `CORS_ALLOWED_ORIGINS`
2. THE Django_API SHALL set security headers on all responses: `Strict-Transport-Security` (max-age=31536000), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive `Permissions-Policy`
3. THE Django_API SHALL enforce rate limits per scope: auth endpoints (60 requests per 5 minutes), admin endpoints (60 requests per 10 minutes), document uploads (20 requests per 10 minutes), session endpoints (30 requests per 10 minutes), notification endpoints (50 requests per 10 minutes)
4. WHEN a rate limit is exceeded, THE Django_API SHALL return HTTP 429 with a `Retry-After` header indicating seconds until the limit resets
5. THE Django_API SHALL validate and sanitize all user inputs using DRF serializers with equivalent rules to the current Zod schemas in `lib/validation/`
6. THE Django_API SHALL validate URL inputs against open redirect attacks
7. THE Django_API SHALL validate file uploads using magic byte verification before processing

### Requirement 12: Background Task Processing with Celery

**User Story:** As a developer, I want expensive operations (emails, document processing, notifications) handled asynchronously via Celery, so that API response times remain fast.

#### Acceptance Criteria

1. THE Celery_Worker SHALL connect to Redis via the `CELERY_BROKER_URL` environment variable and use Redis as the result backend
2. THE Celery_Worker SHALL process email delivery, document OCR extraction, and bulk notification tasks asynchronously
3. WHEN a Celery task fails, THE Celery_Worker SHALL retry with exponential backoff (base 60 seconds) up to 3 times before routing to a dead-letter queue
4. THE Django_API SHALL return task references (task ID and status endpoint) for long-running operations instead of blocking the response
5. THE Celery_Worker SHALL run as a separate Koyeb service using the same Docker image with a different start command (`celery -A config worker`)

### Requirement 13: Data Migration and Schema Compatibility

**User Story:** As a developer, I want idempotent data migration scripts that map the existing 26-table schema to Django models, so that all existing data is preserved and verified.

#### Acceptance Criteria

1. THE Migration_Toolkit SHALL produce Django models that map to all 26 existing Neon_Database tables without altering column names or types
2. THE Migration_Toolkit SHALL use Django's `managed = False` for models mapping to existing tables to prevent Django migrations from modifying the shared schema during dual-run
3. THE Migration_Toolkit SHALL include verification scripts that compare row counts, validate foreign key integrity, and perform sample record parity checks between the Vercel_Backend and Django_API responses
4. THE Migration_Toolkit SHALL be idempotent, using upsert keys and checkpoint-based resumption for safe re-execution
5. THE Migration_Toolkit SHALL maintain immutable migration logs recording run ID, start/end time, row counts, and error counts

### Requirement 14: Dual-Run Cutover and Rollback

**User Story:** As an operations engineer, I want a controlled cutover process with instant rollback capability, so that the migration can be reversed if issues are detected.

#### Acceptance Criteria

1. THE Frontend_App SHALL read the API base URL from the `NEXT_PUBLIC_API_BASE_URL` environment variable, enabling switching between Vercel_Backend and Django_API without code changes
2. WHILE Dual_Run_Mode is active, THE Frontend_App SHALL route a configurable percentage of traffic to the Django_API for validation
3. WHEN the production cutover is executed, THE Frontend_App SHALL update `NEXT_PUBLIC_API_BASE_URL` to the Koyeb_Service domain and redeploy on Vercel
4. IF error rate exceeds 2% of requests over a 5-minute window post-cutover, THEN THE operations team SHALL execute the rollback procedure: restore the previous API base URL, redeploy the frontend, and verify smoke tests against the Vercel_Backend
5. THE Django_API SHALL support a read-only mode that can be activated during rollback to prevent data divergence
6. WHEN a rollback occurs after writes have been made to the Django_API, THE Migration_Toolkit SHALL provide a data reconciliation script to sync deltas back to the Vercel_Backend state

### Requirement 15: Koyeb Deployment and Observability

**User Story:** As a DevOps engineer, I want the Django API deployed on Koyeb with proper monitoring, so that I can observe system health and respond to incidents.

#### Acceptance Criteria

1. THE Koyeb_Service SHALL run the Django_API web service with uvicorn and the Celery_Worker as separate services from the same Docker image
2. THE Koyeb_Service SHALL attach a custom domain with managed TLS certificates
3. THE Koyeb_Service SHALL start with 1 replica and define autoscaling thresholds based on CPU and memory utilization
4. THE Django_API SHALL expose metrics for API latency (p50/p95/p99), error rate (4xx/5xx split), auth failure count, Celery queue depth, and task failure rate
5. WHEN the 5xx error rate exceeds 2% for 5 minutes, THE monitoring system SHALL trigger an alert
6. WHEN the p95 API latency exceeds 1.5 seconds for 10 minutes, THE monitoring system SHALL trigger an alert
7. WHEN the Celery task failure rate exceeds 5% for 10 minutes, THE monitoring system SHALL trigger an alert

### Requirement 16: Zambian Data Format and Validation Parity

**User Story:** As a student in Zambia, I want the Django API to accept and validate Zambian-specific data formats, so that my personal information is handled correctly.

#### Acceptance Criteria

1. THE Django_API SHALL validate Zambian phone numbers in the +260 format
2. THE Django_API SHALL validate National Registration Card (NRC) numbers in the standard Zambian format
3. THE Django_API SHALL validate ECZ grade 12 grades on a 1-9 scale where 1-6 is a pass and 7-9 is a fail
4. THE Django_API SHALL validate ECZ subject codes against the `subjects` table
5. THE Django_API SHALL normalize nationality values and default to "Zambian" when not provided

### Requirement 17: Audit Logging and Compliance

**User Story:** As a compliance officer, I want all state-changing operations logged with retention policies, so that the system maintains a complete audit trail.

#### Acceptance Criteria

1. THE Django_API SHALL log all state-changing operations to the `audit_logs` table with actor_id, action, entity_type, entity_id, changes (JSON), ip_address, and user_agent
2. THE Django_API SHALL never include PII (email addresses, phone numbers, names) in audit log entries; identifiers SHALL be stored as SHA-256 hashes where needed
3. THE Django_API SHALL assign retention categories to audit entries: standard (90 days) for routine operations and security (365 days) for authentication and authorization events
4. THE Django_API SHALL support idempotent request processing using the `idempotency_keys` table to prevent duplicate side effects from retried requests

### Requirement 18: Cross-Origin Auth Strategy and Subdomain Routing

**User Story:** As a frontend developer, I want a clear cross-origin authentication strategy between the Vercel frontend and Koyeb API, so that cookies and CSRF tokens work reliably across all browsers.

#### Acceptance Criteria

1. THE Django_API SHALL be served from a subdomain of the production domain (e.g., `api.mihas.edu.zm`) to enable first-party cookie sharing with the frontend at `apply.mihas.edu.zm`
2. THE Auth_System SHALL set auth cookies with `Domain=.mihas.edu.zm`, `SameSite=Lax`, `Secure=true`, and `HttpOnly=true` to ensure first-party cookie behavior across the subdomain
3. IF subdomain routing is not feasible, THEN THE Auth_System SHALL switch to `Authorization: Bearer` header transport and the Frontend_App SHALL store tokens in memory (not localStorage) with silent refresh via hidden iframe or background fetch
4. DURING Dual_Run_Mode, THE Auth_System SHALL use a shared `JWT_SIGNING_KEY` between Vercel_Backend and Django_API so that tokens issued by either backend are valid on both
5. THE Django_API SHALL set `Access-Control-Max-Age: 86400` on CORS preflight responses to minimize redundant OPTIONS requests

### Requirement 19: API Contract Testing and Parity Verification

**User Story:** As a developer, I want automated contract tests that verify the Django API produces identical responses to the Vercel backend, so that migration parity is provable.

#### Acceptance Criteria

1. THE Migration_Toolkit SHALL include a contract test suite that records request/response pairs from the Vercel_Backend for all critical endpoints (auth, applications, catalog, documents, payments, admin, notifications, sessions)
2. THE contract test suite SHALL replay recorded requests against the Django_API and compare response status codes, envelope structure, field names, and data types
3. THE contract test suite SHALL tolerate expected differences (timestamps, request IDs, token values) while flagging unexpected field additions, removals, or type changes
4. THE contract test suite SHALL run as a CI step before any deployment to Koyeb_Service
5. THE Migration_Toolkit SHALL define migration success criteria: Django_API p95 latency within 20% of Vercel_Backend p95, error rate below 1%, and all contract tests passing for a 48-hour soak period

### Requirement 20: Database Connection Pooling and Resource Management

**User Story:** As a DevOps engineer, I want database connections properly pooled and managed, so that the Django API and Celery workers do not exhaust Neon connection limits.

#### Acceptance Criteria

1. THE Django_API SHALL connect to Neon_Database through Neon's built-in connection pooler endpoint using the pooled connection string
2. THE Django_API SHALL configure `CONN_MAX_AGE` to reuse database connections within uvicorn worker processes and set a maximum connection count per worker process
3. THE Celery_Worker SHALL use a separate pooled connection string with lower connection limits than the web service
4. THE Django_API SHALL monitor active database connections and log warnings when connection usage exceeds 80% of the configured limit
5. THE Django_API SHALL configure the ASGI process manager to allow in-flight requests to complete during deployments

### Requirement 21: Static File and Media Storage

**User Story:** As a student, I want my uploaded documents served reliably through the Django API, so that admins can review my application materials.

#### Acceptance Criteria

1. THE Django_API SHALL use `django-storages` with an S3-compatible backend (Cloudflare R2 or AWS S3) for all media file storage
2. THE Django_API SHALL generate time-limited signed URLs (15-minute expiry) for document downloads instead of serving files directly
3. THE Django_API SHALL configure `S3_ENDPOINT_URL`, `S3_BUCKET`, `S3_ACCESS_KEY`, and `S3_SECRET_KEY` as required environment variables for media storage
4. THE Django_API SHALL serve its own static files (admin panel, API docs) via WhiteNoise middleware in production
