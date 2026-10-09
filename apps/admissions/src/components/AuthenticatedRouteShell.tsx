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
import { BROWSER_EVENTS, LEGACY_BROWSER_EVENTS, listenWithLegacyEventFallback } from '@/lib/browserNamespace'
import { useAuth } from '@/contexts/AuthContext'
import { CapabilityProvider } from '@/contexts/CapabilityContext'
import { useDeferredHydration } from '@/hooks/useDeferredHydration'
import { SafeAreaProvider } from '@/components/ui/SafeAreaProvider'
import { queryClient } from '@/lib/queryClient'
import { APP_MAIN_CONTENT_ID } from '@/lib/accessibility-utils'

/**
 * Unwrap a named export for `React.lazy` **without turning a failed fetch into a
 * `TypeError`** (GATE-13.3-10, 13.6 §8.1 item L6).
 *
 * `lazy(() => import(m).then((mod) => ({ default: mod.Name })))` is the ordinary
 * idiom and it has a sharp edge: when the module cannot be fetched and the loader
 * hands back something that is not a module namespace, the property access itself
 * throws — which is how task 13.3's offline reproduction produced *"Cannot read
 * properties of undefined (reading 'SessionMonitor')"* instead of a recognisable
 * chunk-load failure. That message then defeated `LazyLoadErrorBoundary`'s own
 * `isChunkError` classifier as well, so the app's chunk-recovery path never ran.
 *
 * Naming the failure for what it is keeps every downstream classifier working and
 * keeps the module name out of the student's copy.
 */
function lazyNamed<T extends React.ComponentType<any>>(
  moduleName: string,
  exportName: string,
  load: () => Promise<Record<string, unknown>>,
) {
  return lazy(async () => {
    const mod = await load()
    const component = mod?.[exportName]
    if (!component) {
      throw new Error(
        `Failed to fetch dynamically imported module: ${moduleName} (${exportName} unavailable)`,
      )
    }
    return { default: component as T }
  })
}

const AppLayout = lazyNamed<typeof import('@/components/navigation/AppLayout')['AppLayout']>(
  '@/components/navigation/AppLayout',
  'AppLayout',
  () => import('@/components/navigation/AppLayout') as unknown as Promise<Record<string, unknown>>,
)
const SessionMonitor = lazyNamed<typeof import('@/components/auth/SessionMonitor')['SessionMonitor']>(
  '@/components/auth/SessionMonitor',
  'SessionMonitor',
  () => import('@/components/auth/SessionMonitor') as unknown as Promise<Record<string, unknown>>,
)

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
      return (
        <AdminRoute requireSuperAdmin={route.requiresSuperAdmin}>
          {routeElement}
        </AdminRoute>
      )
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
      const mainContent = document.getElementById(APP_MAIN_CONTENT_ID) || document.querySelector('main') || document.querySelector('h1')
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

    return listenWithLegacyEventFallback(
      window,
      BROWSER_EVENTS.authRedirect,
      [LEGACY_BROWSER_EVENTS.authRedirect],
      handleAuthRedirect,
    )
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
      {/*
        `SessionMonitor` is deliberately **not** given its own silent boundary
        (task 13.6 remediation L6, GATE-13.3-10) — and that is a measured decision,
        not an oversight.

        L6 tried it: wrapping this in `<RouteErrorBoundary fallback={null}>` so a
        background session watcher failing to download could not take the student's
        page with it. It worked, and it made the offline screen **worse**. With this
        subtree silent, the only thing left after an offline chunk failure was the
        wizard route's own `Suspense` skeleton — a page that spins forever with **no
        recovery control at all** (measured:
        `{"wizardUsableAgain":false,"retryAffordance":[]}` after reconnect, on both
        device profiles). Today's behaviour surfaces a boundary that says what
        happened and offers `Try Again`, and 13.3 asserted — and this batch
        re-asserted — that pressing it after reconnect brings the wizard back.

        A recovery affordance the student can use beats a mount they cannot use. The
        residual (a route whose lazy chunk cannot be fetched cannot be kept mounted,
        because the platform ships no service worker by design) is recorded in the L6
        evidence rather than papered over, together with the stuck-skeleton failure
        mode the experiment exposed.

        What *did* change here is `lazyNamed` above: the failure is now a named
        chunk-load error rather than a `TypeError` about a property of `undefined`,
        so `ErrorBoundary`'s classifier and `LazyLoadErrorBoundary`'s own
        `isChunkError` check can both recognise it.
      */}
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
            // CapabilityProvider wraps the whole authenticated layout (not just
            // routed page content) so the navigation surfaces and the admin
            // route guard can derive from the same backend capability set
            // (enterprise-tenant-authority R13). The query only fetches for
            // admins; everyone else gets the fail-closed no-access default.
            <CapabilityProvider>
              <Suspense fallback={layoutFallback}>
                <AppLayout>{routesMarkup}</AppLayout>
              </Suspense>
            </CapabilityProvider>
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
