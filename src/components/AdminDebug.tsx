import React from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useRoleQuery, isAdminRole } from '@/hooks/auth/useRoleQuery'

export function AdminDebug() {
  const { user } = useAuth()
  const { profile } = useProfileQuery()
  const { userRole, isAdmin: hasAdminRole } = useRoleQuery()
  const isAdmin = hasAdminRole || isAdminRole(profile?.role)

  if (!import.meta.env.DEV) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black/80 text-white p-4 rounded-lg text-xs max-w-sm z-50">
      <div className="font-bold mb-2">🔍 Admin Debug Info</div>
      <div>Email: {user?.email || 'None'}</div>
      <div>Profile Role: {profile?.role || 'None'}</div>
      <div>User Role: {userRole?.role || 'None'}</div>
      <div>Is Admin: {isAdmin ? '✅' : '❌'}</div>
      <div>Dev Mode: {import.meta.env.DEV ? '✅' : '❌'}</div>
    </div>
  )
}