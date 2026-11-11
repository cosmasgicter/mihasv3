import { useCallback, useState } from 'react'

import { getEnvVariable } from '@/lib/env'
import type { ApplicationRosterQuery } from '@/services/admin/applications'

export interface ApplicationFilters {
  searchTerm: string
  statusFilter: string
  paymentFilter: string
  programFilter: string
  institutionFilter: string
  draftFilter: string // 'all' | 'drafts' | 'completed'
  assignedReviewerFilter: string
  lateSubmissionFilter: string
  pendingAmendmentsFilter: string
  reviewQueueFilter: string
  overdueReviewFilter: string
  pendingDocumentsFilter: string
  upcomingInterviewsFilter: string
  /**
   * An open condition or enrollment confirmation falls due inside the server's
   * deadline window (task 9.1, ADM-01).
   *
   * The dashboard's "Deadlines in 48h" tile always linked to
   * `?deadlinePressureFilter=true`, but the key was not in
   * `APPLICATION_FILTER_KEYS`, so the roster dropped it and showed an
   * *unfiltered* list — the tile's number and the page it opened described
   * different sets. It is a registered parameter on both sides now
   * (`deadline_pressure` in `query_service.REGISTERED_PARAMETERS`).
   */
  deadlinePressureFilter: string
}

export const DEFAULT_APPLICATION_FILTERS: ApplicationFilters = {
  searchTerm: '',
  statusFilter: '',
  paymentFilter: '',
  programFilter: '',
  institutionFilter: '',
  draftFilter: 'all',
  assignedReviewerFilter: '',
  lateSubmissionFilter: '',
  pendingAmendmentsFilter: '',
  reviewQueueFilter: '',
  overdueReviewFilter: '',
  pendingDocumentsFilter: '',
  upcomingInterviewsFilter: '',
  deadlinePressureFilter: '',
}

export const DRAFT_FILTER_OPTIONS = [
  { value: 'all', label: 'All applications' },
  { value: 'drafts', label: 'Drafts only' },
  { value: 'completed', label: 'Completed only' }
] as const

export const APPLICATION_FILTER_KEYS = [
  'searchTerm',
  'statusFilter',
  'paymentFilter',
  'programFilter',
  'institutionFilter',
  'draftFilter',
  'assignedReviewerFilter',
  'lateSubmissionFilter',
  'pendingAmendmentsFilter',
  'reviewQueueFilter',
  'overdueReviewFilter',
  'pendingDocumentsFilter',
  'upcomingInterviewsFilter',
  'deadlinePressureFilter'
] as const satisfies ReadonlyArray<keyof ApplicationFilters>

type ApplicationFilterKey = typeof APPLICATION_FILTER_KEYS[number]

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Whether a filter value is a canonical id rather than a display label. */
export const isCanonicalId = (value: string): boolean => UUID_PATTERN.test(value.trim())

/**
 * UI filter key → the **registered** query parameter that expresses it
 * (task 9.1, ADM-01).
 *
 * This is the vocabulary a *link* is written in. Before 9.1 the roster's URL
 * carried these UI names (`?deadlinePressureFilter=true`), which meant the
 * platform had two spellings for one query: dashboard tiles emitted UI names,
 * while the backend's own review-SLA notification emitted
 * `?status=submitted,under_review` — a registered name the roster's URL reader
 * did not look for, so that link opened an **unfiltered** list. One vocabulary
 * removes the whole class of failure: a link written by a tile, by a Celery
 * task, by an operator, or by a saved filter is the same query.
 *
 * `draftFilter` is absent on purpose: it is not a parameter of its own but a
 * lens over `status` / `exclude_status` (see `toApplicationRosterQuery`), and it
 * round-trips through those two registered names.
 */
export const REGISTERED_PARAMETER_BY_FILTER_KEY = {
  searchTerm: 'search',
  statusFilter: 'status',
  paymentFilter: 'payment_status',
  programFilter: 'program',
  institutionFilter: 'institution',
  assignedReviewerFilter: 'reviewer_assignment',
  lateSubmissionFilter: 'is_late_submission',
  pendingAmendmentsFilter: 'has_pending_amendments',
  reviewQueueFilter: 'review_queue',
  overdueReviewFilter: 'overdue_review',
  pendingDocumentsFilter: 'has_pending_documents',
  upcomingInterviewsFilter: 'has_upcoming_interviews',
  deadlinePressureFilter: 'deadline_pressure',
} as const satisfies Partial<Record<ApplicationFilterKey, string>>

/**
 * Registered parameters that carry a canonical **id** for a dimension whose
 * filter value may also be a display label. Reading either spelling back into
 * the same UI filter is what lets a facet-driven select (ids) and a pre-9.1
 * bookmark (names) both survive a round trip.
 */
const ID_PARAMETER_BY_FILTER_KEY = {
  programFilter: 'program_offering_id',
  institutionFilter: 'institution_id',
} as const satisfies Partial<Record<ApplicationFilterKey, string>>

/** Every registered parameter name this surface can read from, or write to, a URL. */
export const ROSTER_URL_PARAMETERS: readonly string[] = [
  ...Object.values(REGISTERED_PARAMETER_BY_FILTER_KEY),
  ...Object.values(ID_PARAMETER_BY_FILTER_KEY),
  'exclude_status',
]

/**
 * Read one roster view out of a URL, in registered parameter names.
 *
 * Legacy UI names are still accepted as aliases so a bookmark saved before 9.1
 * — and the `sessionStorage` slot written by earlier builds — keeps opening the
 * view it described. The registered spelling wins when both are present, and
 * `applicationFiltersToSearchParams` only ever writes the registered one, so a
 * legacy link is upgraded the first time it is opened rather than preserved
 * forever.
 */
export function applicationFiltersFromSearchParams(
  params: URLSearchParams
): Partial<ApplicationFilters> {
  const partial: Partial<ApplicationFilters> = {}

  for (const key of APPLICATION_FILTER_KEYS) {
    // Legacy UI-name alias first, so the registered name can overwrite it.
    const legacy = params.get(key)
    if (legacy !== null) partial[key] = legacy

    const registered = (REGISTERED_PARAMETER_BY_FILTER_KEY as Record<string, string>)[key]
    if (registered) {
      const value = params.get(registered)
      if (value !== null) partial[key] = value
    }

    const idParameter = (ID_PARAMETER_BY_FILTER_KEY as Record<string, string>)[key]
    if (idParameter) {
      const value = params.get(idParameter)
      if (value !== null) partial[key] = value
    }
  }

  // The draft lens is `status` / `exclude_status`, not a parameter of its own.
  const excluded = params.get('exclude_status')
  if (excluded && excluded.split(',').some(entry => entry.trim() === 'draft')) {
    partial.draftFilter = 'completed'
  }
  if (partial.statusFilter?.trim() === 'draft') {
    partial.draftFilter = 'drafts'
    partial.statusFilter = ''
  }

  return partial
}

/**
 * Write one roster view into a URL, in registered parameter names only.
 *
 * Mutates and returns the params it is given so unrelated query parameters on
 * the address (a tenant selection, a tracking parameter) survive.
 */
export function applicationFiltersToSearchParams(
  filters: ApplicationFilters,
  params: URLSearchParams = new URLSearchParams()
): URLSearchParams {
  // Clear every spelling this surface owns, including the legacy UI names, so a
  // cleared filter cannot survive in the other vocabulary.
  for (const key of APPLICATION_FILTER_KEYS) params.delete(key)
  for (const name of ROSTER_URL_PARAMETERS) params.delete(name)

  const query = toApplicationRosterQuery(filters)
  for (const name of ROSTER_URL_PARAMETERS) {
    const value = (query as Record<string, unknown>)[name]
    if (typeof value === 'string' && value) params.set(name, value)
  }

  return params
}

/**
 * The single UI-filter → registered-server-parameter map (task 9.1, ADM-01).
 *
 * Every roster read, the CSV export path, and every saved filter go through
 * this one function, so a URL, a stored query, and a request are the same thing.
 * The right-hand names are the contract's own
 * (`backend/apps/applications/query_service.py:REGISTERED_PARAMETERS`) and a
 * drift test asserts every value here is registered there — which is how the
 * ignored-parameter half of ADM-01 stays fixed instead of being fixed once.
 */
export function toApplicationRosterQuery(
  filters: ApplicationFilters,
  options: { page?: number; pageSize?: number; sort?: string; order?: 'asc' | 'desc' } = {}
): ApplicationRosterQuery {
  const query: ApplicationRosterQuery = {}

  if (filters.searchTerm.trim()) query.search = filters.searchTerm.trim()
  if (filters.paymentFilter) query.payment_status = filters.paymentFilter

  // The program and institution selects are fed by the server's facets, whose
  // option values are canonical ids — so the precise, scope-resolved identifier
  // parameter is used whenever the value is one. A pre-9.1 bookmark or a typed
  // link still carries a display *name*, which stays a label match instead of
  // becoming an unresolvable id (and therefore a 404 the operator cannot read).
  if (filters.programFilter) {
    if (isCanonicalId(filters.programFilter)) {
      query.program_offering_id = filters.programFilter
    } else {
      query.program = filters.programFilter
    }
  }
  if (filters.institutionFilter) {
    if (isCanonicalId(filters.institutionFilter)) {
      query.institution_id = filters.institutionFilter
    } else {
      query.institution = filters.institutionFilter
    }
  }
  if (filters.assignedReviewerFilter) query.reviewer_assignment = filters.assignedReviewerFilter
  if (filters.lateSubmissionFilter) query.is_late_submission = filters.lateSubmissionFilter
  if (filters.pendingAmendmentsFilter) query.has_pending_amendments = filters.pendingAmendmentsFilter
  if (filters.reviewQueueFilter) query.review_queue = filters.reviewQueueFilter
  if (filters.overdueReviewFilter) query.overdue_review = filters.overdueReviewFilter
  if (filters.pendingDocumentsFilter) query.has_pending_documents = filters.pendingDocumentsFilter
  if (filters.upcomingInterviewsFilter) query.has_upcoming_interviews = filters.upcomingInterviewsFilter
  if (filters.deadlinePressureFilter) query.deadline_pressure = filters.deadlinePressureFilter

  // Status and the draft lens are one dimension on the server: an explicit
  // status wins, `drafts` narrows to draft, and `completed` excludes it. The
  // browser used to hold these as two independent selects that could contradict
  // each other on the same request.
  if (filters.statusFilter) {
    query.status = filters.statusFilter
  } else if (filters.draftFilter === 'drafts') {
    query.status = 'draft'
  }
  if (filters.draftFilter === 'completed') {
    query.exclude_status = 'draft'
  }

  if (options.sort) query.sort = options.sort
  if (options.order) query.order = options.order
  if (options.page) query.page = options.page
  if (options.pageSize) query.pageSize = options.pageSize

  return query
}

const STORAGE_KEY = getEnvVariable('VITE_ADMIN_FILTERS_STORAGE_KEY', 'admin_applications_filters')

const isBrowserEnvironment = () => typeof window !== 'undefined'

const pickFilters = (value: unknown): Partial<ApplicationFilters> => {
  if (!value || typeof value !== 'object') {
    return {}
  }

  const partial: Partial<ApplicationFilters> = {}

  for (const key of APPLICATION_FILTER_KEYS) {
    const candidate = (value as Record<string, unknown>)[key]
    if (typeof candidate === 'string') {
      partial[key] = candidate
    }
  }

  return partial
}

const readFiltersFromSession = (): Partial<ApplicationFilters> => {
  if (!isBrowserEnvironment()) {
    return {}
  }

  try {
    const storedValue = window.sessionStorage.getItem(STORAGE_KEY)
    if (!storedValue) {
      return {}
    }

    const parsed = JSON.parse(storedValue) as unknown
    return pickFilters(parsed)
  } catch (error) {
    return {}
  }
}

const readFiltersFromSearchParams = (params?: URLSearchParams): Partial<ApplicationFilters> =>
  params ? applicationFiltersFromSearchParams(params) : {}

const normalizeFilters = (partial?: Partial<ApplicationFilters>): ApplicationFilters => ({
  ...DEFAULT_APPLICATION_FILTERS,
  ...(partial ?? {})
})

const areFiltersEqual = (a: ApplicationFilters, b: ApplicationFilters) =>
  APPLICATION_FILTER_KEYS.every(key => a[key] === b[key])

const persistFilters = (filters: ApplicationFilters) => {
  if (!isBrowserEnvironment()) {
    return
  }

  const hasActiveFilters = APPLICATION_FILTER_KEYS.some(key => filters[key])

  try {
    if (hasActiveFilters) {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY)
    }
  } catch (error) {
  }
}

const resolveInitialFilters = (): ApplicationFilters => {
  if (!isBrowserEnvironment()) {
    return { ...DEFAULT_APPLICATION_FILTERS }
  }

  const sessionFilters = readFiltersFromSession()
  const urlFilters = readFiltersFromSearchParams(new URLSearchParams(window.location.search))

  return normalizeFilters({ ...sessionFilters, ...urlFilters })
}

export function useApplicationFilters() {
  const [filters, setFiltersState] = useState<ApplicationFilters>(() => resolveInitialFilters())

  const setFilters = useCallback(
    (updater: ApplicationFilters | ((prev: ApplicationFilters) => ApplicationFilters)) => {
      setFiltersState(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        const normalized = normalizeFilters(next)

        if (areFiltersEqual(prev, normalized)) {
          return prev
        }

        persistFilters(normalized)
        return normalized
      })
    },
    []
  )

  const updateFilter = useCallback(
    (key: ApplicationFilterKey, value: string) => {
      setFilters(prev => ({ ...prev, [key]: value }))
    },
    [setFilters]
  )

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_APPLICATION_FILTERS)
  }, [setFilters])

  return {
    filters,
    updateFilter,
    resetFilters,
    setFilters
  }
}
