/**
 * Mirror of backend PAYMENT_TO_APP_MAP from
 * backend/apps/documents/payment_service.py
 *
 * Maps canonical payment status → derived application payment_status.
 * If this fixture drifts from the backend, the drift-guard test will fail.
 */
export const PAYMENT_TO_APP_MAP: Record<string, string> = {
  successful: 'verified',
  force_approved: 'verified',
  failed: 'failed',
  expired: 'not_paid',
  deferred: 'deferred',
  pending: 'pending_review',
} as const

export const CANONICAL_PAYMENT_STATUSES = Object.keys(PAYMENT_TO_APP_MAP).sort()
