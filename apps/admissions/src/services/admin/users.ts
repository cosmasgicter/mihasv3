import { apiClient, buildQueryString } from '../client'

const splitFullName = (fullName: string): { firstName: string; lastName: string } => {
  const normalized = fullName.trim().replace(/\s+/g, ' ')
  if (!normalized) {
    return { firstName: '', lastName: '' }
  }

  const [firstName, ...rest] = normalized.split(' ')
  return {
    firstName,
    lastName: rest.join(' ') || firstName,
  }
}

export interface AdminUserMutationResult {
  user?: Record<string, any>
  revokedSessions?: number
  message?: string
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
  list: async (filters?: { page?: number; pageSize?: number; search?: string; role?: string }) => {
    const params: Record<string, string> = {}
    if (filters?.page) params.page = String(filters.page)
    if (filters?.pageSize) params.pageSize = String(filters.pageSize)
    if (filters?.search) params.search = filters.search
    if (filters?.role) params.role = filters.role

    const qs = buildQueryString(params)
    const response = await apiClient.request<{
      results?: Array<Record<string, any>>
      totalCount?: number
      page?: number
      pageSize?: number
      totalPages?: number
    }>(`/admin/users/${qs}`)

    const users = (response?.results || []).map((user) => ({
      ...user,
      full_name:
        user.full_name ||
        [user.first_name, user.last_name].filter(Boolean).join(' ').trim(),
    }))

    return {
      users,
      totalCount: response?.totalCount ?? users.length,
      page: response?.page,
      pageSize: response?.pageSize,
      totalPages: response?.totalPages,
    }
  },

  /** Get a single user by ID. Maps to GET /admin/users/{id}/ */
  getById: (id: string) =>
    apiClient.request<Record<string, any>>(`/admin/users/${encodeURIComponent(id)}/`, {
      method: 'GET',
    }),

  /** Get user permissions (derived from role). Maps to GET /admin/users/{id}/ */
  getPermissions: async (id: string): Promise<AdminUserPermissionsResult> => {
    const user = await apiClient.request<Record<string, any>>(`/admin/users/${encodeURIComponent(id)}/`, {
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
  },

  /** Update user permissions (role-based). Maps to PUT /admin/users/{id}/ */
  updatePermissions: async (id: string, permissions: string[]): Promise<AdminUserPermissionsResult> => {
    // Permissions are role-based in the Django backend; find the matching role
    const matchingRole = Object.entries(ROLE_PERMISSIONS).find(
      ([, perms]) => JSON.stringify(perms.sort()) === JSON.stringify([...permissions].sort())
    )
    const role = matchingRole?.[0] ?? 'student'

    await apiClient.request<AdminUserMutationResult>(`/admin/users/${encodeURIComponent(id)}/`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    })

    return {
      userId: id,
      role,
      permissions: ROLE_PERMISSIONS[role] ?? [],
      defaultPermissions: ROLE_PERMISSIONS[role] ?? [],
      source: 'derived-from-role',
    }
  },

  /** Create a new user. Maps to POST /admin/users/ */
  create: (data: { email: string; password: string; full_name: string; phone?: string; role: string }) =>
    apiClient.request<AdminUserMutationResult>('/admin/users/', {
      method: 'POST',
      body: JSON.stringify({
        email: data.email,
        password: data.password,
        phone: data.phone,
        ...splitFullName(data.full_name),
        role: data.role,
      }),
    }),

  /** Update a user. Maps to PUT /admin/users/{id}/ */
  update: (id: string, data: { full_name: string; email: string; phone?: string; role: string }) =>
    apiClient.request<AdminUserMutationResult>(`/admin/users/${encodeURIComponent(id)}/`, {
      method: 'PUT',
      body: JSON.stringify({
        ...splitFullName(data.full_name),
        email: data.email,
        phone: data.phone,
        role: data.role,
      }),
    }),

  /** Remove (delete) a user. Maps to DELETE /admin/users/{id}/ */
  remove: (id: string) =>
    apiClient.request<AdminUserMutationResult>(`/admin/users/${encodeURIComponent(id)}/`, {
      method: 'DELETE',
    }),

  /** Export users as CSV. Maps to GET /admin/users/export/ */
  export: () =>
    apiClient.request('/admin/users/export/', {
      method: 'GET',
    }),
}
