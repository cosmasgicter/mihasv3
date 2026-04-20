import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { logger } from '@/lib/logger'
import { AuthSkeleton } from '@/components/ui'

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    let timeoutId: number | undefined

    const handleAuthCallback = async () => {
      const hashFragment = window.location.hash
      const searchParams = new URLSearchParams(window.location.search)
      const token = searchParams.get('token') || searchParams.get('access_token') || searchParams.get('code') || hashFragment.replace('#', '')
      const errorMessage = token
        ? 'External authentication callbacks are not configured in the Django backend.'
        : 'No session found'

      logger.warn('Auth callback route is unavailable in the Django backend', {
        hasToken: Boolean(token),
      })

      setError(errorMessage)
      timeoutId = window.setTimeout(() => {
        navigate('/auth/signin?error=' + encodeURIComponent(errorMessage))
      }, 3000)
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
      <div className="min-h-screen bg-muted flex flex-col justify-center py-6 sm:py-12">
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
    <AuthSkeleton />
  )
}
