/**
 * Interviews Service — reference domain service for the V2 strict contract (R14.3, R14.5).
 *
 * This module is the reference pattern for how a domain service consumes the
 * generated OpenAPI client:
 *   - It imports strict generated types from `@/generated` (never a hand-rolled
 *     response union).
 *   - It trusts the unified `apiClient` to unwrap the canonical `{success, data}`
 *     envelope exactly once (see services/httpClient.ts `unwrapApiResponse`), so
 *     a list endpoint returns `ApplicationInterview[]` and a single endpoint
 *     returns `ApplicationInterview`.
 *   - It maps the generated contract type to the narrower domain `Interview`
 *     type with a single typed mapper (`toInterview`) — NOT a permissive
 *     multi-shape normalizer.
 *
 * The previous permissive `normalizeInterviewsResponse` (which sniffed bare
 * arrays, `{data}`, `{data:{interviews}}`, `{data:{results}}`, `{interviews}`,
 * and `{results}`) has been deleted per R14.5: after the canonical envelope
 * (task 1.3) and the unified client (task 1.4), those legacy shapes no longer
 * occur, and defending against them hid contract drift.
 *
 * Pages/components consume `interviewsService` — never the raw client or the
 * generated types directly (enforced by the R14.3 lint + architecture test).
 *
 * Django REST paths (no /api/v1/ prefix — apiClient prepends it):
 *   GET  /applications/interviews/?mine=true   → list interviews for the signed-in student
 *   POST /applications/{id}/interviews/        → schedule an interview
 *   GET  /applications/{id}/interviews/        → list interviews for a single application
 */
import { apiClient } from './client'
import type { ApplicationInterview, ApplicationInterviewWrite } from '@/generated'

export type InterviewMode = 'in_person' | 'virtual' | 'phone'
export type InterviewStatus = 'scheduled' | 'completed' | 'cancelled' | 'rescheduled'

/**
 * Domain interview shape consumed by pages/hooks. Derived from the generated
 * `ApplicationInterview` contract, narrowing `mode`/`status` (typed as `string`
 * in OpenAPI) to the supported domain unions.
 */
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

/**
 * Strict mapper: generated `ApplicationInterview` → domain `Interview`.
 * The backend enforces the mode/status vocabularies, so we narrow the generated
 * `string` fields to the domain unions and default the nullable optionals.
 */
function toInterview(record: ApplicationInterview): Interview {
  return {
    id: record.id,
    application_id: record.application_id,
    scheduled_at: record.scheduled_at,
    mode: record.mode as InterviewMode,
    location: record.location ?? null,
    status: record.status as InterviewStatus,
    notes: record.notes ?? null,
    program: record.program ?? null,
    application_number: record.application_number ?? null,
  }
}

function sortInterviewsBySchedule(interviews: Interview[]): Interview[] {
  return [...interviews].sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  )
}

export const interviewsService = {
  schedule: async (data: ScheduleInterviewData): Promise<ScheduleInterviewResponse> => {
    const { applicationId } = data
    if (!applicationId) {
      throw new Error('Application ID is required to schedule an interview')
    }

    const body: ApplicationInterviewWrite = {
      scheduled_at: data.scheduled_at,
      mode: data.mode,
      location: data.location,
      notes: data.notes,
    }

    const interview = await apiClient.request<ApplicationInterview>(
      `/applications/${encodeURIComponent(applicationId)}/interviews/`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    )

    if (!interview) {
      throw new Error('Interview scheduling did not return interview data')
    }

    return { interview: toInterview(interview) }
  },

  list: async (applicationId?: string): Promise<ListInterviewsResponse> => {
    const endpoint = applicationId
      ? `/applications/${encodeURIComponent(applicationId)}/interviews/`
      : `/applications/interviews/?mine=true`

    // The unified client unwraps the `{success, data}` envelope, so the strict
    // contract for both list endpoints is `ApplicationInterview[]`.
    const records = await apiClient.request<ApplicationInterview[]>(endpoint)
    const interviews = (records ?? []).map(toInterview)

    return { interviews: sortInterviewsBySchedule(interviews) }
  },
}
