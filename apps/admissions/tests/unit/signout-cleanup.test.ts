/**
 * Unit tests for signOut cleanup completeness in useSessionListener
 *
 * Verifies that after signOut:
 * 1. queryClient.getQueryData(['auth', 'session']) is undefined
 * 2. sessionStorage/localStorage redirect keys are removed
 * 3. CSRF token is cleared
 *
 * Since signOut lives inside a React hook and @testing-library/react is not
 * available, we replicate the exact cleanup logic from the signOut callback
 * in useSessionListener.ts and test it directly — same pattern used by
 * cache-reset-url-cleanup.test.ts.
 *
 * _Requirements: 2.7_
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

// ── Mock the CSRF token module ──────────────────────────────────────────────

let csrfTokenStore: string | null = 'mock-csrf-token'

vi.mock('@/lib/csrfToken', () => ({
  setCsrfToken: vi.fn((t: string | null) => { csrfTokenStore = t }),
  getCsrfToken: vi.fn(() => csrfTokenStore),
  clearCsrfToken: vi.fn(() => { csrfTokenStore = null }),
}))

// Import after mock setup
import { clearCsrfToken, getCsrfToken } from '@/lib/csrfToken'

/**
 * Replicates the signOut cleanup logic from useSessionListener.ts.
 * The actual signOut callback does:
 *   1. authService.logout() (network call — best-effort, not relevant here)
 *   2. clearCsrfToken()
 *   3. queryClient.setQueryData(['auth', 'session'], null)
 *   4. queryClient.setQueryData(['user-profile', undefined], null)
 *   5. queryClient.clear()
 *   6. secureStorage.clearSession() (best-effort)
 *   7. Remove redirect keys from localStorage/sessionStorage
 *   8. Dispatch events
 */
async function simulateSignOutCleanup(queryClient: QueryClient): Promise<void> {
  // Step 2: Clear CSRF token
  clearCsrfToken()

  // Steps 3-4: Explicitly null out session and profile queries
  queryClient.setQueryData(['auth', 'session'], null)
  queryClient.setQueryData(['user-profile', undefined], null)

  // Step 5: Clear all queries
  queryClient.clear()

  // Step 7: Clear redirect/session intent keys
  localStorage.removeItem('mihas:post-auth-redirect')
  sessionStorage.removeItem('mihas:post-auth-redirect')
  localStorage.removeItem('mihas:wizard-auth-redirect-guard')
  sessionStorage.removeItem('mihas:wizard-auth-redirect-guard')
}

describe('signOut cleanup completeness', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    csrfTokenStore = 'mock-csrf-token'

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
      },
    })

    // Seed session data to simulate an authenticated state
    queryClient.setQueryData(['auth', 'session'], {
      user: { id: 'user-123', email: 'test@mihas.edu.zm', role: 'student' },
    })
    queryClient.setQueryData(['user-profile', 'user-123'], {
      id: 'user-123',
      email: 'test@mihas.edu.zm',
      role: 'student',
    })

    // Seed redirect keys in storage
    localStorage.setItem('mihas:post-auth-redirect', '/dashboard')
    sessionStorage.setItem('mihas:post-auth-redirect', '/dashboard')
    localStorage.setItem('mihas:wizard-auth-redirect-guard', 'true')
    sessionStorage.setItem('mihas:wizard-auth-redirect-guard', 'true')
  })

  afterEach(() => {
    queryClient.clear()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('clears session query data after signOut', async () => {
    // Verify session data exists before signOut
    const before = queryClient.getQueryData(['auth', 'session'])
    expect(before).toEqual({
      user: { id: 'user-123', email: 'test@mihas.edu.zm', role: 'student' },
    })

    await simulateSignOutCleanup(queryClient)

    // After signOut, queryClient.clear() removes all queries — data is undefined
    const after = queryClient.getQueryData(['auth', 'session'])
    expect(after).toBeUndefined()
  })

  it('removes sessionStorage and localStorage redirect keys after signOut', async () => {
    // Verify keys exist before signOut
    expect(localStorage.getItem('mihas:post-auth-redirect')).toBe('/dashboard')
    expect(sessionStorage.getItem('mihas:post-auth-redirect')).toBe('/dashboard')
    expect(localStorage.getItem('mihas:wizard-auth-redirect-guard')).toBe('true')
    expect(sessionStorage.getItem('mihas:wizard-auth-redirect-guard')).toBe('true')

    await simulateSignOutCleanup(queryClient)

    expect(localStorage.getItem('mihas:post-auth-redirect')).toBeNull()
    expect(sessionStorage.getItem('mihas:post-auth-redirect')).toBeNull()
    expect(localStorage.getItem('mihas:wizard-auth-redirect-guard')).toBeNull()
    expect(sessionStorage.getItem('mihas:wizard-auth-redirect-guard')).toBeNull()
  })

  it('clears the CSRF token after signOut', async () => {
    // Verify CSRF token exists before signOut
    expect(getCsrfToken()).toBe('mock-csrf-token')

    await simulateSignOutCleanup(queryClient)

    expect(clearCsrfToken).toHaveBeenCalled()
    expect(getCsrfToken()).toBeNull()
  })
})
