# Implementation Plan

- [x] 1. Write bug condition exploration tests
  - **Property 1: Bug Condition** — Admissions Flow Bug Conditions (Auth Failure, Phone Spaces, Dev Payment, Draft/Not-Paid Admin)
  - **CRITICAL**: These tests MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: These tests encode the expected behavior — they will validate the fixes when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate all four bugs exist
  - **Test file**: `apps/admissions/tests/property/admissionsFlowBugCondition.property.test.ts`
  - **Bug 1 — Auth failure stops retries**: Mock `onSave` to throw `AuthenticationError` (from `@/services/client`). Assert `useAutoSave` immediately sets `saveStatus='error'` and `saveError` contains "session expired" — NOT entering exponential backoff retries. Scoped to: `saveTriggered=true AND accessTokenExpired=true AND refreshTokenExpiredOrMissing=true` (from `isBugCondition` in design)
  - **Bug 2 — Phone normalization**: Parse `"+260 97 123 4567"` through the Zod schema from `types.ts`. Assert it succeeds and the output phone equals `"+260971234567"` (spaces stripped). Also assert the `BasicKycStep` placeholder matches `/^\+260\d{9}$/` format (no spaces)
  - **Bug 3 — Dev payment bypass**: With `import.meta.env.DEV=true` and `VITE_PAYMENT_DEV_BYPASS='true'`, assert `PaymentStep` renders a bypass/simulate button in the DOM
  - **Bug 4 — Admin draft/not_paid controls**: Render `ApplicationApprovalActions` with `currentStatus='draft'` and assert a "Force Submit" button exists. Render with `currentPaymentStatus='not_paid'` and assert a "Mark as Paid" button exists
  - Run tests on UNFIXED code with `bun run test:admissions`
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct — it proves the bugs exist)
  - Document counterexamples found:
    - Bug 1: `saveAttempts` increments to 5, `saveStatus` cycles through 'offline'/'error' instead of immediately showing session-expired
    - Bug 2: Zod parse throws `ZodError` for "+260 97 123 4567"; placeholder contains spaces
    - Bug 3: No bypass button in DOM
    - Bug 4: Empty button containers for draft/not_paid states
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

- [x] 2. Write preservation property tests (BEFORE implementing fixes)
  - **Property 2: Preservation** — Admissions Flow Preservation (Valid Auth Saves, Valid Phones, Production Payment, Existing Admin Controls)
  - **IMPORTANT**: Follow observation-first methodology — observe behavior on UNFIXED code first
  - **Test file**: `apps/admissions/tests/property/admissionsFlowPreservation.property.test.ts`
  - **Valid auth save preservation (Req 3.1, 3.2, 3.3)**: Observe that `useAutoSave` with a successful `onSave` callback sets `saveStatus='saved'`, updates `lastSaved`, and resets retry counter. Write property: for all successful `onSave` callbacks, behavior is unchanged
  - **Valid phone preservation (Req 3.4)**: Observe that phone strings matching `/^\+?[0-9]{7,15}$/` (no spaces) pass Zod validation. Write fast-check property: for all generated phone strings without spaces matching the regex, validation result is identical before and after fix
  - **Production payment preservation (Req 3.5)**: Observe that `PaymentStep` in production mode (`import.meta.env.DEV=false`) does NOT render any bypass button. Write property: for all production environment configs, no bypass mechanism is visible
  - **Existing admin controls preservation (Req 3.6, 3.7)**: Observe that `ApplicationApprovalActions` with `currentStatus='submitted'` renders Review button, `currentStatus='under_review'` renders Approve/Reject buttons, `currentPaymentStatus='pending_review'` renders Verify/Reject buttons, `currentPaymentStatus='rejected'` renders Reopen button. Write fast-check property: for all status ∈ {submitted, under_review} × paymentStatus ∈ {pending_review, rejected}, rendered buttons match observed baseline
  - Run tests on UNFIXED code with `bun run test:admissions`
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [x] 3. Fix Bug 1 — Auth Failure Detection in useAutoSave

  - [x] 3.1 Implement auth error detection in useAutoSave cloud save catch
    - File: `apps/admissions/src/hooks/useAutoSave.ts`
    - Import `AuthenticationError` from `@/services/client`
    - In the `catch (cloudError)` block (~line 128 of `saveData`), add check BEFORE generic retry logic:
      - `if (cloudError instanceof AuthenticationError)` → set `saveStatus='error'`, set `saveError='Session expired — please sign in again to save your work.'`, do NOT increment retry counter, do NOT schedule backoff, return immediately
    - Add `authExpiredRef` ref — set to `true` when `AuthenticationError` caught; check at top of `saveData` to skip cloud saves once auth expired (localStorage saves still work)
    - Add event listener for `mihas:auth-expired` to set `authExpiredRef = true`
    - _Bug_Condition: isBugCondition(input) where saveTriggered=true AND accessTokenExpired=true AND refreshTokenExpiredOrMissing=true — ApiClient throws AuthenticationError, useAutoSave catches as generic cloudError_
    - _Expected_Behavior: Immediately stop retries, set saveStatus='error', set saveError to session-expired message (Properties 1 from design)_
    - _Preservation: Valid auth saves continue unchanged — successful onSave → saveStatus='saved', lastSaved updates, retry counter resets (Properties 2 from design)_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3_

  - [x] 3.2 Surface auth error in useSmartAutoSave onError callback
    - File: `apps/admissions/src/pages/student/applicationWizard/hooks/useSmartAutoSave.ts`
    - Check if error is `AuthenticationError` in `onError` callback
    - Propagate session-expired state to wizard UI when auth error detected
    - _Requirements: 2.1, 2.3_

  - [x] 3.3 Verify bug condition exploration test now passes for Bug 1
    - **Property 1: Expected Behavior** — Auth Failure Stops Retries
    - **IMPORTANT**: Re-run the SAME test from task 1 (Bug 1 section) — do NOT write a new test
    - The test from task 1 encodes the expected behavior: `AuthenticationError` → immediate stop, `saveStatus='error'`, session-expired message
    - Run with `bun run test:admissions`
    - **EXPECTED OUTCOME**: Test PASSES (confirms Bug 1 is fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.4 Verify preservation tests still pass for Bug 1
    - **Property 2: Preservation** — Valid Auth Saves Unchanged
    - **IMPORTANT**: Re-run the SAME preservation tests from task 2 (valid auth save section) — do NOT write new tests
    - Run with `bun run test:admissions`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions to valid-auth save behavior)
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 4. Fix Bug 2 — Phone Placeholder and Validation

  - [x] 4.1 Fix phone placeholder in BasicKycStep
    - File: `apps/admissions/src/pages/student/applicationWizard/steps/BasicKycStep.tsx`
    - Change `placeholder="e.g., +260 97 123 4567"` to `placeholder="e.g., +260971234567"`
    - _Bug_Condition: isBugCondition(input) where phoneValue CONTAINS ' ' AND matches spaced placeholder format_
    - _Expected_Behavior: Placeholder displays no-spaces format matching backend `/^\+260\d{9}$/` (Property 3 from design)_
    - _Requirements: 2.4_

  - [x] 4.2 Add space-stripping transform to Zod phone schema
    - File: `apps/admissions/src/pages/student/applicationWizard/types.ts`
    - Change phone field from `z.string().regex(...)` to `z.string().transform(v => v.replace(/\s/g, '')).pipe(z.string().regex(...))`
    - This strips spaces before validation so "+260 97 123 4567" becomes "+260971234567"
    - _Bug_Condition: phoneValue contains spaces that when stripped match `/^\+?[0-9]{7,15}$/`_
    - _Expected_Behavior: Frontend accepts spaced phone input by normalizing before validation (Property 3 from design)_
    - _Preservation: Phone strings already matching `/^\+?[0-9]{7,15}$/` without spaces continue to pass identically (Property 4 from design)_
    - _Requirements: 2.5, 3.4_

  - [x] 4.3 Verify bug condition exploration test now passes for Bug 2
    - **Property 1: Expected Behavior** — Phone Input Normalization
    - **IMPORTANT**: Re-run the SAME test from task 1 (Bug 2 section) — do NOT write a new test
    - Run with `bun run test:admissions`
    - **EXPECTED OUTCOME**: Test PASSES (confirms phone normalization works and placeholder is correct)
    - _Requirements: 2.4, 2.5_

  - [x] 4.4 Verify preservation tests still pass for Bug 2
    - **Property 2: Preservation** — Valid Phone Numbers Unchanged
    - **IMPORTANT**: Re-run the SAME preservation tests from task 2 (valid phone section) — do NOT write new tests
    - Run with `bun run test:admissions`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions to valid phone validation)
    - _Requirements: 3.4_

- [x] 5. Fix Bug 3 — Payment Dev Bypass

  - [x] 5.1 Add dev bypass env var to .env.development
    - File: `.env.development`
    - Add `VITE_PAYMENT_DEV_BYPASS=true`
    - This var MUST NOT be set in `.env.production` — `import.meta.env.DEV` is `false` in production builds
    - _Requirements: 2.6_

  - [x] 5.2 Implement dev bypass in PaymentStep
    - File: `apps/admissions/src/pages/student/applicationWizard/steps/PaymentStep.tsx`
    - Add dev bypass check: `const isDevBypass = import.meta.env.DEV && import.meta.env.VITE_PAYMENT_DEV_BYPASS === 'true'`
    - When `isDevBypass` is true, render a "Simulate Payment (Dev)" button that calls `onPaymentStatusChange?.('successful')` directly without invoking the Lenco widget
    - The bypass button should be visually distinct (e.g., amber/warning styling) to make it clear this is a dev-only action
    - _Bug_Condition: isBugCondition(input) where environment IN ['development', 'test'] AND paymentStepReached=true_
    - _Expected_Behavior: Visible bypass mechanism simulates payment completion without real Lenco widget (Property 5 from design)_
    - _Preservation: Production environment continues to require real Lenco payment — no bypass visible (Property 6 from design)_
    - _Requirements: 2.6, 2.7, 3.5_

  - [x] 5.3 Verify bug condition exploration test now passes for Bug 3
    - **Property 1: Expected Behavior** — Dev Payment Bypass Available
    - **IMPORTANT**: Re-run the SAME test from task 1 (Bug 3 section) — do NOT write a new test
    - Run with `bun run test:admissions`
    - **EXPECTED OUTCOME**: Test PASSES (confirms dev bypass button renders in dev mode)
    - _Requirements: 2.6, 2.7_

  - [x] 5.4 Verify preservation tests still pass for Bug 3
    - **Property 2: Preservation** — Production Payment Enforcement
    - **IMPORTANT**: Re-run the SAME preservation tests from task 2 (production payment section) — do NOT write new tests
    - Run with `bun run test:admissions`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no bypass in production mode)
    - _Requirements: 3.5_

- [x] 6. Fix Bug 4 — Admin Controls for Draft and Not-Paid States

  - [x] 6.1 Add draft status handling to ApplicationApprovalActions
    - File: `apps/admissions/src/components/admin/applications/ApplicationApprovalActions.tsx`
    - Add case for `currentStatus === 'draft'`: render "Draft — not yet submitted" badge + "Force Submit" button
    - "Force Submit" calls `handleStatusUpdate('submitted')` — backend `ALLOWED_TRANSITIONS` supports `draft → submitted` via `ApplicationReviewView.post()` → `submit_application()`
    - _Bug_Condition: isBugCondition(input) where applicationStatus='draft' AND userRole='admin'_
    - _Expected_Behavior: Contextual draft message + Force Submit button visible (Property 7 from design)_
    - _Requirements: 2.8_

  - [x] 6.2 Add not_paid payment handling to ApplicationApprovalActions
    - File: `apps/admissions/src/components/admin/applications/ApplicationApprovalActions.tsx`
    - Add case for `currentPaymentStatus === 'not_paid'`: render "Awaiting Payment" badge + "Mark as Paid" button
    - "Mark as Paid" calls `openPaymentReviewDialog('verified')` using existing flow → `onPaymentStatusUpdate` → `ApplicationReviewView.post()` → `PaymentService.review_application_payment()`
    - Handle `PAYMENT_RECORD_REQUIRED` error gracefully with message "No payment record found — the student must initiate payment first"
    - _Bug_Condition: isBugCondition(input) where paymentStatus='not_paid' AND userRole='admin'_
    - _Expected_Behavior: "Mark as Paid" button visible for admin payment override (Property 7 from design)_
    - _Requirements: 2.9_

  - [x] 6.3 Add paid/successful payment badge to ApplicationApprovalActions
    - File: `apps/admissions/src/components/admin/applications/ApplicationApprovalActions.tsx`
    - Add case for `currentPaymentStatus === 'paid'` or `currentPaymentStatus === 'successful'` to show a verified-equivalent badge
    - `normalizePaymentStatus()` treats these as verified — the badge should reflect this
    - _Requirements: 2.9_

  - [x] 6.4 Verify bug condition exploration test now passes for Bug 4
    - **Property 1: Expected Behavior** — Admin Controls for Draft and Not-Paid
    - **IMPORTANT**: Re-run the SAME test from task 1 (Bug 4 section) — do NOT write a new test
    - Run with `bun run test:admissions`
    - **EXPECTED OUTCOME**: Test PASSES (confirms Force Submit and Mark as Paid buttons render)
    - _Requirements: 2.8, 2.9_

  - [x] 6.5 Verify preservation tests still pass for Bug 4
    - **Property 2: Preservation** — Existing Admin Controls Unchanged
    - **IMPORTANT**: Re-run the SAME preservation tests from task 2 (existing admin controls section) — do NOT write new tests
    - Run with `bun run test:admissions`
    - **EXPECTED OUTCOME**: Tests PASS (confirms submitted/under_review/pending_review/rejected controls unchanged)
    - _Requirements: 3.6, 3.7_

- [x] 7. Checkpoint — Ensure all tests pass
  - Run full test suite: `bun run test:admissions`
  - Verify ALL bug condition exploration tests from task 1 now PASS (confirming all four bugs are fixed)
  - Verify ALL preservation tests from task 2 still PASS (confirming no regressions)
  - Ask the user if questions arise
