# Requirements Document

## Introduction

This specification covers the consolidation of duplicate and deprecated code across the MIHAS admissions portal frontend codebase. An initial audit plus a follow-up forensic scan identified significant duplication between `src/lib/` and `src/utils/`, redundant hook implementations, overlapping security/sanitization modules, duplicated UI components, duplicate logger and error-handling systems, overlapping network-status modules, redundant loading-state abstractions, dead code modules with zero imports, and deprecated modules still present in the source tree. The goal is to establish single-source canonical modules, eliminate dead code, unify overlapping implementations, and harden async effects against race conditions — all while preserving backward compatibility with the production system, auto-save functionality, and PWA offline support.

## Glossary

- **Consolidation_Engine**: The refactoring process and tooling (codemod scripts, ESLint rules) that rewrites imports from deprecated paths to canonical modules
- **Canonical_Module**: The single authoritative source file for a given utility, hook, or component after consolidation
- **Deprecated_Path**: A file path that previously exported a utility or component but is superseded by the Canonical_Module
- **Re-export_Shim**: A temporary module at a Deprecated_Path that re-exports from the Canonical_Module to maintain backward compatibility during migration
- **Dead_Code**: Exported symbols with zero active import references in the production source tree
- **Async_Effect**: A React `useEffect` or event handler that performs asynchronous operations (fetch, timer, subscription)
- **Cancellation_Guard**: An AbortController signal or boolean flag used inside an Async_Effect to prevent state updates after unmount
- **Import_Restriction_Rule**: An ESLint `no-restricted-imports` configuration entry that prevents imports from Deprecated_Paths
- **Auto_Save_System**: The 8-second interval draft persistence mechanism in the application wizard
- **PWA_Service_Worker**: The service worker providing offline functionality for the admissions portal

## Requirements

### Requirement 1: Consolidate Utility Functions into Canonical Modules

**User Story:** As a developer, I want each utility function to exist in exactly one canonical location, so that I can avoid confusion about which implementation to use and reduce bundle size from duplicate code.

#### Acceptance Criteria

1. WHEN a utility function (`debounce`, `throttle`, `formatFileSize`, `compressImage`, `validateFile`, `safeJsonParse`, `requestIdleCallback`, `prefersReducedMotion`) exists in multiple files, THE Consolidation_Engine SHALL merge all implementations into a single Canonical_Module in `src/lib/`.
2. THE Canonical_Module SHALL preserve the function signature and return type of the most complete implementation for each consolidated utility.
3. WHEN a Deprecated_Path previously exported a consolidated utility, THE Consolidation_Engine SHALL rewrite all active import statements to reference the Canonical_Module using the `@/` path alias.
4. WHEN all imports for a Deprecated_Path have been rewritten, THE Consolidation_Engine SHALL delete the Deprecated_Path file from the source tree.
5. IF a Deprecated_Path still has external consumers that cannot be immediately migrated, THEN THE Consolidation_Engine SHALL place a Re-export_Shim at the Deprecated_Path that re-exports from the Canonical_Module.
6. THE Consolidation_Engine SHALL verify that the production build (`bun run build`) completes without errors after each consolidation pass.

### Requirement 2: Consolidate Accessibility Helpers into a Single Module

**User Story:** As a developer, I want all accessibility helper functions in one place, so that screen reader announcements, focus trapping, and contrast checking behave consistently across the application.

#### Acceptance Criteria

1. WHEN accessibility helpers (`trapFocus`, `announceToScreenReader`, `getFocusableElements`, `getContrastRatio`, `hexToRgb`) exist in multiple files, THE Consolidation_Engine SHALL merge them into `src/lib/accessibility-utils.ts` as the Canonical_Module.
2. THE Canonical_Module SHALL export all accessibility helpers with their existing function signatures preserved.
3. WHEN `src/utils/keyboardNavigation.ts`, `src/utils/contrastChecker.ts`, or `src/lib/utils.ts` previously exported these helpers, THE Consolidation_Engine SHALL rewrite all imports to reference `@/lib/accessibility-utils`.
4. THE Canonical_Module SHALL preserve existing focus trap behavior including Escape key handling and tab-wrapping logic.
5. IF the `announceToScreenReader` function has differing implementations across source files, THEN THE Consolidation_Engine SHALL retain the implementation that uses ARIA live regions with configurable politeness levels.

### Requirement 3: Unify Security and Sanitization API

**User Story:** As a developer, I want a single sanitization module with a clear API surface, so that security-critical functions like HTML sanitization and log sanitization are not scattered across four files with subtly different behaviors.

#### Acceptance Criteria

1. WHEN sanitization functions (`sanitizeForLog`, `sanitizeHtml`, `sanitizeText`, `sanitizeFilePath`) exist across `src/lib/security.ts`, `src/lib/sanitizer.ts`, `src/lib/sanitize.ts`, and `src/lib/securityEnhancements.ts`, THE Consolidation_Engine SHALL merge them into a single `src/lib/sanitize/index.ts` Canonical_Module.
2. THE Canonical_Module SHALL export each sanitization function with the strictest security behavior found across all duplicate implementations.
3. WHEN the `SecuritySanitizer` class has overlapping responsibilities between `securityConfig` and `securityEnhancements`, THE Consolidation_Engine SHALL consolidate into a single `SecuritySanitizer` export in the Canonical_Module.
4. THE Consolidation_Engine SHALL rewrite all imports of sanitization functions across the codebase to reference `@/lib/sanitize`.
5. WHEN all imports have been migrated, THE Consolidation_Engine SHALL delete the superseded files (`src/lib/sanitizer.ts`, `src/lib/securityEnhancements.ts`).
6. THE Canonical_Module SHALL preserve all existing sanitization behaviors for PII protection, ensuring no PII is ever included in log output.

### Requirement 4: Consolidate Duplicate UI Components

**User Story:** As a developer, I want each UI component to exist in one canonical location, so that visual consistency is maintained and bundle size is reduced.

#### Acceptance Criteria

1. WHEN `DashboardSkeleton` exists in 3 locations, THE Consolidation_Engine SHALL consolidate into a single component in `src/components/ui/` as the Canonical_Module.
2. WHEN `AuthLayout` is split between auth components and auth pages, THE Consolidation_Engine SHALL consolidate into a single component in `src/components/auth/`.
3. WHEN `ApplicationsTable` is split between admin component files, THE Consolidation_Engine SHALL consolidate into a single component in `src/components/admin/`.
4. WHEN `ErrorBoundary` is split between `src/components/` root and `src/components/ui/`, THE Consolidation_Engine SHALL consolidate into `src/components/ui/ErrorBoundary.tsx`.
5. WHEN `ResponsiveContainer`, `ResponsiveGrid`, and `ResponsiveStack` are duplicated between `ResponsiveContainer.tsx` and `ResponsiveLayout.tsx`, THE Consolidation_Engine SHALL merge into a single `src/components/ui/ResponsiveLayout.tsx`.
6. WHEN `NotificationPreferences` is duplicated between student and notifications surfaces, THE Consolidation_Engine SHALL consolidate into `src/components/notifications/NotificationPreferences.tsx`.
7. THE Consolidation_Engine SHALL rewrite all imports of consolidated components to reference the Canonical_Module using the `@/` path alias.

### Requirement 5: Consolidate Duplicate Hooks

**User Story:** As a developer, I want each data-fetching hook to have a single implementation, so that caching behavior, error handling, and loading states are consistent across the application.

#### Acceptance Criteria

1. WHEN `useApplications` and `useApplication` are duplicated between `src/hooks/useApiServices.ts` and `src/hooks/queries/useApplicationDataQueries.ts`, THE Consolidation_Engine SHALL retain the React Query-based implementation in `src/hooks/queries/useApplicationDataQueries.ts` as the Canonical_Module.
2. WHEN `useApplicationsData` is duplicated in `src/hooks/useApplicationsData.ts` and `src/hooks/admin/useApplicationsData.ts`, THE Consolidation_Engine SHALL consolidate into the admin-specific hook if both serve admin contexts, or separate them with distinct names if they serve different roles.
3. WHEN `useNotificationPreferences` is duplicated in `src/hooks/useNotificationPreferences.ts` and `src/hooks/queries/useNotificationQueries.ts`, THE Consolidation_Engine SHALL retain the React Query-based implementation in `src/hooks/queries/` as the Canonical_Module.
4. WHEN `useDraftManager` appears in both `src/hooks/useDraftManager.ts` and `src/hooks/useAutoSave.ts`, THE Consolidation_Engine SHALL consolidate draft management logic into a single hook while preserving the 8-second auto-save interval behavior.
5. THE Consolidation_Engine SHALL verify that the Auto_Save_System continues to function correctly after hook consolidation by confirming the 8-second interval draft persistence is preserved.
6. THE Consolidation_Engine SHALL rewrite all imports of consolidated hooks to reference the Canonical_Module.

### Requirement 6: Remove Deprecated and Dead Code

**User Story:** As a developer, I want all deprecated shims and unreachable modules removed from the source tree, so that the codebase is easier to navigate and maintain.

#### Acceptance Criteria

1. WHEN `src/lib/submissionUtils.ts` is marked deprecated and has zero active imports, THE Consolidation_Engine SHALL delete the file from the source tree.
2. WHEN `src/hooks/useAuth.ts` is a deprecated shim re-exporting from `AuthContext`, THE Consolidation_Engine SHALL rewrite all imports to reference the AuthContext directly and delete the shim.
3. WHEN staged admin modules (`EligibilityManagement.tsx`, `CacheMonitor.tsx`, `featureRegistry.ts`, `CacheMonitorDashboard.tsx`, `ReportTemplates.tsx`) have no route registration and no active imports, THE Consolidation_Engine SHALL delete these files.
4. THE Consolidation_Engine SHALL scan the source tree for any additional exported symbols with zero import references and flag them for removal.
5. IF a flagged Dead_Code symbol is part of a public API or test fixture, THEN THE Consolidation_Engine SHALL retain the symbol and document the retention reason.

### Requirement 7: Harden Async Effects Against Race Conditions

**User Story:** As a developer, I want all async effects to use proper cancellation and cleanup, so that unmounted components do not trigger state updates or memory leaks.

#### Acceptance Criteria

1. THE Consolidation_Engine SHALL audit all `useEffect` hooks that perform asynchronous operations (fetch calls, timers, subscriptions) across the `src/hooks/` directory.
2. WHEN an Async_Effect performs a fetch call without an AbortController, THE Consolidation_Engine SHALL add a Cancellation_Guard using `AbortController` with the signal passed to the fetch and `controller.abort()` called in the cleanup function.
3. WHEN an Async_Effect sets up a `setInterval` or `setTimeout` without cleanup, THE Consolidation_Engine SHALL add `clearInterval` or `clearTimeout` in the effect cleanup function.
4. WHEN an Async_Effect subscribes to an event listener without cleanup, THE Consolidation_Engine SHALL add the corresponding `removeEventListener` in the cleanup function.
5. THE Consolidation_Engine SHALL verify that the Auto_Save_System's 8-second `setInterval` has proper cleanup on component unmount.
6. THE Consolidation_Engine SHALL verify that the PWA_Service_Worker registration and event listeners have proper cleanup.
7. WHEN the deprecated `MediaQueryList.addListener`/`removeListener` API is used in any file, THE Consolidation_Engine SHALL replace it with the standard `addEventListener`/`removeEventListener` API.

### Requirement 8: Enforce Import Restrictions via ESLint

**User Story:** As a developer, I want ESLint to prevent imports from deprecated paths, so that consolidated modules remain the single source of truth over time.

#### Acceptance Criteria

1. WHEN consolidation is complete for a domain (utilities, accessibility, sanitization, components, hooks), THE Consolidation_Engine SHALL add `no-restricted-imports` ESLint rules for each Deprecated_Path.
2. THE Import_Restriction_Rule SHALL include a descriptive message indicating the Canonical_Module to import from instead.
3. THE Import_Restriction_Rule SHALL cover all Deprecated_Paths identified during the consolidation audit.
4. WHEN a developer attempts to import from a Deprecated_Path, THE Import_Restriction_Rule SHALL produce an ESLint error (not a warning).
5. THE Consolidation_Engine SHALL verify that `bun run lint` passes with zero violations after all import rewrites are complete.

### Requirement 9: Establish Canonical Directory Structure

**User Story:** As a developer, I want a clear convention for where utilities live (`src/lib/` vs `src/utils/`), so that new code is placed correctly and duplication does not recur.

#### Acceptance Criteria

1. THE Consolidation_Engine SHALL designate `src/lib/` as the canonical directory for all frontend utility modules.
2. WHEN utility functions exist in `src/utils/` that have been consolidated into `src/lib/`, THE Consolidation_Engine SHALL delete the `src/utils/` source files after all imports are rewritten.
3. IF `src/utils/` becomes empty after consolidation, THEN THE Consolidation_Engine SHALL delete the `src/utils/` directory.
4. IF `src/utils/` retains files that serve a distinct purpose not covered by `src/lib/`, THEN THE Consolidation_Engine SHALL document the boundary between the two directories.
5. THE Import_Restriction_Rule SHALL prevent new imports from `src/utils/` paths that have been consolidated into `src/lib/`.

### Requirement 10: Preserve Production Stability During Consolidation

**User Story:** As a product owner, I want consolidation changes to be safe for the live production system, so that students with in-progress applications are not affected.

#### Acceptance Criteria

1. THE Consolidation_Engine SHALL verify that the production build (`bun run build`) completes without TypeScript or bundling errors after each consolidation step.
2. THE Consolidation_Engine SHALL verify that all existing tests (`bun run test`) pass after each consolidation step.
3. THE Consolidation_Engine SHALL preserve backward compatibility with all 28 database tables by not modifying any database query logic during consolidation.
4. THE Consolidation_Engine SHALL preserve the Auto_Save_System's 8-second interval behavior throughout all changes.
5. THE Consolidation_Engine SHALL preserve PWA_Service_Worker offline functionality throughout all changes.
6. WHEN consolidating hooks that interact with React Query caches, THE Consolidation_Engine SHALL preserve existing cache key structures to avoid invalidating in-flight queries.
7. IF a consolidation step causes a test failure, THEN THE Consolidation_Engine SHALL revert the step and investigate before proceeding.

### Requirement 11: Consolidate Duplicate Logger Implementations

**User Story:** As a developer, I want a single logger module, so that logging behavior (dev-only suppression, production error forwarding) is consistent and not split across two competing implementations.

#### Acceptance Criteria

1. WHEN `logger` is exported from both `src/lib/logger.ts` (simple object) and `src/utils/logger.ts` (class-based with timestamps and structured entries), THE Consolidation_Engine SHALL merge into a single Canonical_Module in `src/lib/logger.ts`.
2. THE Canonical_Module SHALL retain structured log entries with timestamps from the class-based implementation and the production error-always-log behavior from both.
3. THE Consolidation_Engine SHALL rewrite all imports of `@/utils/logger` to reference `@/lib/logger`.
4. WHEN all imports have been migrated, THE Consolidation_Engine SHALL delete `src/utils/logger.ts`.

### Requirement 12: Consolidate Duplicate Error Message Systems

**User Story:** As a developer, I want a single error message module, so that user-facing error messages and error categorization logic are not maintained in two separate files with divergent APIs.

#### Acceptance Criteria

1. WHEN error message utilities exist in both `src/lib/errorMessages.ts` (code-to-message map, `getErrorMessageForCode`, `isNetworkError`) and `src/utils/errorMessages.ts` (rich `ErrorMessage` interface, `ErrorCategory` enum, `getErrorMessage`, `formatError`, `isRetryableError`, `getRetryDelay`), THE Consolidation_Engine SHALL merge into a single Canonical_Module in `src/lib/errorMessages.ts`.
2. THE Canonical_Module SHALL export both the simple code-to-message map and the rich error message system with categories, retry logic, and domain-specific messages (auth, application, file upload, payment, eligibility, network, validation).
3. THE Consolidation_Engine SHALL rewrite all imports of `@/utils/errorMessages` to reference `@/lib/errorMessages`.
4. WHEN all imports have been migrated, THE Consolidation_Engine SHALL delete `src/utils/errorMessages.ts`.

### Requirement 13: Consolidate Duplicate Error Handling Hooks

**User Story:** As a developer, I want a single error handling hook, so that error state management, retry logic, and toast notifications are not split across three overlapping implementations.

#### Acceptance Criteria

1. WHEN error handling is implemented in `src/hooks/useErrorHandler.ts` (toast-based with retry), `src/hooks/useErrorHandling.ts` (database-oriented with rollback), and `src/hooks/useAsyncOperation.ts` (AbortController-based with retry), THE Consolidation_Engine SHALL consolidate into a maximum of two hooks with clearly distinct responsibilities.
2. THE Canonical_Module(s) SHALL preserve AbortController cancellation from `useAsyncOperation`, toast integration from `useErrorHandler`, and database rollback support from `useErrorHandling`.
3. THE Consolidation_Engine SHALL rewrite all imports to reference the Canonical_Module(s).
4. WHEN all imports have been migrated, THE Consolidation_Engine SHALL delete superseded files.

### Requirement 14: Consolidate Duplicate Loading State Implementations

**User Story:** As a developer, I want a single approach to loading state management, so that loading indicators, minimum display durations, and progress tracking are not scattered across three competing abstractions.

#### Acceptance Criteria

1. WHEN loading state management exists in `src/hooks/useLoadingState.ts` (local hook with min-duration), `src/hooks/useAsyncOperation.ts` (async wrapper with loading), and `src/stores/loadingStore.ts` (global Zustand store), THE Consolidation_Engine SHALL establish clear boundaries: the Zustand store for global loading state, and a single local hook for component-level loading.
2. THE Consolidation_Engine SHALL remove redundant loading state logic from `useAsyncOperation` if it overlaps with the retained hook.
3. THE Consolidation_Engine SHALL document which loading approach to use for each scenario (global vs. component-level).

### Requirement 15: Consolidate Duplicate Network Status and Offline Implementations

**User Story:** As a developer, I want a single network status system, so that online/offline detection, connection quality monitoring, and offline sync are not spread across four overlapping modules.

#### Acceptance Criteria

1. WHEN network status is implemented in `src/hooks/useNetworkStatus.ts` (Connection API + quality monitoring + adaptive behavior), `src/hooks/useOffline.ts` (offline sync queue), `src/lib/networkChecker.ts` (singleton class with connectivity check), and `src/lib/networkDiagnostics.ts` (API connectivity test + wait-for-connection), THE Consolidation_Engine SHALL consolidate into a maximum of two modules with distinct responsibilities.
2. THE Canonical_Module for network status SHALL retain Connection API integration, quality monitoring, and adaptive behavior from `useNetworkStatus`.
3. THE Canonical_Module for offline sync SHALL retain the offline queue and sync functionality from `useOffline`.
4. THE Consolidation_Engine SHALL merge `src/lib/networkChecker.ts` and `src/lib/networkDiagnostics.ts` into the network status Canonical_Module, as both provide overlapping connectivity-check functionality.
5. THE Consolidation_Engine SHALL rewrite all imports and delete superseded files.

### Requirement 16: Consolidate Duplicate Draft Management Implementations

**User Story:** As a developer, I want draft management logic in one place, so that draft clearing, detection, and cleanup are not split across three files with overlapping key-scanning logic.

#### Acceptance Criteria

1. WHEN draft management exists in `src/lib/draftManager.ts` (class-based with race-condition protection), `src/lib/draftCleanup.ts` (standalone functions with overlapping key scanning), and `src/hooks/useDraftManager.ts` (React hook wrapping both), THE Consolidation_Engine SHALL merge `draftManager.ts` and `draftCleanup.ts` into a single `src/lib/draftManager.ts` Canonical_Module.
2. THE Canonical_Module SHALL retain the race-condition protection (promise deduplication, beforeunload guard) from the class-based implementation and the comprehensive key list from `draftCleanup.ts`.
3. THE Consolidation_Engine SHALL delete `src/lib/draftCleanup.ts` after merging.
4. THE `useDraftManager` hook SHALL import only from the consolidated `src/lib/draftManager.ts`.
5. THE Consolidation_Engine SHALL verify that the Auto_Save_System's 8-second interval draft persistence is preserved.

### Requirement 17: Consolidate Duplicate Security Module Sprawl

**User Story:** As a developer, I want security utilities consolidated, so that CSP generation, input validation, rate limiting, and session security are not duplicated across `securityConfig.ts`, `securityPatches.ts`, `securityHeaders.ts`, and `securityUtils.ts`.

#### Acceptance Criteria

1. WHEN CSP generation exists in both `src/lib/securityConfig.ts` (`CSP_CONFIG` + `generateCSPHeader`) and `src/lib/securityPatches.ts` (`CSPHelper.generateCSP`), THE Consolidation_Engine SHALL retain a single CSP implementation in `src/lib/securityConfig.ts`.
2. WHEN `SECURITY_HEADERS` is exported from both `src/lib/securityConfig.ts` and `src/lib/securityHeaders.ts` (disabled stub), THE Consolidation_Engine SHALL delete the disabled stub in `securityHeaders.ts`.
3. WHEN `SecuritySanitizer` in `securityConfig.ts` overlaps with sanitization functions in the sanitize Canonical_Module (Requirement 3), THE Consolidation_Engine SHALL remove the duplicate from `securityConfig.ts` and import from the sanitize module.
4. WHEN `InputValidator` in `securityPatches.ts` duplicates validation logic available in `lib/validation/`, THE Consolidation_Engine SHALL remove the duplicate and reference the canonical validators.
5. WHEN `RateLimiter` in `securityPatches.ts` duplicates client-side rate limiting, THE Consolidation_Engine SHALL consolidate into a single rate limiter utility.
6. THE Consolidation_Engine SHALL merge remaining unique functionality from `securityPatches.ts` (e.g., `SecureCodeExecution` math parser) into `securityConfig.ts` and delete `securityPatches.ts`.
7. THE Consolidation_Engine SHALL merge `securityUtils.ts` into the sanitize Canonical_Module or `securityConfig.ts` as appropriate and delete `securityUtils.ts`.

### Requirement 18: Remove Additional Dead Code Discovered in Forensic Scan

**User Story:** As a developer, I want all unreferenced modules removed, so that the source tree only contains code that is actually used.

#### Acceptance Criteria

1. WHEN `src/utils/uploadTest.ts` has zero import references, THE Consolidation_Engine SHALL delete the file.
2. WHEN `src/utils/extension-conflict-prevention.ts` has zero import references, THE Consolidation_Engine SHALL delete the file.
3. WHEN `src/utils/duplicate-detection.ts` has zero import references, THE Consolidation_Engine SHALL delete the file.
4. WHEN `src/lib/secureDisplay.ts` has zero import references, THE Consolidation_Engine SHALL delete the file.
5. WHEN `src/lib/secureMessaging.ts` has zero import references, THE Consolidation_Engine SHALL delete the file.
6. WHEN `src/lib/secureExecution.ts` has zero import references, THE Consolidation_Engine SHALL delete the file.
7. WHEN `src/lib/emailTemplates.ts` (frontend copy) has zero import references from `src/`, THE Consolidation_Engine SHALL delete the file.
8. WHEN `src/lib/historyTracker.ts` has zero import references, THE Consolidation_Engine SHALL delete the file.
9. WHEN `src/lib/devMode.ts` has zero import references, THE Consolidation_Engine SHALL delete the file.
10. WHEN `src/lib/maintenance.ts` has zero import references, THE Consolidation_Engine SHALL delete the file.
11. WHEN `src/lib/schemas/ai.ts` has zero import references, THE Consolidation_Engine SHALL delete the file and remove the empty `src/lib/schemas/` directory.
12. WHEN `src/types/analytics.ts` has zero import references, THE Consolidation_Engine SHALL delete the file.
13. WHEN `src/types/compliance.ts` has zero import references, THE Consolidation_Engine SHALL delete the file.
14. WHEN `src/types/plugins.ts` has zero import references, THE Consolidation_Engine SHALL delete the file.
15. WHEN `src/pages/admin/featureRegistry.ts` has zero import references, THE Consolidation_Engine SHALL delete the file.
16. WHEN `src/components/ui/FeedbackWidget.tsx` has zero import references, THE Consolidation_Engine SHALL delete the file.
17. WHEN `src/components/ui/ConflictResolution.tsx` has zero import references, THE Consolidation_Engine SHALL delete the file.
18. WHEN `src/components/ui/DraftDeletionTest.tsx` has zero import references, THE Consolidation_Engine SHALL delete the file.
19. WHEN `src/components/ui/SimpleErrorBoundary.tsx` has zero import references, THE Consolidation_Engine SHALL delete the file.
20. WHEN `src/components/application/FileUploadTest.tsx` has zero import references, THE Consolidation_Engine SHALL delete the file.
21. WHEN `src/components/application/UploadDebugger.tsx` has zero import references, THE Consolidation_Engine SHALL delete the file.
22. WHEN `src/components/dev/NotificationTester.tsx` has zero import references, THE Consolidation_Engine SHALL delete the file along with its dependency `src/utils/testNotifications.ts`.
23. WHEN `src/components/eligibility/` directory is empty, THE Consolidation_Engine SHALL delete the directory.
24. WHEN `src/hooks/useCacheMonitor.ts` has zero import references, THE Consolidation_Engine SHALL delete the file.
25. WHEN `src/services/cacheMonitor.ts` is only imported by dead code (`useCacheMonitor.ts`) and `App.tsx`, THE Consolidation_Engine SHALL evaluate whether the App.tsx usage is active or vestigial and remove if vestigial.

### Requirement 19: Consolidate Duplicate Skeleton Components

**User Story:** As a developer, I want skeleton loading components in one canonical location, so that dashboard loading states are not maintained in four separate files.

#### Acceptance Criteria

1. WHEN `DashboardSkeleton` exists in `src/components/student/DashboardSkeleton.tsx`, `src/components/admin/DashboardSkeleton.tsx`, and `src/components/ui/skeletons/DashboardSkeleton.tsx`, THE Consolidation_Engine SHALL consolidate into a single parameterized component in `src/components/ui/skeletons/DashboardSkeleton.tsx`.
2. WHEN `StudentDashboardSkeleton` in `src/components/student/StudentDashboardSkeleton.tsx` provides a near-identical skeleton to `DashboardSkeleton`, THE Consolidation_Engine SHALL merge it into the canonical `DashboardSkeleton` with a variant prop or delete it if fully redundant.
3. THE Consolidation_Engine SHALL rewrite all imports to reference the canonical skeleton location.

### Requirement 20: Consolidate Duplicate Error Boundary Components

**User Story:** As a developer, I want error boundaries consolidated, so that error recovery UI is consistent and not maintained in five separate files.

#### Acceptance Criteria

1. WHEN `ErrorBoundary` exists in `src/components/ErrorBoundary.tsx` and `src/components/ui/ErrorBoundary.tsx`, THE Consolidation_Engine SHALL consolidate into `src/components/ui/ErrorBoundary.tsx`.
2. WHEN `AdminErrorBoundary`, `StudentErrorBoundary`, and `LazyLoadErrorBoundary` share similar extension-error-filtering logic, THE Consolidation_Engine SHALL extract the shared logic into the base `ErrorBoundary` and have domain-specific boundaries extend or compose it.
3. WHEN `SimpleErrorBoundary` has zero import references, THE Consolidation_Engine SHALL delete it (covered in Requirement 18).
4. THE Consolidation_Engine SHALL rewrite all imports to reference the canonical error boundary locations.

### Requirement 21: Eliminate Redundant Toast Store Re-exports

**User Story:** As a developer, I want a single import path for the toast store, so that the same store is not re-exported from three different files creating confusion.

#### Acceptance Criteria

1. WHEN `useToastStore` and `useToast` are re-exported from `src/hooks/useToast.ts`, `src/stores/toastStore.ts`, and `src/components/ui/index.ts` (all re-exporting from `src/components/ui/Toast.tsx`), THE Consolidation_Engine SHALL designate `src/hooks/useToast.ts` as the canonical import path for hooks and `src/components/ui/Toast.tsx` as the canonical source.
2. THE Consolidation_Engine SHALL delete `src/stores/toastStore.ts` as a redundant re-export shim.
3. THE Consolidation_Engine SHALL rewrite all imports of `@/stores/toastStore` to reference `@/hooks/useToast`.
4. THE Import_Restriction_Rule SHALL prevent imports from `@/stores/toastStore`.

### Requirement 22: Consolidate Duplicate Notification Service Implementations

**User Story:** As a developer, I want notification sending logic in one place, so that the frontend notification service, admin notification service, and lib notification service are not three separate implementations.

#### Acceptance Criteria

1. WHEN notification sending exists in `src/services/notifications.ts` (API client wrapper), `src/lib/notificationService.ts` (class with duplicate checking), and `src/lib/adminNotifications.ts` (admin-specific class), THE Consolidation_Engine SHALL consolidate into `src/services/notifications.ts` as the Canonical_Module for all frontend notification operations.
2. THE Consolidation_Engine SHALL move any unique logic (duplicate checking, admin-specific methods) into the canonical service.
3. THE Consolidation_Engine SHALL rewrite all imports and delete `src/lib/notificationService.ts` and `src/lib/adminNotifications.ts`.
4. THE Consolidation_Engine SHALL verify that admin notification workflows continue to function after consolidation.
