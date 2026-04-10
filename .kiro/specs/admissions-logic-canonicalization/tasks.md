# Implementation Plan: Admissions Logic Canonicalization

## Overview

Systematically resolves 12 business logic gaps from the admissions audit by introducing a thin domain layer of focused service modules. Work is organized by priority tier (P0→P3), each tier ending with a checkpoint. Backend Python services are created/modified first, then frontend TypeScript changes follow. All changes target existing tables — no new database tables.

## Tasks

- [ ] 1. P0 — Identifier Canonicalization (Req 1, 2)
  - [ ] 1.1 Create IdentifierResolver module
    - Create `backend/apps/applications/identifier_resolver.py` with `ResolvedIdentifier` dataclass and `IdentifierResolver` class
    - Implement `resolve_program()`: try name first, then code, against active Program records
    - Implement `resolve_institution()`: try code first, then name, then full_name, against active Institution records
    - Implement `resolve_intake()`: try name first against active Intake records
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 2.5_

  - [ ]* 1.2 Write property tests for IdentifierResolver
    - **Property 2: Institution identifier canonicalization** — any valid institution code/name/full_name resolves to canonical Institution.name
    - **Validates: Requirements 2.1, 2.5**
    - **Property 3: Program and intake identifier resolution** — any valid program name/code resolves correctly; same for intake names
    - **Validates: Requirements 2.2, 2.3**
    - Add tests to `backend/tests/property/test_admissions_canonicalization.py`

  - [ ] 1.3 Fix PaymentService program code resolution
    - Modify `backend/apps/documents/payment_service.py` `initiate_payment()` to use `IdentifierResolver.resolve_program()` before calling `FeeResolver.resolve_fee()`
    - Map `application.program` (name) → `resolved.code` → `FeeResolver.resolve_fee(program_code=resolved.code, ...)`
    - Raise descriptive error if program cannot be resolved (source == "not_found")
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ]* 1.4 Write property test for fee resolution round-trip
    - **Property 1: Fee resolution round-trip consistency** — resolving fee via PaymentService (name→code→FeeResolver) produces same ResolvedFee as direct FeeResolver call with code
    - **Validates: Requirements 1.1, 1.2, 1.5**
    - Add test to `backend/tests/property/test_admissions_canonicalization.py`

  - [ ] 1.5 Add institution canonicalization to serializers
    - Modify `backend/apps/applications/serializers.py` `ApplicationSerializer.validate_institution()` and `ApplicationCreateSerializer.validate_institution()` to use `IdentifierResolver.resolve_institution()` and store canonical `Institution.name`
    - Return validation error with code `INVALID_INSTITUTION` when resolution fails
    - Update `validate_program_intake_compatibility()` to use `IdentifierResolver.resolve_program()` and `IdentifierResolver.resolve_intake()` for flexible name/code lookup
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 2. P0 Checkpoint
  - Ensure all tests pass (`cd backend && python3 -m pytest`), ask the user if questions arise.

- [ ] 3. P1 — Mutation Hardening (Req 3, 4)
  - [ ] 3.1 Create PatchFieldGuard module
    - Create `backend/apps/applications/patch_guard.py` with `DRAFT_SAFE_FIELDS`, `LIFECYCLE_FIELDS` frozensets, and `guard_patch_fields()` function
    - Students: allow only `DRAFT_SAFE_FIELDS` when status == "draft", raise `ValueError("APPLICATION_NOT_EDITABLE")` otherwise
    - Admins: allow `DRAFT_SAFE_FIELDS` regardless of status, never allow `status` via PATCH
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 3.2 Write property tests for PatchFieldGuard
    - **Property 4: PATCH field guard strips lifecycle fields for students** — any mixed payload returns only DRAFT_SAFE_FIELDS keys for student+draft
    - **Validates: Requirements 3.1, 3.2**
    - **Property 5: PATCH rejects non-draft edits for students** — any non-draft status raises ValueError for students
    - **Validates: Requirements 3.3**
    - **Property 6: PATCH field guard for admins strips status but allows draft-safe fields** — admin payloads return only DRAFT_SAFE_FIELDS keys regardless of status
    - **Validates: Requirements 3.4**
    - Add tests to `backend/tests/property/test_admissions_canonicalization.py`

  - [ ] 3.3 Integrate PatchFieldGuard into ApplicationDetailView
    - Modify `backend/apps/applications/views.py` `ApplicationDetailView._update_application()` to call `guard_patch_fields()` before passing data to the serializer
    - Determine user role from `request.user.role` and application status from the loaded application
    - Return 403 with code `APPLICATION_NOT_EDITABLE` when guard raises ValueError
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ] 3.4 Create DuplicateChecker module
    - Create `backend/apps/applications/duplicate_checker.py` with `DuplicateCheckResult` dataclass and `DuplicateChecker` class
    - Implement `check_at_create()`: check for non-terminal duplicates (draft, submitted, under_review, approved, waitlisted)
    - Implement `check_at_submit()`: check for submitted duplicates (submitted, under_review, approved, waitlisted), excluding current application
    - Include `resume_url` in create-time duplicate results
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ]* 3.5 Write property tests for DuplicateChecker
    - **Property 7: Duplicate prevention at create time** — existing non-terminal app returns has_duplicate=True with ID and status
    - **Validates: Requirements 4.1, 4.2**
    - **Property 8: Duplicate prevention at submit time** — existing submitted app returns has_duplicate=True for other apps by same user/program/intake
    - **Validates: Requirements 4.3, 4.4**
    - Add tests to `backend/tests/property/test_admissions_canonicalization.py`

  - [ ] 3.6 Integrate DuplicateChecker into views and services
    - Modify `backend/apps/applications/views.py` `ApplicationListCreateView.post()` to call `DuplicateChecker.check_at_create()` before creating the application; return 409 with code `DUPLICATE_APPLICATION` if duplicate found
    - Modify `backend/apps/applications/services.py` `submit_application()` to call `DuplicateChecker.check_at_submit()` inside the atomic block; raise `ApplicationSubmissionError` with code `DUPLICATE_SUBMITTED_APPLICATION` if duplicate found
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6_

- [ ] 4. P1 Checkpoint
  - Ensure all tests pass (`cd backend && python3 -m pytest`), ask the user if questions arise.

- [ ] 5. P2 — Rules & Readiness (Req 5, 6, 7, 8)
  - [ ] 5.1 Create EligibilityEngine module
    - Create `backend/apps/applications/eligibility_engine.py` with `ExplainableRuleResult`, `EligibilityResult` dataclasses, and `EligibilityEngine` class
    - Implement `evaluate()`: read CourseRequirement records for the program, compare against ApplicationGrade records
    - Compute weighted eligibility score (0–100) using CourseRequirement `weight` fields
    - Classify as `eligible` (all mandatory pass), `not_eligible` (any mandatory fail), `conditional` (mandatory pass, optional fail), or `under_review` (no requirements configured)
    - Return `ExplainableRuleResult` for each requirement with severity, message, and recommended action
    - Use `IdentifierResolver.resolve_program()` for program lookup
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_

  - [ ]* 5.2 Write property tests for EligibilityEngine
    - **Property 9: Eligibility status classification** — eligible when all mandatory pass, not_eligible when any mandatory fail, conditional when mandatory pass but optional fail
    - **Validates: Requirements 5.4, 5.5, 5.6**
    - **Property 10: Eligibility score is weighted sum** — score equals round((passed_weight / total_weight) * 100)
    - **Validates: Requirements 5.2, 5.3**
    - **Property 11: Eligibility evaluation is idempotent** — calling evaluate() twice with same inputs produces identical results
    - **Validates: Requirements 5.8**
    - Add tests to `backend/tests/property/test_admissions_canonicalization.py`

  - [ ] 5.3 Create IntakeEnforcer module
    - Create `backend/apps/applications/intake_enforcer.py` with `IntakeCheckResult` dataclass and `IntakeEnforcer` class
    - Implement `check_submission()`: verify deadline not passed and capacity not reached; skip enforcement when deadline/capacity is null
    - Implement `increment_enrollment()`: atomically increment `current_enrollment` using `F()` expression
    - Implement `get_warnings()`: return advisory warnings for draft creation (deadline near, capacity above 90%)
    - Use `IdentifierResolver.resolve_intake()` for intake lookup
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [ ]* 5.4 Write property tests for IntakeEnforcer
    - **Property 12: Intake deadline enforcement** — past deadline returns allowed=False with INTAKE_DEADLINE_PASSED
    - **Validates: Requirements 6.1, 6.2**
    - **Property 13: Intake capacity enforcement** — full capacity returns allowed=False with INTAKE_CAPACITY_REACHED
    - **Validates: Requirements 6.3, 6.4**
    - **Property 14: Enrollment increment on submission** — successful submission increments current_enrollment by exactly 1
    - **Validates: Requirements 6.5**
    - Add tests to `backend/tests/property/test_admissions_canonicalization.py`

  - [ ] 5.5 Integrate EligibilityEngine and IntakeEnforcer into submit_application
    - Modify `backend/apps/applications/services.py` `submit_application()`:
      - Call `IntakeEnforcer.check_submission()` before the atomic block; raise `ApplicationSubmissionError` if blocked
      - Call `IntakeEnforcer.increment_enrollment()` after successful submission inside the atomic block
      - Call `EligibilityEngine.evaluate()` after submission (advisory, non-blocking) and store results in `eligibility_status`, `eligibility_score`, `eligibility_notes`
    - Deactivate associated `ApplicationDraft` records on successful submission (`is_active=False`)
    - _Requirements: 5.7, 6.1, 6.3, 6.5, 7.7_

  - [ ]* 5.6 Write property test for draft deactivation
    - **Property 16: Draft deactivation on submission** — all ApplicationDraft records for the submitted application have is_active=False after submission
    - **Validates: Requirements 7.7**
    - Add test to `backend/tests/property/test_admissions_canonicalization.py`

  - [ ] 5.7 Unify payment status vocabulary
    - Modify `backend/apps/documents/payment_service.py` `_update_application_payment_status()`: map `successful` → `verified` (not `paid`), `failed` → `failed`
    - Move the application payment_status update inside the same `transaction.atomic()` block as the payment status update in `_update_payment_status()`
    - Modify `backend/apps/applications/services.py` `submit_application()`: accept `force_approved` in addition to `verified` and `paid` as valid payment confirmation
    - _Requirements: 8.1, 8.2, 8.3, 8.6, 8.7_

  - [ ]* 5.8 Write property tests for payment vocabulary
    - **Property 17: Payment status canonical mapping** — successful payment sets application payment_status to "verified"; failed sets to "failed"
    - **Validates: Requirements 8.2, 8.3**
    - **Property 19: Submission accepts canonical payment confirmations** — payment_status in {verified, paid, force_approved} does not raise PAYMENT_REQUIRED
    - **Validates: Requirements 8.6**
    - Add tests to `backend/tests/property/test_admissions_canonicalization.py`

  - [ ] 5.9 Update frontend payment status normalizer
    - Modify `apps/admissions/src/lib/paymentStatus.ts` `normalizePaymentStatus()`:
      - Add `pending` → `pending_review` mapping
      - Add `force_approved` → `verified` mapping
      - Add `failed` → `rejected` mapping
    - _Requirements: 8.5_

  - [ ]* 5.10 Write frontend property test for payment normalization
    - **Property 18: Frontend payment status normalization** — each canonical value maps correctly: verified/force_approved→verified, pending→pending_review, failed/rejected→rejected, not_paid/null→not_paid
    - **Validates: Requirements 8.5**
    - Add test to `apps/admissions/tests/property/admissions-logic-canonicalization.test.tsx`

  - [ ] 5.11 Simplify frontend DraftManager for server-first drafts
    - Modify `apps/admissions/src/lib/draftManager.ts`:
      - Delegate all CRUD to server-side draft API as primary target
      - Use localStorage only as resilience cache (write after successful server save)
      - Remove sessionStorage as a draft storage location
      - On load: fetch server draft first, fall back to localStorage if unreachable, prefer whichever has more recent `updated_at`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.8_

  - [ ]* 5.12 Write frontend property test for draft conflict resolution
    - **Property 15: Draft conflict resolution by timestamp** — given two drafts with different updated_at, resolution logic prefers the more recent one
    - **Validates: Requirements 7.5**
    - Add test to `apps/admissions/tests/property/admissions-logic-canonicalization.test.tsx`

  - [ ] 5.13 Update frontend duplicate check to use backend
    - Modify `apps/admissions/src/lib/duplicateApplicationCheck.ts` to call the backend duplicate check endpoint instead of fetching all applications and filtering client-side
    - _Requirements: 4.5_

- [ ] 6. P2 Checkpoint
  - Ensure all tests pass (`cd backend && python3 -m pytest` and `cd apps/admissions && bun run test`), ask the user if questions arise.

- [ ] 7. P3 — Intelligence & Automation (Req 9, 10, 11, 12)
  - [ ] 7.1 Create DocumentIntelligence module
    - Create `backend/apps/applications/document_intelligence.py` with `ConsistencyCheck`, `CompletenessResult` dataclasses, and `DocumentIntelligence` class
    - Implement `compute_completeness()`: document score (40% weight — required doc types uploaded), consistency score (30% weight — fuzzy name match, NRC match against extracted_text), grade score (30% weight — grade count)
    - Implement `_check_consistency()`: fuzzy name match using `SequenceMatcher` (warn below 0.8), NRC regex match in extracted text
    - Skip identity checks when `extracted_text` is empty
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [ ]* 7.2 Write property tests for DocumentIntelligence
    - **Property 20: Document consistency scoring** — name_mismatch warning when fuzzy score < 0.8, nrc_mismatch when NRC not found in text
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
    - **Property 21: Completeness score formula** — score equals round(document_score * 0.4 + consistency_score * 0.3 + grade_score * 0.3)
    - **Validates: Requirements 9.5**
    - Add tests to `backend/tests/property/test_admissions_canonicalization.py`

  - [ ] 7.3 Create NotificationAutomation Celery tasks
    - Create `backend/apps/applications/notification_tasks.py` with `send_deadline_reminders` and `send_stale_draft_reminders` shared tasks
    - `send_deadline_reminders()`: dispatch SSE events for drafts with intakes 7 days and 1 day from deadline
    - `send_stale_draft_reminders()`: dispatch SSE events for drafts with no updates in 7+ days
    - Use `dispatch_event()` from `apps.common.event_dispatcher`
    - Implement deduplication: at most one notification per type per application per 24 hours
    - _Requirements: 10.1, 10.2, 10.4, 10.7, 10.8_

  - [ ]* 7.4 Write property tests for notification deduplication
    - **Property 22: Status change event dispatch** — approved/rejected transitions call dispatch_event with application_update type
    - **Validates: Requirements 10.3, 10.6**
    - **Property 23: Notification deduplication** — second dispatch within 24 hours is a no-op
    - **Validates: Requirements 10.8**
    - Add tests to `backend/tests/property/test_admissions_canonicalization.py`

  - [ ] 7.5 Register notification tasks in Celery Beat schedule
    - Modify `backend/config/settings/base.py` `CELERY_BEAT_SCHEDULE` to add:
      - `send-deadline-reminders`: every 6 hours
      - `send-stale-draft-reminders`: every 6 hours
    - _Requirements: 10.7_

  - [ ] 7.6 Create ReviewQueueScorer module
    - Create `backend/apps/applications/review_queue.py` with `ReviewPriority` dataclass and `ReviewQueueScorer` class
    - Implement `score()`: weighted formula — completeness 30%, deadline urgency 25%, payment readiness 20%, document confidence 15%, time in status 10%
    - Classify as `ready_for_decision` (completeness ≥ 90% + verified payment), `high_risk_review` (doc warnings), or `waiting_for_student` (otherwise)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.7_

  - [ ]* 7.7 Write property tests for ReviewQueueScorer
    - **Property 24: Review queue priority score and classification** — deterministic score following weighted formula with correct classification
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.7**
    - **Property 25: Review queue sort order** — sorted list is ordered by priority score descending
    - **Validates: Requirements 11.6**
    - Add tests to `backend/tests/property/test_admissions_canonicalization.py`

  - [ ] 7.8 Integrate ReviewQueueScorer into application list API
    - Modify `backend/apps/applications/views.py` `ApplicationListCreateView.get()` to annotate applications with priority score and classification for admin users
    - Support `sort=priority` query parameter to order by priority score descending
    - Expose `priority_score` and `priority_classification` as additional fields in admin list responses
    - _Requirements: 11.5, 11.6_

  - [ ] 7.9 Create AdmissionsAnalyticsService module
    - Create `backend/apps/analytics/admissions_analytics.py` with `AdmissionsAnalyticsService` class
    - Implement `funnel_metrics()`: live counts by status, draft-to-submission rate, submission-to-approval rate
    - Implement `timing_metrics()`: average days draft→submit, submit→review, review→decision
    - Implement `payment_metrics()`: initiated, successful, failed, pending counts
    - Implement `_apply_filters()`: filter by date range, institution, program
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.6, 12.7_

  - [ ]* 7.10 Write property tests for AnalyticsService
    - **Property 26: Analytics funnel counts match data** — funnel_metrics counts equal actual application counts per status
    - **Validates: Requirements 12.1, 12.2**
    - **Property 27: Analytics date range filtering** — filtered counts only include applications within the date range
    - **Validates: Requirements 12.6, 12.7**
    - Add tests to `backend/tests/property/test_admissions_canonicalization.py`

  - [ ] 7.11 Wire FunnelAnalyticsView to live data
    - Modify `backend/apps/analytics/views.py` `FunnelAnalyticsView.get()` to use `AdmissionsAnalyticsService` instead of `sample_funnel_analytics()`
    - Accept `start_date`, `end_date`, `institution`, `program` query parameters
    - Add 5-minute cache using Django's cache framework
    - _Requirements: 12.5, 12.6, 12.7, 12.8_

- [ ] 8. Final Checkpoint
  - Ensure all tests pass (`cd backend && python3 -m pytest` and `cd apps/admissions && bun run test`), ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties from the design document
- Checkpoints after each priority tier ensure incremental validation
- P0 and P1 are critical fixes; P2 adds enforcement and readiness; P3 adds intelligence and automation
- All backend services are advisory where noted (eligibility never blocks submission)
- No new database tables — all state stored in existing columns
