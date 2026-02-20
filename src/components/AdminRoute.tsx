import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useOptimizedAuthState } from '@/hooks/auth/useOptimizedAuthState'
import { AdminErrorBoundary } from '@/components/admin/AdminErrorBoundary'

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
  const location = useLocation()
  
  if (isLoading) {
    return null
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
