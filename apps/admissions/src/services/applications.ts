import type { Application, ApplicationInterview } from '@/types/database'

import { logApiError } from '@/lib/apiErrorLogger'
import { importWithChunkRecovery } from '@/lib/lazyImportRecovery'
import { apiClient, buildQueryString, type ApiRequestOptions, type QueryParams } from './client'
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
type ApplicationListRequestOptions = Pick<ApiRequestOptions, 'timeout' | 'retries'>

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

export type BackendPaginatedApplications =
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

function normalizeStatusHistory(history?: unknown[]): unknown[] {
  if (!Array.isArray(history)) {
    return []
  }

  return history.map((item, index) => {
    if (!item || typeof item !== 'object') {
      return item
    }

    const row = item as Record<string, unknown>
    const status = row.status ?? row.new_status ?? 'unknown'
    return {
      id: row.id ?? `${String(status)}-${String(row.created_at ?? index)}`,
      ...row,
      status,
      changed_by: row.changed_by ?? row.changed_by_name ?? null,
      changed_by_profile: row.changed_by_profile ?? (
        row.changed_by_name
          ? { full_name: row.changed_by_name, email: '' }
          : undefined
      ),
    }
  })
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
 * Returns safe defaults for null/undefined input.
 */
export function normalizePaginatedApplications(response: BackendPaginatedApplications): PaginatedApplicationsResponse {
  if (response == null) {
    return {
      applications: [],
      totalCount: 0,
      page: 1,
      pageSize: 0,
    }
  }

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
    apiClient.request<unknown>(`/applications/${encodedId}/details/`).catch((err) => {
      // 404 means application was deleted — return null instead of throwing
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
        return null
      }
      throw err
    }),
    shouldLoadDocuments
      ? apiClient.request<unknown[]>(`/applications/${encodedId}/documents/`)
      : Promise.resolve(null),
    shouldLoadGrades
      ? apiClient.request<unknown[]>(`/applications/${encodedId}/grades/`)
      : Promise.resolve(null),
    shouldLoadStatusHistory
      ? apiClient.request<ApplicationSummaryResponse>(`/applications/${encodedId}/summary/`)
      : Promise.resolve(null),
    apiClient.request<ApplicationInterview[]>(`/applications/${encodedId}/interviews/`).catch((err) => {
      logApiError('applications', `/applications/${encodedId}/interviews/`, err)
      return null
    }),
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
    ...(Array.isArray(summary?.status_history) ? { statusHistory: normalizeStatusHistory(summary.status_history) } : {}),
    interview: latestInterview,
  }
}

export const applicationService = {
  /** GET /applications/ with query params for pagination/filtering */
  list: async (params?: QueryParams, options: ApplicationListRequestOptions = {}) => {
    const response = await apiClient.request<BackendPaginatedApplications>(
      `/applications/${buildQueryString(params ?? {})}`,
      options
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
    try {
      await apiClient.request<void>(`/applications/${encodeURIComponent(id)}/`, {
        method: 'DELETE',
        retries: 0
      })
    } catch (error) {
      // 404 means already deleted — treat as success (idempotent delete).
      const status = (error as { status?: number })?.status
      if (status === 404) {
        return { success: true }
      }
      const message = error instanceof Error ? error.message.toLowerCase() : ''
      if (
        message.includes('resource not found') ||
        message.includes('application not found') ||
        message.includes('not found or access denied')
      ) {
        return { success: true }
      }
      throw error
    }
    return { success: true }
  },

  /** POST /applications/{id}/submit/ — student self-service submission */
  submit: async (id: string, options?: { headers?: Record<string, string> }) => {
    const response = await apiClient.request<unknown>(`/applications/${encodeURIComponent(id)}/submit/`, {
      method: 'POST',
      ...(options?.headers ? { headers: options.headers } : {}),
    })

    return normalizeApplicationRecord(response)
  },

  /** PATCH /applications/{id}/review/ — update application status */
  updateStatus: async (id: string, status: Application['status'], notes?: string, force?: boolean) => {
    const encodedId = encodeURIComponent(id)
    await apiClient.request(`/applications/${encodedId}/review/`, {
      method: 'POST',
      body: JSON.stringify({ new_status: status, notes, ...(force ? { force: true } : {}) }),
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
      method: 'POST',
      body: JSON.stringify({
        payment_status: paymentStatus,
        notes: verificationNotes,
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
    const { syncGradesWithRecovery } = await importWithChunkRecovery(() => import('@/lib/connectionFix'), {
      guardKey: 'wizard-grade-sync',
      recoveryMessage: 'A newer version of the grade sync tools is loading. Please wait a moment and try again.',
    })
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
      // camelCase → snake_case: Django expects `application_ids`, not `applicationIds`
      body: JSON.stringify({
        application_ids: data.applicationIds,
        new_status: data.status,
        notes: data.notes,
      }),
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

  /** POST /applications/{id}/confirm-enrollment/ */
  confirmEnrollment: async (id: string) => {
    return apiClient.request(`/applications/${encodeURIComponent(id)}/confirm-enrollment/`, { method: 'POST' })
  },

  /** POST /applications/{id}/fee-waiver/ */
  applyFeeWaiver: async (id: string, data: { waiver_type: string; reason_code: string; discount_percentage: number }) => {
    return apiClient.request(`/applications/${encodeURIComponent(id)}/fee-waiver/`, { method: 'POST', body: JSON.stringify(data) })
  },
}
