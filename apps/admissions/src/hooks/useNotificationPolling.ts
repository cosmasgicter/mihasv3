/**
 * useNotificationPolling Hook
 *
 * Provides polling-based data fetching for student notifications.
 * Polls GET /api/v1/notifications/ via React Query at 60-second intervals.
 *
 * - Pauses polling when the browser tab is hidden for more than 5 minutes
 * - Computes unreadCount client-side from `read === false`
 * - Exposes markRead, markAllRead, deleteNotification mutations that invalidate the query cache
 * - Uses query key ['student-notifications', userId]
 *
 * Requirements: 6.1, 6.2, 6.4, 6.5
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { notificationService, normalizeNotificationsResponse } from '@/services/notifications'
import type { StudentNotification } from '@/types/notifications'

/** Threshold in ms after which polling stops entirely when tab is hidden */
const HIDDEN_PAUSE_THRESHOLD = 300_000 // 5 minutes

const DEFAULT_POLLING_INTERVAL = 60_000 // 60 seconds
const COMMUNICATIONS_QUERY_KEY = ['communications'] as const

export interface UseNotificationPollingOptions {
  enabled?: boolean
  pollingInterval?: number // default: 60_000 (60 seconds)
}

export interface UseNotificationPollingReturn {
  notifications: StudentNotification[]
  unreadCount: number
  isLoading: boolean
  error: Error | null
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  deleteNotification: (id: string) => Promise<void>
  refresh: () => Promise<void>
}

/**
 * Compute the number of unread notifications from a list.
 * Exported for independent testing in property tests.
 */
export function computeUnreadCount(notifications: StudentNotification[]): number {
  return notifications.filter((n) => n.read === false).length
}

/**
 * Determine the refetch interval based on tab visibility and hidden duration.
 * Returns `false` to pause polling, or a positive number (ms) to continue.
 * Exported for independent testing in property tests.
 *
 * @param hiddenSince - timestamp (ms) when the tab became hidden, or null if visible
 * @param pollingInterval - the base polling interval in ms
 */
export function getRefetchInterval(
  hiddenSince: number | null,
  pollingInterval: number
): number | false {
  if (document.visibilityState === 'visible') {
    return pollingInterval
  }
  // Tab is hidden — check how long
  if (hiddenSince && Date.now() - hiddenSince >= HIDDEN_PAUSE_THRESHOLD) {
    return false // Stop polling entirely after 5 minutes hidden
  }
  return pollingInterval * 2
}

export function useNotificationPolling(
  options: UseNotificationPollingOptions = {}
): UseNotificationPollingReturn {
  const { enabled = true, pollingInterval = DEFAULT_POLLING_INTERVAL } = options

  const { user } = useAuth()
  const queryClient = useQueryClient()
  const hiddenSinceRef = useRef<number | null>(null)

  const queryKey = useMemo(() => ['student-notifications', user?.id] as const, [user?.id])

  // Track page visibility to pause polling when hidden > 5 minutes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSinceRef.current = Date.now()
      } else {
        hiddenSinceRef.current = null
        // Invalidate to get fresh data when tab becomes visible again
        if (user?.id) {
          void queryClient.invalidateQueries({ queryKey })
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [queryClient, queryKey, user?.id])

  // Track the newest loaded notification id for cursor-based polling (R9, 2.15/2.16).
  // After the initial full load, subsequent polls use ?after=<newestId> to avoid
  // issuing a count query and to fetch only new notifications.
  const newestIdRef = useRef<string | null>(null)
  const hasInitialLoadRef = useRef(false)

  const fetchNotifications = useCallback(async (): Promise<StudentNotification[]> => {
    if (!user?.id) {
      return []
    }

    // After the first successful load, use cursor mode (no count query).
    if (hasInitialLoadRef.current && newestIdRef.current) {
      const cursorResult = await notificationService.listAfter(newestIdRef.current)
      const newItems = normalizeNotificationsResponse(cursorResult)
      if (newItems.length > 0) {
        // Merge new items into existing cache, deduplicating by id.
        const existing = queryClient.getQueryData<StudentNotification[]>(queryKey) ?? []
        const existingIds = new Set(existing.map(n => n.id))
        const dedupedNew = newItems.filter(n => !existingIds.has(n.id))
        if (dedupedNew.length > 0) {
          const merged = [...dedupedNew, ...existing]
          // Update the newest id to the most recent notification.
          newestIdRef.current = merged[0]?.id ?? newestIdRef.current
          return merged
        }
      }
      // No new items — return existing data unchanged.
      return queryClient.getQueryData<StudentNotification[]>(queryKey) ?? []
    }

    // Initial load: full list (page-number mode for backward compatibility).
    const result = await notificationService.list()
    const notifications = normalizeNotificationsResponse(result)
    if (notifications.length > 0) {
      newestIdRef.current = notifications[0]!.id
      hasInitialLoadRef.current = true
    }
    return notifications
  }, [user?.id, queryClient, queryKey])

  const consecutiveErrorsRef = useRef(0)

  const query = useQuery({
    queryKey,
    queryFn: fetchNotifications,
    enabled: enabled && !!user?.id,
    retry: (failureCount, error) => {
      const status = (error as { status?: number })?.status
      if (status === 429) return false
      return failureCount < 1
    },
    refetchInterval: enabled
      ? () => {
          // Back off on repeated errors (429 or otherwise)
          if (consecutiveErrorsRef.current > 0) {
            return Math.min(
              pollingInterval * Math.pow(2, consecutiveErrorsRef.current),
              5 * 60_000,
            )
          }
          return getRefetchInterval(hiddenSinceRef.current, pollingInterval)
        }
      : false,
    refetchOnWindowFocus: true,
    staleTime: pollingInterval / 2,
  })

  // Reset or increment error counter
  useEffect(() => {
    if (query.isSuccess) consecutiveErrorsRef.current = 0
  }, [query.isSuccess])

  useEffect(() => {
    if (query.isError) consecutiveErrorsRef.current = Math.min(consecutiveErrorsRef.current + 1, 6)
  }, [query.isError, query.errorUpdateCount])

  const notifications = query.data ?? []
  const unreadCount = computeUnreadCount(notifications)

  // Mutations
  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationService.markRead(id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<StudentNotification[]>(queryKey)
      queryClient.setQueryData<StudentNotification[]>(queryKey, (current = []) =>
        current.map(notification =>
          notification.id === id
            ? { ...notification, read: true, read_at: notification.read_at ?? new Date().toISOString() }
            : notification
        )
      )
      return { previous }
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey })
      void queryClient.invalidateQueries({ queryKey: COMMUNICATIONS_QUERY_KEY })
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<StudentNotification[]>(queryKey)
      const readAt = new Date().toISOString()
      queryClient.setQueryData<StudentNotification[]>(queryKey, (current = []) =>
        current.map(notification => ({ ...notification, read: true, read_at: notification.read_at ?? readAt }))
      )
      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey })
      void queryClient.invalidateQueries({ queryKey: COMMUNICATIONS_QUERY_KEY })
    },
  })

  const deleteNotificationMutation = useMutation({
    mutationFn: (id: string) => notificationService.delete(id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<StudentNotification[]>(queryKey)
      queryClient.setQueryData<StudentNotification[]>(queryKey, (current = []) =>
        current.filter(notification => notification.id !== id)
      )
      return { previous }
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey })
      void queryClient.invalidateQueries({ queryKey: COMMUNICATIONS_QUERY_KEY })
    },
  })

  const markRead = useCallback(
    async (id: string) => {
      await markReadMutation.mutateAsync(id)
    },
    [markReadMutation]
  )

  const markAllRead = useCallback(async () => {
    await markAllReadMutation.mutateAsync()
  }, [markAllReadMutation])

  const deleteNotification = useCallback(
    async (id: string) => {
      await deleteNotificationMutation.mutateAsync(id)
    },
    [deleteNotificationMutation]
  )

  const refresh = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey })
  }, [queryClient, queryKey])

  return {
    notifications,
    unreadCount,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    markRead,
    markAllRead,
    deleteNotification,
    refresh,
  }
}

export default useNotificationPolling
