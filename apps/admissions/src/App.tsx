import React, { Suspense, lazy, useEffect, useRef } from 'react'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import {
  DashboardSkeleton,
  AuthSkeleton,
  DetailSkeleton,
  MarketingRouteSkeleton,
} from '@/components/ui/skeletons'

import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { LazyLoadErrorBoundary } from '@/components/LazyLoadErrorBoundary'
import { isMarketingPublicRoute } from '@/lib/publicRouteMode'
import { useDeferredHydration } from '@/hooks/useDeferredHydration'
import { BROWSER_KEYS, LEGACY_BROWSER_KEYS } from '@/lib/browserNamespace'
import { APP_MAIN_CONTENT_ID } from '@/lib/accessibility-utils'
const LandingPage = lazy(() => import('@/pages/LandingPage'))
const MaintenancePage = lazy(() => import('@/pages/MaintenancePage'))

const MAINTENANCE_MODE = import.meta.env.VITE_MAINTENANCE_MODE === 'true'

const DeferredGlobalFeedback = lazy(() => import('@/components/DeferredGlobalFeedback').then((mod) => ({ default: mod.DeferredGlobalFeedback })))
const AuthenticatedRouteShell = lazy(() => import('@/components/AuthenticatedRouteShell').then((mod) => ({ default: mod.AuthenticatedRouteShell })))
const PublicApplicationTracker = lazy(() => import('@/pages/public/tracker/index'))
const ContactPage = lazy(() => import('@/pages/ContactPage'))
const TermsPage = lazy(() => import('@/pages/TermsPage'))
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

// DEV-ONLY: live PDF document previews.
//
// The `import.meta.env.DEV` guard has to sit on the **`lazy(() => import(…))`
// expression**, not only on the `<Route>` that renders it. admissions-v2 task
// 12.4 measured what happens when it sits only on the route: Vite replaces
// `import.meta.env.DEV` with `false` and Rollup does drop the two unreachable
// `<Route>` elements — but these two module-scope `lazy()` calls survive, so the
// dynamic imports were still emitted and the **production** bundle shipped
// `AcceptanceLetterPreview-*.js`, `DocumentPreview-*.js` and the 1.43 MB
// `vendor-react-pdf-*.js` engine they pull, to every student on every device.
// The comment that used to sit here claimed they were "tree-shaken out of
// production builds"; the build output said otherwise.
//
// With the guard on the expression, `false ? lazy(() => import(…)) : null` is
// dead code and the dynamic import goes with it, so `@/lib/pdf` stays a
// dev/preview-only surface **by measurement** rather than by convention (the
// steering rule in `tech.md`: frontend `@/lib/pdf` is legacy/preview-only and
// must not be reachable from a student/admin official flow). The previews
// themselves are unchanged in `bun run dev`.
// Pinned by `tests/unit/devPreviewChunkAbsence.test.ts`.
const AcceptanceLetterPreview = import.meta.env.DEV
  ? lazy(() => import('@/pages/dev/AcceptanceLetterPreview'))
  : null
const DocumentPreview = import.meta.env.DEV ? lazy(() => import('@/pages/dev/DocumentPreview')) : null

function App() {
  useEffect(() => {
    // App boot succeeded — clear the chunk reload guard so future
    // deployments can trigger a fresh reload if needed
    [
      BROWSER_KEYS.chunkReloadGuard,
      BROWSER_KEYS.chunkReloadTs,
      BROWSER_KEYS.chunkReloadCount,
      BROWSER_KEYS.chunkReloadTsV2,
      BROWSER_KEYS.chunkReloadCountV2,
      BROWSER_KEYS.chunkReloadRouteV2,
      LEGACY_BROWSER_KEYS.chunkReloadGuard,
      LEGACY_BROWSER_KEYS.chunkReloadTs,
      LEGACY_BROWSER_KEYS.chunkReloadCount,
      LEGACY_BROWSER_KEYS.chunkReloadTsV2,
      LEGACY_BROWSER_KEYS.chunkReloadCountV2,
      LEGACY_BROWSER_KEYS.chunkReloadRouteV2,
    ].forEach((key) => sessionStorage.removeItem(key))
    if (MAINTENANCE_MODE) {
      window.__dismissPreloader?.()
    }
  }, []);

  if (MAINTENANCE_MODE) {
    return (
      <Suspense fallback={null}>
        <MaintenancePage />
      </Suspense>
    )
  }

  return (
    <ErrorBoundary>
      {/* F5: opt into React Router v7 behaviour early to silence the
          future-flag warnings and de-risk the eventual v7 upgrade. */}
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <RouteAwareApp />
      </Router>
    </ErrorBoundary>
  )
}

function DeferredGlobalUi({
  delayMs,
}: {
  delayMs: number
}) {
  const hydrated = useDeferredHydration(true, delayMs)

  if (!hydrated) {
    return null
  }

  return (
    <Suspense fallback={null}>
      <DeferredGlobalFeedback />
    </Suspense>
  )
}

function getShellFallback(pathname: string): React.ReactNode {
  if (pathname === '/dashboard' || pathname.startsWith('/admin')) {
    return <DashboardSkeleton />
  }

  if (
    pathname.startsWith('/student') ||
    pathname === '/apply' ||
    pathname.startsWith('/application/')
  ) {
    return <DetailSkeleton />
  }

  return <AuthSkeleton />
}

function RoutePrefetcher({ isMarketingRoute }: { isMarketingRoute: boolean }) {
  useEffect(() => {
    const idle = typeof requestIdleCallback === 'function'
      ? requestIdleCallback
      : (cb: () => void) => setTimeout(cb, 2000)

    idle(() => {
      // Prefetch the most common next-page chunk (auth shell)
      import('@/components/AuthenticatedRouteShell').catch(() => {})
    })

    // Only prefetch Dashboard on non-marketing routes
    if (isMarketingRoute) {
      return
    }

    // After a longer delay, prefetch deeper pages
    const timer = setTimeout(() => {
      import('@/pages/student/Dashboard').catch(() => {})
    }, 4000)

    return () => clearTimeout(timer)
  }, [isMarketingRoute])

  return null
}

function RouteAwareApp() {
  const location = useLocation()
  const previousPathRef = useRef(location.pathname)
  const marketingRoute = isMarketingPublicRoute(location.pathname)
  const isLandingRoute = location.pathname === '/'
  const globalUiDelayMs = isLandingRoute ? 2800 : marketingRoute ? 900 : 350

  // Dismiss preloader once the route shell renders
  useEffect(() => {
    window.__dismissPreloader?.()
  }, [])

  useEffect(() => {
    if (previousPathRef.current === location.pathname) return
    previousPathRef.current = location.pathname

    const focusMainContent = () => {
      const target =
        document.getElementById(APP_MAIN_CONTENT_ID) ||
        document.querySelector('main') ||
        document.querySelector('h1')

      if (target instanceof HTMLElement) {
        if (!target.hasAttribute('tabindex')) {
          target.setAttribute('tabindex', '-1')
        }
        target.focus({ preventScroll: false })
      }
    }

    const frame = window.requestAnimationFrame(focusMainContent)
    const retry = window.setTimeout(focusMainContent, 150)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(retry)
    }
  }, [location.pathname])

  return (
    <>
      {marketingRoute ? (
        /*
          The public routes get the same `queryClient` the authenticated shell
          uses (admissions-v2 task 11.5, findings STU-24 / TEN-09; R2.2, R2.3).

          Until this task the marketing branch had **no** `QueryClientProvider`,
          so a public page could not read `GET /api/v1/catalog/context/` at all —
          which is why the tracker and the landing page brand themselves from
          hardcoded constants, and why a white-label host's public tracker showed
          the platform's name and the platform's inbox to that school's
          applicants. A public page cannot resolve a tenant it cannot read.

          It is the same module-level singleton, not a second client, so a value
          the shell already fetched is reused across the boundary rather than
          refetched, and nothing about the authenticated path changes. The
          fail-closed rule is unaffected: `usePortalBrand` still resolves the
          neutral Beanola brand while the read is in flight, on the shared portal,
          and on any failure — it never guesses an institution.
        */
        <QueryClientProvider client={queryClient}>
        <LazyLoadErrorBoundary>
          <Suspense
            fallback={
              location.pathname === '/track-application'
                ? <DetailSkeleton />
                : <MarketingRouteSkeleton />
            }
          >
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/track-application" element={<PublicApplicationTracker />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/404" element={<NotFoundPage />} />
              {AcceptanceLetterPreview ? (
                <Route path="/dev/acceptance-letter" element={<AcceptanceLetterPreview />} />
              ) : null}
              {DocumentPreview ? (
                <Route path="/dev/documents" element={<DocumentPreview />} />
              ) : null}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </LazyLoadErrorBoundary>
        </QueryClientProvider>
      ) : (
        <Suspense fallback={getShellFallback(location.pathname)}>
          <AuthenticatedRouteShell />
        </Suspense>
      )}
      <DeferredGlobalUi delayMs={globalUiDelayMs} />
      <RoutePrefetcher isMarketingRoute={marketingRoute} />
    </>
  )
}

export default App
