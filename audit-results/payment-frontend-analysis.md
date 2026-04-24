# Frontend Payment Flow — Exhaustive Audit

**Date:** 2026-04-25
**Scope:** 9 files covering the entire frontend payment surface
**Auditor:** Automated deep-read analysis

---

## Table of Contents

1. [File-by-File Analysis](#file-by-file-analysis)
2. [Cross-Cutting Concerns](#cross-cutting-concerns)
3. [Gap Summary](#gap-summary)
4. [Recommendations](#recommendations)

---

## File-by-File Analysis

### 1. `lib/paymentStatus.ts` — Canonical Payment Status Normalization

**What it does:**
Pure utility module. Maps raw backend payment status strings to a 5-value canonical enum: `not_paid`, `pending_review`, `verified`, `rejected`, `deferred`. Provides helper predicates (`isPaymentVerified`, `requiresStudentPaymentAction`, `getPaymentStatusLabel`).

**Status mapping:**
| Raw backend value | Canonical | Notes |
|---|---|---|
| `pending`, `pending_review` | `pending_review` | |
| `verified`, `paid`, `successful`, `force_approved` | `verified` | |
| `failed`, `rejected` | `rejected` | |
| `deferred` | `deferred` | |
| anything else / null | `not_paid` | |

**User interaction paths:** None (pure utility).

**Error states:** None — all inputs produce a valid canonical value.

**Gaps found:**
- **GAP-PS-1:** `expired` payment status (from `poll_pending_payments_task` which expires payments >24h) is not mapped. It falls through to `not_paid`, which is semantically wrong — an expired payment is not the same as never having paid. The student sees "Awaiting Payment" instead of "Payment Expired".
- **GAP-PS-2:** `requiresStudentPaymentAction` returns `true` for `deferred`, which is correct for the Payment page but creates ambiguity — deferred is an intentional choice, not an error state requiring action.
- **GAP-PS-3:** No `cancelled` status mapping. If Lenco ever sends a `cancelled` webhook status, it falls to `not_paid`.

**Accessibility issues:** N/A (no UI).

---

### 2. `lib/phoneNormalization.ts` — Zambian Phone Normalization

**What it does:**
Normalizes Zambian phone numbers to E.164 format (`+260XXXXXXXXX`). Two exports: `normalizeZambianPhone` (full normalization) and `phoneDigits` (strip non-digits).

**Normalization paths:**
| Input pattern | Output | Correct? |
|---|---|---|
| `+260977123456` → digits `260977123456` | `+260977123456` | ✅ |
| `0977123456` (10 digits, starts with 0) | `+260977123456` | ✅ |
| `977123456` (9 digits) | `+260977123456` | ✅ |
| `260977123456789` (>12 digits after 260) | `+260977123456` (truncated to 12) | ✅ |
| `12345` (short garbage) | `12345` (raw digits returned) | ⚠️ |
| Empty string | Empty string | ⚠️ |

**Gaps found:**
- **GAP-PN-1:** Non-Zambian numbers (e.g. international students with +44, +1 prefixes) are returned as raw digits with no `+` prefix. The backend may reject these or Lenco may fail silently. No error feedback path exists for international numbers.
- **GAP-PN-2:** No validation — the function always returns *something*. Callers must separately validate length, which `PaymentForm` does but inconsistently (checks `< 12` after normalization in `handleMomoPayment`, but `phoneDigits(momoPhone).length < 10` for button disable).
- **GAP-PN-3:** Numbers like `26097712345` (11 digits starting with 260) don't match any branch — returned as raw `26097712345` without `+` prefix.

**Accessibility issues:** N/A (no UI).

---

### 3. `hooks/useFeeResolver.ts` — Dynamic Fee Resolution

**What it does:**
Calls `GET /api/v1/payments/resolve-fee/?program_code=X&nationality=Y&country=Z` whenever inputs change. Returns `{ fee, isLoading, error }`.

**User interaction paths:**
- Fires automatically when `programCode` changes (driven by wizard form `watch('program')`).
- No manual retry mechanism exposed.

**Error states:**
- API error → `error` string set, `fee` set to `null`. Displayed by `PaymentStep` as `<p className="text-destructive">`.
- Empty response (data is falsy) → `error = 'Unable to determine fee'`, `fee = null`.

**Gaps found:**
- **GAP-FR-1:** No retry mechanism. If the fee resolution fails (network blip), the student sees "Unable to determine fee" with no way to retry short of changing the program selection and changing it back.
- **GAP-FR-2:** No debounce. If `programCode`, `nationality`, or `country` change rapidly (e.g. user cycling through program dropdown), each change fires a new request. The `cancelled` flag prevents stale updates but wastes bandwidth.
- **GAP-FR-3:** `parseFloat(data.amount)` can produce `NaN` if the backend returns a non-numeric string. No `isNaN` guard — `NaN` propagates to `fee.amount`, causing `K NaN` to render in the UI.
- **GAP-FR-4:** No caching. Navigating back to the payment step re-fetches the fee every time. Could use React Query instead of raw `useEffect` + `useState`.

**Race conditions:** The `cancelled` flag in the cleanup function correctly prevents stale updates when inputs change rapidly. No race condition here.

**Stale state risks:** If the backend fee changes between page loads, the student sees the old fee until they change a form field. Low risk in practice.

**Accessibility issues:**
- Loading state uses `<Skeleton>` elements in `PaymentStep` with `role="status"` and `aria-label` — adequate.
- Error state is a plain `<p>` with no `role="alert"` — screen readers won't announce fee resolution failures.

---

### 4. `hooks/usePaymentStatus.ts` — Payment Status Polling with Backoff

**What it does:**
Polls `GET /api/v1/payments/?application_id=X` with exponential backoff (5s initial, 1.5x factor, 60s max, 30 polls max). When the latest payment is `pending`, it also fires `POST /payments/{id}/verify/` for active verification. Stops on terminal statuses (`successful`, `failed`, `deferred`) or after 5 consecutive fetch failures.

**Constants:**
- `INITIAL_INTERVAL`: 5,000ms
- `BACKOFF_FACTOR`: 1.5
- `MAX_INTERVAL`: 60,000ms
- `MAX_POLL_COUNT`: 30

**User interaction paths:**
- Automatic: starts polling on mount when `applicationId` is truthy.
- Manual: `refetch()` resets backoff and poll count, triggers immediate fetch.

**Error states:**
- Fetch failures increment `failCountRef`. After 5 consecutive failures, polling stops silently — no user feedback.
- Verify failures are caught and silently ignored (falls back to list status).

**Gaps found:**
- **GAP-PSH-1:** `normalizePaymentStatusValue` maps `normalizePaymentStatus` output but has a gap: `'not_paid'` maps to `default → null`. This means if the backend returns `not_paid` or any unmapped status, the hook returns `null` — the caller can't distinguish "no payment exists" from "status unknown".
- **GAP-PSH-2:** After 5 consecutive failures, polling stops with no user notification. The student sees a stale status with no indication that updates have stopped.
- **GAP-PSH-3:** After 30 polls (MAX_POLL_COUNT), polling stops silently. At max backoff (60s), this is ~15 minutes of polling. If the student leaves the tab open longer, status goes stale.
- **GAP-PSH-4:** The `fetchStatus` callback closes over `applicationPaymentStatus` from the parent. If the parent re-renders with a new `applicationPaymentStatus` but the same `applicationId`, the polling closure may use a stale value for the `applicationStatus === 'successful'` early-return check. The `useCallback` deps include `applicationPaymentStatus`, so React will create a new function, but the `scheduleNext` chain may still hold a reference to the old `fetchStatus`.
- **GAP-PSH-5:** `inFlightRef` prevents concurrent fetches, but if a fetch is in-flight when the component unmounts, the response handler checks `mountedRef` — this is correct. However, the `POST /verify/` call inside `fetchStatus` doesn't check `inFlightRef`, so a verify call could overlap with the next poll's list call.
- **GAP-PSH-6:** The hook fires `POST /verify/` on every poll cycle where the latest payment is `pending`. This is a write operation being called on a read-polling loop — it could trigger side effects on the backend (e.g., Lenco API rate limits, webhook re-fires).

**Race conditions:**
- **RACE-PSH-1:** `requestIdRef` correctly guards against stale responses from overlapping fetches. ✅
- **RACE-PSH-2:** The `scheduleNext` → `fetchStatus` → `scheduleNext` chain creates a new timeout each cycle. If `fetchStatus` is recreated (deps change), the old chain's `scheduleNext` call uses the old `fetchStatus`. The `useEffect` that restarts polling on `applicationId` change clears the old chain, but mid-chain dep changes could cause one stale poll.

**Stale state risks:**
- If polling stops (max count or failures) and the payment completes server-side, the student sees stale "pending" until they manually refresh the page or navigate away and back.

**Accessibility issues:** N/A (no UI — data hook only).

---

### 5. `hooks/useLencoWidget.ts` — Lenco Script Loader & Widget Opener

**What it does:**
Manages the lifecycle of the Lenco inline payment widget script. Loads `inline.js` from Lenco CDN on mount, exposes `openWidget()` to trigger `LencoPay.getPaid()`, and handles script load failures with retry.

**Key design decisions:**
- Module-level `scriptLoadPromise` singleton deduplicates concurrent loads across multiple component instances.
- 15-second script load timeout.
- 30-second safety timeout after `openWidget()` — if no Lenco callback fires, assumes widget failed to open.
- Environment-aware: uses sandbox URL in dev, production URL in prod, overridable via `VITE_LENCO_WIDGET_URL`.

**User interaction paths:**
1. **Happy path:** Script loads → `isScriptLoaded = true` → user clicks Pay → `openWidget()` → Lenco popup opens → user completes payment → `onSuccess` fires.
2. **Script load failure:** `loadError` set → UI shows error message + Retry button → user clicks Retry → `retryLoad()` clears singleton promise and re-attempts.
3. **Widget open failure:** `LencoPay.getPaid()` throws → `loadError` set → `onClose()` called → user sees error.
4. **Widget timeout:** No callback within 30s → `onClose()` called → loading state cleared.
5. **Popup blocked:** Browser blocks Lenco popup → no callback fires → 30s safety timeout triggers → `onClose()`.

**Error states:**
- Script load error: `loadError` = "Payment widget could not be loaded. Check your connection and try again."
- Script loaded but `LencoPay` undefined: `loadError` = "Payment widget loaded but did not initialize."
- Widget not ready when `openWidget` called: `loadError` = "Payment widget is not ready. Please try again."
- `getPaid` throws: `loadError` = error message from exception.

**Gaps found:**
- **GAP-LW-1:** The `retryLoad` function sets `scriptLoadPromise = null` only if `!window.LencoPay`. If the script loaded but `LencoPay` didn't initialize (e.g., script parse error), `window.LencoPay` is undefined, so retry works. But if `LencoPay` exists but is broken (e.g., `getPaid` is not a function), `retryLoad` won't clear the promise and won't re-download the script.
- **GAP-LW-2:** The 30-second safety timeout in `openWidget` calls `config.onClose()` but doesn't set any error state. The user sees the form reset to idle with no explanation of why the widget didn't open.
- **GAP-LW-3:** No CSP violation detection. If the Lenco script is blocked by Content-Security-Policy, the `error` event fires on the script tag, but the error message is generic. The student sees "Payment widget could not be loaded" with no hint that it's a CSP issue.
- **GAP-LW-4:** `openWidget` sets `isLoading = true` at the start but the `clearSafety` + `setIsLoading(false)` pattern means if `onSuccess` is called, loading is cleared before the verification call in `useApplicationPaymentAction` completes. This causes a brief flash where the button is re-enabled.
- **GAP-LW-5:** The `channels: ['card', 'mobile-money']` config passed to `LencoPay.getPaid` includes mobile-money even when the user explicitly chose the card method. This means the Lenco widget itself may show a mobile money option, creating a confusing dual-path where the user already chose card but sees mobile money again inside the widget.
- **GAP-LW-6:** No `onError` callback is passed to `LencoPay.getPaid`. If Lenco's widget has an internal error callback, it's not captured.

**Race conditions:**
- **RACE-LW-1:** If `openWidget` is called twice rapidly (double-click), two `LencoPay.getPaid` calls fire. The `initiatingRef` guard in `useApplicationPaymentAction` prevents this at the caller level, but `useLencoWidget` itself has no guard.
- **RACE-LW-2:** The safety timeout and Lenco callbacks race. If `onSuccess` fires at 29.9s and the safety timeout fires at 30s, `onClose` is called after `onSuccess`. The `clearSafety()` call in `onSuccess` prevents this — ✅ correctly handled.

**Stale state risks:**
- `mountedRef` and `loadAttemptRef` correctly prevent stale state updates after unmount or superseded load attempts.

**Accessibility issues:**
- The Lenco widget is a third-party popup/iframe. Its internal accessibility is outside our control.
- No `aria-busy` or loading announcement when the widget is opening.

---

### 6. `hooks/useApplicationPaymentAction.ts` — Card Payment Orchestrator

**What it does:**
Orchestrates the card payment flow: initiate payment on backend → open Lenco widget → verify on success → update status. Includes retry logic for initiation (2 retries with 500ms/1500ms delays), offline detection, and session-storage-persisted error messages.

**Key design decisions:**
- `initiatingRef` prevents double-initiation.
- `paymentAttemptRef` counter ensures stale callbacks from old widget sessions are ignored.
- `withRetry` retries on network/server errors (TypeError, 5xx messages) but not when offline.
- Initiation errors are persisted to `sessionStorage` so they survive component re-renders (but not page refreshes — sessionStorage persists across re-renders AND page refreshes within the same tab).

**User interaction paths:**
1. **Happy path:** User clicks "Pay by card" → `startPayment()` → POST `/payments/initiate/` → Lenco widget opens → user pays → `onSuccess` callback → POST `/payments/{id}/verify/` → status updated to `successful`.
2. **Offline:** `isOffline()` check → error message "You appear to be offline."
3. **Script not loaded:** Error message "Payment widget is still loading."
4. **No applicationId:** Error message "Please save your application before proceeding to payment."
5. **Initiation API failure:** After retries, error persisted to sessionStorage and displayed.
6. **Widget closed without payment:** Status reset to `idle` with message "Payment not completed."
7. **Verification failure after widget success:** Status set to `pending` with "Payment is being confirmed. Stay on this page." — falls back to polling.
8. **`onConfirmationPending` from Lenco:** Status set to `pending`.

**Error states:**
- `initiateError`: Displayed as `<p className="text-destructive">` in `PaymentForm`.
- Widget load error: Displayed in a warning box with Retry button.
- Verification failure: Silently falls back to pending + polling (no error shown).

**Gaps found:**
- **GAP-APA-1:** `sessionStorage` persistence of `initiateError` means if the user gets a transient error, closes the wizard, and comes back, they still see the old error. The error is only cleared on successful initiation or explicit `setInitiateError(null)`. There's no TTL or staleness check.
- **GAP-APA-2:** The `withRetry` function retries on `TypeError` unconditionally. In browsers, `fetch` throws `TypeError` for CORS errors too, not just network failures. A CORS misconfiguration would trigger 3 retry attempts before failing.
- **GAP-APA-3:** The `splitFullName` function falls back `lastName` to `firstName` if only one name part exists (`parts[0] || ''`). This means a mononymous student (single name) gets the same value for both first and last name sent to Lenco.
- **GAP-APA-4:** After `openWidget` is called, there's a comment `// Set global flag to suppress session revalidation while widget is open` but no actual code follows. This suggests an incomplete implementation — if the auth session expires while the Lenco widget is open, a session revalidation could interrupt the payment flow.
- **GAP-APA-5:** The `onClose` handler only resets to `idle` if status is not `successful` or `pending`. But if the widget is closed during the `initiating` phase (before Lenco opens), the status stays at `initiating` because `onClose` checks `paymentStatusRef.current` which is `initiating`. Actually — `onClose` fires, checks `!== 'successful' && !== 'pending'`, and `initiating` passes this check, so it resets to `idle`. ✅ This is correct.
- **GAP-APA-6:** No idempotency key is sent with `POST /payments/initiate/`. If the retry logic fires the same request twice and both succeed, two payment records could be created on the backend. The backend's `PaymentService` may handle this, but the frontend doesn't send an `idempotency-key` header.
- **GAP-APA-7:** `isOffline()` checks `navigator.onLine` which is unreliable — it only detects complete disconnection, not slow/degraded connections. A student on a flaky mobile connection may pass the offline check but still fail the API call.

**Race conditions:**
- **RACE-APA-1:** `initiatingRef` + `paymentAttemptRef` correctly prevent double-initiation and stale callbacks. ✅
- **RACE-APA-2:** If `startPayment` is called, the initiation API call is in-flight, and the component unmounts (user navigates away), `mountedRef` prevents state updates. But the Lenco widget may still open in a popup — there's no cleanup to close it.

**Stale state risks:**
- `sessionStorage`-persisted errors can show stale messages (see GAP-APA-1).
- If `applicationId` changes (user switches applications), `useEffect` reads the new persisted error, which is correct.

---

### 7. `components/student/PaymentForm.tsx` — Reusable Payment Form Component

**What it does:**
The core payment UI. Renders method selection (mobile money vs card), phone input with operator detection, payment initiation, and status-specific screens (success with confetti, pending with instructions, failed with retry). Used by both `PaymentStep` (wizard) and `Payment.tsx` (standalone page).

**State machine (implicit):**
```
idle → [user clicks Pay MoMo] → momoLoading → pending → successful | failed
idle → [user clicks Pay Card] → initiating → pending → successful | failed
failed → [user clicks Retry] → idle
pending (30s+) → [user clicks "Try again"] → idle
successful → [2s auto-advance] → onSuccess()
```

**User interaction paths:**

1. **Mobile Money happy path:**
   - User enters phone → operator auto-detected (Airtel/MTN badge shown) → clicks "Pay K{amount}" → loading spinner → "Check your phone" pending screen → auto-poll every 10s → "Payment confirmed!" → auto-advance after 2s.

2. **Mobile Money failure:**
   - API error → failed screen with classified error message → focus moves to Retry button → user clicks Retry → back to idle.

3. **Card happy path:**
   - User clicks card tab → clicks "Pay by card" → Lenco widget opens → user completes → verification → success screen.

4. **Card widget not loaded:**
   - Warning box shown: "The card payment module is loading…" with Retry button.

5. **Method switching:**
   - User can switch between mobile-money and card tabs at any time while in `idle` state.

6. **Pending timeout:**
   - After 30s of pending, "Taking too long? Try again" link appears.
   - Manual "I've approved — check now" button available immediately.

**Error classification (`classifyError`):**
| Error pattern | User message | Type |
|---|---|---|
| network/fetch/timeout/connection | "Check your connection and try again." | network |
| rate/too many/429 | "Too many attempts. Please wait a moment." | rate_limit |
| maximum payment attempts | "You have reached the maximum..." | rate_limit |
| insufficient/balance | "Insufficient funds..." | failed |
| provider error | "The mobile money provider could not process..." | failed |
| anything else | "The payment didn't go through..." | failed |

**Phone input behavior:**
- Auto-formats as user types: `0977 123 456`.
- Strips country code for display: `260977123456` → `0977 123 456`.
- Operator detection: `096x/076x` → MTN, `097x/077x` → Airtel, 4+ digits with no match → defaults to Airtel.
- Validation: too short (<9 digits) or too long (>12 digits) shows inline error.
- Button disabled until ≥10 digits entered.

**Gaps found:**
- **GAP-PF-1:** The `detectOperator` function defaults to `'airtel'` for any 4+ digit number that doesn't match MTN or Airtel prefixes. A Zamtel number (e.g., `095x`) would be incorrectly labeled as Airtel and sent to the backend with `operator: 'airtel'`.
- **GAP-PF-2:** The 1% transaction fee is hardcoded in the UI (`amount * 1.01`). If the backend changes the fee percentage, the frontend will show the wrong total. The fee percentage should come from the fee resolver or be a constant shared with the backend.
- **GAP-PF-3:** The `syncPendingPayment` function fires `POST /payments/{id}/verify/` every 10 seconds during mobile money pending state. This is aggressive — Lenco may rate-limit these verification calls. Combined with `usePaymentStatus` polling (if both are active), the same payment could be verified twice per cycle.
- **GAP-PF-4:** The `polledStatus` sync effect (`useEffect` watching `polledStatus`) calls `updateCardPaymentStatus('successful', ...)` even when the active method is mobile money. This is harmless but indicates coupling between the two payment paths.
- **GAP-PF-5:** When `polledStatus === 'failed'` and `momoStatus === 'pending'`, the momo status is set to `failed`. But if the polled status is from a *different* payment attempt (e.g., an old card payment failed), this incorrectly fails the current momo attempt.
- **GAP-PF-6:** The `handleMomoPayment` function sends `operator: momoOperator || 'airtel'` — if operator detection fails (null), it silently defaults to Airtel. The backend may reject this if the actual number is MTN.
- **GAP-PF-7:** No double-click protection on the mobile money Pay button. `momoLoading` disables the button during the API call, but if the API responds instantly and the user clicks again before React re-renders, a second call could fire. The `disabled` prop should prevent this in practice, but there's no `initiatingRef` equivalent like the card path has.
- **GAP-PF-8:** The success auto-advance (`setTimeout(() => onSuccess?.(), 2000)`) fires even if `onSuccess` is undefined. The `?.()` handles this, but if the parent doesn't pass `onSuccess`, the success screen stays forever with "Continuing to next step…" text that never resolves.
- **GAP-PF-9:** The `momoPhone` state is initialized from `initialPhone` via `formatPhone`, but if `initialPhone` changes (parent re-render with new phone), the state doesn't update — `useState` initializer only runs once.
- **GAP-PF-10:** The pending screen shows "includes 1% transaction fee" in the amount, but the fee breakdown is only shown in `PaymentStep`, not in `PaymentForm` itself. A user on the standalone Payment page sees the total with fee but no breakdown.

**Race conditions:**
- **RACE-PF-1:** The 10-second polling interval (`setInterval`) and the manual "check now" button (`syncPendingPayment`) can overlap. `syncPendingPayment` doesn't check if a previous call is in-flight. Two concurrent verify calls could fire.
- **RACE-PF-2:** If `polledStatus` changes to `'successful'` while a `syncPendingPayment` call is in-flight, both the effect and the sync callback try to set `momoStatus('successful')`. This is idempotent but wasteful.

**Stale state risks:**
- `momoPhone` doesn't sync with parent `initialPhone` changes (GAP-PF-9).
- `activeMomoPaymentId` persists across retries — `handleRetry` correctly clears it.

**Accessibility issues:**
- **A11Y-PF-1:** Method selection buttons use `<button>` elements but don't use `role="radio"` or `aria-checked`. Screen readers see two generic buttons, not a radio group. Should be `role="radiogroup"` with `role="radio"` + `aria-checked` on each option.
- **A11Y-PF-2:** The phone input has a proper `<label>` with `htmlFor` — ✅.
- **A11Y-PF-3:** Operator badge (Airtel/MTN) inside the input is purely visual. Screen readers don't announce the detected operator. Should use `aria-live="polite"` region.
- **A11Y-PF-4:** The success confetti animation uses `aria-hidden="true"` — ✅.
- **A11Y-PF-5:** The failed state focuses the retry button (`retryRef.current?.focus()`) — ✅ good focus management.
- **A11Y-PF-6:** The pending state's numbered steps (1, 2, 3) are not in an `<ol>` — they're `<div>` elements. Screen readers don't announce them as a list.
- **A11Y-PF-7:** "Checking automatically…" text with spinner has no `aria-live` region. Screen readers won't announce polling status changes.
- **A11Y-PF-8:** The "Taking too long? Try again" link appears dynamically after 30s with no `aria-live` announcement.
- **A11Y-PF-9:** Error messages below the phone input use `<p>` without `role="alert"` or `aria-live`. Screen readers won't announce validation errors as the user types.
- **A11Y-PF-10:** The network error icon (WifiOff) in the failed state has no `aria-label` or accompanying text for screen readers — the text below it provides context, but the icon itself is decorative and should have `aria-hidden="true"`.

---

### 8. `pages/student/applicationWizard/steps/PaymentStep.tsx` — Wizard Payment Step

**What it does:**
Wraps `PaymentForm` inside the application wizard. Adds fee display with breakdown, "Pay Later" (defer) functionality, and deferred state messaging. Reads program/nationality/country from the wizard form to resolve the fee dynamically.

**User interaction paths:**

1. **Pay now (mobile money or card):**
   - Fee resolves from program selection → `PaymentForm` renders → user pays → success → wizard can advance.

2. **Defer payment:**
   - User clicks "Pay Later" text link → confirmation prompt appears → user clicks "Yes, pay later" → `POST /payments/defer/` → deferred state shown → wizard can advance.
   - User can cancel the defer confirmation.

3. **Already deferred (navigating back):**
   - `polledStatus === 'deferred'` → `setDeferred(true)` → deferred info alert shown, payment form hidden.

4. **Already paid:**
   - `polledStatus === 'successful'` → `isPaymentSettledForWizard = true` → "Pay Later" link hidden, `PaymentForm` handles success display.

5. **Fee loading:**
   - Skeleton placeholders shown with `role="status"` and `aria-label`.

6. **Fee error:**
   - Red error text shown. No retry button. Payment form doesn't render (no `fee`).

**Fee breakdown display:**
```
Application fee:     K153.00
Transaction fee (1%): K1.53
─────────────────────────────
Total charged:       K154.53
```

**Gaps found:**
- **GAP-PS-1 (step):** The defer API call (`POST /payments/defer/`) has no idempotency protection. Double-clicking "Yes, pay later" could fire two requests. The `deferring` state disables the button, but same React re-render timing concern as GAP-PF-7.
- **GAP-PS-2 (step):** If `applicationId` is null (application not yet saved), the payment form doesn't render (`!deferred && fee && applicationId`), but there's no explicit message telling the student to save first. They see the fee but no payment form and no explanation.
- **GAP-PS-3 (step):** The `polledStatus` prop is typed as `'pending' | 'successful' | 'failed' | 'deferred' | null` but `PaymentForm` accepts `'pending' | 'successful' | 'failed' | null`. When `polledStatus === 'deferred'`, the step passes `null` to `PaymentForm` (`polledStatus === 'deferred' ? null : polledStatus`). This is correct but fragile — a type mismatch could slip through.
- **GAP-PS-4 (step):** The `useEffect` that syncs `polledStatus === 'successful'` with `deferred` state (`if (polledStatus === 'successful' && !deferred) setDeferred(false)`) is confusing. If payment succeeds, it sets `deferred` to `false`, which is correct (payment is no longer deferred). But the condition `!deferred` means if `deferred` is already `false`, it sets it to `false` again — harmless but indicates unclear intent.
- **GAP-PS-5 (step):** No loading/disabled state on the "Pay Later" text link while the defer API call is in-flight. The `disabled` prop is set on the confirmation button but not on the initial "Pay Later" link. A user could click "Pay Later", see the confirmation, then click "Pay Later" again (the link is still visible behind the confirmation UI) — actually, the link is replaced by the confirmation UI via `!deferConfirm` conditional, so this is safe. ✅
- **GAP-PS-6 (step):** The fee breakdown hardcodes 1% transaction fee. Same issue as GAP-PF-2.
- **GAP-PS-7 (step):** If `fee` is null and `feeError` is null and `feeLoading` is false (e.g., no program selected), the UI shows "Select a program to see the fee". But if the student is on the payment step, they should have already selected a program in an earlier step. This message is a fallback that shouldn't normally appear — but if the wizard form state is corrupted, it could.

**Race conditions:**
- The defer API call and payment form actions are independent — no race condition between them because the defer confirmation UI replaces the payment form area.

**Stale state risks:**
- If the student changes their program in a previous step and navigates back to payment, `useFeeResolver` re-fires with the new program code. The old fee flashes briefly before the new one loads. Low severity.

**Accessibility issues:**
- **A11Y-PS-1:** The `<fieldset>` with `<legend className="sr-only">Payment</legend>` is good practice. ✅
- **A11Y-PS-2:** The "Pay Later" link uses `<button type="button">` — correct, not a link. ✅
- **A11Y-PS-3:** The deferred state `<Alert>` component likely has appropriate ARIA roles (depends on Alert implementation).
- **A11Y-PS-4:** The fee breakdown table uses `<div>` elements instead of a `<table>` or `<dl>`. Screen readers won't announce the label-value pairs as associated data.
- **A11Y-PS-5:** The defer error (`deferError`) is shown as a plain `<p>` with no `role="alert"`.

---

### 9. `pages/student/Payment.tsx` — Standalone Payment Page

**What it does:**
Full-page payment history and recovery surface. Lists all non-draft applications with their payment status and history. Allows inline payment for applications with outstanding fees. Uses React Query for data fetching.

**Data flow:**
1. Fetches all user applications via `applicationService.list({ mine: true })`.
2. Fetches all user payment records via `GET /api/v1/payments/`.
3. Groups payment records by `application_id`.
4. Renders an `ApplicationPaymentCard` for each non-draft application.

**User interaction paths:**

1. **View payment history:**
   - Page loads → applications and payment records fetched → cards rendered with status badges and payment record timeline.

2. **Pay outstanding fee:**
   - User clicks "Pay Now" on an unpaid application card → card expands → `PaymentForm` renders inline → user pays → `handlePaymentRefresh` refetches both queries.

3. **Download receipt:**
   - For verified payments, `DownloadReceiptButton` is shown.

4. **Deep link to specific application:**
   - URL param `?applicationId=X` → that card is pre-expanded and highlighted.

5. **No applications:**
   - Empty state with "Back to dashboard" button.

6. **Error loading:**
   - `ErrorDisplay` with retry button.

**Gaps found:**
- **GAP-PP-1:** The payment records query fetches ALL user payments (`GET /api/v1/payments/`) without filtering by application. For a student with many applications and payment attempts, this could return a large payload. No pagination.
- **GAP-PP-2:** The `ApplicationPaymentCard` calls `useFeeResolver` conditionally: only when `showPayForm && !latestRecord`. This means the hook is called with an empty string for `programCode` when there IS a latest record, which triggers the `if (!programCode)` early return in `useFeeResolver`. This works but violates React's rules of hooks if the condition changes between renders — actually, the hook is always called (not conditionally), just with different args. ✅ Safe.
- **GAP-PP-3:** `canPayFromPage` excludes `draft` status but includes all other statuses where payment is needed. However, `withdrawn`, `rejected`, `expired`, `enrollment_expired` applications probably shouldn't show a "Pay Now" button — paying for a rejected application is pointless. The function checks `requiresStudentPaymentAction(app.payment_status)` which only looks at payment status, not application status.
- **GAP-PP-4:** The `PaymentForm` in `ApplicationPaymentCard` doesn't receive `polledStatus` or `onPaymentStatusChange` props. This means the form's internal polling (`syncPendingPayment` every 10s) is the only status update mechanism. The parent's React Query cache won't update until `onPaymentRefresh` is called (on success or manual refresh).
- **GAP-PP-5:** Payment records are fetched once and not polled. If a payment completes while the page is open (e.g., mobile money approved on phone), the payment history table won't update until the user manually triggers a refresh via the `PaymentForm`'s success callback.
- **GAP-PP-6:** The `paymentsByApp` grouping uses `(r as any).application_id` — unsafe type assertion. If the backend changes the field name, this silently fails and all records go ungrouped.
- **GAP-PP-7:** The `normalizeAmount` function handles `number` and `string` but not `null` or `undefined` explicitly — it returns `null` for these via the final `return null`. This is correct but the function is called with `rec.amount` which is typed as `number | string | null`, so it works.
- **GAP-PP-8:** No `onPaymentStatusChange` prop passed to `PaymentForm` in `ApplicationPaymentCard`. The form's internal `onPaymentStatusChange` callback (used to sync momo status with parent) is never called. This means the parent card doesn't know when payment status changes — it only knows when `onPaymentRefresh` (mapped to `onSuccess`) fires.
- **GAP-PP-9:** The page has no real-time status updates. Unlike the wizard (which has `usePaymentStatus` polling), the standalone page relies entirely on the `PaymentForm`'s internal 10-second polling during pending state. Once the form is collapsed, no polling occurs.
- **GAP-PP-10:** `selectedApplicationId` from URL params auto-expands the card via `isSelected`, but `expanded` state is initialized from `isSelected` in `useState` — if the URL param changes without remounting the component, the expansion state won't update.

**Race conditions:**
- **RACE-PP-1:** `handlePaymentRefresh` calls `refetchApps()` and `refetchPayments()` in parallel. If the payment just completed, the applications query might return the old payment status while the payments query returns the new record. This is a brief inconsistency that resolves on the next render.

**Stale state risks:**
- Application list has `staleTime: 2 * 60_000` (2 minutes). Payment status changes within 2 minutes of the last fetch won't trigger a re-fetch from React Query's perspective.
- Payment records use `CACHE_CONFIG.applications` stale time — should probably have its own config.

**Accessibility issues:**
- **A11Y-PP-1:** The page uses `PageShell` with proper title/subtitle — ✅.
- **A11Y-PP-2:** Loading state has `role="status"` and `aria-label` — ✅.
- **A11Y-PP-3:** The "Pay Now" / "Hide" toggle button changes label based on state — ✅ good for screen readers.
- **A11Y-PP-4:** Payment record rows use `<div>` instead of `<table>`. For tabular data (status, amount, date), a `<table>` with proper headers would be more accessible.
- **A11Y-PP-5:** The "Back to Dashboard" link uses `className="feature-chip"` — unclear if this has proper link semantics. It's a `<Link>` component, so it renders as `<a>` — ✅.
- **A11Y-PP-6:** Badge components may not announce their content to screen readers if they're purely visual. Depends on Badge implementation.
- **A11Y-PP-7:** The expand/collapse interaction on `ApplicationPaymentCard` doesn't use `aria-expanded` on the toggle button.

---

## Cross-Cutting Concerns

### Dual Polling Problem

The payment flow has **two independent polling mechanisms** that can run simultaneously:

1. **`usePaymentStatus`** (used by the wizard parent): Polls `GET /payments/?application_id=X` with exponential backoff (5s–60s), and fires `POST /payments/{id}/verify/` when status is pending.
2. **`PaymentForm` internal polling**: `setInterval` every 10s calling `syncPendingPayment`, which fires `POST /payments/{id}/verify/` for mobile money, then calls `onPaymentStatusRefresh` (which triggers the parent's `usePaymentStatus.refetch()`).

**Impact:** During a pending mobile money payment, the backend receives:
- 1 verify POST every 10s from `PaymentForm`
- 1 verify POST every 5–60s from `usePaymentStatus`
- 1 list GET every 5–60s from `usePaymentStatus`
- Plus any manual "check now" clicks

This is **2–3 verify calls per 10-second window** hitting the Lenco API. At scale, this could trigger rate limiting.

### Transaction Fee Hardcoding

The 1% transaction fee is hardcoded in three places:
1. `PaymentForm.tsx` — button label and pending screen amount (`amount * 1.01`)
2. `PaymentStep.tsx` — fee breakdown display (`fee.amount * 0.01` and `fee.amount * 1.01`)

If the fee changes, all three must be updated manually. The fee percentage should be returned by the fee resolver API or defined as a single constant.

### Status Normalization Chain

Payment status goes through multiple normalization layers:
```
Backend raw status
  → normalizePaymentStatus() [lib/paymentStatus.ts] → CanonicalPaymentStatus (5 values)
  → normalizePaymentStatusValue() [hooks/usePaymentStatus.ts] → PaymentStatusValue (4 values + null)
  → PaymentForm internal state (momoStatus: 4 values)
  → PaymentForm derived state (isPaymentSuccessful, isPaymentPending, isPaymentFailed)
```

Each layer can lose information. Notably:
- `expired` → `not_paid` → `null` (lost)
- `force_approved` → `verified` → `successful` (correct but lossy)
- `not_paid` → `null` (can't distinguish from unknown)

### Mobile Money vs Card State Coupling

`PaymentForm` maintains separate state for mobile money (`momoStatus`, `momoError`, `activeMomoPaymentId`) and card (`cardPaymentStatus` from `useApplicationPaymentAction`). But the `polledStatus` prop affects both:
- `polledStatus === 'successful'` sets `momoStatus = 'successful'` AND calls `updateCardPaymentStatus('successful')`.
- `polledStatus === 'failed'` only affects momo (when `momoStatus === 'pending'`).

This coupling means a card payment success reported via polling also resets the momo state, and vice versa. In practice this works because only one method is active at a time, but the code doesn't enforce single-method exclusivity.

### Missing `aria-live` Regions

Dynamic status changes (pending → success, pending → failed, error messages appearing) are not announced to screen readers. The following should use `aria-live="polite"` or `role="alert"`:
- Payment status transitions (success, failure, pending)
- Phone validation errors
- Operator detection badge
- "Taking too long?" message appearance
- Fee resolution errors
- Defer errors

---

## Gap Summary

### Critical (Payment Correctness)

| ID | Description | File | Impact |
|---|---|---|---|
| GAP-PF-3 | Dual polling fires 2–3 verify POSTs per 10s window | PaymentForm + usePaymentStatus | Lenco rate limiting, duplicate webhooks |
| GAP-PF-5 | `polledStatus` from old payment attempt can fail current attempt | PaymentForm | False failure state |
| GAP-APA-6 | No idempotency key on `POST /payments/initiate/` | useApplicationPaymentAction | Duplicate payment records |
| GAP-PP-3 | "Pay Now" shown for rejected/withdrawn/expired applications | Payment.tsx | Wasted payment on dead application |
| GAP-PS-1 | `expired` payment status not mapped | paymentStatus.ts | Student sees "Awaiting Payment" for expired payment |

### High (UX/Data Integrity)

| ID | Description | File | Impact |
|---|---|---|---|
| GAP-FR-1 | No retry on fee resolution failure | useFeeResolver | Student stuck without fee, can't pay |
| GAP-FR-3 | `parseFloat` can produce NaN, shown as "K NaN" | useFeeResolver | Broken fee display |
| GAP-PSH-2 | Polling stops after 5 failures with no notification | usePaymentStatus | Stale status, student unaware |
| GAP-PSH-3 | Polling stops after 30 polls with no notification | usePaymentStatus | Stale status after ~15 min |
| GAP-PF-2 | 1% fee hardcoded in 3 places | PaymentForm + PaymentStep | Fee mismatch if backend changes |
| GAP-PF-9 | Phone input doesn't sync with parent prop changes | PaymentForm | Stale phone number |
| GAP-APA-4 | Session revalidation suppression comment but no code | useApplicationPaymentAction | Auth expiry during widget open |
| GAP-PP-4 | No `polledStatus`/`onPaymentStatusChange` on standalone page | Payment.tsx | No parent-level status sync |
| GAP-LW-5 | Lenco widget shows mobile money option even when card selected | useLencoWidget | Confusing dual payment path |

### Medium (Edge Cases)

| ID | Description | File | Impact |
|---|---|---|---|
| GAP-PN-1 | International phone numbers returned as raw digits | phoneNormalization | Payment failure for non-Zambian numbers |
| GAP-PF-1 | Zamtel numbers detected as Airtel | PaymentForm | Wrong operator sent to backend |
| GAP-PF-6 | Null operator defaults to Airtel silently | PaymentForm | Wrong operator for edge cases |
| GAP-PF-8 | Success screen says "Continuing…" but no `onSuccess` on standalone page | PaymentForm | Misleading text |
| GAP-APA-1 | SessionStorage error persists across navigation | useApplicationPaymentAction | Stale error shown |
| GAP-APA-3 | Mononymous students get same first/last name | useApplicationPaymentAction | Minor Lenco data issue |
| GAP-LW-2 | 30s safety timeout gives no error feedback | useLencoWidget | Silent failure |
| GAP-PP-10 | URL param change doesn't update expansion state | Payment.tsx | Deep link doesn't work on SPA navigation |

### Low (Code Quality)

| ID | Description | File | Impact |
|---|---|---|---|
| GAP-PF-4 | Card status updated on momo success path | PaymentForm | Unnecessary state write |
| GAP-PS-4 (step) | Confusing deferred/success sync effect | PaymentStep | Code clarity |
| GAP-PP-6 | `(r as any).application_id` unsafe assertion | Payment.tsx | Silent failure if field renamed |
| GAP-APA-2 | `withRetry` retries on CORS TypeError | useApplicationPaymentAction | 3 wasted retries on CORS error |
| GAP-PSH-6 | Verify POST on every poll cycle (write in read loop) | usePaymentStatus | Backend side effects |

### Accessibility

| ID | Description | File | Severity |
|---|---|---|---|
| A11Y-PF-1 | Method selection not a radio group | PaymentForm | High — screen reader confusion |
| A11Y-PF-9 | Phone validation errors not announced | PaymentForm | High — blind users miss errors |
| A11Y-PF-6 | Pending steps not in `<ol>` | PaymentForm | Medium |
| A11Y-PF-7 | No `aria-live` on polling status | PaymentForm | Medium |
| A11Y-PF-8 | "Taking too long?" not announced | PaymentForm | Medium |
| A11Y-PS-4 (step) | Fee breakdown not in `<dl>` or `<table>` | PaymentStep | Medium |
| A11Y-PS-5 (step) | Defer error not `role="alert"` | PaymentStep | Medium |
| A11Y-PP-4 | Payment records not in `<table>` | Payment.tsx | Medium |
| A11Y-PP-7 | No `aria-expanded` on expand/collapse | Payment.tsx | Medium |
| A11Y-PF-3 | Operator badge not announced | PaymentForm | Low |

---

## Recommendations

### Immediate (Pre-Launch)

1. **Map `expired` payment status** in `paymentStatus.ts` — add it to the `rejected` bucket or create a new `expired` canonical status.
2. **Deduplicate polling** — when `PaymentForm` is active with its own 10s polling, disable or pause `usePaymentStatus` polling to avoid double-verify calls.
3. **Add idempotency key** to `POST /payments/initiate/` in `useApplicationPaymentAction`.
4. **Filter "Pay Now" by application status** in `Payment.tsx` — don't show payment for `withdrawn`, `rejected`, `expired`, `enrollment_expired` applications.
5. **Add `NaN` guard** in `useFeeResolver` after `parseFloat`.

### Short-Term

6. **Extract transaction fee percentage** to a shared constant or return it from the fee resolver API.
7. **Add retry button** to fee resolution failure state in `PaymentStep`.
8. **Add `aria-live` regions** for payment status transitions, validation errors, and dynamic content.
9. **Convert method selection** to `role="radiogroup"` with `role="radio"` + `aria-checked`.
10. **Add `aria-expanded`** to the expand/collapse button in `ApplicationPaymentCard`.
11. **Notify user** when polling stops (max count or consecutive failures) with a "Status updates paused — click to refresh" message.

### Medium-Term

12. **Add Zamtel support** to operator detection (prefix `095x`/`075x`).
13. **Handle international phone numbers** — either validate and reject with a clear message, or support E.164 for non-Zambian numbers.
14. **Implement session revalidation suppression** during Lenco widget open (the comment exists but code is missing).
15. **Use React Query** for fee resolution instead of raw `useEffect` + `useState` to get caching and retry for free.
16. **Add `onError` callback** to `LencoPay.getPaid` configuration if the Lenco SDK supports it.
