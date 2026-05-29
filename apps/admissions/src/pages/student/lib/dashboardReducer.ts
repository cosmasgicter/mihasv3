import type { Application, Intake, ApplicationInterview } from '@/types/database'
import type { QueryClient } from '@tanstack/react-query'
import type { PaginatedApplicationsResponse } from '@/services/applications'
import { draftManager } from '@/lib/draftManager'
import { useToastStore } from '@/hooks/useToast'
import { logApiError } from '@/lib/apiErrorLogger'
import { toError } from '@/lib/toError'

// -- State ------------------------------------------------------------------

export interface DashboardState {
  applications: Application[]
  intakes: Intake[]
  scheduledInterviews: ApplicationInterview[]
  isInitialLoading: boolean
  isRefreshing: boolean
  applicationsError: string
  intakesError: string
  interviewsError: string
  sessionError: string
  hasDraft: boolean
  isClearingAllDrafts: boolean
}

export const initialDashboardState: DashboardState = {
  applications: [],
  intakes: [],
  scheduledInterviews: [],
  isInitialLoading: true,
  isRefreshing: false,
  applicationsError: '',
  intakesError: '',
  interviewsError: '',
  sessionError: '',
  hasDraft: false,
  isClearingAllDrafts: false,
}

// -- Actions ----------------------------------------------------------------

export type DashboardAction =
  | { type: 'SET_APPLICATIONS'; payload: Application[] }
  | { type: 'SET_INTAKES'; payload: Intake[] }
  | { type: 'SET_SCHEDULED_INTERVIEWS'; payload: ApplicationInterview[] }
  | { type: 'SET_INITIAL_LOADING'; payload: boolean }
  | { type: 'SET_REFRESHING'; payload: boolean }
  | { type: 'SET_APPLICATIONS_ERROR'; payload: string }
  | { type: 'SET_INTAKES_ERROR'; payload: string }
  | { type: 'SET_INTERVIEWS_ERROR'; payload: string }
  | { type: 'SET_SESSION_ERROR'; payload: string }
  | { type: 'SET_HAS_DRAFT'; payload: boolean }
  | { type: 'SET_CLEARING_DRAFTS'; payload: boolean }
  | { type: 'RESET_ALL' }
  | { type: 'LOAD_START'; isInitial: boolean }
  | { type: 'LOAD_COMPLETE'; isInitial: boolean }

// -- Reducer ----------------------------------------------------------------

export function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case 'SET_APPLICATIONS':
      return { ...state, applications: action.payload }
    case 'SET_INTAKES':
      return { ...state, intakes: action.payload }
    case 'SET_SCHEDULED_INTERVIEWS':
      return { ...state, scheduledInterviews: action.payload }
    case 'SET_INITIAL_LOADING':
      return { ...state, isInitialLoading: action.payload }
    case 'SET_REFRESHING':
      return { ...state, isRefreshing: action.payload }
    case 'SET_APPLICATIONS_ERROR':
      return { ...state, applicationsError: action.payload }
    case 'SET_INTAKES_ERROR':
      return { ...state, intakesError: action.payload }
    case 'SET_INTERVIEWS_ERROR':
      return { ...state, interviewsError: action.payload }
    case 'SET_SESSION_ERROR':
      return { ...state, sessionError: action.payload }
    case 'SET_HAS_DRAFT':
      return { ...state, hasDraft: action.payload }
    case 'SET_CLEARING_DRAFTS':
      return { ...state, isClearingAllDrafts: action.payload }
    case 'RESET_ALL':
      return { ...initialDashboardState, isInitialLoading: false }
    case 'LOAD_START':
      return action.isInitial
        ? { ...state, isInitialLoading: true }
        : { ...state, isRefreshing: true }
    case 'LOAD_COMPLETE':
      return action.isInitial
        ? { ...state, isInitialLoading: false }
        : { ...state, isRefreshing: false }
    default:
      return state
  }
}

// -- Draft suppression utilities --------------------------------------------

const deletedDraftIds = new Set<string>()
let suppressionTimer: ReturnType<typeof setTimeout> | null = null

export function suppressDeletedDraftIds(ids: string[]): void {
  const cleanIds = ids.filter((id) => typeof id === 'string' && id.length > 0)
  if (cleanIds.length === 0) return
  cleanIds.forEach((id) => deletedDraftIds.add(id))
  if (suppressionTimer) clearTimeout(suppressionTimer)
  suppressionTimer = setTimeout(() => {
    deletedDraftIds.clear()
    suppressionTimer = null
  }, 30_000)
}

export function clearSuppressionTimers(): void {
  if (suppressionTimer) {
    clearTimeout(suppressionTimer)
    suppressionTimer = null
  }
}

export function filterSuppressedDrafts(items: Application[]): Application[] {
  return items.filter((app) => !deletedDraftIds.has(app.id))
}

export function removeDraftsFromApplicationCaches(queryClient: QueryClient, ids: string[]): void {
  const idsToRemove = new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))
  if (idsToRemove.size === 0) return
  queryClient.setQueriesData<PaginatedApplicationsResponse>(
    { queryKey: ['applications'] },
    (current) => {
      if (!current || !Array.isArray(current.applications)) return current
      const apps = current.applications.filter((app) => !idsToRemove.has(app.id))
      return {
        ...current,
        applications: apps,
        totalCount: Math.max(0, (current.totalCount ?? current.applications.length) - (current.applications.length - apps.length)),
      }
    },
  )
  idsToRemove.forEach((id) => {
    queryClient.removeQueries({ queryKey: ['applications', 'detail', id] })
    queryClient.removeQueries({ queryKey: ['application-detail', id] })
  })
}

// -- Clear all drafts helper ------------------------------------------------

export interface ClearAllDraftsParams {
  userId: string
  applications: Application[]
  dispatch: React.Dispatch<DashboardAction>
  queryClient: QueryClient
  reload: () => Promise<void>
}

export async function executeClearAllDrafts({
  userId,
  applications,
  dispatch,
  queryClient,
  reload,
}: ClearAllDraftsParams): Promise<void> {
  dispatch({ type: 'SET_CLEARING_DRAFTS', payload: true })
  try {
    const draftIdsBeforeDelete = applications.filter((a) => a.status === 'draft').map((a) => a.id)
    const deleteResult = await draftManager.clearAllDrafts(userId)
    const deletedIds = deleteResult.deletedIds?.length ? deleteResult.deletedIds : (deleteResult.success ? draftIdsBeforeDelete : [])

    if (deletedIds.length > 0) {
      suppressDeletedDraftIds(deletedIds)
      removeDraftsFromApplicationCaches(queryClient, deletedIds)
      dispatch({ type: 'SET_APPLICATIONS', payload: applications.filter(app => !deletedIds.includes(app.id)) })
    }

    if (!deleteResult.success) {
      if (deleteResult.code === 'DRAFT_HAS_PAYMENT_ACTIVITY') {
        dispatch({ type: 'SET_APPLICATIONS_ERROR', payload: '' })
        dispatch({ type: 'SET_HAS_DRAFT', payload: true })
        useToastStore.getState().warning('Draft protected', 'Some drafts have payment activity and cannot be deleted. Continue the application or contact admissions for help.')
        await reload()
        return
      }
      const errorMessage = deleteResult.error || 'Failed to clear all drafts from the server'
      dispatch({ type: 'SET_APPLICATIONS_ERROR', payload: errorMessage })
      useToastStore.getState().addToast('error', errorMessage)
      await reload()
      return
    }

    if (deletedIds.length === 0) {
      dispatch({ type: 'SET_APPLICATIONS', payload: applications.filter(app => app.status !== 'draft') })
    }
    dispatch({ type: 'SET_HAS_DRAFT', payload: false })
    dispatch({ type: 'SET_APPLICATIONS_ERROR', payload: '' })
    useToastStore.getState().addToast('success', 'All drafts cleared successfully')
    await reload()
  } catch (error) {
    logApiError('student-dashboard', '/api/v1/applications/ (clear drafts)', error)
    const errorMsg = toError(error).message || 'Failed to clear drafts'
    dispatch({ type: 'SET_APPLICATIONS_ERROR', payload: errorMsg })
    useToastStore.getState().addToast('error', errorMsg)
  } finally {
    dispatch({ type: 'SET_CLEARING_DRAFTS', payload: false })
  }
}
