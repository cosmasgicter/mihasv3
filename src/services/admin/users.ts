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

export const userService = {
  list: async () => {
    const response = await apiClient.request<{
      users?: Array<Record<string, any>>
      totalCount?: number
      page?: number
      pageSize?: number
      totalPages?: number
    }>('/api/admin?action=users')

    const users = (response?.users || []).map((user) => ({
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
    return apiClient.request<AdminUserPermissionsResult>(`/api/admin?action=user-permissions&userId=${encodeURIComponent(id)}`)
  },
  create: (data: { email: string; password: string; full_name: string; phone?: string; role: string }) =>
    apiClient.request<AdminUserMutationResult>('/api/admin?action=register', {
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
    apiClient.request<AdminUserMutationResult>('/api/admin?action=users', {
      method: 'PUT',
      body: JSON.stringify({
        userId: id,
        full_name: data.full_name,
        email: data.email,
        phone: data.phone,
        role: data.role,
      })
    }),
  updatePermissions: (id: string, permissions: string[]) =>
    apiClient.request<AdminUserPermissionsResult>('/api/admin?action=user-permissions', {
      method: 'PUT',
      body: JSON.stringify({
        userId: id,
        permissions,
      })
    }),
  remove: (id: string) =>
    apiClient.request<AdminUserMutationResult>(`/api/admin?action=users&userId=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
}
