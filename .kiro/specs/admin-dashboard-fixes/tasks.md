# Implementation Plan: Admin Dashboard Fixes

## Overview

This implementation plan addresses six issues: AI dashboard data inconsistency, missing draft applications, broken PDF extraction, session management, sidebar collapse behavior, and page speed best practices. Tasks are ordered to fix data issues first, then UI, then security.

## Tasks

- [x] 1. Fix AI Dashboard Application Count
  - [x] 1.1 Update comprehensive-metrics.js to count all application statuses
    - Modify the query to remove status filters when counting total applications
    - Ensure the count includes draft, submitted, under_review, approved, and rejected
    - _Requirements: 1.1, 1.2, 1.5_
  - [x] 1.2 Update predictiveAnalytics.ts analyzeTrends to use correct count
    - Ensure the /api/ai/trends endpoint returns accurate totalApplications
    - _Requirements: 1.4_
  - [ ]* 1.3 Write property test for application count consistency
    - **Property 1: Application Count Consistency**
    - **Validates: Requirements 1.1, 1.2, 1.4, 1.5, 2.4**

- [x] 2. Include Draft Applications in Applications Page
  - [x] 2.1 Update useApplicationFilters.ts default to include drafts
    - Change DEFAULT_APPLICATION_FILTERS.draftFilter from 'completed' to 'all'
    - Add DRAFT_FILTER_OPTIONS constant for filter dropdown
    - _Requirements: 2.1, 2.3_
  - [x] 2.2 Add DraftBadge component for visual distinction
    - Create badge showing "Draft (X%)" with amber styling
    - Display last updated timestamp
    - _Requirements: 2.2, 2.5_
  - [x] 2.3 Update ApplicationsTable to render draft badge
    - Conditionally render DraftBadge for applications with status='draft'
    - _Requirements: 2.2_
  - [ ]* 2.4 Write property test for draft application inclusion
    - **Property 2: Draft Application Inclusion**
    - **Validates: Requirements 2.1, 2.2, 2.5**

- [x] 3. Checkpoint - Verify data consistency
  - Ensure all tests pass, ask the user if questions arise.
  - Verify AI dashboard shows 28 total applications
  - Verify Applications page shows 28 total with drafts included

- [x] 4. Fix PDF Extraction Service
  - [x] 4.1 Create PDF extraction endpoint
    - Create functions/documents/extract.js
    - Implement text extraction using pdf-lib or pdfjs-dist
    - Return structured response with text, metadata, and error handling
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 4.2 Create frontend extraction service
    - Create src/services/documentExtraction.ts
    - Implement extractPDFContent function that calls the API
    - Handle scanned document detection
    - _Requirements: 3.4_
  - [x] 4.3 Store extraction results in document_analysis table
    - Insert extraction results with quality and completeness scores
    - _Requirements: 3.5_
  - [ ]* 4.4 Write property test for PDF extraction response structure
    - **Property 3: PDF Extraction Response Structure**
    - **Validates: Requirements 3.1, 3.2, 3.3**
  - [ ]* 4.5 Write property test for extraction persistence
    - **Property 4: Extraction Persistence**
    - **Validates: Requirements 3.5**

- [x] 5. Implement Bulk Session Termination
  - [x] 5.1 Create terminateAllOtherSessions function
    - Implement in src/services/sessionService.ts or similar
    - Use supabase.auth.signOut({ scope: 'others' })
    - Update device_sessions table to mark sessions inactive
    - _Requirements: 4.2, 4.4_
  - [x] 5.2 Add "Terminate All Other Sessions" button to UI
    - Add button to session management component
    - Disable when only one session active
    - Show loading state during termination
    - _Requirements: 4.1_
  - [x] 5.3 Implement success/error feedback
    - Display success toast with terminated count
    - Display error toast on failure with retry option
    - _Requirements: 4.3, 4.5_
  - [ ]* 5.4 Write property test for session termination completeness
    - **Property 5: Session Termination Completeness**
    - **Validates: Requirements 4.2, 4.4**

- [x] 6. Checkpoint - Verify functionality
  - Ensure all tests pass, ask the user if questions arise.
  - Test PDF extraction with sample documents
  - Test session termination with multiple sessions

- [x] 7. Fix Sidebar Collapse Behavior
  - [x] 7.1 Refactor AdminSidebar header layout
    - Update header div to use consistent flex layout
    - Ensure logo is always visible and centered when collapsed
    - Position toggle button correctly in both states
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 7.2 Verify expanded state shows full text
    - Ensure "MIHAS Admin" text visible when expanded
    - Verify navigation labels visible
    - _Requirements: 5.4_
  - [x] 7.3 Test flex alignment consistency
    - Verify flex properties consistent in both states
    - _Requirements: 5.5_
  - [ ]* 7.4 Write property test for sidebar state consistency
    - **Property 7: Sidebar State Consistency**
    - **Validates: Requirements 5.1, 5.2, 5.4, 5.5**

- [x] 8. Implement Page Speed Best Practices
  - [x] 8.1 Verify charset meta tag position in index.html
    - Ensure <meta charset="UTF-8"> is within first 1024 bytes
    - Move if necessary
    - _Requirements: 6.1_
  - [x] 8.2 Add security headers to middleware
    - Update functions/_middleware.js with CSP, HSTS, COOP headers
    - _Requirements: 6.2, 6.3, 6.4_
  - [x] 8.3 Update public/_headers file
    - Add security headers for static assets
    - _Requirements: 6.6_
  - [x] 8.4 Enable source maps in production build
    - Update vite.config.production.ts to set sourcemap: true
    - _Requirements: 6.5_
  - [ ]* 8.5 Write property test for security headers presence
    - **Property 8: Security Headers Presence**
    - **Validates: Requirements 6.2, 6.3, 6.4**
  - [ ]* 8.6 Write property test for charset position
    - **Property 9: Charset Declaration Position**
    - **Validates: Requirements 6.1**

- [x] 9. Final Checkpoint - Full verification
  - Ensure all tests pass, ask the user if questions arise.
  - Run Lighthouse audit to verify best practices score improvement
  - Verify all 6 issues are resolved

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
