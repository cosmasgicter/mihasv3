# Requirements Document

## Introduction

This specification systematically resolves all 12 business logic issues identified in the admissions audit (`docs/reports/ADMISSIONS_BUSINESS_LOGIC_AUDIT.md`) and confirmed by the evaluation (`docs/reports/ADMISSIONS_AUDIT_EVALUATION.md`). The work is organized into four priority tiers (P0–P3) covering identifier canonicalization, state machine hardening, backend rule enforcement, draft consolidation, payment vocabulary unification, document intelligence activation, notification automation, review queue intelligence, and analytics activation.

The goal is to make every core business rule canonical, explainable, and enforceable in one place — backend-first — so that the frontend becomes a guide rather than the final authority.

## Glossary

- **Application**: A student admissions application record in the `applications` table.
- **Program**: An academic program in the `programs` table, identified by a unique `code` (e.g. "DRN") and a human-readable `name` (e.g. "Diploma in Registered Nursing").
- **Institution**: A training institution in the `institutions` table, identified by a unique `code` (e.g. "KATC") and a `name`.
- **Intake**: An admissions intake period in the `intakes` table, with `application_deadline`, `max_capacity`, and `current_enrollment` fields.
- **ProgramIntake**: A join record in `program_intakes` linking a Program to an Intake, with optional per-program capacity.
- **FeeResolver**: The backend service (`fee_resolver.py`) that resolves application fees by program code and residency classification.
- **PaymentService**: The backend service (`payment_service.py`) managing the Lenco payment lifecycle.
- **State_Machine**: The `ALLOWED_TRANSITIONS` map and `transition_application_status()` function in `services.py` that enforce valid application status changes.
- **CourseRequirement**: A row in the `course_requirements` table specifying a mandatory or optional subject and minimum grade for a Program.
- **Eligibility_Engine**: The backend rules engine that evaluates student grades against CourseRequirement data to produce explainable eligibility assessments.
- **Draft_Authority**: The single canonical source of truth for in-progress application data (the `ApplicationDraft` model backed by the `application_drafts` table).
- **Canonical_Payment_Status**: The unified payment state vocabulary used consistently across `applications.payment_status` and `payments.status`.
- **Completeness_Score**: A numeric score (0–100) representing how complete an application is based on required fields, documents, grades, and payment.
- **Review_Queue**: The admin-facing prioritized list of applications awaiting review decisions.
- **SSE_Event_Dispatcher**: The existing `dispatch_event()` function in `event_dispatcher.py` that creates SSE event rows for realtime notifications.
- **PATCH_Endpoint**: The `ApplicationDetailView` PATCH handler that currently allows partial updates via the `ApplicationSerializer`.
- **Explainable_Rule_Result**: A structured response `{rule_code, severity, result, message, blocking, source, recommended_action}` produced by any business rule evaluation.

## Requirements

### Requirement 1: FeeResolver Program Code Resolution

**User Story:** As a student, I want payment initiation to correctly resolve my application fee, so that I can pay the right amount without encountering errors.

#### Acceptance Criteria

1. WHEN `PaymentService.initiate_payment()` resolves the fee for an Application, THE PaymentService SHALL look up the Program by name from the Application record and pass the Program's `code` to `FeeResolver.resolve_fee()`.
2. WHEN the Application's `program` field contains a program name that matches a Program record, THE FeeResolver SHALL resolve the fee using the matched Program's `code`.
3. IF the Application's `program` field does not match any active Program by name, THEN THE PaymentService SHALL return a descriptive error indicating the program could not be resolved.
4. THE FeeResolver SHALL continue to accept a `program_code` parameter and resolve fees via `Program.objects.get(code=program_code)` without changes to its internal interface.
5. FOR ALL Applications with a valid program name, initiating payment then resolving the fee SHALL produce the same ResolvedFee as calling `FeeResolver.resolve_fee()` directly with the corresponding program code (round-trip consistency).

### Requirement 2: Institution Identifier Canonicalization

**User Story:** As a system administrator, I want institution references in applications to resolve consistently, so that program-intake validation and reporting work correctly regardless of whether the stored value is a code or a name.

#### Acceptance Criteria

1. WHEN an Application is created or updated with an `institution` value, THE ApplicationSerializer SHALL resolve the Institution by trying `code` first, then `name`, and store the canonical `Institution.name` in the Application record.
2. WHEN `validate_program_intake_compatibility()` resolves a Program, THE Validator SHALL look up the Program by trying `name` first, then `code`, to handle both identifier forms.
3. WHEN `validate_program_intake_compatibility()` resolves an Intake, THE Validator SHALL look up the Intake by trying `name` first, then `code`.
4. IF an institution value matches neither a code nor a name of any active Institution, THEN THE ApplicationSerializer SHALL return a validation error with code `INVALID_INSTITUTION`.
5. FOR ALL institution values stored in existing Application records, the resolution logic SHALL produce a valid Institution match for every value that corresponds to a real institution (backward compatibility).

### Requirement 3: PATCH Endpoint State Machine Enforcement

**User Story:** As a system administrator, I want the generic application update endpoint to prevent direct mutation of lifecycle fields, so that all status changes flow through the state machine.

#### Acceptance Criteria

1. WHILE an Application has `status` equal to `draft`, THE PATCH_Endpoint SHALL allow updates only to draft-safe fields: `full_name`, `nrc_number`, `passport_number`, `date_of_birth`, `sex`, `phone`, `email`, `residence_town`, `nationality`, `country`, `address_line_1`, `address_line_2`, `postal_code`, `next_of_kin_name`, `next_of_kin_phone`, `program`, `intake`, `institution`, `additional_subjects`, `result_slip_url`, `extra_kyc_url`.
2. WHEN a PATCH request includes `status`, `payment_status`, `eligibility_status`, `eligibility_score`, `eligibility_notes`, `review_started_at`, `decision_date`, `reviewed_by`, `admin_feedback`, `admin_feedback_date`, or `admin_feedback_by`, THE PATCH_Endpoint SHALL silently strip those fields from the update for student-role users.
3. WHILE an Application has `status` not equal to `draft`, THE PATCH_Endpoint SHALL reject the update with error code `APPLICATION_NOT_EDITABLE` for student-role users.
4. WHEN an admin-role user sends a PATCH request, THE PATCH_Endpoint SHALL allow updates to draft-safe fields regardless of application status, but SHALL still strip `status` from the writable fields (status changes require the review endpoint).
5. THE State_Machine `transition_application_status()` SHALL remain the only code path that mutates `Application.status`.

### Requirement 4: Backend Duplicate Application Prevention

**User Story:** As a student, I want the system to prevent me from creating duplicate applications for the same program and intake, so that I do not accidentally submit multiple applications.

#### Acceptance Criteria

1. WHEN a student creates a new Application, THE ApplicationListCreateView SHALL check for existing Applications by the same user for the same program and intake with status in `{draft, submitted, under_review, approved, waitlisted}`.
2. IF a non-terminal duplicate Application exists, THEN THE ApplicationListCreateView SHALL return error code `DUPLICATE_APPLICATION` with the existing application's ID and status in the response.
3. WHEN a student submits an Application via `submit_application()`, THE submission service SHALL verify no other Application by the same user for the same program and intake has status in `{submitted, under_review, approved, waitlisted}`.
4. IF a submitted duplicate exists at submission time, THEN THE submission service SHALL raise `ApplicationSubmissionError` with code `DUPLICATE_SUBMITTED_APPLICATION`.
5. THE duplicate check SHALL compare program and intake values using the same canonical resolution as Requirement 2 (name-based matching with code fallback).
6. WHEN a duplicate draft exists, THE response SHALL include a `resume_url` field pointing to the existing draft, enabling the frontend to offer a "resume existing application" flow.

### Requirement 5: Backend Eligibility Engine

**User Story:** As a student, I want the system to evaluate my academic qualifications against program requirements using real data, so that I receive accurate and explainable eligibility guidance.

#### Acceptance Criteria

1. THE Eligibility_Engine SHALL read CourseRequirement records from the `course_requirements` table for the target Program to determine required subjects, minimum grades, mandatory flags, and weights.
2. WHEN a student's grades are submitted for an Application, THE Eligibility_Engine SHALL evaluate each CourseRequirement against the student's `ApplicationGrade` records and produce an Explainable_Rule_Result for each requirement.
3. THE Eligibility_Engine SHALL compute an overall eligibility score (0–100) as a weighted sum of individual requirement scores, using the `weight` field from CourseRequirement records.
4. WHEN a student meets all mandatory CourseRequirements, THE Eligibility_Engine SHALL set `eligibility_status` to `eligible`.
5. WHEN a student fails one or more mandatory CourseRequirements, THE Eligibility_Engine SHALL set `eligibility_status` to `not_eligible` and include each failed requirement in the `missing_requirements` list with severity, description, and suggestion.
6. WHEN a student meets mandatory requirements but fails optional ones, THE Eligibility_Engine SHALL set `eligibility_status` to `conditional` with recommendations for improvement.
7. THE Eligibility_Engine SHALL remain advisory — eligibility status SHALL NOT block application submission.
8. FOR ALL sets of grades and CourseRequirements, evaluating eligibility then re-evaluating with the same inputs SHALL produce identical results (determinism / idempotence).
9. WHEN a Program has no CourseRequirement records, THE Eligibility_Engine SHALL return `eligibility_status` of `under_review` with a recommendation to consult the institution.

### Requirement 6: Intake Deadline and Capacity Enforcement

**User Story:** As a system administrator, I want the system to enforce intake deadlines and capacity limits, so that applications are not accepted past deadlines or beyond available seats.

#### Acceptance Criteria

1. WHEN a student submits an Application via `submit_application()`, THE submission service SHALL verify that the current date is on or before the Intake's `application_deadline`.
2. IF the current date is past the Intake's `application_deadline`, THEN THE submission service SHALL raise `ApplicationSubmissionError` with code `INTAKE_DEADLINE_PASSED` and include the deadline date in the error message.
3. WHEN a student submits an Application, THE submission service SHALL verify that the Intake's `current_enrollment` is less than `max_capacity` (when `max_capacity` is not null).
4. IF the Intake's `current_enrollment` has reached `max_capacity`, THEN THE submission service SHALL raise `ApplicationSubmissionError` with code `INTAKE_CAPACITY_REACHED`.
5. WHEN an Application is successfully submitted, THE submission service SHALL atomically increment the Intake's `current_enrollment` by 1 using `F()` expressions within the same transaction.
6. WHEN an Intake has a null `application_deadline`, THE submission service SHALL skip deadline enforcement for that Intake.
7. WHEN an Intake has a null `max_capacity`, THE submission service SHALL skip capacity enforcement for that Intake.
8. WHEN a student creates a new draft Application, THE ApplicationListCreateView SHALL warn (but not block) if the Intake deadline has passed or capacity is near (above 90%).


### Requirement 7: Draft Ownership Consolidation

**User Story:** As a student, I want a single reliable source of truth for my in-progress application data, so that I never lose work and never see conflicting draft states.

#### Acceptance Criteria

1. THE Draft_Authority for in-progress application data SHALL be the `ApplicationDraft` model (server-side `application_drafts` table), linked to the user and optionally to an Application record.
2. WHEN the frontend saves draft data, THE frontend SHALL write to the server-side Draft_Authority via the existing draft API endpoint as the primary save target.
3. WHEN the frontend saves draft data, THE frontend SHALL also write to `localStorage` as a resilience cache, but SHALL treat `localStorage` as secondary to the server-side Draft_Authority.
4. WHEN the frontend loads draft data, THE frontend SHALL fetch from the server-side Draft_Authority first; IF the server is unreachable, THEN THE frontend SHALL fall back to `localStorage`.
5. WHEN a conflict exists between server-side and local draft data, THE frontend SHALL prefer the record with the more recent `updated_at` timestamp.
6. THE frontend SHALL remove `sessionStorage` as a draft storage location — only `localStorage` (as cache) and the server-side Draft_Authority SHALL persist draft data.
7. WHEN an Application transitions from `draft` to `submitted`, THE Draft_Authority SHALL mark the associated ApplicationDraft as `is_active = false`.
8. THE frontend `DraftManager` SHALL be simplified to delegate to the server-side Draft_Authority for all create, read, update, and delete operations, using `localStorage` only for offline resilience.

### Requirement 8: Payment State Vocabulary Unification

**User Story:** As a system administrator, I want a single canonical payment state model, so that payment status is consistent across the application record, payment records, and frontend display.

#### Acceptance Criteria

1. THE Canonical_Payment_Status vocabulary SHALL be: `not_paid`, `pending`, `successful`, `failed`, `verified`, `rejected`, `force_approved`.
2. WHEN `PaymentService` transitions a Payment to `successful`, THE PaymentService SHALL set the associated Application's `payment_status` to `verified` (not `paid`).
3. WHEN `PaymentService` transitions a Payment to `failed`, THE PaymentService SHALL set the associated Application's `payment_status` to `failed`.
4. WHEN an admin force-approves a payment via the review endpoint, THE review endpoint SHALL set `payment_status` to `force_approved`.
5. THE frontend `normalizePaymentStatus()` function SHALL map the Canonical_Payment_Status values as follows: `verified` and `force_approved` map to `verified`; `pending` maps to `pending_review`; `failed` and `rejected` map to `rejected`; `not_paid` and null map to `not_paid`.
6. THE `submit_application()` service SHALL accept `payment_status` values `verified`, `paid`, and `force_approved` as valid payment confirmation (in addition to checking the `payments` table for a `successful` record).
7. FOR ALL payment state transitions, the Application's `payment_status` and the Payment's `status` SHALL be updated within the same database transaction to prevent inconsistency.

### Requirement 9: Document Intelligence Activation

**User Story:** As an admin reviewer, I want the system to use extracted document text for completeness scoring and identity consistency checks, so that I can review applications more efficiently.

#### Acceptance Criteria

1. WHEN an ApplicationDocument has a non-empty `extracted_text` field, THE Document_Intelligence service SHALL parse the extracted text to identify key fields: full name, NRC number, date of birth, and institution name.
2. WHEN identity fields are extracted from a document, THE Document_Intelligence service SHALL compare them against the Application's corresponding fields and produce a consistency score (0–100).
3. IF the extracted name differs significantly from the Application's `full_name` (fuzzy match score below 80%), THEN THE Document_Intelligence service SHALL flag the document with a `name_mismatch` warning.
4. IF the extracted NRC number differs from the Application's `nrc_number`, THEN THE Document_Intelligence service SHALL flag the document with an `nrc_mismatch` warning.
5. THE Document_Intelligence service SHALL compute a Completeness_Score for each Application based on: required documents uploaded (weighted 40%), identity consistency (weighted 30%), and grade data completeness (weighted 30%).
6. THE Completeness_Score SHALL be stored on the Application record in the `eligibility_score` field (repurposed) or a new annotation, and SHALL be recalculated when documents or grades change.
7. WHEN a document has an empty `extracted_text` field, THE Document_Intelligence service SHALL skip identity checks for that document and reduce the consistency weight proportionally.

### Requirement 10: Notification Automation

**User Story:** As a student, I want to receive timely notifications about my application status, upcoming deadlines, and required actions, so that I do not miss important steps.

#### Acceptance Criteria

1. WHEN an Intake's `application_deadline` is 7 days away, THE Notification_Automation service SHALL dispatch a deadline warning SSE event to all users with draft Applications for that Intake.
2. WHEN an Intake's `application_deadline` is 1 day away, THE Notification_Automation service SHALL dispatch an urgent deadline warning SSE event to all users with draft Applications for that Intake.
3. WHEN a Payment transitions to `failed`, THE SSE_Event_Dispatcher SHALL dispatch a `payment_update` event to the Application owner with a recovery prompt message.
4. WHEN an Application has been in `draft` status for more than 7 days with no updates, THE Notification_Automation service SHALL dispatch an incomplete draft reminder SSE event to the Application owner.
5. WHEN an Application is missing required documents (NRC or Passport) and has been in `draft` status for more than 3 days, THE Notification_Automation service SHALL dispatch a missing document reminder SSE event.
6. WHEN an Application transitions to `approved` or `rejected`, THE SSE_Event_Dispatcher SHALL dispatch an `application_update` event to the Application owner with the decision and any admin feedback.
7. THE Notification_Automation service SHALL be implemented as Celery periodic tasks that run on a configurable schedule (default: every 6 hours for reminders, immediate for status change events).
8. THE Notification_Automation service SHALL not send duplicate notifications — each notification type per Application SHALL be sent at most once per 24-hour period.

### Requirement 11: Review Queue Intelligence

**User Story:** As an admin reviewer, I want applications in my review queue to be prioritized by completeness, urgency, and risk, so that I can make decisions more efficiently.

#### Acceptance Criteria

1. THE Review_Queue SHALL compute a priority score for each Application with status in `{submitted, under_review}` based on: Completeness_Score (weighted 30%), deadline urgency (weighted 25%), payment readiness (weighted 20%), document confidence (weighted 15%), and time in current status (weighted 10%).
2. WHEN an Application has a Completeness_Score above 90% and verified payment, THE Review_Queue SHALL classify the Application as `ready_for_decision`.
3. WHEN an Application is missing required documents or has unverified payment, THE Review_Queue SHALL classify the Application as `waiting_for_student`.
4. WHEN an Application has document mismatch warnings from the Document_Intelligence service, THE Review_Queue SHALL classify the Application as `high_risk_review`.
5. THE Review_Queue SHALL expose the priority score and classification via the application list API as additional annotation fields, sortable and filterable by admin users.
6. WHEN the admin application list endpoint is called with `sort=priority`, THE ApplicationListCreateView SHALL order results by the computed priority score descending.
7. THE Review_Queue priority computation SHALL be deterministic — the same Application state SHALL always produce the same priority score.

### Requirement 12: Analytics Activation

**User Story:** As a system administrator, I want real admissions metrics instead of hardcoded sample data, so that I can make data-driven operational decisions.

#### Acceptance Criteria

1. THE Analytics service SHALL compute admissions funnel metrics from live Application data: total drafts, total submitted, total under review, total approved, total rejected, total waitlisted.
2. THE Analytics service SHALL compute conversion rates: draft-to-submission rate, submission-to-approval rate, and overall funnel conversion rate.
3. THE Analytics service SHALL compute timing metrics: average days from draft creation to submission, average days from submission to first review action, and average days from review start to decision.
4. THE Analytics service SHALL compute payment metrics: total payments initiated, total payments successful, total payments failed, and payment verification backlog count.
5. WHEN the analytics funnel endpoint is called, THE FunnelAnalyticsView SHALL return live computed metrics instead of hardcoded sample data from `jobs_ops_seed.py`.
6. THE Analytics service SHALL filter metrics by date range when `start_date` and `end_date` query parameters are provided.
7. THE Analytics service SHALL filter metrics by institution and program when the corresponding query parameters are provided.
8. THE Analytics service SHALL cache computed metrics for 5 minutes to avoid expensive re-computation on every request.
