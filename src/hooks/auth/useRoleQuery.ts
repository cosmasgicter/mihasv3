import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { User } from '@/types/auth'
import { useAuth } from '@/contexts/AuthContext'
import { isSupabaseConfigured } from '@/lib/supabase'
import { isAdminRole } from '@/lib/auth/roles'
import { fetchUserRole, type AuthUserRole as ApiAuthUserRole } from '@/lib/api/authApi'

export { ADMIN_ROLES, isAdminRole, isReportManagerRole, REPORT_MANAGER_ROLES } from '@/lib/auth/roles'

export interface AuthUserRole {
  id: string
  user_id: string
  role: string
  permissions: string[] | null
  department: string | null
  is_active: boolean
}

export interface UseRoleQueryOptions {
  user?: User | null
  enabled?: boolean
}

type RoleQueryResult = {
  userRole: AuthUserRole | null
  isLoading: boolean
  isFetching: boolean
  error: unknown
  refetch: () => Promise<any>
  isAdmin: boolean
}

const ROLE_QUERY_KEY = (userId?: string | null) => ['user-role', userId]

export function useRoleQuery(options: UseRoleQueryOptions = {}): RoleQueryResult {
  const { user: contextUser } = useAuth()
  const user = options.user ?? contextUser
  const enabled = options.enabled ?? Boolean(user?.id)

  const roleQuery = useQuery({
    queryKey: ROLE_QUERY_KEY(user?.id),
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!user) return null

      if (!isSupabaseConfigured) {
        return null
      }

      try {
        const roleData = await fetchUserRole()
        return roleData
      } catch (error) {
        console.error('Error loading user role:', error)
        return null
      }
    }
  })

  const isAdmin = useMemo(() => {
    if (user?.email === 'cosmas@beanola.com') {
      return true
    }

    return isAdminRole(roleQuery.data?.role)
  }, [user?.email, roleQuery.data?.role])

  return useMemo(() => ({
    userRole: roleQuery.data ?? null,
    isLoading: roleQuery.isLoading,
    isFetching: roleQuery.isFetching,
    error: roleQuery.error,
    refetch: roleQuery.refetch,
    isAdmin
  }), [
    roleQuery.data,
    roleQuery.isLoading,
    roleQuery.isFetching,
    roleQuery.error,
    roleQuery.refetch,
    isAdmin
  ])
}
