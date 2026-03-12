import React, { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

interface AuthenticationGuardProps {
  children: React.ReactNode
  onAuthenticationRequired?: () => void
}

export function AuthenticationGuard({ children, onAuthenticationRequired }: AuthenticationGuardProps) {
  const { user, loading } = useAuth()
  const queryClient = useQueryClient()
  const [authError, setAuthError] = useState<string | null>(null)
  const [sessionValid, setSessionValid] = useState(false)

  useEffect(() => {
    if (loading) return

    // useAuth() is the single source of truth for auth state.
    // If user is present, the session is valid (ApiClient handles 401 refresh transparently).
    if (!user) {
      setAuthError('Please sign in to continue')
      setSessionValid(false)
      onAuthenticationRequired?.()
      return
    }

    setSessionValid(true)
    setAuthError(null)
  }, [user, loading])

  const handleRetry = () => {
    setAuthError(null)
    queryClient.invalidateQueries({ queryKey: ['auth', 'session'] })
  }

  if (loading) {
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
      <div className="max-w-md mx-auto mt-8 p-6 bg-destructive/5 border border-destructive/30 rounded-lg">
        <div className="flex items-center space-x-2 mb-4">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <h3 className="text-lg font-semibold text-destructive-foreground">Authentication Required</h3>
        </div>
        
        <p className="text-error mb-4">
          {authError || 'You need to be signed in to access this feature.'}
        </p>
        
        <div className="flex space-x-3">
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-error text-white rounded hover:bg-error transition-colors"
          >
            Retry
          </button>
          
          <button
            onClick={() => window.location.href = '/auth/signin'}
            className="px-4 py-2 bg-muted text-white rounded hover:bg-muted transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
