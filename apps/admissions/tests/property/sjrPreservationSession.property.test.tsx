/**
 * Student-journey-repair preservation properties (frontend, session half).
 *
 * Spec: student-journey-repair task 2.3, design "New preservation tests"
 * (frontend (f) and (g)); Property 13; clauses 3.19, 3.23.
 *
 * (f) After a sign-out, or a logout broadcast from another tab, no route guard
 *     sends a refresh request (the session restore of task 3.26 must not sign
 *     the user back in with a still-valid cookie).
 * (g) Rendering any public route with an unauthenticated session never sends a
 *     refresh request (holds at HEAD; moved out of task 1.8 under the marker rule).
 *
 * The app's own providers, guards, session hook, auth service and API client
 * run; only `fetch` is replaced, by a small stateful fake server. A refresh is
 * detected at the transport, so it is caught whichever code path sends it.
 * Both properties pass on the unfixed code and are re-run unchanged at every
 * task-3 checkpoint.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const STUDENT = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'preservation.student@example.com',
  role: 'student',
  first_name: 'Preservation',
  last_name: 'Student',
  full_name: 'Preservation Student',
}

/** A tiny stateful auth server: signed in until logout, refresh is recorded. */
const server = { signedIn: false, refreshCalls: 0, requests: [] as string[] }

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function fakeFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(typeof input === 'string' || input instanceof URL ? input : input.url)
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  server.requests.push(`${method} ${url}`)
  if (url.includes('/auth/refresh/')) {
    server.refreshCalls += 1
    return Promise.resolve(json(401, { success: false, code: 'NO_REFRESH_TOKEN', error: 'No refresh token' }))
  }
  if (url.includes('/auth/logout/')) {
    server.signedIn = false
    return Promise.resolve(json(200, { success: true, data: {} }))
  }
  if (url.includes('/auth/session/')) {
    return Promise.resolve(
      json(200, { success: true, data: server.signedIn ? { user: STUDENT } : { user: null } }),
    )
  }
  if (url.includes('/auth/profile/') || url.includes('/accounts/profile/')) {
    return Promise.resolve(
      server.signedIn
        ? json(200, { success: true, data: STUDENT })
        : json(401, { success: false, code: 'NOT_AUTHENTICATED', error: 'Not authenticated' }),
    )
  }
  return Promise.resolve(json(200, { success: true, data: null }))
}

beforeEach(() => {
  server.signedIn = false
  server.refreshCalls = 0
  server.requests = []
  vi.stubGlobal('fetch', vi.fn(fakeFetch))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// (f) sign-out and cross-tab logout never trigger a refresh (3.19)
// ---------------------------------------------------------------------------

describe('(f) after a sign-out (clause 3.19)', () => {
  async function renderSignedIn() {
    const { AuthProvider, useAuth } = await import('@/contexts/AuthContext')
    const { StudentRoute } = await import('@/components/StudentRoute')
    const { pathFor } = await import('@/routes/routeRegistry')

    function SignOutButton() {
      const { signOut } = useAuth()
      return (
        <button type="button" onClick={() => void signOut()}>
          sign out
        </button>
      )
    }

    server.signedIn = true
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/protected']}>
          <AuthProvider>
            <Routes>
              <Route
                path="/protected"
                element={
                  <StudentRoute>
                    <p>protected content</p>
                    <SignOutButton />
                  </StudentRoute>
                }
              />
              <Route path={pathFor('auth.signIn')} element={<p>sign-in page</p>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('protected content')).toBeTruthy()
  }

  it.each(['sign-out in this tab', 'logout broadcast from another tab'])(
    '%s sends no refresh request',
    async (trigger) => {
      await renderSignedIn()
      const before = server.refreshCalls

      if (trigger === 'sign-out in this tab') {
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: 'sign out' }))
        })
      } else {
        const { BROWSER_KEYS } = await import('@/lib/browserNamespace')
        // Another tab signed out: its logout already reached the server.
        server.signedIn = false
        const other = new BroadcastChannel(BROWSER_KEYS.authBroadcastChannel)
        other.postMessage({ type: 'logout', timestamp: Date.now() })
        other.close()
      }

      // The session ends here: the protected content goes away.
      await waitFor(() => expect(screen.queryByText('protected content')).toBeNull(), {
        timeout: 4_000,
      })
      // Give any guard effect time to run before measuring.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 300))
      })
      expect(server.refreshCalls - before).toBe(0)
    },
  )
})

// ---------------------------------------------------------------------------
// (g) a public route never refreshes (3.19, 3.23)
// ---------------------------------------------------------------------------

describe('(g) public routes with an unauthenticated session (clause 3.19)', async () => {
  const { ROUTES } = await import('@/routes/routeRegistry')
  const publicPaths = Object.values(ROUTES)
    .filter((route) => route.guard === 'public')
    .map((route) => route.path)
    .filter((path) => !path.includes(':') && !path.includes('*'))

  it('enumerates the public routes it checks', () => {
    expect(publicPaths.length).toBeGreaterThanOrEqual(10)
    expect(publicPaths).toContain('/auth/signin')
  })

  it.each(publicPaths)('%s sends no refresh request', async (path) => {
    const { default: App } = await import('@/App')
    const { queryClient } = await import('@/lib/queryClient')
    queryClient.clear()
    window.history.pushState({}, '', path)

    render(<App />)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_200))
    })

    expect(server.refreshCalls).toBe(0)
    expect(server.requests.filter((entry) => entry.includes('/auth/refresh/'))).toEqual([])
  })
})
