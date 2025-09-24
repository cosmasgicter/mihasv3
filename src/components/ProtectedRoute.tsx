import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { supabase } from '@/lib/supabase'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth()
  const [sessionChecked, setSessionChecked] = useState(false)

  useEffect(() => {
    // Double-check session on mount
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          console.log('Session validated in ProtectedRoute')
        }
      } catch (error) {
        console.error('Session check failed:', error)
      } finally {
        setSessionChecked(true)
      }
    }
    
    if (!loading) {
      checkSession()
    }
  }, [loading])

  if (loading || !sessionChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center p-8 bg-white rounded-xl shadow-lg border border-gray-200 max-w-md mx-4">
          <LoadingSpinner size="lg" message="Verifying your session..." />
          <p className="mt-4 text-sm text-gray-600">Please wait while we authenticate you</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth/signin" replace />
  }

  return <>{children}</>
}