import { apiClient } from '../client'

export const userService = {
  list: async () => {
    const response = await apiClient.request<{users?: any[]}>('/admin/users')
    return { users: response?.users || [] }
  },
  getById: (id: string) => apiClient.request(`/admin/users/${encodeURIComponent(id)}`),
  getRole: (id: string) => apiClient.request(`/admin/users/${encodeURIComponent(id)}/role`),
  getPermissions: (id: string) => apiClient.request(`/admin/users/${encodeURIComponent(id)}/permissions`),
  create: (data: { email: string; password: string; full_name: string; phone?: string; role: string }) =>
    apiClient.request('/admin/users', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  update: (id: string, data: { full_name: string; email: string; phone?: string; role: string }) =>
    apiClient.request(`/admin/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  updatePermissions: (id: string, permissions: string[]) =>
    apiClient.request(`/admin/users/${encodeURIComponent(id)}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions })
    }),
  remove: (id: string) =>
    apiClient.request(`/admin/users/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    })
}
