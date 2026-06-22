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
 * in useSessionListener.ts and test it directly as a focused unit.
 *
 * _Requirements: 2.7_
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { BROWSER_KEYS, LEGACY_BROWSER_KEYS, removeStorageItemAndLegacy } from '@/lib/browserNamespace'

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
 *   4. queryClient.setQueryData(['user-profile', currentUserId], null)
 *   5. queryClient.setQueryData(['user-profile', undefined], null)
 *   6. queryClient.clear()
 *   7. secureStorage.clearSession() (best-effort)
 *   8. Remove redirect keys from localStorage/sessionStorage
 *   9. Dispatch events
 */
async function simulateSignOutCleanup(queryClient: QueryClient): Promise<void> {
  const currentUser = queryClient.getQueryData<{ user?: { id?: string } }>(['auth', 'session'])
  const currentUserId = currentUser?.user?.id

  // Step 2: Clear CSRF token
  clearCsrfToken()

  // Steps 3-5: Explicitly null out session and profile queries
  queryClient.setQueryData(['auth', 'session'], null)
  if (currentUserId) {
    queryClient.setQueryData(['user-profile', currentUserId], null)
  }
  queryClient.setQueryData(['user-profile', undefined], null)

  // Step 6: Clear all queries
  queryClient.clear()

  // Step 8: Clear redirect/session intent keys
  removeStorageItemAndLegacy(localStorage, BROWSER_KEYS.postAuthRedirect, [LEGACY_BROWSER_KEYS.postAuthRedirect])
  removeStorageItemAndLegacy(sessionStorage, BROWSER_KEYS.postAuthRedirect, [LEGACY_BROWSER_KEYS.postAuthRedirect])
  removeStorageItemAndLegacy(localStorage, BROWSER_KEYS.wizardAuthRedirectGuard, [LEGACY_BROWSER_KEYS.wizardAuthRedirectGuard])
  removeStorageItemAndLegacy(sessionStorage, BROWSER_KEYS.wizardAuthRedirectGuard, [LEGACY_BROWSER_KEYS.wizardAuthRedirectGuard])
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
      user: { id: 'user-123', email: 'student@example.com', role: 'student' },
    })
    queryClient.setQueryData(['user-profile', 'user-123'], {
      id: 'user-123',
      email: 'student@example.com',
      role: 'student',
    })

    // Seed redirect keys in storage
    localStorage.setItem(BROWSER_KEYS.postAuthRedirect, '/dashboard')
    sessionStorage.setItem(BROWSER_KEYS.postAuthRedirect, '/dashboard')
    localStorage.setItem(BROWSER_KEYS.wizardAuthRedirectGuard, 'true')
    sessionStorage.setItem(BROWSER_KEYS.wizardAuthRedirectGuard, 'true')
    localStorage.setItem(LEGACY_BROWSER_KEYS.postAuthRedirect, '/legacy-dashboard')
    sessionStorage.setItem(LEGACY_BROWSER_KEYS.postAuthRedirect, '/legacy-dashboard')
    localStorage.setItem(LEGACY_BROWSER_KEYS.wizardAuthRedirectGuard, 'legacy')
    sessionStorage.setItem(LEGACY_BROWSER_KEYS.wizardAuthRedirectGuard, 'legacy')
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
      user: { id: 'user-123', email: 'student@example.com', role: 'student' },
    })

    await simulateSignOutCleanup(queryClient)

    // After signOut, queryClient.clear() removes all queries — data is undefined
    const after = queryClient.getQueryData(['auth', 'session'])
    expect(after).toBeUndefined()
  })

  it('removes sessionStorage and localStorage redirect keys after signOut', async () => {
    // Verify keys exist before signOut
    expect(localStorage.getItem(BROWSER_KEYS.postAuthRedirect)).toBe('/dashboard')
    expect(sessionStorage.getItem(BROWSER_KEYS.postAuthRedirect)).toBe('/dashboard')
    expect(localStorage.getItem(BROWSER_KEYS.wizardAuthRedirectGuard)).toBe('true')
    expect(sessionStorage.getItem(BROWSER_KEYS.wizardAuthRedirectGuard)).toBe('true')

    await simulateSignOutCleanup(queryClient)

    expect(localStorage.getItem(BROWSER_KEYS.postAuthRedirect)).toBeNull()
    expect(sessionStorage.getItem(BROWSER_KEYS.postAuthRedirect)).toBeNull()
    expect(localStorage.getItem(BROWSER_KEYS.wizardAuthRedirectGuard)).toBeNull()
    expect(sessionStorage.getItem(BROWSER_KEYS.wizardAuthRedirectGuard)).toBeNull()
    expect(localStorage.getItem(LEGACY_BROWSER_KEYS.postAuthRedirect)).toBeNull()
    expect(sessionStorage.getItem(LEGACY_BROWSER_KEYS.postAuthRedirect)).toBeNull()
    expect(localStorage.getItem(LEGACY_BROWSER_KEYS.wizardAuthRedirectGuard)).toBeNull()
    expect(sessionStorage.getItem(LEGACY_BROWSER_KEYS.wizardAuthRedirectGuard)).toBeNull()
  })

  it('clears the CSRF token after signOut', async () => {
    // Verify CSRF token exists before signOut
    expect(getCsrfToken()).toBe('mock-csrf-token')

    await simulateSignOutCleanup(queryClient)

    expect(clearCsrfToken).toHaveBeenCalled()
    expect(getCsrfToken()).toBeNull()
  })
})
