import React, { Suspense, useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AdminRoute } from '@/components/AdminRoute'
import { ToastProvider } from '@/components/ui/Toast'
import { LoadingFallback } from '@/components/ui/LoadingFallback'
import { FancyPreloader } from '@/components/ui/FancyPreloader'
import { routes, type RouteConfig } from '@/routes/config'
import { AnalyticsTracker } from '@/components/analytics/AnalyticsTracker'



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
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <Router>
            <AnalyticsTracker>
              <div className="min-h-screen bg-gray-50">
                <Routes>
                  {routes.map((route) => (
                    <Route
                      key={route.path}
                      path={route.path}
                      element={renderRoute(route)}
                    />
                  ))}
                </Routes>
              </div>
            </AnalyticsTracker>
          </Router>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
