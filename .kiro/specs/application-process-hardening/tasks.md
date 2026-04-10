# Implementation Plan: Application Process Hardening

## Overview

21 active requirements (Req 2–22) across security, performance, data validation, accessibility, and database integrity. Req 1 is already implemented. No schema changes needed — all existing Neon Postgres tables and indexes are leveraged.

## Tasks

- [x] 1. Backend security hardening
  - [x] 1.1 Add webhook replay protection to WebhookProcessor
    - Add dedup query in `process()` after signature validation: check `webhook_event_logs` for existing `(reference, event_type, processed=True)`
    - Log duplicate at INFO level, create log entry with `processing_error='Duplicate event — already processed'`
    - File: `backend/apps/documents/webhook_processor.py`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 1.2 Wire submission idempotency using existing idempotency_keys table
    - Add `Idempotency-Key` header check in `ApplicationSubmitView.post()` before calling `submit_application()`
    - Look up key in `idempotency_keys` table; return stored `response_json` if found
    - Store successful response after submission with key, endpoint, response_json
    - Add inline cleanup: `DELETE WHERE created_at < NOW() - INTERVAL '1 hour'`
    - File: `backend/apps/applications/views.py`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 1.3 Add idempotency key header to frontend wizard submission
    - Generate `crypto.randomUUID()` and include as `Idempotency-Key` header in submit POST
    - Generate new key on each retry after failure
    - File: `apps/admissions/src/pages/student/applicationWizard/index.tsx`
    - _Requirements: 3.6_

  - [x] 1.4 Harden error report endpoint
    - Add `ScopedRateThrottle` with `throttle_scope = 'error_report'` to `ErrorReportView`
    - Add `'error_report': '5/min'` to `DEFAULT_THROTTLE_RATES` in settings
    - Add payload size check (reject >16 KB with 413)
    - Cap batch to first 10 items
    - Files: `backend/apps/common/error_views.py`, `backend/config/settings/base.py`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 1.5 Add force-bypass audit logging to ApplicationReviewView
    - When `force=True` on approval, set notes to `[FORCE-BYPASS]` prefix with reason
    - Store `{"force_bypass": true, "reason": "..."}` in history `changes` JSONB
    - Log warning with app ID, admin ID, target status
    - Extract hashed IP via `_get_client_ip()` + SHA-256, and user agent from `request.META['HTTP_USER_AGENT']`
    - Pass hashed IP and user agent to `transition_application_status()` (currently not passed by the view)
    - File: `backend/apps/applications/views.py`
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 1.6 Write property tests for security hardening (backend)
    - **Property 1: Webhook deduplication prevents reprocessing**
    - **Property 2: Idempotency key returns cached response**
    - **Property 6: Force-bypass creates audit trail**
    - File: `backend/tests/property/test_application_hardening.py`
    - _Validates: Req 2, 3, 5_

- [x] 2. Checkpoint — Security hardening
  - Run `cd backend && python3 -m pytest` and verify all tests pass

- [x] 3. Backend performance and validation
  - [x] 3.1 Increase pagination max_page_size from 100 to 500
    - One-line change: `max_page_size = 500`
    - File: `backend/apps/common/pagination.py`
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 3.2 Add prefetch_related to application detail and list views
    - Detail: add `prefetch_related('applicationdocument_set', 'applicationgrade_set', 'applicationinterview_set')`
    - Note: `ApplicationDocument` and `ApplicationGrade` are in `apps.documents.models`, `ApplicationInterview` is in `apps.applications.models` — all use default reverse names via `ForeignKey('applications.Application')`
    - List: add `prefetch_related('applicationdocument_set')` when documents included
    - File: `backend/apps/applications/views.py`
    - _Requirements: 8.1, 8.2_

  - [x] 3.3 Add program-intake compatibility validation
    - Note: `Application.program` and `Application.intake` are `CharField` (store codes/names, not UUIDs) — must resolve to UUIDs via `Program.objects.filter(code=program)` and `Intake.objects.filter(name=intake)` before querying `program_intakes`
    - Query `program_intakes` table for `(program_id, intake_id)` existence
    - Check `intakes.is_active` flag
    - Return 400 `INVALID_PROGRAM_INTAKE` if invalid
    - File: `backend/apps/applications/serializers.py` or `views.py`
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 3.4 Add backend age validation
    - Validate `date_of_birth` yields age >= 16 using `relativedelta`
    - Return 400 `MINIMUM_AGE_NOT_MET` if underage
    - File: `backend/apps/applications/serializers.py`
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 3.5 Add phone validation (new validator — none exists currently)
    - Create `validate_phone_e164` function with regex `^\+?[0-9]{7,15}$`
    - Note: no phone validator exists in the codebase currently — this is a new function, not an update
    - File: `backend/apps/common/validators.py`
    - _Requirements: 12.1, 12.2_

  - [x] 3.6 Add application status state machine enforcement
    - Define `ALLOWED_TRANSITIONS` dict at module level in `services.py`
    - Add validation at start of `transition_application_status()` before mutations
    - Raise `ValueError` with `INVALID_STATUS_TRANSITION` for disallowed transitions
    - Log invalid attempts at WARNING level
    - File: `backend/apps/applications/services.py`
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [x] 3.7 Write property tests for validation and state machine (backend)
    - **Property 8: Pagination max page size cap**
    - **Property 10: Program-intake validation rejects invalid combos**
    - **Property 11: Age validation rejects underage**
    - **Property 12: E.164 phone validation**
    - **Property 13: State machine rejects invalid transitions**
    - File: `backend/tests/property/test_application_hardening.py`
    - _Validates: Req 7, 10, 11, 12, 13_

- [x] 4. Checkpoint — Performance and validation
  - Run `cd backend && python3 -m pytest` and verify all tests pass

- [x] 5. Frontend improvements
  - [x] 5.1 Add error reporter deduplication
    - Replace buffer array with Map keyed by hash of message+stack
    - Include `count` field in deduplicated payloads
    - File: `apps/admissions/src/lib/errorReporter.ts`
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 5.2 Implement exponential backoff in usePaymentStatus
    - Replace `setInterval(fetchStatus, 10_000)` with `setTimeout` chaining
    - Start at 2s, multiply by 1.5 each poll, cap at 30s
    - Reset to 2s on manual `refetch()`
    - Stop on `successful` or `failed`
    - File: `apps/admissions/src/hooks/usePaymentStatus.ts`
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 5.3 Update wizard phone input for international numbers
    - Update Zod schema to accept `+` prefix in phone field
    - File: `apps/admissions/src/pages/student/applicationWizard/types.ts` or profile step
    - _Requirements: 12.3_

  - [x] 5.4 Write property tests for frontend improvements
    - **Property 7: Frontend error deduplication**
    - **Property 9: Exponential backoff interval growth**
    - File: `apps/admissions/tests/property/application-process-hardening.test.tsx`
    - _Validates: Req 6, 9_

- [x] 6. Checkpoint — Frontend improvements
  - Run `cd apps/admissions && bun run test` and verify all tests pass

- [x] 7. Accessibility improvements
  - [x] 7.1 Enhance wizard step aria-live announcements
    - Update aria-live region to format: "Step N of M: title"
    - Include "Validation errors found" on error step changes
    - Ensure region is in DOM before first step renders
    - File: `apps/admissions/src/pages/student/applicationWizard/index.tsx`
    - _Requirements: 14.1, 14.2, 14.3_

  - [x] 7.2 Add payment error recovery accessibility
    - Add `role="alert"` to payment error container
    - Focus retry button after payment failure via `useEffect` + ref
    - Include descriptive error text with failure reason
    - File: `apps/admissions/src/pages/student/applicationWizard/steps/PaymentStep.tsx`
    - _Requirements: 15.1, 15.2, 15.3_

  - [x] 7.3 Add keyboard navigation to admin applications grid
    - Add `onKeyDown` handler for ArrowUp/ArrowDown/Enter/Space
    - Add `role="grid"` to container, `role="row"` + `aria-rowindex` to rows
    - Add visible focus style on keyboard-focused rows
    - File: `apps/admissions/src/pages/admin/Applications.tsx`
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

  - [x] 7.4 Improve validation error focus management
    - Focus first `[aria-invalid="true"]` field on validation failure
    - Add `aria-describedby` linking fields to error messages
    - Ensure error messages are visible text (not only aria-live)
    - File: `apps/admissions/src/pages/student/applicationWizard/index.tsx`
    - _Requirements: 17.1, 17.2, 17.3_

  - [x] 7.5 Fix error display color contrast
    - Audit `--destructive` CSS variable for >= 4.5:1 contrast ratio
    - Add error icon alongside color indicators
    - Ensure borders have >= 3:1 contrast
    - File: `apps/admissions/src/index.css` or Tailwind config
    - _Requirements: 18.1, 18.2, 18.3_

  - [x] 7.6 Implement batched admin export
    - Process CSV rows in batches of 500 with `setTimeout(r, 0)` yields
    - Use Blob streaming download
    - File: `apps/admissions/src/pages/admin/Applications.tsx`
    - _Requirements: 19.1, 19.3_

  - [x] 7.7 Write property tests for accessibility
    - **Property 14: Wizard step announcement format**
    - **Property 15: Payment error alert role**
    - File: `apps/admissions/tests/property/application-process-hardening.test.tsx`
    - _Validates: Req 14, 15_

- [x] 8. Checkpoint — Accessibility
  - Run `cd apps/admissions && bun run test` and verify all tests pass

- [x] 9. Database integrity remediation
  - [x] 9.1 Create and run remediation SQL script
    - Req 20: Update `APP-20260401-D169738A` payment_status to `force_approved`, add admin_feedback note, create history entry
    - Req 21: Flag `MIHAS202661975` with admin_feedback note, create history entry
    - Req 22: Backfill `submitted_at` for all non-draft apps where it's NULL using earliest status history timestamp
    - File: `backend/scripts/remediate_integrity.sql`
    - _Requirements: 20.1, 20.2, 21.1, 21.2, 22.1, 22.2, 22.3_

- [x] 10. Final checkpoint — All tests pass
  - Run backend and frontend test suites
  - Verify remediation SQL applied correctly via Neon MCP queries

## Notes

- Req 1 is excluded (already implemented)
- No database schema changes — all existing tables leveraged
- Backend test command: `cd backend && python3 -m pytest`
- Frontend test command: `cd apps/admissions && bun run test`
- Property test files:
  - Backend: `backend/tests/property/test_application_hardening.py`
  - Frontend: `apps/admissions/tests/property/application-process-hardening.test.tsx`
- Remediation SQL: `backend/scripts/remediate_integrity.sql`
