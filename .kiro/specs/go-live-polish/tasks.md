# Implementation Tasks — Go-Live Polish

## P1 — Must Fix

- [ ] 1. Fix test_admin_override.py to use TransactionTestCase
  - [x] 1.1 Change `SimpleTestCase` to `TransactionTestCase` and add `databases = ['default']` in `backend/tests/property/test_admin_override.py`
  - _Requirements: 2.1_

- [ ] 2. Seed international program fees
  - [x] 2.1 Insert `international` residency fee rows for all 4 programs in Neon (K306 each, fee_type='application')
  - [ ] 2.2 Verify `FeeResolver` returns correct fee for international nationality
  - _Requirements: 2.2_

- [ ] 3. Send notifications on approval/rejection
  - [x] 3.1 In `ApplicationReviewView.post()` in `backend/apps/applications/views.py`, after status transition to `approved` or `rejected`, create a `Notification` record for the student
  - [ ] 3.2 Dispatch email notification via `send_email_task` for approval/rejection
  - [ ] 3.3 Write test: approval creates notification + queues email
  - _Requirements: 2.3_

- [ ] 4. Deprecate application_drafts table
  - [x] 4.1 Add `DEPRECATED` docstring to `ApplicationDraft` model in `backend/apps/applications/models.py`
  - [ ] 4.2 Add comment to `application_drafts` in `verify_schema_static.py` marking it as deprecated
  - _Requirements: 2.4_

## P2 — Production Quality

- [ ] 5. Add keep-alive ping to Celery Beat
  - [x] 5.1 Create `keep_alive_ping_task` in `backend/apps/common/tasks.py` that sends GET to `/health/live/`
  - [x] 5.2 Add to `CELERY_BEAT_SCHEDULE` in `backend/config/settings/base.py` — every 4 minutes
  - _Requirements: 2.5_

- [ ] 6. Include intake capacity in review response
  - [x] 6.1 In `ApplicationReviewView.post()`, after status update, include `intake_capacity` and `intake_enrollment` in the response JSON
  - _Requirements: 2.6_

- [ ] 7. Sync program_intakes.current_enrollment
  - [x] 7.1 Extend `IntakeEnforcer.sync_enrollment()` in `backend/apps/applications/intake_enforcer.py` to also update `program_intakes` for the specific program+intake
  - _Requirements: 2.7_

- [ ] 8. Lazy-load vendor-pdf chunk
  - [x] 8.1 Verify that jspdf/pdf-lib imports in `apps/admissions/src/` use dynamic `import()` not static imports
  - [ ] 8.2 If any static imports exist, convert them to dynamic imports
  - _Requirements: 2.8_

- [ ] 9. Add CSRF token cleanup task
  - [x] 9.1 Create `cleanup_csrf_tokens_task` in `backend/apps/common/tasks.py` that deletes expired tokens older than 48 hours
  - [x] 9.2 Add to `CELERY_BEAT_SCHEDULE` — daily at 04:00 UTC
  - _Requirements: 2.9_

## Final

- [ ] 10. Run all backend tests and verify no regressions
  - Run `cd backend && python3 -m pytest tests/unit/ -q`
  - Run Stagehand E2E: `bun run scripts/stagehand-e2e.ts`
  - Verify OpenAPI schema: `cd backend && python3 manage.py spectacular --file /tmp/schema.yaml`
