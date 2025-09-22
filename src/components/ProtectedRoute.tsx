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
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth/signin" replace />
  }

  return <>{children}</>
}