/**
 * useTimeline Hook
 *
 * React Query wrapper for communicationsService.listHistory.
 * Fetches paginated application status history entries and provides
 * a groupedEntries computed value that groups entries by application_number.
 *
 * Query key: ['timeline', userId, page]
 * Exposes: entries, groupedEntries, isLoading, error, pagination
 *
 * Requirements: 5.2, 2.1, 2.4
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  communicationsService,
  type PaginatedResponse,
  type PaginationParams,
  type TimelineEntry,
} from '@/services/communications'

export type { TimelineEntry }

export interface TimelineParams extends PaginationParams {
  userId?: string
}

export interface Pagination {
  page: number
  pageSize: number
  totalCount: number
}

export interface GroupedTimeline {
  applicationNumber: string
  entries: TimelineEntry[]
}

export interface UseTimelineReturn {
  entries: TimelineEntry[]
  groupedEntries: GroupedTimeline[]
  isLoading: boolean
  error: Error | null
  pagination: Pagination
}

const DEFAULT_PAGINATION: Pagination = {
  page: 1,
  pageSize: 20,
  totalCount: 0,
}

export function useTimeline(params: TimelineParams = {}): UseTimelineReturn {
  const { userId, page, pageSize } = params

  const queryKey = ['timeline', userId, page] as const

  const query = useQuery({
    queryKey,
    queryFn: () => communicationsService.listHistory({ userId, page, pageSize }),
  })

  const data = query.data as PaginatedResponse<TimelineEntry> | undefined

  const entries = data?.results ?? []

  const pagination: Pagination = data
    ? { page: data.page, pageSize: data.pageSize, totalCount: data.totalCount }
    : DEFAULT_PAGINATION

  const groupedEntries = useMemo<GroupedTimeline[]>(() => {
    const map = new Map<string, TimelineEntry[]>()
    for (const entry of entries) {
      const key = entry.application_number
      const group = map.get(key)
      if (group) {
        group.push(entry)
      } else {
        map.set(key, [entry])
      }
    }
    return Array.from(map, ([applicationNumber, entries]) => ({
      applicationNumber,
      entries,
    }))
  }, [entries])

  return {
    entries,
    groupedEntries,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    pagination,
  }
}

export default useTimeline
