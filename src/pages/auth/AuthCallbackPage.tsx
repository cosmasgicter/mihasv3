import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    let timeoutId: NodeJS.Timeout

    const handleAuthCallback = async () => {
      try {
        // Get the hash fragment from the URL
        const hashFragment = window.location.hash

        if (hashFragment && hashFragment.length > 0) {
          // Exchange the auth code for a session
          const { data, error } = await supabase.auth.exchangeCodeForSession(hashFragment)

          if (error) {
            console.error('Error exchanging code for session:', error.message)
            setError(error.message)
            timeoutId = setTimeout(() => {
              navigate('/auth/signin?error=' + encodeURIComponent(error.message))
            }, 3000)
            return
          }

          if (data.session) {
            // Successfully signed in, redirect to dashboard
            navigate('/dashboard')
            return
          }
        }

        // If we get here, something went wrong
        setError('No session found')
        timeoutId = setTimeout(() => {
          navigate('/auth/signin?error=No session found')
        }, 3000)
      } catch (error: unknown) {
        console.error('Auth callback error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Authentication failed'
        setError(errorMessage)
        timeoutId = setTimeout(() => {
          navigate('/auth/signin?error=' + encodeURIComponent(errorMessage))
        }, 3000)
      }
    }

    handleAuthCallback()

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [navigate])

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-secondary mb-2">Authentication Failed</h3>
              <p className="text-sm text-secondary mb-4">{error}</p>
              <p className="text-xs text-secondary">Redirecting to sign in page...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="text-center">
            <LoadingSpinner size="lg" className="mx-auto mb-4" />
            <h3 className="text-lg font-medium text-secondary mb-2">Completing Authentication</h3>
            <p className="text-sm text-secondary">Please wait while we verify your account...</p>
          </div>
        </div>
      </div>
    </div>
  )
}