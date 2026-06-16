/**
 * useStudentDashboardPolling Hook
 *
 * Provides polling-based data fetching for student dashboard.
 * Polls GET /api/v1/applications/ via the application service at 30-second intervals.
 *
 * Polling Strategy:
 * - React Query polling against Django REST API
 * - Polling doubles interval when page is hidden (battery-friendly)
 * - Fingerprint-based deduplication prevents onDataChange firing on identical data
 * - onApplicationChange only fires when a specific application's status changes
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { applicationService } from '@/services/applications'

/** Threshold in ms after which polling stops entirely when tab is hidden */
const HIDDEN_PAUSE_THRESHOLD = 300000 // 5 minutes

export interface StudentApplication {
  id: string
  application_number: string
  status: string
  program: string
  created_at: string
  updated_at: string
  payment_status: string
}

export interface StudentDashboardData {
  applications: StudentApplication[]
}

export interface UseStudentDashboardPollingOptions {
  enabled?: boolean
  pollingInterval?: number
  onDataChange?: (data: StudentDashboardData) => void
  onApplicationChange?: (application: StudentApplication) => void
}

export interface UseStudentDashboardPollingReturn {
  data: StudentDashboardData | null
  isLoading: boolean
  isPolling: boolean
  error: Error | null
  refresh: () => void
  lastUpdated: Date | null
}

const POLLING_INTERVAL = 60000

/**
 * Compute a fingerprint of student applications for deduplication.
 * Compares IDs, statuses, and payment statuses — the fields that matter for dashboard display.
 * If the fingerprint is identical between polls, onDataChange is not fired.
 */
function applicationsFingerprint(apps: StudentApplication[]): string {
  const sorted = [...apps].sort((a, b) => a.id.localeCompare(b.id))
  return sorted.map((app) => `${app.id}:${app.status}:${app.payment_status}`).join('|')
}

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
  const previousAppsRef = useRef<StudentApplication[]>([])
  const previousFingerprintRef = useRef<string | null>(null)
  const onDataChangeRef = useRef<typeof onDataChange>(onDataChange)
  const onApplicationChangeRef = useRef<typeof onApplicationChange>(onApplicationChange)
  const hiddenSinceRef = useRef<number | null>(null)

  useEffect(() => {
    onDataChangeRef.current = onDataChange
  }, [onDataChange])

  useEffect(() => {
    onApplicationChangeRef.current = onApplicationChange
  }, [onApplicationChange])

  // Track page visibility to pause polling when hidden > 5 minutes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSinceRef.current = Date.now()
      } else {
        hiddenSinceRef.current = null
        // Invalidate to get fresh data when tab becomes visible again
        if (user?.id) {
          queryClient.invalidateQueries({ queryKey: ['student-dashboard-polling', user.id] })
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [queryClient, user?.id])

  const fetchData = useCallback(async (): Promise<StudentDashboardData> => {
    if (!user?.id) {
      return { applications: [] }
    }

    const result = await applicationService.list({
      page: 1,
      pageSize: 50,
      sortBy: 'date',
      sortOrder: 'desc',
      mine: true,
    })

    const applications = (result?.applications || []).map((app) => ({
      id: app.id ?? '',
      application_number: app.application_number ?? '',
      status: app.status ?? '',
      program: app.program ?? '',
      created_at: app.created_at ?? '',
      updated_at: app.updated_at ?? '',
      payment_status: app.payment_status ?? '',
    }))

    return { applications }
  }, [user?.id])


  useEffect(() => {
    previousAppsRef.current = []
    previousFingerprintRef.current = null
    setLastUpdated(null)
  }, [user?.id])

  // Track consecutive errors to back off polling on 429 / server errors
  const consecutiveErrorsRef = useRef(0)

  const query = useQuery({
    queryKey: ['student-dashboard-polling', user?.id],
    queryFn: fetchData,
    enabled: enabled && !!user?.id,
    retry: (failureCount, error) => {
      const status = (error as { status?: number })?.status
      if (status === 429) return false
      return failureCount < 1
    },
    refetchInterval: enabled
      ? () => {
          // Back off when we're getting rate-limited or repeated errors
          if (consecutiveErrorsRef.current > 0) {
            const backoff = Math.min(
              pollingInterval * Math.pow(2, consecutiveErrorsRef.current),
              5 * 60_000, // cap at 5 minutes
            )
            return backoff
          }
          if (document.visibilityState === 'visible') {
            return pollingInterval
          }
          // Tab is hidden — check how long
          const hiddenSince = hiddenSinceRef.current
          if (hiddenSince && Date.now() - hiddenSince >= HIDDEN_PAUSE_THRESHOLD) {
            return false // Stop polling entirely after 5 minutes hidden
          }
          return pollingInterval * 2
        }
      : false,
    // Half the polling interval: data stays fresh between polls without
    // refetching on every remount/focus. Fingerprint dedup already prevents
    // UI churn, so this purely cuts redundant API load on the small box.
    staleTime: 30_000,
  })

  // Reset or increment error counter based on query state
  useEffect(() => {
    if (query.isSuccess) {
      consecutiveErrorsRef.current = 0
    }
  }, [query.isSuccess])

  useEffect(() => {
    if (query.isError) {
      consecutiveErrorsRef.current = Math.min(consecutiveErrorsRef.current + 1, 6)
    }
  }, [query.isError, query.errorUpdateCount])

  // Track changes — use ref to avoid infinite loop, fingerprint to skip identical data
  useEffect(() => {
    if (!query.data) return

    const fp = applicationsFingerprint(query.data.applications)
    if (fp === previousFingerprintRef.current) {
      // Identical data — skip callback and timestamp update to prevent unnecessary re-renders
      return
    }

    previousFingerprintRef.current = fp
    setLastUpdated(new Date())
    onDataChangeRef.current?.(query.data)

    if (onApplicationChangeRef.current && previousAppsRef.current.length > 0) {
      for (const app of query.data.applications) {
        const prev = previousAppsRef.current.find((p) => p.id === app.id)
        if (prev && prev.status !== app.status) {
          onApplicationChangeRef.current(app)
        }
      }
    }

    previousAppsRef.current = query.data.applications
  }, [query.data])

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

/**
 * Granular selector: returns only the application count from student dashboard polling.
 * Shares the same cache as useStudentDashboardPolling — only re-renders when count changes.
 * Requirement 11.3: React Query granular selectors to prevent unnecessary re-renders.
 */
export function useStudentApplicationCount(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options
  const { user } = useAuth()

  return useQuery({
    queryKey: ['student-dashboard-polling', user?.id],
    queryFn: async (): Promise<StudentDashboardData> => {
      if (!user?.id) return { applications: [] }
      const result = await applicationService.list({
        page: 1,
        pageSize: 50,
        sortBy: 'date',
        sortOrder: 'desc',
        mine: true,
      })
      const applications = (result?.applications || []).map((app) => ({
        id: app.id ?? '',
        application_number: app.application_number ?? '',
        status: app.status ?? '',
        program: app.program ?? '',
        created_at: app.created_at ?? '',
        updated_at: app.updated_at ?? '',
        payment_status: app.payment_status ?? '',
      }))
      return { applications }
    },
    enabled: enabled && !!user?.id,
    select: (data) => data.applications.length,
    staleTime: 0,
  })
}

/**
 * Granular selector: returns whether any application has a specific status.
 * Shares the same cache — only re-renders when the boolean result changes.
 * Requirement 11.3: React Query granular selectors to prevent unnecessary re-renders.
 */
export function useHasApplicationWithStatus(
  targetStatus: string,
  options: { enabled?: boolean } = {}
) {
  const { enabled = true } = options
  const { user } = useAuth()

  return useQuery({
    queryKey: ['student-dashboard-polling', user?.id],
    queryFn: async (): Promise<StudentDashboardData> => {
      if (!user?.id) return { applications: [] }
      const result = await applicationService.list({
        page: 1,
        pageSize: 50,
        sortBy: 'date',
        sortOrder: 'desc',
        mine: true,
      })
      const applications = (result?.applications || []).map((app) => ({
        id: app.id ?? '',
        application_number: app.application_number ?? '',
        status: app.status ?? '',
        program: app.program ?? '',
        created_at: app.created_at ?? '',
        updated_at: app.updated_at ?? '',
        payment_status: app.payment_status ?? '',
      }))
      return { applications }
    },
    enabled: enabled && !!user?.id,
    select: (data) => data.applications.some((app) => app.status === targetStatus),
    staleTime: 0,
  })
}
