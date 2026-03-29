import { describe, it, expect } from 'vitest'

import {
  getCachedAuthUser,
  hasRecentWizardRedirectGuard,
  shouldRedirectToSignIn,
} from '@/pages/student/applicationWizard/hooks/useWizardController'

describe('wizard session redirect hardening', () => {
  it('redirects only when recheck fails, refresh fails, and no cached user', () => {
    expect(shouldRedirectToSignIn({
      sessionRecheckFailed: true,
      tokenRefreshFailed: true,
      cachedUser: null,
    })).toBe(true)

    expect(shouldRedirectToSignIn({
      sessionRecheckFailed: false,
      tokenRefreshFailed: true,
      cachedUser: null,
    })).toBe(false)

    expect(shouldRedirectToSignIn({
      sessionRecheckFailed: true,
      tokenRefreshFailed: false,
      cachedUser: null,
    })).toBe(false)

    expect(shouldRedirectToSignIn({
      sessionRecheckFailed: true,
      tokenRefreshFailed: true,
      cachedUser: { id: 'u-1' },
    })).toBe(false)
  })

  it('uses cached auth user as single source-of-truth fallback', () => {
    expect(getCachedAuthUser({ user: { id: 'cached-user' } })).toEqual({ id: 'cached-user' })
    expect(getCachedAuthUser({ user: null })).toBeNull()
    expect(getCachedAuthUser(null)).toBeNull()
  })

  it('treats guard as active only within loop-prevention window', () => {
    const now = 100_000
    const fresh = JSON.stringify({ createdAt: now - 2_000 })
    const stale = JSON.stringify({ createdAt: now - 20_000 })

    expect(hasRecentWizardRedirectGuard(fresh, now)).toBe(true)
    expect(hasRecentWizardRedirectGuard(stale, now)).toBe(false)
    expect(hasRecentWizardRedirectGuard('invalid-json', now)).toBe(false)
    expect(hasRecentWizardRedirectGuard(null, now)).toBe(false)
  })
})
