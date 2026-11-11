/**
 * The admin applications roster read (Admissions V2, task 9.1).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.1 — "Create one
 * scoped applications query and aggregate contract".
 * Requirements: **R8.1**, **R8.6** · Findings: **ADM-01**.
 *
 * This hook used to be the roster's *second* query implementation: it called the
 * legacy `/applications/` list with its own parameter spelling, accumulated
 * pages into one growing array (so "page 2" meant "51 loaded rows"), and left
 * the page to count totals and harvest filter options from whatever had been
 * loaded. It now wraps the single scoped contract
 * (`GET /api/v1/admin/applications/`) and hands back what the server decided:
 * the rows for **one** page, the whole-filtered-set aggregates, the facets, the
 * page arithmetic, and whether this actor may export.
 *
 * Nothing here counts, filters, groups, sorts, or totals. Two things remain the
 * browser's: the row **commands** (status and payment review, which keep their
 * own canonical endpoints and their own capabilities) and cache invalidation
 * after one succeeds.
 */
import { useCallback, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { applicationService } from '@/services/applications'
import { logApiError } from '@/lib/apiErrorLogger'
import {
  applicationRosterKeys,
  useApplicationRoster,
} from './useApplicationRoster'
import {
  applicationRosterService,
  type ApplicationAggregates,
  type ApplicationFacets,
  type ApplicationRosterRow,
} from '@/services/admin/applications'
import {
  ApplicationFilters,
  DEFAULT_APPLICATION_FILTERS,
  toApplicationRosterQuery,
} from './useApplicationFilters'
import { invalidateAdminApplicationQueries } from './applicationQueryInvalidation'
import type { StatusCommandOptions } from '@/types/statusCommand'

/**
 * One roster row as the triage surface renders it.
 *
 * The heavy per-row derivations the legacy list computed for every row —
 * `grades_summary`, `total_subjects`, `points`, `age`,
 * `days_since_submission`, and the payment amounts — are **not** triage data and
 * are not in the scoped contract. They are `null` here rather than `0` or `''`:
 * absence is rendered as absence, never as a healthy zero (R8.6). The review
 * workspace fetches them for the one application an operator opened.
 */
export interface ApplicationSummary {
  id: string
  user_id: string
  application_number: string
  full_name: string
  email: string
  phone: string
  program: string
  intake: string
  institution: string
  status: string
  payment_status: string
  /** Canonical ids — the routing and scoping authority for a row. */
  institution_id: string | null
  program_offering_id: string | null
  intake_id: string | null
  assigned_reviewer_id: string | null
  public_tracking_code: string | null
  is_late_submission: boolean
  waitlist_position: number | null
  /** Soonest open condition or enrollment-confirmation deadline, from the server. */
  next_deadline_at: string | null
  submitted_at: string
  updated_at?: string
  created_at: string
  activity_at: string | null
  /** Platform-only cross-tenant context; withheld for a tenant actor. */
  peer_offering_count?: number | null
  /** Current document versions and how many are verified; `null` when not sent (task 30.4). */
  current_document_count: number | null
  verified_document_count: number | null
  /** Detail-only fields the triage contract does not carry (see above). */
  application_fee: number | null
  paid_amount: number | null
  payment_currency: string | null
  grades_summary: string | null
  total_subjects: number | null
  points: number | null
  age: number | null
  days_since_submission: number | null
  result_slip_url: string | null
  extra_kyc_url: string | null
  last_payment_audit_notes: string | null
  isDraft: boolean
  /** Unknown on the roster: the server owns readiness, and it is not a list fact. */
  completionPercentage: number | null
  lastUpdated: string
}

const DEFAULT_PAGE_SIZE = 25

/** Map one server roster row onto the shape the triage components render. */
export const rosterRowToSummary = (row: ApplicationRosterRow): ApplicationSummary => ({
  id: row.id,
  user_id: '',
  application_number: row.application_number ?? '',
  full_name: row.full_name ?? '',
  email: row.email ?? '',
  phone: row.phone ?? '',
  program: row.program_name,
  intake: row.intake_name,
  institution: row.institution_name,
  status: row.status,
  payment_status: row.payment_status,
  institution_id: row.institution_id,
  program_offering_id: row.program_offering_id,
  intake_id: row.intake_id,
  assigned_reviewer_id: row.assigned_reviewer_id,
  public_tracking_code: row.public_tracking_code,
  is_late_submission: row.is_late_submission,
  waitlist_position: row.waitlist_position,
  next_deadline_at: row.next_deadline_at,
  submitted_at: row.submitted_at ?? '',
  updated_at: row.updated_at ?? '',
  created_at: row.created_at ?? '',
  activity_at: row.activity_at,
  peer_offering_count: row.peer_offering_count ?? null,
  current_document_count: row.current_document_count ?? null,
  verified_document_count: row.verified_document_count ?? null,
  application_fee: null,
  paid_amount: null,
  payment_currency: null,
  grades_summary: null,
  total_subjects: null,
  points: null,
  age: null,
  days_since_submission: null,
  result_slip_url: null,
  extra_kyc_url: null,
  last_payment_audit_notes: null,
  isDraft: row.status === 'draft',
  completionPercentage: null,
  lastUpdated: row.activity_at ?? row.updated_at ?? row.created_at ?? '',
})

export interface ApplicationRosterPagination {
  pageSize: number
  currentPage: number
  totalCount: number
  totalPages: number
  loadedCount: number
  hasMore: boolean
}

export interface UseApplicationsDataResult {
  applications: ApplicationSummary[]
  isInitialLoading: boolean
  isRefreshing: boolean
  error: string
  pagination: ApplicationRosterPagination
  /** Whole-filtered-set counters, or `null` while there is no answer yet. */
  aggregates: ApplicationAggregates | null
  /** Filter options with counts, computed by the server over the filtered set. */
  facets: ApplicationFacets
  /** Registered parameters the contract does not implement, echoed back. */
  unknownParameters: string[]
  canExport: boolean
  redactedFields: string[]
  /**
   * The version each loaded row was read at, keyed by application id (task 9.4,
   * R8.4). Handed to the bulk command so a batch decision states which versions
   * the operator was looking at, rather than overwriting whatever is current.
   * Kept off `ApplicationSummary` on purpose: it is a concurrency token for a
   * command, not a field of the application a component should render.
   */
  rowVersions: Record<string, number>
  goToPage: (page: number) => void
  refreshCurrentPage: () => Promise<void>
  exportRoster: () => Promise<void>
  updateStatus: (
    applicationId: string,
    newStatus: string,
    options?: StatusCommandOptions
  ) => Promise<unknown>
  updatePaymentStatus: (
    applicationId: string,
    newPaymentStatus: string,
    verificationNotes?: string,
    force?: boolean
  ) => Promise<unknown>
}

export function useApplicationsData(
  filters: ApplicationFilters = DEFAULT_APPLICATION_FILTERS,
  options: { pageSize?: number; sort?: string; order?: 'asc' | 'desc' } = {}
): UseApplicationsDataResult {
  const queryClient = useQueryClient()
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const [page, setPage] = useState(1)

  // The query *is* the whole server question, page included. Changing a filter
  // therefore asks a different question rather than re-slicing a cached answer.
  const query = useMemo(
    () =>
      toApplicationRosterQuery(filters || DEFAULT_APPLICATION_FILTERS, {
        page,
        pageSize,
        ...(options.sort ? { sort: options.sort } : {}),
        ...(options.order ? { order: options.order } : {}),
      }),
    [filters, page, pageSize, options.sort, options.order]
  )

  const rosterQuery = useApplicationRoster(query)
  const report = rosterQuery.data

  const applications = useMemo(
    () => (report?.results ?? []).map(rosterRowToSummary),
    [report?.results]
  )

  // The version each row on screen was read at. Rebuilt on every answer, so a
  // refetch replaces the tokens rather than accumulating stale ones.
  const rowVersions = useMemo(() => {
    const versions: Record<string, number> = {}
    for (const row of report?.results ?? []) {
      if (typeof row.version === 'number') versions[row.id] = row.version
    }
    return versions
  }, [report?.results])

  const pagination: ApplicationRosterPagination = useMemo(() => {
    const totalCount = report?.totalCount ?? 0
    const serverPageSize = report?.pageSize || pageSize
    const totalPages = report?.totalPages ?? 1
    const currentPage = report?.page ?? page
    return {
      pageSize: serverPageSize,
      currentPage,
      totalCount,
      totalPages,
      loadedCount: applications.length,
      hasMore: currentPage < totalPages,
    }
  }, [applications.length, page, pageSize, report])

  const goToPage = useCallback(
    (next: number) => {
      setPage(Math.max(1, Math.trunc(next)))
    },
    []
  )

  const refreshCurrentPage = useCallback(async () => {
    await rosterQuery.refetch()
  }, [rosterQuery])

  const exportRoster = useCallback(async () => {
    // Page-independent by construction: the service drops page/pageSize, and the
    // server authors, filters, redacts, bounds, and audits the file.
    await applicationRosterService.downloadExport(
      applicationRosterService.rosterExportPath(query),
      `applications-${new Date().toISOString().slice(0, 10)}.csv`
    )
  }, [query])

  const updateStatus = useCallback(
    async (
      applicationId: string,
      newStatus: string,
      commandOptions?: StatusCommandOptions
    ) => {
      try {
        const result = await applicationService.updateStatus(
          applicationId,
          newStatus,
          commandOptions?.notes,
          commandOptions?.force,
          commandOptions?.conditions
        )

        // An advisory warning is not a transition: leave the cache alone so the
        // roster keeps showing what the server still holds.
        if (
          result &&
          typeof result === 'object' &&
          'warning' in result &&
          (result as { warning?: boolean }).warning === true
        ) {
          return result
        }

        await invalidateAdminApplicationQueries(queryClient, { applicationId })
        await queryClient.invalidateQueries({ queryKey: applicationRosterKeys.all })
        return result
      } catch (error) {
        logApiError('admin-applications', `/applications/${applicationId}/review/`, error)
        throw error
      }
    },
    [queryClient]
  )

  const updatePaymentStatus = useCallback(
    async (
      applicationId: string,
      newPaymentStatus: string,
      verificationNotes?: string,
      force?: boolean
    ) => {
      try {
        const result = await applicationService.updatePaymentStatus(
          applicationId,
          newPaymentStatus,
          verificationNotes,
          force
        )

        if (
          result &&
          typeof result === 'object' &&
          'warning' in result &&
          (result as { warning?: boolean }).warning === true
        ) {
          return result
        }

        await invalidateAdminApplicationQueries(queryClient, {
          applicationId,
          includePaymentStatus: true,
        })
        await queryClient.invalidateQueries({ queryKey: applicationRosterKeys.all })
        return result
      } catch (error) {
        logApiError('admin-applications', `/applications/${applicationId}/review/`, error)
        throw error
      }
    },
    [queryClient]
  )

  return {
    applications,
    isInitialLoading: rosterQuery.isLoading,
    isRefreshing: rosterQuery.isFetching && !rosterQuery.isLoading,
    error: rosterQuery.error ? (rosterQuery.error as Error).message : '',
    pagination,
    // `null` — not a zeroed shape — while the server has not answered, so a
    // loading or failed read can never be read as "nothing to do" (R8.6).
    aggregates: report?.aggregates ?? null,
    facets: report?.facets ?? {},
    unknownParameters: report?.filters?.unknown_parameters ?? [],
    canExport: report?.can_export ?? false,
    redactedFields: report?.redaction?.withheld_fields ?? [],
    rowVersions,
    goToPage,
    refreshCurrentPage,
    exportRoster,
    updateStatus,
    updatePaymentStatus,
  }
}
