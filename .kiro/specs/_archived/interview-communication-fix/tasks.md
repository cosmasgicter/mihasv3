# Implementation Plan: Interview and Communication Fix

## Overview

This implementation plan addresses three critical issues in the interview scheduling and communication system:
1. RLS helper function inconsistency
2. Student interview visibility issues
3. Communication service using wrong notification table

## Tasks

- [x] 1. Fix RLS Helper Function
  - [x] 1.1 Update check_is_admin() function to check all role tables
    - Modify function to check profiles, user_profiles, and user_roles tables
    - Include 'admissions_officer' role in addition to 'admin' and 'super_admin'
    - Use SECURITY DEFINER to ensure function runs with elevated privileges
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ]* 1.2 Write property test for admin role detection
    - **Property 1: Admin Role Check Consistency**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**

- [x] 2. Fix Student Interview RLS Policy
  - [x] 2.1 Update RLS policy for student interview visibility
    - Drop existing "Users can view their own interview records" policy
    - Create new policy using subquery pattern with (SELECT auth.uid())
    - Ensure policy works with join queries on applications table
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 2.2 Write property test for student interview visibility
    - **Property 2: Student Interview Visibility**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.5**

- [x] 3. Checkpoint - Verify database changes
  - Database migrations applied successfully ✓

- [x] 4. Fix Communication Service
  - [x] 4.1 Update sendInAppMessage function to use correct table
    - Changed table from 'notifications' to 'in_app_notifications' ✓
    - Updated field mapping: 'message' → 'content' ✓
    - Removed unsupported 'priority' field ✓
    - Added 'read: false' field ✓
    - _Requirements: 3.1, 3.2, 3.3, 3.5_

  - [ ]* 4.2 Write property test for notification creation
    - **Property 3: In-App Notification Creation**
    - **Validates: Requirements 3.1, 3.2, 3.3**

- [x] 5. Verify Interview API Notification Integration
  - [x] 5.1 Review and verify interview scheduling notification
    - POST endpoint creates in_app_notification on schedule ✓
    - Notification includes scheduled_at, mode, location ✓
    - PUT endpoint creates notification on reschedule ✓
    - DELETE endpoint soft-deletes (sets status to cancelled) ✓
    - _Requirements: 4.2, 4.3, 4.4_

  - [ ]* 5.2 Write property test for interview notification
    - **Property 4: Interview Scheduling Notification**
    - **Validates: Requirements 4.2, 4.3, 4.4**

- [x] 6. Verify Interview Scheduling Constraints
  - [x] 6.1 Verify payment verification before scheduling
    - schedule.js checks payment_status === 'verified' ✓
    - Returns error "Payment must be verified before scheduling an interview" ✓
    - _Requirements: 4.1_

  - [x] 6.2 Verify duplicate interview prevention
    - schedule.js checks for existing active interviews (status in ['scheduled', 'rescheduled']) ✓
    - Returns 409 conflict with appropriate error message ✓
    - _Requirements: 5.5_

  - [ ]* 6.3 Write property test for scheduling constraints
    - **Property 5: Payment Verification Before Interview Scheduling**
    - **Property 6: Duplicate Interview Prevention**
    - **Validates: Requirements 4.1, 5.5**

- [x] 7. Final checkpoint - All core tasks complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
