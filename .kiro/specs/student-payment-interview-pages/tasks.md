# Implementation Plan: Student Payment and Interview Pages

## Overview

This plan implements two new student-facing pages to resolve 404 errors when clicking "Complete Payment" and "View Interview Details" quick actions. The implementation uses existing Supabase tables and follows established React patterns.

## Tasks

- [x] 1. Implement Payment Page Component
  - [x] 1.1 Create Payment page with payment instructions
    - Create `src/pages/student/Payment.tsx`
    - Display K153 fee amount and payment instructions
    - Add "Continue to Application Wizard" button
    - Implement loading and error states
    - _Requirements: 1.2, 1.3, 6.3_

  - [x] 1.2 Implement pending applications query and display
    - Query applications where payment_status is null or 'pending_review'
    - Display each application with program name and status indicator
    - Add "View Application" button for each application
    - _Requirements: 2.1, 2.2, 2.5_

  - [x] 1.3 Add payment status indicators
    - Show success indicator for payment_status='verified'
    - Show rejection indicator for payment_status='rejected'
    - Display appropriate status badges
    - _Requirements: 2.3, 2.4_

  - [ ]* 1.4 Write property test for pending applications display
    - **Property 1: Pending Applications Display Completeness**
    - **Validates: Requirements 1.4, 2.1, 2.2, 2.5**

- [x] 2. Implement Interview Page Component
  - [x] 2.1 Create Interview page with interview list
    - Create `src/pages/student/Interview.tsx`
    - Query application_interviews with join to applications
    - Implement loading and error states
    - Add "Back to Dashboard" navigation link
    - _Requirements: 3.2, 3.5, 6.3_

  - [x] 2.2 Implement interview details display
    - Display scheduled_at date and time
    - Show interview mode (in_person, virtual, phone)
    - Display location for in_person interviews
    - Show interview status badge
    - _Requirements: 4.1, 4.2, 4.4, 4.5_

  - [x] 2.3 Separate upcoming and past interviews
    - Filter interviews by scheduled_at compared to current time
    - Display upcoming interviews section
    - Display past interviews section
    - Show empty state when no interviews
    - _Requirements: 3.4, 4.6_

  - [x] 2.4 Add virtual meeting join button
    - Show "Join Meeting" button for virtual interviews
    - Only display if meeting link exists in notes
    - _Requirements: 4.3_

  - [ ]* 2.5 Write property test for interview data display
    - **Property 2: Interview Data Display Completeness**
    - **Validates: Requirements 3.2, 4.1, 4.2, 4.5, 4.6**

- [x] 3. Configure Routes
  - [x] 3.1 Add lazy-loaded routes to config
    - Add `/student/payment` route with 'student' guard
    - Add `/student/interview` route with 'student' guard
    - Use React.lazy for code splitting
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]* 3.2 Write property test for route guard enforcement
    - **Property 3: Route Guard Enforcement**
    - **Validates: Requirements 1.5, 3.3, 5.4, 6.4**

- [x] 4. Checkpoint - Verify Core Functionality
  - Ensure all pages load without 404 errors
  - Verify navigation from QuickActions works


- [ ]* 5. Write Integration Tests
  - [ ]* 5.1 Write integration test for Payment page navigation
    - Test navigation from QuickActions to Payment page
    - Verify page renders with correct content
    - _Requirements: 1.1_

  - [ ]* 5.2 Write integration test for Interview page navigation
    - Test navigation from QuickActions to Interview page
    - Verify page renders with correct content
    - _Requirements: 3.1_

- [ ] 6. Final Checkpoint
  - Ensure all tests pass, ask the user if questions arise
  - Verify error handling works correctly
  - Confirm loading states display properly

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Existing database tables are used - no migrations needed
- Payment page redirects to Application Wizard (payment is Step 3)
