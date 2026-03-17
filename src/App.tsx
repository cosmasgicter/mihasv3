import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, useLocation, matchPath } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { SkeletonProvider } from '@/contexts/SkeletonContext'
import { RealtimeStatusProvider } from '@/contexts/RealtimeStatusContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { StudentRoute } from '@/components/StudentRoute'
import { AdminRoute } from '@/components/AdminRoute'
import { ToastContainer } from '@/components/ui/Toast'
import { AppLayout } from '@/components/navigation/AppLayout'
import { UnifiedLoader } from '@/components/ui/UnifiedLoader'
import { ErrorBoundary as RouteErrorBoundary } from '@/components/ui/ErrorBoundary'
import { SafeAreaProvider } from '@/components/ui/SafeAreaProvider'
import { routes, type RouteConfig, type SkeletonType } from '@/routes/config'
import { LazyLoadErrorBoundary } from '@/components/LazyLoadErrorBoundary'
import {
  DashboardSkeleton,
  WizardSkeleton,
  AdminTableSkeleton,
  AuthSkeleton,
  DetailSkeleton,
} from '@/components/ui/skeletons'

import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { OfflineBanner } from '@/components/ui/OfflineBanner'
import { cacheMonitor } from '@/services/cacheMonitor'
import { isLightweightPublicRoute } from '@/lib/routeRuntime'
import { useAuth } from '@/contexts/AuthContext'

const Analytics = lazy(() => import('@vercel/analytics/react').then((mod) => ({ default: mod.Analytics })))
const SpeedInsights = lazy(() => import('@vercel/speed-insights/react').then((mod) => ({ default: mod.SpeedInsights })))

const InstallBanner = lazy(() => import('@/components/ui/InstallBanner').then((mod) => ({ default: mod.InstallBanner })))
const OfflineIndicator = lazy(() => import('@/components/pwa/OfflineIndicator').then((mod) => ({ default: mod.OfflineIndicator })))
const ServiceWorkerUpdatePrompt = lazy(() => import('@/components/ServiceWorkerUpdatePrompt').then((mod) => ({ default: mod.ServiceWorkerUpdatePrompt })))
const SessionMonitor = lazy(() => import('@/components/auth/SessionMonitor').then((mod) => ({ default: mod.SessionMonitor })))

// Optimized query client for better performance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: true,
      // IMPORTANT: avoid global polling/refetch loops that cause UI jitter
      // and repeated auth/session checks. Individual realtime hooks can opt-in.
      refetchInterval: false,
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      networkMode: 'online',
    },
  },
})

// Initialize cache monitoring in production
if (import.meta.env.PROD) {
  cacheMonitor.initialize(queryClient)
}

/** Returns the layout-matched skeleton fallback for a given skeleton type */
function DelayedPageLoader({ delayMs = 400 }: { delayMs?: number }) {
  const [showLoader, setShowLoader] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setShowLoader(true), delayMs)
    return () => window.clearTimeout(timer)
  }, [delayMs])

  if (!showLoader) {
    return null
  }

  return <UnifiedLoader variant="page" size="lg" label="Loading page" />
}

function getSkeletonFallback(route: RouteConfig): React.ReactNode {
  const { skeletonType, guard } = route

  // Public routes should prefer route-level content shells or no-op fallback
  // over a blocking full-page loader, especially for first unauthenticated hits.
  if (guard === 'public' && skeletonType === 'none') {
    return null
  }

  switch (skeletonType) {
    case 'dashboard':
      return <DashboardSkeleton />
    case 'wizard':
      return <WizardSkeleton />
    case 'admin-table':
      return <AdminTableSkeleton />
    case 'auth':
      return <AuthSkeleton />
    case 'detail':
      return <DetailSkeleton />
    case 'none':
    default:
      return <DelayedPageLoader delayMs={400} />
  }
}

const renderRoute = (route: RouteConfig) => {
  const { element, guard } = route
  
  let routeElement: React.ReactElement
  
  // Handle undefined/null components to prevent React Error #130
  if (!element) {
    console.error(`Route ${route.path} has undefined element`)
    routeElement = (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center p-8">
          <h2 className="text-xl font-semibold text-foreground mb-4">Page Not Found</h2>
          <p className="text-muted-foreground">The requested page could not be loaded.</p>
        </div>
      </div>
    )
  } else if (React.isValidElement(element)) {
    routeElement = element
  } else {
    const Component = element as React.ComponentType
    routeElement = <Component />
  }

  // Wrap lazy routes with per-route Suspense skeleton + LazyLoadErrorBoundary
  if (route.lazy) {
    routeElement = (
      <LazyLoadErrorBoundary>
        <Suspense fallback={getSkeletonFallback(route)}>
          {routeElement}
        </Suspense>
      </LazyLoadErrorBoundary>
    )
  }
  
  switch (guard) {
    case 'auth':
      return <ProtectedRoute>{routeElement}</ProtectedRoute>
    case 'student':
      return <StudentRoute>{routeElement}</StudentRoute>
    case 'admin':
      return <AdminRoute>{routeElement}</AdminRoute>
    default:
      return routeElement
  }
}

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
      <QueryClientProvider client={queryClient}>
        <SkeletonProvider>
          <AuthProvider>
            <RealtimeStatusProvider>
              <SafeAreaProvider>
                <OfflineBanner />
                <ToastContainer />
                <Router>
                  <RoutedAppChrome />
                </Router>
              </SafeAreaProvider>
            </RealtimeStatusProvider>
          </AuthProvider>
        </SkeletonProvider>
      </QueryClientProvider>
      <DeferredTelemetry />
    </ErrorBoundary>
  )
}

function useDeferredHydration(enabled: boolean, delayMs: number) {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setHydrated(false)
      return
    }

    let timeoutId: number | null = null
    let idleId: number | null = null

    const mountDeferred = () => {
      timeoutId = window.setTimeout(() => setHydrated(true), delayMs)
    }

    const afterFirstPaint = () => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if ('requestIdleCallback' in window) {
            idleId = window.requestIdleCallback(mountDeferred, { timeout: 2000 })
            return
          }
          mountDeferred()
        })
      })
    }

    afterFirstPaint()

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      if (idleId !== null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
    }
  }, [delayMs, enabled])

  return hydrated
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

function RoutedAppChrome() {
  const location = useLocation()
  const { user, isAdmin } = useAuth()
  const isLightweightRoute = isLightweightPublicRoute(location.pathname)
  const matchedRoute = useMemo(() => (
    routes.find((route) => Boolean(matchPath({ path: route.path, end: route.path !== '*' }, location.pathname)))
  ), [location.pathname])
  const isPublicRoute = (matchedRoute?.guard ?? 'public') === 'public'
  const canLoadHeavyGlobalUi = !isLightweightRoute && (!isPublicRoute || Boolean(user))
  const canLoadSessionMonitor = canLoadHeavyGlobalUi && (Boolean(user) || isAdmin)
  const canLoadSwAndInstallEffects = canLoadHeavyGlobalUi && !isPublicRoute
  const deferredGlobalUiHydrated = useDeferredHydration(canLoadHeavyGlobalUi, 1500)
  const deferredSessionHydrated = useDeferredHydration(canLoadSessionMonitor, 1800)
  const deferredAppEffectsHydrated = useDeferredHydration(canLoadSwAndInstallEffects, 2200)
  const routesMarkup = (
    <Routes>
      {routes.map((route) => (
        <Route
          key={route.path}
          path={route.path}
          element={renderRoute(route)}
        />
      ))}
    </Routes>
  )

  return (
    <>
      {deferredAppEffectsHydrated && (
        <Suspense fallback={null}>
          <InstallBanner />
          <ServiceWorkerUpdatePrompt />
        </Suspense>
      )}
      {deferredGlobalUiHydrated && (
        <Suspense fallback={null}>
          <OfflineIndicator />
        </Suspense>
      )}
      {deferredSessionHydrated && (
        <Suspense fallback={null}>
          <SessionMonitor />
        </Suspense>
      )}
      <RouteErrorBoundary level="page">
        <div className="min-h-screen bg-background safe-area-all">
          {isLightweightRoute ? routesMarkup : <AppLayout>{routesMarkup}</AppLayout>}
        </div>
      </RouteErrorBoundary>
    </>
  )
}

export default App
