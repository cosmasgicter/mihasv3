import React, { Suspense, lazy, useEffect, useMemo } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { matchPath, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import '@/styles/legibility.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { RealtimeStatusProvider } from '@/contexts/RealtimeStatusContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { StudentRoute } from '@/components/StudentRoute'
import { AdminRoute } from '@/components/AdminRoute'
import { ErrorBoundary as RouteErrorBoundary } from '@/components/ui/ErrorBoundary'
import { routes, type RouteConfig } from '@/routes/config'
import { LazyLoadErrorBoundary } from '@/components/LazyLoadErrorBoundary'
import {
  AdminTableSkeleton,
  AuthSkeleton,
  DashboardSkeleton,
  DetailSkeleton,
  WizardSkeleton,
} from '@/components/ui/skeletons'
import { isLightweightPublicRoute } from '@/lib/routeRuntime'
import { startLoaderTelemetry } from '@/lib/loaderTelemetry'
import { useAuth } from '@/contexts/AuthContext'
import { useDeferredHydration } from '@/hooks/useDeferredHydration'
import { SafeAreaProvider } from '@/components/ui/SafeAreaProvider'
import { queryClient } from '@/lib/queryClient'

const AppLayout = lazy(() => import('@/components/navigation/AppLayout').then((mod) => ({ default: mod.AppLayout })))
const InstallBanner = lazy(() => import('@/components/ui/InstallBanner').then((mod) => ({ default: mod.InstallBanner })))
const OfflineIndicator = lazy(() => import('@/components/pwa/OfflineIndicator').then((mod) => ({ default: mod.OfflineIndicator })))
const ServiceWorkerUpdatePrompt = lazy(() => import('@/components/ServiceWorkerUpdatePrompt').then((mod) => ({ default: mod.ServiceWorkerUpdatePrompt })))
const SessionMonitor = lazy(() => import('@/components/auth/SessionMonitor').then((mod) => ({ default: mod.SessionMonitor })))

function getSkeletonFallback(route: RouteConfig): React.ReactNode {
  switch (route.skeletonType) {
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
      return <></>
    default:
      return <DashboardSkeleton />
  }
}

function renderRoute(route: RouteConfig) {
  const { element, guard } = route

  let routeElement: React.ReactElement

  if (!element) {
    routeElement = (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center p-8">
          <h2 className="mb-4 text-xl font-semibold text-foreground">Page Not Found</h2>
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

function RoutedAuthenticatedApp() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()
  const isLightweightRoute = isLightweightPublicRoute(location.pathname)
  const prevPathRef = React.useRef(location.pathname)

  useEffect(() => {
    if (prevPathRef.current !== location.pathname) {
      prevPathRef.current = location.pathname
      const mainContent = document.getElementById('main-content') || document.querySelector('main') || document.querySelector('h1')
      if (mainContent && mainContent instanceof HTMLElement) {
        mainContent.focus({ preventScroll: false })
      }
    }
  }, [location.pathname])

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

  useEffect(() => {
    const telemetry = startLoaderTelemetry(`route-render:${location.pathname}`)
    return () => telemetry.end({ route: location.pathname })
  }, [location.pathname])

  useEffect(() => {
    const handleAuthRedirect = (event: Event) => {
      const customEvent = event as CustomEvent<{ to?: string; replace?: boolean }>
      const destination = customEvent.detail?.to || '/auth/signin'
      navigate(destination, { replace: customEvent.detail?.replace ?? true })
    }

    window.addEventListener('mihas:auth-redirect', handleAuthRedirect)
    return () => window.removeEventListener('mihas:auth-redirect', handleAuthRedirect)
  }, [navigate])

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

  const layoutFallback = matchedRoute ? getSkeletonFallback(matchedRoute) : <DashboardSkeleton />

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
          {isLightweightRoute ? (
            routesMarkup
          ) : (
            <Suspense fallback={layoutFallback}>
              <AppLayout>{routesMarkup}</AppLayout>
            </Suspense>
          )}
        </div>
      </RouteErrorBoundary>
    </>
  )
}

export function AuthenticatedRouteShell() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AuthProvider>
          <RealtimeStatusProvider>
            <RoutedAuthenticatedApp />
          </RealtimeStatusProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  )
}

export default AuthenticatedRouteShell
