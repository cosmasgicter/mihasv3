/**
 * Regression: wizard payment gate must accept ALL verified payment states.
 *
 * The wizard previously gated progression on the raw string
 * `paymentStatus === 'successful'`, which stranded students whose payment
 * was `verified`/`paid` (legacy) or `force_approved` (admin offline-payment
 * override) on the payment step — the Next button stayed disabled forever.
 * isPaymentResolvedForProgress() is the single canonical gate.
 */
import { describe, it, expect } from 'vitest'
import { isPaymentResolvedForProgress } from '@/lib/paymentStatus'

describe('isPaymentResolvedForProgress', () => {
  it('allows progression for every verified payment variant', () => {
    for (const status of ['successful', 'verified', 'paid', 'force_approved']) {
      expect(isPaymentResolvedForProgress(status)).toBe(true)
    }
  })

  it('allows progression when payment is deferred', () => {
    expect(isPaymentResolvedForProgress('deferred')).toBe(true)
  })

  it('blocks progression for unresolved/failed/empty states', () => {
    for (const status of ['pending', 'failed', 'rejected', 'expired', '', null, undefined]) {
      expect(isPaymentResolvedForProgress(status)).toBe(false)
    }
  })
})
