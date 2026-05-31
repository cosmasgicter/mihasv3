import { useCallback, useEffect, useReducer, useRef } from 'react'
import { adminDashboardService } from '@/services/admin/dashboard'
import type {
  AdminDashboardActivity,
  AdminDashboardDiagnostics,
  AdminDashboardStats,
} from '@/services/admin/dashboard'

interface MinimalUser {
  id?: string | null
}

const INITIAL_STATS: AdminDashboardStats = {
  totalApplications: 0,
  pendingApplications: 0,
  approvedApplications: 0,
  conditionallyApprovedApplications: 0,
  enrolledApplications: 0,
  acceptedApplications: 0,
  rejectedApplications: 0,
  totalPrograms: 0,
  activeIntakes: 0,
  totalStudents: 0,
  todayApplications: 0,
  weekApplications: 0,
  monthApplications: 0,
  avgProcessingTime: 0,
  avgProcessingTimeHours: 0,
  medianProcessingTimeHours: 0,
  p95ProcessingTimeHours: 0,
  decisionVelocity24h: 0,
  activeUsers: 0,
  activeUsersLast7d: 0,
  systemHealth: 'good',
  pendingPayments: 0,
  pendingDocuments: 0,
  upcomingInterviews: 0,
  overdueReviews: 0,
  conditionsExpiringSoon: 0,
  enrollmentsExpiringSoon: 0,
}

export type DashboardPhase = 'idle' | 'initial-loading' | 'success' | 'refreshing' | 'error'

export interface DashboardState {
  phase: DashboardPhase
  stats: AdminDashboardStats
  recentActivity: AdminDashboardActivity[]
  error: string | null
  errorIsNetwork: boolean
  lastUpdated: Date | null
  hasLoadedOnce: boolean
}

type Action =
  | { type: 'load-start'; isRefresh: boolean }
  | { type: 'load-success'; stats: AdminDashboardStats; activity: AdminDashboardActivity[]; emptyPayload: boolean }
  | { type: 'load-error'; message: string; isNetwork: boolean }
  | { type: 'patch-stats'; patch: Partial<AdminDashboardStats> }
  | { type: 'patch-activity'; activity: AdminDashboardActivity[] }

const initialState: DashboardState = {
  phase: 'idle',
  stats: INITIAL_STATS,
  recentActivity: [],
  error: null,
  errorIsNetwork: false,
  lastUpdated: null,
  hasLoadedOnce: false,
}

function reducer(state: DashboardState, action: Action): DashboardState {
  switch (action.type) {
    case 'load-start':
      return {
        ...state,
        phase: action.isRefresh ? 'refreshing' : 'initial-loading',
        error: null,
        errorIsNetwork: false,
      }
    case 'load-success':
      return {
        ...state,
        phase: 'success',
        stats: action.stats,
        recentActivity: action.activity,
        lastUpdated: new Date(),
        hasLoadedOnce: true,
        error: action.emptyPayload
          ? 'Dashboard API returned an empty payload. Data is available but currently empty, not crashed.'
          : null,
        errorIsNetwork: false,
      }
    case 'load-error':
      return {
        ...state,
        phase: 'error',
        error: action.message,
        errorIsNetwork: action.isNetwork,
      }
    case 'patch-stats':
      return {
        ...state,
        stats: { ...state.stats, ...action.patch },
        lastUpdated: new Date(),
      }
    case 'patch-activity':
      return {
        ...state,
        recentActivity: action.activity,
        lastUpdated: new Date(),
      }
  }
}

function isNetworkFailure(d: AdminDashboardDiagnostics): boolean {
  const msg = d.errorMessage ?? ''
  return msg.includes('Network') || msg.includes('fetch') || d.status === 503
}

export interface UseAdminDashboardLoaderResult extends DashboardState {
  load: (mode?: 'initial' | 'manual') => Promise<void>
  patchStats: (patch: Partial<AdminDashboardStats>) => void
  patchActivity: (activity: AdminDashboardActivity[]) => void
  isInitialLoading: boolean
  isRefreshing: boolean
}

/**
 * Owns the admin dashboard load lifecycle: initial fetch, manual refresh,
 * and incremental polling patches. Consolidates what were previously 13
 * separate ``useState`` calls and a verbose ``apiStatus`` diagnostic
 * object into a single deterministic reducer.
 */
export function useAdminDashboardLoader(user: MinimalUser | null | undefined): UseAdminDashboardLoaderResult {
  const [state, dispatch] = useReducer(reducer, initialState)
  // Track the most recent in-flight request so stale responses cannot
  // overwrite fresher state when the user mashes the refresh button.
  const requestIdRef = useRef(0)
  const loadedForUserIdRef = useRef<string | null>(null)

  const load = useCallback(async (mode: 'initial' | 'manual' = 'initial') => {
    const isRefresh = mode !== 'initial'
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    dispatch({ type: 'load-start', isRefresh })

    const result = await adminDashboardService.getOverviewWithDiagnostics()

    if (requestIdRef.current !== requestId) {
      return // a newer request landed first; discard this response
    }

    if (!result.diagnostics.ok) {
      dispatch({
        type: 'load-error',
        message: `Failed to load dashboard data: ${result.diagnostics.errorMessage ?? 'Unknown dashboard API error'}`,
        isNetwork: isNetworkFailure(result.diagnostics),
      })
      return
    }

    dispatch({
      type: 'load-success',
      stats: result.data.stats,
      activity: result.data.recentActivity ?? [],
      emptyPayload: result.diagnostics.responseShape === 'empty',
    })
  }, [])

  const patchStats = useCallback((patch: Partial<AdminDashboardStats>) => {
    dispatch({ type: 'patch-stats', patch })
  }, [])

  const patchActivity = useCallback((activity: AdminDashboardActivity[]) => {
    dispatch({ type: 'patch-activity', activity })
  }, [])

  // Run the initial load exactly once per authenticated user id.
  useEffect(() => {
    const userId = user?.id ?? null
    if (!userId) {
      loadedForUserIdRef.current = null
      return
    }
    if (loadedForUserIdRef.current === userId) {
      return
    }
    loadedForUserIdRef.current = userId
    void load('initial')
  }, [user?.id, load])

  return {
    ...state,
    load,
    patchStats,
    patchActivity,
    isInitialLoading: state.phase === 'initial-loading',
    isRefreshing: state.phase === 'refreshing',
  }
}
