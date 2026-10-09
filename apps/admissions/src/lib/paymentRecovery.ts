/**
 * What a submitted application's payment situation *is*, and what the student can
 * do about it — the post-submission half of the payment ownership split.
 *
 * Admissions-v2 task 8.3 (**R12.3**, R12.4, R12.6), findings **STU-09** / STU-24.
 *
 * R12.3 splits payment ownership in two: the wizard owns pre-submission pay or
 * defer, and `/student/payment` owns every post-submission state — deferred,
 * failed, expired, pending recovery — plus history. This module is the payment
 * page's half of that contract: one place that turns server-authored payment
 * signals into the one thing the student should see and the one thing they can do.
 *
 * Three deliberate constraints:
 *
 * 1. **No new state vocabulary.** The keys are `PaymentUiState` from
 *    `derivePaymentUiState` (task 8.2), which is itself derived from the server's
 *    `status` + `phase`. `PAYMENT_RECOVERY_PRESENTATION` is a *total* `Record`, so
 *    a new UI state is a compile error here until someone decides what it says to
 *    a student — not a silently unhandled screen.
 * 2. **No second copy of the waiting copy.** The two waiting states reuse
 *    `PAYMENT_WAITING_STATES` (task 8.2), including its 120 s / 600 s budgets, so
 *    the payment page and the wizard cannot describe the same wait differently.
 * 3. **`allowsInitiate` is a safety property, not styling.** A second collection
 *    request against a provider that is still working is how a student gets
 *    charged twice, so every waiting state answers `false`.
 *
 * Requirements: R12.3 (ownership split), R12.4 (states are distinguished),
 * R12.6 (server amounts, provider state, recovery action, no indefinite disabled
 * controls).
 */

import {
  PAYMENT_WAITING_STATES,
  derivePaymentUiState,
  normalizePaymentStatus,
  type CanonicalPaymentServiceStatus,
  type PaymentPhase,
  type PaymentUiState,
} from './paymentStatus'
import type { PaymentStableCode } from './paymentErrorCodes'
import type { StatusBadgeTone } from '@/components/ui/StatusBadge'

/** The one thing a student can do from the payment page in a given state. */
export type PaymentRecoveryAction =
  /** Open the inline payment form for a first or fresh attempt. */
  | 'pay'
  /** Re-read the provider state. Never starts a second collection. */
  | 'check_status'
  /** Download the official receipt for a settled payment. */
  | 'receipt'
  /** Hand off to the tenant support contact. */
  | 'support'

export interface PaymentRecoveryPresentation {
  /** Status word. Always rendered with an icon — never colour alone. */
  label: string
  tone: StatusBadgeTone
  /** What is true right now, in plain English. */
  detail: string
  /** The single action offered, or `null` when there is genuinely nothing to do. */
  action: PaymentRecoveryAction | null
  /** Label for `action`. `null` exactly when `action` is `null`. */
  actionLabel: string | null
  /**
   * Whether an initiate control may be rendered in this state.
   *
   * `false` for every state where a request is already in the provider's hands.
   * This is the double-charge guard (R14.1) expressed as data, so it cannot be
   * forgotten by a new call site.
   */
  allowsInitiate: boolean
}

/**
 * Every `PaymentUiState`, and what the payment page says about it.
 *
 * Total by construction: adding a state to `PaymentUiState` fails the build here.
 */
export const PAYMENT_RECOVERY_PRESENTATION: Record<PaymentUiState, PaymentRecoveryPresentation> = {
  idle: {
    label: 'Not paid',
    tone: 'warning',
    detail: 'The application fee has not been paid yet. You can pay it here at any time.',
    action: 'pay',
    actionLabel: 'Pay now',
    allowsInitiate: true,
  },
  initiating: {
    label: 'Starting payment',
    tone: 'info',
    detail: 'We are sending your payment request to the provider.',
    action: null,
    actionLabel: null,
    allowsInitiate: false,
  },
  action_required: {
    label: 'Approve on your phone',
    tone: 'info',
    detail: PAYMENT_WAITING_STATES.action_required.body,
    action: 'check_status',
    actionLabel: "I've approved — check now",
    allowsInitiate: false,
  },
  provider_processing: {
    label: 'With your provider',
    tone: 'info',
    detail: PAYMENT_WAITING_STATES.provider_processing.body,
    action: 'check_status',
    actionLabel: 'Check payment now',
    allowsInitiate: false,
  },
  awaiting_provider: {
    label: 'Payment in progress',
    tone: 'info',
    // The server has not said who is being waited on, so this claims nothing
    // about whose turn it is — it only says the attempt is still open.
    detail:
      'A payment for this application is still open. We are checking it and will update this page.',
    action: 'check_status',
    actionLabel: 'Check payment now',
    allowsInitiate: false,
  },
  still_confirming: {
    label: 'Still confirming',
    tone: 'info',
    // R14.3: a spent wait budget is not a failure and must never read as one.
    detail: PAYMENT_WAITING_STATES.provider_processing.onTimeout,
    action: 'check_status',
    actionLabel: 'Check payment now',
    allowsInitiate: false,
  },
  confirmed: {
    label: 'Paid',
    tone: 'success',
    detail: 'This application fee is paid. Your receipt is available below.',
    action: 'receipt',
    actionLabel: 'Download receipt',
    allowsInitiate: false,
  },
  already_paid: {
    label: 'Paid',
    tone: 'success',
    detail: 'This application fee is already paid, so no further payment is needed.',
    action: 'receipt',
    actionLabel: 'Download receipt',
    allowsInitiate: false,
  },
  retry_with_different_number: {
    label: 'Payment failed',
    tone: 'destructive',
    detail:
      'The last payment attempt did not go through and you have not been charged. You can try again, with a different mobile money number or by card.',
    action: 'pay',
    actionLabel: 'Try again',
    allowsInitiate: true,
  },
  expired: {
    label: 'Attempt expired',
    tone: 'warning',
    detail:
      'The previous payment attempt expired before it completed, so nothing was charged. The fee is still owed and you can start a new payment.',
    action: 'pay',
    actionLabel: 'Start a new payment',
    allowsInitiate: true,
  },
  max_attempts_reached: {
    label: 'Too many attempts',
    tone: 'destructive',
    detail:
      'This application has reached the limit of payment attempts, so a new attempt cannot be started here. Admissions can complete the payment for you.',
    action: 'support',
    actionLabel: 'Contact admissions',
    allowsInitiate: false,
  },
  rate_limited: {
    label: 'Too many requests',
    tone: 'warning',
    detail:
      'You have made several payment requests in a short time. Wait a moment, then check the status again.',
    action: 'check_status',
    actionLabel: 'Check payment now',
    allowsInitiate: false,
  },
  unavailable: {
    label: 'Payments unavailable',
    tone: 'warning',
    detail:
      'Payments are temporarily unavailable. Nothing has been charged — check back shortly and your fee will still be here.',
    action: 'check_status',
    actionLabel: 'Check again',
    allowsInitiate: false,
  },
  sensitive_fields_locked: {
    label: 'Details locked',
    tone: 'muted',
    detail:
      'Payment details for this application are locked while it is being reviewed. Admissions can help if something needs to change.',
    action: 'support',
    actionLabel: 'Contact admissions',
    allowsInitiate: false,
  },
  needs_admin_followup: {
    label: 'Needs admissions review',
    tone: 'warning',
    detail:
      'This payment needs an admissions officer to look at it before it can settle. Nothing more can be done from this page.',
    action: 'support',
    actionLabel: 'Contact admissions',
    allowsInitiate: false,
  },
}

/**
 * The `deferred` override.
 *
 * `derivePaymentUiState` maps a deferred payment to `idle` — correct in the
 * wizard, where the student is looking at the same "pay now" affordance either
 * way. On the payment page the difference matters: a deferral is a choice the
 * student made and should be named as such, not reported as an unpaid fee they
 * may have forgotten. Same affordance, honest sentence.
 */
export const PAYMENT_DEFERRED_PRESENTATION: PaymentRecoveryPresentation = {
  label: 'Paying later',
  tone: 'neutral',
  detail:
    'You chose to pay this fee later, and your application was submitted without it. You can pay it here whenever you are ready.',
  action: 'pay',
  actionLabel: 'Pay now',
  allowsInitiate: true,
}

/** The payment-row facts the page reads. All server-authored. */
export interface PaymentRecoveryInput {
  /**
   * Canonical status of the latest payment row for this application, or `null`
   * when the student has never started one.
   */
  latestPaymentStatus: CanonicalPaymentServiceStatus | null
  /** Server-derived phase of that row (task 8.2). Never computed here. */
  phase?: PaymentPhase | null
  /** Application-level payment projection (`applications.payment_status`). */
  applicationPaymentStatus?: string | null
  /** True while an initiate request from this page is in flight. */
  inflight?: boolean
  /** Stable code from the last refusal, when there was one. */
  stableCode?: PaymentStableCode | null
  /** True once the polling wait budget for this phase is spent (R14.3). */
  pollingExceededTimeout?: boolean
}

export interface PaymentRecoveryView {
  /** The canonical UI state, straight from the task 8.2 mapper. */
  uiState: PaymentUiState
  /** The server-derived phase this view was resolved from, for diagnostics. */
  phase: PaymentPhase | null
  /** True when the student deliberately deferred this fee. */
  deferred: boolean
  presentation: PaymentRecoveryPresentation
  /**
   * Wait budget in seconds for the two waiting states, else `null`. Mirrors the
   * server's `phase_timeout_seconds`; it is a UI wait budget, not a deadline.
   */
  waitBudgetSeconds: number | null
  /** True when this state is a wait (nothing failed, nothing settled). */
  isWaiting: boolean
  /** True when the fee is settled — verified, force-approved, or already paid. */
  isSettled: boolean
  /** True when the student can act to move the payment forward from here. */
  needsStudentAction: boolean
  /**
   * What to say once the wait budget for the current phase is spent — the task 8.2
   * copy for *that* phase, not a generic timeout message. `null` while the budget
   * still has time on it.
   */
  timeoutNotice: string | null
  /**
   * Whether re-sending the provider prompt is the right way out.
   *
   * True **only** for a spent `action_required` budget: the student was never
   * prompted, no money moved, and the service mints a fresh provider reference on
   * the same payment row, so nothing can be charged twice. It is never true for
   * `provider_processing` — a second collection request against a provider that is
   * still working is exactly how a student gets charged twice (STU-09).
   */
  resendAvailable: boolean
}

/**
 * Resolve the post-submission payment view for one application.
 *
 * Pure — no clock, no I/O, no arithmetic on money. Everything it returns is a
 * function of what the server said.
 */
export function resolvePaymentRecovery(input: PaymentRecoveryInput): PaymentRecoveryView {
  const uiState = derivePaymentUiState({
    backendStatus: input.latestPaymentStatus,
    inflight: Boolean(input.inflight),
    stableCode: input.stableCode ?? null,
    pollingExceededTimeout: Boolean(input.pollingExceededTimeout),
    phase: input.phase ?? null,
  })

  // A deferral is only meaningful while nothing has superseded it: once a row is
  // pending, failed, expired, or paid, that row is the story.
  const deferred =
    (input.latestPaymentStatus === 'deferred' ||
      normalizePaymentStatus(input.applicationPaymentStatus) === 'deferred') &&
    uiState === 'idle'

  const presentation = deferred
    ? PAYMENT_DEFERRED_PRESENTATION
    : PAYMENT_RECOVERY_PRESENTATION[uiState]

  const isWaiting =
    uiState === 'action_required' ||
    uiState === 'provider_processing' ||
    uiState === 'awaiting_provider' ||
    uiState === 'still_confirming' ||
    uiState === 'initiating'

  const phase = input.phase ?? null
  const waitBudgetSeconds =
    uiState === 'action_required' || uiState === 'provider_processing'
      ? PAYMENT_WAITING_STATES[uiState].timeoutSeconds
      : null

  // The wait budget is spent (the poller said so). Which phase it was spent in
  // decides both what we say and whether re-sending is offered.
  const budgetSpent = Boolean(input.pollingExceededTimeout) && input.latestPaymentStatus === 'pending'
  const timeoutNotice =
    budgetSpent && (phase === 'action_required' || phase === 'provider_processing')
      ? PAYMENT_WAITING_STATES[phase].onTimeout
      : null

  return {
    uiState,
    phase,
    deferred,
    presentation,
    waitBudgetSeconds,
    isWaiting,
    isSettled: uiState === 'confirmed' || uiState === 'already_paid',
    needsStudentAction: presentation.allowsInitiate,
    timeoutNotice,
    resendAvailable: budgetSpent && phase === 'action_required',
  }
}
