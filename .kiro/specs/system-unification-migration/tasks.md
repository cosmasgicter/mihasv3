# Implementation Plan: System Unification & Migration Completion

## Overview

Incremental cleanup of all legacy artifacts from the MIHAS codebase. Tasks are ordered to delete dead code first (safest), then migrate active modules, then rename/refactor, then clean config and docs. Each phase ends with a checkpoint to verify no regressions.

## Tasks

- [x] 1. Delete dead code files with zero importers
  - [x] 1.1 Delete `lib/auth/legacy.ts` (Supabase JWT verification, zero importers confirmed)
    - _Requirements: 2.1_
  - [x] 1.2 Delete `api-src/_auth.ts.legacy` (legacy Supabase auth handler)
    - _Requirements: 2.4_
  - [x] 1.3 Delete `src/components/supabase-ui/` directory (empty stub)
    - _Requirements: 3.1_
  - [x] 1.4 Delete `src/lib/authSecurity.ts` (direct Supabase calls, zero importers)
    - _Requirements: 1.4_
  - [x] 1.5 Delete `src/lib/enhancedSession.ts` (imports deprecated multiDeviceSession, zero importers)
    - _Requirements: 3.2_
  - [x] 1.6 Delete `src/lib/multiDeviceSession.ts` (deprecated, @ts-nocheck, Supabase calls, only importer was enhancedSession)
    - _Requirements: 1.2_
  - [x] 1.7 Delete `src/lib/migration/MigrationTracker.ts` (deprecated, @ts-nocheck, zero importers)
    - _Requirements: 3.3_
  - [x] 1.8 Delete `src/lib/sessionManager.ts` (no-op class with "let Supabase handle" comment — verify zero importers first, migrate if needed)
    - _Requirements: 1.6_
  - [x] 1.9 Delete stale test result files: `test_report.md`, `test_results.xml`, `test_results_latest.xml`, `test_comparison_report.md`
    - _Requirements: 10.3_

- [x] 2. Migrate active modules that still use Supabase calls
  - [x] 2.1 Migrate `src/lib/notificationService.ts` — replace `supabase.rpc()` and `supabase.from('in_app_notifications')` with API client calls to `/api/notifications`
    - Keep the public `NotificationService` class interface unchanged
    - Use `apiClient` from `@/services/client` for all API calls
    - Handle duplicate responses from backend (`{ duplicate: true }`) by returning `false`
    - _Requirements: 1.3, 9.1, 9.2, 9.3_
  - [ ]* 2.2 Write property test for no Supabase references in source code
    - **Property 1: No Supabase references in source code**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 2.2, 2.3, 3.2, 4.2, 9.1, 9.3**
  - [x] 2.3 Migrate `src/lib/applicationFlowAnalyzer.ts` — replace hardcoded `supabase.*` location strings with `database.*` / `Custom JWT Auth` / `R2 Storage`
    - Only string literal changes, no logic changes
    - _Requirements: 1.5_
  - [x] 2.4 Verify and clean `src/lib/offlineManager.ts` — confirm it has zero actual importers from `src/lib/` (importers reference `src/services/offlineManager` instead), then delete
    - If it does have active importers, migrate Supabase calls to API client
    - _Requirements: 1.1_

- [x] 3. Checkpoint — Verify deletions and migrations
  - Run `bun run test` to ensure all tests pass
  - Run `bun run build` to ensure no broken imports
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Rename Supabase-named identifiers
  - [x] 4.1 Rename `src/hooks/queries/useSupabaseQuery.ts` to `src/hooks/queries/useQueryConfig.ts`
    - Update all import sites: `useApplicationQueries.ts`, `useAnalyticsQueries.ts`, `useStorageQueries.ts`, `useNotificationQueries.ts`, `useOptimizedAuthState.ts`, `dashboardPreloader.ts`, `index.ts`
    - _Requirements: 4.1, 4.3_
  - [x] 4.2 Rename `SupabaseEligibilityAssessmentRow` to `EligibilityAssessmentRow` in `src/types/eligibility.ts` and update all references
    - Also update `EligibilityAssessmentWithProgram extends` declaration
    - _Requirements: 4.2_
  - [ ]* 4.3 Write property test for file rename consistency
    - **Property 3: File rename consistency**
    - **Validates: Requirements 4.1, 4.3**

- [x] 5. Clean environment configuration and dependencies
  - [x] 5.1 Remove all `SUPABASE_*` and `VITE_SUPABASE_*` variables from `.env.example`, `.env.development`, `.env.vercel`, `.env.hardened`, `.env.local`
    - Update header comments to reference Neon Postgres (not Supabase)
    - Remove deprecated sections entirely
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [x] 5.2 Remove Cloudflare entries from `.gitignore` (`.wrangler/`, `.mf/`)
    - _Requirements: 5.6_
  - [x] 5.3 Remove `wrangler` from `package.json` devDependencies and run `bun install`
    - _Requirements: 6.1, 6.2_
  - [ ]* 5.4 Write property test for no Supabase variables in environment files
    - **Property 2: No Supabase variables in environment files**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

- [x] 6. Checkpoint — Verify config and dependency changes
  - Run `bun install` to confirm clean lockfile
  - Run `bun run build` to confirm no missing env vars
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Wire SSE polling to frontend dashboards
  - [x] 7.1 Update `useRealtime` hook defaults: set `pollingEnabled: true` (keep `enabled: false` for SSE)
    - Verify polling endpoint exists in `api-src/sessions.ts`, add `poll` action if missing
    - _Requirements: 8.1, 8.3_
  - [x] 7.2 Wire `useRealtime` into student dashboard (`src/pages/student/Dashboard.tsx`) for application status updates
    - Use `useApplicationUpdates` from `useRealtime.ts` to subscribe to `application_update` events
    - Invalidate React Query cache on update to refresh dashboard data
    - _Requirements: 8.1, 8.2_
  - [ ]* 7.3 Write property test for SSE-to-polling fallback
    - **Property 4: SSE-to-polling fallback**
    - **Validates: Requirement 8.3**
  - [ ]* 7.4 Write property test for visibility-based polling pause/resume
    - **Property 5: Visibility-based polling pause and resume**
    - **Validates: Requirements 8.4, 8.5**

- [x] 8. Remove legacy Supabase references from api-src/auth.ts
  - [x] 8.1 Review `api-src/auth.ts` and remove any remaining comments or code paths that reference Supabase token migration or bootstrap migration
    - Keep the functional auth code (login, logout, refresh, session, register)
    - Remove bootstrap migration handler if it only serves Supabase user migration
    - _Requirements: 2.3_

- [x] 9. Update stale documentation
  - [x] 9.1 Delete Cloudflare/Supabase-specific docs that are entirely obsolete:
    - `docs/cloudflare-edge-function-performance.md`
    - `docs/cloudflare-deployment-guide.md`
    - `docs/AI_FEATURES_IMPLEMENTATION.md`
    - `docs/ADMIN_PAGES_DIAGNOSIS.md`
    - `docs/ADMIN_PAGES_FIX_SUMMARY.md`
    - `docs/ADMIN_PAGES_COMPLETE_FIX.md`
    - `docs/analysis/ADMIN_PAGES_ROOT_CAUSE_ANALYSIS.md`
    - `docs/analysis/ADMIN_ERROR_ROOT_CAUSE.md`
    - _Requirements: 7.7_
  - [x] 9.2 Update docs that have salvageable content but reference legacy services:
    - `docs/TROUBLESHOOTING.md` — replace Sentry/Supabase references with Vercel logs and Neon
    - `docs/guides/LAUNCH_INSTRUCTIONS.md` — rewrite for Vercel deployment (remove Sentry/Cloudflare)
    - `docs/guides/TECH_ALTERNATIVES.md` — remove Sentry recommendations
    - `docs/guides/TECH_STACK.md` — remove "Ready for Sentry integration"
    - `docs/API_REFERENCE.md` — replace Supabase client examples with fetch/API client examples
    - `docs/CACHE_MONITORING.md` — update `useSupabaseQuery` reference to `useQueryConfig`
    - `docs/analysis/ADMINISTRATOR_OPERATIONS_GUIDE.md` — update Supabase Dashboard reference
    - `docs/APPLICATION_WIZARD_ENHANCEMENTS.md` — update "Cloud Sync" section
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [x] 10. Final checkpoint — Full verification
  - Run `bun run build` to confirm clean build
  - Run `bun run test` to confirm all tests pass
  - Grep entire codebase for active `supabase` code references (excluding comments, docs marked historical, node_modules, .kiro)
  - Grep `.env*` files for `SUPABASE_` variable assignments
  - Verify `wrangler` not in `package.json`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Dead code deletion (Task 1) is the safest starting point — no behavior changes
- Module migration (Task 2) changes behavior but preserves public interfaces
- Documentation (Task 9) is lowest risk and can be done in parallel
