# Implementation Plan: Audit Issue Remediation

## Overview

Phased remediation of 7 priority areas from the forensic audit. Each phase builds on the previous: performance first (biggest user impact on 3G), then dead code, contract fixes, page quality, auth unification, notification idempotency, and SSE wiring. All changes must be production-safe — students may have in-progress applications.

## Tasks

- [x] 1. Performance: Animation system replacement and bundle reduction
  - [x] 1.1 Create shared CSS animation utilities in `src/lib/animations.ts`
    - Define reusable CSS class constants: `fadeIn`, `slideUp`, `scaleIn`, `staggerChild`
    - Add `@keyframes` definitions to `src/index.css` for `fadeIn`, `slideUp`, `scaleIn`
    - _Requirements: 1.2, 1.5_

  - [x] 1.2 Add custom animation tokens to `tailwind.config.js`
    - Add `animate-fade-in`, `animate-slide-up`, `animate-scale-in` to the `animation` key
    - Add corresponding `keyframes` entries
    - _Requirements: 1.2, 1.5_

  - [x] 1.3 Replace framer-motion in auth pages (`src/pages/auth/`)
    - Convert `SignInPage.tsx`, `SignUpPage.tsx`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`
    - Replace `motion.div` with `div` + Tailwind transition classes
    - Replace `AnimatePresence` with conditional rendering + CSS transitions
    - Replace `useReducedMotion` with CSS `@media (prefers-reduced-motion: reduce)`
    - _Requirements: 1.2, 1.5_

  - [x] 1.4 Replace framer-motion in student pages (`src/pages/student/`)
    - Convert `Dashboard.tsx`, `Settings.tsx`, `NotificationSettings.tsx`, `ApplicationStatus.tsx`, `ApplicationDetail.tsx`
    - Use shared animation utilities from `src/lib/animations.ts`
    - _Requirements: 1.2, 1.5_

  - [x] 1.5 Replace framer-motion in application wizard (`src/pages/student/applicationWizard/`)
    - Convert `index.tsx`, `StepTransition.tsx`, `EnhancedProgressIndicator.tsx`, `DraftManager.tsx`, `KeyboardShortcutsHelp.tsx`, `ApplicationPreview.tsx`, `AnalyticsDashboard.tsx`, `SubmissionSuccess.tsx`, `ReminderSettings.tsx`, `StepChecklist.tsx`
    - Convert step files: `BasicKycStep.tsx`, `EducationStep.tsx`, `PaymentStep.tsx`, `SubmitStep.tsx`
    - Preserve visual transition behavior using CSS equivalents
    - _Requirements: 1.2, 1.5_

  - [x] 1.6 Replace framer-motion in admin pages (`src/pages/admin/`)
    - Convert `Dashboard.tsx`, `EnhancedDashboard.tsx`, `Applications.tsx`, `WorkflowAutomation.tsx`
    - _Requirements: 1.2, 1.5_

  - [x] 1.7 Replace framer-motion in public tracker pages (`src/pages/public/tracker/`)
    - Convert `index.tsx`, `ApplicationStatusDetails.tsx`, `ApplicationStatusHeader.tsx`, `ApplicationInfoGrid.tsx`, `HelpSection.tsx`, `TrackerSearchSection.tsx`, `NoResultsView.tsx`
    - _Requirements: 1.2, 1.5_

  - [x] 1.8 Replace framer-motion in remaining UI components
    - Scan `src/components/` for any remaining framer-motion imports and convert them
    - _Requirements: 1.2, 1.5_

  - [x] 1.9 Remove framer-motion from dependencies
    - Run `bun remove framer-motion`
    - Verify `bun run build` succeeds with zero framer-motion references
    - Verify no chunk exceeds 150 KB
    - _Requirements: 1.1, 1.3, 1.4_

  - [x] 1.10 Write property test: CSS animation equivalence


    - **Property 1: Animation class completeness**
    - *For any* component that previously used framer-motion, the replacement CSS classes should include equivalent transition properties (duration, easing, transform)
    - **Validates: Requirements 1.5**

- [ ] 2. Dead code removal
  - [-] 2.1 Delete unused service files
    - Delete: `src/services/backupRecovery.ts`, `src/services/databaseOptimization.ts`, `src/services/systemMonitoring.ts`, `src/services/performanceAlerting.ts`, `src/services/consents.ts`, `src/services/pushSubscriptions.ts`, `src/services/communicationService.ts`
    - Verify no live imports reference these files before deletion
    - _Requirements: 2.3, 2.5_

  - [ ] 2.2 Delete unused lib files and legacy references
    - Delete: `src/lib/workflowAutomation.ts`, `src/lib/supabase.ts`, `src/lib/regulatoryComplianceChecker.ts`, `src/lib/databaseOptimization.ts`
    - Delete `supabase/` directory if it still exists
    - Remove any remaining Supabase/Cloudflare import references across the codebase
    - _Requirements: 2.1, 2.2, 2.5_

  - [ ] 2.3 Remove commented-out code blocks exceeding 5 lines
    - Scan all `.ts` and `.tsx` files for commented-out code blocks longer than 5 lines
    - Remove them while preserving legitimate documentation comments
    - _Requirements: 2.4_

  - [ ] 2.4 Remove unused exports
    - Identify exported symbols not imported by any other module
    - Remove or unexport dead symbols
    - Run `bun run build` to verify nothing breaks
    - _Requirements: 2.3_


  - [ ] 2.5 Write property test: zero legacy references
    - **Property 2: No legacy imports**
    - *For any* source file in `src/`, scanning its import statements should yield zero matches for `supabase`, `cloudflare`, `wrangler`, or `@cloudflare/`
    - **Validates: Requirements 2.1, 2.2**

- [ ] 3. Checkpoint — Performance and dead code
  - Ensure `bun run build` succeeds
  - Verify bundle size is under 500 KB total and no chunk exceeds 150 KB
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. API contract alignment
  - [ ] 4.1 Rewrite frontend service URLs to query-parameter routing
    - Fix `src/services/catalog.ts`: `/catalog/programs` → `/catalog?type=programs`, etc.
    - Fix `src/services/admin/dashboard.ts`: `/admin/dashboard` → `/admin?action=dashboard`
    - Fix `src/services/admin/users.ts`: `/admin/users` → `/admin?action=users`
    - Fix `src/services/applications.ts`: path-based → `?action=xxx&id=DYNAMIC`
    - Fix `src/services/auth.ts`: `/auth/register` → `/auth?action=register`, etc.
    - Fix `src/services/documents.ts`: `/documents/upload` → `/documents?action=upload`
    - Fix `src/services/notifications.ts`: `/notifications/send` → `/notifications?action=send`
    - _Requirements: 3.1, 3.2_

  - [ ] 4.2 Delete dead frontend services with no valid backend endpoint
    - Delete services already removed in task 2.1 if not yet deleted
    - Evaluate `src/services/interviews.ts` — wire to a backend endpoint or remove
    - _Requirements: 3.3_

  - [ ] 4.3 Fix auth credential mismatches
    - Add `credentials: 'include'` to `src/services/pushNotificationManager.ts` fetch calls
    - Audit all service files for missing `credentials: 'include'` on authenticated endpoints
    - _Requirements: 3.4_

  - [ ] 4.4 Write property test: URL pattern compliance
    - **Property 3: Query-parameter routing format**
    - *For any* API call string in the frontend service layer, the URL should match the pattern `/endpoint?param=value` and never use nested path segments like `/endpoint/sub/path`
    - **Validates: Requirements 3.1, 3.5**

- [ ] 5. Page quality remediation
  - [ ] 5.1 Add auth guards to admin pages
    - Add authentication + role check (`admin` or `super_admin`) to all pages in `src/pages/admin/`
    - Use pattern: check `loading` → check `user` → check `isAdmin` → render or redirect
    - Pages: `Dashboard.tsx`, `EnhancedDashboard.tsx`, `Applications.tsx`, `ApplicationsAdmin.tsx`, `Users.tsx`, `Settings.tsx`, `Programs.tsx`, `Intakes.tsx`, `AuditTrail.tsx`, `Analytics.tsx`, `BatchOperations.tsx`, `CacheMonitor.tsx`, `ComplianceAnalytics.tsx`, `EligibilityManagement.tsx`, `Monitoring.tsx`, `RealtimeMetrics.tsx`, `RoleManagement.tsx`, `SystemHealthDashboard.tsx`, `WorkflowAutomation.tsx`, `ApplicationFlowAnalysis.tsx`
    - _Requirements: 4.1_

  - [ ] 5.2 Add auth guards to student pages
    - Add authentication check to all pages in `src/pages/student/`
    - Pages: `Dashboard.tsx`, `ApplicationWizard.tsx`, `ApplicationStatus.tsx`, `ApplicationDetail.tsx`, `Payment.tsx`, `Interview.tsx`, `Settings.tsx`, `NotificationSettings.tsx`
    - _Requirements: 4.2_

  - [ ] 5.3 Add error handling and loading states to pages with async data fetching
    - Add try/catch with user-friendly error messages to pages that fetch data
    - Add loading indicators (spinner or skeleton) while data loads
    - Apply to admin and student pages that call service layer functions
    - _Requirements: 4.3, 4.4_

  - [ ] 5.4 Fix useEffect race conditions with cleanup flags
    - Add `let cancelled = false` pattern to all `useEffect` hooks with async state updates
    - Return cleanup function `() => { cancelled = true }` to prevent updates on unmounted components
    - Apply across all pages in `src/pages/admin/` and `src/pages/student/`
    - _Requirements: 4.5_

  - [ ] 5.5 Add mobile responsive breakpoints to pages missing them
    - Add Tailwind responsive classes (`sm:`, `md:`, `lg:`) to layout containers
    - Focus on admin pages that were designed desktop-first
    - _Requirements: 4.6_

  - [ ] 5.6 Write property test: auth guard presence
    - **Property 4: Admin pages require auth guards**
    - *For any* page component file in `src/pages/admin/`, the file content should contain an authentication check (import of `useAuth` and a redirect for unauthenticated users)
    - **Validates: Requirements 4.1, 4.2**

- [ ] 6. Checkpoint — Contracts and page quality
  - Ensure `bun run build` succeeds
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Auth state unification
  - [ ] 7.1 Refactor `useAuthStore` (Zustand) as the single source of truth
    - Update `src/stores/authStore.ts` to hold user profile, role, session data, loading state
    - Add token refresh logic as Zustand middleware or action
    - Add `login`, `logout`, `refreshToken` actions to the store
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ] 7.2 Refactor `AuthContext` to read from `useAuthStore`
    - Modify `src/contexts/AuthContext.tsx` to be a thin wrapper over `useAuthStore`
    - Remove duplicate state — `AuthContext` should not hold its own user/session state
    - Preserve the `useAuth()` hook interface for backward compatibility
    - _Requirements: 5.1_

  - [ ] 7.3 Implement automatic token refresh and failure handling
    - On 401 response, attempt refresh via `/api/auth?action=refresh`
    - On refresh failure, clear auth store and redirect to `/auth/signin`
    - _Requirements: 5.4, 5.5_

  - [ ] 7.4 Write property test: auth state consistency
    - **Property 5: Login populates, logout clears**
    - *For any* valid user profile and role, calling `login` on the auth store should result in the store containing that profile and role, and calling `logout` should result in the store being empty
    - **Validates: Requirements 5.2, 5.3**

- [ ] 8. Notification idempotency
  - [ ] 8.1 Create the `notification_idempotency_keys` database table
    - Write migration in `migrations/` with the schema from the design document
    - Columns: `key TEXT PRIMARY KEY`, `created_at TIMESTAMPTZ`, `expires_at TIMESTAMPTZ`
    - Add index on `expires_at` for cleanup queries
    - _Requirements: 6.1, 6.2_

  - [ ] 8.2 Implement `lib/idempotency.ts`
    - Implement `generateKey(userId, eventType, contentHash)` using a deterministic hash
    - Implement `isDuplicate(key)` checking the Neon table
    - Implement `record(key)` using `INSERT ... ON CONFLICT DO NOTHING`
    - Implement `executeWithRetry(key, fn, config)` with exponential backoff (max 3 attempts)
    - Log failures without PII on final retry exhaustion
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ] 8.3 Integrate idempotency into email dispatch in `api-src/notifications.ts`
    - Wrap the `send` action with `executeWithRetry` using generated idempotency keys
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ] 8.4 Add client-side SSE deduplication in `src/lib/sseClient.ts`
    - Track received event IDs in a `Set` (capped at 1000 entries, evict oldest)
    - Skip processing for duplicate event IDs
    - _Requirements: 6.5_

  - [ ] 8.5 Write property test: idempotency key determinism
    - **Property 6: Same inputs produce same key**
    - *For any* userId, eventType, and contentHash, calling `generateKey` twice with the same inputs should produce the same key
    - **Validates: Requirements 6.1**

  - [ ] 8.6 Write property test: duplicate detection
    - **Property 7: Recorded keys are detected as duplicates**
    - *For any* idempotency key, after calling `record(key)`, calling `isDuplicate(key)` should return true
    - **Validates: Requirements 6.2**

  - [ ] 8.7 Write property test: retry with exponential backoff
    - **Property 8: Retry delays increase exponentially**
    - *For any* sequence of retry attempts (1 to maxRetries), the delay between attempt N and attempt N+1 should be greater than or equal to `initialRetryDelay * 2^(N-1)`
    - **Validates: Requirements 6.3**

- [ ] 9. Checkpoint — Auth and idempotency
  - Ensure `bun run build` succeeds
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. SSE feature wiring
  - [ ] 10.1 Wire `application_update` events to student pages
    - Add `useRealtimeEvent('application_update', ...)` to `src/pages/student/ApplicationStatus.tsx` and `src/pages/student/Dashboard.tsx`
    - Invalidate relevant React Query caches on event receipt
    - _Requirements: 7.1_

  - [ ] 10.2 Wire `payment_update` events to payment page
    - Add `useRealtimeEvent('payment_update', ...)` to `src/pages/student/Payment.tsx`
    - Invalidate payment-related React Query caches
    - _Requirements: 7.2_

  - [ ] 10.3 Wire `document_processed` events to submit step
    - Add `useRealtimeEvent('document_processed', ...)` to `src/pages/student/applicationWizard/steps/SubmitStep.tsx`
    - Update document processing status in the UI
    - _Requirements: 7.3_

  - [ ] 10.4 Wire `interview_scheduled` events to interview page
    - Add `useRealtimeEvent('interview_scheduled', ...)` to `src/pages/student/Interview.tsx`
    - Invalidate interview-related React Query caches
    - _Requirements: 7.4_

  - [ ] 10.5 Wire `notification` events to notification bell
    - Add `useRealtimeEvent('notification', ...)` to `src/components/student/NotificationBell.tsx`
    - Display incoming notifications in real time
    - _Requirements: 7.5_

  - [ ] 10.6 Verify SSE reconnection and polling fallback in `src/lib/sseClient.ts`
    - Confirm exponential backoff reconnection logic exists and works
    - Confirm polling fallback activates when SSE is unavailable
    - Add or fix if missing
    - _Requirements: 7.6, 7.7_

  - [ ] 10.7 Write property test: SSE client deduplication
    - **Property 9: Duplicate events are skipped**
    - *For any* event ID, if the SSE client receives the same event ID twice, the handler should only be invoked once
    - **Validates: Requirements 6.5, 7.5**

- [ ] 11. Final checkpoint
  - Run `bun run build` and verify bundle < 500 KB, zero chunks > 150 KB
  - Run `bun run test` and verify all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation between phases
- Property tests use fast-check (already configured in `tests/property/`)
- API source files are in `api-src/` — never edit `api/` directly
- Shared backend utilities are at project root `lib/`, not `api/lib/`
