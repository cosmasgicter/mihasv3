/**
 * Preservation Property Tests — Homepage Performance Fixes
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.5, 3.6**
 *
 * These tests verify EXISTING CORRECT behaviors that must be preserved
 * after the fix is applied. They should PASS on both unfixed and fixed code.
 *
 * Bug 1 Preservation: Dashboard prefetch fires on authenticated routes
 *   (RoutePrefetcher always fires the 4s timer — on auth routes this is correct)
 *
 * Bug 2 Preservation: OptimizedImage without h-full w-full renders correctly
 *   with max-w-full and caller classes applied. Error fallback works.
 *
 * NOTE: The h-auto assertion is intentionally OMITTED from preservation tests.
 * On unfixed code, <img> DOES have h-auto. Removing h-auto is a FIX behavior
 * (tested in bug condition tests), not a preservation behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { OptimizedImage } from '@/components/ui/OptimizedImage'

// ---------------------------------------------------------------------------
// Bug 1 Preservation — Dashboard prefetch on authenticated routes
// ---------------------------------------------------------------------------

describe('[PBT] Preservation — Dashboard prefetch fires on authenticated routes', () => {
  let dashboardImportCalled: boolean
  let originalRIC: typeof globalThis.requestIdleCallback | undefined

  beforeEach(() => {
    vi.useFakeTimers()
    dashboardImportCalled = false

    // Save and provide requestIdleCallback for jsdom
    originalRIC = globalThis.requestIdleCallback
    if (typeof globalThis.requestIdleCallback === 'undefined') {
      ;(globalThis as any).requestIdleCallback = (cb: () => void) => setTimeout(cb, 0)
      ;(globalThis as any).cancelIdleCallback = (id: number) => clearTimeout(id)
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.resetModules()
    // Restore original requestIdleCallback
    if (originalRIC === undefined) {
      delete (globalThis as any).requestIdleCallback
      delete (globalThis as any).cancelIdleCallback
    }
  })

  /**
   * Arbitrary for authenticated route pathnames that are NOT marketing routes.
   * These routes should always trigger Dashboard prefetch (both before and after fix).
   */
  const arbAuthRoute = fc.constantFrom(
    '/student/dashboard',
    '/student/application/123',
    '/student/settings',
    '/admin/dashboard',
    '/admin/applications',
    '/admin/settings',
    '/dashboard',
    '/apply',
    '/application/draft-1',
    '/auth/signin',
    '/settings',
    '/login',
  )

  it('schedules a 4-second setTimeout for Dashboard prefetch on all non-marketing routes', async () => {
    // Instead of trying to detect the dynamic import() call (which is hard to
    // intercept reliably with vi.doMock), we verify that RoutePrefetcher
    // schedules a setTimeout with a 4000ms delay on non-marketing routes.
    // This is the mechanism that triggers the Dashboard prefetch.
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

    await fc.assert(
      fc.asyncProperty(
        arbAuthRoute,
        async (pathname) => {
          setTimeoutSpy.mockClear()
          vi.resetModules()

          // Mock all lazy dependencies so App.tsx can render
          vi.doMock('@vercel/analytics/react', () => ({ Analytics: () => null }))
          vi.doMock('@vercel/speed-insights/react', () => ({ SpeedInsights: () => null }))
          vi.doMock('@/components/DeferredGlobalFeedback', () => ({
            DeferredGlobalFeedback: () => null,
          }))
          vi.doMock('@/components/AuthenticatedRouteShell', () => ({
            AuthenticatedRouteShell: () => null,
            default: () => null,
          }))
          vi.doMock('@/hooks/useDeferredHydration', () => ({
            useDeferredHydration: () => false,
          }))
          vi.doMock('@/pages/student/Dashboard', () => ({ default: () => null }))

          // Mock BrowserRouter → MemoryRouter so we control the initial route
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

          // PRESERVATION: On non-marketing routes, RoutePrefetcher should schedule
          // a setTimeout with 4000ms delay for Dashboard prefetch.
          // On unfixed code, this fires unconditionally (always true for any route).
          // On fixed code, this fires only on non-marketing routes (still true here).
          const has4sTimer = setTimeoutSpy.mock.calls.some(
            ([, delay]) => delay === 4000,
          )
          expect(has4sTimer).toBe(true)

          // Cleanup
          act(() => {
            root.unmount()
          })
          document.body.removeChild(container)
        },
      ),
      { numRuns: 12 },
    )

    setTimeoutSpy.mockRestore()
  })

  it('auth shell prefetch via requestIdleCallback fires on marketing route', async () => {
    vi.resetModules()

    let authShellImportCalled = false

    vi.doMock('@vercel/analytics/react', () => ({ Analytics: () => null }))
    vi.doMock('@vercel/speed-insights/react', () => ({ SpeedInsights: () => null }))
    vi.doMock('@/components/DeferredGlobalFeedback', () => ({
      DeferredGlobalFeedback: () => null,
    }))
    vi.doMock('@/components/AuthenticatedRouteShell', () => {
      authShellImportCalled = true
      return {
        AuthenticatedRouteShell: () => null,
        default: () => null,
      }
    })
    vi.doMock('@/hooks/useDeferredHydration', () => ({
      useDeferredHydration: () => false,
    }))
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

    // Advance timers to fire requestIdleCallback (simulated as setTimeout(cb, 0))
    await act(async () => {
      vi.advanceTimersByTime(100)
    })

    // Auth shell prefetch should fire on ANY route including marketing routes.
    // The AuthenticatedRouteShell module is loaded either via the lazy component
    // render (on auth routes) or via the requestIdleCallback prefetch (on all routes).
    // Either way, the module should have been loaded.
    expect(authShellImportCalled).toBe(true)

    act(() => {
      root.unmount()
    })
    document.body.removeChild(container)
  })

  it('auth shell prefetch via requestIdleCallback fires on auth route', async () => {
    vi.resetModules()

    let authShellImportCalled = false

    vi.doMock('@vercel/analytics/react', () => ({ Analytics: () => null }))
    vi.doMock('@vercel/speed-insights/react', () => ({ SpeedInsights: () => null }))
    vi.doMock('@/components/DeferredGlobalFeedback', () => ({
      DeferredGlobalFeedback: () => null,
    }))
    vi.doMock('@/components/AuthenticatedRouteShell', () => {
      authShellImportCalled = true
      return {
        AuthenticatedRouteShell: () => null,
        default: () => null,
      }
    })
    vi.doMock('@/hooks/useDeferredHydration', () => ({
      useDeferredHydration: () => false,
    }))
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

    // Auth shell should be loaded on auth routes (rendered directly + idle prefetch)
    expect(authShellImportCalled).toBe(true)

    act(() => {
      root.unmount()
    })
    document.body.removeChild(container)
  })
})

// ---------------------------------------------------------------------------
// Bug 2 Preservation — OptimizedImage without full-size classes
// ---------------------------------------------------------------------------

describe('[PBT] Preservation — OptimizedImage renders correctly without h-full w-full', () => {
  // Arbitrary for image src paths (simple valid paths with image extensions)
  const arbSrc = fc.constantFrom(
    '/images/logo-nmcz.png',
    '/images/logo-hpcz.jpg',
    '/images/logo-ecz.png',
    '/images/logo-unza.jpeg',
    '/images/campus.png',
    '/images/hero.jpg',
  )

  const arbAlt = fc.constantFrom(
    'NMCZ Logo',
    'HPCZ Logo',
    'ECZ Logo',
    'UNZA Logo',
    'Campus photo',
    'Hero image',
  )

  const arbWidth = fc.integer({ min: 16, max: 1024 })
  const arbHeight = fc.integer({ min: 16, max: 1024 })

  /**
   * Arbitrary for className strings that do NOT contain h-full or w-full.
   * These represent the "non-bug-condition" inputs where OptimizedImage
   * should continue to work exactly as before.
   */
  const arbNonFullSizeClassName = fc.constantFrom(
    '',
    'rounded-lg',
    'shadow-md',
    'rounded-full border-2',
    'opacity-80',
    'object-cover rounded-xl',
    'border border-gray-200',
    'mx-auto',
    'grayscale hover:grayscale-0',
  )

  it('<img> always contains max-w-full in its classes', () => {
    fc.assert(
      fc.property(
        arbSrc,
        arbAlt,
        arbWidth,
        arbHeight,
        arbNonFullSizeClassName,
        (src, alt, width, height, className) => {
          const markup = renderToStaticMarkup(
            React.createElement(OptimizedImage, {
              src,
              alt,
              width,
              height,
              className,
            }),
          )

          const parser = new DOMParser()
          const doc = parser.parseFromString(markup, 'text/html')
          const img = doc.querySelector('img')

          expect(img).not.toBeNull()
          const imgClasses = img!.className.split(/\s+/)
          expect(imgClasses).toContain('max-w-full')
        },
      ),
      { numRuns: 50 },
    )
  })

  it('<img> includes caller-provided classes alongside max-w-full', () => {
    fc.assert(
      fc.property(
        arbSrc,
        arbAlt,
        arbWidth,
        arbHeight,
        arbNonFullSizeClassName.filter((c) => c.length > 0),
        (src, alt, width, height, className) => {
          const markup = renderToStaticMarkup(
            React.createElement(OptimizedImage, {
              src,
              alt,
              width,
              height,
              className,
            }),
          )

          const parser = new DOMParser()
          const doc = parser.parseFromString(markup, 'text/html')
          const img = doc.querySelector('img')

          expect(img).not.toBeNull()
          const imgClassStr = img!.className

          // Each caller class should appear in the img className
          const callerClasses = className.split(/\s+/).filter(Boolean)
          for (const cls of callerClasses) {
            expect(imgClassStr).toContain(cls)
          }

          // max-w-full should also be present
          expect(imgClassStr).toContain('max-w-full')
        },
      ),
      { numRuns: 50 },
    )
  })

  it('renders with no className — <img> has max-w-full', () => {
    const markup = renderToStaticMarkup(
      React.createElement(OptimizedImage, {
        src: '/images/hero.jpg',
        alt: 'Hero image',
        width: 800,
        height: 600,
      }),
    )

    const parser = new DOMParser()
    const doc = parser.parseFromString(markup, 'text/html')
    const img = doc.querySelector('img')

    expect(img).not.toBeNull()
    expect(img!.className).toContain('max-w-full')
  })

  it('renders with className="rounded-lg" — <img> has max-w-full and rounded-lg', () => {
    const markup = renderToStaticMarkup(
      React.createElement(OptimizedImage, {
        src: '/images/campus.png',
        alt: 'Campus photo',
        width: 640,
        height: 480,
        className: 'rounded-lg',
      }),
    )

    const parser = new DOMParser()
    const doc = parser.parseFromString(markup, 'text/html')
    const img = doc.querySelector('img')

    expect(img).not.toBeNull()
    expect(img!.className).toContain('max-w-full')
    expect(img!.className).toContain('rounded-lg')
  })
})

// ---------------------------------------------------------------------------
// Bug 2 Preservation — OptimizedImage error fallback UI
// ---------------------------------------------------------------------------

describe('[PBT] Preservation — OptimizedImage error fallback renders correctly', () => {
  it('displays broken-image icon and alt text on load error', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        React.createElement(OptimizedImage, {
          src: '/images/broken.png',
          alt: 'Broken image test',
          width: 200,
          height: 200,
          className: 'rounded-lg',
        }),
      )
    })

    // Simulate an image load error
    const img = container.querySelector('img')
    expect(img).not.toBeNull()

    await act(async () => {
      img!.dispatchEvent(new Event('error'))
    })

    // After error, the fallback div should render
    const fallbackDiv = container.querySelector('div[role="img"]')
    expect(fallbackDiv).not.toBeNull()

    // Fallback should have the broken-image SVG icon
    const svg = fallbackDiv!.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg!.getAttribute('aria-hidden')).toBe('true')

    // Fallback should display the alt text
    const altSpan = fallbackDiv!.querySelector('span.text-xs')
    expect(altSpan).not.toBeNull()
    expect(altSpan!.textContent).toBe('Broken image test')

    // Fallback should have the caller's className applied
    expect(fallbackDiv!.className).toContain('rounded-lg')

    // Fallback should have explicit width/height style
    const style = (fallbackDiv as HTMLElement).style
    expect(style.width).toBe('200px')
    expect(style.height).toBe('200px')

    act(() => {
      root.unmount()
    })
    document.body.removeChild(container)
  })

  it('error fallback with decorative image has role="presentation" and no alt span', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        React.createElement(OptimizedImage, {
          src: '/images/decorative.png',
          alt: 'Decorative',
          width: 100,
          height: 100,
          decorative: true,
        }),
      )
    })

    const img = container.querySelector('img')
    expect(img).not.toBeNull()

    await act(async () => {
      img!.dispatchEvent(new Event('error'))
    })

    // Decorative fallback should have role="presentation"
    const fallbackDiv = container.querySelector('div[role="presentation"]')
    expect(fallbackDiv).not.toBeNull()

    // Should NOT have an alt text span (decorative images don't show alt)
    const altSpan = fallbackDiv!.querySelector('span.text-xs')
    expect(altSpan).toBeNull()

    act(() => {
      root.unmount()
    })
    document.body.removeChild(container)
  })

  it('error fallback preserves caller className across random inputs', async () => {
    const classNames = ['rounded-lg', 'shadow-md', 'border-2', 'opacity-50', '']

    for (const cls of classNames) {
      const container = document.createElement('div')
      document.body.appendChild(container)
      const root = createRoot(container)

      await act(async () => {
        root.render(
          React.createElement(OptimizedImage, {
            src: '/images/fail.png',
            alt: 'Test',
            width: 64,
            height: 64,
            className: cls,
          }),
        )
      })

      const img = container.querySelector('img')
      expect(img).not.toBeNull()

      await act(async () => {
        img!.dispatchEvent(new Event('error'))
      })

      const fallbackDiv = container.querySelector('div[role="img"]')
      expect(fallbackDiv).not.toBeNull()

      if (cls) {
        expect(fallbackDiv!.className).toContain(cls)
      }

      // SVG icon should always be present
      expect(fallbackDiv!.querySelector('svg')).not.toBeNull()

      act(() => {
        root.unmount()
      })
      document.body.removeChild(container)
    }
  })
})
