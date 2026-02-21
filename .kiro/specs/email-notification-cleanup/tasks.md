# Implementation Plan: Email Notification Cleanup

## Overview

Implement a reliable email delivery pipeline using Resend, replace the unused ping endpoint with a dedicated email endpoint, clean up legacy directories, and organize root-level file clutter. All code is TypeScript, targeting Bun runtime and Vercel serverless functions.

## Tasks

- [x] 1. Create email template module
  - [x] 1.1 Create `lib/emailTemplates.ts` with `renderEmailTemplate` function
    - Define `EmailTemplateData` interface
    - Implement shared layout wrapper with MIHAS branding header and footer
    - Implement templates: `welcome`, `application-submitted`, `status-change`, `payment-verified`, `interview-scheduled`, `generic`
    - Unknown template names fall back to `generic`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [ ]* 1.2 Write property test for email template rendering
    - **Property 9: Template rendering produces branded HTML**
    - **Validates: Requirements 4.1, 4.3, 4.4**
  - [ ]* 1.3 Write unit tests for each named template
    - Verify each template produces expected content with sample data
    - Test unknown template fallback to generic
    - _Requirements: 4.2, 4.4_

- [x] 2. Extend notification policy module
  - [x] 2.1 Update `lib/notificationPolicy.ts` with email type mapping
    - Add `EmailMapping` interface and `EMAIL_TYPE_MAP` constant
    - Map notification types to template names and preference keys
    - Export `getEmailMapping` helper function
    - _Requirements: 3.6, 6.3_
  - [ ]* 2.2 Write property test for preference enforcement logic
    - **Property 8: Preference enforcement with mandatory bypass**
    - **Validates: Requirements 3.6, 6.3**

- [x] 3. Create email endpoint (replace ping)
  - [x] 3.1 Create `api-src/email.ts` with query parameter routing
    - Implement handler with `send`, `process-queue`, `retry-failed`, `queue-status` actions
    - Add Arcjet protection via `withArcjetProtection`
    - Add auth middleware (`getAuthUser`) for all actions
    - Add admin role check for `process-queue` and `retry-failed`
    - _Requirements: 2.1, 2.3, 2.4, 2.5_
  - [x] 3.2 Implement `send` action in email endpoint
    - Validate recipient, subject, body fields
    - Optionally render HTML via `renderEmailTemplate` if `template_name` provided
    - Insert row into `email_queue` with status `pending`
    - _Requirements: 2.2_
  - [x] 3.3 Implement `process-queue` action in email endpoint
    - Select up to 10 pending emails ordered by priority ASC, created_at ASC
    - Send each via Resend API (`fetch` to `https://api.resend.com/emails`)
    - On success: update status to `sent`, set `sent_at`
    - On failure: increment `retry_count`, record `error_message`; set `failed` if `retry_count >= max_retries`
    - _Requirements: 1.2, 1.3, 1.4_
  - [x] 3.4 Implement `retry-failed` action in email endpoint
    - Update all `failed` emails to `pending` with `retry_count = 0`, clear `error_message`
    - _Requirements: 1.5, 6.2_
  - [x] 3.5 Implement `queue-status` action in email endpoint
    - Return `SELECT status, COUNT(*) FROM email_queue GROUP BY status`
    - _Requirements: 1.6, 6.1_
  - [ ]* 3.6 Write property test for retry behavior
    - **Property 4: Retry behavior on send failure**
    - **Validates: Requirements 1.3, 1.4**
  - [ ]* 3.7 Write unit tests for email endpoint actions
    - Test each action with valid inputs and expected outputs
    - Test RBAC: unauthenticated → 401, student calling process-queue → 403
    - Test empty queue processing returns success with 0 processed
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 1.2, 1.5, 1.6_

- [x] 4. Checkpoint - Verify email endpoint and templates
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Modify notifications endpoint for email queuing
  - [x] 5.1 Update `create` action in `api-src/notifications.ts` to queue emails
    - After inserting in-app notification, look up user email from `profiles`
    - Check notification preferences using `getEmailMapping` and `getCanonicalPreferences`
    - Skip email queuing if user opted out (non-mandatory) or no email on profile
    - Insert into `email_queue` with template name and data from the notification type
    - _Requirements: 1.1, 3.1, 3.2, 3.3, 3.4, 3.5, 5.2_
  - [x] 5.2 Update `send` action in `api-src/notifications.ts` to use queue instead of inline Resend
    - Remove direct `fetch` to Resend API from `handleSend`
    - Replace with `email_queue` INSERT (same pattern as create action)
    - Remove `buildNotificationEmailHtml` function (replaced by `lib/emailTemplates.ts`)
    - For mandatory types, always queue regardless of preferences
    - _Requirements: 5.3, 6.3_
  - [ ]* 5.3 Write property test for notification-to-email queuing
    - **Property 1: Notification create queues email for eligible types**
    - **Validates: Requirements 1.1, 3.3, 5.2**
  - [ ]* 5.4 Write unit tests for modified notification actions
    - Test create action with email-eligible type → email_queue row exists
    - Test create action with opted-out user → no email_queue row
    - Test send action no longer calls Resend directly
    - Test mandatory type bypasses preferences
    - _Requirements: 1.1, 3.6, 5.2, 6.3_

- [x] 6. Delete ping endpoint and bundle email endpoint
  - [x] 6.1 Delete `api-src/ping.ts` and `api/ping.js`
    - _Requirements: 2.6_
  - [x] 6.2 Run `bun run scripts/bundle-api.mjs` to generate `api/email.js`
    - Verify 12 function count is maintained (ping removed, email added)
    - _Requirements: 2.6_

- [x] 7. Checkpoint - Verify full email pipeline
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Remove legacy directories
  - [x] 8.1 Delete `infra/` directory entirely
    - Remove `infra/main.tf`, `infra/outputs.tf`, `infra/variables.tf`, `infra/cdn/` and all contents
    - _Requirements: 7.1_
  - [x] 8.2 Delete `supabase/` directory entirely
    - Remove `supabase/functions/send-email/`, `supabase/migrations/` (24 files), `supabase/scripts/`
    - _Requirements: 7.2_
  - [x] 8.3 Verify no remaining source files reference deleted paths
    - Grep for `infra/` and `supabase/` imports in `src/`, `api-src/`, `lib/`
    - Remove or update any stale references found
    - _Requirements: 7.3_

- [x] 9. Clean root directory
  - [x] 9.1 Move root-level `.md` documentation files to `docs/` subdirectories
    - Move deployment docs to `docs/deployment/`: `DEPLOYMENT_CHECKLIST.md`, `DEPLOYMENT_CHECKLIST_REALTIME_FIX.md`, `DEPLOYMENT_INSTRUCTIONS.md`
    - Move performance/optimization reports to `docs/reports/`: `DEEP_OPTIMIZATION_COMPLETE.md`, `FINAL_PERFORMANCE_STATUS.md`, `INSTANT_LOAD_COMPLETE.md`, `INSTANT_LOAD_STRATEGY.md`, `PATH_TO_100_ANALYSIS.md`, `PERFORMANCE_CRITICAL_FIXES.md`, `PERFORMANCE_FIX_FINAL.md`, `PERFORMANCE_OPTIMIZATION_COMPLETE.md`, `PERFORMANCE_QUICK_WINS.md`
    - Move migration/audit docs to `docs/migration/`: `HARDENING_COMPLETE.md`, `IMPLEMENTATION_STATUS_REPORT.md`, `SUPABASE.md`, `codex.md`, `codexaudit.md`, `kimiforensics.md`, `mobile-responsiveness-audit-report.md`, `task9-final-validation-report.md`
    - _Requirements: 8.1_
  - [x] 9.2 Move root-level `.txt` files to `docs/`
    - Move `codex.txt`, `correctenvs.txt` to `docs/migration/`
    - Move `file_tree.txt` to `docs/`
    - _Requirements: 8.2_
  - [x] 9.3 Delete stale artifacts and one-off scripts from root
    - Delete scripts: `DEPLOY_REALTIME_FIX.bat`, `cleanup-root.js`, `yarn.cmd`
    - Delete installers: `node-installer.msi`
    - Delete stale configs: `r2.env`, `.token`, `package.json.patch`, `package-lock.json`, `tailwind.config.optimized.js`, `vite.config.production.optimized.ts`, `vite.config.production.ts`, `vite.config.local.ts`
    - Delete test artifacts: `performance-audit-report.json`, `task9-structure-validation.json`, `task9-validation-report.json`, `vitest-results.json`, `full-flow-test.mjs`, `test-api.mjs`, `test-login-admin.json`, `test-login-student.json`
    - Delete database file: `database.db`
    - _Requirements: 8.3_
  - [x] 9.4 Delete or move test output and log files from root
    - Delete: `test_output.txt`, `test-output.txt`, `dev.log`, `vitest-stderr.log`
    - _Requirements: 8.4_

- [x] 10. Final checkpoint - Full verification
  - Ensure all tests pass, ask the user if questions arise.
  - Verify `api/` directory has exactly 12 bundled files
  - Verify `infra/` and `supabase/` directories no longer exist
  - Verify root directory is clean of moved/deleted files

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties using fast-check
- Unit tests validate specific examples and edge cases using Vitest
- All API source edits are in `api-src/` — run bundle script before deploying
- The `email_queue` table already exists; no migration needed
