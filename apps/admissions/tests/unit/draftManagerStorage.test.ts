import { beforeEach, describe, expect, it } from 'vitest'

import { hasDraftData } from '@/lib/draftManager'

describe('draftManager storage detection', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('does not count cleanup metadata as an active draft', () => {
    localStorage.setItem('draftDeleted', 'true')
    localStorage.setItem('mihas:application-reminder-request', JSON.stringify({ email: 'student@example.com' }))
    localStorage.setItem('mihas:wizard-auth-redirect-guard', JSON.stringify({ createdAt: Date.now() }))

    expect(hasDraftData()).toBe(false)
  })

  it('counts canonical draft content keys as active draft data', () => {
    localStorage.setItem('applicationWizardDraft', JSON.stringify({ currentStep: 2 }))

    expect(hasDraftData()).toBe(true)
  })
})
