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

export const catalogService = {
  getPrograms: () =>
    apiClient.request<{ programs: Program[] }>('/catalog/programs'),
  getIntakes: () =>
    apiClient.request<{ intakes: Intake[] }>('/catalog/intakes'),
  getSubjects: () =>
    apiClient.request<{ subjects: Subject[] }>('/catalog/subjects'),
  getInstitutions: () =>
    apiClient.request<{ institutions: Institution[] }>('/catalog/institutions'),
}

export const programService = {
  list: () =>
    apiClient.request<{ programs: Program[] }>('/catalog/programs'),
  create: (data: { name: string; description?: string; duration_years: number; institution_id: string }) =>
    apiClient.request<Program>('/catalog/programs', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  update: (data: { id: string; name: string; description?: string; duration_years: number; institution_id: string }) =>
    apiClient.request<Program>('/catalog/programs', {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  delete: (id: string) =>
    apiClient.request<void>('/catalog/programs', {
      method: 'DELETE',
      body: JSON.stringify({ id })
    }),
}

export const intakeService = {
  list: () =>
    apiClient.request<{ intakes: Intake[] }>('/catalog/intakes'),
  create: (data: { name: string; year: number; start_date: string; end_date: string; application_deadline: string; total_capacity: number; available_spots?: number }) =>
    apiClient.request<Intake>('/catalog/intakes', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  update: (data: { id: string; name: string; year: number; start_date: string; end_date: string; application_deadline: string; total_capacity: number; available_spots?: number }) =>
    apiClient.request<Intake>('/catalog/intakes', {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  delete: (id: string) =>
    apiClient.request<void>('/catalog/intakes', {
      method: 'DELETE',
      body: JSON.stringify({ id })
    }),
}
