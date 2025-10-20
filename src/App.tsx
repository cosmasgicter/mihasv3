import React, { Suspense, useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { StudentRoute } from '@/components/StudentRoute'
import { AdminRoute } from '@/components/AdminRoute'
import { ToastProvider } from '@/components/ui/Toast'

import { AppLayout } from '@/components/navigation/AppLayout'
import { UserMenu } from '@/components/ui/UserMenu'
import { NotificationBell } from '@/components/student/NotificationBell'
import { SessionMonitor } from '@/components/auth/SessionMonitor'
import { LoadingFallback } from '@/components/ui/LoadingFallback'
import { SimpleErrorBoundary } from '@/components/ui/SimpleErrorBoundary'
import { FancyPreloader } from '@/components/ui/FancyPreloader'
import { routes, type RouteConfig } from '@/routes/config'
import { AnalyticsTracker } from '@/components/analytics/AnalyticsTracker'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ParticleBackground } from '@/components/effects/ParticleBackground'




// Optimized query client for better performance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchInterval: false,
      staleTime: 10 * 60 * 1000, // 10 minutes
      gcTime: 15 * 60 * 1000, // 15 minutes
      networkMode: 'offlineFirst',
      refetchOnReconnect: true,
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
  const [isLoading, setIsLoading] = useState(true)


  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 2000)
    return () => clearTimeout(timer)
  }, [])

  if (isLoading) {
    return <FancyPreloader />
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
            <ToastProvider>
            <Router>
              <AnalyticsTracker>
                <SessionMonitor />
                <SimpleErrorBoundary>
                  <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-secondary/5 transition-colors duration-500">
                    <ParticleBackground />
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
            </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
