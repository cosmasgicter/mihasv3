import React, { useEffect, useRef, useCallback } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthCheck } from '@/hooks/auth/useSessionListener'
import { GuardInlineSkeleton } from '@/components/ui/GuardInlineSkeleton'
import { startLoaderTelemetry } from '@/lib/loaderTelemetry'
import { BROWSER_KEYS } from '@/lib/browserNamespace'

interface ProtectedRouteProps {
  children: React.ReactNode
}

const SIGNIN_REDIRECT_KEY = BROWSER_KEYS.postAuthRedirect

/**
 * Protected route guard.
 *
 * Simple three-state logic:
 * - Loading → show skeleton
 * - Authenticated → render children
 * - Not authenticated → redirect to sign-in (preserving return path)
 *
 * With same-origin API proxy and DRF as sole auth authority,
 * there is no need for recovery loops, timeouts, or reconnection states.
 * The session query either succeeds (user is authenticated) or returns
 * null (user needs to sign in). Token refresh is handled by the API client.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuthCheck()
  const location = useLocation()
  const telemetryRef = useRef<ReturnType<typeof startLoaderTelemetry> | null>(null)

  const fullPath = `${location.pathname}${location.search}${location.hash}`

  const persistReturnPath = useCallback(() => {
    try {
      sessionStorage.setItem(SIGNIN_REDIRECT_KEY, fullPath)
    } catch { /* best effort */ }
  }, [fullPath])

  useEffect(() => {
    if (isLoading && !telemetryRef.current) {
      telemetryRef.current = startLoaderTelemetry('protected-route-auth-bootstrap')
    } else if (!isLoading && telemetryRef.current) {
      telemetryRef.current.end({ authenticated: isAuthenticated, route: location.pathname })
      telemetryRef.current = null
    }
  }, [isAuthenticated, isLoading, location.pathname])

  if (isLoading) {
    return <GuardInlineSkeleton label="Preparing your account" />
  }

  if (!isAuthenticated) {
    persistReturnPath()
    return <Navigate to="/auth/signin" state={{ from: location }} replace />
  }

  return <>{children}</>
}
