/**
 * ProtectedRoute makes one session-restore attempt before it redirects.
 *
 * Spec: student-journey-repair task 3.26, clause 2.41 (design R8-a). Same
 * contract as the student and admin guards in sjrSessionRestore.test.tsx.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = { isAuthenticated: false, isLoading: false }
vi.mock('@/hooks/auth/useSessionListener', () => ({
  useAuthCheck: () => state,
}))
vi.mock('@/lib/loaderTelemetry', () => ({
  startLoaderTelemetry: () => ({ end: () => undefined }),
}))

let resolveRefresh: (value: boolean) => void = () => undefined
const refreshAuthSession = vi.fn(
  () =>
    new Promise<boolean>((resolve) => {
      resolveRefresh = (value) => {
        if (value) state.isAuthenticated = true
        resolve(value)
      }
    }),
)
vi.mock('@/services/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/client')>()
  return {
    ...actual,
    apiClient: Object.assign(Object.create(Object.getPrototypeOf(actual.apiClient)), actual.apiClient, {
      refreshAuthSession: () => refreshAuthSession(),
    }),
  }
})

const { ProtectedRoute } = await import('@/components/ProtectedRoute')
const { allowSessionRestore, suppressSessionRestore } = await import('@/hooks/auth/useSessionRestoreOnce')

function renderGuarded() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/protected" element={<ProtectedRoute>protected content</ProtectedRoute>} />
          <Route path="/auth/signin" element={<div>sign-in page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  state.isAuthenticated = false
  state.isLoading = false
  refreshAuthSession.mockClear()
  allowSessionRestore()
})

describe('ProtectedRoute session restore (clause 2.41)', () => {
  it('restores once, then renders the route', async () => {
    renderGuarded()
    expect(screen.queryByText('sign-in page')).toBeNull()
    expect(screen.getByText(/Restoring your session/i)).toBeTruthy()
    expect(refreshAuthSession).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolveRefresh(true)
    })
    expect(await screen.findByText('protected content')).toBeTruthy()
    expect(refreshAuthSession).toHaveBeenCalledTimes(1)
  })

  it('redirects after a failed restore without retrying', async () => {
    renderGuarded()
    await act(async () => {
      resolveRefresh(false)
    })
    expect(await screen.findByText('sign-in page')).toBeTruthy()
    expect(refreshAuthSession).toHaveBeenCalledTimes(1)
  })

  it('sends no refresh after a sign-out (restore suppressed)', async () => {
    suppressSessionRestore()
    renderGuarded()
    expect(await screen.findByText('sign-in page')).toBeTruthy()
    expect(refreshAuthSession).not.toHaveBeenCalled()
  })
})
