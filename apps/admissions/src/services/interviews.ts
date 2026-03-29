import { apiClient, buildQueryString } from './client'

export type InterviewMode = 'in_person' | 'virtual' | 'phone'
export type InterviewStatus = 'scheduled' | 'completed' | 'cancelled' | 'rescheduled'

export interface Interview {
  id: string
  application_id: string
  scheduled_at: string
  mode: InterviewMode
  location: string | null
  status: InterviewStatus
  notes: string | null
  program?: string | null
  application_number?: string | null
}

export interface ScheduleInterviewData {
  applicationId?: string
  /** @deprecated Use applicationId instead. */
  application_id?: string
  scheduled_at: string
  mode: InterviewMode
  location: string
  notes?: string
}

export interface ScheduleInterviewResponse {
  interview: Interview
}

export interface ListInterviewsResponse {
  interviews: Interview[]
}

export const interviewsService = {
  schedule: (data: ScheduleInterviewData) => {
    const applicationId = data.applicationId ?? data.application_id

    return apiClient.request<ScheduleInterviewResponse>(
      '/applications?action=schedule-interview',
      {
        method: 'POST',
        body: JSON.stringify({
          applicationId,
          scheduled_at: data.scheduled_at,
          mode: data.mode,
          location: data.location,
          notes: data.notes
        })
      }
    )
  },

  list: (applicationId?: string) =>
    apiClient.request<ListInterviewsResponse>(
      `/applications${buildQueryString({
        action: 'interviews',
        ...(applicationId ? { applicationId } : {})
      })}`
    )
}
