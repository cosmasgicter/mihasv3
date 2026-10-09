/**
 * `applicationSessionManager.getLocalWizardDraft` cleanup scope (task 6.3 —
 * R10.4, R10.10; finding STU-12).
 *
 * The dashboard calls `getLocalWizardDraft(user.id)` on every load, focus and
 * storage event, and the wizard loader calls it on every mount. When the record
 * it finds belongs to an application that is no longer a draft, it used to call
 * a whole-browser draft wipe; the "before" run of this file
 * (`docs/v2-evidence/6.3/raw/m12-01-characterisation-before.txt`) shows it
 * erasing another application's recovery record. It now removes that one
 * record only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getByIdMock = vi.fn()

vi.mock('@/services/applications', () => ({
  applicationService: {
    list: vi.fn(),
    delete: vi.fn(),
    getById: getByIdMock,
    update: vi.fn(),
  },
}))

vi.mock('@/lib/security', () => ({
  generateSecureToken: vi.fn(() => 'session-token'),
}))

describe('getLocalWizardDraft cleanup scope', () => {
  beforeEach(() => {
    vi.resetModules()
    getByIdMock.mockReset()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('FIXED: a stale submitted record for one application never erases another draft', async () => {
    const { getWizardDraftStorageKey } = await import('@/lib/draftStorageKeys')
    const { resetCache } = await import('@/lib/localStorageCache')
    resetCache()
    const staleKey = getWizardDraftStorageKey('user-1', 'app-a')
    const siblingKey = getWizardDraftStorageKey('user-1', 'app-b')
    // Insertion order makes app-a the first candidate the manager reads.
    localStorage.setItem(
      staleKey,
      JSON.stringify({ applicationId: 'app-a', userId: 'user-1', formData: { full_name: 'A' }, version: 2 }),
    )
    localStorage.setItem(
      siblingKey,
      JSON.stringify({ applicationId: 'app-b', userId: 'user-1', formData: { full_name: 'B' }, version: 2 }),
    )
    getByIdMock.mockResolvedValue({ application: { id: 'app-a', status: 'submitted' } })

    const { applicationSessionManager } = await import('@/lib/applicationSession')
    const result = await applicationSessionManager.getLocalWizardDraft('user-1')

    expect(result).toBeNull()
    expect(localStorage.getItem(staleKey)).toBeNull()
    // R10.10: the other application's recovery record survives.
    expect(localStorage.getItem(siblingKey)).not.toBeNull()
  })

  it('a deleted (404) draft drops its own record only, and never the payment-recovery store', async () => {
    const { getWizardDraftStorageKey } = await import('@/lib/draftStorageKeys')
    const { BROWSER_KEYS } = await import('@/lib/browserNamespace')
    const { resetCache } = await import('@/lib/localStorageCache')
    resetCache()
    const goneKey = getWizardDraftStorageKey('user-1', 'app-gone')
    const siblingKey = getWizardDraftStorageKey('user-1', 'app-live')
    localStorage.setItem(
      goneKey,
      JSON.stringify({ applicationId: 'app-gone', userId: 'user-1', formData: {}, version: 2 }),
    )
    localStorage.setItem(
      siblingKey,
      JSON.stringify({ applicationId: 'app-live', userId: 'user-1', formData: {}, version: 2 }),
    )
    localStorage.setItem(BROWSER_KEYS.paymentRecovery, JSON.stringify({ state: { entries: { x: 1 } } }))
    getByIdMock.mockRejectedValue(Object.assign(new Error('Resource not found'), { status: 404 }))

    const { applicationSessionManager } = await import('@/lib/applicationSession')
    expect(await applicationSessionManager.getLocalWizardDraft('user-1')).toBeNull()

    expect(localStorage.getItem(goneKey)).toBeNull()
    expect(localStorage.getItem(siblingKey)).not.toBeNull()
    expect(localStorage.getItem(BROWSER_KEYS.paymentRecovery)).not.toBeNull()
  })
})
