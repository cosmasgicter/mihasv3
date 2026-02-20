import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthCheck } from '@/hooks/auth/useOptimizedAuthState'
import { UnifiedLoader } from '@/components/ui/UnifiedLoader'
import { useDebouncedLoading } from '@/hooks/useLoadingState'

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
  const showInlineLoader = useDebouncedLoading(isLoading, 200)
  const location = useLocation()

  if (isLoading) {
    if (!showInlineLoader) {
      return null
    }

    return (
      <UnifiedLoader
        variant="inline"
        size="md"
        message="Verifying your session"
        className="w-full py-6"
      />
    )
  }

  if (!isAuthenticated) {
    // Preserve the intended destination in location state
    // This allows redirecting back after successful login
    return <Navigate to="/auth/signin" state={{ from: location }} replace />
  }

  return <>{children}</>
}
