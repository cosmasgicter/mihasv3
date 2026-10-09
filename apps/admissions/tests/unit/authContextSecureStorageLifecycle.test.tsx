/**
 * AuthContext's secure-storage lifecycle (admissions-v2 task 6.3, M13 — R10.4,
 * R10.8; finding STU-02).
 *
 * The encrypted local storage — the wizard's draft outbox — belongs to the
 * signed-in user. The browser run (docs/v2-evidence/6.3/raw/m13-04-*) caught
 * AuthContext clearing it on every page load: before the session resolves
 * `auth.user` is null, and the "no user" branch ran `clearSession()`, which
 * deleted the salt and every encrypted draft record ~50 ms into the load. A
 * student's offline edits therefore never survived a refresh, a closed tab or a
 * crash, while the wizard told them the work was "saved on this device".
 *
 * The rule pinned here: storage is cleared when a signed-in owner goes away —
 * sign-out, a cross-tab logout, the auth-failure cascade, another user signing
 * in in this tab — and never when no owner has existed yet.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/types/auth'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  sessionUser: null as User | null,
  init: vi.fn(),
  clearSession: vi.fn(),
  preload: vi.fn(),
  resetCache: vi.fn(),
}))

const queryClient = {
  invalidateQueries: vi.fn(),
  setQueryData: vi.fn(),
  cancelQueries: vi.fn().mockResolvedValue(undefined),
  removeQueries: vi.fn(),
  getQueryData: vi.fn().mockReturnValue(null),
  clear: vi.fn(),
}

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => queryClient,
}))

vi.mock('@/hooks/auth/useSessionListener', () => ({
  useSessionListener: () => ({
    user: mocks.sessionUser,
    profile: null,
    loading: mocks.sessionUser === null,
    profileLoading: false,
    isAdmin: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    requestPasswordReset: vi.fn(),
    updatePassword: vi.fn(),
  }),
}))

vi.mock('@/services/client', () => ({ configureApiClientAuthFailure: vi.fn() }))
vi.mock('@/lib/authBroadcast', () => ({ useAuthBroadcast: vi.fn() }))
vi.mock('@/lib/csrfToken', () => ({ clearCsrfToken: vi.fn() }))
vi.mock('@/lib/speculativePrefetch', () => ({ resetPrefetchState: vi.fn() }))
vi.mock('@/lib/sessionHardening', () => ({ SESSION_MESSAGES: { SESSION_EXPIRED: 'SESSION_EXPIRED' } }))
vi.mock('@/lib/secureStorage', () => ({
  secureStorage: { init: mocks.init },
  clearSession: mocks.clearSession,
}))
vi.mock('@/lib/localStorageCache', () => ({
  preloadSecureStorage: mocks.preload,
  resetCache: mocks.resetCache,
}))

import { AuthProvider } from '@/contexts/AuthContext'

const student = (id: string): User => ({ id, email: `${id}@example.com`, role: 'student' })

describe('AuthContext secure-storage lifecycle', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  async function renderWith(user: User | null) {
    mocks.sessionUser = user
    await act(async () => {
      root.render(
        <AuthProvider>
          <div>child</div>
        </AuthProvider>,
      )
    })
    // Let the effect's async storage work settle.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.order.length = 0
    mocks.sessionUser = null
    mocks.init.mockImplementation(async (id: string) => {
      mocks.order.push(`init:${id}`)
    })
    mocks.clearSession.mockImplementation(async () => {
      mocks.order.push('clearSession')
    })
    mocks.preload.mockImplementation(async () => {
      mocks.order.push('preload')
    })
    mocks.resetCache.mockImplementation(() => {
      mocks.order.push('resetCache')
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('never clears storage on page load, before the session is known', async () => {
    await renderWith(null)
    await renderWith(null)
    expect(mocks.clearSession).not.toHaveBeenCalled()
    expect(mocks.resetCache).not.toHaveBeenCalled()
  })

  it('derives the key and decrypts the outbox once the student is known, without clearing it', async () => {
    await renderWith(null)
    await renderWith(student('student-a'))
    expect(mocks.order).toEqual(['init:student-a', 'preload'])
  })

  it('does not re-derive the key when the same student arrives as a new object', async () => {
    await renderWith(student('student-a'))
    await renderWith({ ...student('student-a'), full_name: 'Refreshed Profile' })
    expect(mocks.init).toHaveBeenCalledTimes(1)
    expect(mocks.clearSession).not.toHaveBeenCalled()
  })

  it('clears storage when the signed-in student goes away (sign-out, cross-tab logout, auth-failure cascade)', async () => {
    await renderWith(student('student-a'))
    mocks.order.length = 0
    await renderWith(null)
    expect(mocks.order).toEqual(['clearSession', 'resetCache'])
  })

  it('clears the previous owner before deriving the next owner’s key when another user signs in in this tab', async () => {
    await renderWith(student('student-a'))
    mocks.order.length = 0
    await renderWith(student('student-b'))
    expect(mocks.order).toEqual(['clearSession', 'resetCache', 'init:student-b', 'preload'])
  })
})
