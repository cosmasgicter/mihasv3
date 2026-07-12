# Requirements Document

## Introduction

This document specifies the requirements for fixing critical production issues on the MIHAS Vercel deployment. The system is currently experiencing API routing failures where serverless functions return HTML instead of JSON, missing security headers, and duplicate manifest files causing PWA confusion.

## Glossary

- **Vercel_Router**: The Vercel routing system that processes incoming requests and directs them to appropriate handlers (static files or serverless functions)
- **Serverless_Function**: A TypeScript function in the `api/` directory that handles API requests and returns JSON responses
- **Security_Headers**: HTTP response headers that protect against common web vulnerabilities (CSP, Permissions-Policy, etc.)
- **Health_Endpoint**: An API endpoint that returns system status information for monitoring and deployment verification
- **PWA_Manifest**: A JSON file that defines how the Progressive Web App appears and behaves when installed
- **CSP**: Content-Security-Policy header that controls which resources the browser is allowed to load
- **Rewrite_Rule**: A Vercel configuration that maps incoming URL patterns to destination handlers

## Requirements

### Requirement 1: API Route Resolution

**User Story:** As a system administrator, I want API routes to correctly invoke serverless functions, so that the backend API is functional and returns JSON responses.

#### Acceptance Criteria

1. WHEN a request is made to `/api/auth?action=login` THEN the Vercel_Router SHALL invoke the `api/auth.ts` serverless function and return a JSON response
2. WHEN a request is made to `/api/applications?action=details` THEN the Vercel_Router SHALL invoke the `api/applications.ts` serverless function and return a JSON response
3. WHEN a request is made to any `/api/*` path THEN the Vercel_Router SHALL NOT return the index.html file
4. WHEN a request is made to `/api/health` THEN the Vercel_Router SHALL invoke a health check serverless function
5. IF a serverless function does not exist for a requested API path THEN the Vercel_Router SHALL return a 404 JSON error response

### Requirement 2: Health Check Endpoint

**User Story:** As a DevOps engineer, I want a health check endpoint that returns proper JSON, so that I can monitor deployment status and verify the API is functional.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/health` THEN the Health_Endpoint SHALL return a JSON response with status "ok"
2. WHEN a GET request is made to `/api/health` THEN the Health_Endpoint SHALL include a timestamp in the response
3. WHEN a GET request is made to `/api/health` THEN the Health_Endpoint SHALL include the environment name (production/development)
4. WHEN a GET request is made to `/api/health` THEN the Health_Endpoint SHALL return HTTP status code 200
5. THE Health_Endpoint SHALL handle CORS preflight requests correctly

### Requirement 3: Security Headers Configuration

**User Story:** As a security engineer, I want proper security headers on all responses, so that the application is protected against common web vulnerabilities.

#### Acceptance Criteria

1. THE Vercel_Router SHALL include a Content-Security-Policy header on all HTML responses
2. THE Vercel_Router SHALL include a Permissions-Policy header on all responses
3. WHEN the CSP header is set THEN it SHALL allow connections to Supabase domains (`*.supabase.co`)
4. WHEN the CSP header is set THEN it SHALL allow inline scripts and styles required by the application
5. WHEN the Permissions-Policy header is set THEN it SHALL disable camera, microphone, and geolocation by default
6. THE Vercel_Router SHALL include X-Frame-Options: DENY on all responses
7. THE Vercel_Router SHALL include X-Content-Type-Options: nosniff on all responses
8. THE Vercel_Router SHALL include Strict-Transport-Security header on all responses

### Requirement 4: PWA Manifest Consolidation

**User Story:** As a frontend developer, I want a single canonical manifest file, so that PWA installation works consistently across browsers.

#### Acceptance Criteria

1. THE PWA_Manifest SHALL exist at exactly one canonical path (`/manifest.json`)
2. WHEN the index.html references the manifest THEN it SHALL use the canonical path `/manifest.json`
3. IF a duplicate manifest file exists at `/manifest.webmanifest` THEN it SHALL be removed
4. THE PWA_Manifest SHALL include all required PWA fields (name, short_name, icons, start_url, display)
5. THE PWA_Manifest SHALL be served with correct Content-Type header (`application/manifest+json`)

### Requirement 5: Vercel Configuration Cleanup

**User Story:** As a DevOps engineer, I want clean Vercel configuration without Cloudflare-specific artifacts, so that the deployment works correctly on Vercel.

#### Acceptance Criteria

1. THE vercel.json SHALL NOT contain Cloudflare-specific configuration
2. THE vercel.json rewrite rules SHALL prioritize API routes over the SPA fallback
3. WHEN static files are requested THEN the Vercel_Router SHALL serve them directly without invoking serverless functions
4. THE public directory SHALL NOT contain Cloudflare-specific files (`_routes.json`, `_headers`)
5. IF Cloudflare-specific files exist THEN they SHALL be removed or converted to Vercel equivalents

### Requirement 6: API Error Handling

**User Story:** As a developer, I want consistent error responses from the API, so that frontend error handling works reliably.

#### Acceptance Criteria

1. WHEN an API endpoint receives an invalid action parameter THEN it SHALL return a JSON error with HTTP status 400
2. WHEN an API endpoint encounters an internal error THEN it SHALL return a JSON error with HTTP status 500
3. WHEN an API endpoint is called with wrong HTTP method THEN it SHALL return a JSON error with HTTP status 405
4. THE error response format SHALL be consistent: `{ success: false, error: string, code?: string }`
5. THE API SHALL NOT expose stack traces or internal error details in responses
