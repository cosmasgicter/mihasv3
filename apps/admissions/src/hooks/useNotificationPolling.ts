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
import { useCallback, useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { notificationService } from '@/services/notifications'
import type { StudentNotification } from '@/types/notifications'

/** Threshold in ms after which polling stops entirely when tab is hidden */
const HIDDEN_PAUSE_THRESHOLD = 300_000 // 5 minutes

const DEFAULT_POLLING_INTERVAL = 60_000 // 60 seconds

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
  refresh: () => void
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

  const queryKey = ['student-notifications', user?.id]

  // Track page visibility to pause polling when hidden > 5 minutes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSinceRef.current = Date.now()
      } else {
        hiddenSinceRef.current = null
        // Invalidate to get fresh data when tab becomes visible again
        if (user?.id) {
          queryClient.invalidateQueries({ queryKey })
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [queryClient, user?.id])

  const fetchNotifications = useCallback(async (): Promise<StudentNotification[]> => {
    if (!user?.id) {
      return []
    }
    const result = await notificationService.list()
    // The API returns { success: true, data: [...] } envelope
    const notifications: StudentNotification[] = (result as any)?.data ?? (result as any) ?? []
    return Array.isArray(notifications) ? notifications : []
  }, [user?.id])

  const query = useQuery({
    queryKey,
    queryFn: fetchNotifications,
    enabled: enabled && !!user?.id,
    refetchInterval: enabled
      ? () => getRefetchInterval(hiddenSinceRef.current, pollingInterval)
      : false,
    refetchOnWindowFocus: true,
    staleTime: pollingInterval / 2,
  })

  const notifications = query.data ?? []
  const unreadCount = computeUnreadCount(notifications)

  // Mutations
  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationService.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  const deleteNotificationMutation = useMutation({
    mutationFn: (id: string) => notificationService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
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
    queryClient.invalidateQueries({ queryKey })
  }, [queryClient, user?.id])

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
