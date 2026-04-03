/**
 * Interviews Service
 * Manages interview scheduling and listing for applications
 *
 * Django REST paths (no /api/v1/ prefix — apiClient prepends it):
 *   POST /applications/{id}/interviews/  → schedule an interview
 *   GET  /applications/{id}/interviews/  → list interviews for an application
 */
import { logApiError } from '@/lib/apiErrorLogger'
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

  /**
   * TODO(N+1): When called without an applicationId, this method fetches ALL
   * user applications and then makes N parallel requests to
   * GET /applications/{id}/interviews/ — one per application.
   *
   * Recommended backend fix: add a dedicated
   *   GET /api/v1/interviews/?mine=true
   * endpoint that returns all interviews for the authenticated user in a
   * single query, eliminating the fan-out entirely.
   *
   * Current mitigation: a semaphore caps concurrency at 5 parallel requests,
   * which limits network pressure but does not eliminate the N+1 round-trips.
   */
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

    // Semaphore-based concurrency limiter (max 5 parallel requests)
    const MAX_CONCURRENT = 5
    let running = 0
    const queue: Array<() => void> = []

    function acquire(): Promise<void> {
      if (running < MAX_CONCURRENT) {
        running++
        return Promise.resolve()
      }
      return new Promise<void>((resolve) => queue.push(resolve))
    }

    function release(): void {
      running--
      const next = queue.shift()
      if (next) {
        running++
        next()
      }
    }

    const appList = applications.applications ?? []

    const results = await Promise.allSettled(
      appList.map(async (application) => {
        await acquire()
        try {
          const endpoint = `/applications/${encodeURIComponent(application.id)}/interviews/`
          const interviews = await apiClient.request<Interview[]>(endpoint)

          return (interviews ?? []).map((interview) => ({
            ...interview,
            application_id: interview.application_id || application.id,
            program: interview.program ?? application.program,
            application_number: interview.application_number ?? application.application_number,
          }))
        } catch (error) {
          logApiError(
            'interviews',
            `/applications/${encodeURIComponent(application.id)}/interviews/`,
            error
          )
          return [] as Interview[]
        } finally {
          release()
        }
      })
    )

    const interviews = results
      .filter((r): r is PromiseFulfilledResult<Interview[]> => r.status === 'fulfilled')
      .flatMap((r) => r.value)
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

    return { interviews }
  }
}
