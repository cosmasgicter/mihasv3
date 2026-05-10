/**
 * Unit test — recovery store survives page refresh via localStorage.
 *
 * Task 33.3 of the payment-hardening spec. Uses happy-dom's localStorage
 * to record an entry, then re-instantiates the store factory to
 * simulate a page reload. The rehydrated store must read back the same
 * entry (unless TTL has passed), and `clear()` must remove it from both
 * in-memory state and localStorage.
 *
 * Validates: Requirements R14.2.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createPaymentRecoveryStore,
  PAYMENT_RECOVERY_TTL_MS,
} from '@/stores/paymentRecoveryStore'

const STORE_NAME = 'paymentRecoveryStorePersistence.test'

function _makeEntry(applicationId = 'app-1', payload: Partial<Parameters<ReturnType<typeof createPaymentRecoveryStore>['getState']>['0'] extends never ? never : never> = {}) {
  return {
    application_id: applicationId,
    payment_id: 'pay-1',
    reference: 'REF-1',
    method: 'mobile_money' as const,
    initiated_at: Date.now(),
    ...payload,
  }
}

describe('paymentRecoveryStore — localStorage persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('records an entry that survives a simulated refresh', () => {
    const storeA = createPaymentRecoveryStore(STORE_NAME)
    const entry = _makeEntry('app-refresh-1')

    storeA.getState().record(entry)

    // Sanity: state holds the entry with a TTL.
    const recorded = storeA.getState().entries[entry.application_id]
    expect(recorded).toBeDefined()
    expect(recorded.ttl_expires_at).toBe(entry.initiated_at + PAYMENT_RECOVERY_TTL_MS)

    // Simulate refresh: discard the in-memory store, reinstantiate.
    const storeB = createPaymentRecoveryStore(STORE_NAME)
    const rehydrated = storeB.getState().get(entry.application_id)

    expect(rehydrated).not.toBeNull()
    expect(rehydrated?.payment_id).toBe(entry.payment_id)
    expect(rehydrated?.reference).toBe(entry.reference)
    expect(rehydrated?.method).toBe(entry.method)
  })

  it('clear() removes the entry from both in-memory state and localStorage', () => {
    const storeA = createPaymentRecoveryStore(STORE_NAME)
    const entry = _makeEntry('app-clear-1')
    storeA.getState().record(entry)

    storeA.getState().clear(entry.application_id)

    expect(storeA.getState().entries[entry.application_id]).toBeUndefined()

    // Reinstantiate to prove the removal is persisted.
    const storeB = createPaymentRecoveryStore(STORE_NAME)
    expect(storeB.getState().get(entry.application_id)).toBeNull()
  })

  it('pruneExpired() drops expired entries across refreshes', () => {
    const storeA = createPaymentRecoveryStore(STORE_NAME)
    const expired = _makeEntry('app-expired-1', {
      initiated_at: Date.now() - PAYMENT_RECOVERY_TTL_MS - 1000,
    })
    storeA.getState().record(expired)

    // Reinstantiating triggers onRehydrateStorage → pruneExpired.
    const storeB = createPaymentRecoveryStore(STORE_NAME)

    expect(storeB.getState().get(expired.application_id)).toBeNull()
  })
})
