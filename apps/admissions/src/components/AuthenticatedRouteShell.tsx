import React, { Suspense, lazy, useEffect, useMemo } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { matchPath, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import '@/styles/legibility.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { StudentRoute } from '@/components/StudentRoute'
import { AdminRoute } from '@/components/AdminRoute'
import { ErrorBoundary as RouteErrorBoundary } from '@/components/ui/ErrorBoundary'
import { routes, type RouteConfig } from '@/routes/config'
import { LazyLoadErrorBoundary } from '@/components/LazyLoadErrorBoundary'
import { AuthErrorBoundary } from '@/components/auth/AuthErrorBoundary'
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

  // Wrap public auth-related routes in <AuthErrorBoundary> for enhanced resilience
  const isAuthRoute =
    route.path.startsWith('/auth/') ||
    ['/signin', '/login', '/signup', '/forgot-password', '/reset-password'].includes(route.path)

  if (isAuthRoute) {
    routeElement = <AuthErrorBoundary>{routeElement}</AuthErrorBoundary>
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

  // Dismiss preloader on first paint — app has real content now
  useEffect(() => {
    ;(window as Window & { __dismissPreloader?: () => void }).__dismissPreloader?.()
  }, [])

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
  const deferredSessionHydrated = useDeferredHydration(canLoadSessionMonitor, 1800)

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
          <RoutedAuthenticatedApp />
        </AuthProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  )
}

export default AuthenticatedRouteShell
