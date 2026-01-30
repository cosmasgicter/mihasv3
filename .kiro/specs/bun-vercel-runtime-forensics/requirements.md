# Requirements Document

## Introduction

This document specifies the requirements for a forensic investigation and fix of the MIHAS Application System following the Cloudflare → Vercel + Bun migration. The system is experiencing critical production failures including 500 Internal Server Errors on API endpoints, infinite polling loops on the frontend, and MIME type errors preventing JavaScript module loading. This is a PRODUCTION-CRITICAL system with real students actively using it.

## Glossary

- **MIHAS**: Mukuba Institute of Health and Allied Sciences - the educational institution this system serves
- **Bun_Runtime**: A fast JavaScript runtime that must remain as the project runtime (non-negotiable)
- **Vercel_Functions**: Serverless functions running on Vercel's infrastructure
- **API_Consolidation**: The pattern of combining multiple endpoints into single files with query parameter routing
- **JWT_Decoding**: The process of extracting user information from JSON Web Tokens for authentication
- **CORS**: Cross-Origin Resource Sharing - security mechanism for API access control
- **MIME_Type**: Media type identifier that tells browsers how to handle file content
- **Polling**: Periodic API requests to fetch updated data (replacement for Supabase Realtime)
- **ESM**: ECMAScript Modules - the modern JavaScript module system using import/export
- **CommonJS**: Legacy Node.js module system using require/module.exports

## Requirements

### Requirement 1: API Endpoint URL Alignment

**User Story:** As a student, I want the authentication system to work correctly, so that I can log in and access my application.

#### Acceptance Criteria

1. WHEN the frontend calls `/auth/signup`, THE API_Router SHALL route to `/api/auth?action=signup`
2. WHEN the frontend calls `/api/auth-roles`, THE API_Router SHALL return user roles and permissions
3. WHEN the frontend calls `/api/auth-sync-roles`, THE System SHALL either route to a valid endpoint or the frontend SHALL be updated to use the correct endpoint
4. THE Frontend SHALL use consistent API URL patterns matching the consolidated endpoint structure
5. IF an API endpoint URL is incorrect, THEN THE System SHALL log the mismatch without exposing PII

### Requirement 2: Module System Consistency

**User Story:** As a developer, I want the API functions to use a consistent module system, so that they execute correctly under Vercel's runtime.

#### Acceptance Criteria

1. THE api/tsconfig.json SHALL use ESM module format to match package.json's `"type": "module"`
2. WHEN Vercel compiles API functions, THE Build_System SHALL produce valid ESM output
3. THE API_Functions SHALL NOT mix CommonJS and ESM syntax within the same file
4. IF a module format mismatch occurs, THEN THE Build_System SHALL fail with a clear error message
5. THE api/_lib/ shared utilities SHALL export using ESM syntax consistently

### Requirement 3: JWT Decoding Bun Compatibility

**User Story:** As a system administrator, I want JWT authentication to work correctly under Bun runtime, so that users can authenticate without errors.

#### Acceptance Criteria

1. WHEN decoding JWT tokens, THE Auth_System SHALL use Bun-compatible Base64 decoding
2. THE Auth_System SHALL NOT rely on Node.js-specific Buffer APIs that behave differently in Bun
3. WHEN a JWT token is malformed, THE Auth_System SHALL return a 401 error without exposing token details
4. THE Auth_System SHALL handle URL-safe Base64 encoding correctly (replacing `-` with `+` and `_` with `/`)
5. IF Buffer.from() behaves differently in Bun, THEN THE Auth_System SHALL use an alternative decoding method

### Requirement 4: API Response Content-Type Headers

**User Story:** As a frontend developer, I want API responses to have correct Content-Type headers, so that the browser handles them correctly.

#### Acceptance Criteria

1. WHEN an API endpoint returns JSON, THE Response SHALL include `Content-Type: application/json` header
2. WHEN an API endpoint returns an error, THE Response SHALL be JSON format, not HTML
3. THE API_Functions SHALL NOT return HTML error pages for API routes
4. WHEN Vercel's catch-all route handles a request, THE Response SHALL be JSON with appropriate status code
5. IF an unhandled exception occurs, THEN THE Error_Handler SHALL return JSON error response

### Requirement 5: Frontend Polling Loop Prevention

**User Story:** As a student, I want the application to load without freezing or excessive network requests, so that I can use it on slow connections.

#### Acceptance Criteria

1. WHEN authentication fails, THE Frontend SHALL stop retry attempts after a maximum of 3 retries
2. THE React_Query configuration SHALL have appropriate staleTime to prevent excessive refetching
3. WHEN an API returns 401 Unauthorized, THE Frontend SHALL NOT continuously retry the same request
4. THE Polling_System SHALL use exponential backoff for failed requests
5. IF the user is not authenticated, THEN THE Frontend SHALL redirect to login instead of polling indefinitely

### Requirement 6: MIME Type Correctness

**User Story:** As a user, I want JavaScript files to load correctly, so that the application functions properly.

#### Acceptance Criteria

1. WHEN serving JavaScript files, THE Server SHALL use `Content-Type: application/javascript` or `text/javascript`
2. THE Vercel_Rewrites SHALL NOT intercept requests for static JavaScript assets
3. WHEN a JavaScript module fails to load, THE System SHALL NOT serve index.html with `text/html` MIME type
4. THE Build_Output SHALL place JavaScript files in locations that don't conflict with API routes
5. IF a MIME type error occurs, THEN THE System SHALL log the requested path for debugging

### Requirement 7: Error Response Consistency

**User Story:** As a frontend developer, I want consistent error responses from all API endpoints, so that I can handle errors uniformly.

#### Acceptance Criteria

1. THE API_Endpoints SHALL return errors in format `{ success: false, error: string, code?: string }`
2. WHEN an exception occurs, THE Error_Handler SHALL sanitize the error message to remove PII
3. THE API_Endpoints SHALL NOT expose stack traces in production responses
4. WHEN a 500 error occurs, THE Response SHALL include a generic error message
5. IF database errors occur, THEN THE Error_Handler SHALL return "Service temporarily unavailable"

### Requirement 8: Vercel Function Configuration

**User Story:** As a system administrator, I want Vercel functions to be configured correctly, so that they execute without runtime errors.

#### Acceptance Criteria

1. THE vercel.json SHALL include all API endpoints in the functions configuration
2. WHEN an API endpoint is missing from vercel.json, THE System SHALL still route to it via catch-all
3. THE Function_Configuration SHALL specify appropriate maxDuration for each endpoint
4. THE Rewrites SHALL prioritize specific API routes over the catch-all SPA route
5. IF a function times out, THEN THE Response SHALL indicate timeout rather than generic error

### Requirement 9: Authentication Flow Integrity

**User Story:** As a student, I want to sign up and log in without errors, so that I can submit my application.

#### Acceptance Criteria

1. WHEN a user signs up, THE System SHALL create their account and profile atomically
2. WHEN a user logs in, THE System SHALL return session data and user profile
3. THE Session_Tracking SHALL work correctly with the consolidated `/api/sessions?action=track` endpoint
4. WHEN fetching user roles, THE `/api/auth-roles` endpoint SHALL return valid role data
5. IF authentication fails, THEN THE System SHALL return appropriate error codes (401, 403)

### Requirement 10: Database Query Compatibility

**User Story:** As a system administrator, I want database queries to work correctly under Bun runtime, so that data operations succeed.

#### Acceptance Criteria

1. THE Supabase_Client SHALL initialize correctly under Bun runtime
2. WHEN querying the database, THE System SHALL handle connection pooling appropriately
3. THE Database_Queries SHALL NOT timeout due to Bun-specific connection handling
4. WHEN a database error occurs, THE System SHALL NOT expose connection strings or credentials
5. IF Supabase client behaves differently in Bun, THEN THE System SHALL use compatible configuration

