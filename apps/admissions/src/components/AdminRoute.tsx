import React, { useEffect, useRef } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { AdminErrorBoundary } from '@/components/admin/AdminErrorBoundary'
import { InstitutionScopeProvider } from '@/contexts/InstitutionScopeContext'
import { useCapabilities } from '@/contexts/CapabilityContext'
import { GuardInlineSkeleton } from '@/components/ui/GuardInlineSkeleton'
import { startLoaderTelemetry } from '@/lib/loaderTelemetry'

interface AdminRouteProps {
  children: React.ReactNode
  /**
   * When true, block non-super-admins from reaching this route (R13.5). The
   * `CapabilityProvider` is mounted above the layout, so this guard reads the
   * same backend capability set the nav uses. The backend re-enforces the
   * matching permission regardless of this client-side guard.
   */
  requireSuperAdmin?: boolean
}

/**
 * Blocks a route unless the actor is a Super_Admin. Lives as its own component
 * (rendered inside the CapabilityProvider tree) so it can consume
 * `useCapabilities()` without altering AdminRoute's own hook order.
 */
function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin, isLoading } = useCapabilities()

  if (isLoading) {
    return <GuardInlineSkeleton label="Checking permissions" />
  }

  // Non-revealing block: redirect to the admin dashboard rather than disclosing
  // the existence or shape of the super-admin-only surface.
  if (!isSuperAdmin) {
    return <Navigate to="/admin/dashboard" replace />
  }

  return <>{children}</>
}

/**
 * Admin route guard — simple three-state pattern.
 *
 * - Loading → skeleton
 * - Authenticated + admin → render children
 * - Not authenticated → redirect to sign-in (preserving return path)
 * - Student → redirect to student dashboard
 */
export function AdminRoute({ children, requireSuperAdmin = false }: AdminRouteProps) {
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

  const content = requireSuperAdmin ? (
    <RequireSuperAdmin>{children}</RequireSuperAdmin>
  ) : (
    children
  )

  return (
    <AdminErrorBoundary>
      <InstitutionScopeProvider>{content}</InstitutionScopeProvider>
    </AdminErrorBoundary>
  )
}
