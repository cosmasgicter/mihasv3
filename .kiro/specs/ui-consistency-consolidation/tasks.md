# Implementation Plan: UI Consistency Consolidation

## Overview

A 3-layer frontend refactoring that eliminates dead code, consolidates duplicate components behind canonical imports, replaces hardcoded colors with design tokens, and migrates manual loading state to React Query. No backend or database changes. Each layer is independently verifiable before proceeding to the next.

## Tasks

- [x] 1. Layer 1 — Safe Deletions (dead code with zero importers)
  - [x] 1.1 Delete dead admin layout files
    - Delete `src/components/admin/AdminLayout.tsx`
    - Delete `src/components/admin/AdminSidebar.tsx`
    - Delete `src/components/admin/AdminHeader.tsx`
    - Delete `src/components/admin/AdminMobileNav.tsx`
    - _Requirements: 3.1, 11.1_

  - [x] 1.2 Delete dead UI and auth files
    - Delete `src/components/ui/AuthLayout.tsx` (auth pages use `src/components/auth/AuthLayout.tsx`)
    - Delete `src/components/ui/SaveStatus.tsx`
    - Delete `src/components/ui/SaveNotification.tsx`
    - _Requirements: 4.1, 7.1_

  - [x] 1.3 Delete dead hooks and components
    - Delete `src/hooks/useMediaQuery.ts`
    - Delete `src/hooks/useMobileNavigation.ts`
    - Delete `src/components/admin/NotificationPreferences.tsx`
    - _Requirements: 5.3, 5.4, 11.1_

  - [x] 1.4 Remove barrel exports for deleted components
    - Remove exports for `AuthLayout`, `SaveStatus`, `SaveNotification` from `src/components/ui/index.ts`
    - Verify no remaining imports reference deleted files
    - _Requirements: 3.1, 4.1, 7.1_

  - [x] 1.5 Write property test — Property 1: Dead files are removed
    - **Property 1: Dead files are removed**
    - Use `fc.constantFrom(...deadFilePaths)` to assert `fs.existsSync` returns false for all deleted files
    - Test file: `tests/property/ui-consolidation.test.ts`
    - **Validates: Requirements 3.1, 4.1, 5.3, 5.4, 7.1, 11.1**

- [x] 2. Checkpoint — Layer 1 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify no TypeScript build errors from removed files (`bun run build`)

- [x] 3. Layer 2 — Error component import migrations
  - [x] 3.1 Migrate ErrorBanner consumers to Banner
    - In `SignInPage.tsx`: replace `ErrorBanner` import/usage with `Banner variant="error"` from `@/components/ui/Banner`
    - In `SignUpPage.tsx`: same migration
    - In `student/Dashboard.tsx`: same migration
    - Wire `dismissible` and `onDismiss` props as needed
    - _Requirements: 1.4_

  - [x] 3.2 Migrate LegacyErrorDisplay consumer to ErrorDisplay
    - In `student/ApplicationStatus.tsx`: replace `LegacyErrorDisplay` with `ErrorDisplay variant="section"` with `onRetry`
    - _Requirements: 1.4_

  - [x] 3.3 Remove deprecated exports from ErrorDisplay.tsx
    - Remove `LegacyErrorDisplay`, `InlineError`, `ErrorBanner`, `ErrorPage` exports from `src/components/ui/ErrorDisplay.tsx`
    - _Requirements: 1.4_

  - [x] 3.4 Write property test — Property 2: No deprecated error exports
    - **Property 2: No deprecated error component exports**
    - Use `fc.constantFrom('ErrorBanner', 'LegacyErrorDisplay', 'InlineError', 'ErrorPage')` to assert none are exported from `ErrorDisplay.tsx`
    - Test file: `tests/property/ui-consolidation.test.ts`
    - **Validates: Requirements 1.4**

  - [x] 3.5 Update error display unit tests
    - Update `tests/ui/error-display.test.tsx` to remove tests for deprecated components
    - Ensure remaining tests cover `ErrorDisplay` with `variant="inline"` and `variant="section"`
    - _Requirements: 1.4_

- [x] 4. Layer 2 — Toast import migrations
  - [x] 4.1 Migrate useToastStore imports to canonical path
    - Find all files importing `useToastStore` from `@/components/ui/Toast`
    - Change import source to `@/hooks/useToast` in each file (16+ files)
    - _Requirements: 6.1, 6.2_

  - [x] 4.2 Write property test — Property 3: Toast imports use canonical path
    - **Property 3: Toast imports use canonical path**
    - Scan all `.tsx`/`.ts` files under `src/` for `useToastStore` imports, assert source is `@/hooks/useToast`
    - Test file: `tests/property/ui-consolidation.test.ts`
    - **Validates: Requirements 6.1, 6.2**

- [x] 5. Layer 2 — Responsive hook migrations
  - [x] 5.1 Migrate useEnhancedResponsive consumers to useResponsive
    - In `ResponsiveLayout.tsx`: replace `useEnhancedResponsive` with `useResponsive` from `@/hooks/useResponsive`
    - In `ResponsiveContainer.tsx`: same migration
    - Adjust destructured properties to match `useResponsive` return shape
    - _Requirements: 5.3_

  - [x] 5.2 Delete useEnhancedResponsive hook
    - Delete `src/hooks/useEnhancedResponsive.ts` after all consumers are migrated
    - _Requirements: 5.3_

  - [x] 5.3 Migrate useIsMobile consumers where useResponsive is more appropriate
    - In `admin/Dashboard.tsx`: evaluate if `useResponsive` is a better fit, migrate if so
    - In `AuthenticatedNavigation.tsx`: same evaluation
    - In `AdminNavigation.tsx`: same evaluation
    - Keep `useIsMobile` for simple boolean-only cases
    - _Requirements: 5.3, 5.4_

- [x] 6. Checkpoint — Layer 2 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify no TypeScript build errors (`bun run build`)

- [x] 7. Layer 3 — Design token color migration
  - [x] 7.1 Create chart colors constant
    - Create `src/lib/chartColors.ts` with `CHART_COLORS` constant mapping semantic names to design token hex values
    - Values: `success: '#047857'`, `warning: '#b45309'`, `destructive: '#cc2424'`, `primary: '#2563eb'`, `purple: '#7c3aed'`
    - _Requirements: 8.1, 8.2_

  - [x] 7.2 Migrate EligibilityDashboard hardcoded colors
    - In `src/components/application/EligibilityDashboard.tsx`: replace all hardcoded hex color literals with `CHART_COLORS` references
    - Import `CHART_COLORS` from `@/lib/chartColors`
    - _Requirements: 8.1, 8.3_

  - [x] 7.3 Write property test — Property 4: No hardcoded hex in charts
    - **Property 4: No hardcoded hex colors in migrated chart files**
    - Extract hex literals from `EligibilityDashboard.tsx`, assert each is a member of `CHART_COLORS`
    - Test file: `tests/property/ui-consolidation.test.ts`
    - **Validates: Requirements 8.1, 8.2, 8.3**

- [x] 8. Layer 3 — React Query migration for auth pages
  - [x] 8.1 Migrate auth pages from manual loading to useMutation
    - In `SignInPage.tsx`: replace `setLoading(true/false)` + try/catch with `useMutation` from React Query
    - In `SignUpPage.tsx`: same migration
    - In `ForgotPasswordPage.tsx`: same migration
    - In `ResetPasswordPage.tsx`: same migration
    - Use `mutation.isPending` for loading state, `mutation.error` for error display
    - Wire `ErrorDisplay` or `Banner` for error rendering, `UnifiedLoader` for loading
    - _Requirements: 9.1, 9.4_

- [x] 9. Layer 3 — React Query migration for admin pages
  - [x] 9.1 Migrate admin pages from manual loading to React Query
    - In `admin/Intakes.tsx`: replace `setLoading` + `useEffect` fetch with `useQuery`
    - In `admin/EligibilityManagement.tsx`: same migration
    - In `admin/AuditTrail.tsx`: same migration
    - In `admin/Programs.tsx`: same migration
    - In `admin/Settings.tsx`: same migration
    - Use `isLoading`/`error`/`data` from `useQuery` for rendering states
    - _Requirements: 9.1, 9.4_

- [x] 10. Layer 3 — React Query migration for student pages
  - [x] 10.1 Migrate student pages from manual loading to React Query
    - In `student/NotificationSettings.tsx`: replace `setLoading` pattern with `useQuery`/`useMutation`
    - In `student/Payment.tsx`: same migration
    - In `student/ApplicationDetail.tsx`: same migration
    - In `student/Settings.tsx`: same migration
    - In `student/ApplicationStatus.tsx`: same migration
    - _Requirements: 9.1, 9.4_

  - [x] 10.2 Write property test — Property 5: No manual loading in migrated pages
    - **Property 5: Migrated pages do not use manual loading state**
    - For each migrated page path, scan source for `setLoading(true)`, assert zero matches
    - Test file: `tests/property/ui-consolidation.test.ts`
    - **Validates: Requirements 9.1, 9.4**

- [x] 11. Layer 3 — Application store refactor
  - [x] 11.1 Create React Query hooks for application data
    - Create `src/hooks/queries/useApplicationDataQueries.ts`
    - Implement `useApplications(userId)`, `useApplication(id)`, `usePrograms()`, `useIntakes()`
    - Use existing `CACHE_CONFIG` from `src/hooks/queries/useQueryConfig.ts`
    - Use existing service functions from `src/services/`
    - _Requirements: 10.1, 10.2_

  - [x] 11.2 Refactor applicationStore to UI-only state
    - In `src/stores/applicationStore.ts`: remove `applications`, `programs`, `intakes`, `currentApplication`, `loading`, `error` fields and their setters
    - Keep only `currentApplicationId`, `wizardStep`, `setCurrentApplicationId`, `setWizardStep`
    - Update the TypeScript interface to `ApplicationUIState`
    - _Requirements: 10.1, 10.2_

  - [x] 11.3 Update applicationStore consumers
    - Find all files importing server-state fields from `applicationStore`
    - Replace with the new React Query hooks from `useApplicationDataQueries`
    - Replace `useApplicationStore().loading` with React Query's `isLoading`
    - Replace `useApplicationStore().error` with React Query's `error`
    - _Requirements: 10.1, 10.2_

  - [x] 11.4 Write property test — Property 6: Application store UI-only
    - **Property 6: Application store contains only UI state**
    - Parse `applicationStore.ts` for exported field names, assert each is in the allowed UI field set (`currentApplicationId`, `wizardStep`, `setCurrentApplicationId`, `setWizardStep`)
    - Test file: `tests/property/ui-consolidation.test.ts`
    - **Validates: Requirements 10.1, 10.2**

- [x] 12. Final checkpoint — All layers complete
  - Ensure all tests pass (`bun run test`), ask the user if questions arise.
  - Verify clean TypeScript build (`bun run build`)
  - Verify no remaining imports of deleted files or deprecated exports

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each layer is independently verifiable — checkpoints enforce this
- All property tests go in a single file: `tests/property/ui-consolidation.test.ts`
- Property tests use `fast-check` with `numRuns: 10` per project convention
- The design uses TypeScript throughout — no language selection needed
- No backend or database changes are involved in this feature
