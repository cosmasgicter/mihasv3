import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { GuardInlineSkeleton } from '@/components/ui/GuardInlineSkeleton'

export function DashboardRedirect() {
  const { user, loading, isAdmin } = useAuth()
  const [redirectPath, setRedirectPath] = useState<string | null>(null)
  const [nullUserTimeout, setNullUserTimeout] = useState(false)

  // Short timeout before allowing redirect to signin when user is null
  useEffect(() => {
    if (!loading && !user) {
      const timer = setTimeout(() => setNullUserTimeout(true), 500)
      return () => clearTimeout(timer)
    }
  }, [loading, user])

  // Determine redirect path only once when conditions are met
  useEffect(() => {
    if (loading || redirectPath) return
    
    if (!user) {
      if (!nullUserTimeout) return
      setRedirectPath('/auth/signin')
      return
    }

    if (isAdmin) {
      setRedirectPath('/admin')
      return
    }

    setRedirectPath('/student/dashboard')
  }, [loading, user, isAdmin, redirectPath, nullUserTimeout])

  if (loading || !redirectPath) {
    return <GuardInlineSkeleton label={loading ? 'Preparing your dashboard' : 'Opening your dashboard'} />
  }

  return <Navigate to={redirectPath} replace />
}
