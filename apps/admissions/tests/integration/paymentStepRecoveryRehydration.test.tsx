/**
 * Integration smoke test — PaymentStep rehydrates from paymentRecoveryStore
 * on mount (Task 38.4).
 *
 * When the VITE_PAYMENT_HARDENING_UI flag is on and an entry for the
 * current application exists in the recovery store, PaymentStep should
 * NOT re-initiate — it should surface the pending `payment_id` and let
 * `usePaymentStatus` verify the existing payment.
 *
 * Full rendering smoke is deferred until Task 38.2's switch-per-state
 * rewrite; this test currently pins the store's read behaviour so the
 * rehydration path is ready to wire into the component tree.
 *
 * Validates: Requirements R14.2.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { createPaymentRecoveryStore } from '@/stores/paymentRecoveryStore'

const STORE_NAME = 'paymentStepRecoveryRehydration.test'

describe('PaymentStep recovery rehydration — store read', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('reads a recorded entry back by application_id', () => {
    const storeA = createPaymentRecoveryStore(STORE_NAME)
    const appId = 'app-rehydrate-1'

    storeA.getState().record({
      application_id: appId,
      payment_id: 'pay-rehydrate-1',
      reference: 'REF-REHYDRATE',
      method: 'mobile_money',
      initiated_at: Date.now(),
    })

    // Simulate remount by instantiating a second store with the same name.
    const storeB = createPaymentRecoveryStore(STORE_NAME)
    const entry = storeB.getState().get(appId)

    expect(entry).not.toBeNull()
    expect(entry?.payment_id).toBe('pay-rehydrate-1')
  })
})
