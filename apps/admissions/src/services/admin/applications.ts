/**
 * The scoped applications roster read (Admissions V2, task 9.1).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.1 — "Create one
 * scoped applications query and aggregate contract".
 * Requirements: **R8.1** (list, filters, facets, search, pagination, aggregates,
 * and dashboard links come from one scoped query contract, and portfolio totals
 * are never inferred from one page), **R8.6** (definition-labelled, scope-aware
 * metrics; missing data never becomes a healthy zero).
 * Findings: **ADM-01** — "Application totals, filters, and select options are
 * derived from the currently loaded page. A dashboard link emits a filter the
 * parser ignores."
 *
 * What this module is *not*: it does not count, filter, group, or total
 * anything. The roster's rows, its whole-set aggregates, its filter options
 * (facets), its page arithmetic, and its export are all server decisions. This
 * sends the query and hands back the answer — which is the entire point of
 * ADM-01, because the browser used to do all five.
 *
 * The parameter names here are the **registered** ones
 * (`backend/apps/applications/query_service.py:REGISTERED_PARAMETERS`), so a
 * dashboard deep link can be checked against the contract instead of hoped
 * about. Anything outside that set comes back in
 * `filters.unknown_parameters` rather than being silently dropped.
 */
import { apiClient, buildQueryString, toApiV1Path } from '../client'
import { API_BASE } from '../httpClient'
import { logApiError } from '@/lib/apiErrorLogger'

/** One roster row. Canonical ids are the authority; labels are display. */
export interface ApplicationRosterRow {
  id: string
  /**
   * The version this row was read at (task 9.4, R8.4).
   *
   * Carried so a bulk decision can state, per application, which version the
   * operator was looking at when they selected it. It is a concurrency token,
   * not a report column — it is deliberately absent from the CSV export.
   */
  version: number
  application_number: string | null
  public_tracking_code: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  status: string
  payment_status: string
  institution_id: string | null
  institution_name: string
  program_offering_id: string | null
  program_name: string
  intake_id: string | null
  intake_name: string
  assigned_reviewer_id: string | null
  is_late_submission: boolean
  waitlist_position: number | null
  next_deadline_at: string | null
  submitted_at: string | null
  created_at: string | null
  updated_at: string | null
  activity_at: string | null
  /** Platform-only cross-tenant context: withheld for a tenant actor. */
  peer_offering_count?: number | null
  /** Current document versions, and how many are verified (task 30.4). */
  current_document_count?: number | null
  verified_document_count?: number | null
}

/**
 * Whole-filtered-set counters. Every one of these was computed in the browser
 * over the loaded page before 9.1; each now arrives with its own definition so
 * a number on screen can be explained without reading the query service.
 */
export interface ApplicationAggregates {
  total: number
  draft_count: number
  submitted_count: number
  under_review_count: number
  decision_queue_count: number
  waitlisted_count: number
  approved_count: number
  conditionally_approved_count: number
  enrolled_count: number
  accepted_count: number
  rejected_count: number
  withdrawn_count: number
  payment_resolved_count: number
  payment_pending_count: number
  payment_rejected_count: number
  payment_unpaid_count: number
  late_submission_count: number
  unassigned_count: number
  overdue_review_count: number
  deadline_pressure_count: number
  today_activity_count: number
  first_created_at: string | null
  last_activity_at: string | null
  next_deadline_at: string | null
  review_sla_days: number
  deadline_pressure_hours: number
  row_limit: number
  definitions: Record<string, string>
}

/** One filter option with its own count, over the whole filtered set. */
export interface FacetOption {
  value: string | null
  label: string
  count: number
}

export interface Facet {
  options: FacetOption[]
  /** The server had more options than its facet ceiling; the list is partial. */
  truncated: boolean
}

export type ApplicationFacetName =
  | 'status'
  | 'payment_status'
  | 'institution'
  | 'program_offering'
  | 'intake'

export type ApplicationFacets = Partial<Record<ApplicationFacetName, Facet>>

/** The filters the server actually applied, echoed back. */
export interface AppliedApplicationFilters {
  institution_id: string | null
  program_offering_id: string | null
  intake_id: string | null
  assigned_reviewer_id: string | null
  status: string[]
  exclude_status: string[]
  payment_status: string[]
  program: string | null
  intake: string | null
  institution: string | null
  search: string | null
  reviewer_assignment: string | null
  is_late_submission: boolean | null
  has_pending_amendments: boolean | null
  review_queue: boolean | null
  overdue_review: boolean | null
  has_pending_documents: boolean | null
  has_upcoming_interviews: boolean | null
  deadline_pressure: boolean | null
  start_date: string | null
  end_date: string | null
  sort: string
  order: string
  /**
   * Parameters the contract does not implement. A deep link that emits one is
   * *visible* here instead of quietly returning an unfiltered list — the second
   * half of ADM-01.
   */
  unknown_parameters: string[]
}

export interface RosterRedaction {
  applied: boolean
  withheld_fields: string[]
}

export interface ApplicationRosterReport {
  page: number
  pageSize: number
  totalCount: number
  /** Server-computed page count. The browser divides nothing here. */
  totalPages: number
  results: ApplicationRosterRow[]
  aggregates: ApplicationAggregates
  facets: ApplicationFacets
  filters: AppliedApplicationFilters
  redaction: RosterRedaction
  can_export: boolean
}

/** A named applications query, owned by the actor who saved it. */
export interface SavedApplicationFilter {
  id: string
  name: string
  institution_id: string | null
  /** False when the binding institution left the actor's scope. */
  institution_in_scope: boolean
  query: Record<string, string>
  created_at: string | null
  updated_at: string | null
}

/**
 * The roster query, in the registered parameter names.
 *
 * Snake_case on purpose: these are the contract's own names, and keeping them
 * identical on both sides is what lets a URL, a saved filter, and a request be
 * the same thing.
 */
export interface ApplicationRosterQuery {
  institution_id?: string
  program_offering_id?: string
  intake_id?: string
  assigned_reviewer_id?: string
  status?: string
  exclude_status?: string
  payment_status?: string
  program?: string
  intake?: string
  institution?: string
  search?: string
  reviewer_assignment?: string
  is_late_submission?: string
  has_pending_amendments?: string
  review_queue?: string
  overdue_review?: string
  has_pending_documents?: string
  has_upcoming_interviews?: string
  deadline_pressure?: string
  start_date?: string
  end_date?: string
  sort?: string
  order?: string
  page?: number
  pageSize?: number
  saved_filter?: string
}

export const APPLICATION_ROSTER_ENDPOINT = '/admin/applications/'
export const APPLICATION_SAVED_FILTERS_ENDPOINT = '/admin/applications/saved-filters/'

/**
 * An honest empty report.
 *
 * Used only when a response carries no `aggregates` block at all. It is `total:
 * 0` because there is nothing to report, and `definitions: {}` so a caller can
 * tell "the server said zero" (definitions present) from "there is no answer
 * yet" (definitions absent) — R8.6's "missing data must not become a healthy
 * zero" made checkable rather than asserted.
 */
export const EMPTY_APPLICATION_AGGREGATES: ApplicationAggregates = {
  total: 0,
  draft_count: 0,
  submitted_count: 0,
  under_review_count: 0,
  decision_queue_count: 0,
  waitlisted_count: 0,
  approved_count: 0,
  conditionally_approved_count: 0,
  enrolled_count: 0,
  accepted_count: 0,
  rejected_count: 0,
  withdrawn_count: 0,
  payment_resolved_count: 0,
  payment_pending_count: 0,
  payment_rejected_count: 0,
  payment_unpaid_count: 0,
  late_submission_count: 0,
  unassigned_count: 0,
  overdue_review_count: 0,
  deadline_pressure_count: 0,
  today_activity_count: 0,
  first_created_at: null,
  last_activity_at: null,
  next_deadline_at: null,
  review_sla_days: 0,
  deadline_pressure_hours: 0,
  row_limit: 0,
  definitions: {},
}

const EMPTY_FILTERS: AppliedApplicationFilters = {
  institution_id: null,
  program_offering_id: null,
  intake_id: null,
  assigned_reviewer_id: null,
  status: [],
  exclude_status: [],
  payment_status: [],
  program: null,
  intake: null,
  institution: null,
  search: null,
  reviewer_assignment: null,
  is_late_submission: null,
  has_pending_amendments: null,
  review_queue: null,
  overdue_review: null,
  has_pending_documents: null,
  has_upcoming_interviews: null,
  deadline_pressure: null,
  start_date: null,
  end_date: null,
  sort: 'activity_at',
  order: 'desc',
  unknown_parameters: [],
}

function normalise(
  payload: Partial<ApplicationRosterReport> | null | undefined,
): ApplicationRosterReport {
  return {
    page: payload?.page ?? 1,
    pageSize: payload?.pageSize ?? 0,
    totalCount: payload?.totalCount ?? 0,
    totalPages: payload?.totalPages ?? 1,
    results: payload?.results ?? [],
    aggregates: payload?.aggregates ?? EMPTY_APPLICATION_AGGREGATES,
    facets: payload?.facets ?? {},
    filters: payload?.filters ?? EMPTY_FILTERS,
    redaction: payload?.redaction ?? { applied: true, withheld_fields: [] },
    can_export: payload?.can_export ?? false,
  }
}

function rosterParams(query: ApplicationRosterQuery = {}) {
  // Spread, not a field-by-field copy: the query is already expressed in the
  // registered names, so re-listing them here would be a second place for the
  // parameter set to drift from the contract.
  return { ...query } as Record<string, string | number | undefined>
}

export const applicationRosterService = {
  /**
   * The scoped applications roster with its server facets, whole-set aggregates,
   * and deadline state.
   *
   * Every identifier filter is resolved against the actor's scope on the server
   * **before** it reaches a query, so an out-of-scope id is a 404 rather than a
   * silently empty list that would confirm the id exists.
   */
  getRoster: async (query: ApplicationRosterQuery = {}): Promise<ApplicationRosterReport> => {
    const endpoint = `${APPLICATION_ROSTER_ENDPOINT}${buildQueryString(rosterParams(query))}`
    try {
      const response = await apiClient.request<Partial<ApplicationRosterReport>>(endpoint)
      return normalise(response)
    } catch (error) {
      logApiError('admin-applications', endpoint, error)
      throw error
    }
  },

  /**
   * The CSV export URL for the current filters.
   *
   * The page is dropped: an export that only contained the page an operator
   * happened to be looking at would be a different document each time it was
   * pressed. Authority, redaction, the row ceiling, and the audit record are all
   * the server's (R6.5).
   */
  rosterExportPath: (query: ApplicationRosterQuery = {}): string =>
    `${APPLICATION_ROSTER_ENDPOINT}${buildQueryString({
      ...rosterParams(query),
      page: undefined,
      pageSize: undefined,
      export: 'csv',
    })}`,

  /** The caller's own saved applications queries. */
  listSavedFilters: async (): Promise<SavedApplicationFilter[]> => {
    try {
      const response = await apiClient.request<{ results?: SavedApplicationFilter[] }>(
        APPLICATION_SAVED_FILTERS_ENDPOINT,
      )
      return response?.results ?? []
    } catch (error) {
      logApiError('admin-applications', APPLICATION_SAVED_FILTERS_ENDPOINT, error)
      throw error
    }
  },

  /**
   * Save (or update, by name) a named query.
   *
   * The server accepts **registered parameters only** — saving an unregistered
   * one would write ADM-01's own defect to disk: a stored filter the roster
   * silently ignores every time it is opened.
   */
  saveFilter: async (input: {
    name: string
    query: ApplicationRosterQuery
    institution_id?: string
  }): Promise<SavedApplicationFilter> => {
    try {
      const saved = await apiClient.request<SavedApplicationFilter>(
        APPLICATION_SAVED_FILTERS_ENDPOINT,
        {
          method: 'POST',
          body: JSON.stringify({
            name: input.name,
            institution_id: input.institution_id,
            query: rosterParams(input.query),
          }),
        },
      )
      // A save that came back with no record is not a save. Surfacing it as an
      // error keeps the operator from believing a named view exists when the
      // server never stored one.
      if (!saved) throw new Error('The filter could not be saved. Please try again.')
      return saved
    } catch (error) {
      logApiError('admin-applications', APPLICATION_SAVED_FILTERS_ENDPOINT, error)
      throw error
    }
  },

  /** Delete one of the caller's own saved queries. */
  deleteFilter: async (savedFilterId: string): Promise<void> => {
    const endpoint = `${APPLICATION_SAVED_FILTERS_ENDPOINT}${savedFilterId}/`
    try {
      await apiClient.request<void>(endpoint, { method: 'DELETE' })
    } catch (error) {
      logApiError('admin-applications', endpoint, error)
      throw error
    }
  },

  /**
   * Download a server-generated CSV export.
   *
   * The file is authored, filtered, redacted, bounded, and audited by the
   * backend; this carries the session cookie and saves what comes back. A
   * refusal or an over-limit set is surfaced as a thrown error rather than saved
   * as a `.csv` containing an error page.
   */
  downloadExport: async (path: string, filename: string): Promise<void> => {
    const url = `${API_BASE}${toApiV1Path(path)}`
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'text/csv' },
    })
    if (!response.ok) {
      logApiError('admin-applications', path, new Error(`export failed: ${response.status}`))
      throw new Error(
        response.status === 403
          ? 'You do not have permission to export applications.'
          : response.status === 400
            ? 'This export is too large. Narrow the filters and try again.'
            : 'The export could not be generated. Please try again.',
      )
    }
    const blob = await response.blob()
    if (typeof document === 'undefined') return
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(objectUrl)
  },
}
