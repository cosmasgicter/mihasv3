import React, { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
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
      
      // Check session validity
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      const hasValidSession = !sessionError && !!session
      
      // Check if user can actually make authenticated requests
      let canSubmitApplication = false
      if (hasUser && hasValidSession) {
        try {
          // Test with a simple authenticated query
          const { error: testError } = await supabase
            .from('user_profiles')
            .select('id')
            .limit(1)
          
          canSubmitApplication = !testError
        } catch (error) {
          console.warn('Auth test query failed:', { error: sanitizeForLog(error instanceof Error ? error.message : 'Unknown error') })
        }
      }
      
      const newStatus = {
        isAuthenticated: hasUser,
        hasValidSession,
        canSubmitApplication,
        error: sessionError?.message
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
      return <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
    }
    
    if (authStatus.canSubmitApplication) {
      return <CheckCircle className="h-4 w-4 text-green-500" />
    }
    
    if (authStatus.isAuthenticated) {
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />
    }
    
    return <XCircle className="h-4 w-4 text-red-500" />
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
    if (authStatus.canSubmitApplication) return 'text-green-700'
    if (authStatus.isAuthenticated) return 'text-yellow-700'
    return 'text-red-700'
  }

  return (
    <div className="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg border">
      {getStatusIcon()}
      <span className={`text-sm font-medium ${getStatusColor()}`}>
        {getStatusMessage()}
      </span>
      
      {!authStatus.canSubmitApplication && (
        <button
          onClick={checkAuthenticationStatus}
          className="ml-auto px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          Refresh
        </button>
      )}
    </div>
  )
}