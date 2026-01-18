# Implementation Plan: ApplicationCard Extraction

## Overview

This implementation plan extracts the ApplicationCard component from ApplicationsTable.tsx into a standalone, optimized component, fixes the VirtualizedApplicationsGrid integration, and improves performance through React.memo and responsive column support.

## Tasks

- [x] 1. Create ApplicationCard component file
  - [x] 1.1 Create `src/components/admin/applications/ApplicationCard.tsx`
    - Move ApplicationSummary interface from ApplicationsTable.tsx
    - Move INSTITUTION_NAMES mapping and getInstitutionName helper
    - Move ApplicationCard component with React.memo wrapper
    - Internalize getStatusBadge function with useCallback
    - Internalize getPaymentBadge function with useCallback
    - Export ApplicationCard, ApplicationSummary, INSTITUTION_NAMES, getInstitutionName
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 1.2 Write property test for badge rendering
    - **Property 1: Badge Rendering Consistency**
    - **Validates: Requirements 2.4**

- [x] 2. Update ApplicationsTable to use extracted component
  - [x] 2.1 Refactor ApplicationsTable.tsx
    - Import ApplicationCard, ApplicationSummary from './ApplicationCard'
    - Remove local ApplicationSummary interface definition
    - Remove local INSTITUTION_NAMES mapping
    - Remove local getInstitutionName helper
    - Remove local ApplicationCard component definition
    - Remove local getStatusBadge and getPaymentBadge functions
    - Update ApplicationsTableProps to use imported ApplicationSummary type
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Update VirtualizedApplicationsGrid with proper typing and props
  - [x] 3.1 Refactor VirtualizedApplicationsGrid.tsx
    - Import ApplicationSummary from './ApplicationCard'
    - Update props interface to accept ApplicationSummary[] instead of any[]
    - Add handler props (onStatusUpdate, onPaymentStatusUpdate, onViewDetails)
    - Add loading state props (updatingStatusId, updatingPaymentId)
    - Add selection props (selectedIds, onSelectionChange)
    - Implement responsive column count using window width
    - Update estimateSize to 480 for better card height estimation
    - Render ApplicationCard directly instead of using renderCard prop
    - _Requirements: 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.5, 6.3_

  - [ ]* 3.2 Write property test for responsive column layout
    - **Property 4: Responsive Column Layout**
    - **Validates: Requirements 5.4**

- [x] 4. Fix Applications.tsx integration
  - [x] 4.1 Update Applications.tsx to use refactored VirtualizedApplicationsGrid
    - Remove renderCard prop usage
    - Pass all required handler props to VirtualizedApplicationsGrid
    - Pass loading state props (updatingStatusId, updatingPaymentId)
    - Pass selection props (selectedIds, onSelectionChange)
    - Ensure virtualized grid renders when applications.length > 100
    - _Requirements: 4.1, 4.2, 4.6_

  - [ ]* 4.2 Write property test for virtualized grid rendering
    - **Property 2: Virtualized Grid Rendering**
    - **Validates: Requirements 4.6**

  - [ ]* 4.3 Write property test for handler propagation
    - **Property 3: Handler Propagation**
    - **Validates: Requirements 4.4**

- [x] 5. Update exports and verify type safety
  - [x] 5.1 Update applications index.ts
    - Add export for ApplicationCard
    - Add export for ApplicationSummary type
    - Add export for INSTITUTION_NAMES
    - Add export for getInstitutionName
    - _Requirements: 6.1, 6.4_

  - [x] 5.2 Verify TypeScript compilation
    - Run TypeScript compiler to check for errors
    - Fix any type errors introduced by refactoring
    - Ensure all imports use @/ path alias
    - _Requirements: 6.2, 6.4, 6.5_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The refactoring maintains backward compatibility with existing functionality
