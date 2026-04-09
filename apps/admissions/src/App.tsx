import React, { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter as Router, useLocation } from 'react-router-dom'
import {
  DashboardSkeleton,
  AuthSkeleton,
  DetailSkeleton,
} from '@/components/ui/skeletons'

import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { isMarketingPublicRoute } from '@/lib/publicRouteMode'
import { useDeferredHydration } from '@/hooks/useDeferredHydration'
import { MarketingRoutes } from '@/components/MarketingRoutes'

const Analytics = lazy(() => import('@vercel/analytics/react').then((mod) => ({ default: mod.Analytics })))
const SpeedInsights = lazy(() => import('@vercel/speed-insights/react').then((mod) => ({ default: mod.SpeedInsights })))
const DeferredGlobalFeedback = lazy(() => import('@/components/DeferredGlobalFeedback').then((mod) => ({ default: mod.DeferredGlobalFeedback })))
const AuthenticatedRouteShell = lazy(() => import('@/components/AuthenticatedRouteShell').then((mod) => ({ default: mod.AuthenticatedRouteShell })))

function App() {
  useEffect(() => {
    // App boot succeeded — clear the chunk reload guard so future
    // deployments can trigger a fresh reload if needed
    sessionStorage.removeItem('mihas_chunk_reload')
    sessionStorage.removeItem('mihas_chunk_reload_ts')
    sessionStorage.removeItem('mihas_chunk_reload_count')
  }, []);

  return (
    <ErrorBoundary>
      <Router>
        <RouteModeSwitch />
      </Router>
      <DeferredGlobalUi />
      <DeferredTelemetry />
    </ErrorBoundary>
  )
}

function DeferredGlobalUi() {
  const hydrated = useDeferredHydration(true, 350)

  if (!hydrated) {
    return null
  }

  return (
    <Suspense fallback={null}>
      <DeferredGlobalFeedback />
    </Suspense>
  )
}

function DeferredTelemetry() {
  const hydrated = useDeferredHydration(true, 1200)

  if (!hydrated) {
    return null
  }

  return (
    <Suspense fallback={null}>
      <Analytics />
      <SpeedInsights />
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

function RouteModeSwitch() {
  const location = useLocation()
  const marketingRoute = isMarketingPublicRoute(location.pathname)

  return (
    marketingRoute ? (
      <MarketingRoutes />
    ) : (
      <Suspense fallback={getShellFallback(location.pathname)}>
        <AuthenticatedRouteShell />
      </Suspense>
    )
  )
}

export default App
