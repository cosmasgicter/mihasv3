import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from './useProfileQuery'
import { useRoleQuery } from './useRoleQuery'

export function useRoleVerification() {
  const { user } = useAuth()
  const { profile } = useProfileQuery()
  const { userRole, isAdmin } = useRoleQuery()
  const [roleStatus, setRoleStatus] = useState<'checking' | 'verified' | 'mismatch'>('checking')

  useEffect(() => {
    if (!user || !profile) {
      setRoleStatus('checking')
      return
    }

    const profileRole = profile.role
    const authRole = userRole?.role

    // Super admin override - no mismatch for cosmas@beanola.com
    if (user.email === 'cosmas@beanola.com') {
      setRoleStatus('verified')
      return
    }

    if (authRole && profileRole && authRole !== profileRole) {
      setRoleStatus('mismatch')
    } else {
      setRoleStatus('verified')
    }
  }, [user, profile, userRole])

  return {
    roleStatus,
    profileRole: profile?.role,
    authRole: userRole?.role,
    isAdmin,
    hasRoleData: !!(profile?.role || userRole?.role)
  }
}
