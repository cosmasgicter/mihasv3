/**
 * Stable payment error-code catalogue — frontend mirror.
 *
 * Mirrors `backend/apps/documents/payment_error_codes.py`. Drift is
 * detected by `apps/admissions/tests/unit/paymentErrorCodes.test.ts` (the
 * backend catalogue mirror fixture is kept in
 * `tests/unit/__fixtures__/paymentErrorCodesBackendMirror.ts`).
 *
 * Requirements: R15.1, R15.2, R15.3, R15.4, R15.5.
 */

export type PaymentStableCode =
  | 'NOT_OWNER'
  | 'APPLICATION_NOT_FOUND'
  | 'APPLICATION_NOT_PAYABLE'
  | 'ALREADY_PAID'
  | 'MAX_PAYMENT_ATTEMPTS_EXCEEDED'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_CONFIRMED'
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'MISSING_PROVIDER_REFERENCE'
  | 'PROVIDER_UNAVAILABLE'
  | 'PAYMENT_UNAVAILABLE'
  | 'FEE_UNAVAILABLE'
  | 'FEE_NOT_CONFIGURED'
  | 'FEE_AMBIGUOUS'
  | 'QUOTE_NOT_FOUND'
  | 'QUOTE_EXPIRED'
  | 'QUOTE_ALREADY_REDEEMED'
  | 'QUOTE_INVALID'
  | 'QUOTE_CONFIGURATION_CHANGED'
  | 'PAYMENT_SENSITIVE_FIELDS_LOCKED'
  | 'DRAFT_DELETE_BLOCKED_BY_PAYMENT'
  | 'CANNOT_REVERSE_SUCCESSFUL_PAYMENT'
  | 'OVERRIDE_REASON_REQUIRED'
  | 'RECEIPT_NOT_ELIGIBLE'
  | 'RATE_LIMITED'
  | 'VALIDATION_ERROR'

/** Ordered tuple of every stable code, handy for exhaustiveness tests. */
export const PAYMENT_STABLE_CODES: readonly PaymentStableCode[] = [
  'NOT_OWNER',
  'APPLICATION_NOT_FOUND',
  'APPLICATION_NOT_PAYABLE',
  'ALREADY_PAID',
  'MAX_PAYMENT_ATTEMPTS_EXCEEDED',
  'PAYMENT_PENDING',
  'PAYMENT_CONFIRMED',
  'AMOUNT_MISMATCH',
  'CURRENCY_MISMATCH',
  'MISSING_PROVIDER_REFERENCE',
  'PROVIDER_UNAVAILABLE',
  'PAYMENT_UNAVAILABLE',
  'FEE_UNAVAILABLE',
  'FEE_NOT_CONFIGURED',
  'FEE_AMBIGUOUS',
  'QUOTE_NOT_FOUND',
  'QUOTE_EXPIRED',
  'QUOTE_ALREADY_REDEEMED',
  'QUOTE_INVALID',
  'QUOTE_CONFIGURATION_CHANGED',
  'PAYMENT_SENSITIVE_FIELDS_LOCKED',
  'DRAFT_DELETE_BLOCKED_BY_PAYMENT',
  'CANNOT_REVERSE_SUCCESSFUL_PAYMENT',
  'OVERRIDE_REASON_REQUIRED',
  'RECEIPT_NOT_ELIGIBLE',
  'RATE_LIMITED',
  'VALIDATION_ERROR',
] as const

export interface PaymentErrorCopy {
  title: string
  body: string
  next_action_hint?: string
}

/** User-facing copy per stable code. Student-safe wording. */
export const PAYMENT_ERROR_COPY: Record<PaymentStableCode, PaymentErrorCopy> = {
  NOT_OWNER: {
    title: 'Not authorized',
    body: 'You do not have permission to perform this action.',
  },
  APPLICATION_NOT_FOUND: {
    title: 'Application not found',
    body: 'We could not find this application. Please refresh and try again.',
  },
  APPLICATION_NOT_PAYABLE: {
    title: 'Application not ready for payment',
    body: 'This application cannot be paid for yet. Complete the earlier steps first.',
  },
  ALREADY_PAID: {
    title: 'Already paid',
    body: 'Payment for this application is already complete.',
    next_action_hint: 'View your receipt from the dashboard.',
  },
  MAX_PAYMENT_ATTEMPTS_EXCEEDED: {
    title: 'Too many payment attempts',
    body: 'You have reached the maximum number of payment attempts for this application. Please contact support.',
  },
  PAYMENT_PENDING: {
    title: 'Payment is processing',
    body: 'Your payment is still being processed. We will confirm it shortly.',
    next_action_hint: 'You can safely close this window; we will notify you when it completes.',
  },
  PAYMENT_CONFIRMED: {
    title: 'Payment confirmed',
    body: 'Your payment has been confirmed.',
  },
  AMOUNT_MISMATCH: {
    title: 'Payment amount does not match',
    body: 'The amount received does not match your application fee. Please contact support before retrying.',
  },
  CURRENCY_MISMATCH: {
    title: 'Payment currency does not match',
    body: 'The currency of your payment does not match the application fee. Please contact support.',
  },
  MISSING_PROVIDER_REFERENCE: {
    title: 'Payment reference missing',
    body: 'Your payment did not include the confirmation reference. Please try again or contact support.',
  },
  PROVIDER_UNAVAILABLE: {
    title: 'Payment service temporarily unavailable',
    body: 'The payment service is temporarily unavailable. Please try again in a moment.',
    next_action_hint: 'Retry with a different mobile money number or wait a few minutes.',
  },
  PAYMENT_UNAVAILABLE: {
    title: 'Payment processing unavailable',
    body: 'Payment processing is not available right now. Please try again later.',
  },
  FEE_UNAVAILABLE: {
    title: 'Fee not available',
    body: 'We could not look up the fee for this programme. Please try again later.',
  },
  FEE_NOT_CONFIGURED: {
    title: 'Fee not configured',
    body: 'The application fee for this programme has not been set up yet. Please contact the school or try again later.',
  },
  FEE_AMBIGUOUS: {
    title: 'Fee configuration needs attention',
    body: 'More than one active fee is configured for this programme. Please contact the school so it can be corrected.',
  },
  QUOTE_NOT_FOUND: {
    title: 'Fee not ready',
    body: 'We could not find a current fee for this application. Refresh to get the latest amount.',
    next_action_hint: 'Refresh the fee and try again.',
  },
  QUOTE_EXPIRED: {
    title: 'Price expired',
    body: 'The fee you were shown is no longer current. Refresh to see the latest amount before paying.',
    next_action_hint: 'Refresh the fee and try again.',
  },
  QUOTE_ALREADY_REDEEMED: {
    title: 'Fee already used',
    body: 'This fee has already been used to start a payment. Check your payment status before trying again.',
    next_action_hint: 'Check your payment status.',
  },
  QUOTE_INVALID: {
    title: 'Fee could not be verified',
    body: 'We could not verify the fee for this application. Refresh to get a new amount.',
    next_action_hint: 'Refresh the fee and try again.',
  },
  QUOTE_CONFIGURATION_CHANGED: {
    title: 'The fee changed',
    body: 'The application fee changed while you were paying. Review the new amount before continuing.',
    next_action_hint: 'Refresh the fee to see the new amount.',
  },
  PAYMENT_SENSITIVE_FIELDS_LOCKED: {
    title: 'Application is locked for this change',
    body: 'These fields cannot be changed while payment activity exists on your application.',
  },
  DRAFT_DELETE_BLOCKED_BY_PAYMENT: {
    title: 'Draft cannot be deleted',
    body: 'This draft cannot be deleted while a payment record exists. Please contact support.',
  },
  CANNOT_REVERSE_SUCCESSFUL_PAYMENT: {
    title: 'Successful payment cannot be reversed',
    body: 'This payment has already completed successfully and cannot be reversed.',
  },
  OVERRIDE_REASON_REQUIRED: {
    title: 'Reason required',
    body: 'A reason of at least 10 characters is required for this action.',
  },
  RECEIPT_NOT_ELIGIBLE: {
    title: 'Receipt not available',
    body: 'A receipt is only available for successful or force-approved payments.',
  },
  RATE_LIMITED: {
    title: 'Too many requests',
    body: 'You are doing that too often. Please wait a moment and try again.',
  },
  VALIDATION_ERROR: {
    title: 'Check your input',
    body: 'Some of the details you entered are not valid. Please review and try again.',
  },
}

/**
 * Type guard that narrows an unknown `code` / `data.code` / `error.code`
 * value to the `PaymentStableCode` union.
 */
export function isPaymentStableCode(code: unknown): code is PaymentStableCode {
  return typeof code === 'string' && (PAYMENT_STABLE_CODES as readonly string[]).includes(code)
}
