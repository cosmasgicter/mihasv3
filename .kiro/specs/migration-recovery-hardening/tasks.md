# Implementation Plan: Migration Recovery & Hardening

## Overview

This plan migrates all frontend components from the legacy API client to the new unwrapping client, removes Supabase remnants, hardens the reload strategy, tunes React Query caching, and adds contract/property tests. All changes are frontend-side TypeScript; no backend modifications needed.

## Tasks

- [x] 1. Migrate Payment page to new API client (P0)
  - [x] 1.1 Refactor `src/pages/student/Payment.tsx` to import `applicationService` from `@/services/applications` instead of `applicationsApi` from `@/lib/apiClient`
    - Remove `response.success` and `response.data` envelope checks
    - Extract `applications` array directly from the unwrapped paginated response
    - Preserve the `ApplicationsListPayload` type and defensive array/object check
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [x] 1.2 Write property test for paginated response extraction
    - **Property 1: Paginated response extraction preserves all applications**
    - Generate random paginated responses with fast-check, verify extraction produces correct count and field preservation
    - **Validates: Requirements 1.2**
  - [x] 1.3 Write property test for payment status filtering
    - **Property 2: Payment status filtering is a correct partition**
    - Generate random application lists, verify pending + completed = total and sets are disjoint
    - **Validates: Requirements 1.5**

- [x] 2. Migrate remaining components from legacy API client (P0)
  - [x] 2.1 Migrate `src/pages/student/Interview.tsx` from `applicationsApi` to `interviewsService` from `@/services/interviews`
    - Remove envelope unwrapping, use service methods directly
    - _Requirements: 2.1, 2.2, 5.1_
  - [x] 2.2 Migrate `src/pages/student/Dashboard.tsx` from `applicationsApi` to `applicationService` from `@/services/applications`
    - Remove `response.success`/`response.data` checks
    - _Requirements: 2.1, 2.2_
  - [x] 2.3 Migrate `src/pages/auth/SignUpPage.tsx` from `authApi` to `apiClient` from `@/services/client`
    - Replace `authApi.register()` and `authApi.checkEmail()` with direct `apiClient.request()` calls
    - _Requirements: 2.1, 2.2_
  - [x] 2.4 Migrate `src/components/student/NotificationPreferences.tsx` from `notificationsApi` to `apiClient` from `@/services/client`
    - Remove envelope checks on preferences response
    - _Requirements: 2.1, 2.2_
  - [x] 2.5 Migrate `src/components/application/EligibilityDashboard.tsx` from `adminApi`/`catalogApi` to service modules
    - Replace `adminApi.getEligibilityAssessments()` with `apiClient.request('/admin?action=eligibility-assessments')`
    - Replace `catalogApi.getPrograms()` with `catalogService.getPrograms()`
    - _Requirements: 2.1, 2.2_
  - [x] 2.6 Migrate `src/components/application/ApplicationVersions.tsx` from `applicationsApi` to `applicationService`
    - Replace `applicationsApi.getVersions()` and `applicationsApi.createVersion()` with `apiClient.request()` calls
    - _Requirements: 2.1, 2.2_
  - [x] 2.7 Migrate `src/components/admin/UserImport.tsx` from `authApi` to `apiClient` from `@/services/client`
    - Replace `authApi.register()` with `apiClient.request('/auth?action=register', ...)`
    - _Requirements: 2.1, 2.2_
  - [x] 2.8 Migrate `src/components/admin/TestNotifications.tsx` from `adminApi`/`applicationsApi` to service modules
    - _Requirements: 2.1, 2.2_
  - [x] 2.9 Migrate `src/components/admin/ReportsGenerator.tsx` from `applicationsApi`/`adminApi` to service modules
    - _Requirements: 2.1, 2.2_
  - [x] 2.10 Migrate `src/pages/student/applicationWizard/components/AnalyticsDashboard.tsx` from `applicationsApi` to `applicationService`
    - _Requirements: 2.1, 2.2_

- [x] 3. Deprecate legacy API client
  - [x] 3.1 Refactor `src/lib/apiClient.ts` to re-export thin wrappers around the new client
    - Add `@deprecated` JSDoc tags to all exports
    - Implement each method as a wrapper that delegates to the new client and wraps the result in `{ success, data }` envelope for backward compatibility
    - Preserve all type exports (`Application`, `UserProfile`, etc.) for any remaining consumers
    - _Requirements: 2.3_

- [x] 4. Checkpoint — Verify all component migrations
  - Ensure all tests pass, ask the user if questions arise.
  - Verify no component directly imports from `@/lib/apiClient` for data fetching (type imports are acceptable)

- [x] 5. Remove Supabase remnants and fix PWA config (P2)
  - [x] 5.1 Remove `supabase.co` hostname check from `getCacheStrategy` in `src/lib/pwaConfig.ts`
    - Change the API detection line to only check `/api/` path prefix
    - _Requirements: 3.1, 3.2_
  - [x] 5.2 Write property test for getCacheStrategy URL classification
    - **Property 3: getCacheStrategy URL classification is correct and Supabase-free**
    - Generate random URLs with fast-check, verify classification rules
    - **Validates: Requirements 3.1, 3.2**

- [x] 6. Harden reload strategy (P2)
  - [x] 6.1 Review and verify `src/lib/reloadControl.ts` reload guard logic
    - Confirm `consumeAutoReloadGuard` uses sessionStorage with build key + reason + fingerprint as guard key
    - Ensure error boundaries use `performReload` with `mode: 'user'` for manual retry buttons
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 6.2 Write property test for reload guard idempotence
    - **Property 4: Reload guard allows at most one auto-reload per error fingerprint**
    - Generate random build keys, reasons, and fingerprints; verify first call returns true, subsequent calls return false
    - **Validates: Requirements 4.1, 4.2**

- [x] 7. Add contract test infrastructure (P3)
  - [x] 7.1 Create Zod response schemas in `tests/unit/contracts/schemas/`
    - Create schemas for: `ApplicationListResponseSchema`, `AdminStatsResponseSchema`, `AdminDashboardResponseSchema`, `AuditLogResponseSchema`, `AppealsResponseSchema`, `CatalogProgramsResponseSchema`, `CatalogIntakesResponseSchema`, `AuthSessionResponseSchema`, `NotificationPreferencesResponseSchema`
    - _Requirements: 7.1, 7.4_
  - [x] 7.2 Create contract tests in `tests/unit/contracts/`
    - Write tests that validate sample responses against Zod schemas
    - Include tests for applications, admin (dashboard, stats, audit-log, appeals), catalog, auth, notifications
    - _Requirements: 7.1, 7.2, 7.3_
  - [x] 7.3 Write property test for schema validation accept/reject
    - **Property 7: Contract schema validation accepts valid responses and rejects invalid ones**
    - Generate random valid and invalid objects with fast-check, verify Zod parse results
    - **Validates: Requirements 7.2**
  - [x] 7.4 Write property test for interview service routing
    - **Property 5: Interview service routes all requests through /applications**
    - Generate random interview data, verify constructed URLs start with `/applications`
    - **Validates: Requirements 5.1, 5.2, 5.3**
  - [x] 7.5 Write property test for admin endpoint schema validation
    - **Property 6: Admin endpoint responses conform to their Zod schemas**
    - Generate random valid audit log and appeals responses, verify schema parsing succeeds
    - **Validates: Requirements 6.1, 6.2**

- [x] 8. Checkpoint — Verify contract tests and PWA fixes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Tune React Query cache policies (P2)
  - [x] 9.1 Create centralized cache config at `src/lib/queryCacheConfig.ts`
    - Define `critical`, `static`, and `polling` config profiles with staleTime, gcTime, refetchOnWindowFocus, and refetchInterval values
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [x] 9.2 Update `src/hooks/queries/useSupabaseQuery.ts` CACHE_CONFIG to use the new centralized config
    - Ensure catalog queries use `static` profile (5-minute staleTime, no refetchOnWindowFocus)
    - Ensure dashboard queries use `critical` profile (30-second staleTime)
    - Ensure polling queries use `polling` profile (60-second refetchInterval minimum)
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [x] 9.3 Write property test for polling interval minimum
    - **Property 10: No polling query has refetchInterval below 30 seconds**
    - Verify all config profiles with refetchInterval have values >= 30000
    - **Validates: Requirements 9.4**

- [x] 10. Metrics consistency and dashboard preloader hardening (P1)
  - [x] 10.1 Review `src/services/metricsTracking.ts` calculation logic for consistency
    - Verify `approvalRate = (approved / completed) * 100` and `completionRate = (completed / total) * 100`
    - Ensure `trackApplicationEvent` gracefully handles 404 responses
    - _Requirements: 8.2, 8.4_
  - [x] 10.2 Write property test for metrics calculation consistency
    - **Property 8: Metrics calculations are consistent with input data**
    - Generate random application record arrays, verify calculated metrics match expected formulas
    - **Validates: Requirements 8.2**
  - [x] 10.3 Write property test for dashboard preloader error defaults
    - **Property 9: Dashboard preloader returns valid defaults on transient errors**
    - Simulate transient errors, verify returned objects have all expected fields with zero/empty defaults
    - **Validates: Requirements 8.3**

- [x] 11. Session lifecycle and auth hardening tests (P4)
  - [x] 11.1 Write property test for login cookie issuance
    - **Property 11: Login issues both access and refresh tokens as HTTP-only cookies**
    - Generate random valid credentials, verify response sets HTTP-only cookies
    - **Validates: Requirements 10.1**
  - [x] 11.2 Write property test for refresh token rotation
    - **Property 12: Refresh token rotation produces a new token on every use**
    - Generate random refresh sequences, verify each new token differs from the previous
    - **Validates: Requirements 10.3**
  - [x] 11.3 Write property test for admin RBAC enforcement
    - **Property 13: Admin actions enforce role-based access control**
    - Generate random (action, non-admin-role) pairs, verify 403 response
    - **Validates: Requirements 11.1, 11.2, 11.3**

- [x] 12. Asset pipeline validation (P4)
  - [x] 12.1 Create asset validation test at `tests/unit/assetValidation.test.ts`
    - **Property 14: All PWA precache and fallback paths reference existing assets**
    - Import PWA_CONFIG, iterate precache and fallback paths, verify each file exists in `public/`
    - _Requirements: 12.1, 12.2, 12.3_

- [x] 13. Final checkpoint — Full test suite
  - Ensure all tests pass, ask the user if questions arise.
  - Run `bun run test` to verify all unit, property, and contract tests pass
  - Verify no regressions in existing test suite

## Notes

- All tasks are required (comprehensive testing from start)
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- All changes are frontend-side TypeScript — no backend modifications needed
- The legacy API client is deprecated, not deleted, to avoid breaking undiscovered consumers
