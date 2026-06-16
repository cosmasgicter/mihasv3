import React, { useEffect, useRef } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { AdminErrorBoundary } from '@/components/admin/AdminErrorBoundary'
import { InstitutionScopeProvider } from '@/contexts/InstitutionScopeContext'
import { GuardInlineSkeleton } from '@/components/ui/GuardInlineSkeleton'
import { startLoaderTelemetry } from '@/lib/loaderTelemetry'

interface AdminRouteProps {
  children: React.ReactNode
}

/**
 * Admin route guard — simple three-state pattern.
 *
 * - Loading → skeleton
 * - Authenticated + admin → render children
 * - Not authenticated → redirect to sign-in (preserving return path)
 * - Student → redirect to student dashboard
 */
export function AdminRoute({ children }: AdminRouteProps) {
  const { user, isAdmin, loading } = useAuth()
  const location = useLocation()
  const telemetryRef = useRef<ReturnType<typeof startLoaderTelemetry> | null>(null)

  useEffect(() => {
    if (loading && !telemetryRef.current) {
      telemetryRef.current = startLoaderTelemetry('admin-route-auth-bootstrap')
    } else if (!loading && telemetryRef.current) {
      telemetryRef.current.end({ hasUser: Boolean(user), isAdmin, route: location.pathname })
      telemetryRef.current = null
    }
  }, [loading, user, isAdmin, location.pathname])

  if (loading) {
    return <GuardInlineSkeleton label="Preparing admin workspace" />
  }

  if (!user) {
    return <Navigate to="/auth/signin" state={{ from: location }} replace />
  }

  if (!isAdmin) {
    return <Navigate to="/student/dashboard" replace />
  }

  return (
    <AdminErrorBoundary>
      <InstitutionScopeProvider>{children}</InstitutionScopeProvider>
    </AdminErrorBoundary>
  )
}
