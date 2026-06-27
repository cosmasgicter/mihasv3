import React, { useEffect, useRef } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { StudentErrorBoundary } from '@/components/student/StudentErrorBoundary'
import { GuardInlineSkeleton } from '@/components/ui/GuardInlineSkeleton'
import { startLoaderTelemetry } from '@/lib/loaderTelemetry'
import { pathFor } from '@/routes/routeRegistry'

interface StudentRouteProps {
  children: React.ReactNode
}

/**
 * Student route guard — simple three-state pattern.
 *
 * - Loading → skeleton
 * - Authenticated + student → render children
 * - Not authenticated → redirect to sign-in (preserving return path)
 * - Admin → redirect to admin dashboard
 */
export function StudentRoute({ children }: StudentRouteProps) {
  const { user, isAdmin, loading } = useAuth()
  const location = useLocation()
  const telemetryRef = useRef<ReturnType<typeof startLoaderTelemetry> | null>(null)

  useEffect(() => {
    if (loading && !telemetryRef.current) {
      telemetryRef.current = startLoaderTelemetry('student-route-auth-bootstrap')
    } else if (!loading && telemetryRef.current) {
      telemetryRef.current.end({ hasUser: Boolean(user), isAdmin, route: location.pathname })
      telemetryRef.current = null
    }
  }, [loading, user, isAdmin, location.pathname])

  if (loading) {
    return <GuardInlineSkeleton label="Preparing your student dashboard" />
  }

  if (!user) {
    return <Navigate to={pathFor('auth.signIn')} state={{ from: location }} replace />
  }

  if (isAdmin) {
    return <Navigate to={pathFor('admin.dashboard')} replace />
  }

  return <StudentErrorBoundary>{children}</StudentErrorBoundary>
}
