# Implementation Plan: Student Payment & Interview Pages Fix

## Overview

This implementation plan addresses three critical issues: React Error #130 on session termination, missing Payment/Interview navigation links, and incorrect "Complete Payment" navigation. The tasks are ordered to fix the most impactful issues first.

## Tasks

- [x] 1. Add Payment and Interview links to Desktop Sidebar
  - Import CreditCard and Calendar icons from lucide-react
  - Add Payment link (`/student/payment`) to studentLinks array
  - Add Interview link (`/student/interview`) to studentLinks array
  - Position links after Application and before Notifications
  - _Requirements: 2.1, 2.2, 2.5, 2.6_

- [x] 2. Add Payment and Interview links to Bottom Navigation
  - Import CreditCard and Calendar icons
  - Update defaultStudentNavItems to include Payment and Interview
  - Set requiresAuth: true for both new items
  - Reorder items: Dashboard, Payment, Interview, Profile
  - _Requirements: 2.1, 2.2, 2.5, 2.6, 2.7_

- [x] 3. Fix payment detection logic in Student Dashboard
  - [x] 3.1 Update hasPendingPayment calculation
    - Change logic to check for null, 'pending_review', or non-verified status
    - Ensure draft applications are excluded from pending payment count
    - _Requirements: 2.3, 4.2_
  
  - [x] 3.2 Update hasScheduledInterview calculation
    - Check for 'scheduled' or 'rescheduled' status in application_interviews
    - Add query to fetch interview data if not already present
    - _Requirements: 2.4, 4.3_

- [x] 4. Verify and fix Complete Payment navigation targets
  - [x] 4.1 Verify QuickActions href is `/student/payment`
    - Confirm the ActionCard for "Complete Payment" has correct href
    - _Requirements: 3.1_
  
  - [x] 4.2 Verify DashboardStatusOverview navigation
    - Check any "Complete Payment" links navigate to `/student/payment`
    - _Requirements: 3.2_

- [x] 5. Add auth state guards to prevent React Error #130
  - [x] 5.1 Add guard to DesktopSidebar
    - Return null early if user is undefined
    - _Requirements: 1.3, 5.4_
  
  - [x] 5.2 Add guard to BottomNavigation
    - Handle undefined auth state gracefully
    - _Requirements: 1.3, 5.4_
  
  - [x] 5.3 Add guard to AppLayout
    - Ensure layout doesn't render protected content when user is undefined
    - _Requirements: 1.4, 5.4_

- [x] 6. Checkpoint - Verify navigation changes work
  - Ensure all navigation links appear correctly
  - Test navigation to Payment and Interview pages
  - Verify no console errors during navigation

- [ ]* 7. Write unit tests for navigation components
  - [ ]* 7.1 Test DesktopSidebar contains Payment and Interview links
    - Verify links are present for authenticated students
    - _Requirements: 2.1, 2.2_
  
  - [ ]* 7.2 Test BottomNavigation contains Payment and Interview links
    - Verify links are present for authenticated students
    - _Requirements: 2.1, 2.2, 2.7_

- [ ]* 8. Write property tests for payment detection
  - [ ]* 8.1 Write property test for pending payment detection
    - **Property 5: Pending Payment Display**
    - **Validates: Requirements 3.3**
  
  - [ ]* 8.2 Write property test for navigation highlighting
    - **Property 2: Payment Link Highlighting**
    - **Validates: Requirements 2.3, 4.2**

- [x] 9. Test session termination flow
  - [x] 9.1 Verify logout completes without errors
    - Test signOut function clears cache and navigates
    - _Requirements: 1.1, 1.2, 5.2_
  
  - [x] 9.2 Verify no React Error #130 during logout
    - Test rapid auth state changes don't cause crashes
    - _Requirements: 1.3, 5.4_

- [x] 10. Final checkpoint - Full integration test
  - Test complete user flow: Dashboard → Payment → Interview
  - Test logout flow from each page
  - Verify all navigation indicators update correctly
  - Ensure all tests pass, ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
