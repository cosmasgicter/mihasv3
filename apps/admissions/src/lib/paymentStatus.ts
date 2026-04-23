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
    default:
      return 'not_paid'
  }
}

export function requiresStudentPaymentAction(paymentStatus?: string | null) {
  const normalized = normalizePaymentStatus(paymentStatus)
  return normalized === 'not_paid' || normalized === 'rejected' || normalized === 'deferred'
}

export function isPaymentVerified(paymentStatus?: string | null) {
  return normalizePaymentStatus(paymentStatus) === 'verified'
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
