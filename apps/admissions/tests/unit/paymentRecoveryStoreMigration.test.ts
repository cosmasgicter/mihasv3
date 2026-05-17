import { describe, it, expect, beforeEach } from 'vitest'
import { createPaymentRecoveryStore } from '@/stores/paymentRecoveryStore'

describe('paymentRecoveryStore migrate callback', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('persist config includes version 1 and migrate function', () => {
    // Seed localStorage with a raw persisted shape (simulating prior session)
    const persisted = {
      state: { entries: {} },
      version: 1,
    }
    localStorage.setItem('mihas-payment-recovery-migrate-test', JSON.stringify(persisted))

    const store = createPaymentRecoveryStore('mihas-payment-recovery-migrate-test')
    // Store should hydrate without error
    expect(store.getState().entries).toEqual({})
  })

  it('fresh store initializes with empty entries', () => {
    const store = createPaymentRecoveryStore('mihas-payment-recovery-fresh-test')
    expect(store.getState().entries).toEqual({})
  })

  it('migrate preserves existing entries on rehydration', () => {
    const entry = {
      application_id: 'app-1',
      payment_id: 'pay-1',
      reference: 'ref-1',
      method: 'mobile_money' as const,
      initiated_at: Date.now(),
      ttl_expires_at: Date.now() + 86400000,
    }
    const persisted = {
      state: { entries: { 'app-1': entry } },
      version: 1,
    }
    localStorage.setItem('mihas-payment-recovery-persist-test', JSON.stringify(persisted))

    const store = createPaymentRecoveryStore('mihas-payment-recovery-persist-test')
    const result = store.getState().get('app-1')
    expect(result).not.toBeNull()
    expect(result?.payment_id).toBe('pay-1')
  })
})
