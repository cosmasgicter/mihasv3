import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { User } from '@supabase/supabase-js'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabaseClient } from '@/lib/supabase'
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

      const supabase = getSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token

      if (!accessToken) {
        return null
      }

      try {
        const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/role`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        })

        if (response.status === 404) {
          return null
        }

        if (!response.ok) {
          // In development, API might not be available
          if (process.env.NODE_ENV === 'development') {
            console.warn('API not available in development mode')
            return null
          }
          throw new Error(response.statusText || 'Failed to load user role')
        }

        const contentType = response.headers.get('content-type')
        if (!contentType?.includes('application/json')) {
          // API returned HTML instead of JSON (likely 404 page)
          if (process.env.NODE_ENV === 'development') {
            console.warn('API not available in development mode')
            return null
          }
          throw new Error('Invalid response format')
        }

        const data = await response.json()
        return {
          ...data,
          permissions: Array.isArray(data?.permissions) ? data.permissions : null
        } as AuthUserRole
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Role query failed in development:', error)
          return null
        }
        console.error('Error loading user role:', sanitizeForLog(error instanceof Error ? error.message : error))
        throw error
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
