import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const invalidateQueriesSpy = vi.fn()
const setQueryDataSpy = vi.fn()
const clearSpy = vi.fn()

vi.mock('@tanstack/react-query', () => ({
  QueryClient: class { defaultOptions = {} },
  QueryClientProvider: ({ children }: { children: unknown }) => children,
  useQueryClient: () => ({
    invalidateQueries: (...args: unknown[]) => invalidateQueriesSpy(...args),
    setQueryData: (...args: unknown[]) => setQueryDataSpy(...args),
    clear: (...args: unknown[]) => clearSpy(...args),
    getQueryData: () => null,
  }),
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

const useAuthBroadcastSpy = vi.fn()

vi.mock('@/lib/authBroadcast', () => ({
  useAuthBroadcast: (...args: unknown[]) => useAuthBroadcastSpy(...args),
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
  SESSION_MESSAGES: { EXPIRED: 'SESSION_EXPIRED', REVOKED: 'SESSION_REVOKED' },
}))

import { AuthProvider } from '@/contexts/AuthContext'

describe('AuthProvider pageshow revalidation', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    vi.clearAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('revalidates the auth session when the page is restored from bfcache', () => {
    act(() => {
      root.render(
        <AuthProvider>
          <div>child</div>
        </AuthProvider>
      )
    })

    const event = new Event('pageshow')
    Object.defineProperty(event, 'persisted', { value: true })

    act(() => {
      window.dispatchEvent(event)
    })

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['auth', 'session'] })
  })

  it('does not add extra auth revalidation on a normal pageshow event', () => {
    act(() => {
      root.render(
        <AuthProvider>
          <div>child</div>
        </AuthProvider>
      )
    })

    const event = new Event('pageshow')
    Object.defineProperty(event, 'persisted', { value: false })

    act(() => {
      window.dispatchEvent(event)
    })

    expect(invalidateQueriesSpy).not.toHaveBeenCalled()
  })

  it('mounts the auth broadcast listener inside the provider', () => {
    act(() => {
      root.render(
        <AuthProvider>
          <div>child</div>
        </AuthProvider>
      )
    })

    expect(useAuthBroadcastSpy).toHaveBeenCalledTimes(1)
  })
})
