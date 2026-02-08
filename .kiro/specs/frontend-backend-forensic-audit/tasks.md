# Implementation Plan: Frontend-Backend Forensic Audit

## Overview

This implementation plan creates a systematic forensic audit system for the MIHAS Application System. The audit tools will scan the codebase, identify issues, and generate actionable reports. Implementation uses TypeScript with Bun runtime, fast-check for property testing, and produces Markdown/JSON reports.

## Tasks

- [x] 1. Set up audit infrastructure
  - [x] 1.1 Create audit scripts directory structure
    - Create `scripts/audit/` directory for all audit tools
    - Create `forensic_reports/` directory for output reports
    - Set up shared types in `scripts/audit/types.ts`
    - _Requirements: 1.1, 1.8_
  
  - [x] 1.2 Implement evidence generator utility
    - Create `scripts/audit/utils/evidence.ts`
    - Implement `generateEvidence()` function with file path, line numbers, reason
    - Implement confidence level assignment
    - _Requirements: 2.9, 9.6_
  
  - [x] 1.3 Write property test for evidence generator
    - **Property 10: Issue Flagging with Evidence**
    - **Validates: Requirements 2.9, 2.10, 2.11, 2.12, 9.6**


- [x] 2. Implement Contract Auditor
  - [x] 2.1 Create frontend API call scanner
    - Create `scripts/audit/contract/frontendScanner.ts`
    - Scan `src/services/` for fetch/axios calls
    - Extract endpoint, method, headers, auth mechanism
    - Parse line numbers using AST or regex
    - _Requirements: 1.1_
  
  - [x] 2.2 Write property test for API call extraction
    - **Property 1: API Call Extraction Completeness**
    - **Validates: Requirements 1.1**
  
  - [x] 2.3 Create backend endpoint scanner
    - Create `scripts/audit/contract/backendScanner.ts`
    - Scan `api-src/` for endpoint definitions
    - Extract actions from switch statements
    - Map auth requirements from middleware usage
    - _Requirements: 1.2_
  
  - [x] 2.4 Implement contract comparator
    - Create `scripts/audit/contract/comparator.ts`
    - Compare frontend calls to backend endpoints
    - Detect MISSING_ENDPOINT, UNUSED_ENDPOINT, METHOD_MISMATCH
    - _Requirements: 1.2, 1.5, 1.6, 1.7_
  
  - [x] 2.5 Write property test for contract mismatch detection
    - **Property 2: Contract Mismatch Detection**
    - **Validates: Requirements 1.2, 1.5, 1.6, 1.7**
  
  - [x] 2.6 Implement schema comparator
    - Create `scripts/audit/contract/schemaComparator.ts`
    - Compare request/response schemas between frontend and backend
    - Use Zod schema inference where available
    - _Requirements: 1.3, 1.4_
  
  - [x] 2.7 Write property test for schema comparison
    - **Property 3: Schema Comparison Correctness**
    - **Validates: Requirements 1.3, 1.4**
  
  - [x] 2.8 Generate Contract Mismatch Report
    - Create `scripts/audit/contract/reportGenerator.ts`
    - Output to `forensic_reports/contract-mismatch-report.md`
    - Include all mismatches with evidence
    - _Requirements: 1.8_

- [x] 3. Checkpoint - Contract Auditor Complete
  - Ensure all tests pass, ask the user if questions arise.


- [x] 4. Implement Page Auditor
  - [x] 4.1 Create page scanner
    - Create `scripts/audit/page/pageScanner.ts`
    - Scan `src/pages/` for all page components
    - Extract component names and file paths
    - _Requirements: 2.1_
  
  - [x] 4.2 Implement data load path tracer
    - Create `scripts/audit/page/dataLoadTracer.ts`
    - Identify React Query hooks, useEffect data fetches
    - Map dependencies between hooks
    - _Requirements: 2.1_
  
  - [x] 4.3 Write property test for data load path tracing
    - **Property 4: Page Data Load Path Tracing**
    - **Validates: Requirements 2.1**
  
  - [x] 4.4 Implement auth check verifier
    - Create `scripts/audit/page/authVerifier.ts`
    - Check for useAuth, requireAuth, ProtectedRoute usage
    - Verify admin pages have role checks
    - _Requirements: 2.2_
  
  - [x] 4.5 Write property test for auth check verification
    - **Property 5: Auth Check Verification**
    - **Validates: Requirements 2.2**
  
  - [x] 4.6 Implement error handling verifier
    - Create `scripts/audit/page/errorVerifier.ts`
    - Check for try/catch, .catch(), onError handlers
    - Verify error boundaries exist
    - _Requirements: 2.3_
  
  - [x] 4.7 Write property test for error handling verification
    - **Property 6: Error Handling Verification**
    - **Validates: Requirements 2.3**
  
  - [x] 4.8 Implement state handling verifier
    - Create `scripts/audit/page/stateVerifier.ts`
    - Check for isLoading, isEmpty conditionals
    - Verify skeleton/spinner usage during loading
    - _Requirements: 2.4, 2.5_
  
  - [x] 4.9 Write property test for state handling verification
    - **Property 7: State Handling Verification**
    - **Validates: Requirements 2.4, 2.5**
  
  - [x] 4.10 Implement race condition detector
    - Create `scripts/audit/page/raceDetector.ts`
    - Analyze concurrent fetches and state updates
    - Flag missing dependency arrays
    - _Requirements: 2.6_
  
  - [x] 4.11 Write property test for race condition detection
    - **Property 8: Race Condition Detection**
    - **Validates: Requirements 2.6**
  
  - [x] 4.12 Implement mobile responsiveness checker
    - Create `scripts/audit/page/mobileChecker.ts`
    - Check for Tailwind responsive prefixes (sm:, md:, lg:)
    - Flag components without responsive styles
    - _Requirements: 2.7, 7.1_
  
  - [x] 4.13 Write property test for mobile responsiveness
    - **Property 9: Mobile Responsiveness Verification**
    - **Validates: Requirements 2.7, 7.1**
  
  - [x] 4.14 Generate Page Validation Matrix
    - Create `scripts/audit/page/reportGenerator.ts`
    - Output to `forensic_reports/page-validation-matrix.md`
    - Include all pages with their audit results
    - _Requirements: 2.1-2.12_

- [x] 5. Checkpoint - Page Auditor Complete
  - Ensure all tests pass, ask the user if questions arise.


- [x] 6. Implement Loader Auditor and Unified Loader System
  - [x] 6.1 Create loader scanner
    - Create `scripts/audit/loader/loaderScanner.ts`
    - Scan for Spinner, Skeleton, Loading, Progress components
    - Identify all loader implementations across codebase
    - _Requirements: 3.1_
  
  - [x] 6.2 Implement redundancy detector
    - Create `scripts/audit/loader/redundancyDetector.ts`
    - Compare loader implementations for similarity
    - Flag redundant loaders with evidence
    - _Requirements: 3.2_
  
  - [x] 6.3 Write property test for loader identification
    - **Property 11: Loader Identification and Redundancy Detection**
    - **Validates: Requirements 3.1, 3.2**
  
  - [x] 6.4 Create unified loader component
    - Create `src/components/ui/UnifiedLoader.tsx`
    - Support variants: page, inline, skeleton, overlay
    - Support sizes: sm, md, lg
    - Include accessibility labels
    - _Requirements: 3.3_
  
  - [x] 6.5 Create global loading state store
    - Create `src/stores/loadingStore.ts`
    - Implement startLoading, stopLoading, isKeyLoading
    - Use Zustand for state management
    - _Requirements: 3.3_
  
  - [x] 6.6 Generate Loader Unification Plan
    - Create `scripts/audit/loader/reportGenerator.ts`
    - Output to `forensic_reports/loader-unification-plan.md`
    - List all loaders and replacement strategy
    - _Requirements: 3.1, 3.2_

- [x] 7. Implement Auth Auditor
  - [x] 7.1 Create workflow mapper
    - Create `scripts/audit/auth/workflowMapper.ts`
    - Map student workflow: Registration → Decision
    - Map admin workflow: Login → Dashboard → Actions
    - _Requirements: 4.1, 4.2_
  
  - [x] 7.2 Implement auth state analyzer
    - Create `scripts/audit/auth/stateAnalyzer.ts`
    - Find all auth state sources (stores, contexts)
    - Detect fragmentation across multiple sources
    - _Requirements: 4.3, 4.10_
  
  - [x] 7.3 Write property test for auth state consistency
    - **Property 12: Auth State Consistency**
    - **Validates: Requirements 4.3, 4.10**
  
  - [x] 7.4 Implement role enforcement checker
    - Create `scripts/audit/auth/roleChecker.ts`
    - Verify role checks on admin routes
    - Check for permission boundary enforcement
    - _Requirements: 4.4, 4.6_
  
  - [x] 7.5 Write property test for role enforcement
    - **Property 13: Role and Permission Enforcement**
    - **Validates: Requirements 4.4, 4.6, 4.7**
  
  - [x] 7.6 Implement redirect analyzer
    - Create `scripts/audit/auth/redirectAnalyzer.ts`
    - Verify redirect targets match user state
    - Flag incorrect redirects
    - _Requirements: 4.5_
  
  - [x] 7.7 Write property test for redirect correctness
    - **Property 14: Redirect Correctness**
    - **Validates: Requirements 4.5**
  
  - [x] 7.8 Implement security issue detector
    - Create `scripts/audit/auth/securityDetector.ts`
    - Check for cross-role data leakage
    - Check for stale session assumptions
    - _Requirements: 4.7, 4.8, 4.9_
  
  - [x] 7.9 Write property test for workflow transitions
    - **Property 15: Workflow Transition Completeness**
    - **Validates: Requirements 4.8, 4.9**
  
  - [x] 7.10 Generate Auth Workflow Report
    - Create `scripts/audit/auth/reportGenerator.ts`
    - Output to `forensic_reports/auth-workflow-report.md`
    - Include workflow maps and security issues
    - _Requirements: 4.1-4.10_

- [x] 8. Checkpoint - Auth Auditor Complete
  - Ensure all tests pass, ask the user if questions arise.


- [x] 9. Implement SSE Auditor and Reconnection System
  - [x] 9.1 Create SSE endpoint scanner
    - Create `scripts/audit/sse/endpointScanner.ts`
    - Scan `api-src/` for SSE response patterns
    - Extract event types and auth requirements
    - _Requirements: 5.1_
  
  - [x] 9.2 Create SSE listener scanner
    - Create `scripts/audit/sse/listenerScanner.ts`
    - Scan `src/` for EventSource usage
    - Check for reconnect and backoff logic
    - _Requirements: 5.2_
  
  - [x] 9.3 Write property test for SSE endpoint verification
    - **Property 16: SSE Endpoint Verification**
    - **Validates: Requirements 5.1, 5.2**
  
  - [x] 9.4 Create robust SSE client
    - Create `src/lib/sseClient.ts`
    - Implement auto-reconnect on connection loss
    - Implement exponential backoff (1s, 2s, 4s, 8s, max 30s)
    - Add battery-friendly disconnect on visibility change
    - _Requirements: 5.3, 5.4, 5.5_
  
  - [x] 9.5 Write property test for exponential backoff
    - **Property 17: Exponential Backoff Implementation**
    - **Validates: Requirements 5.4**
  
  - [x] 9.6 Wire SSE to notifications
    - Update `src/hooks/useStudentNotifications.ts`
    - Use new SSE client for realtime updates
    - Add polling fallback
    - _Requirements: 5.6, 5.10_
  
  - [x] 9.7 Wire SSE to application status
    - Update `src/hooks/useRealtime.ts`
    - Use new SSE client for status updates
    - _Requirements: 5.7_
  
  - [x] 9.8 Wire SSE to admin dashboard
    - Update `src/hooks/useAdminDashboardPolling.ts`
    - Use new SSE client for dashboard updates
    - _Requirements: 5.8_
  
  - [x] 9.9 Generate SSE Implementation Report
    - Create `scripts/audit/sse/reportGenerator.ts`
    - Output to `forensic_reports/sse-implementation-report.md`
    - Include endpoint/listener mapping and gaps
    - _Requirements: 5.1-5.10_

- [x] 10. Checkpoint - SSE Auditor Complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement Notification Auditor
  - [x] 11.1 Create notification trigger scanner
    - Create `scripts/audit/notification/triggerScanner.ts`
    - Scan for notification dispatch calls
    - Extract event types and delivery mechanisms
    - _Requirements: 6.1, 6.2_
  
  - [x] 11.2 Create email dispatch scanner
    - Create `scripts/audit/notification/emailScanner.ts`
    - Scan for Resend API calls
    - Check for retry and deduplication logic
    - _Requirements: 6.4_
  
  - [x] 11.3 Write property test for notification trigger identification
    - **Property 18: Notification Trigger Identification**
    - **Validates: Requirements 6.1, 6.2, 6.4**
  
  - [x] 11.4 Implement idempotency checker
    - Create `scripts/audit/notification/idempotencyChecker.ts`
    - Check for idempotency keys in email dispatches
    - Flag triggers without deduplication
    - _Requirements: 6.6, 6.7, 6.8_
  
  - [x] 11.5 Write property test for idempotency enforcement
    - **Property 19: Idempotency Enforcement**
    - **Validates: Requirements 6.6, 6.7, 6.8**
  
  - [x] 11.6 Generate Notification Flow Report
    - Create `scripts/audit/notification/reportGenerator.ts`
    - Output to `forensic_reports/notification-flow-report.md`
    - Include all triggers and idempotency status
    - _Requirements: 6.1-6.8_

- [x] 12. Checkpoint - Notification Auditor Complete
  - Ensure all tests pass, ask the user if questions arise.


- [x] 13. Implement Performance Auditor
  - [x] 13.1 Create animation scanner
    - Create `scripts/audit/performance/animationScanner.ts`
    - Scan for framer-motion imports
    - Scan for heavy CSS animations
    - _Requirements: 7.2_
  
  - [x] 13.2 Write property test for animation flagging
    - **Property 20: Heavy Animation Flagging**
    - **Validates: Requirements 7.2**
  
  - [x] 13.3 Create bundle analyzer
    - Create `scripts/audit/performance/bundleAnalyzer.ts`
    - Analyze Vite build output
    - Flag chunks exceeding thresholds
    - _Requirements: 7.5_
  
  - [x] 13.4 Write property test for bundle size threshold
    - **Property 21: Bundle Size Threshold**
    - **Validates: Requirements 7.5**
  
  - [x] 13.5 Implement logo animation
    - Create `src/components/ui/LogoAnimation.tsx`
    - Use lightweight character-shuffle effect
    - Respect prefers-reduced-motion
    - Non-blocking implementation
    - _Requirements: 8.1, 8.2, 8.3_
  
  - [x] 13.6 Write property test for reduced motion respect
    - **Property 22: Reduced Motion Respect**
    - **Validates: Requirements 8.3**
  
  - [x] 13.7 Generate Performance Fixes Report
    - Create `scripts/audit/performance/reportGenerator.ts`
    - Output to `forensic_reports/performance-fixes-report.md`
    - Include all performance issues and recommendations
    - _Requirements: 7.1-7.7, 8.1-8.4_

- [x] 14. Implement Dead Code Auditor
  - [x] 14.1 Create unused export scanner
    - Create `scripts/audit/deadcode/unusedExportScanner.ts`
    - Build import graph across codebase
    - Identify exports with no importers
    - _Requirements: 9.1, 9.2_
  
  - [x] 14.2 Create legacy integration scanner
    - Create `scripts/audit/deadcode/legacyScanner.ts`
    - Scan for @supabase imports
    - Scan for cloudflare imports
    - Scan for removed service references
    - _Requirements: 9.3_
  
  - [x] 14.3 Create commented code scanner
    - Create `scripts/audit/deadcode/commentedCodeScanner.ts`
    - Detect large commented code blocks
    - Flag with line numbers
    - _Requirements: 9.4_
  
  - [x] 14.4 Create feature flag scanner
    - Create `scripts/audit/deadcode/featureFlagScanner.ts`
    - Find feature flags not used in conditionals
    - _Requirements: 9.5_
  
  - [x] 14.5 Write property test for dead code identification
    - **Property 23: Dead Code Identification**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**
  
  - [x] 14.6 Generate Stale Code Removal List
    - Create `scripts/audit/deadcode/reportGenerator.ts`
    - Output to `forensic_reports/stale-code-removal-list.md`
    - Include all dead code with evidence and safe-to-remove status
    - _Requirements: 9.1-9.6_

- [x] 15. Checkpoint - All Auditors Complete
  - Ensure all tests pass, ask the user if questions arise.


- [x] 16. Create Master Audit Runner and Final Report
  - [x] 16.1 Create master audit runner
    - Create `scripts/audit/runFullAudit.ts`
    - Run all auditors in sequence
    - Aggregate results into master report
    - _Requirements: All_
  
  - [x] 16.2 Generate Final Clean Architecture Summary
    - Create `scripts/audit/generateSummary.ts`
    - Output to `forensic_reports/final-clean-architecture-summary.md`
    - Include executive summary with issue counts
    - Include prioritized action items
    - _Requirements: All_
  
  - [x] 16.3 Create audit CLI command
    - Add `bun run audit` script to package.json
    - Support individual auditor flags (--contract, --page, --loader, etc.)
    - Support --full for complete audit
    - _Requirements: All_

- [x] 17. Final Checkpoint - Full Audit System Complete
  - Ensure all tests pass, ask the user if questions arise.
  - Run full audit on codebase
  - Review generated reports

## Notes

- All tasks are required for comprehensive testing
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- All audit scripts use Bun runtime for consistency with project
- Reports are generated in Markdown for human readability
- Evidence format is consistent across all auditors
