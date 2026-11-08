/**
 * R8 exploration: route guards try the refresh cookie before redirecting.
 *
 * Spec: student-journey-repair task 1.8, clause 1.38 (design R8-a).
 *
 * The bootstrap session read deliberately does not refresh (public pages must
 * never POST refresh), so a student whose 30-minute access token expired while
 * the tab slept is sent to Sign in although their 7-day refresh cookie is valid.
 * `StudentRoute` and `AdminRoute` (the guards every non-public route uses)
 * redirect as soon as `user` is null. The fix makes each guard try one refresh,
 * showing "Restoring your session" meanwhile.
 *
 * Public routes already never refresh; that half is preservation (g), task 2.3.
 * Wrapped in `it.fails` (design "Marker scheme"); task 3.28 removes the wrapper.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = {
  user: null as null | { id: string; role: string },
  isAdmin: false,
  loading: false,
}

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => auth,
}))
vi.mock('@/contexts/CapabilityContext', () => ({
  useCapabilities: () => ({ isLoading: false, noAccess: false, isSuperAdmin: false }),
}))
vi.mock('@/contexts/InstitutionScopeContext', () => ({
  InstitutionScopeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('@/lib/loaderTelemetry', () => ({
  startLoaderTelemetry: () => ({ end: () => undefined }),
}))

let resolveRefresh: (value: boolean) => void = () => undefined
const refreshAuthSession = vi.fn(
  () =>
    new Promise<boolean>((resolve) => {
      resolveRefresh = (value) => {
        if (value) {
          auth.user = { id: 'user-1', role: guardRole }
          auth.isAdmin = guardRole === 'admin'
        }
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

let guardRole = 'student'

const { StudentRoute } = await import('@/components/StudentRoute')
const { AdminRoute } = await import('@/components/AdminRoute')
const { pathFor } = await import('@/routes/routeRegistry')

const GUARDS = [
  { name: 'StudentRoute', role: 'student', Guard: StudentRoute },
  { name: 'AdminRoute', role: 'admin', Guard: AdminRoute },
] as const

function renderGuarded(Guard: (props: { children: ReactNode }) => ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/protected" element={<Guard>protected content</Guard>} />
          <Route path={pathFor('auth.signIn')} element={<div>sign-in page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  auth.user = null
  auth.isAdmin = false
  auth.loading = false
  refreshAuthSession.mockClear()
})

describe.each(GUARDS)('$name with an unauthenticated session (clause 1.38)', ({ role, Guard }) => {
  beforeEach(() => {
    guardRole = role
  })

  it.fails('restores the session once, then renders the route', async () => {
    renderGuarded(Guard)

    // HEAD: an immediate redirect to sign-in, and no refresh request.
    expect(screen.queryByText('sign-in page')).toBeNull()
    expect(screen.getByText(/Restoring your session/i)).toBeTruthy()
    expect(refreshAuthSession).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveRefresh(true)
    })

    expect(await screen.findByText('protected content')).toBeTruthy()
    expect(refreshAuthSession).toHaveBeenCalledTimes(1)
  })

  it.fails('redirects to sign-in after a failed restore, without retrying', async () => {
    renderGuarded(Guard)
    expect(refreshAuthSession).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveRefresh(false)
    })

    expect(await screen.findByText('sign-in page')).toBeTruthy()
    expect(refreshAuthSession).toHaveBeenCalledTimes(1)
  })
})
