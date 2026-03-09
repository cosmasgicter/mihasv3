import React, { useState, useEffect, useRef } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthCheck } from '@/hooks/auth/useSessionListener'
import { AppShellSkeleton } from '@/components/ui/AppShellSkeleton'

interface ProtectedRouteProps {
  children: React.ReactNode
}

const LOADING_TIMEOUT_MS = 5000

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
  const { isAuthenticated, isLoading } = useAuthCheck()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [showTimeoutMessage, setShowTimeoutMessage] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    }
  }, [isLoading, queryClient])

  // Reset timeout message when loading resolves
  useEffect(() => {
    if (!isLoading) {
      setShowTimeoutMessage(false)
    }
  }, [isLoading])

  if (isLoading) {
    if (showTimeoutMessage) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-gray-600">Taking longer than expected...</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Reload page
            </button>
          </div>
        </div>
      )
    }
    return <AppShellSkeleton />
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/signin" state={{ from: location }} replace />
  }

  return <>{children}</>
}
