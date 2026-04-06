import { describe, expect, it } from 'vitest'

import { resolveAuthLoadingState } from '@/hooks/auth/useSessionListener'

describe('resolveAuthLoadingState', () => {
  it('keeps auth bootstrap blocked while the session query is still loading', () => {
    expect(resolveAuthLoadingState({
      sessionLoading: true,
      user: null,
      profileLoading: false,
    })).toBe(true)
  })

  it('does not block route rendering on profile hydration after the session is known', () => {
    expect(resolveAuthLoadingState({
      sessionLoading: false,
      user: {
        id: 'student-1',
        email: 'student@example.com',
        role: 'student',
      } as any,
      profileLoading: true,
    })).toBe(false)
  })

  it('blocks route rendering while a cached session is being revalidated', () => {
    expect(resolveAuthLoadingState({
      sessionLoading: false,
      sessionPendingValidation: true,
      user: null,
      profileLoading: false,
    })).toBe(true)
  })
})
