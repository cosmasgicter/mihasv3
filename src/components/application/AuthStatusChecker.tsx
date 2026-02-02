import React, { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { CheckCircle, XCircle, RefreshCw, AlertTriangle } from 'lucide-react'
import { sanitizeForLog } from '@/lib/sanitizer'

interface AuthStatusCheckerProps {
  onStatusChange?: (isAuthenticated: boolean) => void
}

export function AuthStatusChecker({ onStatusChange }: AuthStatusCheckerProps) {
  const { user } = useAuth()
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
  }, [user])

  const checkAuthenticationStatus = async () => {
    setIsChecking(true)
    
    try {
      // Check if user exists
      const hasUser = !!user?.id
      
      // Check session validity via API
      const response = await fetch('/api/auth?action=session', {
        credentials: 'include'
      })
      const sessionResult = await response.json()
      const hasValidSession = sessionResult.success && !!sessionResult.user
      
      // Check if user can actually make authenticated requests
      // If we have a valid session from the API, we can submit applications
      const canSubmitApplication = hasUser && hasValidSession
      
      const newStatus = {
        isAuthenticated: hasUser,
        hasValidSession,
        canSubmitApplication,
        error: sessionResult.error
      }
      
      setAuthStatus(newStatus)
      onStatusChange?.(canSubmitApplication)
      
    } catch (error) {
      const sanitizedError = sanitizeForLog(error instanceof Error ? error.message : 'Unknown error')
      console.error('Error checking auth status:', { error: sanitizedError })
      setAuthStatus({
        isAuthenticated: false,
        hasValidSession: false,
        canSubmitApplication: false,
        error: 'Failed to verify authentication'
      })
      onStatusChange?.(false)
    } finally {
      setIsChecking(false)
    }
  }

  const getStatusIcon = () => {
    if (isChecking) {
      return <RefreshCw className="h-4 w-4 animate-spin text-primary" />
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
          onClick={checkAuthenticationStatus}
          className="ml-auto px-3 py-1 text-xs bg-primary text-white rounded hover:bg-primary transition-colors"
        >
          Refresh
        </button>
      )}
    </div>
  )
}