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
      `/applications${buildQueryString(params ?? {})}`
    ),

  // Alias for backward compatibility
  getAll: (params?: QueryParams) =>
    apiClient.request<PaginatedApplicationsResponse>(
      `/applications${buildQueryString(params ?? {})}`
    ),

  getById: (id: string, options?: ApplicationIncludeOptions) => {
    const includeQuery = buildQueryString({ include: options?.include ?? [] })
    return apiClient.request<ApplicationDetailResponse>(
      `/applications/${encodeURIComponent(id)}${includeQuery}`
    )
  },

  create: (data: ApplicationPayload) =>
    apiClient.request<Application>('/applications', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  update: async (id: string, data: ApplicationPayload) => {
    const cleanId = id.replace(/^applications-/, '')
    const response = await apiClient.request<{ success: boolean; data: Application }>(`/applications/${cleanId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
    return response?.data ?? null
  },

  delete: async (id: string) => {
    await apiClient.request<void>(`/applications/${id}`, {
      method: 'DELETE'
    })
    return { success: true }
  },

  updateStatus: (id: string, status: Application['status'], notes?: string) =>
    apiClient.request<Application>(`/applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'update_status', status, notes }),
      invalidateCache: [`/applications/${id}`, '/applications']
    }),

  updatePaymentStatus: (
    id: string,
    paymentStatus: Application['payment_status'],
    verificationNotes?: string
  ) =>
    apiClient.request<Application>(`/applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        action: 'update_payment_status',
        paymentStatus,
        verificationNotes: verificationNotes || undefined
      }),
      invalidateCache: [`/applications/${id}`, '/applications']
    }),

  verifyDocument: (
    id: string,
    payload: { documentId?: string; documentType?: string; status: string; notes?: string }
  ) =>
    apiClient.request<Application>(`/applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'verify_document', ...payload })
    }),

  syncGrades: async (id: string, grades: Array<{ subject_id: string; grade: number }>) => {
    const { syncGradesWithRecovery } = await import('@/lib/connectionFix')
    return syncGradesWithRecovery(id, grades)
  },

  sendNotification: (id: string, notification: { title: string; message: string }) =>
    apiClient.request<Application>(`/applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'send_notification', ...notification })
    }),

  generateAcceptanceLetter: (id: string) =>
    apiClient.request<Application>(`/applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'generate_acceptance_letter' })
    }),

  generateFinanceReceipt: (id: string) =>
    apiClient.request<Application>(`/applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'generate_finance_receipt' })
    }),

  scheduleInterview: async (id: string, payload: ScheduleInterviewPayload) => {
    const response = await apiClient.request<{ interview: ApplicationInterview }>(
      `/applications/${id}`,
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
      `/applications/${id}`,
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
      `/applications/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'cancel_interview',
          notes: payload.notes
        })
      }
    )

    return response?.interview ?? null
  },

  /**
   * Export applications for CSV/Excel/PDF export (admin only)
   * Returns paginated applications with all details
   */
  exportApplications: async (params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    payment?: string;
    program?: string;
    institution?: string;
  } = {}) => {
    const queryParams = new URLSearchParams();
    queryParams.set('action', 'export');
    if (params.page !== undefined) queryParams.set('page', String(params.page));
    if (params.limit !== undefined) queryParams.set('limit', String(params.limit));
    if (params.search) queryParams.set('search', params.search);
    if (params.status) queryParams.set('status', params.status);
    if (params.payment) queryParams.set('payment', params.payment);
    if (params.program) queryParams.set('program', params.program);
    if (params.institution) queryParams.set('institution', params.institution);

    return apiClient.request<{
      applications: Array<{
        application_number: string;
        full_name: string;
        email: string;
        phone: string;
        program: string;
        intake: string;
        institution: string;
        status: string;
        payment_status: string;
        application_fee: number;
        paid_amount: number;
        submitted_at: string;
        created_at: string;
        grades_summary: string;
        total_subjects: number;
        points: number;
        age: number;
        days_since_submission: number;
      }>;
      page: number;
      limit: number;
      hasMore: boolean;
    }>(`/applications?${queryParams.toString()}`);
  }
}
