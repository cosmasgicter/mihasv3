import React, { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom'
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

// DEV-ONLY: live PDF document previews. Tree-shaken out of production
// builds because the routes are guarded by `import.meta.env.DEV`.
const AcceptanceLetterPreview = lazy(() => import('@/pages/dev/AcceptanceLetterPreview'))
const DocumentPreview = lazy(() => import('@/pages/dev/DocumentPreview'))

function App() {
  useEffect(() => {
    // App boot succeeded — clear the chunk reload guard so future
    // deployments can trigger a fresh reload if needed
    sessionStorage.removeItem('mihas_chunk_reload')
    sessionStorage.removeItem('mihas_chunk_reload_ts')
    sessionStorage.removeItem('mihas_chunk_reload_count')
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
      <Router>
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
  const marketingRoute = isMarketingPublicRoute(location.pathname)
  const isLandingRoute = location.pathname === '/'
  const globalUiDelayMs = isLandingRoute ? 2800 : marketingRoute ? 900 : 350

  // Dismiss preloader once the route shell renders
  useEffect(() => {
    window.__dismissPreloader?.()
  }, [])

  return (
    <>
      {marketingRoute ? (
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
              {import.meta.env.DEV ? (
                <Route path="/dev/acceptance-letter" element={<AcceptanceLetterPreview />} />
              ) : null}
              {import.meta.env.DEV ? (
                <Route path="/dev/documents" element={<DocumentPreview />} />
              ) : null}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </LazyLoadErrorBoundary>
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
