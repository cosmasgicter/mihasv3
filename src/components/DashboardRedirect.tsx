import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useRoleQuery, isAdminRole } from '@/hooks/auth/useRoleQuery'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export function DashboardRedirect() {
  const { user, loading } = useAuth()
  const { profile } = useProfileQuery()
  const { isAdmin: hasAdminRole } = useRoleQuery()
  const [profileTimeout, setProfileTimeout] = useState(false)
  const [redirectPath, setRedirectPath] = useState<string | null>(null)

  // Set timeout for profile loading
  useEffect(() => {
    if (!loading && user && !profile && !profileTimeout) {
      const timer = setTimeout(() => {
        setProfileTimeout(true)
      }, 2000) // 2 second timeout for profile loading
      
      return () => clearTimeout(timer)
    }
  }, [loading, user, profile, profileTimeout])

  // Determine redirect path only once when conditions are met
  useEffect(() => {
    if (loading || redirectPath) return
    
    if (!user) {
      setRedirectPath('/auth/signin')
      return
    }

    // Wait for profile to load or timeout
    if (!profile && !profileTimeout) return

    // Super admin override
    if (user?.email === 'cosmas@beanola.com') {
      setRedirectPath('/admin')
      return
    }

    // Check if user has admin role
    if (hasAdminRole || isAdminRole(profile?.role)) {
      setRedirectPath('/admin')
      return
    }

    // Default to student dashboard
    setRedirectPath('/student/dashboard')
  }, [loading, user, profile, profileTimeout, hasAdminRole, redirectPath])

  if (loading || !redirectPath) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600">
            {loading ? 'Loading...' : 'Loading your profile...'}
          </p>
        </div>
      </div>
    )
  }

  return <Navigate to={redirectPath} replace />
}
