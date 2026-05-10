/**
 * Unit test — recovery store concurrent-tab safety (Task 33.4).
 *
 * Simulates two tabs writing to localStorage for the same
 * `application_id`. Both tabs use distinct store instances but share the
 * same storage key, which is what real browser tabs do. The test
 * asserts:
 *
 * 1. After both writes, only ONE entry exists in localStorage for that
 *    application_id — the `record()` API is an upsert, not an append, so
 *    duplicate accumulation is structurally impossible.
 * 2. The last writer wins on the ``Record<string, PaymentRecoveryEntry>``
 *    shape because each write fully replaces the previous value for the
 *    same key.
 * 3. A third, freshly-mounted tab sees the last writer's entry
 *    (round-tripped through localStorage + `onRehydrateStorage`).
 *
 * Validates: Requirements R14.2.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createPaymentRecoveryStore,
  type PaymentRecoveryEntry,
} from '@/stores/paymentRecoveryStore'

const STORE_NAME = 'paymentRecoveryStoreConcurrentTabs.test'
const APPLICATION_ID = '8c5d3bde-9b14-4ef6-9d25-0adeff0ef911'

function _persistedEntries(): Record<string, PaymentRecoveryEntry> {
  const raw = localStorage.getItem(STORE_NAME)
  if (!raw) {
    return {}
  }
  const parsed = JSON.parse(raw) as { state?: { entries?: Record<string, PaymentRecoveryEntry> } }
  return parsed.state?.entries ?? {}
}

describe('paymentRecoveryStore — concurrent-tab safety', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('upsert keeps exactly one entry per application_id across tab writes', () => {
    // Tab A and Tab B are two independent store instances that share
    // the same storage key — matching what two real browser tabs do
    // against the same localStorage bucket.
    const tabA = createPaymentRecoveryStore(STORE_NAME)
    const tabB = createPaymentRecoveryStore(STORE_NAME)

    const tabAPayload = {
      application_id: APPLICATION_ID,
      payment_id: 'pay-from-tab-a',
      reference: 'REF-TAB-A',
      method: 'card' as const,
      initiated_at: Date.now(),
    }

    const tabBPayload = {
      application_id: APPLICATION_ID,
      payment_id: 'pay-from-tab-b',
      reference: 'REF-TAB-B',
      method: 'mobile_money' as const,
      initiated_at: Date.now() + 1,
    }

    tabA.getState().record(tabAPayload)
    tabB.getState().record(tabBPayload)

    const persisted = _persistedEntries()
    const applicationKeys = Object.keys(persisted)

    expect(applicationKeys).toHaveLength(1)
    expect(applicationKeys[0]).toBe(APPLICATION_ID)
  })

  it('last writer wins — tab B overwrites tab A for the same application', () => {
    const tabA = createPaymentRecoveryStore(STORE_NAME)
    const tabB = createPaymentRecoveryStore(STORE_NAME)

    const initiatedAt = Date.now()

    tabA.getState().record({
      application_id: APPLICATION_ID,
      payment_id: 'pay-from-tab-a',
      reference: 'REF-TAB-A',
      method: 'card',
      initiated_at: initiatedAt,
    })

    tabB.getState().record({
      application_id: APPLICATION_ID,
      payment_id: 'pay-from-tab-b',
      reference: 'REF-TAB-B',
      method: 'mobile_money',
      initiated_at: initiatedAt + 1,
    })

    const persistedEntry = _persistedEntries()[APPLICATION_ID]
    expect(persistedEntry).toBeDefined()
    expect(persistedEntry.payment_id).toBe('pay-from-tab-b')
    expect(persistedEntry.reference).toBe('REF-TAB-B')
    expect(persistedEntry.method).toBe('mobile_money')
  })

  it('a third tab rehydrates the last writer winner via onRehydrateStorage', () => {
    const tabA = createPaymentRecoveryStore(STORE_NAME)
    const tabB = createPaymentRecoveryStore(STORE_NAME)

    const initiatedAt = Date.now()

    tabA.getState().record({
      application_id: APPLICATION_ID,
      payment_id: 'pay-from-tab-a',
      reference: 'REF-TAB-A',
      method: 'card',
      initiated_at: initiatedAt,
    })

    tabB.getState().record({
      application_id: APPLICATION_ID,
      payment_id: 'pay-from-tab-b',
      reference: 'REF-TAB-B',
      method: 'mobile_money',
      initiated_at: initiatedAt + 1,
    })

    // Simulate a new tab mounting after both writes: fresh store
    // instance hydrates from localStorage and must see tab B's data.
    const tabC = createPaymentRecoveryStore(STORE_NAME)
    const rehydrated = tabC.getState().get(APPLICATION_ID)

    expect(rehydrated).not.toBeNull()
    expect(rehydrated?.payment_id).toBe('pay-from-tab-b')
    expect(rehydrated?.reference).toBe('REF-TAB-B')
    expect(rehydrated?.method).toBe('mobile_money')

    // And the state dict must carry exactly one entry for this app.
    expect(Object.keys(tabC.getState().entries)).toEqual([APPLICATION_ID])
  })

  it('clear() from one tab removes the entry for all tabs after rehydration', () => {
    const tabA = createPaymentRecoveryStore(STORE_NAME)
    tabA.getState().record({
      application_id: APPLICATION_ID,
      payment_id: 'pay-to-be-cleared',
      reference: 'REF-CLR',
      method: 'card',
      initiated_at: Date.now(),
    })

    // Tab B clears the entry.
    const tabB = createPaymentRecoveryStore(STORE_NAME)
    tabB.getState().clear(APPLICATION_ID)

    // Tab C mounts fresh and sees nothing.
    const tabC = createPaymentRecoveryStore(STORE_NAME)
    expect(tabC.getState().get(APPLICATION_ID)).toBeNull()
    expect(_persistedEntries()[APPLICATION_ID]).toBeUndefined()
  })
})
