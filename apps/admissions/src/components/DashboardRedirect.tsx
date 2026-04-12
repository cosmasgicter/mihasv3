import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { GuardInlineSkeleton } from '@/components/ui/GuardInlineSkeleton'

export function DashboardRedirect() {
  const { user, loading, isAdmin } = useAuth()
  const [redirectPath, setRedirectPath] = useState<string | null>(null)

  // Determine redirect path only once when conditions are met
  useEffect(() => {
    if (loading || redirectPath) return
    
    if (!user) {
      setRedirectPath('/auth/signin')
      return
    }

    // Strict admin check - only redirect to admin if explicitly admin
    if (isAdmin) {
      setRedirectPath('/admin')
      return
    }

    // Default to student dashboard for all other users
    setRedirectPath('/student/dashboard')
  }, [loading, user, isAdmin, redirectPath])

  if (loading || !redirectPath) {
    return <GuardInlineSkeleton label={loading ? 'Preparing your dashboard' : 'Opening your dashboard'} />
  }

  return <Navigate to={redirectPath} replace />
}
