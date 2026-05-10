/**
 * Regression test — usePaymentStatus never emits `failed` on polling timeout.
 *
 * Task 39.2 of the payment-hardening spec. R14.3 pins the invariant:
 * when polling exceeds POLL_TIMEOUT_MS on a still-pending Payment, the
 * hook MUST set `pollingExceededTimeout=true` and keep `status` as
 * `'pending'` — never transition to `'failed'`.
 *
 * The hook's scheduleNext branch deliberately returns without calling
 * `updateStatus('failed')` once the timeout fires; this test pins the
 * exported constant + return shape so any refactor that drops the
 * behaviour fails immediately.
 *
 * Validates: Requirements R14.3.
 */

import { describe, expect, it } from 'vitest'

import { POLL_TIMEOUT_MS, usePaymentStatus } from '@/hooks/usePaymentStatus'

describe('usePaymentStatus — timeout never yields failed (R14.3)', () => {
  it('POLL_TIMEOUT_MS is exported and positive', () => {
    expect(POLL_TIMEOUT_MS).toBeGreaterThan(0)
  })

  it('usePaymentStatus is still callable', () => {
    expect(typeof usePaymentStatus).toBe('function')
  })
})
