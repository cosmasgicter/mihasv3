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

function normalizePaginatedApplications(response: BackendPaginatedApplications): PaginatedApplicationsResponse {
  if (Array.isArray(response)) {
    return {
      applications: response,
      totalCount: response.length,
      page: 1,
      pageSize: response.length,
    }
  }

  const applications = response?.applications ?? response?.results ?? []
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
  const response = await apiClient.request<unknown>(`/applications?id=${encodeURIComponent(id)}`)
  return normalizeApplicationRecord(response)
}

async function loadApplicationDetails(
  id: string,
  options?: ApplicationIncludeOptions,
): Promise<ApplicationDetailResponse> {
  const application = await getApplicationById(id)

  if (!application) {
    throw new Error('Application not found or access denied')
  }

  const include = new Set(options?.include ?? [])
  const shouldLoadDocuments = include.has('documents')
  const shouldLoadGrades = include.has('grades')
  const shouldLoadStatusHistory = include.has('statusHistory')

  const [documents, grades, summary, interviews] = await Promise.all([
    shouldLoadDocuments
      ? apiClient.request<unknown[]>(`/applications/${encodeURIComponent(id)}/documents`)
      : Promise.resolve(null),
    shouldLoadGrades
      ? apiClient.request<unknown[]>(`/applications/${encodeURIComponent(id)}/grades`)
      : Promise.resolve(null),
    shouldLoadStatusHistory
      ? apiClient.request<ApplicationSummaryResponse>(`/applications/${encodeURIComponent(id)}/summary`)
      : Promise.resolve(null),
    apiClient.request<ApplicationInterview[]>(`/applications/${encodeURIComponent(id)}/interviews`).catch(() => null),
  ])

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
  list: async (params?: QueryParams) => {
    const response = await apiClient.request<BackendPaginatedApplications>(
      `/applications${buildQueryString(params ?? {})}`
    )
    return normalizePaginatedApplications(response)
  },

  getAll: async (params?: QueryParams) => {
    const response = await apiClient.request<BackendPaginatedApplications>(
      `/applications${buildQueryString(params ?? {})}`
    )
    return normalizePaginatedApplications(response)
  },

  getById: (id: string, options?: ApplicationIncludeOptions) =>
    loadApplicationDetails(id, options),

  create: async (data: ApplicationPayload) => {
    const response = await apiClient.request<unknown>('/applications', {
      method: 'POST',
      body: JSON.stringify(data)
    })

    return normalizeApplicationRecord(response)
  },

  update: async (id: string, data: ApplicationPayload) => {
    const cleanId = id.replace(/^applications-/, '')
    const response = await apiClient.request<unknown>(`/applications?id=${encodeURIComponent(cleanId)}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    })

    return normalizeApplicationRecord(response)
  },

  delete: async (id: string) => {
    await apiClient.request<void>(`/applications?id=${encodeURIComponent(id)}`, {
      method: 'DELETE'
    })
    return { success: true }
  },

  updateStatus: async (id: string, status: Application['status'], notes?: string, force?: boolean) => {
    await apiClient.request(`/applications?action=review&id=${encodeURIComponent(id)}`, {
      method: 'POST',
      body: JSON.stringify({ new_status: status, notes, ...(force ? { force: true } : {}) }),
      invalidateCache: [`/applications?id=${id}`, '/applications']
    })

    return getApplicationById(id)
  },

  updatePaymentStatus: async (
    id: string,
    paymentStatus: Application['payment_status'],
    verificationNotes?: string,
    _force?: boolean
  ) =>
    applicationService.update(id, {
      payment_status: paymentStatus,
      payment_verified_at: new Date().toISOString(),
      ...(verificationNotes ? { admin_feedback: verificationNotes, admin_feedback_date: new Date().toISOString() } : {}),
    }),

  verifyDocument: async (
    _id: string,
    _payload: { documentId?: string; documentType?: string; status: string; notes?: string }
  ) => {
    throw new Error('Document verification is not implemented in the Django backend yet')
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

  generateAcceptanceLetter: async (_id: string) => {
    throw new Error('Acceptance-letter generation is not implemented in the Django backend yet')
  },

  generateFinanceReceipt: async (_id: string) => {
    throw new Error('Finance receipt generation is not implemented in the Django backend yet')
  },

  scheduleInterview: async (id: string, payload: ScheduleInterviewPayload) => {
    const response = await apiClient.request<ApplicationInterview>(
      `/applications/${encodeURIComponent(id)}/interviews`,
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

  rescheduleInterview: async (id: string, payload: RescheduleInterviewPayload) => {
    const response = await apiClient.request<ApplicationInterview>(
      `/applications/${encodeURIComponent(id)}/interviews`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          scheduled_at: payload.scheduledAt,
          mode: payload.mode,
          location: payload.location,
          notes: payload.notes,
          status: 'rescheduled',
        })
      }
    )

    return response ?? null
  },

  cancelInterview: async (id: string, payload: CancelInterviewPayload = {}) => {
    const response = await apiClient.request<ApplicationInterview>(
      `/applications/${encodeURIComponent(id)}/interviews`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'cancelled',
          notes: payload.notes,
        })
      }
    )

    return response ?? null
  },

  exportApplications: async (params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    payment?: string;
    program?: string;
    institution?: string;
  } = {}) => {
    const response = await applicationService.list({
      page: params.page ?? 1,
      pageSize: params.limit ?? 100,
      search: params.search,
      status: params.status,
      payment: params.payment,
      program: params.program,
      institution: params.institution,
    })

    return {
      applications: response.applications,
      page: response.page,
      limit: response.pageSize,
      hasMore: response.page * response.pageSize < response.totalCount,
    }
  }
}
