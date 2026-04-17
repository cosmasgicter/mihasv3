import { apiClient } from './client'

// ─── Types ───

export interface TimelineEntry {
  id: string
  application_id: string
  application_number: string
  old_status: string | null
  new_status: string | null
  notes: string | null
  changed_by_name: string | null
  created_at: string
}

export interface PaginatedResponse<T> {
  page: number
  pageSize: number
  totalCount: number
  results: T[]
}

export interface NotificationFilters {
  type?: 'info' | 'success' | 'warning' | 'error'
  is_read?: boolean
}

export interface PaginationParams {
  page?: number
  pageSize?: number
}

// ─── Helpers ───

function buildQueryString(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.set(key, String(value))
    }
  }
  const qs = searchParams.toString()
  return qs ? `?${qs}` : ''
}

// ─── Service ───

export const communicationsService = {
  /** Fetch paginated notifications for the current user. Maps to GET /notifications/ */
  listNotifications: (params: PaginationParams & NotificationFilters) =>
    apiClient.request<PaginatedResponse<Record<string, unknown>>>(
      `/notifications/${buildQueryString({ ...params })}`,
      { method: 'GET', useCache: false }
    ),

  /** Fetch paginated application status history. Maps to GET /applications/history/ */
  listHistory: (params: PaginationParams & { userId?: string }) => {
    const { userId, ...rest } = params
    const queryParams: Record<string, unknown> = { ...rest }
    if (userId) {
      queryParams.user_id = userId
    }
    return apiClient.request<PaginatedResponse<TimelineEntry>>(
      `/applications/history/${buildQueryString(queryParams)}`,
      { method: 'GET', useCache: false }
    )
  },

  /** Fetch paginated notifications for a specific user (admin only). Maps to GET /notifications/user/:userId/ */
  listUserNotifications: (userId: string, params: PaginationParams) =>
    apiClient.request<PaginatedResponse<Record<string, unknown>>>(
      `/notifications/user/${encodeURIComponent(userId)}/${buildQueryString({ ...params })}`,
      { method: 'GET', useCache: false }
    ),
}
