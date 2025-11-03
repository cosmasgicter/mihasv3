import React, { Suspense, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { StudentRoute } from '@/components/StudentRoute'
import { AdminRoute } from '@/components/AdminRoute'
import { ToastContainer } from '@/components/ui/Toast'
import { AppLayout } from '@/components/navigation/AppLayout'
import { SessionMonitor } from '@/components/auth/SessionMonitor'
import { LoadingFallback } from '@/components/ui/LoadingFallback'
import { SimpleErrorBoundary } from '@/components/ui/SimpleErrorBoundary'
import { routes, type RouteConfig } from '@/routes/config'
import { AnalyticsTracker } from '@/components/analytics/AnalyticsTracker'
import { ErrorBoundary } from '@/components/ErrorBoundary'

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
        <AuthProvider>
          <ToastContainer />
          <Router>
            <AnalyticsTracker>
              <SessionMonitor />
              <SimpleErrorBoundary>
                <div className="min-h-screen bg-background">
                  <AppLayout>
                    <Routes>
                      {routes.map((route) => (
                        <Route
                          key={route.path}
                          path={route.path}
                          element={renderRoute(route)}
                        />
                      ))}
                    </Routes>
                  </AppLayout>
                </div>
              </SimpleErrorBoundary>
            </AnalyticsTracker>
          </Router>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
