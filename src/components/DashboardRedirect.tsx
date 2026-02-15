import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useRoleQuery, isAdminRole } from '@/hooks/auth/useRoleQuery'
import { Loader2 } from 'lucide-react'

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

    // Strict admin check - only redirect to admin if explicitly admin
    const profileRole = profile?.role?.toLowerCase()
    const isExplicitAdmin = profileRole === 'admin' || 
                           profileRole === 'super_admin' || 
                           profileRole === 'admissions_officer'
    
    if (hasAdminRole && isExplicitAdmin) {
      setRedirectPath('/admin')
      return
    }

    // Default to student dashboard for all other users
    setRedirectPath('/student/dashboard')
  }, [loading, user, profile, profileTimeout, hasAdminRole, redirectPath])

  if (loading || !redirectPath) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-primary/5 to-secondary/5">
        <div className="bg-card rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 border border-border">
          <div className="flex flex-col items-center space-y-6">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full blur-xl opacity-50 animate-pulse" />
              <div className="relative bg-gradient-to-r from-blue-600 to-purple-600 rounded-full p-4">
                <Loader2 className="h-8 w-8 text-white animate-spin" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold text-gray-900">
                {loading ? 'Loading...' : 'Loading your profile...'}
              </h3>
              <p className="text-sm text-caption">Please wait a moment...</p>
            </div>
            <div className="w-full bg-muted rounded-full h-1 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-600 to-purple-600 animate-[loading_2s_ease-in-out_infinite]" style={{ width: '100%' }} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return <Navigate to={redirectPath} replace />
}
