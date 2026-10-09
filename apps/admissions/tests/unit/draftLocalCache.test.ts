/**
 * Unit tests for the single-application-addressed local draft cache (task 6.3).
 *
 * These pin the R10.10 guarantee (the fourth STU-12 clause carried over from
 * 6.2): clearing one draft's cache targets exactly one (user, application),
 * never erases another draft, and never erases any payment-recovery record
 * (payment-linked protection).
 *
 * Validates: Requirements R10.4, R10.10.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearNewWizardDraftCache,
  clearWizardDraftCache,
  writeWizardDraftSnapshot,
} from '@/lib/draftLocalCache'
import { getLegacyWizardDraftStorageKey, getWizardDraftStorageKey } from '@/lib/draftStorageKeys'
import { BROWSER_KEYS } from '@/lib/browserNamespace'
import { usePaymentRecoveryStore } from '@/stores/paymentRecoveryStore'
import { useDraftStore } from '@/stores/draftStore'
import { resetCache } from '@/lib/localStorageCache'

const USER = 'user-A'
const OTHER_USER = 'user-B'

function seedDraft(userId: string, applicationId: string | null, payload: Record<string, unknown> = {}) {
  localStorage.setItem(
    getWizardDraftStorageKey(userId, applicationId),
    JSON.stringify({ userId, applicationId, ...payload }),
  )
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetCache()
  usePaymentRecoveryStore.setState({ entries: {} })
  useDraftStore.getState().reset()
})

describe('clearWizardDraftCache — single (user, application) scoping (R10.10)', () => {
  it('removes only the addressed application snapshot', () => {
    seedDraft(USER, 'app-1')
    seedDraft(USER, 'app-2')
    seedDraft(OTHER_USER, 'app-3')

    clearWizardDraftCache({ userId: USER, applicationId: 'app-1' }, { notify: false })

    expect(localStorage.getItem(getWizardDraftStorageKey(USER, 'app-1'))).toBeNull()
    // Sibling drafts of the same user and other users are untouched.
    expect(localStorage.getItem(getWizardDraftStorageKey(USER, 'app-2'))).not.toBeNull()
    expect(localStorage.getItem(getWizardDraftStorageKey(OTHER_USER, 'app-3'))).not.toBeNull()
  })

  it('does not wipe the shared legacy draft key when clearing a specific application', () => {
    localStorage.setItem(getLegacyWizardDraftStorageKey(), JSON.stringify({ currentStep: 2 }))
    seedDraft(USER, 'app-1')

    clearWizardDraftCache({ userId: USER, applicationId: 'app-1' }, { notify: false })

    expect(localStorage.getItem(getWizardDraftStorageKey(USER, 'app-1'))).toBeNull()
    expect(localStorage.getItem(getLegacyWizardDraftStorageKey())).not.toBeNull()
  })

  it('NEVER erases any payment-recovery record (payment-linked protection)', () => {
    seedDraft(USER, 'app-1')
    const now = Date.now()
    usePaymentRecoveryStore.getState().record({
      application_id: 'app-1',
      payment_id: 'pay-1',
      reference: 'ref-1',
      method: 'mobile_money',
      initiated_at: now,
    })
    usePaymentRecoveryStore.getState().record({
      application_id: 'app-2',
      payment_id: 'pay-2',
      reference: 'ref-2',
      method: 'card',
      initiated_at: now,
    })

    clearWizardDraftCache({ userId: USER, applicationId: 'app-1' }, { notify: false })

    // The just-cleared draft's own recovery record AND every sibling's survive.
    expect(usePaymentRecoveryStore.getState().get('app-1')).not.toBeNull()
    expect(usePaymentRecoveryStore.getState().get('app-2')).not.toBeNull()
    // The whole recovery store blob is intact (no bulk removeItem).
    expect(localStorage.getItem(BROWSER_KEYS.paymentRecovery)).not.toBeNull()
  })

  it('notifies the draft store + dispatches a scoped draftCleared event by default', () => {
    seedDraft(USER, 'app-1')
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    const revisionBefore = useDraftStore.getState().revision

    clearWizardDraftCache({ userId: USER, applicationId: 'app-1' })

    expect(useDraftStore.getState().revision).toBeGreaterThan(revisionBefore)
    const cleared = dispatchSpy.mock.calls
      .map(([event]) => event)
      .find((event): event is CustomEvent => event instanceof CustomEvent && event.type === 'draftCleared')
    expect(cleared?.detail).toEqual({ applicationId: 'app-1' })
    dispatchSpy.mockRestore()
  })

  it('routes a null applicationId to the new-draft cleanup', () => {
    seedDraft(USER, null)
    seedDraft(USER, 'app-1')

    clearWizardDraftCache({ userId: USER, applicationId: null }, { notify: false })

    expect(localStorage.getItem(getWizardDraftStorageKey(USER, null))).toBeNull()
    // An attached sibling draft still survives.
    expect(localStorage.getItem(getWizardDraftStorageKey(USER, 'app-1'))).not.toBeNull()
  })
})

describe('clearNewWizardDraftCache — mode=new cleanup (R10.10)', () => {
  it('clears only the unattached new snapshot + legacy key, never another draft', () => {
    seedDraft(USER, null)
    seedDraft(USER, 'app-1')
    seedDraft(USER, 'app-2')
    localStorage.setItem(getLegacyWizardDraftStorageKey(), JSON.stringify({ currentStep: 1 }))

    clearNewWizardDraftCache(USER, { notify: false })

    expect(localStorage.getItem(getWizardDraftStorageKey(USER, null))).toBeNull()
    expect(localStorage.getItem(getLegacyWizardDraftStorageKey())).toBeNull()
    // Every attached draft survives — starting a new application must not erase another.
    expect(localStorage.getItem(getWizardDraftStorageKey(USER, 'app-1'))).not.toBeNull()
    expect(localStorage.getItem(getWizardDraftStorageKey(USER, 'app-2'))).not.toBeNull()
  })

  it('does not touch payment-recovery records on a fresh start', () => {
    usePaymentRecoveryStore.getState().record({
      application_id: 'app-1',
      payment_id: 'pay-1',
      reference: 'ref-1',
      method: 'mobile_money',
      initiated_at: Date.now(),
    })

    clearNewWizardDraftCache(USER, { notify: false })

    expect(usePaymentRecoveryStore.getState().get('app-1')).not.toBeNull()
    expect(localStorage.getItem(BROWSER_KEYS.paymentRecovery)).not.toBeNull()
  })
})

describe('writeWizardDraftSnapshot — single authoritative key', () => {
  // Task 6.3 M14 (R10.10): an attached write used to drop the unattached "new"
  // record too, so resuming one draft erased another application typed on this
  // device. The "new" record now goes only when its own application attaches
  // (the start command's onStarted — wizardDraftOutboxMinimisation M6/M7).
  it('writes the scoped key and leaves another, unattached application’s record alone', () => {
    seedDraft(USER, null, { stale: true })

    writeWizardDraftSnapshot({ currentStep: 3, applicationId: 'app-1' }, { userId: USER, applicationId: 'app-1' })

    expect(localStorage.getItem(getWizardDraftStorageKey(USER, 'app-1'))).not.toBeNull()
    expect(localStorage.getItem(getWizardDraftStorageKey(USER, null))).not.toBeNull()
  })
})
