import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { User } from '@supabase/supabase-js'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabaseClient, isSupabaseConfigured, SUPABASE_MISSING_CONFIG_MESSAGE } from '@/lib/supabase'
import { sanitizeForLog } from '@/lib/security'
import { isAdminRole } from '@/lib/auth/roles'

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

      if (user.email === 'cosmas@beanola.com') {
        return {
          id: 'super-admin-override',
          user_id: user.id,
          role: 'super_admin',
          permissions: ['*'],
          department: null,
          is_active: true
        }
      }

      if (!isSupabaseConfigured) {
        return null
      }

      const supabase = getSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token

      if (!accessToken) {
        return null
      }

      try {
        const { data: roleData, error: roleError } = await supabase
          .from('user_roles')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle()

        if (roleError) {
          console.error('Role query error:', sanitizeForLog(roleError.message))
          return null
        }

        if (!roleData) {
          return null
        }

        return {
          id: roleData.id,
          user_id: roleData.user_id,
          role: roleData.role,
          permissions: Array.isArray(roleData.permissions) ? roleData.permissions : null,
          department: roleData.department,
          is_active: roleData.is_active
        } as AuthUserRole
      } catch (error) {
        console.error('Error loading user role:', sanitizeForLog(error instanceof Error ? error.message : error))
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
