# Requirements Document

## Introduction

This document specifies the requirements for a critical system stabilization and security hardening project for the MIHAS Application System. The system is currently unstable after multiple migrations (Cloudflare → Vercel, Node.js → Bun) with broken authentication, session management, and cascading frontend failures. This project replaces Supabase Auth entirely with a custom Bun-native authentication system, integrates Arcjet security perimeter, implements Bun-native realtime, and abstracts the database layer for future Neon migration.

## Glossary

- **Auth_System**: The custom Bun-native authentication system that replaces Supabase Auth entirely
- **Arcjet_Shield**: The security perimeter that protects sensitive API routes with shield rules, bot detection, and rate limiting
- **JWT_Manager**: The component responsible for generating, verifying, and refreshing JWT access and refresh tokens
- **Session_Manager**: The component that handles secure session storage, invalidation, and refresh mechanisms
- **DB_Abstraction_Layer**: The database abstraction that enables migration from Supabase Postgres to Neon Postgres
- **Realtime_System**: The Bun-native SSE/polling implementation that replaces Supabase Realtime
- **Access_Token**: Short-lived JWT (15 minutes) containing user ID, email, role, and permissions
- **Refresh_Token**: Long-lived JWT (7 days) used to obtain new access tokens
- **HTTP_Only_Cookie**: Secure cookie that cannot be accessed by JavaScript, preventing XSS token theft
- **Rate_Limiter**: Component that throttles requests per IP/fingerprint to prevent brute force attacks
- **Password_Hasher**: Component using bcrypt/Argon2 for secure password storage

## Requirements

### Requirement 1: Custom Authentication System

**User Story:** As a system administrator, I want a custom Bun-native authentication system that replaces Supabase Auth entirely, so that the system has stable, predictable authentication without external dependencies.

#### Acceptance Criteria

1. WHEN a user submits valid credentials to POST /api/auth?action=login, THE Auth_System SHALL authenticate the user and return JWT tokens in HTTP-only cookies
2. WHEN a user submits invalid credentials to POST /api/auth?action=login, THE Auth_System SHALL return a 401 Unauthorized response without revealing whether email or password was incorrect
3. WHEN a user calls POST /api/auth?action=logout, THE Auth_System SHALL clear all auth cookies and revoke the refresh token
4. WHEN a user calls POST /api/auth?action=refresh with a valid refresh token, THE Auth_System SHALL issue new access and refresh tokens (token rotation)
5. WHEN a user calls GET /api/auth?action=session with a valid access token, THE Auth_System SHALL return the current user's session information including role and permissions
6. THE Password_Hasher SHALL use bcrypt with minimum 12 rounds for all password hashing operations
7. THE JWT_Manager SHALL embed user role and permissions directly in the access token payload
8. THE Auth_System SHALL use Bun-native crypto exclusively with zero Supabase Auth SDK dependencies
9. IF a refresh token has been used previously, THEN THE Auth_System SHALL reject it and require re-authentication (replay attack prevention)
10. WHEN generating tokens, THE JWT_Manager SHALL use separate secrets for access tokens (JWT_SECRET) and refresh tokens (JWT_REFRESH_SECRET)

### Requirement 2: Arcjet Security Perimeter

**User Story:** As a security engineer, I want Arcjet integrated as a security perimeter before any handler logic executes, so that malicious requests are blocked before reaching the database or triggering retries.

#### Acceptance Criteria

1. WHEN any request arrives at /api/auth/*, THE Arcjet_Shield SHALL execute shield rules, bot detection, and rate limiting before handler logic
2. WHEN any request arrives at /api/sessions/*, THE Arcjet_Shield SHALL execute protection rules before handler logic
3. WHEN any request arrives at /api/admin/*, THE Arcjet_Shield SHALL execute protection rules before handler logic
4. WHEN any request arrives at /api/notifications/*, THE Arcjet_Shield SHALL execute protection rules before handler logic
5. WHEN Arcjet blocks a request, THE Arcjet_Shield SHALL return a deterministic 403 response with code "SECURITY_VIOLATION"
6. WHEN Arcjet blocks a request, THE Arcjet_Shield SHALL log the block reason for security audit without exposing internal state
7. THE Arcjet_Shield SHALL enforce route-specific rate limits: auth routes (5 requests per 5 minutes), session routes (30 per 10 minutes), admin routes (20 per 10 minutes)
8. IF Arcjet service is unavailable, THEN THE Arcjet_Shield SHALL fail secure by blocking the request with a 503 response
9. WHEN a request is blocked by Arcjet, THE Arcjet_Shield SHALL ensure the request never reaches the database
10. THE Arcjet_Shield SHALL use IP address and fingerprint characteristics for throttling

### Requirement 3: JWT Token Management

**User Story:** As a developer, I want secure JWT token management with proper expiration, rotation, and validation, so that authentication is both secure and user-friendly.

#### Acceptance Criteria

1. THE JWT_Manager SHALL generate access tokens with 15-minute expiration
2. THE JWT_Manager SHALL generate refresh tokens with 7-day expiration
3. WHEN verifying an access token, THE JWT_Manager SHALL validate signature, expiration, issuer, and audience claims
4. WHEN verifying a refresh token, THE JWT_Manager SHALL use a separate secret from access tokens
5. THE JWT_Manager SHALL include user ID (sub), email, role, and permissions array in access token payload
6. THE JWT_Manager SHALL include only user ID (sub) and token type in refresh token payload
7. WHEN a token refresh occurs, THE JWT_Manager SHALL rotate both access and refresh tokens
8. THE JWT_Manager SHALL store refresh token hash in database for revocation capability
9. IF an access token is used as a refresh token, THEN THE JWT_Manager SHALL reject it with an error
10. THE JWT_Manager SHALL use HS256 algorithm for all token signing operations

### Requirement 4: HTTP-Only Cookie Security

**User Story:** As a security engineer, I want tokens stored in HTTP-only cookies with proper security flags, so that tokens are protected from XSS attacks and CSRF vulnerabilities.

#### Acceptance Criteria

1. WHEN setting auth cookies, THE Auth_System SHALL set the HttpOnly flag to prevent JavaScript access
2. WHEN setting auth cookies in production, THE Auth_System SHALL set the Secure flag to require HTTPS
3. WHEN setting auth cookies, THE Auth_System SHALL set SameSite=Strict to prevent CSRF attacks
4. THE Auth_System SHALL set access token cookie with Max-Age of 900 seconds (15 minutes)
5. THE Auth_System SHALL set refresh token cookie with Max-Age of 604800 seconds (7 days)
6. THE Auth_System SHALL set refresh token cookie path to /api/auth to limit exposure
7. WHEN logging out, THE Auth_System SHALL clear cookies by setting Max-Age to 0
8. THE Auth_System SHALL support both cookie-based and Bearer token authentication for API flexibility

### Requirement 5: Session Management

**User Story:** As a user, I want secure session management that tracks my devices and allows me to invalidate sessions, so that I have control over my account security.

#### Acceptance Criteria

1. WHEN a user logs in, THE Session_Manager SHALL create a session record with device info and IP address
2. WHEN a user logs out, THE Session_Manager SHALL deactivate the current session
3. WHEN a user's refresh token is revoked, THE Session_Manager SHALL invalidate all associated sessions
4. THE Session_Manager SHALL track last activity timestamp for each session
5. WHEN a session is inactive for 30 days, THE Session_Manager SHALL automatically deactivate it
6. THE Session_Manager SHALL allow users to view their active sessions
7. THE Session_Manager SHALL allow users to deactivate sessions on other devices
8. THE Session_Manager SHALL log all session events to audit_logs table

### Requirement 6: Database Abstraction Layer

**User Story:** As a system architect, I want a database abstraction layer that enables migration from Supabase Postgres to Neon Postgres, so that the system can be migrated with zero business logic changes.

#### Acceptance Criteria

1. THE DB_Abstraction_Layer SHALL use plain SQL only with no Supabase-specific features (no RPC, no magic)
2. THE DB_Abstraction_Layer SHALL support parameterized queries to prevent SQL injection
3. THE DB_Abstraction_Layer SHALL detect database type from connection string (Supabase vs Neon)
4. WHEN using Supabase, THE DB_Abstraction_Layer SHALL execute queries via REST API
5. WHEN using Neon, THE DB_Abstraction_Layer SHALL execute queries via @neondatabase/serverless driver
6. THE DB_Abstraction_Layer SHALL support explicit transaction boundaries (BEGIN, COMMIT, ROLLBACK)
7. THE DB_Abstraction_Layer SHALL provide typed query builders for common operations (users, sessions)
8. IF a database error occurs, THEN THE DB_Abstraction_Layer SHALL throw a typed DatabaseError with code and query context
9. THE DB_Abstraction_Layer SHALL verify database schema on startup and report missing tables
10. THE DB_Abstraction_Layer SHALL flag any vendor-specific SQL for migration review

### Requirement 7: Bun-Native Realtime System

**User Story:** As a user, I want real-time updates for my application status, notifications, and payments, so that I don't have to manually refresh the page.

#### Acceptance Criteria

1. THE Realtime_System SHALL implement Server-Sent Events (SSE) for server-to-client streaming
2. THE Realtime_System SHALL implement controlled polling as a fallback for clients that cannot use SSE
3. WHEN an SSE connection is established, THE Realtime_System SHALL send recent event history (last 10 events)
4. THE Realtime_System SHALL support event types: application_update, notification, payment_update, interview_scheduled, document_processed, ping
5. THE Realtime_System SHALL send keepalive pings every 15 seconds to maintain connection
6. WHEN a client reconnects with lastEventId, THE Realtime_System SHALL replay missed events
7. THE Realtime_System SHALL broadcast events to specific users or all connected users
8. THE Realtime_System SHALL work within Vercel serverless limits (10-second timeout with automatic reconnection)
9. IF SSE connection fails, THEN THE Realtime_System SHALL gracefully degrade to polling
10. THE Realtime_System SHALL have zero Supabase Realtime dependencies

### Requirement 8: Role-Based Access Control

**User Story:** As an administrator, I want role-based access control with permissions embedded in tokens, so that authorization decisions are fast and don't require database lookups.

#### Acceptance Criteria

1. THE Auth_System SHALL support roles: super_admin, admin, reviewer, student
2. WHEN generating tokens, THE JWT_Manager SHALL embed role-specific permissions in the payload
3. THE Auth_System SHALL define deterministic permission sets for each role without database lookup
4. WHEN a protected route is accessed, THE Auth_System SHALL verify permissions from the token payload
5. THE Auth_System SHALL provide requireAuth middleware that throws if not authenticated
6. THE Auth_System SHALL provide requireRole middleware that throws if user lacks required role
7. IF a user's role changes, THEN THE Auth_System SHALL require re-authentication to update token claims
8. THE Auth_System SHALL log all authorization failures to audit_logs

### Requirement 9: Error Handling and Logging

**User Story:** As a developer, I want consistent error handling that never exposes sensitive information, so that the system is secure and debuggable.

#### Acceptance Criteria

1. THE Auth_System SHALL never expose whether an email exists during login failures
2. THE Auth_System SHALL sanitize all error messages to remove PII (emails, IDs, tokens, paths)
3. THE Auth_System SHALL return consistent JSON error responses with success, error, and code fields
4. THE Auth_System SHALL log all authentication events with sanitized context
5. IF an unexpected error occurs, THEN THE Auth_System SHALL return a generic 500 response without stack traces
6. THE Auth_System SHALL use deterministic HTTP status codes: 400 (validation), 401 (auth), 403 (forbidden), 429 (rate limit), 500 (internal)
7. THE Auth_System SHALL never log passwords, tokens, or other secrets

### Requirement 10: Frontend Integration

**User Story:** As a frontend developer, I want clear API contracts and automatic token refresh, so that authentication is seamless for users.

#### Acceptance Criteria

1. THE Auth_System SHALL support automatic token refresh via refresh token cookie
2. WHEN an access token expires, THE frontend SHALL automatically call /api/auth?action=refresh
3. IF token refresh fails, THEN THE frontend SHALL redirect to login page
4. THE frontend SHALL stop retry storms by implementing exponential backoff on auth failures
5. THE frontend SHALL use React Query for auth state management with proper cache invalidation
6. WHEN a 401 response is received, THE frontend SHALL attempt one token refresh before redirecting to login
7. THE frontend SHALL clear local auth state on logout

### Requirement 11: Migration Safety

**User Story:** As a system administrator, I want migration safety guarantees, so that existing users are not locked out during the transition.

#### Acceptance Criteria

1. THE Auth_System SHALL support reading existing Supabase JWT tokens during migration period
2. THE Auth_System SHALL create profiles for users authenticated via legacy tokens if profile doesn't exist
3. WHEN a user logs in with new system, THE Auth_System SHALL update their password hash to bcrypt format
4. THE Auth_System SHALL maintain backward compatibility with existing profiles table schema
5. THE Auth_System SHALL add password_hash and refresh_token_hash columns to profiles table via migration
6. IF legacy token validation fails, THEN THE Auth_System SHALL require user to re-authenticate with new system
