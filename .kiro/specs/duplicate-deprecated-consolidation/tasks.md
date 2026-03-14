# Implementation Plan: Duplicate & Deprecated Code Consolidation

## Overview

Systematic consolidation of duplicate modules, dead code removal, async effect hardening, and ESLint enforcement across the MIHAS admissions portal frontend. Follows a 6-phase dependency-ordered approach: foundation utilities → hooks/services → UI components → dead code removal → async hardening → ESLint rules. Each consolidation step follows: merge → rewrite imports → verify build/test → delete deprecated file. TypeScript with `@/` path alias throughout.

## Tasks

- [ ] 1. Phase 1 — Foundation Utilities: Consolidate general utilities and accessibility helpers
  - [x] 1.1 Consolidate general utility functions into `src/lib/utils.ts`
    - Merge `debounce`, `throttle`, `formatFileSize`, `compressImage`, `validateFile`, `safeJsonParse`, `requestIdleCallback`, `prefersReducedMotion` from `src/utils/file-helpers.ts` and any other duplicate sources into `src/lib/utils.ts`
    - Preserve the most complete function signature and return type for each utility
    - Rewrite all imports to use `@/lib/utils`
    - Delete `src/utils/file-helpers.ts` after all imports are migrated
    - Run `bun run build` and `bun run test` to verify
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 9.1, 9.2_

  - [ ] 1.2 Consolidate accessibility helpers into `src/lib/accessibility-utils.ts`
    - Merge `trapFocus`, `announceToScreenReader`, `getFocusableElements`, `getContrastRatio`, `hexToRgb` from `src/utils/keyboardNavigation.ts`, `src/utils/contrastChecker.ts`, and `src/lib/utils.ts` into `src/lib/accessibility-utils.ts`
    - Retain the `announceToScreenReader` implementation that uses ARIA live regions with configurable politeness levels
    - Preserve focus trap behavior including Escape key handling and tab-wrapping logic
    - Rewrite all imports to use `@/lib/accessibility-utils`
    - Delete `src/utils/keyboardNavigation.ts` and `src/utils/contrastChecker.ts`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ] 1.3 Write property test for single canonical source (Property 1)
    - **Property 1: Single Canonical Source**
    - Generate module names from the canonical module map, verify each symbol is defined in exactly one file in `src/`
    - Test file: `tests/property/consolidation-canonical-source.test.ts`
    - Use `fast-check` with `numRuns: 100`
    - **Validates: Requirements 1.1, 2.1, 3.1, 11.1, 12.1, 16.1, 17.1**

  - [ ] 1.4 Write property test for canonical module export completeness (Property 2)
    - **Property 2: Canonical Module Export Completeness**
    - Generate (module, expectedExports) pairs from the union of all deprecated sources, verify all expected symbols are present as named exports
    - Test file: `tests/property/consolidation-exports.test.ts`
    - Use `fast-check` with `numRuns: 100`
    - **Validates: Requirements 1.2, 2.2, 12.2**

- [ ] 2. Phase 1 — Foundation Utilities: Consolidate sanitization, logger, and error messages
  - [ ] 2.1 Consolidate sanitization modules into `src/lib/sanitize/index.ts`
    - Merge `sanitizeForLog`, `sanitizeHtml`, `sanitizeText`, `sanitizeFilePath`, `sanitizeEmail`, `sanitizeForDisplay`, `safeJsonParse` from `src/lib/security.ts`, `src/lib/sanitizer.ts`, `src/lib/sanitize.ts`, and `src/lib/securityEnhancements.ts`
    - Consolidate `SecuritySanitizer` class from `securityConfig` and `securityEnhancements` into a single export
    - Retain the strictest security behavior for each function
    - Ensure no PII is ever included in log output from `sanitizeForLog`
    - Rewrite all imports to use `@/lib/sanitize`
    - Delete `src/lib/sanitizer.ts` and `src/lib/securityEnhancements.ts`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ] 2.2 Write property test for sanitization neutralizes XSS and protects PII (Property 6)
    - **Property 6: Sanitization Neutralizes XSS and Protects PII**
    - Generate strings with HTML tags, script elements, event handler attributes; verify `sanitizeHtml` and `sanitizeForDisplay` produce no executable HTML
    - Verify `sanitizeForLog` output is ≤200 chars with no newline/tab characters
    - Test file: `tests/property/consolidation-sanitize.test.ts`
    - Use `fast-check` with `numRuns: 100`
    - **Validates: Requirements 3.2, 3.6**

  - [ ] 2.3 Consolidate logger into `src/lib/logger.ts`
    - Merge `src/utils/logger.ts` (class-based with timestamps and structured entries) into `src/lib/logger.ts`
    - Retain structured `LogEntry` interface with timestamps, level, message, data fields
    - Preserve production error-always-log behavior from both implementations
    - Rewrite all imports of `@/utils/logger` to `@/lib/logger`
    - Delete `src/utils/logger.ts`
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [ ] 2.4 Write property test for logger structured entries (Property 14)
    - **Property 14: Logger Produces Structured Entries with Timestamps**
    - Generate (level, message, data) tuples; verify each logger method produces a `LogEntry` with valid ISO 8601 timestamp and correct level field
    - Test file: `tests/property/consolidation-logger.test.ts`
    - Use `fast-check` with `numRuns: 100`
    - **Validates: Requirements 11.2**

  - [ ] 2.5 Consolidate error messages into `src/lib/errorMessages.ts`
    - Merge `src/utils/errorMessages.ts` (rich `ErrorMessage` interface, `ErrorCategory` enum, `getErrorMessage`, `formatError`, `isRetryableError`, `getRetryDelay`) into `src/lib/errorMessages.ts`
    - Retain both the simple `ERROR_CODE_MESSAGES` map and the rich error message system with categories, retry logic, and domain-specific messages
    - Rewrite all imports of `@/utils/errorMessages` to `@/lib/errorMessages`
    - Delete `src/utils/errorMessages.ts`
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [ ] 3. Phase 1 — Foundation Utilities: Consolidate draft manager and security modules
  - [ ] 3.1 Consolidate draft management into `src/lib/draftManager.ts`
    - Merge `src/lib/draftCleanup.ts` (standalone functions with key scanning) into `src/lib/draftManager.ts` (class-based with race-condition protection)
    - Retain promise deduplication, beforeunload guard from class-based implementation
    - Merge comprehensive `DRAFT_KEYS` list from both files
    - Ensure `useDraftManager` hook imports only from consolidated `src/lib/draftManager.ts`
    - Verify the Auto_Save_System's 8-second interval draft persistence is preserved
    - Delete `src/lib/draftCleanup.ts`
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

  - [ ] 3.2 Write property test for DraftManager deduplication (Property 16)
    - **Property 16: DraftManager Deduplicates Concurrent Calls**
    - Generate N concurrent `clearAllDrafts(userId)` calls (N ≥ 2); verify the clearing operation executes exactly once and returns the same promise to all callers
    - Test file: `tests/property/consolidation-draft-dedup.test.ts`
    - Use `fast-check` with `numRuns: 100`
    - **Validates: Requirements 16.2**

  - [ ] 3.3 Consolidate security modules into `src/lib/securityConfig.ts`
    - Retain single CSP implementation (`CSP_CONFIG` + `generateCSPHeader`) in `src/lib/securityConfig.ts`
    - Delete disabled `SECURITY_HEADERS` stub in `src/lib/securityHeaders.ts`
    - Remove duplicate `SecuritySanitizer` from `securityConfig.ts` — import from `@/lib/sanitize` instead (depends on task 2.1)
    - Remove duplicate `InputValidator` from `securityPatches.ts` — reference canonical validators in `lib/validation/`
    - Consolidate `RateLimiter` into a single rate limiter utility
    - Merge unique functionality from `securityPatches.ts` (e.g., `SecureCodeExecution` math parser) into `securityConfig.ts`
    - Merge `securityUtils.ts` into `@/lib/sanitize` or `securityConfig.ts` as appropriate
    - Delete `src/lib/securityPatches.ts`, `src/lib/securityHeaders.ts`, `src/lib/securityUtils.ts`
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7_

- [ ] 4. Phase 1 Checkpoint
  - Run `bun run build` and `bun run test` to verify all Phase 1 consolidations
  - Verify no imports reference deprecated `src/utils/` paths for consolidated modules
  - Ensure all tests pass, ask the user if questions arise
  - _Requirements: 10.1, 10.2_

- [ ] 5. Phase 2 — Hooks & Services: Consolidate error handling, loading state, and network hooks
  - [ ] 5.1 Consolidate error handling hooks
    - Merge rollback support from `src/hooks/useErrorHandling.ts` into `src/hooks/useErrorHandler.ts` (toast+retry)
    - Preserve AbortController cancellation in `src/hooks/useAsyncOperation.ts`
    - Rewrite all imports of `@/hooks/useErrorHandling` to `@/hooks/useErrorHandler`
    - Delete `src/hooks/useErrorHandling.ts`
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [ ] 5.2 Write property test for error handler capabilities (Property 15)
    - **Property 15: Error Handler Preserves Core Capabilities**
    - Generate error scenarios; verify the canonical error handling hook accepts an optional `AbortSignal`, surfaces errors via toast notifications, and supports an optional rollback callback
    - Test file: `tests/property/consolidation-error-handler.test.ts`
    - Use `fast-check` with `numRuns: 100`
    - **Validates: Requirements 13.2**

  - [ ] 5.3 Consolidate loading state implementations
    - Establish clear boundaries: `src/stores/loadingStore.ts` (Zustand) for global loading state, `src/hooks/useLoadingState.ts` for component-level loading with min-duration
    - Remove redundant loading state logic from `src/hooks/useAsyncOperation.ts` if it overlaps with the retained hook
    - Add inline documentation clarifying which loading approach to use (global vs. component-level)
    - _Requirements: 14.1, 14.2, 14.3_

  - [ ] 5.4 Consolidate network status and offline modules
    - Retain `src/hooks/useNetworkStatus.ts` as canonical for Connection API integration, quality monitoring, and adaptive behavior
    - Retain `src/hooks/useOffline.ts` as canonical for offline sync queue
    - Merge `src/lib/networkChecker.ts` and `src/lib/networkDiagnostics.ts` connectivity-check functionality into `useNetworkStatus`
    - Rewrite all imports and delete `src/lib/networkChecker.ts` and `src/lib/networkDiagnostics.ts`
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [ ] 6. Phase 2 — Hooks & Services: Consolidate application hooks, notification hooks, toast, draft hook, and notification service
  - [ ] 6.1 Consolidate application data hooks
    - Retain React Query-based implementation in `src/hooks/queries/useApplicationDataQueries.ts` as canonical for `useApplications` and `useApplication`
    - Rewrite imports from `src/hooks/useApiServices.ts` (application hooks only) to canonical path
    - Consolidate `useApplicationsData` from `src/hooks/useApplicationsData.ts` and `src/hooks/admin/useApplicationsData.ts` — separate with distinct names if they serve different roles, or merge if both serve admin contexts
    - Preserve React Query cache key structures (e.g., `['applications', userId]`)
    - _Requirements: 5.1, 5.2, 5.6, 10.6_

  - [ ] 6.2 Write property test for React Query cache keys preserved (Property 13)
    - **Property 13: React Query Cache Keys Preserved**
    - Generate query hook names from the canonical hook set; verify the query key arrays used after consolidation are identical to pre-consolidation keys
    - Test file: `tests/property/consolidation-cache-keys.test.ts`
    - Use `fast-check` with `numRuns: 100`
    - **Validates: Requirements 10.6**

  - [ ] 6.3 Consolidate notification preferences hook
    - Retain React Query-based implementation in `src/hooks/queries/useNotificationQueries.ts` as canonical for `useNotificationPreferences`
    - Rewrite all imports from `src/hooks/useNotificationPreferences.ts` to `@/hooks/queries/useNotificationQueries`
    - Delete `src/hooks/useNotificationPreferences.ts`
    - _Requirements: 5.3, 5.6_

  - [ ] 6.4 Consolidate draft management hook
    - Consolidate draft management logic from `src/hooks/useAutoSave.ts` into standalone `src/hooks/useDraftManager.ts`
    - Ensure `useDraftManager` imports only from consolidated `@/lib/draftManager` (Phase 1 task 3.1)
    - Verify the 8-second auto-save interval behavior is preserved
    - _Requirements: 5.4, 5.5_

  - [ ] 6.5 Write property test for auto-save interval preserved (Property 8)
    - **Property 8: Auto-Save Interval Preserved**
    - Generate form states; verify the save callback is invoked at 8000ms intervals and draft data is persisted to storage after each invocation
    - Test file: `tests/property/consolidation-autosave.test.ts`
    - Use `fast-check` with `numRuns: 100`
    - **Validates: Requirements 5.4, 10.4, 16.5**

  - [ ] 6.6 Eliminate redundant toast store re-exports
    - Designate `src/hooks/useToast.ts` as canonical import path for `useToastStore`/`useToast` hooks, with `src/components/ui/Toast.tsx` as canonical source
    - Rewrite all imports of `@/stores/toastStore` to `@/hooks/useToast`
    - Delete `src/stores/toastStore.ts`
    - _Requirements: 21.1, 21.2, 21.3, 21.4_

  - [ ] 6.7 Consolidate notification service implementations
    - Consolidate `src/lib/notificationService.ts` (class with duplicate checking) and `src/lib/adminNotifications.ts` (admin-specific class) into `src/services/notifications.ts`
    - Move unique logic (duplicate checking, admin-specific methods) into the canonical service
    - Rewrite all imports and delete `src/lib/notificationService.ts` and `src/lib/adminNotifications.ts`
    - Verify admin notification workflows continue to function
    - _Requirements: 22.1, 22.2, 22.3, 22.4_

- [ ] 7. Phase 2 Checkpoint
  - Run `bun run build` and `bun run test` to verify all Phase 2 consolidations
  - Verify auto-save 8-second interval is preserved
  - Verify React Query cache keys are unchanged
  - Ensure all tests pass, ask the user if questions arise
  - _Requirements: 10.1, 10.2, 10.4, 10.6_

- [ ] 8. Phase 3 — UI Components: Consolidate skeleton components, error boundaries, and responsive layout
  - [ ] 8.1 Consolidate DashboardSkeleton into `src/components/ui/skeletons/DashboardSkeleton.tsx`
    - Merge `src/components/student/DashboardSkeleton.tsx`, `src/components/admin/DashboardSkeleton.tsx`, and `src/components/student/StudentDashboardSkeleton.tsx` into a single parameterized component with a variant prop in `src/components/ui/skeletons/DashboardSkeleton.tsx`
    - Rewrite all imports to reference the canonical skeleton location
    - Delete the deprecated skeleton files
    - _Requirements: 4.1, 19.1, 19.2, 19.3_

  - [ ] 8.2 Consolidate ErrorBoundary into `src/components/ui/ErrorBoundary.tsx`
    - Merge `src/components/ErrorBoundary.tsx` into `src/components/ui/ErrorBoundary.tsx`
    - Extract shared extension-error-filtering logic from `AdminErrorBoundary`, `StudentErrorBoundary`, and `LazyLoadErrorBoundary` into the base `ErrorBoundary`
    - Have domain-specific boundaries extend or compose the base component
    - Rewrite all imports of `@/components/ErrorBoundary` to `@/components/ui/ErrorBoundary`
    - Delete `src/components/ErrorBoundary.tsx`
    - _Requirements: 4.4, 20.1, 20.2, 20.4_

  - [ ] 8.3 Consolidate ResponsiveLayout into `src/components/ui/ResponsiveLayout.tsx`
    - Merge `ResponsiveContainer`, `ResponsiveGrid`, and `ResponsiveStack` from `src/components/ui/ResponsiveContainer.tsx` into `src/components/ui/ResponsiveLayout.tsx`
    - Rewrite all imports to reference `@/components/ui/ResponsiveLayout`
    - Delete `src/components/ui/ResponsiveContainer.tsx`
    - _Requirements: 4.5, 4.7_

  - [ ] 8.4 Consolidate remaining duplicate UI components
    - Consolidate `AuthLayout` split between auth components and auth pages into `src/components/auth/`
    - Consolidate `ApplicationsTable` split between admin component files into `src/components/admin/`
    - Consolidate `NotificationPreferences` from student and notifications surfaces into `src/components/notifications/NotificationPreferences.tsx`
    - Rewrite all imports to reference canonical locations using `@/` path alias
    - _Requirements: 4.2, 4.3, 4.6, 4.7_

  - [ ] 8.5 Write property test for focus trap behavior (Property 7)
    - **Property 7: Focus Trap Preserves Tab-Wrapping and Escape Handling**
    - Generate DOM structures with N focusable elements (N ≥ 1); verify forward Tab wraps last→first, Shift+Tab wraps first→last, and Escape releases the trap
    - Test file: `tests/property/consolidation-focus-trap.test.ts`
    - Use `fast-check` with `numRuns: 100`
    - **Validates: Requirements 2.4**

- [ ] 9. Phase 3 Checkpoint
  - Run `bun run build` and `bun run test` to verify all Phase 3 consolidations
  - Ensure all tests pass, ask the user if questions arise
  - _Requirements: 10.1, 10.2_

- [ ] 10. Phase 4 — Dead Code Removal: Delete files with zero import references
  - [ ] 10.1 Delete dead utility and lib files
    - Delete: `src/utils/uploadTest.ts`, `src/utils/extension-conflict-prevention.ts`, `src/utils/duplicate-detection.ts`, `src/utils/testNotifications.ts`
    - Delete: `src/lib/secureDisplay.ts`, `src/lib/secureMessaging.ts`, `src/lib/secureExecution.ts`, `src/lib/emailTemplates.ts`, `src/lib/historyTracker.ts`, `src/lib/devMode.ts`, `src/lib/maintenance.ts`
    - Delete: `src/lib/schemas/ai.ts` and remove empty `src/lib/schemas/` directory
    - Verify zero import references before each deletion
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 18.8, 18.9, 18.10, 18.11_

  - [ ] 10.2 Delete dead type files
    - Delete: `src/types/analytics.ts`, `src/types/compliance.ts`, `src/types/plugins.ts`
    - Verify zero import references before each deletion
    - _Requirements: 18.12, 18.13, 18.14_

  - [ ] 10.3 Delete dead component files and directories
    - Delete: `src/components/ui/FeedbackWidget.tsx`, `src/components/ui/ConflictResolution.tsx`, `src/components/ui/DraftDeletionTest.tsx`, `src/components/ui/SimpleErrorBoundary.tsx`
    - Delete: `src/components/application/FileUploadTest.tsx`, `src/components/application/UploadDebugger.tsx`
    - Delete: `src/components/dev/NotificationTester.tsx`
    - Delete empty `src/components/eligibility/` directory
    - Verify zero import references before each deletion
    - _Requirements: 18.16, 18.17, 18.18, 18.19, 18.20, 18.21, 18.22, 18.23, 20.3_

  - [ ] 10.4 Delete dead admin modules, hooks, services, and deprecated shims
    - Delete: `src/pages/admin/featureRegistry.ts` and staged admin modules (`EligibilityManagement.tsx`, `CacheMonitor.tsx`, `CacheMonitorDashboard.tsx`, `ReportTemplates.tsx`)
    - Delete: `src/hooks/useCacheMonitor.ts`
    - Evaluate `src/services/cacheMonitor.ts` — check if App.tsx usage is active or vestigial; remove if vestigial
    - Delete: `src/lib/submissionUtils.ts` (deprecated, zero imports)
    - Rewrite all imports of `src/hooks/useAuth.ts` to reference AuthContext directly, then delete the shim
    - _Requirements: 6.1, 6.2, 6.3, 18.15, 18.24, 18.25_

  - [ ] 10.5 Verify `src/utils/` directory status
    - If `src/utils/` is empty after all consolidations, delete the directory
    - If `src/utils/` retains files serving a distinct purpose, document the boundary between `src/utils/` and `src/lib/`
    - _Requirements: 9.3, 9.4_

  - [ ] 10.6 Write property test for deprecated and dead files deleted (Property 4)
    - **Property 4: Deprecated and Dead Files Deleted**
    - Generate file paths from the full deletion list (deprecated sources + dead code files); verify each file does not exist on disk
    - Test file: `tests/property/consolidation-dead-files.test.ts`
    - Use `fast-check` with `numRuns: 100`
    - **Validates: Requirements 1.4, 3.5, 6.1, 6.2, 6.3, 9.2, 11.4, 12.4, 18.1–18.25**

  - [ ] 10.7 Write property test for no imports from deprecated paths (Property 3)
    - **Property 3: No Imports From Deprecated Paths**
    - Generate source file paths from `src/`; scan each for import statements referencing any deprecated path in the full deprecated path list
    - Test file: `tests/property/consolidation-imports.test.ts`
    - Use `fast-check` with `numRuns: 100`
    - **Validates: Requirements 1.3, 2.3, 3.4, 5.6, 8.1, 9.5, 11.3, 12.3, 13.3, 15.5, 21.3**

- [ ] 11. Phase 4 Checkpoint
  - Run `bun run build` and `bun run test` to verify all dead code removals
  - Scan for any additional exported symbols with zero import references and flag for removal
  - Ensure all tests pass, ask the user if questions arise
  - _Requirements: 6.4, 6.5, 10.1, 10.2_

- [ ] 12. Phase 5 — Async Effect Hardening: Add cancellation guards and cleanup
  - [ ] 12.1 Add AbortController guards to fetch-based useEffect hooks
    - Audit all `useEffect` hooks in `src/hooks/` that perform fetch calls without an AbortController
    - Add `AbortController` with signal passed to fetch and `controller.abort()` in cleanup function
    - Handle `AbortError` exceptions gracefully (return without error handling)
    - Ensure state updates are guarded with `!controller.signal.aborted` check
    - _Requirements: 7.1, 7.2_

  - [ ] 12.2 Add timer cleanup to interval/timeout-based effects
    - Audit all `useEffect` hooks that set up `setInterval` or `setTimeout` without cleanup
    - Add `clearInterval`/`clearTimeout` in the effect cleanup function
    - Verify the Auto_Save_System's 8-second `setInterval` has proper cleanup on component unmount
    - _Requirements: 7.3, 7.5_

  - [ ] 12.3 Add event listener cleanup and replace deprecated MediaQueryList API
    - Audit all `useEffect` hooks that subscribe to event listeners without cleanup; add corresponding `removeEventListener` in cleanup
    - Replace all `MediaQueryList.addListener`/`removeListener` calls with standard `addEventListener('change', ...)`/`removeEventListener('change', ...)`
    - Verify PWA_Service_Worker registration and event listeners have proper cleanup
    - _Requirements: 7.4, 7.6, 7.7_

  - [ ] 12.4 Write property test for async effects have proper cleanup (Property 9)
    - **Property 9: Async Effects Have Proper Cleanup**
    - Static analysis: generate hook file paths from `src/hooks/`; verify each `useEffect` with fetch/timer/listener has corresponding cleanup (abort/clearInterval/clearTimeout/removeEventListener)
    - Test file: `tests/property/consolidation-async-cleanup.test.ts`
    - Use `fast-check` with `numRuns: 100`
    - **Validates: Requirements 7.2, 7.3, 7.4**

  - [ ] 12.5 Write property test for no deprecated MediaQueryList API (Property 10)
    - **Property 10: No Deprecated MediaQueryList API**
    - Generate source file paths from `src/`; verify no file contains calls to `addListener` or `removeListener` on MediaQueryList objects
    - Test file: `tests/property/consolidation-mql.test.ts`
    - Use `fast-check` with `numRuns: 100`
    - **Validates: Requirements 7.7**

- [ ] 13. Phase 5 Checkpoint
  - Run `bun run build` and `bun run test` to verify all async effect hardening
  - Verify PWA offline functionality is preserved
  - Ensure all tests pass, ask the user if questions arise
  - _Requirements: 10.1, 10.2, 10.5_

- [ ] 14. Phase 6 — ESLint Enforcement: Add no-restricted-imports rules
  - [ ] 14.1 Add `no-restricted-imports` rules for all deprecated paths
    - Extend `eslint.config.js` with `no-restricted-imports` patterns for all deprecated paths:
      - `@/utils/logger` → Use `@/lib/logger`
      - `@/utils/errorMessages` → Use `@/lib/errorMessages`
      - `@/lib/sanitizer`, `@/lib/sanitize`, `@/lib/securityEnhancements` → Use `@/lib/sanitize/index`
      - `@/utils/keyboardNavigation`, `@/utils/contrastChecker` → Use `@/lib/accessibility-utils`
      - `@/lib/draftCleanup` → Use `@/lib/draftManager`
      - `@/lib/networkChecker`, `@/lib/networkDiagnostics` → Use `@/hooks/useNetworkStatus`
      - `@/stores/toastStore` → Use `@/hooks/useToast`
      - `@/lib/notificationService`, `@/lib/adminNotifications` → Use `@/services/notifications`
      - `@/lib/securityPatches`, `@/lib/securityHeaders`, `@/lib/securityUtils` → Use `@/lib/securityConfig` or `@/lib/sanitize`
      - `@/hooks/useErrorHandling` → Use `@/hooks/useErrorHandler` or `@/hooks/useAsyncOperation`
      - `@/hooks/useNotificationPreferences` → Use `@/hooks/queries/useNotificationQueries`
      - `@/components/ErrorBoundary` → Use `@/components/ui/ErrorBoundary`
    - Each rule must include a descriptive message indicating the canonical module
    - All rules must be error-level (not warning)
    - Add rule preventing new imports from consolidated `src/utils/` paths
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 9.5, 21.4_

  - [ ] 14.2 Write property test for ESLint rules cover all deprecated paths (Property 11)
    - **Property 11: ESLint Rules Cover All Deprecated Paths**
    - Generate deprecated paths from the consolidation map; verify the ESLint configuration contains a `no-restricted-imports` pattern entry with the deprecated path in the `group` array, a non-empty `message` referencing the canonical module, and error-level severity
    - Test file: `tests/property/consolidation-eslint.test.ts`
    - Use `fast-check` with `numRuns: 100`
    - **Validates: Requirements 8.2, 8.4**

  - [ ] 14.3 Verify lint passes with zero violations
    - Run `bun run lint` and confirm zero violations from the new `no-restricted-imports` rules
    - _Requirements: 8.5_

  - [ ] 14.4 Write property test for no database DDL in frontend code (Property 12)
    - **Property 12: No Database DDL in Frontend Code**
    - Generate source file paths from `src/`; verify no file contains SQL DDL statements (`ALTER TABLE`, `DROP TABLE`, `CREATE TABLE`, `DROP COLUMN`, `ADD COLUMN`)
    - Test file: `tests/property/consolidation-no-ddl.test.ts`
    - Use `fast-check` with `numRuns: 100`
    - **Validates: Requirements 10.3**

- [ ] 15. Final Checkpoint
  - Run `bun run build` and `bun run test` to verify the complete consolidation
  - Run `bun run lint` to verify zero violations
  - Verify auto-save 8-second interval is preserved
  - Verify PWA offline functionality is preserved
  - Verify all 28 database tables are untouched (no query logic changes)
  - Ensure all tests pass, ask the user if questions arise
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each phase
- Property tests validate universal correctness properties using `fast-check` in `tests/property/`
- Unit tests validate specific examples and edge cases in `tests/unit/`
- Each consolidation follows: merge → rewrite imports (`@/` alias) → verify build/test → delete deprecated file
- If any step causes a build or test failure, revert and investigate before proceeding
- Re-export shims may be placed temporarily at deprecated paths if external consumers cannot be immediately migrated
