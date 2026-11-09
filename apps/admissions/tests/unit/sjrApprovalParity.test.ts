/**
 * R7-b parity (task 5.2): the Approve gate and the submission gate agree for every
 * payment status the module knows, and the approval constant names exactly the
 * backend's resolved set (the backend drift guard parses the same literal).
 */
import { describe, expect, it } from 'vitest'
import {
  APPROVAL_PAYMENT_STATUSES,
  isPaymentResolvedForApproval,
  isPaymentResolvedForProgress,
  normalizePaymentStatus,
} from '@/lib/paymentStatus'

const KNOWN = [
  'successful', 'force_approved', 'verified', 'paid', 'deferred',
  'pending', 'pending_review', 'failed', 'rejected', 'expired', 'not_paid',
  '', 'unknown_value',
]

describe('isPaymentResolvedForApproval', () => {
  it.each(KNOWN)('agrees with isPaymentResolvedForProgress for %j', (status) => {
    expect(isPaymentResolvedForApproval(status)).toBe(isPaymentResolvedForProgress(status))
  })

  it('treats null and undefined as unresolved', () => {
    expect(isPaymentResolvedForApproval(null)).toBe(false)
    expect(isPaymentResolvedForApproval(undefined)).toBe(false)
  })

  it('is true for exactly the approval statuses', () => {
    for (const status of APPROVAL_PAYMENT_STATUSES) {
      expect(isPaymentResolvedForApproval(status)).toBe(true)
    }
    expect(isPaymentResolvedForApproval('pending')).toBe(false)
  })

  it('only the verified or deferred canonical states are resolved', () => {
    for (const status of KNOWN) {
      const canonical = normalizePaymentStatus(status)
      expect(isPaymentResolvedForApproval(status)).toBe(canonical === 'verified' || canonical === 'deferred')
    }
  })
})
