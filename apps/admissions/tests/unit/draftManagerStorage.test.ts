import { beforeEach, describe, expect, it } from 'vitest'

import { hasDraftData } from '@/lib/draftManager'
import { getWizardDraftStorageKey, isDraftStorageKey, removeDraftStorageEntries } from '@/lib/draftStorageKeys'
import { BROWSER_KEYS, LEGACY_BROWSER_KEYS } from '@/lib/browserNamespace'

describe('draftManager storage detection', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('does not count cleanup metadata as an active draft', () => {
    localStorage.setItem('draftDeleted', 'true')
    localStorage.setItem(BROWSER_KEYS.applicationReminderRequest, JSON.stringify({ email: 'student@example.com' }))
    localStorage.setItem(BROWSER_KEYS.wizardAuthRedirectGuard, JSON.stringify({ createdAt: Date.now() }))
    localStorage.setItem(LEGACY_BROWSER_KEYS.wizardAuthRedirectGuard, JSON.stringify({ createdAt: Date.now() }))

    expect(hasDraftData()).toBe(false)
  })

  it('counts canonical draft content keys as active draft data', () => {
    localStorage.setItem('applicationWizardDraft', JSON.stringify({ currentStep: 2 }))

    expect(hasDraftData()).toBe(true)
  })

  it('counts scoped wizard draft keys as active draft data', () => {
    const key = getWizardDraftStorageKey('user-1', 'draft-1')
    localStorage.setItem(key, JSON.stringify({ currentStep: 2, userId: 'user-1', applicationId: 'draft-1' }))

    expect(isDraftStorageKey(key)).toBe(true)
    expect(hasDraftData()).toBe(true)
  })

  it('removes scoped wizard draft keys during draft cleanup', () => {
    const key = getWizardDraftStorageKey('user-1', 'draft-1')
    localStorage.setItem(key, JSON.stringify({ currentStep: 2 }))

    removeDraftStorageEntries(localStorage)

    expect(localStorage.getItem(key)).toBeNull()
  })
})
