import { apiClient } from './client'

interface Program {
  id: string;
  name: string;
  description?: string;
  duration_years: number;
  institution_id: string;
  institutions?: {
    id: string;
    name: string;
    full_name?: string;
  } | null;
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
  full_name?: string;
  code?: string;
  description?: string;
  is_active?: boolean;
}

export const catalogService = {
  getPrograms: () =>
    apiClient.request<{ programs: Program[] }>('/catalog?type=programs'),
  getIntakes: () =>
    apiClient.request<{ intakes: Intake[] }>('/catalog?type=intakes'),
  getSubjects: () =>
    apiClient.request<{ subjects: Subject[] }>('/catalog?type=subjects'),
  getInstitutions: () =>
    apiClient.request<{ institutions: Institution[] }>('/catalog?type=institutions'),
}

export const programService = {
  list: () =>
    apiClient.request<{ programs: Program[] }>('/catalog?type=programs'),
  create: (data: { name: string; description?: string; duration_years: number; institution_id: string }) =>
    apiClient.request<{ program: Program }>('/catalog?type=programs', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  update: (data: { id: string; name: string; description?: string; duration_years: number; institution_id: string }) =>
    apiClient.request<{ program: Program }>('/catalog?type=programs', {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  delete: (id: string) =>
    apiClient.request<void>('/catalog?type=programs', {
      method: 'DELETE',
      body: JSON.stringify({ id })
    }),
}

export const intakeService = {
  list: () =>
    apiClient.request<{ intakes: Intake[] }>('/catalog?type=intakes'),
  create: (data: { name: string; year: number; start_date: string; end_date: string; application_deadline: string; total_capacity: number; available_spots?: number }) =>
    apiClient.request<{ intake: Intake }>('/catalog?type=intakes', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  update: (data: { id: string; name: string; year: number; start_date: string; end_date: string; application_deadline: string; total_capacity: number; available_spots?: number }) =>
    apiClient.request<{ intake: Intake }>('/catalog?type=intakes', {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  delete: (id: string) =>
    apiClient.request<void>('/catalog?type=intakes', {
      method: 'DELETE',
      body: JSON.stringify({ id })
    }),
}

export const institutionService = {
  list: () =>
    apiClient.request<{ institutions: Institution[] }>('/catalog?type=institutions'),
  create: (data: { name: string; full_name?: string; code?: string; description?: string }) =>
    apiClient.request<{ institution: Institution }>('/catalog?type=institutions', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  update: (data: { id: string; name: string; full_name?: string; code?: string; description?: string; is_active?: boolean }) =>
    apiClient.request<{ institution: Institution }>('/catalog?type=institutions', {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  delete: (id: string) =>
    apiClient.request<void>('/catalog?type=institutions', {
      method: 'DELETE',
      body: JSON.stringify({ id })
    }),
}
