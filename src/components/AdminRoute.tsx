import React from 'react'
import { Navigate } from 'react-router-dom'
import { useOptimizedAuthState } from '@/hooks/auth/useOptimizedAuthState'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { AdminErrorBoundary } from '@/components/admin/AdminErrorBoundary'

interface AdminRouteProps {
  children: React.ReactNode
}

/**
 * Admin route guard using optimized auth state checks
 * Leverages React Query caching to avoid redundant profile fetches
 * Requirements: 4.5
 */
export function AdminRoute({ children }: AdminRouteProps) {
  const { user, isAdmin, isLoading } = useOptimizedAuthState()
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth/signin" replace />
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