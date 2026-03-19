import React, { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { StudentErrorBoundary } from '@/components/student/StudentErrorBoundary'
import { GuardInlineSkeleton } from '@/components/ui/GuardInlineSkeleton'
import { startLoaderTelemetry } from '@/lib/loaderTelemetry'

interface StudentRouteProps {
  children: React.ReactNode
}

const AUTH_BOOTSTRAP_MAX_WAIT_MS = 5000

/**
 * Student route guard deriving auth state exclusively from useAuth() (AuthContext).
 * This ensures a single source of truth for auth state across all route guards.
 * Preserves intended destination for redirect after login.
 * Requirements: 1.4, 1.5, 4.5, 11.1, 11.5, 11.8
 */
export function StudentRoute({ children }: StudentRouteProps) {
  const { user, isAdmin, loading } = useAuth()
  const location = useLocation()
  const [maxWaitReached, setMaxWaitReached] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loaderTelemetryRef = useRef<ReturnType<typeof startLoaderTelemetry> | null>(null)

  useEffect(() => {
    if (loading && !loaderTelemetryRef.current) {
      loaderTelemetryRef.current = startLoaderTelemetry('student-route-auth-bootstrap')
    }

    if (!loading && loaderTelemetryRef.current) {
      loaderTelemetryRef.current.end({
        hasUser: Boolean(user),
        isAdmin,
        route: location.pathname,
      })
      loaderTelemetryRef.current = null
    }
  }, [isAdmin, loading, location.pathname, user])

  useEffect(() => {
    if (!loading) {
      setMaxWaitReached(false)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      return
    }

    timeoutRef.current = setTimeout(() => {
      setMaxWaitReached(true)
      console.warn('[loader] student-route-auth-bootstrap exceeded max wait', {
        maxWaitMs: AUTH_BOOTSTRAP_MAX_WAIT_MS,
        route: location.pathname,
      })
    }, AUTH_BOOTSTRAP_MAX_WAIT_MS)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [loading, location.pathname])

  if (loading) {
    if (maxWaitReached) {
      return (
        <div className="mx-auto w-full max-w-2xl px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">Still verifying your student session.</p>
          <p className="mt-2 text-xs text-muted-foreground/80">If this continues, refresh the page to retry auth bootstrap.</p>
        </div>
      )
    }

    return <GuardInlineSkeleton label="Verifying student access" />
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
