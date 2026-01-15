import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useOptimizedAuthState } from '@/hooks/auth/useOptimizedAuthState'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface StudentRouteProps {
  children: React.ReactNode
}

/**
 * Student route guard using optimized auth state checks
 * Leverages React Query caching to avoid redundant session validations
 * Preserves intended destination for redirect after login
 * Requirements: 4.5, 11.5
 */
export function StudentRoute({ children }: StudentRouteProps) {
  const { user, isAdmin, isLoading } = useOptimizedAuthState()
  const location = useLocation()

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

  if (!user) {
    // Preserve the intended destination in location state
    return <Navigate to="/auth/signin" state={{ from: location }} replace />
  }

  // Redirect admins to admin dashboard
  if (isAdmin) {
    return <Navigate to="/admin/dashboard" replace />
  }

  return <>{children}</>
}
