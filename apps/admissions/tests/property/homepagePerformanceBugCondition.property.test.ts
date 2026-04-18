/**
 * Bug Condition Exploration — Homepage Performance Fixes
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 *
 * These tests encode the EXPECTED (fixed) behavior. They MUST FAIL on
 * unfixed code — failure confirms the bugs exist.
 *
 * Bug 1: RoutePrefetcher should NOT prefetch Dashboard on marketing routes.
 *   On UNFIXED code the import fires unconditionally → test FAILS.
 *
 * Bug 2: OptimizedImage <picture> should have block/w-full/h-full classes
 *   and <img> should NOT have h-auto when caller passes h-full w-full.
 *   On UNFIXED code <picture> has no classes and <img> has h-auto → test FAILS.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { OptimizedImage } from '@/components/ui/OptimizedImage'

// ---------------------------------------------------------------------------
// Bug 2 — OptimizedImage: <picture> block sizing and no h-auto on <img>
// ---------------------------------------------------------------------------

describe('[PBT] Bug 2 — OptimizedImage picture element has block sizing and img has no h-auto', () => {
  // Arbitrary for image src paths (simple valid paths)
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
    'Accreditation badge',
  )

  const arbWidth = fc.integer({ min: 16, max: 1024 })
  const arbHeight = fc.integer({ min: 16, max: 1024 })

  it('<picture> has classes block, w-full, h-full when caller passes h-full w-full', () => {
    fc.assert(
      fc.property(
        arbSrc,
        arbAlt,
        arbWidth,
        arbHeight,
        (src, alt, width, height) => {
          const className = 'h-full w-full object-contain'

          const markup = renderToStaticMarkup(
            React.createElement(OptimizedImage, {
              src,
              alt,
              width,
              height,
              className,
            }),
          )

          // Parse the markup to inspect elements
          const parser = new DOMParser()
          const doc = parser.parseFromString(markup, 'text/html')
          const picture = doc.querySelector('picture')
          const img = doc.querySelector('img')

          // EXPECTED (fixed) behavior:
          // <picture> should have block, w-full, h-full classes
          expect(picture).not.toBeNull()
          const pictureClasses = picture!.className.split(/\s+/)
          expect(pictureClasses).toContain('block')
          expect(pictureClasses).toContain('w-full')
          expect(pictureClasses).toContain('h-full')

          // <img> should NOT have h-auto (it conflicts with caller's h-full)
          expect(img).not.toBeNull()
          const imgClasses = img!.className.split(/\s+/)
          expect(imgClasses).not.toContain('h-auto')
        },
      ),
      { numRuns: 50 },
    )
  })
})

// ---------------------------------------------------------------------------
// Bug 1 — RoutePrefetcher: No Dashboard prefetch on marketing routes
// ---------------------------------------------------------------------------

describe('[PBT] Bug 1 — RoutePrefetcher skips Dashboard prefetch on marketing routes', () => {
  const MARKETING_ROUTES = ['/', '/404', '/contact', '/privacy', '/terms', '/track-application']

  let dashboardImportCalled: boolean

  beforeEach(() => {
    vi.useFakeTimers()
    dashboardImportCalled = false

    // Provide requestIdleCallback for jsdom
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

  it('does NOT call import("@/pages/student/Dashboard") on any marketing route', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...MARKETING_ROUTES),
        async (pathname) => {
          dashboardImportCalled = false
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

          // Spy on the Dashboard dynamic import
          vi.doMock('@/pages/student/Dashboard', () => {
            dashboardImportCalled = true
            return { default: () => null }
          })

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
          const { createRoot } = await import('react-dom/client')
          const { act } = await import('react')

          const container = document.createElement('div')
          document.body.appendChild(container)
          const root = createRoot(container)

          await act(async () => {
            root.render(React.createElement(App))
          })

          // Reset the flag after initial render (module-level evaluation may have triggered it)
          dashboardImportCalled = false

          // Advance past the 4-second timer that triggers Dashboard prefetch
          await act(async () => {
            vi.advanceTimersByTime(5000)
          })

          // EXPECTED (fixed) behavior: Dashboard import should NOT be called
          // on marketing routes. On UNFIXED code this WILL fire → test FAILS.
          expect(dashboardImportCalled).toBe(false)

          // Cleanup
          act(() => {
            root.unmount()
          })
          document.body.removeChild(container)
        },
      ),
      { numRuns: 20 },
    )
  })
})
