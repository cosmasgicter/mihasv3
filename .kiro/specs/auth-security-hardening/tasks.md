# Implementation Plan: Auth Security Hardening

## Overview

This implementation plan covers the complete replacement of Supabase Auth with a custom Bun-native authentication system, Arcjet security integration, database abstraction layer, and Bun-native realtime. Tasks are ordered to build incrementally with early validation of core functionality.

## Tasks

- [ ] 1. Database schema and abstraction layer
  - [x] 1.1 Create database migration for auth columns
    - Add `password_hash`, `refresh_token_hash`, `password_changed_at`, `failed_login_attempts`, `locked_until` columns to profiles table
    - Create `device_sessions` table with indexes
    - Create indexes for email and refresh token lookups
    - _Requirements: 6.1, 6.2, 11.5_

  - [x] 1.2 Implement database abstraction layer (`api/_lib/db.ts`)
    - Create `QueryConfig` and `QueryResult` interfaces
    - Implement `detectDatabaseType()` from connection string
    - Implement Supabase REST driver for queries
    - Implement Neon serverless driver for queries
    - Implement `query<T>()` with parameterized queries
    - Implement `transaction()` for explicit transaction boundaries
    - Implement `verifyDatabaseSchema()` for startup validation
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.8, 6.9_

  - [x] 1.3 Implement typed query builders (`api/_lib/queries.ts`)
    - Create `UserQueries` for profiles table operations
    - Create `SessionQueries` for device_sessions operations
    - Create `AuditQueries` for audit_logs operations
    - Flag any vendor-specific SQL with comments
    - _Requirements: 6.7, 6.10_

  - [x] 1.4 Write property tests for database abstraction
    - **Property 1: Parameterized queries prevent SQL injection**
    - *For any* user input containing SQL injection patterns, the query builder SHALL escape or parameterize the input
    - **Validates: Requirements 6.2**

- [x] 2. Checkpoint - Database layer validation
  - Ensure database migrations apply cleanly
  - Verify schema detection works for both Supabase and Neon connection strings
  - Ask the user if questions arise

- [ ] 3. Core authentication components
  - [x] 3.1 Implement password hasher (`api/_lib/auth/password.ts`)
    - Implement `hashPassword()` using bcrypt with 12 rounds
    - Implement `verifyPassword()` for bcrypt comparison
    - Use Bun-native crypto exclusively
    - _Requirements: 1.6, 1.8_

  - [x] 3.2 Write property tests for password hasher
    - **Property 2: Password hash round-trip**
    - *For any* valid password string, hashing then verifying SHALL return true
    - **Validates: Requirements 1.6**

  - [x] 3.3 Implement JWT manager (`api/_lib/auth/jwt.ts`)
    - Implement `generateAccessToken()` with 15-minute expiration
    - Implement `generateRefreshToken()` with 7-day expiration
    - Implement `verifyAccessToken()` with signature, expiration, issuer, audience validation
    - Implement `verifyRefreshToken()` with separate secret
    - Use HS256 algorithm for signing
    - Include user ID, email, role, permissions in access token
    - Include only user ID and token type in refresh token
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.9, 3.10_

  - [x] 3.4 Write property tests for JWT manager
    - **Property 3: Access token round-trip**
    - *For any* valid user data, generating then verifying an access token SHALL return the original claims
    - **Validates: Requirements 3.1, 3.3, 3.5**
    - **Property 4: Token type separation**
    - *For any* access token, attempting to verify it as a refresh token SHALL fail
    - **Validates: Requirements 3.9**

  - [x] 3.5 Implement cookie manager (`api/_lib/auth/cookies.ts`)
    - Implement `setAuthCookies()` with HttpOnly, Secure, SameSite=Strict flags
    - Set access token cookie with 900s Max-Age
    - Set refresh token cookie with 604800s Max-Age and path=/api/auth
    - Implement `clearAuthCookies()` with Max-Age=0
    - Implement `extractBearerToken()` for API flexibility
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [x] 3.6 Write property tests for cookie manager
    - **Property 5: Cookie security flags**
    - *For any* auth cookie set in production, the cookie SHALL have HttpOnly, Secure, and SameSite=Strict flags
    - **Validates: Requirements 4.1, 4.2, 4.3**

- [x] 4. Checkpoint - Auth components validation
  - Ensure password hashing works with bcrypt
  - Verify JWT generation and verification
  - Verify cookie security flags are set correctly
  - Ask the user if questions arise

- [x] 5. Arcjet security perimeter
  - [x] 5.1 Implement Arcjet shield (`api/_lib/arcjet.ts`)
    - Configure shield rules for attack protection
    - Configure bot detection
    - Configure route-specific rate limits (auth: 5/5min, session: 30/10min, admin: 20/10min)
    - Implement `withArcjetProtection()` wrapper
    - Implement `arcjetProtect()` for manual protection
    - Return 403 with code "SECURITY_VIOLATION" on block
    - Return 503 on Arcjet service unavailable (fail secure)
    - Log block reasons without exposing internal state
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_

  - [x] 5.2 Write unit tests for Arcjet integration
    - Test rate limit configurations are correct
    - Test blocked requests return 403 with correct code
    - Test service unavailable returns 503
    - _Requirements: 2.5, 2.7, 2.8_

- [ ] 6. Auth middleware and RBAC
  - [-] 6.1 Implement auth middleware (`api/_lib/auth/middleware.ts`)
    - Implement `getAuthUser()` to extract user from token
    - Implement `requireAuth()` that throws if not authenticated
    - Implement `requireRole()` that throws if user lacks required role
    - Support both cookie-based and Bearer token authentication
    - _Requirements: 8.5, 8.6, 4.8_

  - [~] 6.2 Implement role-based permissions (`api/_lib/auth/permissions.ts`)
    - Define `USER_ROLES` constant
    - Define `ROLE_PERMISSIONS` mapping (deterministic, no DB lookup)
    - Implement `hasPermission()` check
    - Log authorization failures to audit_logs
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.8_

  - [~] 6.3 Write property tests for RBAC
    - **Property 6: Permission determinism**
    - *For any* user role, the permissions returned SHALL be identical across all invocations without database access
    - **Validates: Requirements 8.3**

- [ ] 7. Auth API endpoint
  - [~] 7.1 Implement login action (`api/auth.ts` - login case)
    - Wrap with Arcjet protection
    - Find user by email
    - Verify password with bcrypt
    - Generate access and refresh tokens
    - Store refresh token hash in database
    - Set HTTP-only cookies
    - Create device session record
    - Return 401 without revealing email/password specificity
    - _Requirements: 1.1, 1.2, 1.7, 3.8, 5.1_

  - [~] 7.2 Implement logout action (`api/auth.ts` - logout case)
    - Require authentication
    - Clear auth cookies
    - Revoke refresh token (set hash to null)
    - Deactivate current session
    - Log to audit_logs
    - _Requirements: 1.3, 5.2_

  - [~] 7.3 Implement refresh action (`api/auth.ts` - refresh case)
    - Extract refresh token from cookie
    - Verify refresh token
    - Check token hash matches database (replay attack prevention)
    - Rotate both access and refresh tokens
    - Update refresh token hash in database
    - _Requirements: 1.4, 1.9, 3.7_

  - [~] 7.4 Implement session action (`api/auth.ts` - session case)
    - Require authentication
    - Return user session info with role and permissions
    - _Requirements: 1.5_

  - [~] 7.5 Write property tests for auth API
    - **Property 7: Token rotation on refresh**
    - *For any* valid refresh operation, the new refresh token hash SHALL differ from the previous hash
    - **Validates: Requirements 1.4, 3.7**
    - **Property 8: Replay attack prevention**
    - *For any* refresh token that has been used once, subsequent use SHALL be rejected
    - **Validates: Requirements 1.9**

- [ ] 8. Checkpoint - Auth API validation
  - Test login flow end-to-end
  - Test logout clears cookies and revokes tokens
  - Test token refresh rotates tokens
  - Verify Arcjet protection is active
  - Ask the user if questions arise

- [ ] 9. Session management
  - [~] 9.1 Implement session manager (`api/_lib/sessions.ts`)
    - Implement `createSession()` with device info and IP
    - Implement `updateActivity()` for last activity tracking
    - Implement `deactivateSession()` for logout
    - Implement `deactivateAllSessions()` for token revocation
    - Implement `getActiveSessions()` for user session list
    - Implement auto-deactivation for 30-day inactive sessions
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [~] 9.2 Implement sessions API (`api/sessions.ts`)
    - Wrap with Arcjet protection (30/10min rate limit)
    - Implement `track` action for device session tracking
    - Implement `list` action for viewing active sessions
    - Implement `revoke` action for deactivating specific session
    - Implement `revoke-all` action for deactivating all sessions
    - _Requirements: 5.6, 5.7_

  - [~] 9.3 Write property tests for session management
    - **Property 9: Session deactivation cascade**
    - *For any* user with multiple sessions, revoking all sessions SHALL result in zero active sessions
    - **Validates: Requirements 5.3, 5.7**

- [ ] 10. Error handling and logging
  - [~] 10.1 Implement error handler (`api/_lib/errorHandler.ts`)
    - Create `AuthError` class with code and sanitized message
    - Implement `sanitizeError()` to remove PII
    - Implement consistent JSON error responses
    - Use deterministic HTTP status codes (400, 401, 403, 429, 500)
    - Never expose stack traces in responses
    - _Requirements: 9.1, 9.2, 9.3, 9.5, 9.6_

  - [~] 10.2 Implement audit logger (`api/_lib/auditLogger.ts`)
    - Implement `logAuthEvent()` for authentication events
    - Implement `logAuthorizationFailure()` for RBAC failures
    - Sanitize all logged context (no passwords, tokens, secrets)
    - _Requirements: 9.4, 9.7, 8.8_

  - [~] 10.3 Write property tests for error handling
    - **Property 10: PII sanitization**
    - *For any* error message containing email, token, or password patterns, the sanitized output SHALL not contain those patterns
    - **Validates: Requirements 9.2, 9.7**

- [ ] 11. Checkpoint - Core auth system complete
  - Verify all auth flows work end-to-end
  - Verify error responses are consistent
  - Verify audit logging captures events without PII
  - Ask the user if questions arise

- [ ] 12. Realtime system
  - [~] 12.1 Implement SSE handler (`api/_lib/realtime.ts`)
    - Implement `initializeSSE()` for connection setup
    - Implement `sendSSEEvent()` for event streaming
    - Send keepalive pings every 15 seconds
    - Send recent event history (last 10) on connection
    - Support event replay with lastEventId
    - Handle Vercel 10-second timeout with reconnection
    - _Requirements: 7.1, 7.3, 7.5, 7.6, 7.8_

  - [~] 12.2 Implement polling fallback (`api/_lib/realtime.ts`)
    - Implement `getEventsForPolling()` for fallback
    - Support graceful degradation from SSE to polling
    - _Requirements: 7.2, 7.9_

  - [~] 12.3 Implement event broadcasting (`api/_lib/realtime.ts`)
    - Implement `broadcastToUser()` for user-specific events
    - Implement `broadcastToAll()` for global events
    - Support event types: application_update, notification, payment_update, interview_scheduled, document_processed, ping
    - _Requirements: 7.4, 7.7_

  - [~] 12.4 Implement realtime API (`api/realtime.ts`)
    - Require authentication for all actions
    - Implement `connect` action for SSE
    - Implement `poll` action for fallback
    - Zero Supabase Realtime dependencies
    - _Requirements: 7.10_

  - [~] 12.5 Write unit tests for realtime system
    - Test SSE event format is correct
    - Test event replay with lastEventId
    - Test polling returns correct events
    - _Requirements: 7.3, 7.6_

- [ ] 13. Migration safety
  - [~] 13.1 Implement legacy token support (`api/_lib/auth/legacy.ts`)
    - Implement `verifyLegacySupabaseToken()` for migration period
    - Create profile for users authenticated via legacy tokens if missing
    - Update password hash to bcrypt on new login
    - _Requirements: 11.1, 11.2, 11.3_

  - [~] 13.2 Ensure backward compatibility
    - Verify profiles table schema compatibility
    - Test existing users can authenticate
    - Test new columns don't break existing queries
    - _Requirements: 11.4, 11.6_

- [ ] 14. Frontend integration
  - [~] 14.1 Update auth store (`src/stores/authStore.ts`)
    - Implement automatic token refresh on 401
    - Implement exponential backoff on auth failures
    - Clear local auth state on logout
    - _Requirements: 10.1, 10.4, 10.7_

  - [~] 14.2 Update React Query auth hooks (`src/hooks/useAuth.ts`)
    - Implement `useSession()` hook with proper cache invalidation
    - Implement `useLogin()` mutation
    - Implement `useLogout()` mutation
    - Implement `useRefreshToken()` for automatic refresh
    - Redirect to login on refresh failure
    - _Requirements: 10.2, 10.3, 10.5, 10.6_

  - [~] 14.3 Write unit tests for frontend auth
    - Test automatic token refresh on 401
    - Test exponential backoff prevents retry storms
    - Test logout clears local state
    - _Requirements: 10.4, 10.7_

- [ ] 15. Admin API updates
  - [~] 15.1 Update admin API with Arcjet protection (`api/admin.ts`)
    - Wrap all actions with Arcjet protection (20/10min rate limit)
    - Require admin role for all actions
    - Implement user registration (admin only)
    - _Requirements: 2.3, 8.6_

- [ ] 16. Final checkpoint - Full system validation
  - Run all property tests and unit tests
  - Verify all Arcjet protections are active
  - Verify database abstraction works with both Supabase and Neon
  - Verify realtime system works with SSE and polling
  - Verify migration safety for existing users
  - Ask the user if questions arise

## Notes

- All tasks including tests are required for comprehensive coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check
- Unit tests validate specific examples and edge cases using Vitest
- All API endpoints use query parameter routing pattern (?action=xxx)
- All shared utilities go in `api/_lib/` directory
