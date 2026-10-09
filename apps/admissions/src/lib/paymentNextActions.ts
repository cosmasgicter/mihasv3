/**
 * Stable next-action catalogue for payment responses.
 *
 * Backend payment endpoints may set `data.next_action` on success
 * envelopes (e.g. `"already_paid"`, `"check_status"`,
 * `"retry_with_different_number"`). The frontend maps each to a
 * user-facing label + guidance through `PAYMENT_NEXT_ACTION_COPY`.
 *
 * Requirements: R14.4, R15.4, R12.6.
 */

import type { PaymentStableCode } from './paymentErrorCodes'

export type PaymentNextAction =
  | 'retry_with_different_number'
  | 'check_status'
  | 'already_paid'
  | 'unavailable'
  | 'contact_support'
  | 'refresh_quote'

/** Ordered tuple of every next-action, handy for exhaustiveness checks. */
export const PAYMENT_NEXT_ACTIONS: readonly PaymentNextAction[] = [
  'retry_with_different_number',
  'check_status',
  'already_paid',
  'unavailable',
  'contact_support',
  'refresh_quote',
] as const

export interface PaymentNextActionCopy {
  label: string
  guidance: string
}

export const PAYMENT_NEXT_ACTION_COPY: Record<PaymentNextAction, PaymentNextActionCopy> = {
  retry_with_different_number: {
    label: 'Try a different number',
    guidance:
      'The mobile money number was not accepted. Enter a different Airtel or MTN number and try again.',
  },
  check_status: {
    label: 'Check status',
    guidance:
      'Your payment is still being confirmed. You can check the status in a moment or continue waiting.',
  },
  already_paid: {
    label: 'View receipt',
    guidance: 'This application is already paid. You can access your receipt from the dashboard.',
  },
  unavailable: {
    label: 'Try again later',
    guidance:
      'The payment service is temporarily unavailable. Please wait a moment and try again.',
  },
  contact_support: {
    label: 'Contact support',
    guidance:
      'We could not complete your payment. Please contact support for help resolving this.',
  },
  refresh_quote: {
    label: 'Refresh fee',
    guidance:
      'The fee you were shown is no longer current. Refresh it to see the amount you will be charged.',
  },
}

/** Runtime type guard narrowing an arbitrary value to `PaymentNextAction`. */
export function isPaymentNextAction(value: unknown): value is PaymentNextAction {
  return (
    typeof value === 'string' && (PAYMENT_NEXT_ACTIONS as readonly string[]).includes(value)
  )
}

// ---------------------------------------------------------------------------
// Stable code → recovery action (admissions-v2 task 8.1, R12.6)
// ---------------------------------------------------------------------------

/**
 * The recovery action for a refusal that arrives as a stable code rather than a
 * `data.next_action` string.
 *
 * The fee-quote endpoint answers with a stable code and no `next_action`
 * (`QUOTE_EXPIRED`, `QUOTE_INVALID`, `QUOTE_ALREADY_REDEEMED`,
 * `QUOTE_CONFIGURATION_CHANGED`, `QUOTE_NOT_FOUND`), so requirement R12.6 — "the
 * UI shall display … recovery action" — needs this mapping to turn a code into a
 * labelled thing the student can do.
 *
 * The map is a total `Record`, so adding a stable code without deciding its
 * recovery action is a **compile error**, not a silently unhandled state. `null`
 * means "no self-service action" — the copy in `PAYMENT_ERROR_COPY` is the whole
 * answer.
 */
export const PAYMENT_CODE_RECOVERY: Record<PaymentStableCode, PaymentNextAction | null> = {
  // Quote lifecycle — every one of these is recoverable by re-pricing, except a
  // spent quote, where the honest next step is to look at the payment it funded.
  QUOTE_EXPIRED: 'refresh_quote',
  QUOTE_INVALID: 'refresh_quote',
  QUOTE_NOT_FOUND: 'refresh_quote',
  QUOTE_CONFIGURATION_CHANGED: 'refresh_quote',
  QUOTE_ALREADY_REDEEMED: 'check_status',
  // Fee configuration — the student cannot fix a school's fee setup.
  FEE_NOT_CONFIGURED: 'contact_support',
  FEE_AMBIGUOUS: 'contact_support',
  FEE_UNAVAILABLE: 'unavailable',
  // Provider / transport.
  PROVIDER_UNAVAILABLE: 'retry_with_different_number',
  PAYMENT_UNAVAILABLE: 'unavailable',
  RATE_LIMITED: 'unavailable',
  // Payment lifecycle.
  ALREADY_PAID: 'already_paid',
  PAYMENT_CONFIRMED: 'already_paid',
  PAYMENT_PENDING: 'check_status',
  MAX_PAYMENT_ATTEMPTS_EXCEEDED: 'contact_support',
  AMOUNT_MISMATCH: 'contact_support',
  CURRENCY_MISMATCH: 'contact_support',
  MISSING_PROVIDER_REFERENCE: 'contact_support',
  CANNOT_REVERSE_SUCCESSFUL_PAYMENT: 'contact_support',
  DRAFT_DELETE_BLOCKED_BY_PAYMENT: 'contact_support',
  RECEIPT_NOT_ELIGIBLE: null,
  PAYMENT_SENSITIVE_FIELDS_LOCKED: null,
  OVERRIDE_REASON_REQUIRED: null,
  // Authority / input — no payment recovery action applies.
  NOT_OWNER: null,
  APPLICATION_NOT_FOUND: null,
  APPLICATION_NOT_PAYABLE: null,
  VALIDATION_ERROR: null,
}

/** Recovery action for a stable code, or `null` when there is no self-service step. */
export function recoveryActionForStableCode(
  code: PaymentStableCode | null | undefined,
): PaymentNextAction | null {
  if (!code) return null
  return PAYMENT_CODE_RECOVERY[code] ?? null
}
