/**
 * Interviews Service
 * Manages interview scheduling and listing for applications.
 *
 * Django REST paths (no /api/v1/ prefix — apiClient prepends it):
 *   GET  /applications/interviews/?mine=true   → list interviews for the signed-in student
 *   POST /applications/{id}/interviews/        → schedule an interview
 *   GET  /applications/{id}/interviews/        → list interviews for a single application
 */
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

function firstInterviewArray(...values: unknown[]): Interview[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value as Interview[]
    }
  }

  return []
}

export function normalizeInterviewsResponse(response: unknown): Interview[] {
  if (Array.isArray(response)) {
    return response as Interview[]
  }

  if (!response || typeof response !== 'object') {
    return []
  }

  const envelope = response as Record<string, unknown>
  const data = envelope.data

  if (Array.isArray(data)) {
    return data as Interview[]
  }

  if (data && typeof data === 'object') {
    const nested = data as Record<string, unknown>
    const nestedInterviews = firstInterviewArray(nested.interviews, nested.results)
    if (nestedInterviews.length > 0) {
      return nestedInterviews
    }
  }

  return firstInterviewArray(envelope.interviews, envelope.results)
}

function sortInterviewsBySchedule(interviews: Interview[]): Interview[] {
  return [...interviews].sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  )
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
      const interviews = await apiClient.request<unknown>(
        `/applications/${encodeURIComponent(applicationId)}/interviews/`
      )
      return { interviews: sortInterviewsBySchedule(normalizeInterviewsResponse(interviews)) }
    }

    const interviews = await apiClient.request<unknown>(`/applications/interviews/?mine=true`)

    return {
      interviews: sortInterviewsBySchedule(normalizeInterviewsResponse(interviews))
    }
  }
}
