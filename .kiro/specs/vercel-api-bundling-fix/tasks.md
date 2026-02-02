# Implementation Plan: Vercel API Bundling Fix

## Overview

This plan implements a pre-bundling solution for Vercel API endpoints to resolve the ERR_MODULE_NOT_FOUND errors caused by Vercel's NFT not tracing imports from the `lib/` directory. The solution uses Bun's bundler to inline all `lib/` dependencies while keeping npm packages external.

## Tasks

- [x] 1. Update the bundle script with correct externals
  - [x] 1.1 Modify `scripts/bundle-api.mjs` to use the correct external packages list
    - Remove `@supabase/supabase-js` from externals (not used)
    - Remove `bcrypt` from externals (only `bcryptjs` is used)
    - Add `arcjet` to externals (core package)
    - Ensure list matches: `@vercel/node`, `@neondatabase/serverless`, `@arcjet/node`, `arcjet`, `jose`, `bcryptjs`, `web-push`, `resend`
    - _Requirements: 3.1-3.8_
  
  - [x] 1.2 Add function count validation to the bundle script
    - Count output `.js` files after bundling
    - Error if count exceeds 12 (Vercel Hobby limit)
    - Log the count in the summary
    - _Requirements: 2.3, 2.4_
  
  - [x] 1.3 Improve logging output in the bundle script
    - Log total endpoints found at start
    - Log each file with size in KB on success
    - Log clear error messages on failure
    - Log summary with success/failure counts
    - _Requirements: 7.1-7.5_

- [x] 2. Update Vercel configuration
  - [x] 2.1 Update `vercel.json` build command to run bundle script
    - Set buildCommand to: `bun run scripts/bundle-api.mjs && bunx --bun vite build`
    - Ensure functions config targets `api/*.js` files
    - _Requirements: 4.1, 4.2, 6.1, 6.2_
  
  - [x] 2.2 Verify rewrites configuration covers all endpoints
    - Ensure all 12 API endpoints have rewrites
    - Verify catch-all route `[...path]` is handled
    - _Requirements: 6.3, 6.4_

- [x] 3. Checkpoint - Verify bundle script works locally
  - Run `bun run scripts/bundle-api.mjs` locally
  - Verify all `.ts` files are converted to `.js`
  - Verify no `../lib/` imports remain in output
  - Verify external packages are preserved as imports
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Handle edge cases in bundling
  - [x] 4.1 Ensure `[...path].ts` catch-all route bundles correctly
    - Test that bracket syntax in filename is preserved
    - Verify output is `[...path].js`
    - _Requirements: 5.5_
  
  - [x] 4.2 Ensure underscore files are skipped
    - Verify `_auth.ts.legacy` and similar files are not processed
    - Files starting with `_` should remain untouched
    - _Requirements: 5.3_
  
  - [x] 4.3 Handle dynamic imports in `lib/db.ts`
    - Verify `@neondatabase/serverless` dynamic import works after bundling
    - Test database connectivity with bundled code
    - _Requirements: 1.2, 3.2_

- [x] 5. Write property tests for bundling correctness
  - [x] 5.1 Write property test for file transformation
    - **Property 1: One-to-One File Transformation**
    - Test that each `.ts` file produces exactly one `.js` file with same base name
    - **Validates: Requirements 1.1, 1.4, 2.1, 2.2, 5.1, 5.2, 5.4**
  
  - [x] 5.2 Write property test for import resolution
    - **Property 2: Import Resolution Correctness**
    - Test that `lib/` imports are inlined and externals are preserved
    - **Validates: Requirements 1.2, 1.3, 3.1-3.9**
  
  - [x] 5.3 Write property test for underscore exclusion
    - **Property 3: Underscore File Exclusion**
    - Test that files starting with `_` are not processed
    - **Validates: Requirements 5.3**

- [x] 6. Checkpoint - Run full build and verify
  - Run complete build command: `bun run scripts/bundle-api.mjs && bunx --bun vite build`
  - Verify `api/` directory contains only `.js` files (except `_*` files)
  - Verify `dist/` directory is created with frontend build
  - Ensure all tests pass, ask the user if questions arise.

- [-] 7. Deploy and verify on Vercel
  - [x] 7.1 Deploy to Vercel preview environment
    - Push changes to trigger Vercel build
    - Monitor build logs for bundling success
    - _Requirements: 4.5_
  
  - [ ] 7.2 Test API endpoints on deployed preview
    - Test `/api/health` returns 200
    - Test `/api/health?action=db` connects to database
    - Test `/api/auth?action=session` works
    - Test `/api/ping` returns pong
    - _Requirements: 1.4, 3.9_
  
  - [ ] 7.3 Verify no ERR_MODULE_NOT_FOUND errors
    - Check Vercel function logs for any import errors
    - Verify all endpoints respond without 500 errors
    - _Requirements: 1.2_

- [ ] 8. Final checkpoint - Production readiness
  - All API endpoints working on Vercel preview
  - No import resolution errors in logs
  - Bundle sizes are reasonable (<500KB each)
  - Function count is within Vercel Hobby limit (≤12)
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required for comprehensive testing
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- The bundle script runs ONLY during production builds, not during local development
- Local development continues to use TypeScript files directly via Vite
