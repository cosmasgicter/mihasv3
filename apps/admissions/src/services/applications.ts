import type { Application, ApplicationInterview } from '@/types/database'

import { apiClient, buildQueryString, QueryParams } from './client'
import { notificationService } from './notifications'

export interface PaginatedApplicationsResponse {
  applications: Application[]
  totalCount: number
  page: number
  pageSize: number
  stats?: Record<string, unknown>
}

type ApplicationIncludeOptions = {
  include?: string[]
}

type ApplicationPayload = Partial<Application>

export interface ApplicationDetailResponse {
  application: Application & { interview?: ApplicationInterview | null }
  documents?: unknown[]
  grades?: unknown[]
  statusHistory?: unknown[]
  interview?: ApplicationInterview | null
  [key: string]: unknown
}

type ScheduleInterviewPayload = {
  scheduledAt: string
  mode: ApplicationInterview['mode']
  location?: string
  notes?: string
}

type RescheduleInterviewPayload = {
  scheduledAt: string
  mode?: ApplicationInterview['mode']
  location?: string
  notes?: string
}

type CancelInterviewPayload = {
  notes?: string
}

type BackendPaginatedApplications =
  | {
      applications?: Application[]
      results?: Application[]
      totalCount?: number
      count?: number
      page?: number
      pageSize?: number
      limit?: number
      stats?: Record<string, unknown>
      next?: string | null
    }
  | Application[]
  | null
  | undefined

type ApplicationSummaryResponse = {
  application?: Application
  documents_count?: number
  grades_count?: number
  status_history?: unknown[]
}

function isApplicationRecord(value: unknown): value is Application {
  return Boolean(value && typeof value === 'object' && 'id' in (value as Record<string, unknown>))
}

function normalizeApplicationRecord(value: unknown): Application | null {
  if (isApplicationRecord(value)) {
    return value
  }

  if (value && typeof value === 'object' && 'application' in (value as Record<string, unknown>)) {
    const application = (value as { application?: unknown }).application
    return isApplicationRecord(application) ? application : null
  }

  return null
}

/**
 * Map Django pagination response `{results}` → `{applications}`.
 * Handles both Django `results` field and legacy `applications` field.
 */
function normalizePaginatedApplications(response: BackendPaginatedApplications): PaginatedApplicationsResponse {
  if (Array.isArray(response)) {
    return {
      applications: response,
      totalCount: response.length,
      page: 1,
      pageSize: response.length,
    }
  }

  const applications = response?.results ?? response?.applications ?? []
  const totalCount = response?.totalCount ?? response?.count ?? applications.length
  const page = response?.page ?? 1
  const pageSize = response?.pageSize ?? response?.limit ?? applications.length

  return {
    applications,
    totalCount,
    page,
    pageSize,
    ...(response?.stats ? { stats: response.stats } : {}),
  }
}

async function getApplicationById(id: string): Promise<Application | null> {
  const response = await apiClient.request<unknown>(`/applications/${encodeURIComponent(id)}/`)
  return normalizeApplicationRecord(response)
}

async function loadApplicationDetails(
  id: string,
  options?: ApplicationIncludeOptions,
): Promise<ApplicationDetailResponse> {
  const encodedId = encodeURIComponent(id)

  // If no specific includes requested, use the details endpoint for a single round-trip
  const include = new Set(options?.include ?? [])
  const shouldLoadDocuments = include.has('documents')
  const shouldLoadGrades = include.has('grades')
  const shouldLoadStatusHistory = include.has('statusHistory')

  const [detailsResponse, documents, grades, summary, interviews] = await Promise.all([
    apiClient.request<unknown>(`/applications/${encodedId}/details/`),
    shouldLoadDocuments
      ? apiClient.request<unknown[]>(`/applications/${encodedId}/documents/`)
      : Promise.resolve(null),
    shouldLoadGrades
      ? apiClient.request<unknown[]>(`/applications/${encodedId}/grades/`)
      : Promise.resolve(null),
    shouldLoadStatusHistory
      ? apiClient.request<ApplicationSummaryResponse>(`/applications/${encodedId}/summary/`)
      : Promise.resolve(null),
    apiClient.request<ApplicationInterview[]>(`/applications/${encodedId}/interviews/`).catch(() => null),
  ])

  const application = normalizeApplicationRecord(detailsResponse)

  if (!application) {
    throw new Error('Application not found or access denied')
  }

  const latestInterview = Array.isArray(interviews) && interviews.length > 0 ? interviews[0] : null
  const mergedApplication = summary?.application
    ? { ...application, ...summary.application, interview: latestInterview }
    : { ...application, interview: latestInterview }

  return {
    application: mergedApplication,
    ...(Array.isArray(documents) ? { documents } : {}),
    ...(Array.isArray(grades) ? { grades } : {}),
    ...(Array.isArray(summary?.status_history) ? { statusHistory: summary.status_history } : {}),
    interview: latestInterview,
  }
}

export const applicationService = {
  /** GET /applications/ with query params for pagination/filtering */
  list: async (params?: QueryParams) => {
    const response = await apiClient.request<BackendPaginatedApplications>(
      `/applications/${buildQueryString(params ?? {})}`
    )
    return normalizePaginatedApplications(response)
  },

  /** GET /applications/ — alias for list */
  getAll: async (params?: QueryParams) => {
    const response = await apiClient.request<BackendPaginatedApplications>(
      `/applications/${buildQueryString(params ?? {})}`
    )
    return normalizePaginatedApplications(response)
  },

  /** GET /applications/{id}/details/ with optional sub-resource loading */
  getById: (id: string, options?: ApplicationIncludeOptions) =>
    loadApplicationDetails(id, options),

  /** POST /applications/ */
  create: async (data: ApplicationPayload) => {
    const response = await apiClient.request<unknown>('/applications/', {
      method: 'POST',
      body: JSON.stringify(data)
    })

    return normalizeApplicationRecord(response)
  },

  /** PUT /applications/{id}/ */
  update: async (id: string, data: ApplicationPayload) => {
    const cleanId = id.replace(/^applications-/, '')
    const response = await apiClient.request<unknown>(`/applications/${encodeURIComponent(cleanId)}/`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })

    return normalizeApplicationRecord(response)
  },

  /** DELETE /applications/{id}/ */
  delete: async (id: string) => {
    await apiClient.request<void>(`/applications/${encodeURIComponent(id)}/`, {
      method: 'DELETE'
    })
    return { success: true }
  },

  /** PATCH /applications/{id}/review/ — update application status */
  updateStatus: async (id: string, status: Application['status'], notes?: string, force?: boolean) => {
    const encodedId = encodeURIComponent(id)
    await apiClient.request(`/applications/${encodedId}/review/`, {
      method: 'PATCH',
      body: JSON.stringify({ status, notes, ...(force ? { force: true } : {}) }),
    })

    return getApplicationById(id)
  },

  /** PATCH /applications/{id}/review/ — update payment status */
  updatePaymentStatus: async (
    id: string,
    paymentStatus: Application['payment_status'],
    verificationNotes?: string,
    force?: boolean
  ) => {
    const encodedId = encodeURIComponent(id)
    await apiClient.request(`/applications/${encodedId}/review/`, {
      method: 'PATCH',
      body: JSON.stringify({
        paymentStatus,
        verificationNotes,
        ...(force ? { force: true } : {}),
      }),
    })

    return getApplicationById(id)
  },

  verifyDocument: async (
    id: string,
    payload: { documentId?: string; documentType?: string; status: string; notes?: string }
  ) => {
    return apiClient.request(`/applications/${encodeURIComponent(id)}/verify-document/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  syncGrades: async (id: string, grades: Array<{ subject_id: string; grade: number }>) => {
    const { syncGradesWithRecovery } = await import('@/lib/connectionFix')
    return syncGradesWithRecovery(id, grades)
  },

  sendNotification: async (id: string, notification: { title: string; message: string }) => {
    const application = await getApplicationById(id)
    if (!application?.user_id) {
      throw new Error('Application recipient could not be resolved')
    }

    const sent = await notificationService.send({
      to: application.user_id,
      subject: notification.title,
      message: notification.message,
    })

    if (!sent) {
      throw new Error('Notification delivery request was rejected by the backend')
    }

    return { success: true }
  },

  generateAcceptanceLetter: async (id: string) => {
    return apiClient.request<{ task_id: string; application_id: string; status: string }>(
      `/applications/${encodeURIComponent(id)}/acceptance-letter/`,
      { method: 'POST' }
    )
  },

  generateFinanceReceipt: async (id: string) => {
    return apiClient.request<{ task_id: string; application_id: string; status: string }>(
      `/applications/${encodeURIComponent(id)}/finance-receipt/`,
      { method: 'POST' }
    )
  },

  /** POST /applications/{id}/interviews/ — schedule interview */
  scheduleInterview: async (id: string, payload: ScheduleInterviewPayload) => {
    const response = await apiClient.request<ApplicationInterview>(
      `/applications/${encodeURIComponent(id)}/interviews/`,
      {
        method: 'POST',
        body: JSON.stringify({
          scheduled_at: payload.scheduledAt,
          mode: payload.mode,
          location: payload.location,
          notes: payload.notes,
        })
      }
    )

    return response ?? null
  },

  /** PUT /applications/{id}/interviews/ — reschedule interview */
  rescheduleInterview: async (id: string, payload: RescheduleInterviewPayload) => {
    const response = await apiClient.request<ApplicationInterview>(
      `/applications/${encodeURIComponent(id)}/interviews/`,
      {
        method: 'PUT',
        body: JSON.stringify({
          scheduled_at: payload.scheduledAt,
          mode: payload.mode,
          location: payload.location,
          notes: payload.notes,
        })
      }
    )

    return response ?? null
  },

  /** DELETE /applications/{id}/interviews/ — cancel interview */
  cancelInterview: async (id: string, payload: CancelInterviewPayload = {}) => {
    const response = await apiClient.request<ApplicationInterview>(
      `/applications/${encodeURIComponent(id)}/interviews/`,
      {
        method: 'DELETE',
        body: JSON.stringify({
          notes: payload.notes,
        })
      }
    )

    return response ?? null
  },

  /** GET /applications/export/ — admin CSV/Excel export */
  exportApplications: async (params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    payment?: string;
    program?: string;
    institution?: string;
  } = {}) => {
    const queryParams: QueryParams = {
      page: params.page !== undefined ? params.page + 1 : undefined,
      pageSize: params.limit,
      search: params.search,
      status: params.status,
      payment: params.payment,
      program: params.program,
      institution: params.institution,
    }
    const response = await apiClient.request<BackendPaginatedApplications>(
      `/applications/export/${buildQueryString(queryParams)}`
    )
    const normalized = normalizePaginatedApplications(response)

    return {
      applications: normalized.applications,
      page: normalized.page,
      limit: normalized.pageSize,
      hasMore: normalized.page * normalized.pageSize < normalized.totalCount,
    }
  },

  /** GET /applications/track/ — public application tracking */
  track: async (params: { applicationNumber?: string; trackingCode?: string }) => {
    const queryParams: QueryParams = {
      applicationNumber: params.applicationNumber,
      trackingCode: params.trackingCode,
    }
    return apiClient.request<unknown>(`/applications/track/${buildQueryString(queryParams)}`)
  },

  /** POST /applications/bulk-status/ — admin bulk status updates */
  bulkStatus: async (data: { applicationIds: string[]; status: string; notes?: string }) => {
    return apiClient.request<unknown>('/applications/bulk-status/', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /** POST /applications/draft/ — auto-save draft persistence */
  saveDraft: async (data: ApplicationPayload) => {
    return apiClient.request<unknown>('/applications/draft/', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /** GET /applications/{id}/documents/ */
  getDocuments: async (id: string) => {
    return apiClient.request<unknown[]>(`/applications/${encodeURIComponent(id)}/documents/`)
  },

  /** GET /applications/{id}/grades/ */
  getGrades: async (id: string) => {
    return apiClient.request<unknown[]>(`/applications/${encodeURIComponent(id)}/grades/`)
  },

  /** GET /applications/{id}/summary/ */
  getSummary: async (id: string) => {
    return apiClient.request<ApplicationSummaryResponse>(`/applications/${encodeURIComponent(id)}/summary/`)
  },
}
