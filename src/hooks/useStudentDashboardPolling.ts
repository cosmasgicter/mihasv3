/**
 * useStudentDashboardPolling Hook
 * 
 * Provides polling-based data fetching for student dashboard.
 * Uses React Query polling (30-second intervals) against the API.
 * 
 * MIGRATED: Replaced Supabase direct calls with API client.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { applicationService } from '@/services/applications'

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

const POLLING_INTERVAL = 30000

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
  const onDataChangeRef = useRef<typeof onDataChange>(onDataChange)
  const onApplicationChangeRef = useRef<typeof onApplicationChange>(onApplicationChange)

  useEffect(() => {
    onDataChangeRef.current = onDataChange
  }, [onDataChange])

  useEffect(() => {
    onApplicationChangeRef.current = onApplicationChange
  }, [onApplicationChange])

  const fetchData = useCallback(async (): Promise<StudentDashboardData> => {
    if (!user?.id) {
      return { applications: [] }
    }

    const result = await applicationService.list({
      page: 0,
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
    setLastUpdated(null)
  }, [user?.id])

  const query = useQuery({
    queryKey: ['student-dashboard-polling', user?.id],
    queryFn: fetchData,
    enabled: enabled && !!user?.id,
    refetchInterval: enabled ? pollingInterval : false,
    staleTime: pollingInterval / 2,
  })

  // Track changes — use ref to avoid infinite loop
  useEffect(() => {
    if (!query.data) return

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
