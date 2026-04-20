import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAuthCheck } from '@/hooks/auth/useSessionListener'
import { AdminErrorBoundary } from '@/components/admin/AdminErrorBoundary'
import { GuardInlineSkeleton } from '@/components/ui/GuardInlineSkeleton'
import { startLoaderTelemetry } from '@/lib/loaderTelemetry'

interface AdminRouteProps {
  children: React.ReactNode
}

const AUTH_BOOTSTRAP_MAX_WAIT_MS = 5000

/**
 * Admin route guard deriving auth state exclusively from useAuth() (AuthContext).
 * This ensures a single source of truth for auth state across all route guards.
 * Preserves intended destination for redirect after login.
 * Requirements: 1.4, 1.5, 4.5, 11.5
 */
export function AdminRoute({ children }: AdminRouteProps) {
  const { user, isAdmin, loading } = useAuth()
  const { retrySessionCheck } = useAuthCheck()
  const location = useLocation()
  const [maxWaitReached, setMaxWaitReached] = useState(false)
  const [isRecoveringSession, setIsRecoveringSession] = useState(false)
  const [recoveryAttempted, setRecoveryAttempted] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loaderTelemetryRef = useRef<ReturnType<typeof startLoaderTelemetry> | null>(null)

  const runSessionRecovery = useCallback(async () => {
    if (isRecoveringSession) return
    setIsRecoveringSession(true)
    try {
      await retrySessionCheck()
    } finally {
      setRecoveryAttempted(true)
      setIsRecoveringSession(false)
    }
  }, [isRecoveringSession, retrySessionCheck])

  useEffect(() => {
    if (loading && !loaderTelemetryRef.current) {
      loaderTelemetryRef.current = startLoaderTelemetry('admin-route-auth-bootstrap')
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
      setRecoveryAttempted(false)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      return
    }

    timeoutRef.current = setTimeout(() => {
      setMaxWaitReached(true)
      console.warn('[loader] admin-route-auth-bootstrap exceeded max wait', {
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

  useEffect(() => {
    if (!loading || !maxWaitReached || recoveryAttempted || isRecoveringSession) {
      return
    }

    void runSessionRecovery()
  }, [isRecoveringSession, loading, maxWaitReached, recoveryAttempted, runSessionRecovery])

  if (loading) {
    return (
      <GuardInlineSkeleton
        label={maxWaitReached || isRecoveringSession ? 'Opening admin workspace' : 'Preparing admin workspace'}
      />
    )
  }

  if (!user) {
    // Don't redirect while session recovery is still in progress
    if (!recoveryAttempted || isRecoveringSession) {
      return (
        <GuardInlineSkeleton
          label="Reconnecting your session…"
        />
      )
    }
    // Preserve the intended destination in location state
    return <Navigate to="/auth/signin" state={{ from: location }} replace />
  }

  // Check admin role — access determined exclusively by RBAC isAdmin flag
  if (!isAdmin) {
    return <Navigate to="/student/dashboard" replace />
  }

  return <AdminErrorBoundary>{children}</AdminErrorBoundary>
}
