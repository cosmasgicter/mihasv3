# Implementation Tasks — Go-Live Polish

## P1 — Must Fix

- [x] 1. Fix test_admin_override.py to use TransactionTestCase
  - [x] 1.1 Change `SimpleTestCase` to `TransactionTestCase` and add `databases = ['default']` in `backend/tests/property/test_admin_override.py`
  - _Requirements: 2.1_

- [x] 2. Seed international program fees
  - [x] 2.1 Insert `international` residency fee rows for all 4 programs in Neon (K306 each, fee_type='application')
  - [x] 2.2 Verify `FeeResolver` returns correct fee for international nationality
  - _Requirements: 2.2_

- [x] 3. Send notifications on approval/rejection
  - [x] 3.1 In `ApplicationReviewView.post()` in `backend/apps/applications/views.py`, after status transition to `approved` or `rejected`, create a `Notification` record for the student
  - [x] 3.2 Dispatch email notification via `send_email_task` for approval/rejection
  - [x] 3.3 Write test: approval creates notification + queues email
  - _Requirements: 2.3_

- [x] 4. Deprecate application_drafts table
  - [x] 4.1 Add `DEPRECATED` docstring to `ApplicationDraft` model in `backend/apps/applications/models.py`
  - [x] 4.2 Add comment to `application_drafts` in `verify_schema_static.py` marking it as deprecated
  - _Requirements: 2.4_

## P2 — Production Quality

- [x] 5. Add keep-alive ping to Celery Beat
  - [x] 5.1 Create `keep_alive_ping_task` in `backend/apps/common/tasks.py` that sends GET to `/health/live/`
  - [x] 5.2 Add to `CELERY_BEAT_SCHEDULE` in `backend/config/settings/base.py` — every 4 minutes
  - _Requirements: 2.5_

- [x] 6. Include intake capacity in review response
  - [x] 6.1 In `ApplicationReviewView.post()`, after status update, include `intake_capacity` and `intake_enrollment` in the response JSON
  - _Requirements: 2.6_

- [x] 7. Sync program_intakes.current_enrollment
  - [x] 7.1 Extend `IntakeEnforcer.sync_enrollment()` in `backend/apps/applications/intake_enforcer.py` to also update `program_intakes` for the specific program+intake
  - _Requirements: 2.7_

- [x] 8. Lazy-load vendor-pdf chunk
  - [x] 8.1 Verify that jspdf/pdf-lib imports in `apps/admissions/src/` use dynamic `import()` not static imports
  - [x] 8.2 If any static imports exist, convert them to dynamic imports
  - _Requirements: 2.8_

- [x] 9. Add CSRF token cleanup task
  - [x] 9.1 Create `cleanup_csrf_tokens_task` in `backend/apps/common/tasks.py` that deletes expired tokens older than 48 hours
  - [x] 9.2 Add to `CELERY_BEAT_SCHEDULE` — daily at 04:00 UTC
  - _Requirements: 2.9_

## Final

- [x] 10. Run all backend tests and verify no regressions
  - Run `cd backend && python3 -m pytest tests/unit/ -q`
  - Run Stagehand E2E: `bun run scripts/stagehand-e2e.ts`
  - Verify OpenAPI schema: `cd backend && python3 manage.py spectacular --file /tmp/schema.yaml`

---

## New Issues (13 Apr 2026)

## P1 — Must Fix (Production Blockers)

- [x] 11. Allow slip uploads for non-draft applications
  - [x] 11.1 In `DocumentUploadView.post()` in `backend/apps/documents/views.py`, modify the draft-only guard to allow `application_slip` document type uploads regardless of application status
  - [x] 11.2 Verify slip generation and email still works for approved applications
  - _Requirements: 2.10_

- [x] 12. Remove `approved` from DuplicateChecker create-time non-terminal statuses
  - [x] 12.1 In `backend/apps/applications/duplicate_checker.py`, change `NON_TERMINAL_STATUSES` from `{"draft", "submitted", "under_review", "approved", "waitlisted"}` to `{"draft", "submitted", "under_review", "waitlisted"}`
  - [x] 12.2 In `apps/admissions/src/lib/duplicateApplicationCheck.ts`, update the frontend `nonTerminalStatuses` set to match (remove `approved`)
  - [x] 12.3 Verify `SUBMITTED_STATUSES` in `check_at_submit()` still includes `approved` (no change needed there)
  - [x] 12.4 Run existing duplicate checker property tests to confirm no regressions
  - _Requirements: 2.11_

- [x] 13. Add `first_name` and `last_name` to ProfileReadSerializer
  - [x] 13.1 In `backend/apps/accounts/serializers.py`, add `first_name` and `last_name` to `ProfileReadSerializer.Meta.fields`
  - [x] 13.2 Verify the profile endpoint returns the new fields
  - _Requirements: 2.13_

## P2 — Production Quality

- [x] 14. Map admin activity feed to human-readable messages
  - [x] 14.1 In `apps/admissions/src/services/admin/dashboard.ts`, add an `ACTIVITY_MESSAGE_MAP` that maps `action + entity_type` to human-readable descriptions
  - [x] 14.2 Update the `normalizeRecentActivity()` message fallback to use the map instead of raw `${action} ${entityType}`
  - _Requirements: 2.12_

- [x] 15. Handle 404 gracefully in draft deletion and stale application references
  - [x] 15.1 In `apps/admissions/src/services/applications.ts`, update `applicationService.delete()` to catch 404 errors and return `{ success: true }` (idempotent delete semantics)
  - [x] 15.2 In `apps/admissions/src/services/applications.ts`, wrap the `/details/` call in `loadApplicationDetails()` with a 404 catch that returns null instead of throwing
  - _Requirements: 2.14_

- [x] 16. Add rapid-failure detection to SSE client
  - [x] 16.1 In `apps/admissions/src/lib/sseClient.ts`, add rapid-failure tracking: if connection dies within 5s of opening, increment counter; after 3 rapid failures in 60s, stop SSE and dispatch `rapid_failure_fallback` event to trigger polling-only mode
  - _Requirements: 2.15_

## Final (New)

- [x] 17. Run all backend tests and verify no regressions from new fixes
  - Run `cd backend && python3 -m pytest tests/unit/ -q`
  - Verify OpenAPI schema: `cd backend && python3 manage.py spectacular --file /tmp/schema.yaml`
  - Run admissions lint: `bun run lint:admissions`
  - Run admissions build: `bun run build:admissions`
