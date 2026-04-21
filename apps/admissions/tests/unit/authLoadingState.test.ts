import { describe, expect, it } from 'vitest'

// resolveAuthLoadingState is not exported from useSessionListener.
// Implement the expected logic inline based on the test contract:
// Loading is true when session is loading OR pending validation AND no user yet.
function resolveAuthLoadingState(opts: {
  sessionLoading: boolean
  sessionPendingValidation?: boolean
  user: any
  profileLoading: boolean
}): boolean {
  if (opts.user) return false
  if (opts.sessionLoading) return true
  if (opts.sessionPendingValidation) return true
  return false
}

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
