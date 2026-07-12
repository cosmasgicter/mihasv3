# Implementation Plan

- [x] 1. Write bug condition exploration tests (BEFORE implementing fixes)
  - **Property 1: Bug Condition** - Admissions Approval Flow Bug Conditions
  - **CRITICAL**: These tests MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: These tests encode the expected behavior — they will validate the fixes when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate each bug exists
  - **Backend tests** (`backend/tests/property/test_approval_flow_bug_conditions.py`, pytest + hypothesis):
    - Bug 1: Call `verify_condition()` on a pending condition with status `met` or `waived`. Assert that `condition.updated_at` was explicitly set to `timezone.now()` BEFORE `save()` — not relying on `auto_now=True`. On unfixed code, `updated_at` is never explicitly assigned (relies on `auto_now`), so the test should FAIL by checking that the explicit assignment line exists in the call flow (mock `timezone.now()` and verify `condition.updated_at` equals the mocked value before save)
    - Bug 5: Call `transition_application_status(application, "submitted", user_id)` where `application.review_started_at is None`. Assert `application.review_started_at` remains `None` after the transition. On unfixed code, `review_started_at` gets set unconditionally — test will FAIL
    - Use `@given(st.sampled_from(["met", "waived"]))` for Bug 1 status generation
    - Use `@given(...)` with strategy for Bug 5 to generate non-review target statuses
  - **Frontend tests** (`apps/admissions/tests/property/approvalFlowBugCondition.property.test.ts`, vitest + fast-check):
    - Bug 2: Render `ApplicationApprovalActions` with `currentStatus` from `fc.constantFrom("conditionally_approved", "waitlisted", "enrolled", "withdrawn", "expired", "enrollment_expired")`. Assert the component renders at least one status indicator or action button. On unfixed code, these statuses render empty — test will FAIL
    - Bug 3: Render `PaymentStep` with `import.meta.env.DEV = true` and `VITE_PAYMENT_DEV_BYPASS = 'true'` and payment not settled. Assert a dev bypass button is present. On unfixed code, no bypass button exists — test will FAIL
    - Bug 4: Simulate `mihas:auth-recovered` event after `mihas:auth-expired` with dirty data and empty save queue. Assert `saveData()` (the cloud save function) is called immediately on recovery. On unfixed code, only `processSaveQueue()` runs on an empty queue — test will FAIL
  - **EXPECTED OUTCOME**: All tests FAIL (this is correct — it proves the bugs exist)
  - Document counterexamples found to understand root cause
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14_

- [x] 2. Write preservation property tests (BEFORE implementing fixes)
  - **Property 2: Preservation** - Admissions Approval Flow Preservation
  - **IMPORTANT**: Follow observation-first methodology — observe behavior on UNFIXED code first
  - **Backend tests** (`backend/tests/property/test_approval_flow_preservation.py`, pytest + hypothesis):
    - Bug 1 preservation: Verify that calling `verify_condition()` on a non-pending condition still raises `ConditionError("CONDITION_NOT_PENDING")`. Verify that calling with invalid status (not `met`/`waived`) raises `ConditionError("INVALID_CONDITION_STATUS")`. Verify auto-promotion via `auto_promote_if_all_met()` still triggers after verification. Use `@given(st.sampled_from(["met", "waived", "expired"]))` for condition statuses
    - Bug 5 preservation: Verify that `transition_application_status()` with `new_status` in `("under_review", "conditionally_approved", "approved", "rejected")` and `review_started_at is None` DOES set `review_started_at`. Verify `ALLOWED_TRANSITIONS` enforcement still raises `ValueError` for invalid transitions. Verify `ApplicationStatusHistory` is still created. Use `@given(...)` to generate review-status transitions
  - **Frontend tests** (`apps/admissions/tests/property/approvalFlowPreservation.property.test.ts`, vitest + fast-check):
    - Bug 2 preservation: Render `ApplicationApprovalActions` with `currentStatus` from `fc.constantFrom("draft", "submitted", "under_review", "approved", "rejected")`. Assert existing render behavior is unchanged — `submitted` shows Review button, `under_review` shows Approve/Reject, `approved`/`rejected` show status badges, `draft` shows Draft indicator
    - Bug 3 preservation: Render `PaymentStep` with `import.meta.env.DEV = false` (production). Assert no dev bypass button is rendered regardless of `VITE_PAYMENT_DEV_BYPASS` value. Also test `DEV = true` but `VITE_PAYMENT_DEV_BYPASS = 'false'` — no bypass button
    - Bug 4 preservation: Verify that normal auto-save cycle (auth never expired) continues to work — `saveData()` is called on interval. Verify that online recovery with non-empty save queue still calls `processSaveQueue()`
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: All tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

- [x] 3. Fix for admissions approval flow bugs

  - [x] 3.1 Bug 1 — Explicitly set `updated_at` in `verify_condition()`
    - In `backend/apps/applications/condition_manager.py`, inside `verify_condition()`, add `condition.updated_at = timezone.now()` immediately before the `condition.save(update_fields=...)` call
    - This ensures `updated_at` is explicitly set rather than relying on `auto_now=True` behavior on the unmanaged model
    - No change to the `update_fields` list — `"verified_by"` in `update_fields` with `verified_by_id` assignment is valid Django FK behavior
    - _Bug_Condition: isBugCondition_Bug1(input) where input.target_status IN {"met", "waived"} AND condition.status = "pending"_
    - _Expected_Behavior: result.updated_at IS NOT NULL and explicitly set to timezone.now() before save_
    - _Preservation: Non-pending conditions still raise ConditionError("CONDITION_NOT_PENDING"), auto-promotion still triggers_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2_

  - [x] 3.2 Bug 2 — Add missing status render blocks in `ApplicationApprovalActions`
    - In `apps/admissions/src/components/admin/applications/ApplicationApprovalActions.tsx`, add render blocks for:
      - `conditionally_approved`: Status badge ("Conditionally Approved") + Approve button (gated on `isPaymentVerified`) + Reject button
      - `waitlisted`: Status badge ("Waitlisted") + Approve button (gated on `isPaymentVerified`) + Reject button (valid transitions per `ALLOWED_TRANSITIONS`)
      - `enrolled`: Read-only status badge ("Enrolled", green) — terminal status, no action buttons
      - `withdrawn`: Read-only status badge ("Withdrawn", gray) — terminal status, no action buttons
      - `expired`: Read-only status badge ("Expired", red) — terminal status, no action buttons
      - `enrollment_expired`: Read-only status badge ("Enrollment Expired", amber) — terminal status, no action buttons
    - _Bug_Condition: isBugCondition_Bug2(input) where input.application_status IN {"conditionally_approved", "waitlisted", "enrolled", "withdrawn", "expired", "enrollment_expired"}_
    - _Expected_Behavior: All statuses render a visible status indicator; conditionally_approved and waitlisted also render action buttons_
    - _Preservation: draft, submitted, under_review, approved, rejected render exactly as before_
    - _Requirements: 2.4, 2.5, 2.6, 3.3, 3.4_

  - [x] 3.3 Bug 3 — Wire dev payment bypass button in `PaymentStep`
    - In `apps/admissions/src/pages/student/applicationWizard/steps/PaymentStep.tsx`:
      - Check `import.meta.env.DEV && import.meta.env.VITE_PAYMENT_DEV_BYPASS === 'true'`
      - When condition is met and payment is not settled, render a visually distinct button (dashed orange border, "⚡ Simulate Payment (Dev)")
      - On click, call `POST /api/v1/payments/dev-bypass/` with `{ application_id }` via `apiClient.request()`
      - On success, call `onPaymentStatusChange?.('successful')` to advance the wizard
      - Add loading and error states for the bypass request
      - `import.meta.env.DEV` check ensures the button is tree-shaken from production builds
    - _Bug_Condition: isBugCondition_Bug3(input) where input.isDev = true AND input.devBypassEnabled = true AND input.paymentSettled = false_
    - _Expected_Behavior: Dev bypass button rendered, calls POST /api/v1/payments/dev-bypass/, updates status to successful_
    - _Preservation: Production builds never render bypass button; non-bypass dev renders unchanged_
    - _Requirements: 2.7, 2.8, 2.9, 3.6_

  - [x] 3.4 Bug 4 — Trigger immediate `saveData()` on auth recovery in `useAutoSave`
    - In `apps/admissions/src/hooks/useAutoSave.ts`, inside the `handleAuthRecovered` handler:
      - After resetting `authExpiredRef.current = false` and clearing error state, add an immediate `saveData()` call
      - Keep the existing `processSaveQueue()` call as belt-and-suspenders
      - The immediate `saveData()` handles the common case: dirty data with an empty save queue
    - _Bug_Condition: isBugCondition_Bug4(input) where input.authWasExpired = true AND input.hasDirtyData = true AND input.saveQueueEmpty = true_
    - _Expected_Behavior: saveData() called immediately on auth recovery, dirty data synced without waiting for interval_
    - _Preservation: Normal auto-save cycle unchanged; offline recovery with non-empty queue still works_
    - _Requirements: 2.10, 2.11, 2.12, 3.7, 3.8_

  - [x] 3.5 Bug 5 — Gate `review_started_at` to review transitions only in `services.py`
    - In `backend/apps/applications/services.py`, inside `transition_application_status()`, change:
      ```python
      if not application.review_started_at:
          application.review_started_at = timezone.now()
      ```
      to:
      ```python
      if not application.review_started_at and new_status in ("under_review", "conditionally_approved", "approved", "rejected"):
          application.review_started_at = timezone.now()
      ```
    - This ensures `review_started_at` is only set when an admin actually begins reviewing, not on student self-submit or other non-review transitions
    - _Bug_Condition: isBugCondition_Bug5(input) where input.new_status NOT IN {"under_review", "conditionally_approved", "approved", "rejected"} AND input.review_started_at IS NULL_
    - _Expected_Behavior: review_started_at remains None for non-review transitions_
    - _Preservation: Transitions to under_review, conditionally_approved, approved, rejected still set review_started_at when null_
    - _Requirements: 2.13, 2.14, 2.15, 3.9, 3.10_

  - [x] 3.6 Verify bug condition exploration tests now pass
    - **Property 1: Expected Behavior** - Admissions Approval Flow Expected Behavior
    - **IMPORTANT**: Re-run the SAME tests from task 1 — do NOT write new tests
    - The tests from task 1 encode the expected behavior for all five bugs
    - When these tests pass, it confirms the expected behavior is satisfied
    - Run backend bug condition tests: `cd backend && python3 -m pytest tests/property/test_approval_flow_bug_conditions.py -v`
    - Run frontend bug condition tests: `cd apps/admissions && bun run test -- --run tests/property/approvalFlowBugCondition.property.test.ts`
    - **EXPECTED OUTCOME**: All tests PASS (confirms all five bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.8, 2.10, 2.13, 2.14_

  - [x] 3.7 Verify preservation tests still pass
    - **Property 2: Preservation** - Admissions Approval Flow Preservation
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run backend preservation tests: `cd backend && python3 -m pytest tests/property/test_approval_flow_preservation.py -v`
    - Run frontend preservation tests: `cd apps/admissions && bun run test -- --run tests/property/approvalFlowPreservation.property.test.ts`
    - **EXPECTED OUTCOME**: All tests PASS (confirms no regressions)
    - Confirm all preservation tests still pass after fixes (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full backend test suite: `cd backend && python3 -m pytest tests/property/test_approval_flow_bug_conditions.py tests/property/test_approval_flow_preservation.py -v`
  - Run full frontend test suite: `cd apps/admissions && bun run test -- --run tests/property/approvalFlowBugCondition.property.test.ts tests/property/approvalFlowPreservation.property.test.ts`
  - Ensure all tests pass, ask the user if questions arise.
ea