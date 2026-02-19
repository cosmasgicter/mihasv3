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
  getPermissions: (_id: string) => Promise.reject(new Error('User permissions endpoint is not supported by /api/admin yet')),
  create: (data: { email: string; password: string; full_name: string; phone?: string; role: string }) =>
    apiClient.request('/api/admin?action=register', {
      method: 'POST',
      body: JSON.stringify({
        email: data.email,
        password: data.password,
        ...splitFullName(data.full_name),
        role: data.role,
      })
    }),
  update: (_id: string, _data: { full_name: string; email: string; phone?: string; role: string }) =>
    Promise.reject(new Error('User update is not supported by /api/admin yet')),
  updatePermissions: (_id: string, _permissions: string[]) =>
    Promise.reject(new Error('User permissions update is not supported by /api/admin yet')),
  remove: (_id: string) => Promise.reject(new Error('User delete is not supported by /api/admin yet')),
}
