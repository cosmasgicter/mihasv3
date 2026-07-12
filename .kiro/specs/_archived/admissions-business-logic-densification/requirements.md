# Requirements: Admissions Business Logic Densification

## Introduction

This specification adds 15 missing business logic domains to the MIHAS admissions system. The current system has a solid foundation — state machine enforcement, payment lifecycle, submission gates, duplicate prevention, eligibility evaluation, and review queue scoring — but lacks the dense edge-case handling that makes a system feel alive and production-worthy.

Each requirement addresses a specific gap identified in the business logic audit. The work is organized into four priority tiers:

- **P0 (Critical):** Application withdrawal, interview scheduling, waitlist automation — these are features real users need immediately.
- **P1 (High):** Application expiry, conditional admission, late applications — these prevent data rot and handle real-world exceptions.
- **P2 (Medium):** Document verification SLA, payment expiry, communication templates — these add operational discipline.
- **P3 (Operational):** Reviewer assignment, fee waivers, batch operation safety, application amendments, academic calendar, multi-intake rules — these round out the system for institutional maturity.

All changes are backend-first. Frontend changes follow only where user-facing flows require them. No new database tables are created unless explicitly stated — prefer adding columns to existing tables and using the existing `managed = False` pattern with SQL migration scripts.

### Cross-Cutting Conventions

- All new status values must be added to `ALLOWED_TRANSITIONS` in `services.py`.
- All new Celery tasks must be registered in `CELERY_BEAT_SCHEDULE` in `backend/config/settings/base.py`.
- All notifications must create both a `Notification` row and an `EmailQueue` row dispatched via `send_email_task`.
- All enrollment count changes must use `IntakeEnforcer` atomic `F()` expressions.
- All new endpoints must follow the `{"success": true, "data": ...}` envelope format.
- All admin-only actions must use the `IsAdmin` permission class.
- All audit-sensitive actions must record `ApplicationStatusHistory` rows with hashed IP and user-agent.

## Glossary

- **Withdrawal**: A student-initiated cancellation of a submitted application, distinct from admin rejection.
- **Late Application**: An application submitted after the intake deadline but within a configurable grace period, subject to a late fee surcharge.
- **Waitlist Position**: A numeric rank assigned to waitlisted applications, used for automatic promotion when capacity opens.
- **Conditional Admission**: An approval with attached conditions (e.g., "submit certified NRC copy by date X") that must be met before enrollment confirmation.
- **SLA (Service Level Agreement)**: A time-bound expectation for admin action (e.g., document verification within 5 business days).
- **Grace Period**: A configurable number of days after an intake deadline during which late applications are still accepted with a surcharge.
- **Fee Waiver**: A full or partial exemption from the application fee, granted by admin with a reason code.
- **Amendment**: A student-initiated change to specific fields of a submitted application, subject to admin approval.
- **Reviewer Assignment**: The allocation of a submitted application to a specific admin reviewer for decision-making.
- **Academic Calendar Event**: A date-bound institutional event (orientation, registration deadline, enrollment confirmation) linked to an intake.

## Requirements

### Requirement 1: Application Withdrawal

**User Story:** As a student, I want to withdraw my submitted application when I no longer wish to proceed, so that I can free up my intake spot and the institution can manage capacity accurately.

#### Acceptance Criteria

1. WHEN a student requests withdrawal of their own Application, THE system SHALL allow withdrawal only from statuses `submitted`, `under_review`, or `waitlisted`.
2. THE `ALLOWED_TRANSITIONS` map SHALL be extended with: `submitted → withdrawn`, `under_review → withdrawn`, `waitlisted → withdrawn`.
3. WHEN an Application transitions to `withdrawn`, THE system SHALL require a `withdrawal_reason` field (free text, 10–500 characters) in the request body.
4. WHEN an Application transitions to `withdrawn`, THE system SHALL atomically decrement the Intake's `current_enrollment` via `IntakeEnforcer.decrement_enrollment()`.
5. WHEN an Application transitions to `withdrawn`, THE system SHALL record the withdrawal in `ApplicationStatusHistory` with the reason, hashed IP, and user-agent.
6. WHEN an Application transitions to `withdrawn`, THE system SHALL create a `Notification` for the student confirming the withdrawal and dispatch a confirmation email via `EmailQueue`.
7. THE `withdrawn` status SHALL be terminal — no further transitions SHALL be allowed from `withdrawn`.
8. WHEN a student withdraws, THE system SHALL check if any waitlisted applications for the same intake should be promoted (see Requirement 3).
9. A new endpoint `POST /api/v1/applications/{id}/withdraw/` SHALL be created, accessible to the application owner only (not admin — admin uses the review endpoint for rejection).
10. THE withdrawal endpoint SHALL support idempotency via the existing `IdempotencyKey` mechanism.
11. WHEN a student has already withdrawn an application for a program+intake, THE `DuplicateChecker` SHALL treat `withdrawn` as a terminal status, allowing the student to create a new application for the same program+intake.

### Requirement 2: Interview Scheduling with Business Rules

**User Story:** As an admin, I want interview scheduling to enforce conflict detection, minimum notice, and automatic notifications, so that interviews are operationally sound and students are properly informed.

#### Acceptance Criteria

1. WHEN an admin schedules an interview, THE system SHALL reject the request if the Application status is not in `submitted`, `under_review`, or `waitlisted`.
2. WHEN an admin schedules an interview, THE system SHALL enforce a minimum notice period of 48 hours — the `scheduled_at` must be at least 48 hours in the future.
3. WHEN an admin schedules an interview, THE system SHALL check for time conflicts: no other interview for the same Application within a 2-hour window of the proposed time.
4. WHEN an admin schedules an interview, THE system SHALL check for interviewer conflicts: if a `created_by` admin has another interview scheduled within a 1-hour window, return a warning (not a block) with the conflicting interview details.
5. WHEN an interview is successfully created, THE system SHALL create a `Notification` for the student with interview details (date, time, mode, location/link) and dispatch a notification email via `EmailQueue`.
6. WHEN an interview is rescheduled (status changed to `rescheduled`), THE system SHALL create a new `Notification` and email with updated details and the reason for rescheduling.
7. WHEN an interview is cancelled, THE system SHALL require a `cancellation_reason` field and notify the student.
8. WHEN an interview's `scheduled_at` time has passed and the status is still `scheduled`, a Celery periodic task SHALL automatically transition the interview status to `completed` (admin can override).
9. THE interview serializer SHALL validate that `mode` is one of: `virtual`, `phone`, `in_person`.
10. WHEN `mode` is `virtual`, THE system SHALL require either a `location` field containing a valid URL or a meeting link in the `notes` field.
11. WHEN an interview is created for an Application in `submitted` status, THE system SHALL automatically transition the Application to `under_review` if it is not already.
12. A new Celery periodic task `interview_reminder_task` SHALL run every hour and send reminder notifications to students with interviews scheduled within the next 24 hours (one reminder per interview, tracked via a `reminder_sent` flag or notification deduplication).

### Requirement 3: Waitlist Position Tracking and Auto-Promotion

**User Story:** As a student on the waitlist, I want to know my position and be automatically promoted when a spot opens, so that I don't miss my chance at admission.

#### Acceptance Criteria

1. WHEN an Application transitions to `waitlisted`, THE system SHALL assign a `waitlist_position` based on the count of existing waitlisted applications for the same program+intake, plus one.
2. THE `waitlist_position` SHALL be stored on the Application record (new column `waitlist_position` INTEGER NULL on the `applications` table).
3. WHEN a spot opens (an application is withdrawn, rejected, or an approved student doesn't confirm enrollment), THE system SHALL identify the waitlisted application with the lowest `waitlist_position` for that program+intake.
4. WHEN a waitlisted application is eligible for promotion, THE system SHALL automatically transition it to `approved` via `transition_application_status()` with `changed_by` set to `system` and notes indicating auto-promotion.
5. WHEN a waitlisted application is promoted, THE system SHALL send a notification and email to the student informing them of their acceptance.
6. WHEN a waitlisted application is promoted, ALL remaining waitlisted applications for the same program+intake SHALL have their `waitlist_position` decremented by 1.
7. THE waitlist auto-promotion SHALL be triggered by: (a) withdrawal via Requirement 1, (b) rejection via the review endpoint, (c) enrollment confirmation expiry via Requirement 10.
8. WHEN an admin manually approves a waitlisted application (bypassing auto-promotion order), THE system SHALL log a `WAITLIST_ORDER_OVERRIDE` entry in `ApplicationStatusHistory`.
9. A new endpoint `GET /api/v1/applications/{id}/waitlist-position/` SHALL return the current position and total waitlist size for the student's application.
10. THE student dashboard SHALL display waitlist position when the application status is `waitlisted`.

### Requirement 4: Application and Draft Expiry

**User Story:** As a system administrator, I want stale drafts and unactioned applications to be automatically flagged and eventually archived, so that the system stays clean and students are reminded to complete their work.

#### Acceptance Criteria

1. A new Celery periodic task `draft_expiry_reminder_task` SHALL run daily at 06:00 UTC and identify draft Applications with no updates (`updated_at`) in the last 7 days.
2. FOR each stale draft identified, THE task SHALL create a `Notification` and dispatch an email reminding the student to complete their application, including a direct link to resume.
3. WHEN a draft Application has had no updates for 30 days, THE task SHALL transition the Application to a new status `expired` and notify the student that their draft has expired.
4. THE `expired` status SHALL be terminal — the student must create a new application if they wish to reapply.
5. WHEN a draft expires, THE system SHALL NOT decrement enrollment counts (drafts don't count toward enrollment).
6. A new Celery periodic task `review_sla_reminder_task` SHALL run daily at 07:00 UTC and identify submitted Applications that have been in `submitted` or `under_review` status for more than 5 business days without a decision.
7. FOR each SLA-breaching application, THE task SHALL create a `Notification` for all admin users with a summary of overdue applications.
8. THE SLA threshold SHALL be configurable via the `SystemSetting` model (key: `review_sla_days`, default: 5).
9. WHEN a student's draft is within 3 days of expiry (day 27–30), THE reminder SHALL include an urgency indicator: "Your draft will expire in X days."
10. THE `ALLOWED_TRANSITIONS` map SHALL be extended with: `draft → expired`.
11. Expired applications SHALL be excluded from duplicate checks — a student can create a new application for the same program+intake after expiry.

### Requirement 5: Conditional Admission

**User Story:** As an admin, I want to approve an application with conditions attached, so that the student knows exactly what they must provide and by when to confirm their enrollment.

#### Acceptance Criteria

1. THE `ALLOWED_TRANSITIONS` map SHALL be extended with: `under_review → conditionally_approved`, `waitlisted → conditionally_approved`.
2. WHEN an admin transitions an Application to `conditionally_approved`, THE request body SHALL include a `conditions` array, where each condition has: `description` (string, required), `deadline` (date, required), and `condition_type` (enum: `document`, `payment`, `academic`, `other`).
3. THE conditions SHALL be stored in a new `application_conditions` table with columns: `id` (UUID), `application_id` (FK), `description`, `condition_type`, `deadline`, `status` (enum: `pending`, `met`, `waived`, `expired`), `met_at` (timestamp null), `verified_by` (FK null), `created_at`, `updated_at`.
4. WHEN an Application transitions to `conditionally_approved`, THE system SHALL notify the student with the full list of conditions and their deadlines.
5. WHEN a student uploads a document or an admin verifies a condition, THE system SHALL check if all conditions for the Application are `met` or `waived`. IF so, THE system SHALL automatically transition the Application to `approved`.
6. A new Celery periodic task `condition_expiry_task` SHALL run daily at 05:00 UTC and identify conditions past their deadline with status `pending`.
7. WHEN a condition expires, THE task SHALL transition the condition status to `expired` and notify the student.
8. WHEN ALL conditions for an Application have a terminal status (`met`, `waived`, or `expired`) and at least one is `expired`, THE system SHALL transition the Application to `rejected` with notes indicating which conditions were not met.
9. A new endpoint `GET /api/v1/applications/{id}/conditions/` SHALL return the list of conditions for the student's application.
10. A new endpoint `POST /api/v1/applications/{id}/conditions/{condition_id}/verify/` SHALL allow an admin to mark a condition as `met` or `waived`.
11. THE `conditionally_approved` status SHALL also allow transition to `rejected` (admin can reject outright) and `withdrawn` (student can withdraw).

### Requirement 6: Late Application Handling

**User Story:** As a student, I want to submit a late application within a grace period after the deadline, so that I still have a chance at admission even if I missed the original deadline.

#### Acceptance Criteria

1. THE `Intake` model SHALL support a new column `grace_period_days` (INTEGER NULL, default NULL — no grace period).
2. WHEN a student submits an Application and the intake deadline has passed, THE `IntakeEnforcer.check_submission()` SHALL check if the current date is within the grace period (`application_deadline + grace_period_days`).
3. IF the submission is within the grace period, THE system SHALL allow submission but flag the Application with `is_late_submission = true` (new boolean column on `applications` table, default false).
4. IF the submission is past both the deadline and the grace period, THE system SHALL reject with `INTAKE_DEADLINE_PASSED` as before.
5. WHEN a late application is submitted, THE system SHALL resolve a late fee surcharge via `FeeResolver` — a new `fee_type` of `late_application` in the `program_fees` table.
6. IF a late fee is configured, THE system SHALL require the late fee to be paid before the late application can be submitted. THE `submit_application()` service SHALL check for both the regular application fee payment AND the late fee payment.
7. WHEN a late application is submitted, THE system SHALL include `is_late_submission: true` and `late_fee_amount` in the submission response.
8. THE admin review queue SHALL display a `LATE` badge for late applications.
9. AN admin SHALL be able to waive the late fee requirement via the review endpoint with `force=true` and a reason.
10. THE analytics service SHALL track late application counts separately.

### Requirement 7: Document Verification SLA and Escalation

**User Story:** As a system administrator, I want document verification to have time-bound expectations and automatic escalation, so that students aren't left waiting indefinitely.

#### Acceptance Criteria

1. WHEN a document is uploaded with status `pending`, THE system SHALL record the `uploaded_at` timestamp (already exists as `created_at` on `ApplicationDocument`).
2. A new Celery periodic task `document_verification_sla_task` SHALL run daily at 08:00 UTC and identify documents in `pending` status for more than the SLA threshold.
3. THE SLA threshold SHALL be configurable via `SystemSetting` (key: `document_verification_sla_days`, default: 5).
4. WHEN a document exceeds the SLA threshold, THE task SHALL create a `Notification` for all admin users listing documents awaiting verification with age in days.
5. WHEN a document exceeds 2x the SLA threshold (default: 10 days), THE task SHALL escalate by sending an alert email to the `ERROR_ALERT_EMAIL` recipient with the subject "ESCALATION: Documents pending verification for {X} days".
6. THE admin application detail view SHALL display a visual indicator (age badge) for documents pending verification, colored by urgency: green (< 3 days), yellow (3–5 days), red (> 5 days).
7. WHEN an admin verifies or rejects a document, THE system SHALL record `verified_at` timestamp and `verified_by` admin ID on the document record.
8. THE analytics service SHALL track average document verification time and SLA compliance rate.

### Requirement 8: Payment Expiry and Retry Limits

**User Story:** As a system administrator, I want pending payments to expire after a reasonable time and students to have a limited number of retries, so that the payment pipeline stays clean.

#### Acceptance Criteria

1. WHEN a payment has been in `pending` status for more than 24 hours, THE `poll_pending_payments_task` SHALL transition it to `expired` (new payment status).
2. THE `expired` payment status SHALL be terminal — it cannot transition to `successful`.
3. WHEN a payment expires, THE system SHALL notify the student that their payment has expired and they need to initiate a new payment.
4. THE system SHALL enforce a maximum of 5 payment attempts per Application. WHEN a student initiates a 6th payment, THE `PaymentService.initiate_payment()` SHALL return error code `MAX_PAYMENT_ATTEMPTS_EXCEEDED`.
5. THE payment attempt count SHALL be computed from the `payments` table (count of payment records for the application, excluding `expired` records older than 7 days).
6. WHEN a payment fails, THE system SHALL include the remaining attempt count in the error response: `"remaining_attempts": N`.
7. AN admin SHALL be able to reset the payment attempt count via the review endpoint (effectively by force-approving the payment).
8. THE `PaymentService` forward-only status transitions SHALL be extended: `pending → expired` is valid; `expired → successful` is NOT valid.
9. THE frontend payment step SHALL display the remaining attempt count when below 3.

### Requirement 9: Communication Templates

**User Story:** As a system administrator, I want email and notification content to use configurable templates with variable substitution, so that communications are consistent, professional, and maintainable.

#### Acceptance Criteria

1. A new `communication_templates` table SHALL be created with columns: `id` (UUID), `template_key` (unique string), `subject_template` (text), `body_template` (text), `channel` (enum: `email`, `notification`, `both`), `is_active` (boolean), `created_at`, `updated_at`.
2. THE template engine SHALL support variable substitution using `{{variable}}` syntax with the following standard variables: `{{student_name}}`, `{{application_number}}`, `{{program_name}}`, `{{intake_name}}`, `{{status}}`, `{{tracking_code}}`, `{{admin_feedback}}`, `{{deadline_date}}`, `{{portal_url}}`.
3. THE following template keys SHALL be seeded: `application_approved`, `application_rejected`, `application_withdrawn_confirmation`, `interview_scheduled`, `interview_rescheduled`, `interview_cancelled`, `interview_reminder`, `payment_failed`, `payment_expired`, `draft_expiry_reminder`, `draft_expired`, `waitlist_promoted`, `condition_assigned`, `condition_expiry_warning`, `condition_expired`, `late_application_accepted`, `document_verification_needed`, `review_sla_breach`.
4. WHEN a notification or email is dispatched, THE system SHALL look up the template by key, substitute variables from the Application context, and use the rendered content.
5. IF a template is not found or is inactive, THE system SHALL fall back to a hardcoded default message (backward compatibility with existing email strings).
6. A new admin endpoint `GET /api/v1/admin/templates/` SHALL list all templates. `PUT /api/v1/admin/templates/{key}/` SHALL allow editing template content.
7. THE template rendering SHALL sanitize all variable values to prevent HTML injection in email bodies.
8. ALL existing hardcoded email strings in `ApplicationReviewView` SHALL be migrated to use the template system.

### Requirement 10: Academic Calendar and Enrollment Confirmation

**User Story:** As a system administrator, I want approved students to confirm their enrollment by a deadline, so that unconfirmed spots can be released to waitlisted students.

#### Acceptance Criteria

1. THE `ALLOWED_TRANSITIONS` map SHALL be extended with: `approved → enrolled`, `approved → enrollment_expired`, `conditionally_approved → enrolled`, `conditionally_approved → enrollment_expired`.
2. A new `academic_calendar_events` table SHALL be created with columns: `id` (UUID), `intake_id` (FK), `event_type` (enum: `enrollment_confirmation_deadline`, `orientation`, `registration_deadline`, `classes_start`), `event_date` (date), `description` (text null), `created_at`.
3. WHEN an Application transitions to `approved`, THE system SHALL notify the student of the enrollment confirmation deadline (sourced from the `academic_calendar_events` table for the Application's intake, event_type `enrollment_confirmation_deadline`).
4. IF no enrollment confirmation deadline is configured for the intake, THE system SHALL use a default of 14 days from the approval date.
5. A new endpoint `POST /api/v1/applications/{id}/confirm-enrollment/` SHALL allow the student to confirm enrollment, transitioning the Application to `enrolled`.
6. A new Celery periodic task `enrollment_confirmation_expiry_task` SHALL run daily at 09:00 UTC and identify approved Applications past their enrollment confirmation deadline.
7. WHEN an enrollment confirmation expires, THE task SHALL transition the Application to `enrollment_expired`, notify the student, and trigger waitlist auto-promotion (Requirement 3).
8. WHEN an Application transitions to `enrollment_expired`, THE system SHALL decrement the Intake's `current_enrollment` via `IntakeEnforcer.decrement_enrollment()`.
9. THE student dashboard SHALL display the enrollment confirmation deadline and a "Confirm Enrollment" button for approved applications.
10. A reminder notification SHALL be sent 3 days before the enrollment confirmation deadline.

### Requirement 11: Reviewer Assignment and Workload Balancing

**User Story:** As a system administrator, I want to assign applications to specific reviewers with workload awareness, so that reviews are distributed fairly and expertise is matched.

#### Acceptance Criteria

1. THE `Application` model SHALL support a new column `assigned_reviewer_id` (UUID FK NULL to `profiles` table).
2. A new endpoint `POST /api/v1/applications/{id}/assign/` SHALL allow a super_admin to assign an application to a specific reviewer.
3. WHEN an application is assigned, THE system SHALL create a `Notification` for the assigned reviewer.
4. THE assignment endpoint SHALL validate that the target reviewer has role `admin` or `reviewer`.
5. A new endpoint `POST /api/v1/applications/auto-assign/` SHALL automatically assign unassigned submitted applications using round-robin distribution among active reviewers.
6. THE auto-assign logic SHALL respect a configurable maximum workload per reviewer (key: `max_reviewer_workload`, default: 20 active applications).
7. WHEN a reviewer's workload reaches the maximum, THE auto-assign SHALL skip that reviewer until their workload decreases.
8. THE admin application list SHALL support filtering by `assigned_reviewer_id`.
9. THE review queue priority scorer SHALL add a 5% bonus to the priority score for applications that have been assigned but not yet reviewed (incentivize assigned work).
10. WHEN an application is reassigned, THE system SHALL record the reassignment in `ApplicationStatusHistory` with the old and new reviewer IDs.

### Requirement 12: Fee Waiver and Discount Logic

**User Story:** As an admin, I want to grant fee waivers or discounts to eligible students, so that financial barriers don't prevent qualified applicants from applying.

#### Acceptance Criteria

1. A new `fee_waivers` table SHALL be created with columns: `id` (UUID), `application_id` (FK), `waiver_type` (enum: `full`, `partial`, `scholarship`), `reason_code` (enum: `staff_child`, `returning_student`, `orphan`, `scholarship`, `financial_hardship`, `admin_discretion`), `discount_percentage` (integer 0–100), `approved_by` (FK), `notes` (text null), `created_at`.
2. A new endpoint `POST /api/v1/applications/{id}/fee-waiver/` SHALL allow an admin to create a fee waiver for an application.
3. WHEN a full waiver (`waiver_type=full`) is granted, THE system SHALL set the Application's `payment_status` to `force_approved` with notes indicating the waiver.
4. WHEN a partial waiver is granted, THE `FeeResolver` SHALL compute the discounted fee: `original_fee * (1 - discount_percentage / 100)`.
5. WHEN a student initiates payment for an application with a partial waiver, THE `PaymentService.initiate_payment()` SHALL use the discounted fee amount.
6. THE fee waiver SHALL be recorded in `ApplicationStatusHistory` for audit purposes.
7. ONLY users with `super_admin` role SHALL be able to grant fee waivers.
8. THE admin application detail view SHALL display any active fee waiver with its reason and discount.
9. A student SHALL NOT be able to request a fee waiver — it must be admin-initiated.
10. THE analytics service SHALL track fee waiver counts by reason code.

### Requirement 13: Batch Operation Safety

**User Story:** As an admin, I want batch status changes to have safety guardrails, so that I don't accidentally reject 50 applications with one click.

#### Acceptance Criteria

1. THE `ApplicationBulkStatusView` SHALL enforce a maximum batch size of 25 applications per request.
2. WHEN a batch request exceeds 25 applications, THE system SHALL return error code `BATCH_SIZE_EXCEEDED` with the limit in the response.
3. THE batch endpoint SHALL validate that ALL applications in the batch are eligible for the requested transition BEFORE applying any changes (all-or-nothing semantics).
4. IF any application in the batch fails validation, THE system SHALL return the full list of failures with application IDs and error codes, and SHALL NOT apply the transition to any application.
5. THE batch endpoint SHALL require a `confirmation_token` field — a SHA-256 hash of the sorted application IDs concatenated with the target status. This forces the frontend to compute and confirm the exact operation.
6. THE batch endpoint SHALL record a single `ApplicationStatusHistory` entry per application (not one bulk entry).
7. THE batch endpoint SHALL process transitions within a single database transaction.
8. WHEN a batch rejection is performed, THE system SHALL trigger waitlist auto-promotion checks for affected intakes.
9. THE batch endpoint SHALL return a summary: `{"processed": N, "status": "new_status", "application_ids": [...]}`.

### Requirement 14: Application Amendment After Submission

**User Story:** As a student, I want to request changes to specific fields of my submitted application without restarting the entire process, so that I can correct mistakes or provide updated information.

#### Acceptance Criteria

1. A new `application_amendments` table SHALL be created with columns: `id` (UUID), `application_id` (FK), `field_name` (string), `old_value` (text), `new_value` (text), `reason` (text), `status` (enum: `pending`, `approved`, `rejected`), `reviewed_by` (FK null), `reviewed_at` (timestamp null), `created_at`.
2. A new endpoint `POST /api/v1/applications/{id}/amendments/` SHALL allow a student to request amendments to their submitted application.
3. THE amendment endpoint SHALL only allow amendments for Applications in `submitted`, `under_review`, or `waitlisted` status.
4. THE amendable fields SHALL be limited to: `phone`, `email`, `address_line_1`, `address_line_2`, `residence_town`, `next_of_kin_name`, `next_of_kin_phone`.
5. FIELDS that affect eligibility or program selection (`program`, `intake`, `institution`, `date_of_birth`, `nrc_number`, `full_name`) SHALL NOT be amendable — the student must withdraw and reapply.
6. WHEN an amendment is requested, THE system SHALL create a `Notification` for admin reviewers.
7. A new endpoint `POST /api/v1/applications/{id}/amendments/{amendment_id}/review/` SHALL allow an admin to approve or reject the amendment.
8. WHEN an amendment is approved, THE system SHALL apply the field change to the Application record and record the change in `ApplicationStatusHistory`.
9. A student SHALL have a maximum of 3 pending amendments per application at any time.
10. THE student application status page SHALL display pending and resolved amendments.

### Requirement 15: Multi-Intake Application Rules

**User Story:** As a system administrator, I want to control how students can apply across multiple intakes for the same program, so that the waitlist and capacity management work correctly.

#### Acceptance Criteria

1. A new `SystemSetting` key `multi_intake_policy` SHALL control the policy with values: `unrestricted` (default — current behavior), `single_active` (only one active application per program across all intakes), `waitlist_cascade` (waitlisted students are automatically considered for the next intake).
2. WHEN `multi_intake_policy` is `single_active`, THE `DuplicateChecker.check_at_create()` SHALL check for non-terminal applications across ALL intakes for the same program (not just the target intake).
3. WHEN `multi_intake_policy` is `waitlist_cascade`, AND a student is waitlisted for intake A, AND intake A closes without promoting them, THE system SHALL automatically create a draft application for the next available intake (intake B) for the same program, pre-populated with the student's data from the waitlisted application.
4. THE waitlist cascade SHALL notify the student: "Your application for {program} ({intake_A}) was not promoted. We've carried your application forward to {intake_B}. Please review and submit."
5. THE waitlist cascade SHALL be triggered by a new Celery task `waitlist_cascade_task` that runs when an intake's `end_date` passes.
6. THE cascade SHALL NOT auto-submit — the student must review and explicitly submit the new application (and pay any new fees if the fee has changed).
7. THE admin settings page SHALL expose the `multi_intake_policy` setting.
8. WHEN the policy changes, existing applications SHALL NOT be retroactively affected — the new policy applies only to new application creation.
