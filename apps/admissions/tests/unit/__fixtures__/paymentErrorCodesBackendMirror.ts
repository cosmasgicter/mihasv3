/**
 * Mirror of `backend/apps/documents/payment_error_codes.py::PAYMENT_ERROR_CODES`.
 *
 * Task 22.4 compares this list against the frontend `PaymentStableCode`
 * union + `PAYMENT_ERROR_COPY` map. When the backend catalogue adds a new
 * code, update this fixture in lockstep — the drift test will flag both
 * additions and removals.
 */

export const BACKEND_PAYMENT_STABLE_CODES: readonly string[] = [
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
  'PAYMENT_SENSITIVE_FIELDS_LOCKED',
  'DRAFT_DELETE_BLOCKED_BY_PAYMENT',
  'CANNOT_REVERSE_SUCCESSFUL_PAYMENT',
  'OVERRIDE_REASON_REQUIRED',
  'RECEIPT_NOT_ELIGIBLE',
  'RATE_LIMITED',
  'VALIDATION_ERROR',
] as const
