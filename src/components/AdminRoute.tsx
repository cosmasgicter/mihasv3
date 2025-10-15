import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useRoleQuery, isAdminRole } from '@/hooks/auth/useRoleQuery'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface AdminRouteProps {
  children: React.ReactNode
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { user, loading } = useAuth()
  const { profile, isLoading: profileLoading } = useProfileQuery()
  const { isAdmin: hasAdminRole, isLoading: roleLoading } = useRoleQuery()
  const isAdmin = hasAdminRole || isAdminRole(profile?.role)

  if (loading || roleLoading || profileLoading) {
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

  // Check admin role
  if (!isAdmin) {
    console.log('❌ Admin access denied for user:', user.email, 'Role:', profile?.role)
    return <Navigate to="/student/dashboard" replace />
  }
  
  console.log('✅ Admin access granted for user:', user.email, 'Role:', profile?.role)

  return <>{children}</>
}