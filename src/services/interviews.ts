import { apiClient } from './client'

export interface Interview {
  id: string
  application_id: string
  scheduled_at: string
  mode: 'in_person' | 'virtual' | 'phone'
  location?: string
  status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled'
  notes?: string
  created_by: string
  updated_by?: string
  created_at: string
  updated_at: string
}

export interface ScheduleInterviewData {
  application_id: string
  scheduled_at: string
  mode: 'in_person' | 'virtual' | 'phone'
  location?: string
  notes?: string
}

export const interviewsService = {
  schedule: (data: ScheduleInterviewData) =>
    apiClient.request<Interview>('/interview/schedule', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  list: (applicationId?: string) =>
    apiClient.request<Interview[]>(
      `/interview/schedule${applicationId ? `?application_id=${applicationId}` : ''}`
    ),

  sendReminders: () =>
    apiClient.request<{ success: boolean; processed: number }>('/interview/reminders')
}
