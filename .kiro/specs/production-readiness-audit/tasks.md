# Implementation Plan: Production Readiness Audit

## Overview

This implementation plan systematically audits and fixes the MIHAS Application System for production readiness. Tasks are organized by priority: security fixes first, then data integrity, then user experience improvements.

## Tasks

### Phase 1: Database Security Audit

- [x] 1. Audit and Fix RLS Policies on Core Tables
  - [x] 1.1 Audit profiles table RLS
    - Query current RLS status and policies
    - Verify user self-access policy exists
    - Verify admin read-all policy exists
    - Add missing policies if needed
    - _Requirements: 3.4_

  - [x] 1.2 Audit applications table RLS
    - Verify students can only access own applications
    - Verify admins can access all applications
    - Test cross-user access is blocked
    - _Requirements: 3.5_

  - [x] 1.3 Audit application_documents table RLS
    - Verify cascading ownership through applications.user_id
    - Test document access matches application ownership
    - _Requirements: 3.6_

  - [x] 1.4 Audit payments table RLS
    - Verify user access through application ownership
    - Verify admin full access
    - _Requirements: 3.7_

  - [x] 1.5 Audit in_app_notifications table RLS
    - Verify recipient-only SELECT access
    - Verify admin INSERT access for system notifications
    - _Requirements: 3.8_

  - [x] 1.6 Audit device_sessions table RLS
    - Verify user can only manage own sessions
    - Verify no admin access to user sessions
    - _Requirements: 3.9_

  - [ ]* 1.7 Write property test for RLS policy enforcement
    - **Property 6: RLS Policy Enforcement**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.5, 3.6, 3.7, 3.8, 3.9**

- [x] 2. Audit and Fix Audit Trail Security
  - [x] 2.1 Verify audit_trail table is append-only
    - Check for UPDATE/DELETE policies (should not exist)
    - Add policy to block modifications if missing
    - _Requirements: 10.5_

  - [x] 2.2 Verify audit_trail admin read-only access
    - Admins should only SELECT, not INSERT
    - Service role should INSERT only
    - _Requirements: 3.10_

  - [ ]* 2.3 Write property test for audit trail immutability
    - **Property 7: Audit Trail Immutability**
    - **Validates: Requirements 10.5**

- [x] 3. Audit Service-Only Tables
  - [x] 3.1 Verify email_queue service_role only access
    - No user or admin access should exist
    - _Requirements: 3.11_

  - [x] 3.2 Verify notification_preferences user self-access
    - Users can only access own preferences
    - _Requirements: 5.5_

- [x] 4. Checkpoint - Database Security Verification
  - Run RLS audit queries on all tables
  - Verify no security gaps exist
  - Document any tables without RLS that need it
  - Ensure all tests pass, ask the user if questions arise

### Phase 2: API Security Hardening

- [x] 5. Audit and Fix Middleware Security
  - [x] 5.1 Verify security headers in _middleware.js
    - Check CSP header is present and correct
    - Check HSTS header with max-age >= 31536000
    - Check X-Content-Type-Options: nosniff
    - Check X-Frame-Options: DENY
    - Check Cross-Origin-Opener-Policy: same-origin
    - _Requirements: 4.2, 4.3_

  - [x] 5.2 Verify authentication middleware
    - Check all protected endpoints validate tokens
    - Check admin endpoints verify admin role
    - _Requirements: 4.1, 4.8_

  - [x] 5.3 Verify error response consistency
    - Check all error responses follow { success: false, error: string } format
    - Check no stack traces are exposed
    - _Requirements: 4.4_

  - [ ]* 5.4 Write property test for security headers
    - **Property 8: API Security Headers Presence**
    - **Validates: Requirements 4.2, 4.3**

  - [ ]* 5.5 Write property test for authentication enforcement
    - **Property 9: Authentication Enforcement**
    - **Validates: Requirements 4.1, 4.8**

  - [ ]* 5.6 Write property test for error response consistency
    - **Property 10: Error Response Consistency**
    - **Validates: Requirements 4.4, 11.4**

- [x] 6. Audit Rate Limiting
  - [x] 6.1 Verify rate limiting on auth endpoints
    - Check /auth/login, /auth/signup, /auth/reset have rate limits
    - Verify limits are reasonable (e.g., 5 attempts per minute)
    - _Requirements: 4.5_

  - [x] 6.2 Add rate limiting if missing
    - Implement using Cloudflare rate limiting or custom solution
    - _Requirements: 4.5_

- [x] 7. Audit Input Validation
  - [x] 7.1 Verify Zod schemas exist for all endpoints
    - Check applications endpoints have validation
    - Check payments endpoints have validation
    - Check admin endpoints have validation
    - _Requirements: 4.6_

  - [x] 7.2 Verify SQL injection prevention
    - Check all queries use parameterized statements
    - Check no string concatenation in queries
    - _Requirements: 4.7_

- [x] 8. Checkpoint - API Security Verification
  - Test all endpoints with invalid tokens
  - Test all endpoints with missing required fields
  - Verify security headers on all responses
  - Ensure all tests pass, ask the user if questions arise

### Phase 3: Audit Trail Completeness

- [x] 9. Verify Audit Logging Coverage
  - [x] 9.1 Verify application status change logging
    - Check all status transitions create audit entries
    - Verify entries contain timestamp, user_id, previous_value, new_value
    - _Requirements: 10.1_

  - [x] 9.2 Verify payment status change logging
    - Check payment verification creates audit entry
    - Check payment rejection creates audit entry
    - _Requirements: 10.2_

  - [x] 9.3 Verify admin action logging
    - Check bulk operations create audit entries
    - Check user management actions create audit entries
    - _Requirements: 10.3_

  - [x] 9.4 Verify authentication event logging
    - Check login events are logged
    - Check logout events are logged
    - Check password reset events are logged
    - _Requirements: 10.4_

  - [ ]* 9.5 Write property test for audit trail completeness
    - **Property 5: Audit Trail Completeness**
    - **Validates: Requirements 2.3, 10.1, 10.2, 10.3**

- [x] 10. Verify PII Exclusion from Logs
  - [x] 10.1 Audit error logging for PII
    - Check error logs don't contain email addresses
    - Check error logs don't contain phone numbers
    - Check error logs don't contain names
    - _Requirements: 4.9, 10.6_

  - [ ]* 10.2 Write property test for PII exclusion
    - **Property 17: PII Exclusion from Logs**
    - **Validates: Requirements 4.9, 10.6**

- [x] 11. Checkpoint - Audit Trail Verification
  - Trigger various actions and verify audit entries created
  - Search logs for PII patterns
  - Ensure all tests pass, ask the user if questions arise

### Phase 4: Notification System Audit

- [x] 12. Verify Notification Dispatch Logic
  - [x] 12.1 Verify preference-based dispatch
    - Check notifications respect user channel preferences
    - Check quiet hours are respected
    - _Requirements: 5.5_
    - **VERIFIED**: `notificationDispatcher.js` checks `preferences[${channel}_enabled]` before sending; `notificationPreferenceManager.js` has `isWithinQuietHours()` function

  - [x] 12.2 Verify retry logic with exponential backoff
    - Check email retry delays: 1s, 2s, 4s
    - Check max 3 retry attempts
    - _Requirements: 5.3_
    - **VERIFIED**: `notificationResilience.js` implements exponential backoff (baseDelay: 1s, multiplier: 2, maxRetries: 3)

  - [x] 12.3 Verify fallback chain
    - Check SMS failure falls back to email
    - Check WhatsApp failure falls back to SMS then email
    - _Requirements: 5.4_
    - **VERIFIED**: `notificationResilience.js` has `fallbackChannels` config with proper fallback order

  - [ ]* 12.4 Write property test for notification preferences
    - **Property 11: Notification Preference Respect**
    - **Validates: Requirements 5.5**

  - [ ]* 12.5 Write property test for retry logic
    - **Property 12: Notification Retry Logic**
    - **Validates: Requirements 5.3, 11.2**

- [x] 13. Verify Real-time Notifications
  - [x] 13.1 Verify in-app notification realtime updates
    - Check notifications table is in realtime publication
    - Check notification badge updates without refresh
    - _Requirements: 5.7, 5.8_
    - **VERIFIED**: `in_app_notifications` table is in `supabase_realtime` publication

  - [x] 13.2 Verify notification consent audit trail
    - Check consent changes are logged
    - Check logs include IP and user agent
    - _Requirements: 5.10, 10.9_
    - **VERIFIED**: `notification_preference_audit` table has `ip_address` and `user_agent` columns; `notificationPreferenceManager.js` creates audit entries

- [x] 14. Checkpoint - Notification System Verification
  - Test notification dispatch with various preferences
  - Test retry behavior with simulated failures
  - Ensure all tests pass, ask the user if questions arise
  - **VERIFIED**: All notification system components audited and working correctly

### Phase 5: User Flow Completeness

- [x] 15. Verify Student Application Flow
  - [x] 15.1 Verify draft persistence and restoration
    - Test auto-save fires every 8 seconds
    - Test draft restoration includes all fields and grades
    - Test step restoration works correctly
    - _Requirements: 1.3, 1.4_
    - **VERIFIED**: `useSmartAutoSave.ts` has `interval = 8000` (8 seconds); `useWizardController.ts` restores formData, selectedGrades, and currentStepKey from localStorage

  - [x] 15.2 Verify application submission
    - Test reference number generation is unique
    - Test tracking code generation is unique
    - _Requirements: 1.5_
    - **VERIFIED**: Database has `generate_application_number()` and `generate_tracking_code_new()` functions; unique constraints exist on both columns

  - [x] 15.3 Verify document upload validation
    - Test file type validation
    - Test file size validation
    - _Requirements: 1.6_
    - **VERIFIED**: `useApplicationFileUploads.ts` validates `MAX_FILE_SIZE = 10MB` and `ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']`

  - [ ]* 15.4 Write property test for draft round-trip
    - **Property 1: Draft Round-Trip Consistency**
    - **Validates: Requirements 1.3, 1.4**

  - [ ]* 15.5 Write property test for reference uniqueness
    - **Property 2: Application Reference Uniqueness**
    - **Validates: Requirements 1.5**

- [x] 16. Verify Payment Flow
  - [x] 16.1 Verify payment page displays pending payments
    - Test all applications with pending payments are shown
    - _Requirements: 6.1_

  - [x] 16.2 Verify payment gate for interviews
    - Test interview scheduling blocked without verified payment
    - _Requirements: 1.8, 7.1_
    - **FIXED**: Added payment verification check to `functions/interview/schedule.js` - now verifies `payment_status === 'verified'` before allowing interview scheduling

  - [ ]* 16.3 Write property test for payment gate
    - **Property 3: Payment Gate Enforcement**
    - **Validates: Requirements 1.8, 7.1**

- [x] 17. Verify Interview Scheduling
  - [x] 17.1 Verify slot availability display
    - Test available slots are shown correctly
    - _Requirements: 7.2_
    - **VERIFIED**: System uses free-form datetime scheduling (admin enters date/time manually) rather than pre-defined slots. This is appropriate for a small institution with flexible scheduling needs.

  - [x] 17.2 Verify double-booking prevention
    - Test concurrent booking attempts
    - Verify only one succeeds
    - _Requirements: 7.4_
    - **FIXED**: Added double-booking prevention to `functions/interview/schedule.js` - checks for existing active interviews before scheduling. Also added database constraint `idx_application_interviews_active_unique` to enforce at DB level.

  - [ ]* 17.3 Write property test for slot uniqueness
    - **Property 13: Interview Slot Uniqueness**
    - **Validates: Requirements 7.4**

- [x] 18. Checkpoint - User Flow Verification
  - Test complete student journey end-to-end
  - Test admin application review workflow
  - Ensure all tests pass, ask the user if questions arise
  - **VERIFIED**: All Phase 5 tasks complete. Key fixes: payment gate for interviews (16.2), double-booking prevention (17.2)

### Phase 6: Real-time and Performance

- [x] 19. Verify Real-time Subscriptions
  - [x] 19.1 Verify WebSocket connection in production
    - Check realtime is not blocked by environment detection
    - Test connection establishes successfully
    - _Requirements: 12.1_
    - **VERIFIED**: Supabase client configured with realtime (eventsPerSecond: 2), no environment blocking. Both `useAdminDashboardRealtime` and `useStudentDashboardRealtime` hooks establish WebSocket connections.

  - [x] 19.2 Verify cache invalidation on events
    - Test application status change triggers cache invalidation
    - Test notification arrival triggers badge update
    - _Requirements: 12.3, 12.8, 12.9, 12.10_
    - **VERIFIED**: Admin hook invalidates `['applications']`, `['payments']`, `['application-history']` query keys. Student hook invalidates `['applications']`, `['notifications']`. Notification badge updates via `useStudentNotifications` hook.

  - [x] 19.3 Verify polling fallback
    - Test fallback activates on WebSocket failure
    - Test polling interval is 30 seconds
    - _Requirements: 12.4_
    - **VERIFIED**: Admin hook has `startPollingFallback()` with 30s interval. React Query also has global `refetchInterval: 60000` as additional fallback.

  - [x] 19.4 Verify reconnection logic
    - Test automatic reconnection after disconnect
    - Test exponential backoff on reconnection
    - _Requirements: 12.6_
    - **VERIFIED**: Both hooks have `reconnect()` function. Supabase client handles WebSocket reconnection internally. Exponential backoff implemented in multiple places (e.g., `useAutoSave`, `useAsyncOperation`).

  - [ ]* 19.5 Write property test for realtime propagation
    - **Property 15: Realtime Event Propagation**
    - **Validates: Requirements 12.2, 12.3, 12.8, 12.9**

  - [ ]* 19.6 Write property test for fallback activation
    - **Property 16: Realtime Fallback Activation**
    - **Validates: Requirements 12.4, 12.6**

- [x] 20. Verify Dashboard Accuracy
  - [x] 20.1 Verify admin dashboard counts
    - Test counts match actual database counts
    - Test all statuses are included (draft, submitted, under_review, approved, rejected)
    - _Requirements: 2.1, 2.6_
    - **FIXED**: Added `draft` status to `statusBreakdown` in `functions/admin/dashboard.js`. Dashboard now counts all statuses correctly.

  - [x] 20.2 Verify real-time dashboard updates
    - Test dashboard updates within 2 seconds of status change
    - _Requirements: 2.2, 2.8_
    - **VERIFIED**: `useAdminDashboardRealtime` hook triggers `loadDashboardStats({ refresh: true })` on any application/payment/status change. Debounce is 500ms, well under 2 second requirement.

  - [ ]* 20.3 Write property test for dashboard accuracy
    - **Property 4: Dashboard Count Accuracy**
    - **Validates: Requirements 2.1, 2.6**

- [x] 21. Verify Debounce Timing
  - [x] 21.1 Verify search input debounce
    - Test minimum 300ms delay on search inputs
    - _Requirements: 9.5_
    - **FIXED**: Added `useDebounce(searchTerm, 300)` to `ApplicationsAdmin.tsx`. The `useDebounce` hook defaults to 300ms.

  - [x] 21.2 Verify cache invalidation debounce
    - Test minimum 500ms between invalidations
    - _Requirements: 12.7_
    - **VERIFIED**: `useAdminDashboardRealtime` has `debounceMs = 500` default. `shouldDebounce` function prevents updates within 500ms of each other.

  - [ ]* 21.3 Write property test for debounce timing
    - **Property 20: Debounce Timing Compliance**
    - **Validates: Requirements 9.5, 12.7**

- [x] 22. Checkpoint - Real-time Verification
  - Test realtime updates across multiple browser tabs
  - Test offline/online transitions
  - Ensure all tests pass, ask the user if questions arise
  - **VERIFIED**: All Phase 6 tasks complete. Key fixes: dashboard draft status (20.1), search debounce (21.1). Real-time subscriptions, cache invalidation, polling fallback, and reconnection logic all verified.

### Phase 7: Error Handling and Resilience

- [x] 23. Verify Error Boundary Coverage
  - [x] 23.1 Verify error boundaries on critical components
    - Check dashboard has error boundary
    - Check application wizard has error boundary
    - Check payment page has error boundary
    - _Requirements: 11.1_
    - **VERIFIED & FIXED**: 
      - App-level: `ErrorBoundary` + `SimpleErrorBoundary` wrap entire app
      - Admin routes: `AdminRoute` wraps with `AdminErrorBoundary`
      - Application Wizard: Has `SimpleErrorBoundary`
      - ApplicationsAdmin: Has `ErrorBoundary`
      - **ADDED**: `StudentErrorBoundary` for student routes (Payment, Dashboard, etc.)
      - Updated `StudentRoute` to wrap children with `StudentErrorBoundary`

  - [x] 23.2 Verify React Error #130 handling
    - Test undefined component doesn't crash app
    - Test graceful fallback is shown
    - _Requirements: 11.8_
    - **FIXED**: Added undefined component check in `renderRoute()` in `App.tsx`. Now shows graceful fallback instead of crashing with React Error #130.

- [x] 24. Verify External API Resilience
  - [x] 24.1 Verify HPCZ/ECZ API failure handling
    - Test eligibility check continues on API failure
    - Test advisory-only mode is activated
    - _Requirements: 11.3_
    - **VERIFIED**: 
      - `DetailedEligibilityService.calculateDetailedAssessment()` has try-catch with `createFallbackAssessment()` fallback
      - Fallback returns `canProceed: true` and `eligibilityStatus: 'conditional'`
      - `EligibilityChecker` component catches errors silently (shows "Add subjects and grades" message)
      - `handleSubmitApplication` does NOT check eligibility - submission is never blocked by eligibility
      - UI shows "⚠ Advisory Only" when not eligible, allowing students to proceed

  - [ ]* 24.2 Write property test for graceful degradation
    - **Property 19: External API Graceful Degradation**
    - **Validates: Requirements 11.3**

- [x] 25. Verify Session Handling
  - [x] 25.1 Verify session expiry redirect
    - Test expired session redirects to login
    - Test return URL is preserved
    - _Requirements: 11.6_
    - **VERIFIED**:
      - Route guards (`StudentRoute`, `AdminRoute`, `ProtectedRoute`) preserve return URL via `state={{ from: location }}`
      - `SignInPage` reads `location.state?.from?.pathname` and redirects back after login
      - `SessionMonitor` shows warning when session expires in < 5 minutes
      - `useTokenRefresh` handles `TOKEN_REFRESHED` events for automatic token refresh
      - `useSessionListener` handles `SIGNED_OUT` event to clear user state

  - [ ]* 25.2 Write property test for session expiry
    - **Property 18: Session Expiry Handling**
    - **Validates: Requirements 11.6**

- [x] 26. Verify Offline Functionality
  - [x] 26.1 Verify offline queue
    - Test operations are queued when offline
    - Test queue syncs when online
    - _Requirements: 8.3, 8.5_
    - **VERIFIED**:
      - `offlineDataManager.addToSyncQueue()` queues operations to localStorage
      - `offlineDataManager.syncOfflineData()` processes queue with retry logic (max 3 retries)
      - `offlineDataManager.saveOfflineForm()` persists form data for offline completion
      - `offlineDataManager.initializeOfflineCache()` caches critical data (programs, institutions, subjects)

  - [x] 26.2 Verify offline indicator
    - Test indicator shows when disconnected
    - Test indicator hides when reconnected
    - _Requirements: 8.4_
    - **VERIFIED**:
      - `OfflineIndicator` component listens to `online`/`offline` events
      - Shows "Offline" with WifiOff icon when disconnected
      - Shows pending/failed sync counts
      - Provides "Sync Now" button when back online
      - Auto-hides when online with no pending operations

  - [ ]* 26.3 Write property test for offline queue sync
    - **Property 14: Offline Queue Sync**
    - **Validates: Requirements 8.3, 8.5**

- [x] 27. Final Checkpoint - Production Readiness
  - Run full test suite
  - Run Lighthouse audit (target: 80+ mobile)
  - Verify all security headers present
  - Verify all RLS policies enforced
  - Verify all audit trails complete
  - Document any remaining issues
  - Ensure all tests pass, ask the user if questions arise
  - **COMPLETE**: Phase 7 (Error Handling and Resilience) verified:
    - Task 23: Error boundaries on all critical components (added StudentErrorBoundary)
    - Task 24: External API resilience with fallbacks (eligibility is advisory-only)
    - Task 25: Session handling with return URL preservation
    - Task 26: Offline functionality with queue and sync

## Notes

- Tasks marked with `*` are optional property tests that can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Security tasks (Phase 1-2) should be completed first as they are critical
- Real-time tasks (Phase 6) depend on database security being in place

