# Implementation Plan: Python Backend Migration (Django 5 + DRF)

## Overview

Migrate the MIHAS admissions portal backend from Vercel Serverless Functions to Django 5 + DRF on Koyeb. Implementation follows a phased approach: project scaffold → data models → middleware/security → auth → RBAC → core endpoints → async tasks → admin/notifications → contract testing → deployment. Each phase builds incrementally on the previous, with checkpoints to validate before proceeding.

## Tasks

- [x] 1. Django project scaffold and configuration
  - [x] 1.1 Create Django project structure with `config/` and `apps/` layout
    - Create `django_api/` root with `manage.py`, `pyproject.toml`, `requirements.txt`
    - Create `config/` package with `__init__.py`, `urls.py`, `wsgi.py`, `asgi.py`, `celery.py`
    - Create `config/settings/` with `__init__.py`, `base.py`, `dev.py`, `staging.py`, `prod.py`
    - Create empty app packages: `accounts`, `applications`, `documents`, `catalog`, `common`
    - _Requirements: 1.1, 1.2_

  - [x] 1.2 Implement `base.py` settings with database, Redis, JWT, CORS, storage, and DRF configuration
    - Configure `DATABASES` via `dj_database_url` with SSL, `CONN_MAX_AGE=600`, health checks
    - Configure Celery broker/result backend from `REDIS_URL`
    - Configure `SIMPLE_JWT` with HS256, 15-min access, 7-day refresh, shared signing key
    - Configure CORS from `CORS_ALLOWED_ORIGINS` env var with credentials and exposed headers
    - Configure S3/R2 storage via `django-storages` with 15-minute signed URLs
    - Configure DRF defaults: `EnvelopeRenderer`, `JWTCookieAuthentication`, `StandardPagination`, `envelope_exception_handler`
    - Configure WhiteNoise for static files
    - _Requirements: 1.2, 1.3, 20.1, 20.2_

  - [x] 1.3 Implement startup environment variable validation
    - Validate `SECRET_KEY`, `DATABASE_URL`, `REDIS_URL`, `JWT_SIGNING_KEY`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `RESEND_API_KEY`, `S3_ENDPOINT_URL`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` at startup
    - Refuse to start with descriptive error if any are missing
    - _Requirements: 1.8_

  - [x]* 1.4 Write property test for startup environment validation
    - **Property 40: Startup environment validation**
    - **Validates: Requirements 1.8**

  - [x] 1.5 Implement health check endpoints (`/health/live/` and `/health/ready/`)
    - Liveness: return HTTP 200 without database access
    - Readiness: verify Neon Postgres and Redis connectivity, return 200 or 503
    - _Requirements: 1.5, 1.6, 1.7_

  - [x] 1.6 Create `Dockerfile` and `docker-compose.yml`
    - Dockerfile: Python 3.12, gunicorn bound to `0.0.0.0:$PORT`, Tesseract OCR installed
    - docker-compose: Django web + Redis + Celery worker services
    - _Requirements: 1.4, 15.1_

  - [x] 1.7 Configure `drf-spectacular` for OpenAPI 3.0 schema generation
    - Serve Swagger UI at `/api/v1/docs/` and ReDoc at `/api/v1/redoc/`
    - _Requirements: 10.2_

- [x] 2. Checkpoint — Verify project scaffold
  - Ensure Django starts, health endpoints respond, OpenAPI docs render, docker-compose runs all services. Ask the user if questions arise.

- [x] 3. Data models with `managed = False`
  - [x] 3.1 Implement `accounts` app models
    - `Profile`, `DeviceSession`, `LoginAttempt`, `PasswordResetToken`, `CSRFToken`, `UserPermissionOverride`
    - All with `managed = False`, `db_table` matching existing Neon tables, UUID primary keys
    - _Requirements: 13.1, 13.2_

  - [x] 3.2 Implement `applications` app models
    - `Application`, `ApplicationStatusHistory`, `ApplicationDraft`, `ApplicationInterview`
    - All with `managed = False`, exact column name/type mapping
    - _Requirements: 13.1, 13.2_

  - [x] 3.3 Implement `documents` app models
    - `ApplicationDocument`, `ApplicationGrade`, `Payment`
    - All with `managed = False`, exact column name/type mapping
    - _Requirements: 13.1, 13.2_

  - [x] 3.4 Implement `catalog` app models
    - `Institution`, `Program`, `Intake`, `ProgramIntake`, `Subject`, `CourseRequirement`
    - All with `managed = False`, exact column name/type mapping
    - _Requirements: 13.1, 13.2_

  - [x] 3.5 Implement `common` app models
    - `AuditLog`, `IdempotencyKey`, `Setting`, `Notification`, `UserNotificationPreference`, `EmailQueue`, `MigrationHistory`
    - All with `managed = False`, exact column name/type mapping
    - _Requirements: 13.1, 13.2_

  - [x]* 3.6 Write property test for schema compatibility
    - **Property 36: Schema compatibility — managed=False and column mapping**
    - **Validates: Requirements 13.1, 13.2**

- [ ] 4. Test infrastructure and factories
  - [-] 4.1 Set up pytest, hypothesis, factory_boy, and test directory structure
    - Create `django_api/tests/conftest.py` with shared fixtures
    - Create `django_api/tests/factories.py` with `factory_boy` factories for all 26 models
    - Create `django_api/tests/unit/`, `django_api/tests/property/`, `django_api/tests/contract/` directories
    - Configure hypothesis with `@settings(max_examples=100)`
    - _Requirements: 19.1_

- [ ] 5. Checkpoint — Verify models and test infrastructure
  - Ensure all 26 models load without errors, factories generate valid instances, pytest discovers tests. Ask the user if questions arise.

- [ ] 6. Common utilities — response envelope, pagination, exceptions, validators
  - [~] 6.1 Implement `EnvelopeRenderer` in `apps/common/renderers.py`
    - Wrap success responses in `{ "success": true, "data": <payload> }`
    - Wrap error responses in `{ "success": false, "error": "<message>", "code": "<error_code>" }`
    - _Requirements: 10.3, 10.4_

  - [~] 6.2 Implement `envelope_exception_handler` in `apps/common/exceptions.py`
    - Map DRF exceptions to envelope error format with error codes
    - Include `request_id` in all error responses
    - Map: ValidationError→400, AuthenticationFailed→401, PermissionDenied→403, NotFound→404, Throttled→429
    - _Requirements: 10.4_

  - [~] 6.3 Implement `StandardPagination` in `apps/common/pagination.py`
    - Include `page`, `pageSize`, `totalCount` fields in paginated responses
    - _Requirements: 10.5_

  - [~] 6.4 Implement Zambian validators in `apps/common/validators.py`
    - `validate_zambian_phone`: +260 followed by 9 digits
    - `validate_nrc`: 123456/78/9 format
    - `validate_ecz_grade`: integers 1-9
    - `validate_ecz_subject_code`: validate against subjects table
    - `normalize_nationality`: default to "Zambian"
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

  - [~]* 6.5 Write property tests for response envelope and pagination
    - **Property 19: Response envelope format**
    - **Validates: Requirements 10.3, 10.4, 10.6**
    - **Property 21: Pagination metadata**
    - **Validates: Requirements 10.5**

  - [~]* 6.6 Write property test for Zambian data format validation
    - **Property 26: Zambian data format validation**
    - **Validates: Requirements 16.1, 16.2, 16.3, 16.5**

  - [~] 6.7 Implement S3/R2 storage backend in `apps/common/storage.py`
    - Signed URL generation with 15-minute expiry
    - _Requirements: 21.1, 21.2, 21.3_

  - [~]* 6.8 Write property test for signed URL expiry
    - **Property 39: Signed URL expiry**
    - **Validates: Requirements 21.2**

- [ ] 7. Middleware chain implementation
  - [~] 7.1 Implement `SecurityHeadersMiddleware` in `apps/common/middleware.py`
    - Set HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy on all responses
    - _Requirements: 11.2_

  - [~] 7.2 Implement `RequestIDMiddleware` in `apps/common/middleware.py`
    - Generate/propagate X-Request-ID header on all requests and responses
    - _Requirements: 10.6_

  - [~] 7.3 Implement `RateLimitMiddleware` in `apps/common/middleware.py`
    - Per-scope rate limits: auth 60/5min, admin 60/10min, documents 20/10min, sessions 30/10min, notifications 50/10min
    - Return HTTP 429 with `Retry-After` header when exceeded
    - _Requirements: 11.3, 11.4_

  - [~] 7.4 Implement `CSRFEnforcementMiddleware` in `apps/common/middleware.py`
    - Validate X-CSRF-Token header via SHA-256 hash comparison for POST/PUT/PATCH/DELETE
    - Exempt login, register, and password reset endpoints
    - _Requirements: 2.6_

  - [~] 7.5 Implement `AuditMiddleware` in `apps/common/middleware.py`
    - Log all state-changing operations to `audit_logs` table
    - Hash IP and user-agent with SHA-256, never store PII
    - Assign retention categories: security (auth/authz events) or standard (routine)
    - _Requirements: 17.1, 17.2, 17.3_

  - [~] 7.6 Configure middleware ordering in `base.py` settings
    - Order: SecurityHeaders → SecurityMiddleware → WhiteNoise → CORS → RequestID → RateLimit → Common → JWTAuth → CSRF → Audit
    - _Requirements: 11.2_

  - [~]* 7.7 Write property tests for security headers and rate limiting
    - **Property 22: Security headers on all responses**
    - **Validates: Requirements 11.2, 18.5**
    - **Property 23: Rate limiting per scope with Retry-After**
    - **Validates: Requirements 11.3, 11.4**

  - [~]* 7.8 Write property tests for CSRF enforcement and audit logging
    - **Property 7: CSRF enforcement on state-changing endpoints**
    - **Validates: Requirements 2.6**
    - **Property 30: Audit logging — all state-changing operations, no PII**
    - **Validates: Requirements 17.1, 17.2, 17.3**

  - [~]* 7.9 Write property test for CORS origin enforcement
    - **Property 24: CORS origin enforcement**
    - **Validates: Requirements 11.1**

- [ ] 8. Checkpoint — Verify middleware chain
  - Ensure all middleware fires in correct order, security headers present, rate limiting works, CSRF validated, audit entries created. Ask the user if questions arise.

- [ ] 9. Authentication system
  - [ ] 9.1 Implement JWT authentication backend in `apps/accounts/authentication.py`
    - `JWTCookieAuthentication`: extract JWT from HTTP-only cookies or Authorization Bearer header
    - Set `request.user` with role and permissions from JWT payload (no DB lookup)
    - _Requirements: 2.1, 3.1_

  - [ ] 9.2 Implement JWT token generation/verification in `apps/accounts/tokens.py`
    - Access token: 15-minute expiry, HS256, includes role and permissions
    - Refresh token: 7-day expiry, rotation on use, blacklist after rotation
    - Use shared `JWT_SIGNING_KEY` for dual-run compatibility
    - _Requirements: 2.1, 2.3, 18.4_

  - [ ] 9.3 Implement password services in `apps/accounts/services.py`
    - bcrypt hashing (12 rounds), verification
    - One-time SHA-256 to bcrypt migration for legacy hashes
    - Login attempt tracking: 5-failure block (15 min), 10-failure lockout (30 min)
    - Password reset token generation (32 bytes), SHA-256 hash storage, 1-hour expiry
    - _Requirements: 2.2, 2.7, 2.8, 2.9_

  - [ ] 9.4 Implement auth serializers in `apps/accounts/serializers.py`
    - Login, register, password reset request/confirm, session serializers
    - Input validation equivalent to current Zod schemas
    - _Requirements: 11.5_

  - [ ] 9.5 Implement auth views in `apps/accounts/views.py`
    - Login: validate credentials, create device session, set cookies (Domain=.mihas.edu.zm, SameSite=Lax, Secure, HttpOnly), return CSRF token in X-CSRF-Token header
    - Logout: deactivate device session, clear cookies
    - Refresh: rotate tokens, invalidate previous refresh token
    - Register: create profile, rate-limit 3/IP/10min
    - Session: return current user info
    - Password reset request: generate token, send email via Celery, rate-limit 3/email/15min
    - Password reset confirm: verify token hash, single-use consumption
    - Never reveal email existence in error responses
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.9, 2.10, 2.11, 2.12, 18.2_

  - [ ] 9.6 Implement auth URL routing in `apps/accounts/urls.py`
    - Map all auth endpoints under `/api/v1/auth/`
    - _Requirements: 10.1_

  - [ ]* 9.7 Write property tests for auth system
    - **Property 1: Password hashing round-trip**
    - **Validates: Requirements 2.2**
    - **Property 2: JWT token lifecycle — rotation invalidates previous tokens**
    - **Validates: Requirements 2.3**
    - **Property 3: Login attempt throttling**
    - **Validates: Requirements 2.7, 2.8**
    - **Property 4: Auth rate limiting — reset and registration**
    - **Validates: Requirements 2.11, 2.12**
    - **Property 5: Password reset token round-trip**
    - **Validates: Requirements 2.9**
    - **Property 6: Email existence is never revealed**
    - **Validates: Requirements 2.10**

  - [ ]* 9.8 Write property tests for auth cookies and cross-backend JWT
    - **Property 33: Auth cookie attributes**
    - **Validates: Requirements 18.2**
    - **Property 34: Shared JWT signing key — cross-backend token validity**
    - **Validates: Requirements 18.4**

- [ ] 10. RBAC permission system
  - [ ] 10.1 Implement permission classes in `apps/accounts/permissions.py`
    - `IsStudent`, `IsAdmin`, `IsReviewer`, `IsSuperAdmin`, `IsOwnerOrAdmin`
    - Deterministic permission resolution from JWT role (no DB lookup)
    - Support per-user permission overrides from `user_permission_overrides` table
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 10.2 Write property tests for RBAC
    - **Property 8: RBAC permission determinism**
    - **Validates: Requirements 3.1, 3.2**
    - **Property 9: Student resource ownership enforcement**
    - **Validates: Requirements 3.3**
    - **Property 10: Reviewer write denial**
    - **Validates: Requirements 3.4**

- [ ] 11. Checkpoint — Verify auth and RBAC
  - Ensure login/logout/refresh/register/reset flows work, RBAC enforces role boundaries, cookies set correctly, JWT cross-backend compatible. Ask the user if questions arise.

- [ ] 12. Session management endpoints
  - [ ] 12.1 Implement session views and URL routing
    - List sessions, revoke individual session, revoke all sessions
    - Session revocation immediately invalidates associated refresh token
    - Create device session record on login (device_info, ip_hash, last_active)
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ]* 12.2 Write property test for session revocation
    - **Property 32: Session revocation invalidates refresh token**
    - **Validates: Requirements 9.3**

- [ ] 13. Application endpoints
  - [ ] 13.1 Implement application serializers in `apps/applications/serializers.py`
    - Application CRUD serializer with full field set
    - Validate program, intake, institution against catalog tables
    - Return field-level validation errors for invalid references
    - _Requirements: 4.1, 4.2_

  - [ ] 13.2 Implement application filters in `apps/applications/filters.py`
    - Filter by status, payment, program, institution, search (name/email)
    - Sort by date, name, ASC/DESC
    - _Requirements: 4.3_

  - [ ] 13.3 Implement application views in `apps/applications/views.py`
    - List (paginated, filtered, sorted), create, retrieve, update
    - Application details, documents, grades, summary sub-endpoints
    - Review endpoint (admin): status update with status history record + real-time event
    - Export endpoint (admin): CSV export
    - Public tracking: accept application number or tracking code without auth
    - Bulk status updates and bulk email notifications for admin
    - Unverified payment approval guard (require `force` flag)
    - Interview scheduling (create, reschedule, cancel) with audit trail
    - Draft auto-save via `application_drafts` table
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_

  - [ ] 13.4 Implement application URL routing in `apps/applications/urls.py`
    - Map all application endpoints under `/api/v1/applications/`
    - _Requirements: 10.1_

  - [ ]* 13.5 Write property tests for application CRUD
    - **Property 11: Application CRUD round-trip**
    - **Validates: Requirements 4.1, 4.2**
    - **Property 12: Application listing — filter and sort correctness**
    - **Validates: Requirements 4.3**
    - **Property 13: Public tracking without authentication**
    - **Validates: Requirements 4.5**
    - **Property 14: Unverified payment approval guard**
    - **Validates: Requirements 4.7**
    - **Property 15: Draft auto-save round-trip**
    - **Validates: Requirements 4.9**

- [ ] 14. Catalog endpoints
  - [ ] 14.1 Implement catalog serializers in `apps/catalog/serializers.py`
    - Program serializer with nested institution data (name, code, type, duration_years, application_fee)
    - Intake, subject, institution serializers
    - _Requirements: 5.3_

  - [ ] 14.2 Implement catalog views in `apps/catalog/views.py`
    - GET endpoints for programs, intakes, subjects, institutions
    - Public caching: `Cache-Control: public, max-age=300` for unauthenticated requests
    - Admin CRUD (create, update, soft-delete) with CSRF validation and audit logging
    - Exclude inactive records for non-admin users
    - Reject soft-delete of institution with active programs (HTTP 409)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ] 14.3 Implement catalog URL routing in `apps/catalog/urls.py`
    - Map all catalog endpoints under `/api/v1/catalog/`
    - _Requirements: 10.1_

  - [ ]* 14.4 Write property tests for catalog
    - **Property 16: Catalog visibility by role**
    - **Validates: Requirements 5.5**
    - **Property 17: Institution soft-delete with active programs**
    - **Validates: Requirements 5.4**
    - **Property 43: Catalog public caching headers**
    - **Validates: Requirements 5.1**
    - **Property 44: Program listing includes institution data**
    - **Validates: Requirements 5.3**

- [ ] 15. Checkpoint — Verify core endpoints
  - Ensure application CRUD, catalog browsing, session management, public tracking, and filtering/sorting all work correctly. Ask the user if questions arise.

- [ ] 16. Document and payment endpoints
  - [ ] 16.1 Implement file validators in `apps/documents/validators.py`
    - Magic byte verification + MIME type validation before storage
    - _Requirements: 6.1, 11.7_

  - [ ] 16.2 Implement document serializers and views in `apps/documents/`
    - Upload endpoint: validate magic bytes, store in S3/R2, create `application_documents` record
    - OCR extraction endpoint: enqueue Celery task, return task reference
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ] 16.3 Implement payment views in `apps/documents/views.py`
    - Payment receipt generation endpoint
    - Payment verification endpoint (admin): record action in audit log with verifier identity
    - _Requirements: 6.4, 6.5_

  - [ ] 16.4 Implement document/payment URL routing in `apps/documents/urls.py`
    - Map endpoints under `/api/v1/documents/` and `/api/v1/payments/`
    - _Requirements: 10.1_

  - [ ]* 16.5 Write property test for file upload validation
    - **Property 18: File upload magic byte validation**
    - **Validates: Requirements 6.1, 6.2, 11.7**

  - [ ]* 16.6 Write property test for input validation parity
    - **Property 25: Input validation parity**
    - **Validates: Requirements 11.5, 11.6**

- [ ] 17. Celery async task system
  - [ ] 17.1 Implement Celery app configuration in `config/celery.py`
    - Configure Celery with Redis broker, JSON serializer, autodiscover tasks
    - _Requirements: 12.1_

  - [ ] 17.2 Implement email delivery task in `apps/common/tasks.py`
    - `send_email_task`: send via Resend API, exponential backoff retry (60s, 120s, 240s), max 3 retries
    - Update `email_queue` status on success/failure
    - `send_bulk_notifications_task`: process bulk notification delivery
    - _Requirements: 8.3, 8.4, 12.2, 12.3_

  - [ ] 17.3 Implement OCR extraction task in `apps/documents/tasks.py`
    - `extract_document_text_task`: run pytesseract on uploaded document, store extracted text
    - Retry with exponential backoff, mark as failed after 3 retries
    - _Requirements: 6.3, 12.2_

  - [ ]* 17.4 Write property tests for Celery tasks
    - **Property 27: Celery task retry with exponential backoff**
    - **Validates: Requirements 8.4, 12.3**
    - **Property 28: Notification idempotency**
    - **Validates: Requirements 8.1**

- [ ] 18. Checkpoint — Verify async task system
  - Ensure Celery worker starts, email tasks enqueue and retry correctly, OCR tasks process documents, bulk notifications deliver. Ask the user if questions arise.

- [ ] 19. Admin dashboard and user management endpoints
  - [ ] 19.1 Implement admin views in `apps/accounts/views.py` (admin section)
    - Dashboard: application counts by status, period totals (today/week/month), recent activity, system health
    - User listing: pagination, role filtering, search by name/email, include inactive option
    - User management: admin registration, role updates, password resets, account deactivation with audit trail
    - User CSV export with audit logging
    - _Requirements: 7.1, 7.2, 7.3, 7.5_

  - [ ] 19.2 Implement system settings CRUD
    - Key-value store with category, description, public/private visibility
    - _Requirements: 7.4_

  - [ ] 19.3 Implement audit log query endpoint
    - Filter by entity type, action, actor, date range
    - _Requirements: 7.6_

  - [ ]* 19.4 Write property tests for admin dashboard and settings
    - **Property 41: Dashboard counts consistency**
    - **Validates: Requirements 7.1**
    - **Property 42: Settings CRUD round-trip**
    - **Validates: Requirements 7.4**

- [ ] 20. Notification and SSE endpoints
  - [ ] 20.1 Implement notification views
    - Notification preference management (email_enabled, push_enabled, quiet_hours)
    - Admin send notification endpoint with idempotency key
    - Notification rate limiting per policy
    - _Requirements: 8.1, 8.2, 8.5_

  - [ ] 20.2 Implement SSE view in `apps/common/sse.py`
    - Server-Sent Events for real-time updates with 8-second keepalive
    - Polling fallback endpoint
    - _Requirements: 9.4_

  - [ ] 20.3 Implement email send endpoint
    - Admin-only endpoint to send email via Celery
    - Configure `RESEND_API_KEY` and `EMAIL_FROM` env vars
    - _Requirements: 8.3, 8.6_

  - [ ]* 20.4 Write property test for notification preferences
    - **Property 29: Notification preference round-trip**
    - **Validates: Requirements 8.2**

- [ ] 21. Idempotency and read-only mode
  - [ ] 21.1 Implement idempotent request processing
    - Check `Idempotency-Key` header, return cached response if key exists
    - Store response in `idempotency_keys` table on first execution
    - _Requirements: 17.4_

  - [ ] 21.2 Implement read-only mode
    - Configurable flag to block all write requests (POST/PUT/PATCH/DELETE)
    - Allow GET requests to continue normally
    - For use during rollback scenarios
    - _Requirements: 14.5_

  - [ ]* 21.3 Write property tests for idempotency and read-only mode
    - **Property 31: Idempotent request processing**
    - **Validates: Requirements 17.4**
    - **Property 38: Read-only mode blocks writes**
    - **Validates: Requirements 14.5**

- [ ] 22. Checkpoint — Verify all endpoints and features
  - Ensure admin dashboard, user management, notifications, SSE, idempotency, and read-only mode all work correctly. Ask the user if questions arise.

- [ ] 23. Root URL configuration and API versioning
  - [ ] 23.1 Wire all app URL configs into `config/urls.py`
    - Include all app URLs under `/api/v1/` prefix
    - Include health endpoints at root level
    - Include OpenAPI docs endpoints
    - Verify all endpoint mappings match the Vercel → Django mapping table
    - _Requirements: 10.1_

  - [ ]* 23.2 Write property test for API versioning prefix
    - **Property 20: API versioning prefix**
    - **Validates: Requirements 10.1**

- [ ] 24. Contract testing and migration toolkit
  - [ ] 24.1 Create contract test recording fixtures
    - Set up `django_api/tests/contract/recordings/` with recorded Vercel request/response pairs for all critical endpoints (auth, applications, catalog, documents, payments, admin, notifications, sessions)
    - _Requirements: 19.1_

  - [ ] 24.2 Implement contract parity test suite
    - Replay recorded requests against Django API
    - Compare status codes, envelope structure, field names, data types
    - Tolerate expected differences (timestamps, request IDs, token values)
    - _Requirements: 19.2, 19.3, 19.4_

  - [ ]* 24.3 Write property test for contract response parity
    - **Property 35: Contract response parity**
    - **Validates: Requirements 19.2, 19.3**

  - [ ] 24.4 Implement migration verification scripts
    - Row count comparison between Vercel and Django responses
    - Foreign key integrity validation
    - Sample record parity checks
    - Idempotent execution with checkpoint-based resumption
    - Immutable migration logs (run ID, start/end time, row counts, error counts)
    - _Requirements: 13.3, 13.4, 13.5_

  - [ ]* 24.5 Write property test for migration idempotency
    - **Property 37: Migration idempotency**
    - **Validates: Requirements 13.4**

- [ ] 25. Deployment configuration
  - [ ] 25.1 Configure gunicorn with production settings
    - `--graceful-timeout 30` for in-flight request completion during deployments
    - Worker count and connection limits per worker
    - Separate Celery worker start command (`celery -A config worker`)
    - _Requirements: 15.1, 20.5_

  - [ ] 25.2 Configure database connection pooling
    - Use Neon pooler endpoint for web service
    - Separate pooled connection string with lower limits for Celery worker
    - Monitor active connections, log warnings at 80% utilization
    - _Requirements: 20.1, 20.2, 20.3, 20.4_

  - [ ] 25.3 Configure WhiteNoise for static file serving
    - Serve admin panel and API docs static files in production
    - _Requirements: 21.4_

- [ ] 26. Final checkpoint — Full integration verification
  - Ensure all tests pass (unit, property, contract), all endpoints respond correctly, middleware chain complete, Celery tasks process, Docker image builds, gunicorn starts. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at each phase boundary
- Property tests validate universal correctness properties from the design document (44 properties)
- Contract tests verify Vercel/Django response parity for migration confidence
- All models use `managed = False` during dual-run — do not create Django migrations for existing tables
- Implementation language: Python 3.12 with Django 5 + DRF (as specified in design)
- Property tests use `hypothesis` with `@settings(max_examples=100)`
- Tag format: `# Feature: python-backend-migration, Property {N}: {title}`
