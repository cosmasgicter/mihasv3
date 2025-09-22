import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useRoleQuery, isAdminRole } from '@/hooks/auth/useRoleQuery'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { supabase } from '@/lib/supabase'

interface AdminRouteProps {
  children: React.ReactNode
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { user, loading } = useAuth()
  const { profile, isLoading: profileLoading } = useProfileQuery()
  const { isAdmin: hasAdminRole, isLoading: roleLoading } = useRoleQuery()
  const isAdmin = hasAdminRole || isAdminRole(profile?.role)
  const [sessionChecked, setSessionChecked] = useState(false)

  useEffect(() => {
    // Double-check session on mount
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          console.log('Session validated in AdminRoute')
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

  if (loading || roleLoading || profileLoading || !sessionChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth/signin" replace />
  }

  // Super admin override
  if (user?.email === 'cosmas@beanola.com') {
    return <>{children}</>
  }

  // Development mode - allow any authenticated user to access admin
  if (import.meta.env.DEV) {
    console.log('🔧 Development mode: Allowing admin access for user:', user.email)
    return <>{children}</>
  }

  // Production mode - check admin role
  if (!isAdmin) {
    console.log('❌ Admin access denied for user:', user.email, 'Role:', profile?.role)
    return <Navigate to="/student/dashboard" replace />
  }

  return <>{children}</>
}