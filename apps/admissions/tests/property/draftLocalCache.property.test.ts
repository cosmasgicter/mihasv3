/**
 * Property tests for the single-application-addressed local draft cache
 * (task 6.3, R10.10 — the fourth STU-12 clause carried over from 6.2).
 *
 * Invariant: for ANY set of drafts across ANY set of users, and ANY set of
 * payment-recovery records, clearing exactly one (user, application):
 *   1. removes that one snapshot, and
 *   2. leaves every other draft snapshot intact, and
 *   3. leaves every payment-recovery record intact.
 *
 * Validates: Requirements R10.4, R10.10.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import * as fc from 'fast-check'

import { clearWizardDraftCache } from '@/lib/draftLocalCache'
import { getWizardDraftStorageKey } from '@/lib/draftStorageKeys'
import { BROWSER_KEYS } from '@/lib/browserNamespace'
import { usePaymentRecoveryStore } from '@/stores/paymentRecoveryStore'
import { useDraftStore } from '@/stores/draftStore'
import { resetCache } from '@/lib/localStorageCache'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetCache()
  usePaymentRecoveryStore.setState({ entries: {} })
  useDraftStore.getState().reset()
})

// (userId, applicationId) identity pairs, kept small + collision-light.
const arbId = fc.string({ minLength: 1, maxLength: 6 }).map((s) => s.replace(/[^a-zA-Z0-9]/g, '') || 'x')
const arbPair = fc.record({ userId: arbId, applicationId: arbId })
const arbPairs = fc.uniqueArray(arbPair, {
  minLength: 1,
  maxLength: 8,
  selector: (p) => `${p.userId}::${p.applicationId}`,
})

describe('clearWizardDraftCache — property: one target, no collateral (R10.10)', () => {
  it('clearing one draft removes only it and never touches any payment-recovery record', () => {
    fc.assert(
      fc.property(arbPairs, fc.nat(), (pairs, targetIndex) => {
        localStorage.clear()
        resetCache()
        usePaymentRecoveryStore.setState({ entries: {} })

        // Seed one local snapshot + one payment-recovery record per pair.
        const now = Date.now()
        for (const { userId, applicationId } of pairs) {
          localStorage.setItem(
            getWizardDraftStorageKey(userId, applicationId),
            JSON.stringify({ userId, applicationId }),
          )
          usePaymentRecoveryStore.getState().record({
            application_id: applicationId,
            payment_id: `pay-${applicationId}`,
            reference: `ref-${applicationId}`,
            method: 'mobile_money',
            initiated_at: now,
          })
        }

        const target = pairs[targetIndex % pairs.length]!
        clearWizardDraftCache({ userId: target.userId, applicationId: target.applicationId }, { notify: false })

        // The target snapshot is gone.
        expect(localStorage.getItem(getWizardDraftStorageKey(target.userId, target.applicationId))).toBeNull()

        // Every OTHER (user, application) snapshot addressed by a distinct key survives.
        const targetKey = getWizardDraftStorageKey(target.userId, target.applicationId)
        for (const { userId, applicationId } of pairs) {
          const key = getWizardDraftStorageKey(userId, applicationId)
          if (key === targetKey) continue
          expect(localStorage.getItem(key)).not.toBeNull()
        }

        // NO payment-recovery record is ever erased — not even the target's.
        for (const { applicationId } of pairs) {
          expect(usePaymentRecoveryStore.getState().get(applicationId)).not.toBeNull()
        }
        // The recovery store blob itself was never bulk-removed.
        expect(localStorage.getItem(BROWSER_KEYS.paymentRecovery)).not.toBeNull()
      }),
      { numRuns: 200 },
    )
  })
})
