import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { logger } from '@/utils/logger'
import { UnifiedLoader } from '@/components/ui/UnifiedLoader'

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    let timeoutId: NodeJS.Timeout

    const handleAuthCallback = async () => {
      try {
        // Get the hash fragment or query params from the URL
        const hashFragment = window.location.hash
        const searchParams = new URLSearchParams(window.location.search)
        const token = searchParams.get('token') || hashFragment.replace('#', '')

        if (token && token.length > 0) {
          // Exchange the auth code for a session via our custom API
          const response = await fetch('/api/auth?action=callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ token })
          })

          const result = await response.json()

          if (!result.success) {
            logger.error('Error exchanging code for session:', result.error)
            setError(result.error || 'Authentication failed')
            timeoutId = setTimeout(() => {
              navigate('/auth/signin?error=' + encodeURIComponent(result.error || 'Authentication failed'))
            }, 3000)
            return
          }

          // Successfully signed in, redirect to dashboard
          navigate('/dashboard')
          return
        }

        // If we get here, something went wrong
        setError('No session found')
        timeoutId = setTimeout(() => {
          navigate('/auth/signin?error=No session found')
        }, 3000)
      } catch (error: unknown) {
        logger.error('Auth callback error:', error)
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
      <div className="page-container bg-muted flex flex-col justify-center py-6 sm:py-12">
        <div className="content-wrapper">
          <div className="mx-auto w-full max-w-md">
          <div className="bg-card py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-destructive/10 mb-4">
                <svg className="h-6 w-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Authentication Failed</h3>
              <p className="text-sm text-foreground mb-4">{error}</p>
              <p className="text-xs text-foreground">Redirecting to sign in page...</p>
            </div>
          </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container bg-muted flex flex-col justify-center py-6 sm:py-12">
      <div className="content-wrapper">
        <div className="mx-auto w-full max-w-md">
        <div className="bg-card py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="text-center">
            <UnifiedLoader variant="inline" size="lg" className="mx-auto mb-4" label="Completing authentication" />
            <h3 className="text-lg font-medium text-foreground mb-2">Completing Authentication</h3>
            <p className="text-sm text-foreground">Please wait while we verify your account...</p>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}