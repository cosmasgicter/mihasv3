# Implementation Plan: Admissions Business Logic Densification

## Overview

Implements 15 business logic domains across 4 priority tiers. Each tier ends with a checkpoint. Backend services are created first, then endpoints, then Celery tasks, then frontend changes. All database changes are applied via a single SQL migration script before any code changes.

## Tasks

- [x] 1. Database Migration
  - [x] 1.1 Create SQL migration script
    - Create `backend/scripts/business_logic_densification.sql` with all new columns, tables, indexes, and seed data as specified in the design document.
    - New columns on `applications`: `waitlist_position`, `is_late_submission`, `assigned_reviewer_id`, `enrollment_confirmation_deadline`.
    - New column on `intakes`: `grace_period_days`.
    - New tables: `application_conditions`, `communication_templates`, `academic_calendar_events`, `fee_waivers`, `application_amendments`.
    - Seed all 20 communication templates.
    - _Requirements: All_

  - [x] 1.2 Create Django models for new tables
    - Add `ApplicationCondition`, `CommunicationTemplate`, `AcademicCalendarEvent`, `FeeWaiver`, `ApplicationAmendment` models to appropriate model files (all `managed = False`).
    - Add new columns to existing `Application` model: `waitlist_position`, `is_late_submission`, `assigned_reviewer_id`, `enrollment_confirmation_deadline`.
    - Add `grace_period_days` to `Intake` model.
    - _Requirements: All_

  - [x] 1.3 Update ALLOWED_TRANSITIONS
    - Extend `ALLOWED_TRANSITIONS` in `backend/apps/applications/services.py` with new statuses: `withdrawn`, `expired`, `conditionally_approved`, `enrolled`, `enrollment_expired`.
    - Add `_STATUS_TRANSITION_UPDATE_FIELDS` entries for new fields if needed.
    - _Requirements: 1, 3, 4, 5, 10_

- [x] 2. P0 — Application Withdrawal (Req 1)
  - [x] 2.1 Create WithdrawalService
    - Create `backend/apps/applications/withdrawal_service.py` with `WithdrawalService` class.
    - Implement `withdraw()`: validate status is in {submitted, under_review, waitlisted}, validate reason length (10–500 chars), call `transition_application_status()` with `withdrawn`, decrement enrollment via `IntakeEnforcer.decrement_enrollment()`, trigger waitlist promotion.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

  - [x] 2.2 Create withdrawal endpoint
    - Add `ApplicationWithdrawView` to `backend/apps/applications/views.py`.
    - `POST /api/v1/applications/{id}/withdraw/` — owner only, requires `withdrawal_reason` in body.
    - Support idempotency via `IdempotencyKey`.
    - Register URL in `backend/apps/applications/urls.py`.
    - _Requirements: 1.9, 1.10_

  - [x] 2.3 Update DuplicateChecker for withdrawn status
    - Add `withdrawn` to the set of terminal statuses in `DuplicateChecker` so withdrawn applications don't block new applications.
    - _Requirements: 1.11_

  - [x] 2.4 Write unit tests for withdrawal
    - Test valid withdrawal from each allowed status.
    - Test rejection of withdrawal from invalid statuses (draft, approved, rejected).
    - Test reason validation (too short, too long, missing).
    - Test enrollment decrement on withdrawal.
    - Test idempotency.
    - Add to `backend/tests/unit/test_withdrawal.py`.
    - _Requirements: 1.1–1.11_

- [x] 3. P0 — Interview Scheduling Business Rules (Req 2)
  - [x] 3.1 Create interview business logic module
    - Create `backend/apps/applications/interview_service.py` with `InterviewService` class.
    - Implement `validate_scheduling()`: check application status is in {submitted, under_review, waitlisted}, enforce 48-hour minimum notice, check for time conflicts (2-hour window same application), check interviewer conflicts (1-hour window same admin — warning only).
    - Implement `schedule_interview()`: validate, create interview, auto-transition application to `under_review` if currently `submitted`, send notification.
    - Implement `reschedule_interview()`: validate, update interview, send rescheduled notification.
    - Implement `cancel_interview()`: require cancellation_reason, update status, send notification.
    - _Requirements: 2.1–2.7, 2.9–2.11_

  - [x] 3.2 Update ApplicationInterviewView with business rules
    - Modify `ApplicationInterviewView.post()` to use `InterviewService.schedule_interview()`.
    - Modify `_update_latest_interview()` to use `InterviewService.reschedule_interview()` when status changes to `rescheduled` and `InterviewService.cancel_interview()` when status changes to `cancelled`.
    - Add validation for `mode` enum: `virtual`, `phone`, `in_person`.
    - Add validation for virtual mode requiring URL in location or notes.
    - _Requirements: 2.1–2.7, 2.9–2.11_

  - [x] 3.3 Create interview Celery tasks
    - Add `interview_auto_complete_task` to `backend/apps/applications/tasks.py`: runs every 2 hours, finds interviews with `scheduled_at` in the past and status `scheduled`, transitions to `completed`.
    - Add `interview_reminder_task`: runs every hour, finds interviews scheduled within next 24 hours, sends reminder notification (deduplicated — skip if notification already sent for this interview in last 24 hours).
    - Register both tasks in `CELERY_BEAT_SCHEDULE`.
    - _Requirements: 2.8, 2.12_

  - [x] 3.4 Write unit tests for interview scheduling
    - Test minimum notice enforcement (reject < 48 hours).
    - Test time conflict detection (same application within 2 hours).
    - Test interviewer conflict warning (same admin within 1 hour).
    - Test auto-transition to under_review on interview creation.
    - Test notification creation on schedule/reschedule/cancel.
    - Test mode validation and virtual URL requirement.
    - Add to `backend/tests/unit/test_interview_scheduling.py`.
    - _Requirements: 2.1–2.12_

- [x] 4. P0 — Waitlist Position and Auto-Promotion (Req 3)
  - [x] 4.1 Create WaitlistManager
    - Create `backend/apps/applications/waitlist_manager.py` with `WaitlistManager` class.
    - Implement `assign_position()`: count existing waitlisted apps for same program+intake, assign position = count + 1, save to `waitlist_position` column.
    - Implement `promote_next()`: find lowest `waitlist_position` for program+intake, transition to `approved` via `transition_application_status()` with `changed_by=system`, send notification, return promoted application.
    - Implement `reindex_positions()`: reorder all waitlisted apps for program+intake by `created_at`, assign sequential positions starting from 1.
    - Implement `get_position()`: return `{position, total}` for a given application.
    - _Requirements: 3.1–3.6, 3.8_

  - [x] 4.2 Integrate waitlist promotion triggers
    - Call `WaitlistManager.promote_next()` from `WithdrawalService.withdraw()` after enrollment decrement.
    - Call `WaitlistManager.promote_next()` from `ApplicationReviewView.post()` after rejection transitions.
    - Call `WaitlistManager.promote_next()` from `EnrollmentService` on enrollment expiry (Req 10).
    - _Requirements: 3.7_

  - [x] 4.3 Hook waitlist position assignment into review flow
    - Modify `transition_application_status()` or `ApplicationReviewView.post()`: when new_status is `waitlisted`, call `WaitlistManager.assign_position()`.
    - When admin manually approves a waitlisted app (bypassing position order), log `WAITLIST_ORDER_OVERRIDE` in history.
    - _Requirements: 3.1, 3.8_

  - [x] 4.4 Create waitlist position endpoint
    - Add `ApplicationWaitlistPositionView` to views.
    - `GET /api/v1/applications/{id}/waitlist-position/` — owner or admin.
    - Returns `{"success": true, "data": {"position": N, "total": M}}`.
    - Register URL.
    - _Requirements: 3.9_

  - [x] 4.5 Write unit tests for waitlist
    - Test position assignment (sequential, per program+intake).
    - Test promotion (lowest position promoted first).
    - Test reindexing after promotion.
    - Test override logging when admin bypasses order.
    - Test promotion triggered by withdrawal and rejection.
    - Add to `backend/tests/unit/test_waitlist.py`.
    - _Requirements: 3.1–3.10_

- [x] 5. P0 Checkpoint
  - Run `cd backend && python3 -m pytest` — all tests must pass.
  - Verify schema generation: `cd backend && python3 manage.py spectacular --file /tmp/schema.yaml`.

- [ ] 6. P1 — Application and Draft Expiry (Req 4)
  - [x] 6.1 Create expiry Celery tasks
    - Add `draft_expiry_reminder_task` to `backend/apps/applications/tasks.py`: runs daily 06:00 UTC, finds drafts with `updated_at` older than 7 days, sends reminder via `CommunicationService`. For drafts 27–30 days old, include urgency indicator.
    - Add logic to transition drafts older than 30 days to `expired` status.
    - Add `review_sla_reminder_task`: runs daily 07:00 UTC, finds submitted/under_review apps older than SLA threshold (default 5 days from `SystemSetting`), notifies all admins.
    - Register tasks in `CELERY_BEAT_SCHEDULE`.
    - _Requirements: 4.1–4.3, 4.6–4.9_

  - [x] 6.2 Update DuplicateChecker for expired status
    - Add `expired` to terminal statuses so expired apps don't block new applications.
    - _Requirements: 4.11_

  - [x] 6.3 Write unit tests for expiry
    - Test 7-day reminder trigger.
    - Test 30-day expiry transition.
    - Test urgency indicator for days 27–30.
    - Test SLA breach detection.
    - Test expired apps excluded from duplicate checks.
    - Add to `backend/tests/unit/test_expiry.py`.
    - _Requirements: 4.1–4.11_

- [ ] 7. P1 — Conditional Admission (Req 5)
  - [x] 7.1 Create ConditionManager
    - Create `backend/apps/applications/condition_manager.py`.
    - Implement `assign_conditions()`: validate application status, create `ApplicationCondition` rows, transition app to `conditionally_approved`, notify student.
    - Implement `verify_condition()`: update condition status to `met` or `waived`, set `met_at` and `verified_by`, check if all conditions resolved, auto-promote to `approved` if all met/waived.
    - Implement `check_all_conditions_resolved()`: return True if all conditions have terminal status.
    - Implement `auto_promote_if_all_met()`: if all conditions met/waived, transition to `approved`; if any expired, transition to `rejected`.
    - _Requirements: 5.1–5.5, 5.8, 5.11_

  - [x] 7.2 Create condition endpoints
    - Add `ApplicationConditionsView`: `GET /api/v1/applications/{id}/conditions/` — owner or admin.
    - Add `ApplicationConditionVerifyView`: `POST /api/v1/applications/{id}/conditions/{cid}/verify/` — admin only.
    - Integrate condition assignment into `ApplicationReviewView.post()` when `new_status=conditionally_approved` and `conditions` array is present in request body.
    - Register URLs.
    - _Requirements: 5.9, 5.10_

  - [x] 7.3 Create condition expiry task
    - Add `condition_expiry_task` to tasks: runs daily 05:00 UTC, finds conditions past deadline with status `pending`, transitions to `expired`, checks if all conditions resolved, triggers rejection if needed.
    - Register in `CELERY_BEAT_SCHEDULE`.
    - _Requirements: 5.6, 5.7, 5.8_

  - [x] 7.4 Write unit tests for conditions
    - Test condition assignment with valid/invalid application status.
    - Test condition verification (met, waived).
    - Test auto-promotion when all conditions met.
    - Test auto-rejection when condition expires.
    - Test condition expiry task.
    - Add to `backend/tests/unit/test_conditions.py`.
    - _Requirements: 5.1–5.11_

- [ ] 8. P1 — Late Application Handling (Req 6)
  - [x] 8.1 Update IntakeEnforcer for grace period
    - Modify `IntakeEnforcer.check_submission()`: when deadline has passed, check if `grace_period_days` is set and current date is within grace period. If within grace period, return `IntakeCheckResult(allowed=True)` with a flag indicating late submission.
    - _Requirements: 6.1–6.4_

  - [x] 8.2 Update submit_application for late submissions
    - Modify `submit_application()` in `services.py`: when `IntakeEnforcer` indicates late submission, set `is_late_submission=True` on the application. Check for late fee payment if configured.
    - Add late fee resolution via `FeeResolver` with `fee_type=late_application`.
    - _Requirements: 6.3, 6.5, 6.6, 6.7_

  - [x] 8.3 Write unit tests for late applications
    - Test submission within grace period (allowed, flagged as late).
    - Test submission past grace period (rejected).
    - Test late fee requirement enforcement.
    - Test admin force-bypass of late fee.
    - Add to `backend/tests/unit/test_late_applications.py`.
    - _Requirements: 6.1–6.10_

- [x] 9. P1 Checkpoint
  - Run `cd backend && python3 -m pytest` — all tests must pass.
  - Verify schema generation.

- [ ] 10. P2 — Communication Templates (Req 9)
  - [x] 10.1 Create CommunicationService
    - Create `backend/apps/common/communication_service.py`.
    - Implement `render_template()`: look up `CommunicationTemplate` by key, substitute `{{variable}}` placeholders with context values, sanitize HTML in variable values.
    - Implement `send()`: render template, create `Notification` row if channel is `notification` or `both`, create `EmailQueue` row and dispatch via `send_email_task` if channel is `email` or `both`.
    - Implement fallback: if template not found or inactive, use a generic default message.
    - _Requirements: 9.1–9.5, 9.7_

  - [x] 10.2 Create template admin endpoints
    - Add `CommunicationTemplateListView`: `GET /api/v1/admin/templates/` — admin only.
    - Add `CommunicationTemplateUpdateView`: `PUT /api/v1/admin/templates/{key}/` — admin only.
    - Register URLs in `backend/apps/common/urls.py` or a new `template_urls.py`.
    - _Requirements: 9.6_

  - [x] 10.3 Migrate existing hardcoded emails to templates
    - Replace hardcoded email strings in `ApplicationReviewView.post()` (approval and rejection emails) with `CommunicationService.send()` calls using `application_approved` and `application_rejected` template keys.
    - Replace any other hardcoded notification strings identified during implementation.
    - _Requirements: 9.8_

  - [x] 10.4 Write unit tests for communication service
    - Test template lookup and variable substitution.
    - Test HTML sanitization in variables.
    - Test fallback when template not found.
    - Test Notification and EmailQueue creation.
    - Add to `backend/tests/unit/test_communication_service.py`.
    - _Requirements: 9.1–9.8_

- [ ] 11. P2 — Document Verification SLA (Req 7)
  - [x] 11.1 Create document verification SLA task
    - Add `document_verification_sla_task` to `backend/apps/documents/tasks.py`: runs daily 08:00 UTC, finds documents in `pending` status older than SLA threshold (default 5 days from `SystemSetting`), notifies admins. Escalates at 2x threshold.
    - Register in `CELERY_BEAT_SCHEDULE`.
    - _Requirements: 7.1–7.5_

  - [x] 11.2 Write unit tests for document SLA
    - Test SLA breach detection at threshold.
    - Test escalation at 2x threshold.
    - Test configurable threshold via SystemSetting.
    - Add to `backend/tests/unit/test_document_sla.py`.
    - _Requirements: 7.1–7.8_

- [ ] 12. P2 — Payment Expiry and Retry Limits (Req 8)
  - [x] 12.1 Update payment polling task for expiry
    - Modify `poll_pending_payments_task` in `backend/apps/documents/tasks.py`: transition payments pending > 24 hours to `expired` status. Notify student via `CommunicationService`.
    - _Requirements: 8.1–8.3_

  - [x] 12.2 Add retry limit to PaymentService
    - Modify `PaymentService.initiate_payment()`: count existing payment records for the application (excluding expired > 7 days), reject if count >= 5 with error code `MAX_PAYMENT_ATTEMPTS_EXCEEDED`.
    - Include `remaining_attempts` in error responses for failed payments.
    - Update forward-only transitions: add `pending → expired` as valid.
    - _Requirements: 8.4–8.8_

  - [x] 12.3 Write unit tests for payment expiry
    - Test 24-hour expiry transition.
    - Test retry limit enforcement at 5 attempts.
    - Test remaining_attempts in response.
    - Test expired → successful is blocked.
    - Add to `backend/tests/unit/test_payment_expiry.py`.
    - _Requirements: 8.1–8.9_,.

- [x] 13. P2 Checkpoint
  - Run `cd backend && python3 -m pytest` — all tests must pass.
  - Verify schema generation.

- [ ] 14. P3 — Academic Calendar and Enrollment Confirmation (Req 10)
  - [x] 14.1 Create EnrollmentService
    - Create `backend/apps/applications/enrollment_service.py`.
    - Implement `confirm_enrollment()`: validate status is `approved` or `conditionally_approved` (with all conditions met), transition to `enrolled`.
    - Implement `compute_deadline()`: look up `academic_calendar_events` for the intake with `event_type=enrollment_confirmation_deadline`, fall back to approval_date + 14 days.
    - _Requirements: 10.1, 10.4, 10.5_

  - [x] 14.2 Create enrollment confirmation endpoint
    - Add `ApplicationConfirmEnrollmentView`: `POST /api/v1/applications/{id}/confirm-enrollment/` — owner only.
    - Register URL.
    - _Requirements: 10.5_

  - [x] 14.3 Create enrollment expiry task
    - Add `enrollment_confirmation_expiry_task` to tasks: runs daily 09:00 UTC, finds approved apps past enrollment deadline, transitions to `enrollment_expired`, decrements enrollment, triggers waitlist promotion.
    - Add enrollment confirmation reminder: 3 days before deadline.
    - Register in `CELERY_BEAT_SCHEDULE`.
    - _Requirements: 10.6–10.8, 10.10_

  - [x] 14.4 Set enrollment deadline on approval
    - Modify `ApplicationReviewView.post()`: when transitioning to `approved`, compute and set `enrollment_confirmation_deadline` on the application. Include deadline in approval notification.
    - _Requirements: 10.3, 10.4_

  - [x] 14.5 Write unit tests for enrollment
    - Test enrollment confirmation from approved status.
    - Test deadline computation (calendar event vs default 14 days).
    - Test expiry task transitions and enrollment decrement.
    - Test waitlist promotion trigger on expiry.
    - Add to `backend/tests/unit/test_enrollment.py`.
    - _Requirements: 10.1–10.10_

- [ ] 15. P3 — Reviewer Assignment (Req 11)
  - [x] 15.1 Create reviewer assignment endpoints
    - Add `ApplicationAssignView`: `POST /api/v1/applications/{id}/assign/` — super_admin only. Validates target is admin/reviewer role. Creates notification for assigned reviewer. Records in history.
    - Add `ApplicationAutoAssignView`: `POST /api/v1/applications/auto-assign/` — super_admin only. Round-robin among active reviewers respecting max workload (default 20 from `SystemSetting`).
    - Register URLs.
    - _Requirements: 11.1–11.7, 11.10_

  - [x] 15.2 Update review queue scorer for assignment
    - Modify `ReviewQueueScorer.score()`: add 5% bonus for assigned-but-not-reviewed applications.
    - Add `assigned_reviewer_id` filter support to `ApplicationFilter`.
    - _Requirements: 11.8, 11.9_

  - [x] 15.3 Write unit tests for reviewer assignment
    - Test manual assignment with valid/invalid reviewer.
    - Test auto-assign round-robin distribution.
    - Test workload cap enforcement.
    - Test priority score bonus for assigned apps.
    - Add to `backend/tests/unit/test_reviewer_assignment.py`.
    - _Requirements: 11.1–11.10_

- [ ] 16. P3 — Fee Waiver (Req 12)
  - [x] 16.1 Create FeeWaiverService
    - Create `backend/apps/documents/fee_waiver_service.py`.
    - Implement `grant_waiver()`: validate super_admin permission, create `FeeWaiver` row, if full waiver set payment_status to `force_approved`, record in history.
    - Implement `get_effective_fee()`: check for active waiver, compute discounted fee.
    - _Requirements: 12.1–12.6_

  - [x] 16.2 Create fee waiver endpoint
    - Add `ApplicationFeeWaiverView`: `POST /api/v1/applications/{id}/fee-waiver/` — super_admin only.
    - Register URL.
    - _Requirements: 12.2, 12.7_

  - [x] 16.3 Integrate waiver into PaymentService
    - Modify `PaymentService.initiate_payment()`: check for active partial waiver, use discounted fee amount.
    - _Requirements: 12.4, 12.5_

  - [x] 16.4 Write unit tests for fee waivers
    - Test full waiver grants force_approved status.
    - Test partial waiver computes correct discounted fee.
    - Test only super_admin can grant waivers.
    - Test waiver recorded in history.
    - Add to `backend/tests/unit/test_fee_waivers.py`.
    - _Requirements: 12.1–12.10_

- [ ] 17. P3 — Batch Operation Safety (Req 13)
  - [x] 17.1 Harden ApplicationBulkStatusView
    - Add batch size limit of 25.
    - Add all-or-nothing validation: check all applications are eligible before applying any transitions.
    - Add `confirmation_token` requirement: SHA-256 of sorted IDs + target status.
    - Process within a single transaction.
    - Trigger waitlist promotion on batch rejections.
    - Return summary response.
    - _Requirements: 13.1–13.9_

  - [x] 17.2 Write unit tests for batch safety
    - Test batch size limit enforcement.
    - Test all-or-nothing validation (one invalid blocks all).
    - Test confirmation token validation.
    - Test transaction atomicity.
    - Add to `backend/tests/unit/test_batch_operations.py`.
    - _Requirements: 13.1–13.9_

- [ ] 18. P3 — Application Amendments (Req 14)
  - [x] 18.1 Create AmendmentService
    - Create `backend/apps/applications/amendment_service.py`.
    - Implement `request_amendment()`: validate application status, validate field is amendable, check pending count < 3, create `ApplicationAmendment` row, notify admins.
    - Implement `review_amendment()`: approve (apply field change to application, record in history) or reject.
    - _Requirements: 14.1–14.8_

  - [x] 18.2 Create amendment endpoints
    - Add `ApplicationAmendmentView`: `POST /api/v1/applications/{id}/amendments/` — owner only.
    - Add `ApplicationAmendmentReviewView`: `POST /api/v1/applications/{id}/amendments/{aid}/review/` — admin only.
    - Register URLs.
    - _Requirements: 14.2, 14.7_

  - [x] 18.3 Write unit tests for amendments
    - Test amendable vs non-amendable fields.
    - Test pending amendment limit (max 3).
    - Test approval applies field change.
    - Test rejection leaves application unchanged.
    - Test only valid statuses allow amendments.
    - Add to `backend/tests/unit/test_amendments.py`.
    - _Requirements: 14.1–14.10_

- [ ] 19. P3 — Multi-Intake Application Rules (Req 15)
  - [x] 19.1 Update DuplicateChecker for multi-intake policy
    - Read `multi_intake_policy` from `SystemSetting` (default: `unrestricted`).
    - When `single_active`: check across all intakes for same program.
    - When `waitlist_cascade`: no change to duplicate checker (cascade is handled by task).
    - _Requirements: 15.1, 15.2_

  - [x] 19.2 Create waitlist cascade task
    - Add `waitlist_cascade_task` to tasks: runs daily 10:00 UTC, finds intakes past `end_date` with waitlisted applications, creates draft applications for next intake pre-populated with student data, notifies students.
    - Register in `CELERY_BEAT_SCHEDULE`.
    - _Requirements: 15.3–15.6_

  - [x] 19.3 Write unit tests for multi-intake rules
    - Test `unrestricted` policy (current behavior preserved).
    - Test `single_active` policy blocks cross-intake duplicates.
    - Test `waitlist_cascade` creates pre-populated drafts.
    - Test cascade does not auto-submit.
    - Test policy change doesn't affect existing apps.
    - Add to `backend/tests/unit/test_multi_intake.py`.
    - _Requirements: 15.1–15.8_

- [x] 20. P3 Checkpoint
  - Run `cd backend && python3 -m pytest` — all tests must pass.
  - Verify schema generation: `cd backend && python3 manage.py spectacular --file /tmp/schema.yaml`.

- [ ] 21. Frontend Integration (Minimal)
  - [x] 21.1 Student dashboard updates
    - Add waitlist position badge when `status === 'waitlisted'` (call `/api/v1/applications/{id}/waitlist-position/`).
    - Add enrollment confirmation button + deadline display when `status === 'approved'` and `enrollment_confirmation_deadline` is set.
    - Add pending conditions list when `status === 'conditionally_approved'`.
    - _Requirements: 3.10, 5.9, 10.9_

  - [x] 21.2 Application status page updates
    - Add withdrawal button with confirmation dialog and reason textarea for statuses `submitted`, `under_review`, `waitlisted`.
    - Add conditions timeline section for `conditionally_approved` status.
    - Add amendment request form for amendable fields.
    - _Requirements: 1.9, 5.9, 14.10_

  - [x] 21.3 Payment step updates
    - Display remaining payment attempts when count < 3.
    - Handle `MAX_PAYMENT_ATTEMPTS_EXCEEDED` error code with user-friendly message.
    - _Requirements: 8.9_

  - [x] 21.4 Admin application detail updates
    - Display assigned reviewer name.
    - Display fee waiver badge with reason.
    - Display document verification age badges (green/yellow/red).
    - Display late submission badge.
    - Display pending amendment requests panel.
    - _Requirements: 6.8, 7.6, 11.8, 12.8, 14.10_

  - [x] 21.5 Admin application list filter updates
    - Add filter options for `assigned_reviewer_id`, `is_late_submission`, `has_pending_amendments`.
    - _Requirements: 11.8_

- [x] 22. Final Verification
  - Run full backend test suite: `cd backend && python3 -m pytest`.
  - Run admissions frontend tests: `cd apps/admissions && bun run test`.
  - Run admissions lint: `cd apps/admissions && bun run lint`.
  - Verify schema generation: `cd backend && python3 manage.py spectacular --file /tmp/schema.yaml`.
  - Verify all new endpoints return `{"success": true, "data": ...}` envelope format.
