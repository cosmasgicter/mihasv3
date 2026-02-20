import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useOptimizedAuthState } from '@/hooks/auth/useOptimizedAuthState'
import { StudentErrorBoundary } from '@/components/student/StudentErrorBoundary'

interface StudentRouteProps {
  children: React.ReactNode
}

/**
 * Student route guard using optimized auth state checks
 * Leverages React Query caching to avoid redundant session validations
 * Preserves intended destination for redirect after login
 * Requirements: 4.5, 11.1, 11.5, 11.8
 */
export function StudentRoute({ children }: StudentRouteProps) {
  const { user, isAdmin, isLoading } = useOptimizedAuthState()
  const location = useLocation()

  if (isLoading) {
    return null
  }

  if (!user) {
    // Preserve the intended destination in location state
    return <Navigate to="/auth/signin" state={{ from: location }} replace />
  }

  // Redirect admins to admin dashboard
  if (isAdmin) {
    return <Navigate to="/admin/dashboard" replace />
  }

  return <StudentErrorBoundary>{children}</StudentErrorBoundary>
}
