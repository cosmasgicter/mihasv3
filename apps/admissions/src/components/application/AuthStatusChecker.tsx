import React, { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { CheckCircle, XCircle, RefreshCw, AlertTriangle } from 'lucide-react'

interface AuthStatusCheckerProps {
  onStatusChange?: (isAuthenticated: boolean) => void
}

export function AuthStatusChecker({ onStatusChange }: AuthStatusCheckerProps) {
  const { user, loading } = useAuth()
  const queryClient = useQueryClient()
  const [authStatus, setAuthStatus] = useState<{
    isAuthenticated: boolean
    hasValidSession: boolean
    canSubmitApplication: boolean
    error?: string
  }>({
    isAuthenticated: false,
    hasValidSession: false,
    canSubmitApplication: false
  })
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    checkAuthenticationStatus()
  }, [user, loading])

  const checkAuthenticationStatus = () => {
    if (loading) {
      setIsChecking(true)
      return
    }

    // useAuth() is backed by React Query's ['auth', 'session'] — the single source of truth.
    // If user is present, the session is valid (ApiClient handles 401 refresh transparently).
    const hasUser = !!user?.id
    const hasValidSession = hasUser
    const canSubmitApplication = hasUser && hasValidSession

    const newStatus = {
      isAuthenticated: hasUser,
      hasValidSession,
      canSubmitApplication,
    }

    setAuthStatus(newStatus)
    onStatusChange?.(canSubmitApplication)
    setIsChecking(false)
  }

  const getStatusIcon = () => {
    if (isChecking) {
      return <RefreshCw className="h-4 w-4 animate-pulse text-primary" />
    }
    
    if (authStatus.canSubmitApplication) {
      return <CheckCircle className="h-4 w-4 text-success" />
    }
    
    if (authStatus.isAuthenticated) {
      return <AlertTriangle className="h-4 w-4 text-warning" />
    }
    
    return <XCircle className="h-4 w-4 text-error" />
  }

  const getStatusMessage = () => {
    if (isChecking) {
      return 'Checking authentication...'
    }
    
    if (authStatus.canSubmitApplication) {
      return 'Ready to submit application'
    }
    
    if (authStatus.isAuthenticated && !authStatus.hasValidSession) {
      return 'Session expired - please sign in again'
    }
    
    if (authStatus.isAuthenticated && !authStatus.canSubmitApplication) {
      return 'Authentication issue - please refresh and try again'
    }
    
    return 'Please sign in to submit your application'
  }

  const getStatusColor = () => {
    if (authStatus.canSubmitApplication) return 'text-accent'
    if (authStatus.isAuthenticated) return 'text-yellow-700'
    return 'text-error'
  }

  return (
    <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg border">
      {getStatusIcon()}
      <span className={`text-sm font-medium ${getStatusColor()}`}>
        {getStatusMessage()}
      </span>
      
      {!authStatus.canSubmitApplication && (
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['auth', 'session'] })}
          className="ml-auto px-3 py-1 text-xs bg-primary text-white rounded hover:bg-primary transition-colors"
        >
          Refresh
        </button>
      )}
    </div>
  )
}
