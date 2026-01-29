/**
 * useStudentDashboardPolling Hook
 * 
 * Provides polling-based data fetching for student dashboard.
 * Replaces Supabase Realtime with React Query polling (30-second intervals).
 * 
 * @module hooks/useStudentDashboardPolling
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export interface StudentApplication {
  id: string
  application_number: string
  status: string
  program: string
  created_at: string
  updated_at: string
  payment_status: string
}

export interface StudentNotification {
  id: string
  title: string
  message: string
  type: string
  is_read: boolean
  created_at: string
}

export interface StudentDashboardData {
  applications: StudentApplication[]
  notifications: StudentNotification[]
  unreadCount: number
}

export interface UseStudentDashboardPollingOptions {
  /** Whether to enable polling (default: true) */
  enabled?: boolean
  /** Polling interval in milliseconds (default: 30000 = 30 seconds) */
  pollingInterval?: number
  /** Callback when data changes */
  onDataChange?: (data: StudentDashboardData) => void
  /** Callback when application status changes */
  onApplicationChange?: (application: StudentApplication) => void
}

export interface UseStudentDashboardPollingReturn {
  /** Current dashboard data */
  data: StudentDashboardData | null
  /** Whether data is currently loading */
  isLoading: boolean
  /** Whether polling is active */
  isPolling: boolean
  /** Any error that occurred */
  error: Error | null
  /** Manually refresh data */
  refresh: () => void
  /** Last update timestamp */
  lastUpdated: Date | null
}

const POLLING_INTERVAL = 30000 // 30 seconds

/**
 * Hook for polling student dashboard data
 * 
 * @example
 * ```tsx
 * function StudentDashboard() {
 *   const { data, isLoading, isPolling, refresh } = useStudentDashboardPolling({
 *     onApplicationChange: (app) => {
 *       toast.info(`Application ${app.application_number} updated`)
 *     }
 *   })
 *   
 *   return (
 *     <div>
 *       {isPolling && <span>Live updates active</span>}
 *       <p>Applications: {data?.applications.length}</p>
 *       <p>Unread: {data?.unreadCount}</p>
 *     </div>
 *   )
 * }
 * ```
 */
export function useStudentDashboardPolling(
  options: UseStudentDashboardPollingOptions = {}
): UseStudentDashboardPollingReturn {
  const {
    enabled = true,
    pollingInterval = POLLING_INTERVAL,
    onDataChange,
    onApplicationChange,
  } = options

  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [previousApplications, setPreviousApplications] = useState<StudentApplication[]>([])

  // Fetch student dashboard data
  const fetchData = useCallback(async (): Promise<StudentDashboardData> => {
    if (!user?.id) {
      return { applications: [], notifications: [], unreadCount: 0 }
    }

    const [applicationsResult, notificationsResult] = await Promise.all([
      supabase
        .from('applications')
        .select('id, application_number, status, program, created_at, updated_at, payment_status')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('notifications')
        .select('id, title, message, type, is_read, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    const applications = (applicationsResult.data || []) as StudentApplication[]
    const notifications = (notificationsResult.data || []) as StudentNotification[]
    const unreadCount = notifications.filter((n) => !n.is_read).length

    return { applications, notifications, unreadCount }
  }, [user?.id])

  const query = useQuery({
    queryKey: ['student-dashboard-polling', user?.id],
    queryFn: fetchData,
    enabled: enabled && !!user?.id,
    refetchInterval: enabled ? pollingInterval : false,
    staleTime: pollingInterval / 2,
  })

  // Track changes and notify
  useEffect(() => {
    if (query.data) {
      setLastUpdated(new Date())
      onDataChange?.(query.data)

      // Check for application status changes
      if (onApplicationChange && previousApplications.length > 0) {
        query.data.applications.forEach((app) => {
          const prev = previousApplications.find((p) => p.id === app.id)
          if (prev && prev.status !== app.status) {
            onApplicationChange(app)
          }
        })
      }

      setPreviousApplications(query.data.applications)
    }
  }, [query.data, onDataChange, onApplicationChange, previousApplications])

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['student-dashboard-polling', user?.id] })
  }, [queryClient, user?.id])

  return {
    data: query.data || null,
    isLoading: query.isLoading,
    isPolling: enabled && !query.isLoading && !!user?.id,
    error: query.error as Error | null,
    refresh,
    lastUpdated,
  }
}

export default useStudentDashboardPolling
