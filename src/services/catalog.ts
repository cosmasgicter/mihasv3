import { apiClient } from './client'

export const catalogService = {
  getPrograms: () => apiClient.request('/catalog/programs'),
  getIntakes: () => apiClient.request('/catalog/intakes'),
  getSubjects: () => apiClient.request('/catalog/subjects')
}

export const programService = {
  list: () => apiClient.request('/catalog/programs'),
  create: (data: { name: string; description?: string; duration_years: number; institution_id: string }) =>
    apiClient.request('/catalog/programs', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  update: (data: { id: string; name: string; description?: string; duration_years: number; institution_id: string }) =>
    apiClient.request('/catalog/programs', {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  delete: (id: string) =>
    apiClient.request('/catalog/programs', {
      method: 'DELETE',
      body: JSON.stringify({ id })
    })
}

export const intakeService = {
  list: () => apiClient.request('/catalog/intakes'),
  create: (data: { name: string; year: number; start_date: string; end_date: string; application_deadline: string; total_capacity: number; available_spots?: number }) =>
    apiClient.request('/catalog/intakes', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  update: (data: { id: string; name: string; year: number; start_date: string; end_date: string; application_deadline: string; total_capacity: number; available_spots?: number }) =>
    apiClient.request('/catalog/intakes', {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  delete: (id: string) =>
    apiClient.request('/catalog/intakes', {
      method: 'DELETE',
      body: JSON.stringify({ id })
    })
}
