/**
 * useCommunications Hook
 *
 * React Query wrapper for communicationsService.listNotifications.
 * Fetches paginated, filterable notifications for the current student.
 *
 * Query key: ['communications', filters] where filters includes page, type, is_read
 * Exposes: notifications, isLoading, error, pagination, refetch
 *
 * Requirements: 5.1, 1.1
 */

import { useQuery } from '@tanstack/react-query'
import {
  communicationsService,
  type PaginatedResponse,
  type NotificationFilters,
  type PaginationParams,
} from '@/services/communications'

export type CommunicationsFilters = PaginationParams & NotificationFilters

export interface Pagination {
  page: number
  pageSize: number
  totalCount: number
}

export interface UseCommunicationsReturn {
  notifications: Record<string, unknown>[]
  isLoading: boolean
  error: Error | null
  pagination: Pagination
  refetch: () => void
}

const DEFAULT_PAGINATION: Pagination = {
  page: 1,
  pageSize: 20,
  totalCount: 0,
}

export function useCommunications(
  filters: CommunicationsFilters = {}
): UseCommunicationsReturn {
  const queryKey = ['communications', filters] as const

  const query = useQuery({
    queryKey,
    queryFn: () => communicationsService.listNotifications(filters),
  })

  const data = query.data as PaginatedResponse<Record<string, unknown>> | undefined

  const notifications = data?.results ?? []

  const pagination: Pagination = data
    ? { page: data.page, pageSize: data.pageSize, totalCount: data.totalCount }
    : DEFAULT_PAGINATION

  return {
    notifications,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    pagination,
    refetch: query.refetch,
  }
}

export default useCommunications
