import React, { Suspense, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { AuthProvider } from '@/contexts/AuthContext'
import { SkeletonProvider } from '@/contexts/SkeletonContext'
import { RealtimeStatusProvider } from '@/contexts/RealtimeStatusContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { StudentRoute } from '@/components/StudentRoute'
import { AdminRoute } from '@/components/AdminRoute'
import { ToastContainer } from '@/components/ui/Toast'
import { AppLayout } from '@/components/navigation/AppLayout'
import { SessionMonitor } from '@/components/auth/SessionMonitor'
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

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { InstallBanner } from '@/components/ui/InstallBanner'
import { OfflineIndicator } from '@/components/pwa/OfflineIndicator'
import { OfflineBanner } from '@/components/ui/OfflineBanner'
import { ServiceWorkerUpdatePrompt } from '@/components/ServiceWorkerUpdatePrompt'
import { cacheMonitor } from '@/services/cacheMonitor'
import { isLightweightPublicRoute } from '@/lib/routeRuntime'

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
function getSkeletonFallback(skeletonType?: SkeletonType): React.ReactNode {
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
      return <UnifiedLoader variant="page" size="lg" label="Loading page" />
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
        <Suspense fallback={getSkeletonFallback(route.skeletonType)}>
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
      <Analytics />
      <SpeedInsights />
    </ErrorBoundary>
  )
}

function RoutedAppChrome() {
  const location = useLocation()
  const isLightweightRoute = isLightweightPublicRoute(location.pathname)
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
      {!isLightweightRoute && <InstallBanner />}
      {!isLightweightRoute && <OfflineIndicator />}
      {!isLightweightRoute && <ServiceWorkerUpdatePrompt />}
      {!isLightweightRoute && <SessionMonitor />}
      <RouteErrorBoundary level="page">
        <div className="min-h-screen bg-background safe-area-all">
          {isLightweightRoute ? routesMarkup : <AppLayout>{routesMarkup}</AppLayout>}
        </div>
      </RouteErrorBoundary>
    </>
  )
}

export default App
