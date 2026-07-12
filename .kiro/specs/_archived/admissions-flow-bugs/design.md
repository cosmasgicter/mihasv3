# Admissions Flow Bugs — Bugfix Design

## Overview

This design addresses four bugs in the MIHAS admissions platform that collectively degrade the student application flow and admin review experience. The most critical bug (Bug 1) causes silent data loss when JWT refresh fails during auto-save — the `useAutoSave` hook catches the `AuthenticationError` thrown by `ApiClient` as a generic cloud error and enters an infinite exponential backoff retry loop instead of surfacing a session-expired message. Bug 2 is a placeholder/validator mismatch on the phone field. Bug 3 blocks development testing by requiring real Lenco payments. Bug 4 leaves admins with no actionable controls for draft applications and unpaid payment states.

## Glossary

- **Bug_Condition (C)**: The set of conditions that trigger each bug — auth failure during save, spaced phone input, dev-environment payment, or draft/not_paid admin view
- **Property (P)**: The desired correct behavior for each bug condition — session-expired redirect, normalized phone, dev bypass, visible admin controls
- **Preservation**: Existing behaviors that must remain unchanged — valid-token saves, correct-format phones, production payment enforcement, existing submitted/under_review controls
- **useAutoSave**: Hook in `src/hooks/useAutoSave.ts` providing 8-second interval form persistence with localStorage fallback and cloud save via `onSave` callback
- **ApiClient**: Singleton in `src/services/client.ts` handling all API requests with cookie-based auth, token refresh, and CSRF management
- **AuthenticationError**: Error class thrown by `ApiClient` when token refresh fails (unrecoverable 401) — has `status = 401` and `name = 'AuthenticationError'`
- **onAuthFailure**: Callback configured by `AuthContext` that clears caches, dispatches `mihas:auth-expired` event, and stores redirect path
- **ApplicationApprovalActions**: Component in `src/components/admin/applications/ApplicationApprovalActions.tsx` rendering status transition buttons based on current application and payment status
- **ALLOWED_TRANSITIONS**: Backend state machine in `backend/apps/applications/services.py` — `draft → submitted`, `submitted → under_review/approved/rejected`, etc.

## Bug Details

### Bug Condition

The four bugs manifest under distinct conditions that share a common theme: the system fails to handle edge-case states that real users encounter.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { bugId: 1|2|3|4, context: BugContext }
  OUTPUT: boolean

  IF input.bugId == 1:
    // Auth failure during save
    RETURN input.context.saveTriggered == true
           AND input.context.accessTokenExpired == true
           AND input.context.refreshTokenExpiredOrMissing == true
           // ApiClient.attemptRefresh() returns false, throws AuthenticationError
           // useAutoSave catches it as generic cloudError in the onSave try/catch
           // Enters exponential backoff retry loop (up to 5 attempts)
           // Never surfaces auth-specific message or redirect

  IF input.bugId == 2:
    // Phone with spaces matching placeholder
    RETURN input.context.phoneValue CONTAINS ' '
           AND input.context.phoneValue MATCHES placeholder "e.g., +260 97 123 4567"
           // Frontend Zod regex /^\+?[0-9]{7,15}$/ rejects spaces
           // Backend validate_zambian_phone requires /^\+260\d{9}$/ (no spaces)
           // Placeholder misleads user into entering spaced format

  IF input.bugId == 3:
    // Payment in dev/test environment
    RETURN input.context.environment IN ['development', 'test']
           AND input.context.paymentStepReached == true
           // PaymentStep always calls real Lenco widget via useLencoWidget
           // No bypass mechanism exists for non-production environments

  IF input.bugId == 4:
    // Admin viewing draft or not_paid application
    RETURN (input.context.applicationStatus == 'draft'
            OR input.context.paymentStatus == 'not_paid')
           AND input.context.userRole == 'admin'
           // ApplicationApprovalActions only renders buttons for:
           //   App status: submitted (Review), under_review (Approve/Reject)
           //   Payment status: pending_review (Verify/Reject), rejected (Reopen)
           // Draft apps and not_paid payments show NO actionable controls

END FUNCTION
```

### Examples

**Bug 1 — Draft Save Fails Silently:**
- Student on Personal Details step, JWT access token expired 31 minutes ago, refresh token cookie also expired (>7 days). Student clicks "Save Now". `ApiClient.request()` gets 401, calls `attemptRefresh()` which returns `false`, throws `AuthenticationError`. `useSmartAutoSave.onSave` callback propagates this to `useAutoSave`'s cloud save try/catch at line ~128. The catch block logs "Cloud save failed, data saved locally" and increments `saveAttemptsRef`. After 5 retries with exponential backoff (1s, 2s, 4s, 8s, 16s), it sets `saveStatus = 'error'` with message "Failed to sync with server after multiple attempts". The student sees a generic error, not "Session expired — please sign in again".
- Auto-save fires every 8 seconds. Each cycle hits the same auth failure, restarting the retry counter. The student sees alternating "Saved locally — waiting to sync" and "Save failed" messages indefinitely.

**Bug 2 — Phone Number Placeholder Mismatch:**
- Student sees placeholder "e.g., +260 97 123 4567" and types "+260 97 123 4567". Frontend Zod regex `/^\+?[0-9]{7,15}$/` fails because spaces are not digits. Student gets "Phone must be 7–15 digits, optionally prefixed with +" — confusing because they followed the placeholder.
- Even if frontend validation were bypassed, backend `validate_zambian_phone` requires `/^\+260\d{9}$/` which also rejects spaces.

**Bug 3 — Payment Widget Test Environment:**
- Developer runs `bun run dev:admissions`, reaches PaymentStep, clicks "Pay now". `apiClient.request('/payments/initiate/')` creates a real pending payment record. `useLencoWidget.openWidget()` loads the sandbox Lenco script and opens the real payment modal. Developer cannot complete payment without real banking credentials, blocking all post-payment flow testing.

**Bug 4 — Admin Approval Not Discoverable:**
- Admin opens ApplicationDetailModal for a draft application (status="draft", payment_status="not_paid"). `ApplicationApprovalActions` receives `currentStatus="draft"` and `currentPaymentStatus="not_paid"`. The JSX conditionally renders buttons only for `submitted` and `under_review` statuses. For `draft`, no buttons render — just an empty `<div className="flex gap-1">`. Similarly, payment controls only render for `pending_review` and `rejected`. The admin sees two empty sections with labels "Application Status" and "Payment Status" but no actionable controls.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- WHEN the JWT access token is valid and the student saves, the system SHALL CONTINUE TO send PATCH to `/api/v1/applications/{id}/` and display "Saved" status (Req 3.1)
- WHEN auto-save fires with valid auth and network, the system SHALL CONTINUE TO auto-save every 8 seconds with change detection (Req 3.2)
- WHEN the student is offline, the system SHALL CONTINUE TO save to localStorage and display "offline" status (Req 3.3)
- WHEN a phone number is entered as "+260XXXXXXXXX" (no spaces), the system SHALL CONTINUE TO accept it on both frontend and backend (Req 3.4)
- WHEN running in production, the system SHALL CONTINUE TO require real Lenco payment — no bypass available (Req 3.5)
- WHEN admin views submitted/under_review applications, the system SHALL CONTINUE TO display Review/Approve/Reject buttons as currently implemented (Req 3.6)
- WHEN admin uses Verify/Reject for pending_review payments, the system SHALL CONTINUE TO open the review dialog with notes (Req 3.7)
- WHEN `submit_application` is called, the system SHALL CONTINUE TO enforce payment verification, document upload, intake deadline, and duplicate checks (Req 3.8)

**Scope:**
All inputs that do NOT match any of the four bug conditions should be completely unaffected. This includes: successful token refreshes, correctly formatted phone numbers, production payment flows, and admin actions on submitted/under_review applications.

## Hypothesized Root Cause

### Bug 1 — Draft Save Fails Silently

The root cause is a missing error-type discrimination in `useAutoSave`'s cloud save catch block (line ~128 of `useAutoSave.ts`). When `onSave` throws:

1. `ApiClient.request()` detects 401, calls `attemptRefresh()` which calls `performRefresh()` → POST `/api/v1/auth/refresh/` returns 401
2. `attemptRefresh()` returns `false`
3. `ApiClient` calls `getOnAuthFailure()` which dispatches `mihas:auth-expired` event and clears caches
4. `ApiClient` throws `new AuthenticationError()`
5. `useSmartAutoSave.onSave` callback (`await onSave()`) propagates the error
6. `useAutoSave.saveData()` catches it in the generic `cloudError` catch block
7. The catch block treats `AuthenticationError` identically to network errors — increments retry counter, schedules exponential backoff

The `onAuthFailure` callback IS invoked (step 3), which dispatches the `mihas:auth-expired` event. However, `useAutoSave` doesn't listen for this event and continues its retry loop, creating confusing UI state. The fix needs to: (a) detect `AuthenticationError` in the catch block, (b) stop retries immediately, and (c) surface a clear session-expired message via `saveStatus` and `saveError`.

### Bug 2 — Phone Number Placeholder Mismatch

Two independent issues:
1. **Placeholder misleads**: `BasicKycStep.tsx` line 156 shows `placeholder="e.g., +260 97 123 4567"` with spaces, but the backend requires `/^\+260\d{9}$/` (no spaces)
2. **Frontend schema doesn't normalize**: The Zod schema in `types.ts` uses `/^\+?[0-9]{7,15}$/` which rejects spaces outright. No `.transform()` strips spaces before validation.

### Bug 3 — Payment Widget Test Environment

`PaymentStep.tsx` always calls `apiClient.request('/payments/initiate/')` and `useLencoWidget.openWidget()` regardless of environment. There is no `VITE_PAYMENT_BYPASS` or similar env check. The `WIDGET_URL` defaults to sandbox (`pay.sandbox.lenco.co`) but the sandbox still requires real payment credentials.

### Bug 4 — Admin Approval Not Discoverable

`ApplicationApprovalActions.tsx` uses conditional rendering that only covers a subset of statuses:
- Application status buttons: `submitted` → Review button, `under_review` → Approve/Reject buttons, `approved`/`rejected` → status badge
- Payment status buttons: `pending_review` → Verify/Reject, `rejected` → Reopen Review, `verified`/`rejected` → status badge
- Missing: `draft` (no app status controls), `not_paid` (no payment controls), `paid`/`successful` (no payment badge)

The backend `ALLOWED_TRANSITIONS` does support `draft → submitted`, and `ApplicationReviewView.post()` handles `new_status == "submitted"` by calling `submit_application()`. The frontend simply doesn't render a button for this transition.

## Correctness Properties

Property 1: Bug Condition — Auth Failure During Save Stops Retries

_For any_ save attempt (manual or auto-save) where the `onSave` callback throws an `AuthenticationError` (indicating unrecoverable 401 after failed token refresh), the `useAutoSave` hook SHALL immediately stop retry attempts, set `saveStatus` to `'error'`, and set `saveError` to a session-expired message, rather than entering exponential backoff retries.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation — Valid Auth Saves Unchanged

_For any_ save attempt where the JWT access token is valid (or successfully refreshed), the `useAutoSave` hook SHALL produce the same behavior as the original code — cloud save succeeds, `saveStatus` becomes `'saved'`, `lastSaved` updates, and retry counter resets.

**Validates: Requirements 3.1, 3.2, 3.3**

Property 3: Bug Condition — Phone Input Normalization

_For any_ phone number string containing spaces that, when spaces are stripped, matches the pattern `/^\+260\d{9}$/`, the frontend validation SHALL accept the input by stripping spaces before applying the Zod regex, and the placeholder SHALL display the no-spaces format.

**Validates: Requirements 2.4, 2.5**

Property 4: Preservation — Valid Phone Numbers Unchanged

_For any_ phone number string already matching `/^\+?[0-9]{7,15}$/` (no spaces), the frontend validation SHALL continue to accept it without modification, producing the same validation result as the original code.

**Validates: Requirements 3.4**

Property 5: Bug Condition — Dev Payment Bypass

_For any_ payment step interaction in a development/test environment (where `VITE_PAYMENT_DEV_BYPASS` is `'true'` or Vite mode is `'development'`), the system SHALL provide a visible bypass mechanism that simulates payment completion without invoking the real Lenco widget, updating the application's payment status to allow submission.

**Validates: Requirements 2.6, 2.7**

Property 6: Preservation — Production Payment Enforcement

_For any_ payment step interaction in a production environment, the system SHALL continue to require real Lenco payment completion — no bypass mechanism shall be available or visible.

**Validates: Requirements 3.5**

Property 7: Bug Condition — Admin Controls for Draft and Not-Paid

_For any_ admin view of an application with status `'draft'`, the `ApplicationApprovalActions` component SHALL render a contextual message explaining the draft state and, where appropriate, a "Force Submit" button. _For any_ admin view with `payment_status` `'not_paid'`, the component SHALL render a "Mark as Paid" button to allow admin payment override.

**Validates: Requirements 2.8, 2.9**

Property 8: Preservation — Existing Admin Controls Unchanged

_For any_ admin view of an application with status `'submitted'` or `'under_review'`, and payment status `'pending_review'` or `'rejected'`, the `ApplicationApprovalActions` component SHALL produce the same rendered buttons and behavior as the original code.

**Validates: Requirements 3.6, 3.7**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:


#### Bug 1 — Auth Failure Detection in useAutoSave

**File**: `apps/admissions/src/hooks/useAutoSave.ts`

**Function**: `saveData` (the `useCallback` at line ~72)

**Specific Changes**:
1. **Import AuthenticationError**: Add `import { AuthenticationError } from '@/services/client'` at the top of the file
2. **Detect auth errors in cloud save catch**: In the `catch (cloudError)` block (~line 128), add a check before the generic retry logic:
   ```
   if (cloudError instanceof AuthenticationError) {
     // Auth is unrecoverable — stop retries, surface clear message
     setSaveStatus('error')
     setSaveError('Session expired — please sign in again to save your work.')
     // Do NOT increment retry counter or schedule backoff
     // Data is already saved to localStorage (line ~119)
     return  // Exit the cloud save catch without scheduling retries
   }
   ```
3. **Prevent auto-save retry on auth error**: Add a ref `authExpiredRef` that is set to `true` when `AuthenticationError` is caught. Check this ref at the top of `saveData` to skip cloud saves entirely once auth has expired (localStorage saves should still work).
4. **Listen for auth recovery**: Add an event listener for `mihas:auth-expired` to set `authExpiredRef = true`, and optionally listen for successful re-auth to reset it.

**File**: `apps/admissions/src/pages/student/applicationWizard/hooks/useSmartAutoSave.ts`

**Specific Changes**:
1. **Surface auth error in onError callback**: The `onError` callback currently just logs. It should check if the error is an `AuthenticationError` and propagate the session-expired state to the wizard UI.

#### Bug 2 — Phone Placeholder and Validation Fix

**File**: `apps/admissions/src/pages/student/applicationWizard/steps/BasicKycStep.tsx`

**Specific Changes**:
1. **Fix placeholder**: Change line 156 from `placeholder="e.g., +260 97 123 4567"` to `placeholder="e.g., +260971234567"`

**File**: `apps/admissions/src/pages/student/applicationWizard/types.ts`

**Specific Changes**:
1. **Add space-stripping transform**: Change the phone field from:
   ```ts
   phone: z.string().regex(/^\+?[0-9]{7,15}$/, 'Phone must be 7–15 digits, optionally prefixed with +'),
   ```
   to:
   ```ts
   phone: z.string()
     .transform(v => v.replace(/\s/g, ''))
     .pipe(z.string().regex(/^\+?[0-9]{7,15}$/, 'Phone must be 7–15 digits, optionally prefixed with +')),
   ```
   This strips spaces before validation, so "+260 97 123 4567" becomes "+260971234567" which passes both frontend and backend validation.

#### Bug 3 — Payment Dev Bypass

**File**: `apps/admissions/src/pages/student/applicationWizard/steps/PaymentStep.tsx`

**Specific Changes**:
1. **Add dev bypass check**: At the top of the component, check for dev mode:
   ```ts
   const isDevBypass = import.meta.env.DEV && import.meta.env.VITE_PAYMENT_DEV_BYPASS === 'true'
   ```
2. **Render bypass button**: When `isDevBypass` is true, render a "Simulate Payment (Dev)" button instead of (or alongside) the real "Pay now" button. This button calls `onPaymentStatusChange?.('successful')` directly without invoking the Lenco widget.
3. **Backend dev endpoint**: Add a dev-only endpoint or use the existing admin review endpoint (`POST /api/v1/applications/{id}/review/`) with `payment_status: 'verified'` to update the backend state. Alternatively, the bypass can call the existing `/payments/initiate/` + `/payments/{id}/verify/` with a mock flow.

**File**: `.env.development`

**Specific Changes**:
1. **Add bypass env var**: Add `VITE_PAYMENT_DEV_BYPASS=true`

**Note**: The bypass MUST NOT be available in production. `import.meta.env.DEV` is `false` in production builds, and `VITE_PAYMENT_DEV_BYPASS` should not be set in `.env.production`.

#### Bug 4 — Admin Controls for Draft and Not-Paid States

**File**: `apps/admissions/src/components/admin/applications/ApplicationApprovalActions.tsx`

**Specific Changes**:
1. **Add draft status handling**: In the Application Status Controls section, add a case for `currentStatus === 'draft'`:
   ```tsx
   {currentStatus === 'draft' && (
     <>
       <div className="flex-1 text-center py-2">
         <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-300">
           Draft — not yet submitted
         </span>
       </div>
       <button
         onClick={() => handleStatusUpdate('submitted')}
         disabled={updatingStatus || disabled}
         className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
       >
         Force Submit
       </button>
     </>
   )}
   ```
   The backend already supports `draft → submitted` via `ALLOWED_TRANSITIONS` and `ApplicationReviewView` handles `new_status == "submitted"` by calling `submit_application()`.

2. **Add not_paid payment handling**: In the Payment Status Controls section, add a case for `currentPaymentStatus === 'not_paid'`:
   ```tsx
   {currentPaymentStatus === 'not_paid' && (
     <div className="flex-1 text-center py-2 space-y-1">
       <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-300">
         Awaiting Payment
       </span>
       <button
         onClick={() => openPaymentReviewDialog('verified')}
         disabled={updatingPayment || disabled}
         className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
       >
         Mark as Paid
       </button>
     </div>
   )}
   ```
   This uses the existing `openPaymentReviewDialog('verified')` flow which calls `onPaymentStatusUpdate` → `ApplicationReviewView.post()` → `PaymentService.review_application_payment()`. Note: `review_application_payment` requires a payment record to exist (`PAYMENT_RECORD_REQUIRED` error). The "Mark as Paid" button should handle this error gracefully with a message like "No payment record found — the student must initiate payment first, or create a manual payment record."

3. **Add paid/successful payment badge**: Add a case for `currentPaymentStatus === 'paid'` or `currentPaymentStatus === 'successful'` to show a verified-equivalent badge, since `normalizePaymentStatus()` treats these as verified.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that simulate each bug condition and assert the expected (currently broken) behavior. Run these tests on the UNFIXED code to observe failures and understand the root cause.

**Test Cases**:
1. **Auth Error Retry Loop Test**: Mock `onSave` to throw `AuthenticationError`. Assert that `useAutoSave` enters retry loop with exponential backoff instead of stopping immediately. (will fail on unfixed code — retries will occur)
2. **Phone Placeholder Mismatch Test**: Read `BasicKycStep.tsx` placeholder text and assert it matches the backend-accepted format `/^\+260\d{9}$/`. (will fail on unfixed code — placeholder has spaces)
3. **Phone Validation With Spaces Test**: Pass "+260 97 123 4567" through the Zod schema and assert it passes. (will fail on unfixed code — spaces rejected)
4. **Dev Payment Bypass Test**: Assert that `PaymentStep` renders a bypass button when `import.meta.env.DEV` is true. (will fail on unfixed code — no bypass exists)
5. **Draft Admin Controls Test**: Render `ApplicationApprovalActions` with `currentStatus='draft'` and assert actionable buttons exist. (will fail on unfixed code — no buttons render)
6. **Not-Paid Admin Controls Test**: Render `ApplicationApprovalActions` with `currentPaymentStatus='not_paid'` and assert a "Mark as Paid" button exists. (will fail on unfixed code — no button renders)

**Expected Counterexamples**:
- Bug 1: `saveAttempts` increments to 5, `saveStatus` cycles through 'offline'/'error' instead of immediately showing session-expired
- Bug 2: Zod parse throws `ZodError` for "+260 97 123 4567"
- Bug 3: No bypass button in DOM
- Bug 4: Empty button containers for draft/not_paid states

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed functions produce the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  IF input.bugId == 1:
    result := useAutoSave_fixed.saveData() with AuthenticationError
    ASSERT result.saveStatus == 'error'
    ASSERT result.saveError CONTAINS 'session expired'
    ASSERT result.saveAttempts == 0  // no retries

  IF input.bugId == 2:
    result := zodSchema_fixed.parse({ phone: input.phoneWithSpaces })
    ASSERT result.phone == stripSpaces(input.phoneWithSpaces)

  IF input.bugId == 3:
    result := render(PaymentStep_fixed, { env: 'development' })
    ASSERT result.contains('bypass button')

  IF input.bugId == 4:
    result := render(ApprovalActions_fixed, { status: 'draft' })
    ASSERT result.contains('Force Submit button')
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed functions produce the same result as the original functions.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  IF input.bugId == 1:
    // Valid auth saves
    ASSERT useAutoSave_original(input) == useAutoSave_fixed(input)

  IF input.bugId == 2:
    // Phone without spaces
    ASSERT zodSchema_original.parse(input) == zodSchema_fixed.parse(input)

  IF input.bugId == 3:
    // Production environment
    ASSERT PaymentStep_original(input) == PaymentStep_fixed(input)

  IF input.bugId == 4:
    // submitted/under_review statuses
    ASSERT ApprovalActions_original(input) == ApprovalActions_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for non-bug inputs, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Valid Auth Save Preservation**: Verify that saves with successful `onSave` callbacks continue to update `saveStatus` to 'saved' and reset retry counters
2. **Valid Phone Preservation**: Generate random phone strings matching `/^\+?[0-9]{7,15}$/` and verify they pass validation identically before and after the fix
3. **Production Payment Preservation**: Verify PaymentStep renders identically in production mode (no bypass button visible)
4. **Existing Admin Controls Preservation**: Verify submitted/under_review/pending_review/rejected status buttons render identically after the fix

### Unit Tests

- Test `useAutoSave` with mocked `onSave` that throws `AuthenticationError` — verify immediate stop, correct status/error
- Test `useAutoSave` with mocked `onSave` that throws generic `Error` — verify retry behavior unchanged
- Test phone Zod schema with spaces → stripped and valid
- Test phone Zod schema without spaces → unchanged
- Test `ApplicationApprovalActions` rendering for each status: draft, submitted, under_review, approved, rejected
- Test `ApplicationApprovalActions` payment rendering for each status: not_paid, pending_review, verified, rejected, paid, successful
- Test PaymentStep dev bypass button visibility based on env vars

### Property-Based Tests

- Generate random `AuthenticationError` vs generic `Error` throws and verify `useAutoSave` discriminates correctly (fast-check)
- Generate random phone strings with/without spaces and verify normalization preserves digit content (fast-check)
- Generate random application status × payment status combinations and verify `ApplicationApprovalActions` always renders at least one control or informational badge (fast-check)
- Generate random environment configurations and verify payment bypass is only available in dev mode (fast-check)

### Integration Tests

- Test full wizard save flow with expired auth → verify redirect to sign-in
- Test phone entry in BasicKycStep with spaced input → verify it saves correctly to backend
- Test admin ApplicationDetailModal for draft application → verify Force Submit button triggers `submit_application`
- Test admin payment override for not_paid → verify "Mark as Paid" updates payment status
