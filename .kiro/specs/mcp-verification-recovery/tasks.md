# Implementation Plan: MCP Verification & Recovery

## Overview

This plan implements a verification-first approach to validating and hardening the MIHAS Application System. Tasks are ordered to: (1) verify and fix the database layer, (2) fix critical user-facing flows, (3) complete R2 document migration, (4) close loopholes, and (5) add automated verification tests. Each task builds on the previous, with checkpoints to validate progress.

## Tasks

- [x] 1. Database migration discovery and application
  - [x] 1.1 Create migration state discovery script
    - Create `scripts/verify-migrations.ts` that queries Neon for applied migrations, lists local `migrations/*.sql` files, and computes the pending set
    - Output: list of applied, local, and pending migrations
    - _Requirements: 1.1, 1.2, 1.3_
  - [ ]* 1.2 Write property test for pending migration set computation
    - **Property 1: Pending migration set computation and ordering**
    - **Validates: Requirements 1.3, 1.4**
  - [x] 1.3 Apply pending migrations to Neon via MCP
    - Use Neon MCP to apply each pending migration in numerical order
    - Abort on first failure, capture SQL error details
    - Log success summary with count of migrations applied
    - _Requirements: 1.4, 1.5, 1.6_

- [x] 2. Schema and data integrity verification
  - [x] 2.1 Create schema verification test
    - Create `tests/integration/schemaVerification.test.ts` that validates all 9 Core_Entity tables exist with required columns, data types, and foreign key constraints
    - Use Neon MCP `information_schema` queries
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x] 2.2 Create data integrity check script
    - Create `scripts/data-integrity-check.ts` that detects FK violations, null/invalid status values, orphaned documents, and missing emails
    - Output: structured report of all violations
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [x] 2.3 Create index verification and creation script
    - Create `scripts/verify-indexes.ts` that checks for required indexes on hot paths and generates `CREATE INDEX IF NOT EXISTS` statements for missing ones
    - Apply missing indexes via Neon MCP
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [ ]* 2.4 Write property test for index SQL generation
    - **Property 5: Index creation SQL generation**
    - **Validates: Requirements 4.4**
  - [ ]* 2.5 Write property test for valid application status values
    - **Property 4: Application status values are valid**
    - **Validates: Requirements 3.2**

- [x] 3. Checkpoint - Database layer verified
  - Ensure all migrations applied, schema verified, data integrity checked, indexes confirmed. Ask the user if questions arise.

- [x] 4. Password reset flow implementation
  - [x] 4.1 Add reset token columns to profiles table
    - Create migration adding `reset_token_hash TEXT`, `reset_token_expires TIMESTAMPTZ`, `reset_token_used BOOLEAN DEFAULT false` to `profiles`
    - Apply via Neon MCP
    - _Requirements: 6.1_
  - [x] 4.2 Implement forgot-password and reset-password actions in auth endpoint
    - Add `case 'forgot-password'` and `case 'reset-password'` to `api-src/auth.ts`
    - Forgot-password: generate random 32-byte token, store SHA-256 hash, set 1-hour expiry, send email via Resend
    - Reset-password: verify token hash, check expiry and one-time-use, update password_hash, clear token
    - Never reveal whether email exists in the system
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
  - [ ]* 4.3 Write property test for reset token lifecycle
    - **Property 7: Reset token lifecycle (one-time use and expiry)**
    - **Validates: Requirements 6.4, 6.5**

- [x] 5. Display name normalization and session consistency
  - [x] 5.1 Verify and fix deriveFullName usage across all session/profile payloads
    - Ensure `deriveFullName` is called on login, token refresh, and session fetch in `api-src/auth.ts`
    - Ensure session payload includes `full_name` field
    - Verify consistent user object shape: `id`, `email`, `role`, `firstName`, `lastName`, `full_name`
    - _Requirements: 7.1, 7.2, 7.3, 20.1, 20.2_
  - [ ]* 5.2 Write property test for display name precedence
    - **Property 8: Display name precedence**
    - **Validates: Requirements 7.1**
  - [ ]* 5.3 Write property test for auth object shape consistency
    - **Property 21: Auth object shape consistency**
    - **Validates: Requirements 20.1, 20.2**

- [x] 6. Application tracking endpoint verification
  - [x] 6.1 Verify public tracking endpoint in api-src/applications.ts
    - Confirm `action=track` is unauthenticated and returns only public-safe fields (application_number, status, program_name, submission_date)
    - Confirm rate limiting is applied via Arcjet
    - Verify frontend tracker component calls correct endpoint
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [ ]* 6.2 Write property test for tracker safe fields
    - **Property 6: Public tracker returns only safe fields**
    - **Validates: Requirements 5.2, 5.3**

- [x] 7. Application wizard text integrity
  - [x] 7.1 Scan and fix mojibake in wizard source files
    - Scan all files in `src/pages/student/applicationWizard/` for corrupted UTF-8 patterns
    - Replace any mojibake with clean English text
    - _Requirements: 8.1, 8.2, 8.3_
  - [ ]* 7.2 Write unit test for wizard text integrity
    - **Property 9: Source file UTF-8 validity**
    - **Validates: Requirements 8.1, 8.2**

- [x] 8. Checkpoint - Critical user flows verified
  - Ensure password reset, display name, tracking, and wizard text are all working. Ask the user if questions arise.

- [x] 9. Notification deduplication and policy enforcement
  - [x] 9.1 Add idempotency_key column to notifications table
    - Create migration adding `idempotency_key TEXT` column and index to `notifications`
    - Apply via Neon MCP
    - _Requirements: 13.1_
  - [x] 9.2 Implement notification deduplication in api-src/notifications.ts
    - Before creating a notification, compute idempotency key from `event_type:entity_type:entity_id`
    - Check for existing notification with same key within 1-hour window
    - Skip creation if duplicate found, log deduplication
    - _Requirements: 13.1, 13.2_
  - [x] 9.3 Implement notification policy enforcement
    - Define mandatory notification types (application_status_change, payment_verified, interview_scheduled)
    - Ensure email is always sent for mandatory types regardless of user preferences
    - Ensure opt-out is respected only for non-mandatory channels
    - _Requirements: 13.3, 13.4, 13.5_
  - [ ]* 9.4 Write property test for notification deduplication
    - **Property 13: Notification deduplication via idempotency key**
    - **Validates: Requirements 13.1, 13.2**
  - [ ]* 9.5 Write property test for notification policy enforcement
    - **Property 14: Notification policy enforcement**
    - **Validates: Requirements 13.3, 13.4**

- [x] 10. Admin users page and role management fixes
  - [x] 10.1 Fix admin users endpoint and frontend contract alignment
    - Verify `/admin?action=users` returns paginated user list
    - Verify frontend user service uses correct request contract
    - Fix empty state display when no users returned
    - _Requirements: 14.1, 14.2, 14.5_
  - [x] 10.2 Implement role promotion restriction
    - Ensure only `super_admin` can set roles to `admin` or `super_admin`
    - Return 403 for unauthorized role promotions
    - _Requirements: 14.3, 14.4_
  - [ ]* 10.3 Write property test for role promotion restriction
    - **Property 15: Role promotion restriction**
    - **Validates: Requirements 14.4**

- [x] 11. Programs and intakes data integrity fixes
  - [x] 11.1 Fix catalog endpoint to join institution names with programs
    - Modify `api-src/catalog.ts` to JOIN `institutions` table when returning programs
    - Ensure no program shows "institution unknown" when institution exists
    - Verify intakes return valid `application_deadline` dates
    - _Requirements: 15.1, 15.2, 15.3, 15.4_
  - [ ]* 11.2 Write contract test for catalog responses
    - **Property 16: Programs include institution name in response**
    - **Property 17: Intake deadline validity**
    - **Validates: Requirements 15.1, 15.2**

- [x] 12. Admin applications pagination fix
  - [x] 12.1 Fix backend pagination to use COUNT(*) for totalCount
    - Ensure `api-src/applications.ts` returns accurate `totalCount` from a separate COUNT query
    - Ensure page/pageSize are correctly applied
    - _Requirements: 16.1, 16.3_
  - [x] 12.2 Fix frontend "load more" logic to prevent duplicates
    - Ensure frontend appends new results by checking `application.id` for duplicates
    - Ensure `hasMore` is computed as `loadedCount < totalCount`
    - _Requirements: 16.2, 16.4_
  - [ ]* 12.3 Write property test for pagination correctness
    - **Property 18: Pagination correctness**
    - **Validates: Requirements 16.1, 16.2, 16.3, 16.4**

- [x] 13. Checkpoint - Admin and notification flows verified
  - Ensure admin users, programs, intakes, applications pagination, and notifications all work. Ask the user if questions arise.

- [x] 14. Document download and R2 migration
  - [x] 14.1 Verify document download endpoint uses R2 exclusively
    - Audit `api-src/documents.ts` to confirm no Supabase storage references in active code paths
    - Verify signed URL generation works for R2 paths
    - _Requirements: 9.1, 9.2_
  - [x] 14.2 Create legacy URL inventory query
    - Query `application_documents` for rows with legacy Supabase URLs or non-R2 paths
    - Output: list of document_id, old_url pairs needing migration
    - _Requirements: 9.3_
  - [x] 14.3 Create document_migration_log table
    - Create migration for `document_migration_log` table with columns: id, document_id, old_url, new_r2_path, new_r2_url, checksum, status, error, migrated_at
    - Apply via Neon MCP
    - _Requirements: 9.6_
  - [x] 14.4 Implement idempotent R2 migration script
    - Create `scripts/migrate-legacy-documents-to-r2.ts`
    - For each legacy document: fetch original, upload to R2, verify checksum, update DB in transaction, log to migration_log
    - Skip already-migrated documents (idempotent)
    - Verify random sample of migrated documents after completion
    - _Requirements: 9.3, 9.4, 9.5, 9.6_
  - [ ]* 14.5 Write property test for R2 migration correctness
    - **Property 10: R2 migration correctness with rollback metadata**
    - **Validates: Requirements 9.3, 9.6**
  - [ ]* 14.6 Write property test for R2 migration idempotence
    - **Property 11: R2 migration idempotence**
    - **Validates: Requirements 9.4**

- [x] 15. Draft management and payment flow verification
  - [x] 15.1 Verify draft reconciliation logic
    - Confirm auto-save at 8-second intervals persists to server via API
    - Confirm reconciliation picks the most recently updated draft
    - Confirm failed saves retain local draft and retry
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
  - [ ]* 15.2 Write property test for draft reconciliation
    - **Property 12: Draft reconciliation picks the most recent version**
    - **Validates: Requirements 10.2**
  - [x] 15.3 Verify payment page flow
    - Confirm payment page loads applications with payment statuses
    - Confirm payment proof upload stores via R2
    - Confirm admin payment verification updates status and notifies student
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [x] 16. Interview workflow and real-time updates verification
  - [x] 16.1 Verify interview scheduling and display
    - Confirm `/applications?action=schedule-interview` creates interview records
    - Confirm student view shows interview details
    - Confirm audit trail entry on status change
    - _Requirements: 12.1, 12.2, 12.3_
  - [x] 16.2 Verify SSE/polling hybrid real-time updates
    - Confirm SSE connection establishment and fallback to polling
    - Confirm no unnecessary re-renders on identical poll data
    - _Requirements: 17.1, 17.2, 17.3_
  - [ ]* 16.3 Write property test for polling stability
    - **Property 19: No re-render on identical poll data**
    - **Validates: Requirements 17.3**

- [x] 17. Checkpoint - Document migration and user flows verified
  - Ensure R2 migration complete, drafts working, payments working, interviews working, real-time updates working. Ask the user if questions arise.

- [x] 18. Endpoint and contract alignment audit
  - [x] 18.1 Create frontend-backend action alignment test
    - Create `tests/unit/contracts/actionAlignment.test.ts` that parses frontend service files for action parameters and verifies each has a matching case in the backend router
    - _Requirements: 18.1, 18.2, 18.3, 18.4_
  - [ ]* 18.2 Write property test for action parameter alignment
    - **Property 20: Frontend-backend action parameter alignment**
    - **Validates: Requirements 18.1**

- [x] 19. Production stub elimination
  - [x] 19.1 Audit and fix production stubs
    - Identify functions returning hardcoded/mock data in production-critical paths (analytics, workflow, dashboard preloader)
    - Either implement real functionality or remove behind feature flag
    - Verify dashboard preloader fetches real data from API
    - _Requirements: 19.1, 19.2, 19.3_

- [x] 20. Audit trail completeness and PII sanitization
  - [x] 20.1 Verify audit logging for all critical state changes
    - Confirm audit entries created for: application status changes, user CRUD, payment verification/rejection
    - Confirm audit log entries contain no PII
    - Confirm admin audit trail page displays paginated entries
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5_
  - [ ]* 20.2 Write property test for audit trail completeness
    - **Property 22: Audit trail completeness for state changes**
    - **Validates: Requirements 21.1, 21.2, 21.3**
  - [ ]* 20.3 Write property test for PII sanitization in audit logs
    - **Property 23: No PII in audit log entries**
    - **Validates: Requirements 21.4**

- [x] 21. Mobile responsiveness verification
  - [x] 21.1 Audit and fix mobile responsiveness issues
    - Check all student-facing pages at 375px viewport width
    - Check all admin-facing pages at 375px viewport width
    - Fix table overflow, tap target sizes, and layout issues
    - _Requirements: 22.1, 22.2, 22.3, 22.4_

- [x] 22. Scalability recommendations document
  - [x] 22.1 Create scalability recommendations
    - Document caching strategies for high-traffic endpoints
    - Document database indexing recommendations for scale
    - Document idempotency patterns for write operations
    - Document observability recommendations (logging, metrics, alerting)
    - Document Neon connection pooling configuration for high concurrency
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5_

- [x] 23. Final checkpoint - Full verification complete
  - Run full test suite with `bun run test`
  - Ensure all property tests pass (minimum 100 iterations each)
  - Ensure all contract tests pass
  - Verify all 24 business issues have been addressed
  - Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check
- Unit tests validate specific examples and edge cases
- Integration tests (schema/data integrity) require Neon MCP access
- All API source changes go in `api-src/` — run `bun run scripts/bundle-api.mjs` to bundle to `api/`
