# Implementation Plan: Realtime & Auto-Save Fix

## Overview

This implementation plan addresses two critical issues:
1. Admin dashboard not updating after status changes (missing `onApplicationChange` callback)
2. Application wizard auto-save not working (unreliable interval, draft restoration issues)

## Tasks

- [x] 1. Fix Admin Dashboard Realtime Integration
  - [x] 1.1 Add onApplicationChange callback to useAdminDashboardRealtime hook
    - Open `src/pages/admin/Dashboard.tsx`
    - Add `onApplicationChange` callback that calls `loadDashboardStats({ refresh: true })`
    - Add `onStatusHistoryChange` callback for audit trail updates
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3_

  - [x] 1.2 Write unit test for admin dashboard realtime integration

    - Test that `onApplicationChange` callback triggers `loadDashboardStats`
    - Test that dashboard data refreshes when realtime event received
    - _Requirements: 1.2_

- [x] 2. Fix Application Wizard Auto-Save Interval
  - [x] 2.1 Replace watch() subscription with setInterval
    - Open `src/pages/student/applicationWizard/hooks/useWizardController.ts`
    - Replace the `watch()` subscription effect with a `setInterval` that fires every 8 seconds
    - Add check to only save when form has data
    - Fix dependency array to include `saveDraft` function
    - _Requirements: 3.1, 3.5_

  - [x] 2.2 Fix saveDraft function for reliability
    - Remove `requestIdleCallback` wrapper - save synchronously
    - Ensure all necessary data is included (formData, grades, step, applicationId)
    - Update UI indicators correctly (isDraftSaving, draftSaved)
    - _Requirements: 3.2, 3.4_

  - [x] 2.3 Write property test for auto-save timing

    - **Property 3: Auto-Save Timing**
    - **Validates: Requirements 3.1**

- [x] 3. Fix Draft Restoration Logic
  - [x] 3.1 Fix step restoration to always restore saved step
    - Remove the `currentStepIndex === 0` condition
    - Always attempt to restore the saved step from draft
    - Use `currentStepKey` for reliable step matching
    - _Requirements: 4.2_

  - [x] 3.2 Fix form value restoration
    - Set form values with `shouldValidate: false` to prevent validation errors
    - Ensure all fields are restored including program and intake
    - Handle program ID resolution correctly
    - _Requirements: 4.1_

  - [x] 3.3 Fix grades restoration
    - Ensure `selectedGrades` array is properly restored
    - Validate grades array structure before setting
    - _Requirements: 4.5_

  - [x] 3.4 Add restoration confirmation message
    - Show success toast when draft is restored
    - Only show if draft was actually restored (not empty)
    - _Requirements: 4.3_

  - [ ]* 3.5 Write property test for draft round-trip consistency
    - **Property 2: Draft Round-Trip Consistency**
    - **Validates: Requirements 4.1, 4.2, 4.5**

- [x] 4. Checkpoint - Verify fixes work
  - Test admin dashboard updates after approving an application
  - Test auto-save fires every 8 seconds in wizard
  - Test draft restoration when clicking "Continue Draft"
  - Ensure all tests pass, ask the user if questions arise

- [ ]* 5. Write additional property tests
  - [ ]* 5.1 Write property test for completion percentage calculation
    - **Property 4: Completion Percentage Calculation**
    - **Validates: Requirements 5.1, 5.2**

  - [ ]* 5.2 Write property test for retry exponential backoff
    - **Property 5: Retry Exponential Backoff**
    - **Validates: Requirements 6.2**

- [x] 6. Final checkpoint
  - Ensure all tests pass
  - Verify no regressions in existing functionality
  - Ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
