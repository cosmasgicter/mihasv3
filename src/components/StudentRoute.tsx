import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { StudentErrorBoundary } from '@/components/student/StudentErrorBoundary'
import { AppShellSkeleton } from '@/components/ui/AppShellSkeleton'

interface StudentRouteProps {
  children: React.ReactNode
}

/**
 * Student route guard deriving auth state exclusively from useAuth() (AuthContext).
 * This ensures a single source of truth for auth state across all route guards.
 * Preserves intended destination for redirect after login.
 * Requirements: 1.4, 1.5, 4.5, 11.1, 11.5, 11.8
 */
export function StudentRoute({ children }: StudentRouteProps) {
  const { user, isAdmin, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <AppShellSkeleton />
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
