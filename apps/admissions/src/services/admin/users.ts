import { apiClient } from '../client'

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
  list: async () => {
    const response = await apiClient.request<{
      results?: Array<Record<string, any>>
      totalCount?: number
      page?: number
      pageSize?: number
      totalPages?: number
    }>('/admin?action=users')

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
  getById: (_id: string) => Promise.reject(new Error('User detail endpoint is not supported by /api/admin yet')),
  getRole: (_id: string) => Promise.reject(new Error('User role endpoint is not supported by /api/admin yet')),
  getPermissions: async (id: string) => {
    const user = await apiClient.request<Record<string, any>>(`/admin/users/${encodeURIComponent(id)}`, {
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
  create: (data: { email: string; password: string; full_name: string; phone?: string; role: string }) =>
    apiClient.request<AdminUserMutationResult>('/admin?action=register', {
      method: 'POST',
      body: JSON.stringify({
        email: data.email,
        password: data.password,
        phone: data.phone,
        ...splitFullName(data.full_name),
        role: data.role,
      })
    }),
  update: (id: string, data: { full_name: string; email: string; phone?: string; role: string }) =>
    apiClient.request<AdminUserMutationResult>(`/admin/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...splitFullName(data.full_name),
        role: data.role,
      })
    }),
  updatePermissions: async (_id: string, _permissions: string[]) => {
    throw new Error('Fine-grained permission overrides are not implemented in the Django backend yet')
  },
  remove: (id: string) =>
    apiClient.request<AdminUserMutationResult>(`/admin/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: false }),
    }),
}
