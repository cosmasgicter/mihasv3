# Implementation Plan: Supabase Remnant Purge

## Overview

Systematically remove all Supabase client remnants from the MIHAS frontend. Each task replaces `supabase.from()` calls with `apiClient` or domain service calls, relocates type imports to `src/types/database.ts`, and finally deletes the stub module. Tasks are ordered to minimize breakage: types first, then services, then hooks, then pages, then cleanup.

## Tasks

- [x] 1. Create centralized type definitions
  - [x] 1.1 Create `src/types/database.ts` with all interfaces extracted from `src/lib/supabase.ts`
    - Export `Application`, `ApplicationInterview`, `Program`, `Intake`, `UserProfile`, `Subject`, `ApplicationDocument`, `ApplicationGrade`, `ApplicationWithDetails`, `Institution`
    - Shapes must match existing interfaces exactly
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 2. Migrate type-only imports
  - [x] 2.1 Update `src/types/offline.ts` to import `Application` from `@/types/database`
    - _Requirements: 6.1_
  - [x] 2.2 Update `src/stores/applicationStore.ts` to import `Application`, `Program`, `Intake` from `@/types/database`
    - _Requirements: 6.1, 6.3_
  - [x] 2.3 Update `src/services/applications.ts` to import `Application`, `ApplicationInterview` from `@/types/database`
    - _Requirements: 6.1_
  - [x] 2.4 Update `src/pages/student/Dashboard.tsx` to import `Application`, `Intake`, `ApplicationInterview` from `@/types/database`
    - _Requirements: 6.1, 6.3_
  - [x] 2.5 Update `src/pages/student/applicationWizard/types.ts` to import `Institution`, `Program`, `Intake` from `@/types/database`
    - _Requirements: 6.3_
  - [x] 2.6 Update `src/pages/admin/Users.tsx` to import `UserProfile` from `@/types/database`
    - _Requirements: 6.2_
  - [x] 2.7 Update `src/pages/student/ApplicationStatus.tsx` to import `ApplicationWithDetails` from `@/types/database`
    - _Requirements: 6.1_
  - [x] 2.8 Update `src/services/optimizedAuthService.ts` to import `UserProfile` from `@/types/database`
    - _Requirements: 6.2_
  - [x] 2.9 Update `src/services/dashboardPreloader.ts` to import `UserProfile` from `@/types/database` and remove `getSupabaseClient`/`isSupabaseConfigured` usage
    - _Requirements: 6.2, 3.4_
  - [x] 2.10 Update `src/hooks/useApiServices.ts` to import `Application` from `@/types/database`
    - _Requirements: 6.1_
  - [x] 2.11 Update `src/forms/applicationSchema.ts` to import `Program`, `Intake` from `@/types/database`
    - _Requirements: 6.3_

- [x] 3. Checkpoint - Verify type migration
  - Ensure all tests pass, run `bun run build` to confirm no import errors. Ask the user if questions arise.

- [x] 4. Migrate services with active Supabase calls
  - [x] 4.1 Migrate `src/services/offlineDataManager.ts`
    - Replace `supabase.from('programs')` with `catalogService.getPrograms()`
    - Replace `supabase.from('institutions')` with `apiClient.request('/catalog?type=institutions')`
    - Replace `supabase.from('subjects')` with `apiClient.request('/catalog?type=subjects')`
    - Replace `supabase.from('user_profiles')` with `apiClient.request('/auth?action=session')`
    - Replace `supabase.from('applications').upsert()` in `syncForm` with `applicationService.create()` / `applicationService.update()`
    - Replace `supabase.from('application_drafts')` with `applicationService.list({ mine: true, status: 'draft' })`
    - _Requirements: 3.1_
  - [x] 4.2 Migrate `src/services/offlineSync.ts`
    - Replace `supabase` import with `apiClient`
    - Replace any `supabase.from()` calls with `apiClient.request()` or domain service calls
    - _Requirements: 3.2_
  - [x] 4.3 Migrate `src/services/optimizedApplications.ts`
    - Replace `supabase.from('applications')` with `applicationService.list()`
    - _Requirements: 3.3_
  - [x] 4.4 Migrate `src/services/admin/audit.ts`
    - Replace `supabase` import with `apiClient`
    - Replace audit log queries with `apiClient.request('/admin?action=...')`
    - _Requirements: 3.1_
  - [x] 4.5 Migrate `src/services/alternativePathwayService.ts`
    - Replace `supabase` and `isSupabaseConfigured` with `apiClient`
    - _Requirements: 3.7_
  - [x] 4.6 Migrate `src/services/detailedEligibilityService.ts`
    - Replace `supabase` and `isSupabaseConfigured` with `apiClient`
    - _Requirements: 3.6_
  - [x] 4.7 Migrate `src/services/eligibilityAppealsService.ts`
    - Replace `supabase` and `isSupabaseConfigured` with `apiClient`
    - _Requirements: 3.5_
  - [x] 4.8 Write property test for offline sync routing through API (Property 2)
    - **Property 2: Offline sync routes through API**
    - **Validates: Requirements 3.2**

- [x] 5. Checkpoint - Verify service migration
  - Ensure all tests pass, run `bun run build`. Ask the user if questions arise.

- [x] 6. Migrate hooks with active Supabase calls
  - [x] 6.1 Migrate `src/hooks/queries/useApplicationQueries.ts`
    - Replace `supabase.from('application_drafts')` with `applicationService.list({ mine: true, status: 'draft' })`
    - Replace `supabase.from('application_analytics')` with `apiClient.request()` or no-op
    - _Requirements: 1.2_
  - [x] 6.2 Migrate `src/hooks/queries/useAnalyticsQueries.ts`
    - Replace `supabase` calls with `apiClient.request('/admin?action=stats')`
    - _Requirements: 1.3_
  - [x] 6.3 Migrate `src/hooks/queries/useNotificationQueries.ts`
    - Replace `supabase` calls with `notificationService`
    - _Requirements: 1.4_
  - [x] 6.4 Migrate `src/hooks/queries/useStorageQueries.ts`
    - Replace `supabase.storage` calls with `documentService`
    - _Requirements: 1.5_
  - [x] 6.5 Migrate `src/hooks/useApplicationsWithCounts.ts`
    - Replace `supabase.from('applications')` with `applicationService.list()`
    - _Requirements: 1.6_
  - [x] 6.6 Migrate `src/hooks/useApplicationSubmitFixed.ts`
    - Replace `supabase` calls with `applicationService`
    - _Requirements: 1.7_
  - [x] 6.7 Migrate `src/hooks/useEmailNotifications.ts`
    - Replace `supabase` calls with `notificationService`
    - _Requirements: 5.4_
  - [x] 6.8 Migrate `src/hooks/useErrorHandling.ts`
    - Replace `supabase.from('error_logs')` with `console.error()` fallback or fire-and-forget `apiClient` call
    - _Requirements: 5.5_
  - [x] 6.9 Migrate `src/hooks/admin/useApplicationsData.ts`
    - Replace `supabase` import with `applicationService`
    - _Requirements: 1.2_
  - [x] 6.10 Rewrite `src/hooks/queries/useSupabaseQuery.ts`
    - Keep `CACHE_CONFIG`, `useAuthSession`, `useAuthUser`, `useOptimisticMutation`
    - Remove `useTableQuery`, `useTableMutation`, `useRpcQuery` (or rewrite to use `apiClient`)
    - Remove `supabase` import
    - _Requirements: 7.3_
  - [x] 6.11 Write property test for error propagation stability (Property 1)
    - **Property 1: Error propagation stability**
    - **Validates: Requirements 1.8**
  - [x] 6.12 Write property test for polling deduplication (Property 5)
    - **Property 5: Polling deduplication**
    - **Validates: Requirements 8.2**

- [x] 7. Checkpoint - Verify hook migration
  - Ensure all tests pass, run `bun run build`. Ask the user if questions arise.

- [x] 8. Migrate wizard hooks and library utilities
  - [x] 8.1 Migrate `src/pages/student/applicationWizard/hooks/useWizardController.ts`
    - Replace `supabase` calls with `applicationService`
    - Ensure auto-save at 8-second intervals continues working
    - _Requirements: 2.1, 2.4_
  - [x] 8.2 Migrate `src/pages/student/applicationWizard/hooks/useAnalytics.ts`
    - Replace `supabase.from('application_analytics').insert()` with fire-and-forget `apiClient` POST or no-op
    - _Requirements: 2.2_
  - [x] 8.3 Migrate `src/pages/student/applicationWizard/hooks/useMultiDraft.ts`
    - Replace `supabase.from('application_drafts')` with `applicationService.list({ mine: true, status: 'draft' })`
    - _Requirements: 2.3_
  - [x] 8.4 Migrate `src/lib/errorHandling.ts`
    - Replace `supabase.from('error_logs').insert()` with `console.error()` or fire-and-forget API call
    - _Requirements: 4.1_
  - [x] 8.5 Migrate `src/lib/adminNotifications.ts`
    - Replace `supabase.from('profiles')` with `apiClient` or `notificationService`
    - _Requirements: 4.2_
  - [x] 8.6 Migrate `src/lib/applicationSession.ts`
    - Replace `supabase.from('application_drafts').delete()` and `supabase.from('applications').delete()` with `applicationService.delete()`
    - _Requirements: 4.3_
  - [x] 8.7 Migrate `src/lib/networkDiagnostics.ts`
    - Replace `supabase.from('institutions').select('count')` with `apiClient.request('/health?action=ping')`
    - _Requirements: 4.4_
  - [x] 8.8 Migrate `src/lib/maintenance.ts`
    - Replace `supabase.from('maintenance_logs').insert()` and `supabase.from('scheduled_updates').insert()` with fire-and-forget `apiClient` calls or no-ops
    - _Requirements: 4.5_
  - [x] 8.9 Migrate `src/lib/multiChannelNotifications.ts`
    - Replace `supabase` calls with `notificationService`
    - _Requirements: 4.6_
  - [x] 8.10 Migrate `src/lib/authDebug.ts`
    - Replace `supabase` calls with `apiClient`
    - _Requirements: 4.7_
  - [x] 8.11 Migrate `src/lib/regulatoryGuidelines.ts`
    - Replace dynamic `import('./supabase')` and `supabase.from('regulatory_guidelines')` with `apiClient`
    - _Requirements: 4.8_

- [-] 9. Migrate data layer and page hooks
  - [x] 9.1 Migrate `src/data/applications.ts`
    - Replace `supabase.from('applications')` in `useStats` with `apiClient.request('/admin?action=stats')` or `applicationService.list()`
    - Replace `supabase.from('applications')` in `useRecentActivity` with `applicationService.list({ sortBy: 'date', sortOrder: 'desc', pageSize: 5 })`
    - _Requirements: 5.1_
  - [x] 9.2 Migrate `src/data/analytics.ts`
    - Replace `supabase.from('applications').select('id').limit(1)` with `apiClient.request('/health?action=db')`
    - _Requirements: 5.2_
  - [x] 9.3 Migrate `src/pages/public/tracker/hooks/useApplicationTracker.ts`
    - Replace `supabase.from('applications')` with `apiClient.request('/applications?tracking_code=...')`
    - _Requirements: 5.3_
  - [x] 9.4 Write property test for application tracker search (Property 3)
    - **Property 3: Application tracker search via API**
    - **Validates: Requirements 5.3**

- [x] 10. Checkpoint - Verify all migrations
  - Ensure all tests pass, run `bun run build`. Ask the user if questions arise.

- [-] 11. Delete Supabase stub and final cleanup
  - [x] 11.1 Delete `src/lib/supabase.ts`
    - _Requirements: 7.1_
  - [x] 11.2 Run `bun run build` and verify zero import errors referencing `@/lib/supabase`
    - Fix any remaining imports discovered during build
    - _Requirements: 7.2_
  - [x] 11.3 Grep codebase for any remaining `supabase` references in `src/` and fix
    - _Requirements: 7.1, 7.2_
  - [x] 11.4 Write property test for type compatibility (Property 4)
    - **Property 4: Type compatibility with API responses**
    - **Validates: Requirements 6.4**

- [-] 12. Final checkpoint - Full verification
  - Run `bun run build`, `bun run lint`, and `bun run test`. Ensure all tests pass. Ask the user if questions arise.

## Notes

- All tasks are required including property tests
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Non-critical features (analytics tracking, error logging to DB, maintenance logs) can be replaced with no-ops or console fallbacks
- Auto-save (8-second interval) must continue working throughout — never break this
- All API calls use `credentials: 'include'` for HTTP-only cookie auth
