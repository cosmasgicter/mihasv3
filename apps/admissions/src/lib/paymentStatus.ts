// ---------------------------------------------------------------------------
// UI state matrix (payment-hardening Phase 4, Task 34)
// ---------------------------------------------------------------------------
//
// Pure mapping from backend payment signals to a UI state enum. Used by
// PaymentStep when `VITE_PAYMENT_HARDENING_UI=true`. Deterministic and
// side-effect-free so Property 18 (Task 35.1) can run it under fast-check.

import type { PaymentStableCode } from './paymentErrorCodes'

export type CanonicalPaymentStatus = 'not_paid' | 'pending_review' | 'verified' | 'rejected' | 'deferred'

export function normalizePaymentStatus(paymentStatus?: string | null): CanonicalPaymentStatus {
  switch (paymentStatus) {
    case 'pending':
    case 'pending_review':
      return 'pending_review'
    case 'verified':
    case 'paid':
    case 'successful':
    case 'force_approved':
      return 'verified'
    case 'failed':
    case 'rejected':
      return 'rejected'
    case 'deferred':
      return 'deferred'
    case 'expired':
      return 'not_paid'
    default:
      return 'not_paid'
  }
}

/**
 * Whether a fee still needs the **student**, as opposed to the school or the
 * provider.
 *
 * `deferred` is included, and that is admissions-v2 task **11.1**'s deliberate
 * widening (R13.1, findings STU-04 / STU-09). Task 10.6 found the gap on the
 * application workspace and fixed it *locally* rather than here, because this
 * helper also drives `Dashboard.tsx`, `ApplicationListItem.tsx` and
 * `DashboardStatusOverview.tsx` — surfaces 10.6 measured nothing about — and it
 * pinned that restraint with a test naming 11.1 as the lane that would change it.
 *
 * The defect the widening closes: a student who chose to pay later saw no fee
 * affordance anywhere on the dashboard, while `deferred_payment_reminder_task`
 * emailed them about that same fee every day. A deferral is a promise to pay, not
 * a resolution; the four surfaces now agree that it is outstanding.
 *
 * This is **not** the submission gate. `isPaymentResolvedForProgress` answers
 * "may this application be submitted", where a deferral *is* resolved (that is
 * what deferring means), and it is deliberately unchanged. Two questions, two
 * helpers.
 */
export function requiresStudentPaymentAction(paymentStatus?: string | null) {
  const normalized = normalizePaymentStatus(paymentStatus)
  return normalized === 'not_paid' || normalized === 'rejected' || normalized === 'deferred'
}

export function isPaymentVerified(paymentStatus?: string | null) {
  return normalizePaymentStatus(paymentStatus) === 'verified'
}

/**
 * Whether payment is "resolved" for wizard progression — i.e. the student
 * may advance past / submit from the payment step. True when the payment is
 * verified (covers legacy `verified`/`paid` and canonical
 * `successful`/`force_approved`) OR the student deferred payment.
 *
 * Use this for every wizard payment gate. Branching on the raw
 * `=== 'successful'` string misses `verified`/`paid`/`force_approved` and
 * strands students (e.g. admin offline-payment overrides) on the payment step.
 */
export function isPaymentResolvedForProgress(paymentStatus?: string | null) {
  return normalizePaymentStatus(paymentStatus) === 'verified' || paymentStatus === 'deferred'
}

/**
 * Payment statuses for which staff may approve an application (SJR R7-b).
 *
 * Mirrors the backend's `RESOLVED_PAYMENT_STATUSES`
 * (`backend/apps/documents/payment_constants.py`); the server gate is
 * authoritative and `force=true` is unchanged. Drift-guarded by
 * `backend/tests/unit/test_approval_payment_gate_drift_sjr.py`, which parses
 * this literal. A deferral is a promise to pay and is resolved for approval.
 */
export const APPROVAL_PAYMENT_STATUSES = [
  'successful',
  'force_approved',
  'verified',
  'paid',
  'deferred',
] as const

/**
 * Answers "may staff approve?". One helper per question: this is deliberately not
 * `isPaymentVerified` (the receipt and letter question), and it agrees with
 * `isPaymentResolvedForProgress` for every status the module knows.
 */
export function isPaymentResolvedForApproval(paymentStatus?: string | null) {
  return (APPROVAL_PAYMENT_STATUSES as readonly string[]).includes(paymentStatus ?? '')
}

export function getPaymentStatusLabel(paymentStatus?: string | null) {
  switch (normalizePaymentStatus(paymentStatus)) {
    case 'verified':
      return 'Verified'
    case 'rejected':
      return 'Payment Rejected'
    case 'pending_review':
      return 'Awaiting Payment Review'
    case 'deferred':
      return 'Deferred'
    default:
      return 'Awaiting Payment'
  }
}

/** Canonical backend payment status names (mirrors service state machine). */
export type CanonicalPaymentServiceStatus =
  | 'pending'
  | 'deferred'
  | 'successful'
  | 'failed'
  | 'expired'
  | 'force_approved'

/**
 * Server-derived payment phase (backend `payment_phase.derive_payment_phase`).
 *
 * `status` says whether the money arrived; `phase` says who is being waited on.
 * The client never derives this — it is read from the payment payload.
 */
export type PaymentPhase =
  | 'not_started'
  | 'action_required'
  | 'provider_processing'
  | 'paid'
  | 'failed_retryable'
  | 'expired'
  | 'deferred'

/** Every possible UI state the PaymentStep can render. */
export type PaymentUiState =
  | 'idle'
  | 'initiating'
  /**
   * The student has a prompt on their handset and must enter their PIN. Renders
   * an instruction plus a resend affordance, and gives up waiting sooner —
   * a prompt they never saw is cheap to re-send.
   */
  | 'action_required'
  /**
   * The request is with Lenco and the student can do nothing. Renders a wait
   * state with no action, and waits longer before offering a way out, because
   * a premature retry is how someone gets charged twice.
   */
  | 'provider_processing'
  | 'awaiting_provider'
  | 'still_confirming'
  | 'confirmed'
  | 'already_paid'
  | 'retry_with_different_number'
  | 'unavailable'
  | 'max_attempts_reached'
  | 'sensitive_fields_locked'
  | 'rate_limited'
  | 'needs_admin_followup'
  | 'expired'

export interface DerivePaymentUiStateInput {
  backendStatus: CanonicalPaymentServiceStatus | null
  inflight: boolean
  stableCode: PaymentStableCode | null
  pollingExceededTimeout: boolean
  /**
   * Server-derived phase for the pending payment, when the payload carried one.
   * Absent (`undefined`/`null`) keeps the pre-8.2 behaviour, so an older payload
   * still renders a sane state instead of nothing.
   */
  phase?: PaymentPhase | null
}

/**
 * Deterministic mapping from backend signals to a UI state.
 *
 * Priority order (explicit — matches design §"Frontend UI State Matrix"):
 *   1. Terminal confirmed states short-circuit everything else.
 *   2. Explicit stable-code overrides.
 *   3. Polling timeout on pending → still_confirming (never failed; R14.3).
 *   4. Inflight → initiating.
 *   5. Raw backend status mapping, split by server-derived `phase` for pending
 *      payments: `action_required` (the student must approve on their handset)
 *      vs `provider_processing` (we are waiting on Lenco). Task 8.2 / STU-09.
 *   6. Default → idle.
 *
 * Pure function — no Date, no Math.random, no I/O.
 */
export function derivePaymentUiState(input: DerivePaymentUiStateInput): PaymentUiState {
  const { backendStatus, inflight, stableCode, pollingExceededTimeout, phase } = input

  // --- 1. Confirmed terminal states ---
  if (backendStatus === 'successful' || backendStatus === 'force_approved') {
    return 'confirmed'
  }

  // --- 2. Explicit stable-code overrides ---
  if (stableCode === 'ALREADY_PAID') {
    return 'already_paid'
  }
  if (stableCode === 'MAX_PAYMENT_ATTEMPTS_EXCEEDED') {
    return 'max_attempts_reached'
  }
  if (stableCode === 'PAYMENT_SENSITIVE_FIELDS_LOCKED') {
    return 'sensitive_fields_locked'
  }
  if (stableCode === 'RATE_LIMITED') {
    return 'rate_limited'
  }
  if (stableCode === 'PROVIDER_UNAVAILABLE' || stableCode === 'PAYMENT_UNAVAILABLE') {
    // PROVIDER_UNAVAILABLE paired with a pending status means we can retry
    // with a different number; when the row already expired, treat it as
    // unavailable.
    if (backendStatus === 'pending' || backendStatus === null) {
      return 'retry_with_different_number'
    }
    return 'unavailable'
  }
  if (
    stableCode === 'AMOUNT_MISMATCH' ||
    stableCode === 'CURRENCY_MISMATCH' ||
    stableCode === 'MISSING_PROVIDER_REFERENCE' ||
    stableCode === 'CANNOT_REVERSE_SUCCESSFUL_PAYMENT' ||
    stableCode === 'OVERRIDE_REASON_REQUIRED' ||
    stableCode === 'RECEIPT_NOT_ELIGIBLE'
  ) {
    return 'needs_admin_followup'
  }

  // --- 3. Polling timeout on pending → still_confirming (R14.3) ---
  if (backendStatus === 'pending' && pollingExceededTimeout) {
    return 'still_confirming'
  }

  // --- 4. Inflight → initiating ---
  if (inflight) {
    return 'initiating'
  }

  // --- 5. Raw backend status mapping ---
  if (backendStatus === 'pending') {
    // Task 8.2 (STU-09): a pending payment is not one state. When the server
    // told us who is being waited on, say so — telling a student to enter a PIN
    // they were never prompted for, or to wait while their handset is buzzing,
    // are both worse than saying nothing.
    if (phase === 'action_required') {
      return 'action_required'
    }
    if (phase === 'provider_processing') {
      return 'provider_processing'
    }
    return 'awaiting_provider'
  }
  if (backendStatus === 'expired') {
    return 'expired'
  }
  if (backendStatus === 'failed') {
    return 'retry_with_different_number'
  }
  if (backendStatus === 'deferred') {
    // Deferred is a valid student-chosen state — we show the idle
    // initiate UI so they can pay at any time.
    return 'idle'
  }

  // --- 6. Default ---
  return 'idle'
}

// `isPaymentHardeningUiEnabled()` and the `VITE_PAYMENT_HARDENING_UI` build
// flag were removed in admissions-v2 task 8.2. The UI state matrix and the
// payment recovery store are the only behaviour — a default-off flag meant a
// student's mid-payment refresh recovered or did not depending on how the
// bundle was built.

// ---------------------------------------------------------------------------
// Idempotency key (payment-hardening Task 36.1)
// ---------------------------------------------------------------------------

/**
 * Build a unique idempotency key.
 *
 * When `applicationId` is provided the format is `pay-<first8>-<uuid>`.
 * Without an argument the format is a plain UUID (or legacy fallback).
 *
 * Uses `crypto.randomUUID()` when available. On legacy browsers without
 * the `crypto.randomUUID` API, falls back to a `Math.random`-based
 * string — flagged with `LEGACY FALLBACK` so it is easy to grep.
 */
export function generateIdempotencyKey(applicationId?: string): string {
  const prefix = applicationId ? `pay-${applicationId.slice(0, 8)}-` : ''

  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}${crypto.randomUUID()}`
  }

  // LEGACY FALLBACK: older browsers without `crypto.randomUUID`. The
  // output is still unique enough for idempotency purposes because the
  // backend keys on `(idempotency_key, actor, method, path, body_hash)`.
  const rand = Math.random().toString(36).slice(2, 14)
  const time = Date.now().toString(36)
  return `${prefix}${time}-${rand}`
}

// ---------------------------------------------------------------------------
// Waiting-state affordances (admissions-v2 task 8.2, STU-09)
// ---------------------------------------------------------------------------

/**
 * Copy and wait budget for the two states where nothing has failed but nothing
 * has settled either. The difference is not cosmetic: one of them asks the
 * student to do something, the other explicitly asks them not to.
 *
 * `timeoutSeconds` mirrors the backend's `phase_timeout_seconds`; it is a UI wait
 * budget, not a payment deadline (a payment's real expiry is 24 h and is enforced
 * server-side).
 */
export const PAYMENT_WAITING_STATES: Record<
  'action_required' | 'provider_processing',
  {
    title: string
    body: string
    /** Whether the student has something to do right now. */
    studentActionable: boolean
    timeoutSeconds: number
    /** What to offer once the wait budget is spent. */
    onTimeout: string
  }
> = {
  action_required: {
    title: 'Approve the payment on your phone',
    body: 'We sent a prompt to your mobile money number. Enter your PIN to approve the payment. Keep this page open.',
    studentActionable: true,
    timeoutSeconds: 120,
    onTimeout: "Didn't get the prompt? Send it again.",
  },
  provider_processing: {
    title: 'Confirming with your provider',
    body: "Your payment is with your mobile money provider. There's nothing to do — we'll update this page as soon as they confirm.",
    studentActionable: false,
    timeoutSeconds: 600,
    onTimeout: 'Still confirming. You can safely leave this page and check back — we will not charge you twice.',
  },
}

/** Wait budget in milliseconds for a UI state, or `null` if it is not a wait. */
export function paymentWaitBudgetMs(state: PaymentUiState): number | null {
  if (state === 'action_required' || state === 'provider_processing') {
    return PAYMENT_WAITING_STATES[state].timeoutSeconds * 1000
  }
  return null
}
