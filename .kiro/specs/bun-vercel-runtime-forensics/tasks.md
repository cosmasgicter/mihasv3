# Implementation Plan: Bun/Vercel Runtime Forensics

## Overview

This implementation plan fixes the critical production failures in the MIHAS Application System following the Cloudflare → Vercel + Bun migration. The fixes are ordered by criticality: authentication first (blocking all users), then frontend loops, then cleanup.

## Tasks

- [x] 1. Fix Bun-safe JWT decoding in API
  - [x] 1.1 Create decodeBase64Url utility function
    - Add `decodeBase64Url(base64Url: string): string` function to `api/_lib/supabaseClient.ts`
    - Use `atob()` + `TextDecoder` instead of `Buffer.from()`
    - Handle URL-safe Base64 (replace `-` with `+`, `_` with `/`)
    - Add padding if needed
    - _Requirements: 3.1, 3.4_
  
  - [x] 1.2 Update getUserFromRequest to use new decoder
    - Replace `Buffer.from(parts[1], 'base64').toString('utf-8')` with `decodeBase64Url(parts[1])`
    - Preserve all existing error handling
    - _Requirements: 3.1, 3.3_
  
  - [x] 1.3 Write property test for JWT decoding round-trip
    - **Property 1: JWT Base64 URL-Safe Decoding Round-Trip**
    - **Validates: Requirements 3.1, 3.4**

- [x] 2. Fix API tsconfig.json module format
  - [x] 2.1 Update api/tsconfig.json to use ESM
    - Change `"module": "CommonJS"` to `"module": "ESNext"`
    - Change `"moduleResolution": "Node"` to `"moduleResolution": "Bundler"`
    - Update `"target"` to `"ES2022"`
    - _Requirements: 2.1, 2.2_

- [x] 3. Checkpoint - Verify API authentication works
  - Test `/api/auth-roles` endpoint with valid token
  - Test `/api/sessions?action=track` endpoint
  - Ensure all tests pass, ask the user if questions arise

- [x] 4. Fix frontend API URL alignment
  - [x] 4.1 Fix signup URL in useSessionListener
    - Change `fetch(\`${apiBaseUrl}/auth/signup\`)` to `fetch(\`${apiBaseUrl}/api/auth?action=signup\`)`
    - Location: `src/hooks/auth/useSessionListener.ts` line ~194
    - _Requirements: 1.1, 1.4_
  
  - [x] 4.2 Remove or fix syncUserRole function
    - Check if `syncUserRole` in `src/lib/api/authApi.ts` is used anywhere
    - If unused, remove the function
    - If used, implement `/api/auth?action=sync-roles` endpoint
    - _Requirements: 1.3_

- [x] 5. Fix React Query retry configuration
  - [x] 5.1 Update useSessionQuery retry logic
    - Add retry function that stops on 401/403 errors
    - Add exponential backoff with `retryDelay`
    - Location: `src/hooks/auth/useOptimizedAuthState.ts`
    - _Requirements: 5.1, 5.3, 5.4_
  
  - [x] 5.2 Update useProfileQueryOptimized retry logic
    - Apply same retry configuration as session query
    - _Requirements: 5.3_
  
  - [x] 5.3 Write property test for polling configuration
    - **Property 4: Polling Configuration Prevents Infinite Loops**
    - **Validates: Requirements 5.2, 5.3, 5.4**

- [x] 6. Checkpoint - Verify frontend auth flow works
  - Test signup flow end-to-end
  - Test login flow end-to-end
  - Verify no infinite polling loops
  - Ensure all tests pass, ask the user if questions arise

- [x] 7. Ensure JSON Content-Type on all API responses
  - [x] 7.1 Update sendError to set Content-Type header
    - Add `res.setHeader('Content-Type', 'application/json')` before returning
    - Location: `api/_lib/errorHandler.ts`
    - _Requirements: 4.1, 4.2_
  
  - [x] 7.2 Update sendSuccess to set Content-Type header
    - Add `res.setHeader('Content-Type', 'application/json')` before returning
    - _Requirements: 4.1_
  
  - [x] 7.3 Update catch-all 404 handler
    - Ensure `api/[...path].ts` returns JSON with correct Content-Type
    - _Requirements: 4.4_
  
  - [x] 7.4 Write property test for JSON responses
    - **Property 2: API Responses Are Always JSON**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

- [x] 8. Enhance error sanitization
  - [x] 8.1 Verify PII sanitization in errorHandler
    - Ensure email, phone, UUID, JWT patterns are sanitized
    - Verify no stack traces in production
    - Location: `api/_lib/errorHandler.ts`
    - _Requirements: 7.2, 7.3_
  
  - [x] 8.2 Write property test for error sanitization
    - **Property 3: Error Responses Are Sanitized**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 1.5**

- [x] 9. Checkpoint - Verify error handling
  - Test error responses are JSON
  - Test PII is sanitized from errors
  - Ensure all tests pass, ask the user if questions arise

- [x] 10. Verify authentication endpoints
  - [x] 10.1 Test auth-roles endpoint
    - Verify returns correct role data structure
    - Verify 401 on missing/invalid token
    - _Requirements: 9.4_
  
  - [x] 10.2 Test sessions endpoint
    - Verify session tracking works
    - Verify 401 on missing/invalid token
    - _Requirements: 9.3_
  
  - [x] 10.3 Write property test for auth status codes
    - **Property 5: Authentication Endpoints Return Correct Status Codes**
    - **Validates: Requirements 9.2, 9.4, 9.5**

- [x] 11. Verify no sensitive data leakage
  - [x] 11.1 Review database error handling
    - Ensure connection strings not exposed
    - Ensure credentials not exposed
    - _Requirements: 10.4_
  
  - [x] 11.2 Write property test for sensitive data
    - **Property 6: No Sensitive Data in Error Responses**
    - **Validates: Requirements 10.4, 7.2, 11.1**

- [x] 12. Final checkpoint - Full system validation
  - [x] 12.1 Run all property tests
    - Execute property tests with 100+ iterations each
    - Verify all 6 properties pass
    - _Requirements: All correctness properties_
  
  - [x] 12.2 Run integration tests
    - Test complete signup flow
    - Test complete login flow
    - Test auth-roles endpoint
    - Test session tracking
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  
  - [x] 12.3 Verify no infinite loops
    - Monitor network requests during auth failure
    - Verify retry limits are respected
    - _Requirements: 5.1, 5.3_
  
  - [x] 12.4 Verify MIME types
    - Check JavaScript files load correctly
    - Verify no text/html for JS modules
    - _Requirements: 6.1, 6.2, 6.3_

## Notes

- All property tests are REQUIRED for comprehensive validation
- Authentication fixes (Tasks 1-3) are highest priority - they block all users
- Frontend fixes (Tasks 4-6) prevent browser freezing
- Error handling fixes (Tasks 7-9) improve debugging and security
- Bun MUST remain the runtime - do not suggest switching to Node.js
- All fixes must maintain backward compatibility with existing data
- Never log PII in any error messages or responses

