# Implementation Plan: Tech Debt Remediation

## Overview

Implements 30 audit items across 17 requirements, grouped into 6 implementation phases with checkpoints. Frontend changes use TypeScript (Vitest + fast-check), backend changes use Python (pytest + hypothesis). Each phase is self-contained and verifiable before moving to the next.

## Tasks

- [x] 1. Critical frontend fixes
  - [x] 1.1 Fix error boundary to use reportError() instead of fetch('/log-error')
    - In `apps/admissions/src/components/ui/EnhancedErrorHandling.tsx`, replace the `fetch('/log-error')` call in `componentDidCatch` with `reportError()` from `apps/admissions/src/lib/errorReporter.ts`
    - Import `reportError` at the top of the file
    - Wrap the `reportError()` call in try-catch for silent degradation so the fallback UI is never broken
    - Remove any remaining references to `/log-error`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.2 Write property test for error boundary reporting (P1)
    - **Property 1: Error boundary calls reportError, not fetch('/log-error')**
    - Create `apps/admissions/tests/property/errorBoundary.property.test.ts`
    - Use fast-check to verify the source file does not contain `/log-error` and does import `reportError`
    - **Validates: Requirements 1.1, 1.2, 1.3**

  - [x] 1.3 Wire contact form submission to notification API
    - In `apps/admissions/src/pages/ContactPage.tsx`, replace the `console.log` handler with `apiClient.request('/notifications/', { method: 'POST', body: payload })`
    - Add `submitState` tracking (idle/submitting/success/error) with appropriate UI feedback
    - On success: show confirmation message and reset form fields
    - On error: show error message, preserve entered data
    - Note: The notification model requires a valid `user_id` FK — use a system admin user ID or handle the null case appropriately
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 1.4 Write unit test for contact form submission
    - Test that form calls apiClient with correct payload on submit
    - Test success state shows confirmation and resets form
    - Test error state shows error message and preserves data
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 2. Checkpoint — Verify critical frontend fixes
  - Run `cd apps/admissions && bun run test` to ensure all tests pass
  - Run `cd apps/admissions && bun run build` to ensure the build succeeds
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Frontend cleanup (dead code, stale comments, deprecated fields, unused deps)
  - [x] 3.1 Delete dead code files
    - Delete `apps/admissions/src/services/documentExtraction.ts`
    - Delete `apps/admissions/src/utils/lazy-imports.ts`
    - Delete `apps/admissions/src/utils/animationOptimization.ts`
    - Delete `apps/admissions/src/utils/performance.ts`
    - Verify no remaining imports reference these files
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 3.2 Write property test for dead file removal (P4)
    - **Property 4: Dead files don't exist post-remediation**
    - Create `apps/admissions/tests/property/deadCode.property.test.ts`
    - Use fast-check to verify the 4 deleted file paths do not exist (fs check or import attempt)
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

  - [x] 3.3 Remove stale Supabase comments
    - In `apps/admissions/src/components/ui/EnhancedErrorHandling.tsx`, remove comments referencing "Supabase error format"
    - In `apps/admissions/src/pages/student/Dashboard.tsx`, remove comments referencing "replaces Supabase Realtime"
    - In `apps/admissions/src/hooks/useRealtime.ts`, remove Supabase migration comments
    - In `apps/admissions/src/contexts/RealtimeStatusContext.tsx`, remove Supabase migration comments
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 3.4 Remove deprecated frontend API surfaces
    - In `apps/admissions/src/services/interviews.ts`, remove the `application_id` field from `ScheduleInterviewData` interface; ensure all callers use `applicationId`
    - In `apps/admissions/src/components/ui/EmptyState.tsx` (or equivalent), remove the `title` prop from `EmptyStateProps`; ensure all callers use `heading`
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 3.5 Remove unused npm dependencies
    - Remove from `apps/admissions/package.json`: `exceljs`, `xlsx`, `form-data`, `dotenv`, `react-window`, `@types/react-window`, `@tsparticles/react`, `@tsparticles/slim`
    - Run `cd apps/admissions && bun install` to update the lockfile
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [x] 3.6 Write property test for unused dependencies removal (P5 — frontend)
    - **Property 5 (frontend): Unused deps removed from package.json**
    - Create `apps/admissions/tests/property/unusedDeps.property.test.ts`
    - Use fast-check to verify the 8 removed package names do not appear in package.json dependencies
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6**

- [x] 4. Checkpoint — Verify frontend cleanup
  - Run `cd apps/admissions && bun run test` to ensure all tests pass
  - Run `cd apps/admissions && bun run build` to ensure the build succeeds with no import errors
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Backend hardening (transaction, error handling, email constant, exception leakage)
  - [x] 5.1 Wrap bulk status updates in transaction.atomic()
    - In `backend/apps/applications/views.py`, wrap `ApplicationBulkStatusView.post()` database writes in `transaction.atomic()` with `select_for_update()` on each application
    - If any single update fails, the entire batch rolls back and returns an error response
    - On success, commit all changes and return the count of updated applications
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 5.2 Write property test for atomic bulk updates (P2)
    - **Property 2: Bulk status updates are atomic**
    - Create `backend/tests/property/test_bulk_status_atomic.py`
    - Use hypothesis to verify that a simulated failure mid-batch results in zero committed changes
    - **Validates: Requirements 6.1, 6.2**

  - [x] 5.3 Harden error handling in accounts views
    - In `backend/apps/accounts/views.py`, replace bare `except Exception: pass` blocks with `except Exception: logger.warning("...", exc_info=True)` for:
      - JTI blacklisting during logout (audit item B4)
      - Token rotation during refresh (audit item B5)
      - Any other bare exception handlers (audit item B6)
    - Ensure no PII, tokens, or secrets appear in log messages
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 5.4 Write property test for no bare except-pass (P7)
    - **Property 7: No bare except:pass in accounts views**
    - Create `backend/tests/property/test_accounts_error_handling.py`
    - Use hypothesis/AST inspection to verify every `except Exception` block in `accounts/views.py` contains a `logger` call, not bare `pass`
    - **Validates: Requirements 10.1, 10.2, 10.3**

  - [x] 5.5 Prevent exception leakage in documents views
    - In `backend/apps/documents/views.py`, replace `return Response({"error": str(e)})` patterns with generic error messages (e.g., `"Invalid file format"` or `"An error occurred"`)
    - Add `logger.exception()` for server-side debugging
    - Use the standard envelope error format with appropriate error codes
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 5.6 Write property test for no str(e) in responses (P3)
    - **Property 3: No str(e) in API error responses**
    - Create `backend/tests/property/test_documents_error_handling.py`
    - Use hypothesis/source inspection to verify `documents/views.py` does not contain `str(e)` in any Response construction
    - **Validates: Requirements 11.1, 11.2**

  - [x] 5.7 Centralize hardcoded fallback email constant
    - Replace hardcoded `admin@mihas.edu.zm` with `settings.ERROR_ALERT_EMAIL` in:
      - `backend/apps/common/exceptions.py`
      - `backend/apps/common/error_views.py`
      - `backend/apps/common/tasks.py`
    - Verify `ERROR_ALERT_EMAIL` is already defined in `backend/config/settings/base.py`
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 5.8 Write property test for fallback email from settings (P6)
    - **Property 6: Fallback email from settings, not hardcoded**
    - Create `backend/tests/property/test_email_constant.py`
    - Use hypothesis/source inspection to verify the 3 files do not contain the hardcoded `admin@mihas.edu.zm` string
    - **Validates: Requirements 12.1, 12.2**

- [x] 6. Checkpoint — Verify backend hardening
  - Run `cd backend && python3 -m pytest tests/unit/ tests/property/ -x -q` to ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Backend deduplication (document task helper, status transition helper)
  - [x] 7.1 Extract shared document task helper
    - In `backend/apps/applications/views.py`, extract `_enqueue_document_task(application, task_type, task_func, request)` helper
    - The helper handles: idempotency check, task dispatch, audit logging, and response construction
    - Refactor `AcceptanceLetterView` and `FinanceReceiptView` to delegate to the shared helper
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 7.2 Extract status transition helper
    - Create `backend/apps/applications/services.py` with `transition_application_status(application, new_status, changed_by, notes, ip_address, user_agent)`
    - The helper saves the application, creates an `ApplicationStatusHistory` record, returns old_status
    - Refactor `ApplicationReviewView` and `ApplicationBulkStatusView` to delegate to the shared helper
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [x] 7.3 Write unit tests for document task helper and status transition helper
    - Test `_enqueue_document_task` idempotency and dispatch behavior
    - Test `transition_application_status` creates history record and returns old status
    - _Requirements: 7.4, 13.4_

- [x] 8. Checkpoint — Verify backend deduplication
  - Run `cd backend && python3 -m pytest tests/unit/ tests/property/ -x -q` to ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Dependency cleanup (backend)
  - [x] 9.1 Remove dead backend dependency
    - Remove `djangorestframework-simplejwt` from `backend/requirements.txt`
    - Verify no imports reference `rest_framework_simplejwt` in the codebase
    - _Requirements: 8.1, 8.2_

  - [x] 9.2 Write property test for unused backend dependency removal (P5 — backend)
    - **Property 5 (backend): djangorestframework-simplejwt not in requirements.txt**
    - Add to `backend/tests/property/test_email_constant.py` or create `backend/tests/property/test_dead_deps.py`
    - Verify `djangorestframework-simplejwt` does not appear in `requirements.txt`
    - **Validates: Requirements 8.1**

- [x] 10. Stale artifact cleanup (specs, env, tests, completion markers)
  - [x] 10.1 Rename stale Arcjet test
    - In the backend test file containing `test_scope_limits_match_arcjet_config`, rename it to `test_scope_limits_match_rate_limit_config`
    - Update any references to "arcjet" in the test body to reference the current rate-limiting implementation
    - _Requirements: 14.1, 14.2_

  - [x] 10.2 Delete stale spec directories
    - Delete `.kiro/specs/admin-dashboard-fixes/` (references Supabase Auth)
    - Delete `.kiro/specs/bun-vercel-runtime-forensics/` (references Supabase client)
    - Delete `.kiro/specs/supabase-auth-removal/`
    - Delete `.kiro/specs/supabase-complete-removal/`
    - Delete `.kiro/specs/supabase-exit-migration/`
    - Delete `.kiro/specs/supabase-remnant-purge/`
    - _Requirements: 15.1, 15.2, 15.3_

  - [x] 10.3 Clean up stale environment configuration
    - In root `.env.example`, remove the `ARCJET_KEY` variable
    - Consolidate SMTP naming: align root `.env.example` with `backend/.env.example` to use consistent `ZOHO_SMTP_*` naming
    - Separate frontend-only variables (prefixed `VITE_`) from backend-only variables, or remove backend-only vars from root file
    - _Requirements: 16.1, 16.2, 16.3_

  - [x] 10.4 Add completion markers to finished spec directories
    - For each spec directory that represents completed work, add `"status": "completed"` to its `.config.kiro` file
    - Document the convention so future specs follow the same pattern
    - _Requirements: 17.1, 17.2_

- [x] 11. Final checkpoint — Verify all changes
  - Run `cd apps/admissions && bun run test` to verify frontend tests pass
  - Run `cd apps/admissions && bun run build` to verify frontend build succeeds
  - Run `cd backend && python3 -m pytest tests/unit/ tests/property/ -x -q` to verify backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each phase
- Property tests validate the 7 correctness properties from the design document
- Frontend tests: `cd apps/admissions && bun run test`
- Backend tests: `cd backend && python3 -m pytest tests/unit/ tests/property/ -x -q`
- Do NOT run dev servers during implementation
/.