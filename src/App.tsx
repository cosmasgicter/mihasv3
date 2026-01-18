import React, { Suspense, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      refetchOnReconnect: true,
      refetchInterval: 60000, // Poll every 60 seconds as fallback
      staleTime: 30000, // 30 seconds
      gcTime: 5 * 60 * 1000,
      networkMode: 'offlineFirst',
    },
  },
})

// Initialize cache monitoring in production
if (import.meta.env.PROD) {
  cacheMonitor.initialize(queryClient)
}

const renderRoute = (route: RouteConfig) => {
  const { element, guard, lazy } = route
  
  let routeElement: React.ReactElement
  
  if (React.isValidElement(element)) {
    routeElement = element
  } else {
    const Component = element as React.ComponentType
    routeElement = lazy ? (
      <Suspense fallback={<LoadingFallback />}>
        <Component />
      </Suspense>
    ) : <Component />
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
    const preloader = document.getElementById('preloader');
    if (preloader) {
      preloader.classList.add('hidden');
      setTimeout(() => {
        preloader.remove();
      }, 500);
    }

    // Handle chunk loading errors
    const handleError = (event: ErrorEvent) => {
      if (event.message?.includes('Failed to fetch dynamically imported module')) {
        event.preventDefault();
        window.location.reload();
      }
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
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
                  </SimpleErrorBoundary>
                </AnalyticsTracker>
              </Router>
              </SafeAreaProvider>
            </RealtimeStatusProvider>
          </AuthProvider>
        </SkeletonProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
