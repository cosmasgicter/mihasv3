import React, { Suspense, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
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
import { LoadingFallback } from '@/components/ui/LoadingFallback'
import { SimpleErrorBoundary } from '@/components/ui/SimpleErrorBoundary'
import { SkipLinks } from '@/components/ui/SkipLinks'
import { SafeAreaProvider } from '@/components/ui/SafeAreaProvider'
import { routes, type RouteConfig } from '@/routes/config'
import { AnalyticsTracker } from '@/components/analytics/AnalyticsTracker'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { PWAInstallPrompt } from '@/components/pwa/PWAInstallPrompt'
import { OfflineIndicator } from '@/components/pwa/OfflineIndicator'
import { ServiceWorkerUpdatePrompt } from '@/components/ServiceWorkerUpdatePrompt'
import { cacheMonitor } from '@/services/cacheMonitor'

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

const renderRoute = (route: RouteConfig) => {
  const { element, guard } = route
  
  let routeElement: React.ReactElement
  
  // Handle undefined/null components to prevent React Error #130
  if (!element) {
    console.error(`Route ${route.path} has undefined element`)
    routeElement = (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Page Not Found</h2>
          <p className="text-gray-600">The requested page could not be loaded.</p>
        </div>
      </div>
    )
  } else if (React.isValidElement(element)) {
    routeElement = element
  } else {
    const Component = element as React.ComponentType
    routeElement = <Component />
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
              <SkipLinks />
              <ToastContainer />
              <PWAInstallPrompt />
              <OfflineIndicator />
              <ServiceWorkerUpdatePrompt />
              <Router>
                <AnalyticsTracker>
                  <SessionMonitor />
                  <SimpleErrorBoundary>
                    <Suspense
                      fallback={
                        <LoadingFallback
                          message="Preparing MIHAS"
                          label="Preparing MIHAS application"
                        />
                      }
                    >
                      <div className="min-h-screen bg-background safe-area-all">
                        <AppLayout>
                          <main 
                            id="main-content" 
                            tabIndex={-1} 
                            className="focus:outline-none"
                            role="main"
                            aria-label="Main content"
                          >
                            <Routes>
                              {routes.map((route) => (
                                <Route
                                  key={route.path}
                                  path={route.path}
                                  element={renderRoute(route)}
                                />
                              ))}
                            </Routes>
                          </main>
                        </AppLayout>
                      </div>
                    </Suspense>
                  </SimpleErrorBoundary>
                </AnalyticsTracker>
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

export default App
