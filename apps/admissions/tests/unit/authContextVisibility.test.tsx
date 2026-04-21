/**
 * Unit tests for simplified AuthContext visibility handling
 *
 * Validates Requirements 7.1, 7.2, 7.3:
 * - Visibility change triggers session invalidation without payment guards
 * - 3-second debounce prevents rapid re-invalidation
 * - No payment-in-progress imports or checks
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const invalidateQueriesSpy = vi.fn()
const setQueryDataSpy = vi.fn()
const cancelQueriesSpy = vi.fn().mockResolvedValue(undefined)
const removeQueriesSpy = vi.fn()
const getQueryDataSpy = vi.fn().mockReturnValue(null)

// Stable reference so useEffect dependency on queryClient doesn't cause re-runs
const mockQueryClient = {
  invalidateQueries: (...args: unknown[]) => invalidateQueriesSpy(...args),
  setQueryData: (...args: unknown[]) => setQueryDataSpy(...args),
  cancelQueries: (...args: unknown[]) => cancelQueriesSpy(...args),
  removeQueries: (...args: unknown[]) => removeQueriesSpy(...args),
  getQueryData: (...args: unknown[]) => getQueryDataSpy(...args),
  clear: vi.fn(),
}

vi.mock('@tanstack/react-query', () => ({
  QueryClient: class { defaultOptions = {} },
  QueryClientProvider: ({ children }: { children: unknown }) => children,
  useQueryClient: () => mockQueryClient,
}))

vi.mock('@/hooks/auth/useSessionListener', () => ({
  useSessionListener: () => ({
    user: null,
    profile: null,
    loading: false,
    profileLoading: false,
    isAdmin: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    requestPasswordReset: vi.fn(),
    updatePassword: vi.fn(),
  }),
}))

vi.mock('@/services/client', () => ({
  configureApiClientAuthFailure: vi.fn(),
}))

vi.mock('@/lib/authBroadcast', () => ({
  useAuthBroadcast: vi.fn(),
}))

vi.mock('@/lib/csrfToken', () => ({
  clearCsrfToken: vi.fn(),
}))

vi.mock('@/lib/secureStorage', () => ({
  secureStorage: {
    clearSession: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/lib/speculativePrefetch', () => ({
  resetPrefetchState: vi.fn(),
}))

vi.mock('@/lib/sessionHardening', () => ({
  SESSION_MESSAGES: { SESSION_EXPIRED: 'SESSION_EXPIRED' },
}))

import { AuthProvider } from '@/contexts/AuthContext'

// Helper to simulate visibilityState changes
function setVisibilityState(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    writable: true,
    configurable: true,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('AuthContext visibility handling (Requirements 7.1, 7.2, 7.3)', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let dateNowSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock Date.now() to control the debounce timing.
    // Start at 10000 so the first visibility change passes the debounce check
    // (lastSessionInvalidationRef starts at 0, so now - 0 >= 3000 must be true).
    let currentTime = 10000
    dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => currentTime)
    // Expose a way to advance time
    ;(globalThis as any).__setMockTime = (t: number) => { currentTime = t }

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    // Start with visible state
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    dateNowSpy.mockRestore()
    delete (globalThis as any).__setMockTime
  })

  function setMockTime(t: number) {
    ;(globalThis as any).__setMockTime(t)
  }

  describe('Visibility change triggers session invalidation (Req 7.1)', () => {
    it('invalidates session query when tab goes hidden then visible', () => {
      act(() => {
        root.render(
          <AuthProvider>
            <div>child</div>
          </AuthProvider>,
        )
      })

      // Go hidden first (sets hasHiddenOnce flag)
      act(() => setVisibilityState('hidden'))

      // Come back visible — should trigger invalidation
      act(() => setVisibilityState('visible'))

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['auth', 'session'] })
    })

    it('does not invalidate on the first visibility event (skips initial load)', () => {
      act(() => {
        root.render(
          <AuthProvider>
            <div>child</div>
          </AuthProvider>,
        )
      })

      // Directly go visible without going hidden first
      act(() => setVisibilityState('visible'))

      expect(invalidateQueriesSpy).not.toHaveBeenCalled()
    })

    it('does not invalidate when going hidden (only on visible)', () => {
      act(() => {
        root.render(
          <AuthProvider>
            <div>child</div>
          </AuthProvider>,
        )
      })

      act(() => setVisibilityState('hidden'))

      expect(invalidateQueriesSpy).not.toHaveBeenCalled()
    })
  })

  describe('3-second debounce (Req 7.2)', () => {
    it('does not trigger multiple invalidations within 3 seconds', () => {
      act(() => {
        root.render(
          <AuthProvider>
            <div>child</div>
          </AuthProvider>,
        )
      })

      // First cycle: hidden → visible at t=10000
      act(() => setVisibilityState('hidden'))
      act(() => setVisibilityState('visible'))
      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(1)

      // Second cycle at t=11000 (within debounce window)
      setMockTime(11000)
      act(() => setVisibilityState('hidden'))
      act(() => setVisibilityState('visible'))
      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(1) // still 1

      // Third cycle at t=12500 (still within debounce window)
      setMockTime(12500)
      act(() => setVisibilityState('hidden'))
      act(() => setVisibilityState('visible'))
      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(1) // still 1
    })

    it('triggers invalidation after 3 seconds have passed', () => {
      act(() => {
        root.render(
          <AuthProvider>
            <div>child</div>
          </AuthProvider>,
        )
      })

      // First cycle at t=10000
      act(() => setVisibilityState('hidden'))
      act(() => setVisibilityState('visible'))
      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(1)

      // Second cycle at t=13000 (exactly at debounce boundary)
      setMockTime(13000)
      act(() => setVisibilityState('hidden'))
      act(() => setVisibilityState('visible'))
      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(2)
    })

    it('allows repeated invalidations when each is spaced 3+ seconds apart', () => {
      act(() => {
        root.render(
          <AuthProvider>
            <div>child</div>
          </AuthProvider>,
        )
      })

      // Cycle 1 at t=10000
      act(() => setVisibilityState('hidden'))
      act(() => setVisibilityState('visible'))
      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(1)

      // Cycle 2 at t=14000
      setMockTime(14000)
      act(() => setVisibilityState('hidden'))
      act(() => setVisibilityState('visible'))
      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(2)

      // Cycle 3 at t=18000
      setMockTime(18000)
      act(() => setVisibilityState('hidden'))
      act(() => setVisibilityState('visible'))
      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(3)
    })
  })

  describe('No payment-in-progress guards (Req 7.3)', () => {
    it('AuthContext.tsx does not import isPaymentInProgress', () => {
      const authContextPath = path.resolve(__dirname, '../../src/contexts/AuthContext.tsx')
      const content = fs.readFileSync(authContextPath, 'utf-8')
      expect(content).not.toContain('isPaymentInProgress')
      expect(content).not.toContain('useApplicationPaymentAction')
    })

    it('AuthContext.tsx does not contain payment-related guards in visibility handler', () => {
      const authContextPath = path.resolve(__dirname, '../../src/contexts/AuthContext.tsx')
      const content = fs.readFileSync(authContextPath, 'utf-8')
      expect(content).not.toContain('_isPaymentInProgress')
      expect(content).not.toContain('PaymentInProgress')
    })
  })
})
