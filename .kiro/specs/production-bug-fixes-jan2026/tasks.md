# Implementation Plan: Production Bug Fixes January 2026

## Overview

This implementation plan addresses 14 production bugs in the MIHAS Application System. Tasks are organized to fix critical database issues first, then API layer fixes, followed by frontend component fixes. Each task builds incrementally and includes testing sub-tasks.

## Tasks

- [x] 1. Fix Database Functions (Supabase Migration)
  - [x] 1.1 Create migration to fix `get_admin_dashboard_stats` function
    - Change table reference from `applications_new` to `applications`
    - Verify function returns correct counts
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [x] 1.2 Create migration to fix `get_admin_dashboard_overview` function
    - Change table reference from `applications_new` to `applications`
    - Ensure approval rate calculation is correct (52%)
    - _Requirements: 1.1, 1.2, 8.3_
  - [x] 1.3 Write property test for approval rate calculation
    - **Property 1: Approval rate calculation correctness**
    - **Validates: Requirements 1.4**

- [x] 2. Fix Supabase Client Configuration
  - [x] 2.1 Update `src/lib/supabase.ts` debug configuration
    - Change `debug: true` to `debug: import.meta.env.DEV`
    - Ensure production builds suppress verbose logging
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 3. Fix Notifications API Column Name
  - [x] 3.1 Update `src/services/dashboardPreloader.ts` notification query
    - Change `.eq('read', false)` to `.eq('is_read', false)`
    - _Requirements: 2.1, 2.2_
  - [x] 3.2 Update `functions/api/notifications.js` column references
    - Change all `read` column references to `is_read`
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 3.3 Write unit test for notification query
    - Test that queries use `is_read` column
    - Test no 400 errors on fetch
    - _Requirements: 2.3_

- [x] 4. Fix Dashboard Stats API Call
  - [x] 4.1 Update `src/services/dashboardPreloader.ts` RPC function name
    - Change `get_dashboard_stats` to `get_admin_dashboard_stats`
    - Verify no 404 errors
    - _Requirements: 8.3, 8.4_
  - [x] 4.2 Write integration test for dashboard stats
    - Test correct RPC function is called
    - Test response structure matches expected format
    - _Requirements: 8.1, 8.2_

- [x] 5. Checkpoint - Verify Backend Fixes
  - Ensure all database and API fixes are working
  - Run existing tests to verify no regressions
  - Ask the user if questions arise

- [x] 6. Fix Skip Link Visibility
  - [x] 6.1 Update `src/lib/accessibility-utils.ts` skip link classes
    - Use `sr-only` and `focus:not-sr-only` pattern
    - Fix z-index and positioning
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 6.2 Verify skip link targets are correct
    - Ensure href points to main content, not footer
    - _Requirements: 4.4_
  - [x] 6.3 Write unit test for skip link visibility states
    - Test hidden by default
    - Test visible on focus
    - Test hidden on blur
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 7. Fix Mobile Auth Page Text Visibility
  - [x] 7.1 Update `src/components/auth/AuthLayout.tsx` for mobile branding
    - Add condensed mobile branding section
    - Use `lg:hidden` for mobile-only display
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - [x] 7.2 Write responsive test for auth pages
    - Test informative text visible on mobile
    - Test layout on various screen sizes
    - _Requirements: 7.3, 7.4_

- [x] 8. Fix Applications List Draft Filter
  - [x] 8.1 Update applications query to include drafts
    - Remove any `.neq('status', 'draft')` filters
    - Ensure status filter includes 'draft' option
    - _Requirements: 9.1, 9.2, 9.3_
  - [x] 8.2 Add visual indicator for draft status
    - Style draft applications distinctly
    - _Requirements: 9.4_
  - [x] 8.3 Write property test for draft inclusion
    - **Property 2: Application list draft inclusion**
    - **Validates: Requirements 9.1**

- [x] 9. Fix Approve/Reject React Error #321
  - [x] 9.1 Identify components causing state update during render
    - Review application approval/rejection handlers
    - _Requirements: 10.4_
  - [x] 9.2 Refactor to use React Query invalidation pattern
    - Move state updates to callbacks/useEffect
    - Use `queryClient.invalidateQueries` instead of direct state updates
    - _Requirements: 10.1, 10.2, 10.4_
  - [x] 9.3 Add error handling for status update failures
    - Display user-friendly error toast
    - _Requirements: 10.3_
  - [x] 9.4 Write E2E test for approve/reject workflow
    - Test approve action completes without errors
    - Test reject action completes without errors
    - _Requirements: 10.1, 10.2_

- [x] 10. Fix Users Page Display
  - [x] 10.1 Update users query to use correct table
    - Query `profiles` table
    - Handle empty results gracefully
    - _Requirements: 11.1, 11.2, 11.3_
  - [x] 10.2 Add proper loading and error states
    - Show skeleton during loading
    - Show appropriate empty state message
    - _Requirements: 11.4_
  - [x] 10.3 Write unit test for users page
    - Test data loading
    - Test empty state
    - Test error handling
    - _Requirements: 11.2, 11.3, 11.4_

- [x] 11. Synchronize Recent Activity with Application List
  - [x] 11.1 Ensure consistent data sources
    - Both views should query same `applications` table
    - No status exclusions in either query
    - _Requirements: 12.1, 12.2, 12.3_
  - [x] 11.2 Write property test for activity/list consistency
    - **Property 3: Activity and list data consistency**
    - **Validates: Requirements 12.1**

- [x] 12. Checkpoint - Verify Frontend Fixes
  - Ensure all UI fixes are working
  - Run visual regression tests
  - Ask the user if questions arise

- [x] 13. Improve Logout Performance
  - [x] 13.1 Update `src/contexts/AuthContext.tsx` signOut function
    - Clear local state immediately
    - Navigate before API call completes
    - Fire-and-forget API call
    - _Requirements: 13.1, 13.2, 13.3, 13.4_
  - [x] 13.2 Write performance test for logout
    - Test logout completes within 2 seconds
    - Test local state cleared immediately
    - _Requirements: 13.1, 13.2_

- [-] 14. Update Track Application Page Design
  - [x] 14.1 Review and update Track Application page components
    - Use current design system components
    - Ensure consistent styling
    - _Requirements: 5.1, 5.2, 5.4_
  - [x] 14.2 Ensure mobile responsiveness
    - Test on various screen sizes
    - _Requirements: 5.3_

- [x] 15. Consolidate Duplicate Visual Elements
  - [x] 15.1 Identify duplicate component implementations
    - Review for redundant UI components
    - _Requirements: 6.1_
  - [x] 15.2 Remove or deprecate older implementations
    - Keep newer, design-system-aligned versions
    - _Requirements: 6.2, 6.3_

- [x] 16. Verify Shadcn Component Implementation
  - [x] 16.1 Audit shadcn component usage
    - Check for incorrect API usage
    - Verify composition patterns
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

- [x] 17. Final Checkpoint - Full System Verification
  - Run all tests (unit, integration, E2E)
  - Verify all 14 issues are resolved
  - Ensure no regressions introduced
  - Ask the user if questions arise

## Notes

- All tasks are required for comprehensive bug fixes and testing
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Database migrations should be applied first before frontend fixes
- The codebase uses TypeScript with React 18, Vite, and Tailwind CSS
