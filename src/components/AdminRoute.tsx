import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useOptimizedAuthState } from '@/hooks/auth/useOptimizedAuthState'
import { UnifiedLoader } from '@/components/ui/UnifiedLoader'
import { AdminErrorBoundary } from '@/components/admin/AdminErrorBoundary'
import { useDebouncedLoading } from '@/hooks/useLoadingState'

interface AdminRouteProps {
  children: React.ReactNode
}

/**
 * Admin route guard using optimized auth state checks
 * Leverages React Query caching to avoid redundant profile fetches
 * Preserves intended destination for redirect after login
 * Requirements: 4.5, 11.5
 */
export function AdminRoute({ children }: AdminRouteProps) {
  const { user, isAdmin, isLoading } = useOptimizedAuthState()
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
        message="Verifying administrator access"
        className="w-full py-6"
      />
    )
  }

  if (!user) {
    // Preserve the intended destination in location state
    return <Navigate to="/auth/signin" state={{ from: location }} replace />
  }

  // Super admin override
  if (user.email === 'cosmas@beanola.com') {
    return <AdminErrorBoundary>{children}</AdminErrorBoundary>
  }

  // Check admin role
  if (!isAdmin) {
    return <Navigate to="/student/dashboard" replace />
  }

  return <AdminErrorBoundary>{children}</AdminErrorBoundary>
}
