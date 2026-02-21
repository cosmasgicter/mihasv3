# Requirements Document

## Introduction

The MIHAS Application System has undergone major migrations (Supabase → Neon Postgres, Cloudflare → Vercel, Supabase Auth → custom JWT). While the core migration is functionally complete, evidence-based analysis of the codebase reveals significant legacy remnants, dead code with active Supabase client calls, fragmented naming conventions, outdated environment files, and stale documentation. This spec addresses the complete elimination of all legacy artifacts and unification of fragmented systems to produce a clean, fully-migrated production codebase.

## Evidence Summary

The following issues were verified by direct code inspection:

1. **Active Supabase client calls**: `src/lib/offlineManager.ts`, `src/lib/notificationService.ts`, `src/lib/multiDeviceSession.ts`, and `src/lib/authSecurity.ts` still contain `await supabase.from(...)` calls against tables like `applications`, `device_sessions`, `in_app_notifications`, `profiles`, `user_roles`, and `auth_audit_log`.
2. **Legacy Supabase auth support**: `lib/auth/legacy.ts` provides full Supabase JWT verification and token migration — still active in the auth middleware chain.
3. **Legacy API file**: `api-src/_auth.ts.legacy` contains full Supabase Auth login/signup/audit code.
4. **Supabase-named files and directories**: `src/components/supabase-ui/` directory still exists. `src/hooks/queries/useSupabaseQuery.ts` is imported by 6+ files across the codebase.
5. **Environment files with Supabase keys**: `.env.local`, `.env.development`, `.env.vercel`, `.env.hardened`, and `.env.example` all contain active `SUPABASE_*` and `VITE_SUPABASE_*` variables with real credentials.
6. **Wrangler dependency**: `package.json` still lists `wrangler: "^4.43.0"` as a devDependency, pulling in `@cloudflare/workerd-*` platform binaries.
7. **Stale documentation**: 10+ docs files in `docs/` reference Supabase, Cloudflare, and Sentry as active systems (e.g., `LAUNCH_INSTRUCTIONS.md`, `API_REFERENCE.md`, `TROUBLESHOOTING.md`, `TECH_ALTERNATIVES.md`).
8. **Deprecated modules with @ts-nocheck**: `src/lib/offlineManager.ts`, `src/lib/multiDeviceSession.ts`, `src/lib/migration/MigrationTracker.ts` are marked `@deprecated` with `@ts-nocheck` but still exist in the codebase.
9. **SSE disabled by default**: `useRealtime` hook has `enabled: false` and `pollingEnabled: false` — the entire realtime system is built but not wired to any frontend component.
10. **Notification idempotency**: Backend `api-src/notifications.ts` has deduplication via `createNotificationWithDedup`, but the frontend `src/lib/notificationService.ts` still uses direct Supabase RPC calls (`supabase.rpc('generate_notification_dedup_hash')`).
11. **Auth layering**: Three auth layers exist (AuthContext, authStore, useAuth hooks) — they work together correctly but the `src/lib/sessionManager.ts` comment still says "let Supabase handle session management."
12. **Type naming**: `src/types/eligibility.ts` exports `SupabaseEligibilityAssessmentRow` interface.

## Glossary

- **Migration_System**: The set of code changes, file deletions, and configuration updates that eliminate legacy artifacts
- **Auth_System**: The custom JWT authentication system (jose + bcrypt + HTTP-only cookies) that replaced Supabase Auth
- **Realtime_System**: The SSE/polling implementation (lib/realtime.ts + src/hooks/useRealtime.ts + src/lib/sseClient.ts) that replaced Supabase Realtime
- **Notification_System**: The backend notification API (api-src/notifications.ts) and frontend notification services
- **Legacy_Module**: Any source file that contains active Supabase client calls, deprecated Supabase stubs, or Cloudflare-specific code
- **Environment_Config**: The set of `.env*` files that configure runtime variables for development and production

## Requirements

### Requirement 1: Remove Active Supabase Client Calls from Frontend Modules

**User Story:** As a developer, I want all frontend modules to use the API client instead of direct Supabase calls, so that the codebase has a single data access pattern.

#### Acceptance Criteria

1. WHEN the Migration_System processes `src/lib/offlineManager.ts`, THE Migration_System SHALL replace all `await supabase.from(...)` calls with equivalent API client calls using `src/services/client.ts`, or delete the module if offline sync is not actively used
2. WHEN the Migration_System processes `src/lib/multiDeviceSession.ts`, THE Migration_System SHALL replace all Supabase calls with API client calls to `/api/sessions`, or delete the module if it is deprecated and unused
3. WHEN the Migration_System processes `src/lib/notificationService.ts`, THE Migration_System SHALL replace the `supabase.rpc('generate_notification_dedup_hash')` and `supabase.from('in_app_notifications')` calls with API client calls to `/api/notifications`
4. WHEN the Migration_System processes `src/lib/authSecurity.ts`, THE Migration_System SHALL replace all `supabase.from('profiles')`, `supabase.from('user_roles')`, and `supabase.from('auth_audit_log')` calls with API client calls
5. WHEN the Migration_System processes `src/lib/applicationFlowAnalyzer.ts`, THE Migration_System SHALL update all hardcoded `supabase.*` location strings to reference `neon.*` or generic database references
6. WHEN the Migration_System processes `src/lib/sessionManager.ts`, THE Migration_System SHALL remove the "let Supabase handle session management" comment and update to reflect the custom JWT auth system

### Requirement 2: Remove Legacy Supabase Auth Support

**User Story:** As a developer, I want the legacy Supabase token verification path removed, so that the auth system has a single code path and no dependency on Supabase JWT secrets.

#### Acceptance Criteria

1. WHEN the Migration_System processes `lib/auth/legacy.ts`, THE Migration_System SHALL delete the file entirely since the migration period is complete
2. WHEN the Migration_System processes `lib/auth/middleware.ts`, THE Migration_System SHALL remove any code paths that call `verifyLegacySupabaseToken`, `isLegacySupabaseToken`, or `authenticateWithLegacyToken`
3. WHEN the Migration_System processes `api-src/auth.ts`, THE Migration_System SHALL remove any bootstrap or legacy migration code paths that reference Supabase token migration
4. WHEN the Migration_System processes `api-src/_auth.ts.legacy`, THE Migration_System SHALL delete the file entirely

### Requirement 3: Remove Legacy Files and Directories

**User Story:** As a developer, I want all legacy files, stubs, and directories removed, so that the codebase contains only active, maintained code.

#### Acceptance Criteria

1. WHEN the Migration_System processes `src/components/supabase-ui/`, THE Migration_System SHALL delete the entire directory
2. WHEN the Migration_System processes deprecated modules marked with `@ts-nocheck` and `@deprecated` that still contain Supabase calls, THE Migration_System SHALL delete each module if it has zero active importers, or migrate it if it has active importers
3. WHEN the Migration_System processes `src/lib/migration/MigrationTracker.ts`, THE Migration_System SHALL delete the file if it has zero active importers

### Requirement 4: Rename Supabase-Named Identifiers

**User Story:** As a developer, I want all Supabase-named files, exports, and types renamed to reflect the current architecture, so that the codebase does not mislead future developers.

#### Acceptance Criteria

1. WHEN the Migration_System processes `src/hooks/queries/useSupabaseQuery.ts`, THE Migration_System SHALL rename the file to `useQueryConfig.ts` and update all 6+ import sites across the codebase
2. WHEN the Migration_System processes `src/types/eligibility.ts`, THE Migration_System SHALL rename `SupabaseEligibilityAssessmentRow` to `EligibilityAssessmentRow` and update all references
3. WHEN the Migration_System processes `src/hooks/queries/index.ts`, THE Migration_System SHALL update the re-export from `./useSupabaseQuery` to the new filename

### Requirement 5: Clean Environment Configuration

**User Story:** As a developer, I want all legacy environment variables removed from configuration files, so that no Supabase credentials or deprecated service keys remain in the repository.

#### Acceptance Criteria

1. WHEN the Migration_System processes `.env.example`, THE Migration_System SHALL remove all `SUPABASE_*`, `VITE_SUPABASE_*`, and deprecated variable references, and update the header comment to reflect Neon Postgres
2. WHEN the Migration_System processes `.env.development`, THE Migration_System SHALL remove all Supabase variables and update to reference only Neon Postgres
3. WHEN the Migration_System processes `.env.vercel`, THE Migration_System SHALL remove all Supabase variables and update documentation comments
4. WHEN the Migration_System processes `.env.hardened`, THE Migration_System SHALL remove all Supabase variables and update the database section header
5. WHEN the Migration_System processes `.env.local`, THE Migration_System SHALL remove `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_SUPABASE_URL`
6. WHEN the Migration_System processes `.gitignore`, THE Migration_System SHALL remove the Cloudflare-specific entries (`.wrangler/`, `.mf/`)

### Requirement 6: Remove Wrangler and Cloudflare Dependencies

**User Story:** As a developer, I want the wrangler dependency and all Cloudflare build tooling removed, so that the project has no unused platform dependencies.

#### Acceptance Criteria

1. WHEN the Migration_System processes `package.json`, THE Migration_System SHALL remove `wrangler` from devDependencies
2. WHEN the Migration_System completes the dependency removal, THE Migration_System SHALL run `bun install` to regenerate `bun.lock` without Cloudflare packages

### Requirement 7: Update Stale Documentation

**User Story:** As a developer, I want all documentation to reflect the current Neon Postgres + Vercel + custom JWT architecture, so that docs do not reference removed services.

#### Acceptance Criteria

1. WHEN the Migration_System processes `docs/TROUBLESHOOTING.md`, THE Migration_System SHALL replace all Sentry and Supabase references with current monitoring and database guidance
2. WHEN the Migration_System processes `docs/guides/LAUNCH_INSTRUCTIONS.md`, THE Migration_System SHALL remove all Sentry setup steps and Cloudflare deployment references, replacing with Vercel deployment steps
3. WHEN the Migration_System processes `docs/guides/TECH_ALTERNATIVES.md`, THE Migration_System SHALL remove Sentry recommendations and update the technology comparison to reflect current stack
4. WHEN the Migration_System processes `docs/guides/TECH_STACK.md`, THE Migration_System SHALL remove "Ready for Sentry integration" and update to reflect current error handling approach
5. WHEN the Migration_System processes `docs/API_REFERENCE.md`, THE Migration_System SHALL replace Supabase client examples with API client examples using `fetch` with HTTP-only cookies
6. WHEN the Migration_System processes `docs/CACHE_MONITORING.md`, THE Migration_System SHALL update the reference from `useSupabaseQuery.ts` to the renamed file
7. WHEN the Migration_System processes any doc file in `docs/` that references Supabase as an active system, THE Migration_System SHALL update or remove the reference

### Requirement 8: Wire SSE Realtime to Frontend Components

**User Story:** As a developer, I want the SSE realtime system connected to frontend dashboard components, so that students and admins receive live updates without manual refresh.

#### Acceptance Criteria

1. WHEN a student views the dashboard, THE Realtime_System SHALL establish a polling connection to receive application status updates
2. WHEN an admin updates an application status, THE Realtime_System SHALL broadcast the update to the affected student's active connections
3. WHEN the Realtime_System cannot establish an SSE connection due to Vercel's 10-second function timeout, THE Realtime_System SHALL fall back to polling at a configurable interval
4. WHEN the browser tab becomes hidden, THE Realtime_System SHALL pause polling to conserve battery on mobile devices
5. WHEN the browser tab becomes visible again, THE Realtime_System SHALL resume polling and fetch any missed events

### Requirement 9: Unify Frontend Notification Service

**User Story:** As a developer, I want the frontend notification service to use the API client exclusively, so that notification creation and deduplication go through the backend API.

#### Acceptance Criteria

1. WHEN the Notification_System creates a notification from the frontend, THE Notification_System SHALL call `/api/notifications?action=send` with entity context for deduplication instead of using direct Supabase RPC calls
2. WHEN the Notification_System receives a duplicate notification response from the backend, THE Notification_System SHALL skip displaying the notification to the user
3. THE Notification_System SHALL remove all direct Supabase client usage from `src/lib/notificationService.ts`

### Requirement 10: Clean Up Test Infrastructure

**User Story:** As a developer, I want test files and test infrastructure updated to reflect the current architecture, so that tests validate the actual system.

#### Acceptance Criteria

1. WHEN the Migration_System processes test files in `tests/property/supabase-complete-removal/` and `tests/property/supabase-exit-migration/`, THE Migration_System SHALL verify these tests still pass or update them to reflect completed migration
2. WHEN the Migration_System processes `tests/property/supabase-auth-removal.property.test.ts`, THE Migration_System SHALL verify the test validates that no Supabase auth imports remain
3. WHEN the Migration_System processes `test_report.md`, `test_results.xml`, and `test_results_latest.xml`, THE Migration_System SHALL delete these stale test result files that reference "Direct Supabase" tests
