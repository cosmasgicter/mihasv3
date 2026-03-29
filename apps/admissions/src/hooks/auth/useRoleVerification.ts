import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from './useProfileQuery'

export function useRoleVerification() {
  const { user, isAdmin } = useAuth()
  const { profile } = useProfileQuery()
  const [roleStatus, setRoleStatus] = useState<'checking' | 'verified' | 'mismatch'>('checking')

  useEffect(() => {
    if (!user || !profile) {
      setRoleStatus('checking')
      return
    }

    const profileRole = profile.role
    const authRole = user?.role as string | undefined

    if (authRole && profileRole && authRole !== profileRole) {
      setRoleStatus('mismatch')
    } else {
      setRoleStatus('verified')
    }
  }, [user, profile])

  return {
    roleStatus,
    profileRole: profile?.role,
    authRole: user?.role as string | undefined,
    isAdmin,
    hasRoleData: !!(profile?.role || user?.role)
  }
}
