/**
 * Unit tests — RoutePrefetcher route-aware behavior
 *
 * Validates that RoutePrefetcher skips Dashboard prefetch on marketing routes
 * and fires it on authenticated routes. Also verifies auth shell prefetch
 * via requestIdleCallback fires regardless of isMarketingRoute.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

// ---------------------------------------------------------------------------
// Marketing routes: Dashboard import should NOT fire
// ---------------------------------------------------------------------------

describe('RoutePrefetcher — skips Dashboard import on marketing routes', () => {
  let dashboardImportCalled: boolean

  beforeEach(() => {
    vi.useFakeTimers()
    dashboardImportCalled = false

    if (typeof globalThis.requestIdleCallback === 'undefined') {
      ;(globalThis as any).requestIdleCallback = (cb: () => void) => setTimeout(cb, 0)
      ;(globalThis as any).cancelIdleCallback = (id: number) => clearTimeout(id)
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  async function renderAppOnRoute(pathname: string) {
    vi.resetModules()
    dashboardImportCalled = false

    vi.doMock('@vercel/analytics/react', () => ({ Analytics: () => null }))
    vi.doMock('@vercel/speed-insights/react', () => ({ SpeedInsights: () => null }))
    vi.doMock('@/components/DeferredGlobalFeedback', () => ({ DeferredGlobalFeedback: () => null }))
    vi.doMock('@/components/AuthenticatedRouteShell', () => ({
      AuthenticatedRouteShell: () => null,
      default: () => null,
    }))
    vi.doMock('@/hooks/useDeferredHydration', () => ({ useDeferredHydration: () => false }))
    vi.doMock('@/pages/student/Dashboard', () => {
      dashboardImportCalled = true
      return { default: () => null }
    })
    vi.doMock('react-router-dom', async () => {
      const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
      return {
        ...actual,
        BrowserRouter: ({ children }: { children: React.ReactNode }) =>
          React.createElement(actual.MemoryRouter, { initialEntries: [pathname] }, children),
      }
    })

    const { default: App } = await import('@/App')
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(React.createElement(App))
    })

    // Reset after initial render (module-level evaluation may have triggered it)
    dashboardImportCalled = false

    // Advance past the 4-second timer
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })

    const result = dashboardImportCalled

    act(() => { root.unmount() })
    document.body.removeChild(container)

    return result
  }

  it('skips Dashboard import on / (landing page)', async () => {
    expect(await renderAppOnRoute('/')).toBe(false)
  })

  it('skips Dashboard import on /404', async () => {
    expect(await renderAppOnRoute('/404')).toBe(false)
  })

  it('skips Dashboard import on /contact', async () => {
    expect(await renderAppOnRoute('/contact')).toBe(false)
  })

  it('skips Dashboard import on /privacy', async () => {
    expect(await renderAppOnRoute('/privacy')).toBe(false)
  })

  it('skips Dashboard import on /terms', async () => {
    expect(await renderAppOnRoute('/terms')).toBe(false)
  })

  it('skips Dashboard import on /track-application', async () => {
    expect(await renderAppOnRoute('/track-application')).toBe(false)
  })
})


// ---------------------------------------------------------------------------
// Authenticated routes: Dashboard import SHOULD fire
// ---------------------------------------------------------------------------

describe('RoutePrefetcher — fires Dashboard import on authenticated routes', () => {
  beforeEach(() => {
    vi.useFakeTimers()

    if (typeof globalThis.requestIdleCallback === 'undefined') {
      ;(globalThis as any).requestIdleCallback = (cb: () => void) => setTimeout(cb, 0)
      ;(globalThis as any).cancelIdleCallback = (id: number) => clearTimeout(id)
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  async function renderAppOnAuthRoute(pathname: string) {
    vi.resetModules()

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

    vi.doMock('@vercel/analytics/react', () => ({ Analytics: () => null }))
    vi.doMock('@vercel/speed-insights/react', () => ({ SpeedInsights: () => null }))
    vi.doMock('@/components/DeferredGlobalFeedback', () => ({ DeferredGlobalFeedback: () => null }))
    vi.doMock('@/components/AuthenticatedRouteShell', () => ({
      AuthenticatedRouteShell: () => null,
      default: () => null,
    }))
    vi.doMock('@/hooks/useDeferredHydration', () => ({ useDeferredHydration: () => false }))
    vi.doMock('@/pages/student/Dashboard', () => ({ default: () => null }))
    vi.doMock('react-router-dom', async () => {
      const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
      return {
        ...actual,
        BrowserRouter: ({ children }: { children: React.ReactNode }) =>
          React.createElement(actual.MemoryRouter, { initialEntries: [pathname] }, children),
      }
    })

    const { default: App } = await import('@/App')
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(React.createElement(App))
    })

    // Check that a 4000ms timer was scheduled (the Dashboard prefetch mechanism)
    const has4sTimer = setTimeoutSpy.mock.calls.some(([, delay]) => delay === 4000)

    act(() => { root.unmount() })
    document.body.removeChild(container)
    setTimeoutSpy.mockRestore()

    return has4sTimer
  }

  it('fires Dashboard import on /student/dashboard', async () => {
    expect(await renderAppOnAuthRoute('/student/dashboard')).toBe(true)
  })

  it('fires Dashboard import on /admin/dashboard', async () => {
    expect(await renderAppOnAuthRoute('/admin/dashboard')).toBe(true)
  })

  it('fires Dashboard import on /dashboard', async () => {
    expect(await renderAppOnAuthRoute('/dashboard')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Auth shell prefetch fires regardless of isMarketingRoute
// ---------------------------------------------------------------------------

describe('RoutePrefetcher — auth shell prefetch via requestIdleCallback', () => {
  beforeEach(() => {
    vi.useFakeTimers()

    if (typeof globalThis.requestIdleCallback === 'undefined') {
      ;(globalThis as any).requestIdleCallback = (cb: () => void) => setTimeout(cb, 0)
      ;(globalThis as any).cancelIdleCallback = (id: number) => clearTimeout(id)
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('fires auth shell prefetch on marketing route (/)', async () => {
    vi.resetModules()
    let authShellImportCalled = false

    vi.doMock('@vercel/analytics/react', () => ({ Analytics: () => null }))
    vi.doMock('@vercel/speed-insights/react', () => ({ SpeedInsights: () => null }))
    vi.doMock('@/components/DeferredGlobalFeedback', () => ({ DeferredGlobalFeedback: () => null }))
    vi.doMock('@/components/AuthenticatedRouteShell', () => {
      authShellImportCalled = true
      return { AuthenticatedRouteShell: () => null, default: () => null }
    })
    vi.doMock('@/hooks/useDeferredHydration', () => ({ useDeferredHydration: () => false }))
    vi.doMock('@/pages/student/Dashboard', () => ({ default: () => null }))
    vi.doMock('react-router-dom', async () => {
      const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
      return {
        ...actual,
        BrowserRouter: ({ children }: { children: React.ReactNode }) =>
          React.createElement(actual.MemoryRouter, { initialEntries: ['/'] }, children),
      }
    })

    const { default: App } = await import('@/App')
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(React.createElement(App))
    })

    await act(async () => {
      vi.advanceTimersByTime(100)
    })

    expect(authShellImportCalled).toBe(true)

    act(() => { root.unmount() })
    document.body.removeChild(container)
  })

  it('fires auth shell prefetch on auth route (/student/dashboard)', async () => {
    vi.resetModules()
    let authShellImportCalled = false

    vi.doMock('@vercel/analytics/react', () => ({ Analytics: () => null }))
    vi.doMock('@vercel/speed-insights/react', () => ({ SpeedInsights: () => null }))
    vi.doMock('@/components/DeferredGlobalFeedback', () => ({ DeferredGlobalFeedback: () => null }))
    vi.doMock('@/components/AuthenticatedRouteShell', () => {
      authShellImportCalled = true
      return { AuthenticatedRouteShell: () => null, default: () => null }
    })
    vi.doMock('@/hooks/useDeferredHydration', () => ({ useDeferredHydration: () => false }))
    vi.doMock('@/pages/student/Dashboard', () => ({ default: () => null }))
    vi.doMock('react-router-dom', async () => {
      const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
      return {
        ...actual,
        BrowserRouter: ({ children }: { children: React.ReactNode }) =>
          React.createElement(actual.MemoryRouter, { initialEntries: ['/student/dashboard'] }, children),
      }
    })

    const { default: App } = await import('@/App')
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(React.createElement(App))
    })

    await act(async () => {
      vi.advanceTimersByTime(100)
    })

    expect(authShellImportCalled).toBe(true)

    act(() => { root.unmount() })
    document.body.removeChild(container)
  })
})
