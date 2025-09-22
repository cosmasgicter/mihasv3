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
      `/.netlify/functions/applications${buildQueryString(params ?? {})}`
    ),

  // Alias for backward compatibility
  getAll: (params?: QueryParams) =>
    apiClient.request<PaginatedApplicationsResponse>(
      `/.netlify/functions/applications${buildQueryString(params ?? {})}`
    ),

  getById: (id: string, options?: ApplicationIncludeOptions) =>
    apiClient.request<ApplicationDetailResponse>(
      `/.netlify/functions/applications-id?id=${id}${buildQueryString({ include: options?.include ?? [] }).replace('?', '&')}`
    ),

  create: (data: ApplicationPayload) =>
    apiClient.request<Application>('/.netlify/functions/applications', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  update: (id: string, data: ApplicationPayload) =>
    apiClient.request<Application>(`/api/applications/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  delete: (id: string) =>
    apiClient.request<void>(`/api/applications/${id}`, {
      method: 'DELETE'
    }),

  updateStatus: (id: string, status: Application['status'], notes?: string) =>
    apiClient.request<Application>(`/api/applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'update_status', status, notes })
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
      })
    }),

  verifyDocument: (
    id: string,
    payload: { documentId?: string; documentType?: string; status: string; notes?: string }
  ) =>
    apiClient.request<Application>(`/api/applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'verify_document', ...payload })
    }),

  syncGrades: (id: string, grades: Array<{ subject_id: string; grade: number }>) =>
    apiClient.request<Application>(`/api/applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'sync_grades', grades })
    }),

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
