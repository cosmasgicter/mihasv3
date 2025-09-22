import React, { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { AlertCircle, RefreshCw } from 'lucide-react'

interface AuthenticationGuardProps {
  children: React.ReactNode
  onAuthenticationRequired?: () => void
}

export function AuthenticationGuard({ children, onAuthenticationRequired }: AuthenticationGuardProps) {
  const { user, loading } = useAuth()
  const [isVerifying, setIsVerifying] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [sessionValid, setSessionValid] = useState(false)

  useEffect(() => {
    verifyAuthentication()
  }, [user])

  const verifyAuthentication = async () => {
    if (loading) return

    setIsVerifying(true)
    setAuthError(null)

    try {
      // Check if user exists in context
      if (!user) {
        setAuthError('Please sign in to continue')
        onAuthenticationRequired?.()
        return
      }

      // Verify session is still valid
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session) {
        setAuthError('Your session has expired. Please sign in again.')
        onAuthenticationRequired?.()
        return
      }

      // Double-check user authentication
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser()
      
      if (userError || !currentUser) {
        setAuthError('Authentication verification failed. Please sign in again.')
        onAuthenticationRequired?.()
        return
      }

      setSessionValid(true)
      setAuthError(null)
    } catch (error) {
      console.error('Authentication verification error:', error)
      setAuthError('Unable to verify authentication. Please try again.')
    } finally {
      setIsVerifying(false)
    }
  }

  const handleRetry = () => {
    verifyAuthentication()
  }

  if (loading || isVerifying) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex items-center space-x-2">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>Verifying authentication...</span>
        </div>
      </div>
    )
  }

  if (authError || !sessionValid) {
    return (
      <div className="max-w-md mx-auto mt-8 p-6 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-center space-x-2 mb-4">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <h3 className="text-lg font-semibold text-red-800">Authentication Required</h3>
        </div>
        
        <p className="text-red-700 mb-4">
          {authError || 'You need to be signed in to access this feature.'}
        </p>
        
        <div className="flex space-x-3">
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
          
          <button
            onClick={() => window.location.href = '/auth/signin'}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}