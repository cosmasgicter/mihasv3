import React, { useEffect, useRef } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { AdminErrorBoundary } from '@/components/admin/AdminErrorBoundary'
import { InstitutionScopeProvider } from '@/contexts/InstitutionScopeContext'
import { useCapabilities } from '@/contexts/CapabilityContext'
import { GuardInlineSkeleton } from '@/components/ui/GuardInlineSkeleton'
import { startLoaderTelemetry } from '@/lib/loaderTelemetry'
import { pathFor } from '@/routes/routeRegistry'

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
    return <Navigate to={pathFor('admin.dashboard')} replace />
  }

  return <>{children}</>
}

/**
 * Admin route guard — four-state pattern.
 *
 * - Loading → skeleton
 * - Not authenticated → redirect to sign-in (preserving return path)
 * - Authenticated **and the backend grants tenant or platform authority** →
 *   render children
 * - Anyone else → redirect to the student dashboard
 *
 * The third state is what changed in admissions-v2 task 9.4 (finding **AUTH-01**:
 * "Reviewers are excluded by frontend admin guards and treated as students by
 * backend lists, while review mutations require `IsAdmin`").
 *
 * The guard used to admit an actor whose *role string* was `admin` or
 * `super_admin`. A scoped Reviewer — the platform's own fourth authority role,
 * whose whole purpose is reviewing applications, and who the backend answers
 * correctly at every review route — was redirected to the **student** workspace
 * and could not open the review workspace in a browser at all. So the frontend
 * denied work the backend granted, which is the reverse of the platform's
 * security model: frontend hiding is never the boundary, and it must not be the
 * *denial* either.
 *
 * It now admits an actor the backend says holds authority: a Super_Admin, or any
 * actor with at least one in-scope institution capability
 * (`useCapabilities().noAccess === false`). The role tier is kept as the fast
 * path so an `admin` renders without waiting on a network answer; a Reviewer is
 * admitted once their capability set resolves. The backend re-enforces every
 * check regardless, and an actor whose capabilities resolve to nothing still
 * lands on the student dashboard.
 */
export function AdminRoute({ children, requireSuperAdmin = false }: AdminRouteProps) {
  const { user, isAdmin, loading } = useAuth()
  const { noAccess, isLoading: capabilitiesLoading } = useCapabilities()
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
    return <Navigate to={pathFor('auth.signIn')} state={{ from: location }} replace />
  }

  // The role tier is a fast path, not the authority: an `admin` renders without
  // waiting, and everyone else waits for the backend's own answer rather than
  // being bounced on a role string.
  if (!isAdmin) {
    if (capabilitiesLoading) {
      return <GuardInlineSkeleton label="Checking permissions" />
    }
    if (noAccess) {
      return <Navigate to={pathFor('student.dashboard')} replace />
    }
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
