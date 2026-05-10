/**
 * Stable next-action catalogue for payment responses.
 *
 * Backend payment endpoints may set `data.next_action` on success
 * envelopes (e.g. `"already_paid"`, `"check_status"`,
 * `"retry_with_different_number"`). The frontend maps each to a
 * user-facing label + guidance through `PAYMENT_NEXT_ACTION_COPY`.
 *
 * Requirements: R14.4, R15.4.
 */

export type PaymentNextAction =
  | 'retry_with_different_number'
  | 'check_status'
  | 'already_paid'
  | 'unavailable'
  | 'contact_support'

/** Ordered tuple of every next-action, handy for exhaustiveness checks. */
export const PAYMENT_NEXT_ACTIONS: readonly PaymentNextAction[] = [
  'retry_with_different_number',
  'check_status',
  'already_paid',
  'unavailable',
  'contact_support',
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
}

/** Runtime type guard narrowing an arbitrary value to `PaymentNextAction`. */
export function isPaymentNextAction(value: unknown): value is PaymentNextAction {
  return (
    typeof value === 'string' && (PAYMENT_NEXT_ACTIONS as readonly string[]).includes(value)
  )
}
