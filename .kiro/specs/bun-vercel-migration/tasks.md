# Implementation Plan: Bun/Vercel Migration

## Overview

This implementation plan migrates the MIHAS Application System from Cloudflare Pages to Vercel Free Plan with Bun runtime. The migration follows a phased approach: infrastructure setup, function conversion, feature removal, real-time replacement, and validation.

## Tasks

- [x] 1. Set up Vercel and Bun infrastructure
  - [x] 1.1 Create vercel.json configuration file
    - Configure build command to use Bun (`bun run build`)
    - Configure install command (`bun install`)
    - Set up rewrites for SPA routing and API endpoints
    - Add security headers for API routes
    - _Requirements: 1.1, 1.5, 1.7_
  
  - [x] 1.2 Create bunfig.toml configuration file
    - Configure exact version locking
    - Set up lockfile generation
    - _Requirements: 2.7_
  
  - [x] 1.3 Update package.json for Bun runtime
    - Replace npm scripts with bun/bunx commands
    - Update dev, build, test, and lint scripts
    - Remove Node.js engine requirement
    - _Requirements: 2.1, 2.2, 2.5_
  
  - [x] 1.4 Update vite.config.ts for Bun compatibility
    - Simplify configuration (remove Cloudflare-specific settings)
    - Ensure PWA plugin works with Bun
    - Preserve code splitting for vendor chunks
    - _Requirements: 2.4, 12.4, 12.5_

- [-] 2. Checkpoint - Verify Bun build works
  - Run `bun install` and `bun run build`
  - Ensure all tests pass, ask the user if questions arise

- [ ] 3. Create Vercel API infrastructure
  - [~] 3.1 Create api/_lib/cors.ts
    - Implement CORS handler for Vercel functions
    - Support same origins as Cloudflare (mihas.vercel.app, localhost)
    - Handle OPTIONS preflight requests
    - _Requirements: 3.3, 11.4_
  
  - [~] 3.2 Create api/_lib/supabaseClient.ts
    - Port Supabase client from functions/_lib/supabaseClient.js
    - Use process.env for environment variables
    - Preserve getUserFromRequest and requireUser functions
    - _Requirements: 3.5, 10.3, 10.4_
  
  - [~] 3.3 Create api/_lib/errorHandler.ts
    - Implement error handling without PII logging
    - Return consistent error response format
    - _Requirements: 1.6, 11.1, 11.6_
  
  - [~] 3.4 Create api/_lib/rateLimiter.ts
    - Port rate limiting logic from Cloudflare middleware
    - Preserve rate limits for slip generation endpoints
    - _Requirements: 3.4, 11.5_
  
  - [ ]* 3.5 Write property test for CORS handler
    - **Property 2: API Behavior Preservation (CORS)**
    - **Validates: Requirements 3.3**
  
  - [ ]* 3.6 Write property test for error handler (no PII)
    - **Property 7: No PII in Logs**
    - **Validates: Requirements 11.1**

- [ ] 4. Convert core API endpoints
  - [~] 4.1 Convert auth endpoints (api/auth/)
    - Convert functions/auth/login.js → api/auth/login.ts
    - Convert functions/auth/register.js → api/auth/register.ts
    - Convert functions/auth/signin.js → api/auth/signin.ts
    - Convert functions/auth/signup.js → api/auth/signup.ts
    - Use Vercel handler pattern with process.env
    - _Requirements: 3.1, 3.2, 3.5, 3.6_
  
  - [~] 4.2 Convert applications endpoints (api/applications/)
    - Convert functions/applications/[id].js → api/applications/[id].ts
    - Convert functions/applications/details.js → api/applications/details.ts
    - Convert functions/applications/documents.js → api/applications/documents.ts
    - Convert functions/applications/grades.js → api/applications/grades.ts
    - Convert functions/applications/review.js → api/applications/review.ts
    - Convert functions/applications/summary.js → api/applications/summary.ts
    - _Requirements: 3.1, 3.2, 3.5, 3.6, 10.6_
  
  - [~] 4.3 Convert documents endpoints (api/documents/)
    - Convert functions/documents/upload.js → api/documents/upload.ts
    - Convert functions/documents/extract.js → api/documents/extract.ts
    - Preserve tesseract.js OCR integration
    - _Requirements: 3.1, 4.5, 8.5_
  
  - [~] 4.4 Convert notifications endpoints (api/notifications/)
    - Convert functions/notifications/send.js → api/notifications/send.ts
    - Convert functions/notifications/preferences.js → api/notifications/preferences.ts
    - Remove bulk notification complexity
    - _Requirements: 3.1, 6.6_
  
  - [ ] 4.5 Convert payments endpoints (api/payments/)
    - Convert functions/payments/generate-receipt.js → api/payments/generate-receipt.ts
    - _Requirements: 3.1, 8.6_
  
  - [ ]* 4.6 Write property test for function conversion
    - **Property 1: Function Conversion Equivalence**
    - **Validates: Requirements 1.2, 3.1, 3.5**

- [ ] 5. Checkpoint - Verify core API endpoints work
  - Test auth, applications, documents, notifications, payments endpoints
  - Ensure all tests pass, ask the user if questions arise

- [ ] 6. Convert admin endpoints
  - [ ] 6.1 Convert admin dashboard endpoint (api/admin/)
    - Convert functions/admin/dashboard.js → api/admin/dashboard.ts
    - Simplify to return basic stats without complex analytics
    - _Requirements: 6.1, 6.2_
  
  - [ ] 6.2 Convert admin users endpoint
    - Convert functions/admin/users.js → api/admin/users.ts
    - Preserve basic CRUD operations
    - _Requirements: 6.2_
  
  - [ ] 6.3 Convert catalog endpoints (api/catalog/)
    - Convert functions/catalog/programs.js → api/catalog/programs.ts
    - Convert functions/catalog/intakes.js → api/catalog/intakes.ts
    - Convert functions/catalog/subjects.js → api/catalog/subjects.ts
    - _Requirements: 3.1_

- [ ] 7. Remove AI features
  - [ ] 7.1 Delete AI function files
    - Delete functions/ai/chat.ts
    - Delete functions/ai/predict.ts
    - Delete functions/ai/analyze-document.ts
    - Delete functions/ai/trends.ts
    - Delete functions/_lib/cloudflareAI.js
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  
  - [ ] 7.2 Remove AI client from frontend
    - Delete src/lib/cloudflareAI.ts
    - Remove AIAssistant component references
    - Remove AI-related imports from components
    - _Requirements: 4.6, 4.7_

- [ ] 8. Remove analytics features
  - [ ] 8.1 Delete analytics function files
    - Delete functions/analytics/ directory
    - Delete functions/_lib/analytics/ directory
    - _Requirements: 5.3_
  
  - [ ] 8.2 Remove analytics from frontend
    - Remove Umami analytics tracking code
    - Remove Sentry error monitoring
    - Remove telemetry collection
    - Remove analytics environment variables from config
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6_

- [ ] 9. Replace Supabase Realtime with polling
  - [ ] 9.1 Create useAdminDashboardPolling hook
    - Replace useAdminDashboardRealtime with React Query polling
    - Configure 30-second refetch interval
    - Handle offline state gracefully
    - _Requirements: 7.2, 7.3, 7.8_
  
  - [ ] 9.2 Create useStudentDashboardPolling hook
    - Replace useStudentDashboardRealtime with React Query polling
    - Configure 30-second refetch interval
    - _Requirements: 7.2, 7.3, 7.6, 7.7_
  
  - [ ] 9.3 Remove Supabase Realtime components
    - Delete src/components/supabase-ui/realtime-provider.tsx
    - Delete src/components/supabase-ui/realtime-indicator.tsx
    - Remove RealtimeProvider from component tree
    - _Requirements: 7.1, 7.4, 7.5_
  
  - [ ] 9.4 Delete old realtime hooks
    - Delete src/hooks/useAdminDashboardRealtime.ts
    - Delete src/hooks/useStudentDashboardRealtime.ts
    - Delete src/hooks/admin/useAdminRealtimeMetrics.ts
    - _Requirements: 7.1_
  
  - [ ]* 9.5 Write property test for polling interval
    - **Property 8: Polling Interval Configuration**
    - **Validates: Requirements 7.3**

- [ ] 10. Checkpoint - Verify feature removal complete
  - Verify AI endpoints return 404
  - Verify analytics endpoints return 404
  - Verify polling works for dashboards
  - Ensure all tests pass, ask the user if questions arise

- [ ] 11. Verify core functionality preserved
  - [ ] 11.1 Verify auto-save functionality
    - Test 8-second auto-save interval works
    - Test localStorage persistence
    - Test draft restoration on page reload
    - _Requirements: 8.2, 8.3, 8.4_
  
  - [ ]* 11.2 Write property test for auto-save round-trip
    - **Property 3: Auto-Save Round-Trip**
    - **Validates: Requirements 8.2, 8.3, 8.4**
  
  - [ ] 11.3 Verify PWA offline functionality
    - Test service worker caches static assets
    - Test offline status indicators display
    - Test form submissions queue when offline
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  
  - [ ]* 11.4 Write property test for offline queue and sync
    - **Property 4: Offline Queue and Sync**
    - **Validates: Requirements 9.1, 9.3, 9.5**
  
  - [ ] 11.5 Verify Zambian data format support
    - Test +260 phone number validation
    - Test ECZ grade 1-9 validation and pass/fail classification
    - _Requirements: 8.7_
  
  - [ ]* 11.6 Write property test for Zambian data formats
    - **Property 5: Zambian Data Format Validation**
    - **Validates: Requirements 8.7**
  
  - [ ] 11.7 Verify non-blocking validation
    - Test that validation errors don't prevent wizard progression
    - _Requirements: 8.8_
  
  - [ ]* 11.8 Write property test for non-blocking validation
    - **Property 6: Non-Blocking Validation**
    - **Validates: Requirements 8.8**

- [ ] 12. Update environment configuration
  - [ ] 12.1 Create .env.vercel template
    - Document required Vercel environment variables
    - Remove Cloudflare-specific variables (Turnstile, AI binding)
    - Remove analytics variables (Umami, Sentry)
    - _Requirements: 1.4, 4.8, 5.6_
  
  - [ ] 12.2 Update CORS origins for Vercel
    - Update allowed origins in api/_lib/cors.ts
    - Add mihas.vercel.app domain
    - _Requirements: 11.4_

- [ ] 13. Clean up Cloudflare artifacts
  - [ ] 13.1 Delete Cloudflare configuration files
    - Delete wrangler.toml
    - Delete .cfignore
    - Delete functions/_middleware.js (replaced by Vercel middleware)
    - _Requirements: 1.1_
  
  - [ ] 13.2 Delete old functions directory
    - Archive functions/ directory content
    - Delete functions/ directory after api/ is verified working
    - _Requirements: 3.2_

- [ ] 14. Create Vercel middleware
  - [ ] 14.1 Create middleware.ts at project root
    - Implement security headers for API routes
    - Match /api/* routes
    - _Requirements: 3.3, 11.3, 11.6_

- [ ] 15. Final checkpoint - Full system validation
  - [ ] 15.1 Run all property tests
    - Execute property tests with 100+ iterations each
    - Verify all 8 properties pass
    - _Requirements: All correctness properties_
  
  - [ ] 15.2 Run integration tests
    - Test complete application wizard flow
    - Test admin review workflow
    - Test document upload with OCR
    - _Requirements: 8.1, 8.5, 8.6_
  
  - [ ] 15.3 Verify performance targets
    - Check bundle size < 500KB
    - Verify lazy loading works
    - _Requirements: 12.3, 12.4_
  
  - Ensure all tests pass, ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Database schema remains unchanged - only API and frontend code changes
- Preserve auto-save (8-second interval) - this is critical for student data safety
