/**
 * Interviews Service
 * Manages interview scheduling and listing for applications
 *
 * Django REST paths (no /api/v1/ prefix — apiClient prepends it):
 *   POST /applications/{id}/interviews/  → schedule an interview
 *   GET  /applications/{id}/interviews/  → list interviews for an application
 */
import { applicationService } from './applications'
import { apiClient } from './client'

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
  applicationId: string
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
  schedule: async (data: ScheduleInterviewData) => {
    const { applicationId } = data
    if (!applicationId) {
      throw new Error('Application ID is required to schedule an interview')
    }

    const interview = await apiClient.request<Interview>(
      `/applications/${encodeURIComponent(applicationId)}/interviews/`,
      {
        method: 'POST',
        body: JSON.stringify({
          scheduled_at: data.scheduled_at,
          mode: data.mode,
          location: data.location,
          notes: data.notes
        })
      }
    )

    if (!interview) {
      throw new Error('Interview scheduling did not return interview data')
    }

    return { interview }
  },

  list: async (applicationId?: string): Promise<ListInterviewsResponse> => {
    if (applicationId) {
      const interviews = await apiClient.request<Interview[]>(
        `/applications/${encodeURIComponent(applicationId)}/interviews/`
      )
      return { interviews: interviews ?? [] }
    }

    const applications = await applicationService.list({
      mine: true,
      pageSize: 100,
      sortBy: 'date',
      sortOrder: 'desc',
    })

    const interviewsByApplication = await Promise.all(
      (applications.applications ?? []).map(async (application) => {
        const interviews = await apiClient
          .request<Interview[]>(`/applications/${encodeURIComponent(application.id)}/interviews/`)
          .catch(() => [])

        return (interviews ?? []).map((interview) => ({
          ...interview,
          application_id: interview.application_id || application.id,
          program: interview.program ?? application.program,
          application_number: interview.application_number ?? application.application_number,
        }))
      })
    )

    return {
      interviews: interviewsByApplication
        .flat()
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    }
  }
}
