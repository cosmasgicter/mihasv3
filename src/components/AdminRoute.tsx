import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { AdminErrorBoundary } from '@/components/admin/AdminErrorBoundary'
import { AppShellSkeleton } from '@/components/ui/AppShellSkeleton'

interface AdminRouteProps {
  children: React.ReactNode
}

/**
 * Admin route guard deriving auth state exclusively from useAuth() (AuthContext).
 * This ensures a single source of truth for auth state across all route guards.
 * Preserves intended destination for redirect after login.
 * Requirements: 1.4, 1.5, 4.5, 11.5
 */
export function AdminRoute({ children }: AdminRouteProps) {
  const { user, isAdmin, loading } = useAuth()
  const location = useLocation()
  
  if (loading) {
    return <AppShellSkeleton />
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
