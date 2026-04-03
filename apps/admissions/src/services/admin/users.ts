import { apiClient, buildQueryString } from '../client'
import { logApiError } from '@/lib/apiErrorLogger'

const splitFullName = (fullName: string): { firstName: string; lastName: string } => {
  const normalized = fullName.trim().replace(/\s+/g, ' ')
  if (!normalized) {
    return { firstName: '', lastName: '' }
  }

  const [firstName, ...rest] = normalized.split(' ')
  return {
    firstName: firstName ?? '',
    lastName: rest.join(' ') || (firstName ?? ''),
  }
}

export interface AdminUserRecord {
  id: string
  user_id?: string
  email: string
  first_name?: string
  last_name?: string
  full_name: string
  phone?: string
  role: string
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export interface AdminUserMutationResult {
  user?: AdminUserRecord
  revokedSessions?: number
  message?: string
}

export interface AdminUserListResult {
  users: AdminUserRecord[]
  totalCount: number
  page?: number
  pageSize?: number
  totalPages?: number
}

export interface AdminUserPermissionsResult {
  userId: string
  role: string
  permissions: string[]
  defaultPermissions?: string[]
  source: string
  revokedSessions?: number
}

const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['users:read', 'users:write', 'applications:read', 'applications:write', 'settings:write', 'audit:read'],
  admin: ['users:read', 'applications:read', 'applications:write', 'settings:read', 'audit:read'],
  reviewer: ['applications:read'],
  student: [],
}

export const userService = {
  /** List users with pagination. Maps to GET /admin/users/ */
  list: async (filters?: { page?: number; pageSize?: number; search?: string; role?: string }): Promise<AdminUserListResult> => {
    const params: Record<string, string> = {}
    if (filters?.page) params.page = String(filters.page)
    if (filters?.pageSize) params.pageSize = String(filters.pageSize)
    if (filters?.search) params.search = filters.search
    if (filters?.role) params.role = filters.role

    const qs = buildQueryString(params)
    try {
      const response = await apiClient.request<{
        results?: Array<Partial<AdminUserRecord>>
        totalCount?: number
        page?: number
        pageSize?: number
        totalPages?: number
      }>(`/admin/users/${qs}`)

      const users = (response?.results || []).map((user) => ({
        ...user,
        id: String(user.id ?? ''),
        full_name:
          user.full_name ||
          [user.first_name, user.last_name].filter(Boolean).join(' ').trim(),
        email: String(user.email ?? ''),
        role: typeof user.role === 'string' ? user.role : 'student',
      })) as AdminUserRecord[]

      return {
        users,
        totalCount: response?.totalCount ?? users.length,
        page: response?.page,
        pageSize: response?.pageSize,
        totalPages: response?.totalPages,
      }
    } catch (error) {
      logApiError('admin-users', '/api/v1/admin/users/', error)
      throw error
    }
  },

  /** Get a single user by ID. Maps to GET /admin/users/{id}/ */
  getById: async (id: string) => {
    try {
      return await apiClient.request<AdminUserRecord>(`/admin/users/${encodeURIComponent(id)}/`, {
        method: 'GET',
      })
    } catch (error) {
      logApiError('admin-users', `/api/v1/admin/users/${id}/`, error)
      throw error
    }
  },

  /** Get user permissions (derived from role). Maps to GET /admin/users/{id}/ */
  getPermissions: async (id: string): Promise<AdminUserPermissionsResult> => {
    try {
      const user = await apiClient.request<AdminUserRecord>(`/admin/users/${encodeURIComponent(id)}/`, {
        method: 'GET',
      })
      const role = typeof user?.role === 'string' ? user.role : 'student'
      return {
        userId: id,
        role,
        permissions: ROLE_PERMISSIONS[role] ?? [],
        defaultPermissions: ROLE_PERMISSIONS[role] ?? [],
        source: 'derived-from-role',
      }
    } catch (error) {
      logApiError('admin-users', `/api/v1/admin/users/${id}/`, error)
      throw error
    }
  },

  /** Update user permissions (role-based). Maps to PUT /admin/users/{id}/ */
  updatePermissions: async (id: string, permissions: string[]): Promise<AdminUserPermissionsResult> => {
    // Permissions are role-based in the Django backend; find the matching role
    const matchingRole = Object.entries(ROLE_PERMISSIONS).find(
      ([, perms]) => JSON.stringify(perms.sort()) === JSON.stringify([...permissions].sort())
    )
    const role = matchingRole?.[0] ?? 'student'

    try {
      await apiClient.request<AdminUserMutationResult>(`/admin/users/${encodeURIComponent(id)}/`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      })

      return {
        userId: id,
        role,
        permissions: ROLE_PERMISSIONS[role] ?? [],
        defaultPermissions: ROLE_PERMISSIONS[role] ?? [],
        source: 'derived-from-role',
      }
    } catch (error) {
      logApiError('admin-users', `/api/v1/admin/users/${id}/`, error)
      throw error
    }
  },

  /** Create a new user. Maps to POST /admin/users/ */
  create: async (data: { email: string; password: string; full_name: string; phone?: string; role: string }) => {
    try {
      return await apiClient.request<AdminUserMutationResult>('/admin/users/', {
        method: 'POST',
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          phone: data.phone,
          ...splitFullName(data.full_name),
          role: data.role,
        }),
      })
    } catch (error) {
      logApiError('admin-users', '/api/v1/admin/users/', error)
      throw error
    }
  },

  /** Update a user. Maps to PATCH /admin/users/{id}/ */
  update: async (id: string, data: { full_name: string; email: string; phone?: string; role: string }) => {
    try {
      return await apiClient.request<AdminUserMutationResult>(`/admin/users/${encodeURIComponent(id)}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...splitFullName(data.full_name),
          email: data.email,
          phone: data.phone,
          role: data.role,
        }),
      })
    } catch (error) {
      logApiError('admin-users', `/api/v1/admin/users/${id}/`, error)
      throw error
    }
  },

  /** Deactivate a user. Maps to PATCH /admin/users/{id}/ */
  remove: async (id: string) => {
    try {
      return await apiClient.request<AdminUserMutationResult>(`/admin/users/${encodeURIComponent(id)}/`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: false }),
      })
    } catch (error) {
      logApiError('admin-users', `/api/v1/admin/users/${id}/`, error)
      throw error
    }
  },

  /** Export users as CSV. Maps to GET /admin/users/export/ */
  export: async () => {
    try {
      return await apiClient.request('/admin/users/export/', {
        method: 'GET',
      })
    } catch (error) {
      logApiError('admin-users', '/api/v1/admin/users/export/', error)
      throw error
    }
  },
}
