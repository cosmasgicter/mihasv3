import type { Application, ApplicationInterview } from '@/lib/supabase'

import { apiClient, buildQueryString, QueryParams } from './client'

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

export const applicationService = {
  list: (params?: QueryParams) =>
    apiClient.request<PaginatedApplicationsResponse>(
      `/api/applications${buildQueryString(params ?? {})}`
    ),

  // Alias for backward compatibility
  getAll: (params?: QueryParams) =>
    apiClient.request<PaginatedApplicationsResponse>(
      `/api/applications${buildQueryString(params ?? {})}`
    ),

  getById: (id: string, options?: ApplicationIncludeOptions) => {
    const includeQuery = buildQueryString({ include: options?.include ?? [] })
    return apiClient.request<ApplicationDetailResponse>(
      `/api/applications/${encodeURIComponent(id)}${includeQuery}`
    )
  },

  create: (data: ApplicationPayload) =>
    apiClient.request<Application>('/api/applications', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  update: async (id: string, data: ApplicationPayload) => {
    const cleanId = id.replace(/^applications-/, '')
    const response = await apiClient.request<{ success: boolean; data: Application }>(`/api/applications/${cleanId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
    return response?.data ?? null
  },

  delete: async (id: string) => {
    await apiClient.request<void>(`/api/applications/${id}`, {
      method: 'DELETE'
    })
    return { success: true }
  },

  updateStatus: (id: string, status: Application['status'], notes?: string) =>
    apiClient.request<Application>(`/api/applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'update_status', status, notes }),
      invalidateCache: [`/api/applications/${id}`, '/api/applications']
    }),

  updatePaymentStatus: (
    id: string,
    paymentStatus: Application['payment_status'],
    verificationNotes?: string
  ) =>
    apiClient.request<Application>(`/api/applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        action: 'update_payment_status',
        paymentStatus,
        verificationNotes: verificationNotes || undefined
      }),
      invalidateCache: [`/api/applications/${id}`, '/api/applications']
    }),

  verifyDocument: (
    id: string,
    payload: { documentId?: string; documentType?: string; status: string; notes?: string }
  ) =>
    apiClient.request<Application>(`/api/applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'verify_document', ...payload })
    }),

  syncGrades: async (id: string, grades: Array<{ subject_id: string; grade: number }>) => {
    const { syncGradesWithRecovery } = await import('@/lib/connectionFix')
    return syncGradesWithRecovery(id, grades)
  },

  sendNotification: (id: string, notification: { title: string; message: string }) =>
    apiClient.request<Application>(`/api/applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'send_notification', ...notification })
    }),

  generateAcceptanceLetter: (id: string) =>
    apiClient.request<Application>(`/api/applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'generate_acceptance_letter' })
    }),

  generateFinanceReceipt: (id: string) =>
    apiClient.request<Application>(`/api/applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'generate_finance_receipt' })
    }),

  scheduleInterview: async (id: string, payload: ScheduleInterviewPayload) => {
    const response = await apiClient.request<{ interview: ApplicationInterview }>(
      `/api/applications/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'schedule_interview',
          scheduledAt: payload.scheduledAt,
          mode: payload.mode,
          location: payload.location,
          notes: payload.notes
        })
      }
    )

    return response?.interview ?? null
  },

  rescheduleInterview: async (id: string, payload: RescheduleInterviewPayload) => {
    const response = await apiClient.request<{ interview: ApplicationInterview }>(
      `/api/applications/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'reschedule_interview',
          scheduledAt: payload.scheduledAt,
          mode: payload.mode,
          location: payload.location,
          notes: payload.notes
        })
      }
    )

    return response?.interview ?? null
  },

  cancelInterview: async (id: string, payload: CancelInterviewPayload = {}) => {
    const response = await apiClient.request<{ interview: ApplicationInterview }>(
      `/api/applications/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'cancel_interview',
          notes: payload.notes
        })
      }
    )

    return response?.interview ?? null
  }
}
