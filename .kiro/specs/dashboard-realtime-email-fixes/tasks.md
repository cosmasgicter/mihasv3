# Implementation Plan: Dashboard Real-time Updates & Email Notification Fixes

## Overview

This implementation plan addresses three critical production issues: dashboard data not updating in real-time, admin changes not reflecting immediately, and email notifications not being sent on application submission. The solution leverages Supabase Realtime subscriptions and direct database inserts for end-to-end functionality.

## Tasks

- [x] 1. Enable Supabase Realtime for Required Tables
  - Run SQL to add tables to `supabase_realtime` publication
  - Enable realtime for `applications`, `payments`, and `in_app_notifications` tables
  - Verify realtime is working via Supabase dashboard
  - _Requirements: 1.1, 2.1, 2.2_

- [-] 2. Fix React Query Cache Configuration
  - [x] 2.1 Update cache settings in `src/data/applications.ts`
    - Set `staleTime: 0` for applications list and stats queries
    - Set `gcTime: 5 * 60 * 1000` (5 minutes)
    - Enable `refetchOnWindowFocus: true`
    - Enable `refetchOnMount: 'always'`
    - _Requirements: 1.2, 1.3, 1.4, 4.1, 4.4_

  - [-] 2.2 Enhance mutation cache invalidation
    - Update `useCreate` mutation to invalidate all related query keys
    - Add `refetchType: 'all'` to invalidateQueries calls
    - Add invalidation for `payment-status` queries
    - Dispatch `applicationCreated` custom event on success
    - _Requirements: 2.4, 4.2, 5.5_

  - [ ] 2.3 Write property test for cache invalidation completeness
    - **Property 2: Cache Invalidation Completeness**
    - **Validates: Requirements 1.2, 2.4, 4.2**

- [ ] 3. Implement Manual Refresh Functionality
  - [ ] 3.1 Create `src/hooks/useManualRefresh.ts`
    - Implement `forceRefresh` function using `resetQueries` and `refetchQueries`
    - Add `isRefreshing` state for loading indicator
    - _Requirements: 1.5, 4.5_

  - [ ] 3.2 Add refresh button to student dashboard
    - Add refresh button component with loading state
    - Wire up to `useManualRefresh` hook
    - _Requirements: 1.5_

  - [ ] 3.3 Add refresh button to admin dashboard
    - Add refresh button component with loading state
    - Wire up to `useManualRefresh` hook
    - _Requirements: 1.5_

  - [ ] 3.4 Write property test for manual refresh
    - **Property 10: Manual Refresh Availability**
    - **Validates: Requirements 1.5**

- [ ] 4. Implement Login Cache Clear
  - [ ] 4.1 Modify `src/contexts/AuthContext.tsx`
    - Add `queryClient.clear()` call on successful login
    - Optionally prefetch critical data for new session
    - _Requirements: 4.3_

  - [ ] 4.2 Write property test for login cache clear
    - **Property 13: Login Cache Clear**
    - **Validates: Requirements 4.3**

- [ ] 5. Checkpoint - Verify Cache Fixes
  - Ensure all cache configuration changes are working
  - Test manual refresh functionality
  - Test login cache clear behavior
  - Ask the user if questions arise

- [ ] 6. Implement Application Submission Notifications
  - [ ] 6.1 Update `src/hooks/useApplicationSubmitFixed.ts`
    - Add `triggerSubmissionNotifications` function
    - Insert into `email_queue` table with template data
    - Insert into `in_app_notifications` table
    - Insert into `email_notifications` table for tracking
    - Handle errors gracefully (don't fail submission)
    - _Requirements: 3.1, 5.1, 5.2, 5.3, 5.4_

  - [ ] 6.2 Write property test for notification creation
    - **Property 5: Submission Notification Creation**
    - **Validates: Requirements 3.1, 5.1, 5.2, 5.3**

  - [ ] 6.3 Write property test for email content completeness
    - **Property 6: Email Content Completeness**
    - **Validates: Requirements 3.5, 5.3**

- [ ] 7. Enhance Email Queue Processing
  - [ ] 7.1 Update `functions/cron/process-email-queue.js`
    - Add priority-based ordering (high priority first)
    - Implement retry logic with exponential backoff
    - Update status to 'sent' with timestamp on success
    - Mark as 'failed' after 3 retry attempts
    - _Requirements: 3.2, 3.3, 3.4_

  - [ ] 7.2 Write property test for email queue status tracking
    - **Property 8: Email Queue Status Tracking**
    - **Validates: Requirements 3.3**

  - [ ] 7.3 Write property test for email send timing
    - **Property 9: Email Send Timing**
    - **Validates: Requirements 3.2**

- [ ] 8. Checkpoint - Verify Email Notifications
  - Test application submission triggers email queue insert
  - Test in-app notification creation
  - Verify cron worker processes emails correctly
  - Ask the user if questions arise

- [ ] 9. Implement Student Dashboard Realtime Subscription
  - [ ] 9.1 Create `src/hooks/useStudentDashboardRealtime.ts`
    - Subscribe to `applications` table filtered by `user_id`
    - Subscribe to `in_app_notifications` table filtered by `user_id`
    - Invalidate queries on `postgres_changes` events
    - Handle subscription cleanup on unmount
    - _Requirements: 1.1, 1.2_

  - [ ] 9.2 Integrate hook into student dashboard
    - Add `useStudentDashboardRealtime()` call to `src/pages/student/Dashboard.tsx`
    - _Requirements: 1.1_

  - [ ] 9.3 Write property test for realtime update latency
    - **Property 1: Real-time Update Latency**
    - **Validates: Requirements 1.1, 2.1, 2.2**

- [ ] 10. Implement Admin Dashboard Realtime Subscription
  - [ ] 10.1 Create `src/hooks/useAdminDashboardRealtime.ts`
    - Subscribe to `applications` table (all changes)
    - Subscribe to `payments` table for payment status
    - Subscribe to `application_status_history` for audit
    - Add debouncing for rapid updates (500ms)
    - Implement polling fallback on subscription failure
    - Show toast notifications for status changes
    - _Requirements: 2.1, 2.2, 2.4, 2.5_

  - [ ] 10.2 Integrate hook into admin dashboard
    - Add `useAdminDashboardRealtime()` call to admin dashboard component
    - _Requirements: 2.1_

  - [ ] 10.3 Write property test for polling fallback
    - **Property 12: Polling Fallback**
    - **Validates: Requirements 2.5**

- [ ] 11. Implement Multi-Admin Consistency
  - [ ] 11.1 Create `src/hooks/admin/useApplicationStatusUpdate.ts`
    - Implement optimistic locking using `updated_at` timestamp
    - Detect concurrent modification conflicts
    - Show warning toast and auto-refresh on conflict
    - Record status changes in `application_status_history`
    - _Requirements: 2.3_

  - [ ] 11.2 Write property test for multi-admin consistency
    - **Property 11: Multi-Admin Consistency**
    - **Validates: Requirements 2.3**

- [ ] 12. Checkpoint - Verify Realtime Subscriptions
  - Test student dashboard updates in real-time
  - Test admin dashboard updates in real-time
  - Test multi-admin concurrent modification handling
  - Test polling fallback when realtime disconnects
  - Ask the user if questions arise

- [ ] 13. Integration Testing
  - [ ] 13.1 Write integration test for full submission flow
    - Submit application and verify dashboard updates within 2 seconds
    - Verify email appears in `email_queue`
    - Verify in-app notification is created
    - _Requirements: 1.1, 3.1, 5.1, 5.2_

  - [ ] 13.2 Write integration test for admin status change flow
    - Approve application and verify status change reflects
    - Verify cache invalidation occurs
    - _Requirements: 2.1, 2.4_

  - [ ] 13.3 Write integration test for multi-tab synchronization
    - Open dashboard in two tabs
    - Make change in one tab
    - Verify other tab updates via realtime
    - _Requirements: 1.1, 2.1_

- [ ] 14. Final Checkpoint - Complete System Verification
  - Run all property tests
  - Run all integration tests
  - Verify all requirements are met
  - Ask the user if questions arise

## Notes

- All tasks including property-based tests are required for comprehensive coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Supabase SQL must be run before frontend changes can be tested
