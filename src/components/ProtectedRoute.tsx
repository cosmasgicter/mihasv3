import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthCheck } from '@/hooks/auth/useOptimizedAuthState'
import { UnifiedLoader } from '@/components/ui/UnifiedLoader'

interface ProtectedRouteProps {
  children: React.ReactNode
}

/**
 * Protected route guard using optimized auth state checks
 * Uses lightweight useAuthCheck hook that only checks authentication
 * without fetching profile data, reducing unnecessary API calls
 * Preserves intended destination for redirect after login
 * Requirements: 4.5, 11.5
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuthCheck()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-muted to-muted">
        <div className="text-center p-8 bg-card rounded-xl shadow-lg border border-border max-w-md mx-4">
          <UnifiedLoader variant="inline" size="lg" message="Verifying your session" />
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    // Preserve the intended destination in location state
    // This allows redirecting back after successful login
    return <Navigate to="/auth/signin" state={{ from: location }} replace />
  }

  return <>{children}</>
}