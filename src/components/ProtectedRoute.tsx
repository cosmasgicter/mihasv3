import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthCheck } from '@/hooks/auth/useSessionListener'
import { GuardInlineSkeleton } from '@/components/ui/GuardInlineSkeleton'
import { startLoaderTelemetry } from '@/lib/loaderTelemetry'

interface ProtectedRouteProps {
  children: React.ReactNode
}

const LOADING_TIMEOUT_MS = 5000
const AUTH_RECOVERY_TIMEOUT_MS = 1200
const SIGNIN_REDIRECT_KEY = 'mihas:post-auth-redirect'

/**
 * Protected route guard using optimized auth state checks.
 * Uses lightweight useAuthCheck hook that only checks authentication
 * without fetching profile data, reducing unnecessary API calls.
 * Preserves intended destination for redirect after login.
 *
 * Includes a 5-second timeout safety net: if loading persists beyond
 * 5 seconds, forces a React Query refetch and shows a recovery UI.
 * This prevents the known post-login skeleton hang bug.
 *
 * Requirements: 4.5, 11.5, 14.7, 34.3
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, retrySessionCheck } = useAuthCheck()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [showTimeoutMessage, setShowTimeoutMessage] = useState(false)
  const [isRecoveringSession, setIsRecoveringSession] = useState(false)
  const [recoveryAttempted, setRecoveryAttempted] = useState(false)
  const [allowSigninRedirect, setAllowSigninRedirect] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loaderTelemetryRef = useRef<ReturnType<typeof startLoaderTelemetry> | null>(null)

  const fullPath = `${location.pathname}${location.search}${location.hash}`

  const persistReturnPath = useCallback(() => {
    try {
      sessionStorage.setItem(SIGNIN_REDIRECT_KEY, fullPath)
      window.dispatchEvent(new CustomEvent('mihas:before-auth-redirect', {
        detail: { from: fullPath },
      }))
    } catch {
      // best effort only
    }
  }, [fullPath])

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
    if (isLoading) {
      timeoutRef.current = setTimeout(() => {
        // Force refetch the auth session to break out of stale loading state
        queryClient.invalidateQueries({ queryKey: ['auth', 'session'] })
        setShowTimeoutMessage(true)
      }, LOADING_TIMEOUT_MS)
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current)
        redirectTimeoutRef.current = null
      }
    }
  }, [isLoading, queryClient])

  // Reset timeout message when loading resolves
  useEffect(() => {
    if (!isLoading) {
      setShowTimeoutMessage(false)
    }
  }, [isLoading])

  useEffect(() => {
    if (isLoading && !loaderTelemetryRef.current) {
      loaderTelemetryRef.current = startLoaderTelemetry('protected-route-auth-bootstrap')
      return
    }

    if (!isLoading && loaderTelemetryRef.current) {
      loaderTelemetryRef.current.end({ authenticated: isAuthenticated, route: location.pathname })
      loaderTelemetryRef.current = null
    }
  }, [isAuthenticated, isLoading, location.pathname])

  useEffect(() => {
    if (isLoading || isAuthenticated || allowSigninRedirect) return
    if (!recoveryAttempted) {
      void runSessionRecovery()
      return
    }

    redirectTimeoutRef.current = setTimeout(() => {
      persistReturnPath()
      setAllowSigninRedirect(true)
    }, AUTH_RECOVERY_TIMEOUT_MS)

    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current)
        redirectTimeoutRef.current = null
      }
    }
  }, [
    allowSigninRedirect,
    isAuthenticated,
    isLoading,
    persistReturnPath,
    recoveryAttempted,
    runSessionRecovery,
  ])

  if (isLoading) {
    if (showTimeoutMessage) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-gray-600">Taking longer than expected...</p>
            <button
              type="button"
              onClick={() => void runSessionRecovery()}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-70"
              disabled={isRecoveringSession}
            >
              {isRecoveringSession ? 'Retrying session…' : 'Retry session'}
            </button>
          </div>
        </div>
      )
    }
    return <GuardInlineSkeleton label="Verifying account access" />
  }

  if (!isAuthenticated) {
    if (!allowSigninRedirect || isRecoveringSession) {
      return <GuardInlineSkeleton label="Verifying account access" />
    }
    return <Navigate to="/auth/signin" state={{ from: location }} replace />
  }

  return <>{children}</>
}
