# Implementation Plan: Vercel Production Fixes

## Overview

This implementation plan addresses critical production issues on the MIHAS Vercel deployment. The tasks are ordered to fix the most critical issue first (API routing), then add the health endpoint, security headers, and finally clean up Cloudflare artifacts.

## Tasks

- [x] 1. Fix Vercel API Routing Configuration
  - [x] 1.1 Update vercel.json to fix serverless function detection
    - Remove the `framework: "vite"` setting that may interfere with API routing
    - Update the `functions` glob pattern to explicitly match API files
    - Ensure rewrites prioritize `/api/*` routes correctly
    - _Requirements: 1.1, 1.2, 1.3, 5.2_
  
  - [x] 1.2 Add explicit output configuration for API functions
    - Configure Vercel to recognize `api/*.ts` as serverless functions
    - Ensure TypeScript files are compiled correctly for Vercel runtime
    - _Requirements: 1.1, 1.2_

- [x] 2. Create Health Check Endpoint
  - [x] 2.1 Implement `api/health.ts` serverless function
    - Create health endpoint that returns JSON with status, timestamp, environment
    - Handle CORS preflight requests using existing `_lib/cors.ts`
    - Support both GET and OPTIONS methods
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  
  - [x] 2.2 Write unit tests for health endpoint
    - Test response structure contains required fields
    - Test CORS headers are present
    - Test HTTP status code is 200
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 3. Configure Security Headers
  - [x] 3.1 Add Content-Security-Policy header to vercel.json
    - Configure CSP to allow Supabase connections (`*.supabase.co`)
    - Allow inline scripts and styles required by React/Vite
    - Block framing and restrict form actions
    - _Requirements: 3.1, 3.3, 3.4_
  
  - [x] 3.2 Add Permissions-Policy header to vercel.json
    - Disable camera, microphone, and geolocation by default
    - Apply to all routes (both API and static)
    - _Requirements: 3.2, 3.5_
  
  - [x] 3.3 Verify existing security headers are correctly configured
    - Confirm X-Frame-Options: DENY is present
    - Confirm X-Content-Type-Options: nosniff is present
    - Confirm Strict-Transport-Security is present with correct max-age
    - _Requirements: 3.6, 3.7, 3.8_

- [x] 4. Checkpoint - Verify API Routing Works
  - Ensure all tests pass, ask the user if questions arise.
  - Deploy to Vercel preview and test `/api/health` returns JSON
  - Verify existing API endpoints (`/api/auth?action=login`) return JSON, not HTML

- [x] 5. Clean Up Cloudflare Artifacts
  - [x] 5.1 Remove Cloudflare-specific files from public directory
    - Delete `public/_routes.json` (Cloudflare Pages routing)
    - Delete `public/_headers` (Cloudflare Pages headers)
    - _Requirements: 5.4, 5.5_
  
  - [x] 5.2 Update vercel.json to remove any Cloudflare references
    - Remove any Cloudflare-specific configuration if present
    - Ensure all headers are configured in Vercel format
    - _Requirements: 5.1_

- [x] 6. Consolidate PWA Manifest
  - [x] 6.1 Verify single manifest file exists
    - Confirm `public/manifest.json` exists with all required PWA fields
    - Verify no duplicate `manifest.webmanifest` file exists
    - _Requirements: 4.1, 4.3, 4.4_
  
  - [x] 6.2 Verify index.html references correct manifest path
    - Confirm `<link rel="manifest" href="/manifest.json">` is present
    - _Requirements: 4.2_
  
  - [x] 6.3 Add manifest Content-Type header to vercel.json
    - Configure `/manifest.json` to be served with `application/manifest+json`
    - _Requirements: 4.5_

- [x] 7. Implement API Error Handling Improvements
  - [x] 7.1 Add 404 handler for non-existent API routes
    - Create catch-all handler or configure Vercel to return JSON 404 for `/api/*`
    - Ensure response follows standard error format
    - _Requirements: 1.5, 6.4_
  
  - [x] 7.2 Write property test for API error responses
    - **Property 4: API Error Responses Are Consistent and Safe**
    - Test that error responses have correct format and don't expose internals
    - **Validates: Requirements 6.1, 6.3, 6.4, 6.5**

- [x] 8. Final Checkpoint - Full Verification
  - Ensure all tests pass, ask the user if questions arise.
  - Verify all API endpoints return JSON responses
  - Verify security headers are present on all responses
  - Verify health endpoint is functional
  - Verify PWA manifest is correctly served

## Notes

- All tasks are required for comprehensive coverage
- The most critical fix is Task 1 (API routing) - this must be completed first
- Task 4 is a checkpoint to verify the critical fix before proceeding
- Cloudflare cleanup (Task 5) should be done after API routing is confirmed working
- Property tests validate universal correctness properties from the design document
