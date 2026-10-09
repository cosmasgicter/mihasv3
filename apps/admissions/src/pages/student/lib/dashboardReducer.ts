import type { Application, Intake, ApplicationInterview } from '@/types/database'
import type { QueryClient } from '@tanstack/react-query'
import type { PaginatedApplicationsResponse } from '@/services/applications'

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
    // Task 10.6 (R13.13): the one canonical workspace key.
    queryClient.removeQueries({ queryKey: ['application-workspace', id] })
  })
}

/*
 * `executeClearAllDrafts` lived here until admissions-v2 task 11.1 (R10.10,
 * findings STU-04 / STU-12).
 *
 * It called `draftManager.clearAllDrafts(userId)` — a global wipe of every draft
 * the student had, plus a sweep of every draft key in `localStorage` — from a
 * control that sat on the dashboard beside "Continue application". Draft deletion
 * is now addressed to exactly one `(user, application)` by
 * `lib/studentDraftCleanup.ts::deleteStudentDraft`, which is task 6.3's rule, and
 * it is offered per draft inside `DraftManagementCard` rather than as a bulk
 * shortcut on a primary workflow (R16.5).
 *
 * Nothing replaced it: there is no clear-all on any student surface.
 */
