import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthCheck } from '@/hooks/auth/useOptimizedAuthState'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface ProtectedRouteProps {
  children: React.ReactNode
}

/**
 * Protected route guard using optimized auth state checks
 * Uses lightweight useAuthCheck hook that only checks authentication
 * without fetching profile data, reducing unnecessary API calls
 * Requirements: 4.5
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuthCheck()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-muted to-muted">
        <div className="text-center p-8 bg-card rounded-xl shadow-lg border border-border max-w-md mx-4">
          <LoadingSpinner size="lg" message="Loading..." />
          <p className="mt-4 text-sm text-gray-900">Please wait</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/signin" replace />
  }

  return <>{children}</>
}