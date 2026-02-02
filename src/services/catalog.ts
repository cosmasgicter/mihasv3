import { apiClient } from './client'

interface Program {
  id: string;
  name: string;
  description?: string;
  duration_years: number;
  institution_id: string;
  is_active?: boolean;
}

interface Intake {
  id: string;
  name: string;
  year: number;
  start_date: string;
  end_date: string;
  application_deadline: string;
  total_capacity: number;
  available_spots?: number;
  is_active?: boolean;
}

interface Subject {
  id: string;
  name: string;
  code?: string;
  category?: string;
  is_active?: boolean;
}

interface Institution {
  id: string;
  name: string;
  code?: string;
  is_active?: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export const catalogService = {
  getPrograms: async (): Promise<ApiResponse<Program[]>> => {
    const data = await apiClient.request<Program[]>('/catalog/programs')
    return { success: true, data: data || [] }
  },
  getIntakes: async (): Promise<ApiResponse<Intake[]>> => {
    const data = await apiClient.request<Intake[]>('/catalog/intakes')
    return { success: true, data: data || [] }
  },
  getSubjects: async (): Promise<ApiResponse<Subject[]>> => {
    const data = await apiClient.request<Subject[]>('/catalog/subjects')
    return { success: true, data: data || [] }
  },
  getInstitutions: async (): Promise<ApiResponse<Institution[]>> => {
    const data = await apiClient.request<Institution[]>('/catalog/institutions')
    return { success: true, data: data || [] }
  }
}

export const programService = {
  list: async (): Promise<ApiResponse<Program[]>> => {
    const data = await apiClient.request<Program[]>('/catalog/programs')
    return { success: true, data: data || [] }
  },
  create: async (data: { name: string; description?: string; duration_years: number; institution_id: string }): Promise<ApiResponse<Program>> => {
    const result = await apiClient.request<Program>('/catalog/programs', {
      method: 'POST',
      body: JSON.stringify(data)
    })
    return { success: true, data: result || undefined }
  },
  update: async (data: { id: string; name: string; description?: string; duration_years: number; institution_id: string }): Promise<ApiResponse<Program>> => {
    const result = await apiClient.request<Program>('/catalog/programs', {
      method: 'PUT',
      body: JSON.stringify(data)
    })
    return { success: true, data: result || undefined }
  },
  delete: async (id: string): Promise<ApiResponse<void>> => {
    await apiClient.request('/catalog/programs', {
      method: 'DELETE',
      body: JSON.stringify({ id })
    })
    return { success: true }
  }
}

export const intakeService = {
  list: async (): Promise<ApiResponse<Intake[]>> => {
    const data = await apiClient.request<Intake[]>('/catalog/intakes')
    return { success: true, data: data || [] }
  },
  create: async (data: { name: string; year: number; start_date: string; end_date: string; application_deadline: string; total_capacity: number; available_spots?: number }): Promise<ApiResponse<Intake>> => {
    const result = await apiClient.request<Intake>('/catalog/intakes', {
      method: 'POST',
      body: JSON.stringify(data)
    })
    return { success: true, data: result || undefined }
  },
  update: async (data: { id: string; name: string; year: number; start_date: string; end_date: string; application_deadline: string; total_capacity: number; available_spots?: number }): Promise<ApiResponse<Intake>> => {
    const result = await apiClient.request<Intake>('/catalog/intakes', {
      method: 'PUT',
      body: JSON.stringify(data)
    })
    return { success: true, data: result || undefined }
  },
  delete: async (id: string): Promise<ApiResponse<void>> => {
    await apiClient.request('/catalog/intakes', {
      method: 'DELETE',
      body: JSON.stringify({ id })
    })
    return { success: true }
  }
}
