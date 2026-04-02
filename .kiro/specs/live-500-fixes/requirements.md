# Requirements Document

## Introduction

The MIHAS admissions platform (api.mihas.edu.zm) has multiple API endpoints returning HTTP 500 errors in production. These failures were discovered during E2E testing against the live deployment and affect core admissions workflows: SSE event streaming, admin dashboard loading, and application review/approval. The root causes are Django model field definitions that do not match the Neon Postgres column constraints — primarily missing `auto_now_add` on `created_at` fields, undersized `CharField` max lengths, and nullable mismatches introduced during a prior model alignment pass. Additionally, the `AuditMiddleware` creates audit log entries without setting all required fields, and a debug wrapper was left in the application review view. This spec covers diagnosing, fixing, and verifying every 500-producing endpoint on the live site.

## Glossary

- **Platform**: The MIHAS Django backend deployed at api.mihas.edu.zm
- **SSE_Endpoint**: The Server-Sent Events streaming view at `/api/v1/events/stream/`
- **Poll_Endpoint**: The SSE polling fallback view at `/api/v1/events/poll/`
- **Admin_Dashboard**: The admin dashboard view at `/api/v1/admin/dashboard/`
- **Review_Endpoint**: The application review/approval view at `/api/v1/applications/{id}/review/`
- **AuditMiddleware**: The middleware in `backend/apps/common/middleware.py` that logs state-changing requests to the `audit_logs` table
- **Model_Layer**: The set of Django model classes with `managed = False` that map to existing Neon Postgres tables
- **Neon_DB**: The Neon Postgres database (project wild-bar-37055823) backing the live platform
- **created_at_Field**: A `DateTimeField` on a Django model that maps to a `NOT NULL` timestamp column in Neon_DB
- **ApplicationStatusHistory**: The model in `backend/apps/applications/models.py` that records status transitions for applications
- **ErrorLog**: The model in `backend/apps/common/models.py` used for self-hosted error monitoring
- **AuditLog**: The model in `backend/apps/common/models.py` that stores audit trail entries
- **Debug_Wrapper**: The try/except block with traceback exposure in `ApplicationReviewView.post()` that was added during troubleshooting

## Requirements

### Requirement 1: SSE Stream Endpoint Recovery

**User Story:** As an authenticated student or admin, I want the SSE events stream to connect without errors, so that I receive real-time notifications after login without flooding the browser console with 500 errors.

#### Acceptance Criteria

1. WHEN an authenticated user sends a GET request to `/api/v1/events/stream/`, THE SSE_Endpoint SHALL return an HTTP 200 response with `Content-Type: text/event-stream`
2. WHEN an authenticated user sends a GET request to `/api/v1/events/poll/`, THE Poll_Endpoint SHALL return an HTTP 200 response with a JSON envelope containing unread notifications
3. IF the SSE_Endpoint encounters a database query error during notification fetching, THEN THE SSE_Endpoint SHALL log the error and continue sending keepalive pings without returning a 500 response
4. WHEN the SSE_Endpoint streams events, THE SSE_Endpoint SHALL serialize each notification with id, title, message, type, and created_at fields without raising serialization errors

### Requirement 2: Admin Dashboard Endpoint Recovery

**User Story:** As an admin user, I want the admin dashboard to load with real application and user metrics, so that I can monitor admissions activity without seeing "Error: Failed to load dashboard data."

#### Acceptance Criteria

1. WHEN an authenticated admin sends a GET request to `/api/v1/admin/dashboard/`, THE Admin_Dashboard SHALL return an HTTP 200 response within 10 seconds
2. THE Admin_Dashboard SHALL return application counts grouped by status, period totals for today, this week, and this month, total application count, user counts, and recent audit log activity
3. IF the `audit_logs` table query returns rows with NULL `created_at` values, THEN THE Admin_Dashboard SHALL handle those rows without raising a serialization error
4. IF the `applications` table query encounters a column mismatch, THEN THE Admin_Dashboard SHALL return a structured error response instead of an unhandled 500

### Requirement 3: Application Review Endpoint Recovery

**User Story:** As an admin reviewer, I want application review and approval actions to complete and return a valid response, so that the frontend confirms the status change instead of showing an error.

#### Acceptance Criteria

1. WHEN an admin sends a POST request to `/api/v1/applications/{id}/review/` with a valid status transition, THE Review_Endpoint SHALL update the application status and return an HTTP 200 response with the old and new status
2. WHEN the Review_Endpoint creates an ApplicationStatusHistory record, THE Review_Endpoint SHALL populate all required fields including `created_at` so that the INSERT does not violate NOT NULL constraints in Neon_DB
3. IF the application does not exist, THEN THE Review_Endpoint SHALL return an HTTP 404 response with error code `NOT_FOUND`
4. THE Review_Endpoint SHALL remove the debug try/except wrapper that exposes stack traces in the response body

### Requirement 4: Model-Database Alignment for created_at Fields

**User Story:** As a platform operator, I want all Django model `created_at` fields to match their Neon Postgres NOT NULL constraints, so that INSERT operations do not fail with null-value violations.

#### Acceptance Criteria

1. THE Model_Layer SHALL define `auto_now_add=True` on every `created_at` field where the corresponding Neon_DB column has a `NOT NULL` constraint and no server-side default
2. THE Model_Layer SHALL define `auto_now=True` on every `updated_at` field where the corresponding Neon_DB column has a `NOT NULL` constraint and no server-side default
3. WHEN a new AuditLog record is created by the AuditMiddleware, THE AuditLog model SHALL auto-populate the `created_at` field so that the INSERT succeeds against the Neon_DB `audit_logs` table
4. WHEN a new ApplicationStatusHistory record is created, THE ApplicationStatusHistory model SHALL auto-populate the `created_at` field so that the INSERT succeeds against the Neon_DB `application_status_history` table

### Requirement 5: CharField Max Length Alignment

**User Story:** As a platform operator, I want all Django `CharField` max_length values to match or exceed the corresponding Neon Postgres varchar column lengths, so that data truncation and constraint violations do not cause 500 errors.

#### Acceptance Criteria

1. THE Model_Layer SHALL set `max_length` on each `CharField` to a value that matches or exceeds the corresponding `varchar(N)` column length in Neon_DB
2. WHERE a `CharField` stores SHA-256 hashes (64 hex characters), THE Model_Layer SHALL use `max_length` of at least 64
3. WHERE a `CharField` stores IP address hashes, THE Model_Layer SHALL use `max_length` of at least 64 instead of 45
4. WHEN the Model_Layer is updated, THE Platform SHALL verify each changed field against the Neon_DB schema using the Neon MCP connection to project wild-bar-37055823

### Requirement 6: AuditMiddleware Robustness

**User Story:** As a platform operator, I want the AuditMiddleware to create valid audit log entries on every successful state-changing request, so that audit logging does not cause 500 errors on otherwise successful operations.

#### Acceptance Criteria

1. WHEN the AuditMiddleware creates an AuditLog entry, THE AuditMiddleware SHALL set `entity_id` to NULL explicitly when no entity identifier can be extracted from the request path, rather than omitting the field
2. WHEN the AuditMiddleware creates an AuditLog entry, THE AuditMiddleware SHALL ensure the `created_at` field is populated either by the model default or by explicit assignment
3. IF the AuditMiddleware fails to create an audit log entry for any reason, THEN THE AuditMiddleware SHALL log the exception and allow the original response to pass through without modification
4. THE AuditMiddleware SHALL truncate `ip_address` and `user_agent` hash values to fit within the corresponding Neon_DB column constraints

### Requirement 7: Debug Wrapper Removal

**User Story:** As a platform operator, I want all debug wrappers and traceback-exposing code removed from production endpoints, so that internal implementation details are not leaked in API responses.

#### Acceptance Criteria

1. THE Review_Endpoint SHALL remove the outer try/except in `ApplicationReviewView.post()` that catches generic `Exception` and returns a response containing `traceback.format_exc()` output
2. THE Review_Endpoint SHALL delegate error handling to the standard `envelope_exception_handler` for unhandled exceptions
3. THE Platform SHALL not include Python traceback strings, file paths, or line numbers in any HTTP response body returned to API consumers

### Requirement 8: Frontend-Backend Response Shape Alignment

**User Story:** As a student or admin using the admissions frontend, I want every page to load without "unexpected error" messages, so that the frontend correctly parses all backend responses.

#### Acceptance Criteria

1. THE frontend admin dashboard service SHALL parse the `/api/v1/admin/dashboard/` response shape correctly, mapping `applications.by_status`, `applications.total`, `users.total`, `users.active`, and `recent_activity` to the dashboard UI components
2. THE frontend SSE service SHALL handle connection failures to `/api/v1/events/stream/` gracefully by falling back to polling `/api/v1/events/poll/` without flooding the console with errors
3. THE frontend application service SHALL parse the `/api/v1/applications/` list response shape correctly, including all fields added during the model alignment (country, additional_subjects, etc.)
4. THE frontend notification service SHALL parse the `/api/v1/notifications/` response shape correctly, including new fields (priority, action_url, metadata, read_at)
5. THE frontend session service SHALL parse the `/api/v1/sessions/` response shape correctly with the updated DeviceSession fields (device_id, session_token, ip_address, user_agent, last_activity)
6. WHEN the backend returns a field that the frontend TypeScript types do not include, THE frontend SHALL not crash — it SHALL ignore unknown fields gracefully
7. WHEN the backend omits a field that the frontend expects (null vs undefined), THE frontend SHALL handle both null and undefined without rendering errors

### Requirement 9: Comprehensive Endpoint E2E Verification

**User Story:** As a platform operator, I want every single API endpoint tested end-to-end against the live deployment, so that no endpoint returns 500 when accessed by the frontend.

#### Acceptance Criteria

1. THE following unauthenticated endpoints SHALL return HTTP 200: `/health/live/`, `/health/ready/`, `/api/v1/catalog/programs/`, `/api/v1/catalog/intakes/`, `/api/v1/catalog/subjects/`, `/api/v1/errors/report/` (POST with valid payload)
2. THE following authenticated student endpoints SHALL return HTTP 200: `/api/v1/applications/`, `/api/v1/applications/{id}/`, `/api/v1/notifications/`, `/api/v1/notifications/preferences/`, `/api/v1/sessions/`, `/api/v1/events/stream/`, `/api/v1/events/poll/`
3. THE following authenticated admin endpoints SHALL return HTTP 200: `/api/v1/admin/dashboard/`, `/api/v1/admin/users/`, `/api/v1/admin/users/{id}/`, `/api/v1/admin/settings/`, `/api/v1/admin/audit-logs/`
4. THE following state-changing endpoints SHALL return HTTP 200/201: `/api/v1/auth/login/` (POST), `/api/v1/auth/logout/` (POST), `/api/v1/applications/` (POST create), `/api/v1/applications/{id}/review/` (POST), `/api/v1/notifications/` (POST admin send), `/api/v1/notifications/{id}/read/` (PUT)
5. EACH endpoint SHALL be verified against the live Neon database using Neon MCP to confirm that DB writes (login attempts, device sessions, CSRF tokens, applications, status history, audit logs, error logs) produce the expected rows
6. THE Platform SHALL produce zero raw Django 500 HTML error pages — all errors SHALL be returned as JSON envelope responses via the DRF exception handler
