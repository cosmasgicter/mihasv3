import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  FiltersPanel,
  ApplicationsTable,
  ApplicationsTableView,
  ApplicationsSkeleton,
  ApplicationDetailModal
} from '@/components/admin/applications'
import { BulkActionsBar } from '@/components/admin/applications/BulkActionsBar'
import { RosterPagination } from '@/components/admin/applications/RosterPagination'
import {
  APPLICATION_FILTER_KEYS,
  applicationFiltersFromSearchParams,
  applicationFiltersToSearchParams,
  useApplicationsData,
  useApplicationFilters,
} from '@/hooks/admin'
import type { ApplicationSummary } from '@/hooks/admin/useApplicationsData'
import type {
  ApplicationAggregates,
  Facet,
  FacetOption,
} from '@/services/admin/applications'
import type { FilterSelectOption } from '@/components/admin/applications/FiltersPanel'
import type { ApplicationWithDetails } from '@/components/admin/applications/applicationDetailTypes'
import { Button } from '@/components/ui/Button'
import { useToastStore } from '@/hooks/useToast'
import { applicationService } from '@/services/applications'
import { logApiError } from '@/lib/apiErrorLogger'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { reportError } from '@/lib/errorReporter'
import { ConfirmAlertDialog } from '@/components/ui/alert-dialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { PageShell } from '@/components/ui/PageShell'
import { Seo } from '@/components/seo/Seo'
import { VirtualizedApplicationsGrid } from '@/components/admin/applications/VirtualizedApplicationsGrid'
import { getPaymentStatusLabel } from '@/lib/paymentStatus'
import { formatApplicationStatus, type ApplicationStatus } from '@/types/applicationStatus'
import { BULK_ACTION_STATUS_MAP, type BulkApplicationAction } from '@/lib/applicationStatusUi'
import {
  FileDown, 
  FileText, 
  Filter, 
  RefreshCw, 
  LayoutGrid,
  Table,
  Keyboard
} from 'lucide-react'
import { toError } from '@/lib/toError'
import type { StatusCommandOptions } from '@/types/statusCommand'

// Admin card-grid virtualization threshold (R10.6): a single fixed integer
// within the inclusive range 30–50. The card grid switches to the virtualized
// renderer once the loaded application count exceeds this value.
export const ADMIN_CARD_VIRTUALIZATION_THRESHOLD = 40

/**
 * A server facet rendered as a select's options (task 9.1, ADM-01).
 *
 * The option list is the server's — complete for the query, each option
 * carrying its own count — instead of `[...new Set(rows.map(...))]`, which only
 * ever offered what happened to be on the loaded page.
 */
export const facetToOptions = (facet?: Facet): FilterSelectOption[] =>
  (facet?.options ?? [])
    .filter((option): option is FacetOption & { value: string } => Boolean(option.value))
    .map(option => ({
      value: option.value,
      label: `${option.label} (${option.count})`,
    }))

/**
 * The roster's headline metrics, read from the server's whole-set aggregates.
 *
 * `aggregates === null` means the server has not answered — so every value is
 * an explicit unknown rather than a zero (R8.6). The helper text carries the
 * server's own definition for the metric, so a number on screen can be
 * explained without reading the query service.
 */
export function buildRosterMetrics(
  aggregates: ApplicationAggregates | null,
  context: { loadedCount: number }
): Array<{ label: string; value: string | number; helper: string }> {
  if (!aggregates) {
    return [
      { label: 'Portfolio', value: '—', helper: 'Waiting for the server’s totals' },
      { label: 'Decision queue', value: '—', helper: 'Waiting for the server’s totals' },
      { label: 'Payment follow-up', value: '—', helper: 'Waiting for the server’s totals' },
      { label: 'Deadline pressure', value: '—', helper: 'Waiting for the server’s totals' },
    ]
  }

  const definition = (key: string, fallback: string) => aggregates.definitions[key] || fallback

  return [
    {
      label: 'Portfolio',
      value: `${aggregates.total} total`,
      helper: `${context.loadedCount} on this page · ${definition('total', 'Applications matching the current filters, in your scope.')}`,
    },
    {
      label: 'Decision queue',
      value: aggregates.decision_queue_count,
      helper: definition('decision_queue_count', 'Waiting on a staff decision.'),
    },
    {
      label: 'Payment follow-up',
      value: aggregates.payment_pending_count + aggregates.payment_unpaid_count,
      helper: `${aggregates.payment_pending_count} awaiting confirmation + ${aggregates.payment_unpaid_count} with no attempt yet`,
    },
    {
      label: 'Deadline pressure',
      value: aggregates.deadline_pressure_count,
      helper: `Due within ${aggregates.deadline_pressure_hours}h · ${definition('deadline_pressure_count', 'An open condition or enrollment confirmation falls due soon.')}`,
    },
  ]
}

/**
 * The roster row the detail sheet opens with (task 9.1).
 *
 * The scoped roster contract carries triage data only, so the detail-only fields
 * arrive as `null` — "this surface does not know" — while the detail contract
 * spells the same absence `undefined`. Translating one to the other keeps the
 * absence intact; coercing it to `0` would put an invented grade total and a
 * K0.00 fee on screen while the workspace's own read is still in flight (R8.6).
 *
 * This is a seed, not the answer: the review workspace (task 9.4) fetches the
 * full application for the one row an operator opened.
 */
export function rosterRowToDetailSeed(row: ApplicationSummary): ApplicationWithDetails {
  const present = <T,>(value: T | null): T | undefined => (value === null ? undefined : value)

  return {
    id: row.id,
    user_id: row.user_id,
    application_number: row.application_number,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    program: row.program,
    intake: row.intake,
    institution: row.institution,
    status: row.status,
    payment_status: row.payment_status,
    submitted_at: row.submitted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    assigned_reviewer_id: row.assigned_reviewer_id,
    is_late_submission: row.is_late_submission,
    application_fee: present(row.application_fee),
    total_subjects: present(row.total_subjects),
    points: present(row.points),
    grades_summary: present(row.grades_summary),
    result_slip_url: present(row.result_slip_url),
    extra_kyc_url: present(row.extra_kyc_url),
    last_payment_audit_notes: row.last_payment_audit_notes,
  }
}

type WarningResult = { warning: true; message?: string }

const isWarningResult = (value: unknown): value is WarningResult =>
  Boolean(
    value &&
      typeof value === 'object' &&
      'warning' in value &&
      (value as { warning?: unknown }).warning === true,
  )

const getErrorStatus = (error: unknown): number =>
  error && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
    ? error.status
    : 0

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < 640
  })

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const mediaQuery = window.matchMedia('(max-width: 639px)')
    const handleChange = () => setIsMobile(mediaQuery.matches)

    handleChange()
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return isMobile
}

export default function Applications() {
  const {
    filters,
    updateFilter
  } = useApplicationFilters()

  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamsString = searchParams.toString()

  const filtersRef = useRef(filters)
  const hasProcessedSearchParamsRef = useRef(false)

  useEffect(() => {
    filtersRef.current = filters
  }, [filters])

  /*
    A link is a query (task 9.1, ADM-01).

    The address bar is read and written in the **registered** parameter names —
    the same names the request carries — so a dashboard tile, a backend
    notification's `action_url`, a saved filter, and an operator's bookmark all
    describe the roster in one vocabulary. This surface used to read only its own
    UI-state keys out of the URL, which is why `?deadlinePressureFilter=true`
    (the tile) and `?status=submitted,under_review` (the review-SLA
    notification) both opened an unfiltered list.

    Legacy UI-name links are still understood, and rewritten to the registered
    spelling on arrival, so an old bookmark is upgraded rather than broken.
  */
  useEffect(() => {
    const params = new URLSearchParams(searchParamsString)
    const incoming = applicationFiltersFromSearchParams(params)
    const hasRelevantParams = Object.keys(incoming).length > 0

    if (!hasProcessedSearchParamsRef.current && !hasRelevantParams) {
      hasProcessedSearchParamsRef.current = true
      return
    }

    APPLICATION_FILTER_KEYS.forEach(key => {
      const value = incoming[key] ?? ''
      if (value !== filtersRef.current[key]) {
        updateFilter(key, value)
      }
    })

    hasProcessedSearchParamsRef.current = true
  }, [searchParamsString, updateFilter])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const current = new URLSearchParams(window.location.search)
    const next = applicationFiltersToSearchParams(filters, new URLSearchParams(window.location.search))

    if (next.toString() !== current.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [filters, setSearchParams])

  const {
    applications,
    isInitialLoading,
    isRefreshing,
    error,
    pagination,
    aggregates,
    facets,
    unknownParameters,
    canExport,
    rowVersions,
    goToPage,
    refreshCurrentPage,
    exportRoster,
    updateStatus,
    updatePaymentStatus
  } = useApplicationsData(filters)

  const { success: showSuccess, error: showError, info: showInfo } = useToastStore()
  const [isExportingRoster, setIsExportingRoster] = useState(false)
  const [selectedApplication, setSelectedApplication] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [modalLoading, setModalLoading] = useState<{
    notification: boolean
  }>({ notification: false })
  const [showFilters, setShowFilters] = useState(false)
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')
  const isMobileViewport = useIsMobileViewport()

  // Filter options are the server's facets over the whole filtered set, not a
  // `Set` harvested from the rows this page happened to load (ADM-01). An
  // offering with no application on page 1 is still offered as a filter, and
  // each option carries its own count.
  const programOptions = useMemo(
    () => facetToOptions(facets.program_offering),
    [facets.program_offering]
  )
  const institutionOptions = useMemo(
    () => facetToOptions(facets.institution),
    [facets.institution]
  )
  const confirmDialog = useConfirmDialog()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const effectiveViewMode = isMobileViewport ? 'cards' : viewMode

  useEffect(() => {
    if (isMobileViewport && viewMode === 'table') {
      setViewMode('cards')
    }
  }, [isMobileViewport, viewMode])
  // Track which application is currently being updated (for virtualized grid)
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null)
  const [updatingPaymentId, setUpdatingPaymentId] = useState<string | null>(null)

  /**
   * The export is the server's file (task 9.1, R6.5).
   *
   * This used to walk `/applications/export/` page by page in the browser,
   * accumulate every row in memory, and render CSV/XLSX/PDF client-side — so the
   * document depended on how far the walk got, and the authority to produce it
   * was never checked. One request now returns the whole *filtered* set,
   * independent of the page on screen, gated on `tenant.application.export`,
   * redacted by capability, bounded rather than truncated, and recorded as an
   * Audit_Event.
   */
  const handleExport = useCallback(async () => {
    if (isExportingRoster) return

    setIsExportingRoster(true)
    showInfo('Preparing export', 'The server is building your applications file…')

    try {
      await exportRoster()
      showSuccess('Export complete', 'Your applications report has been downloaded.')
    } catch (error) {
      logApiError('admin-applications', '/admin/applications/?export=csv', error)
      showError('Export failed', toError(error).message || 'Unable to export applications right now.')
    } finally {
      setIsExportingRoster(false)
    }
  }, [exportRoster, isExportingRoster, showError, showInfo, showSuccess])

  const handleViewDetails = useCallback((applicationId: string) => {
    setSelectedApplication(applicationId)
    setShowDetails(true)
  }, [])

  const handleCloseDetails = useCallback(() => {
    setShowDetails(false)
    setSelectedApplication(null)
  }, [])

  const selectedApp = useMemo(() => {
    if (!selectedApplication) return null
    const row = applications.find(app => app.id === selectedApplication)
    return row ? rosterRowToDetailSeed(row) : null
  }, [selectedApplication, applications])

  const handleSendNotification = useCallback(async (title: string, message: string) => {
    if (!selectedApplication) return
    
    setModalLoading(prev => ({ ...prev, notification: true }))
    try {
      await applicationService.sendNotification(selectedApplication, {
        title,
        message
      })
      showSuccess('Notification sent', 'Student has been notified successfully.')
    } catch (error) {
      logApiError('admin-applications', `/applications/${selectedApplication}/notification`, error)
      showError('Failed to send notification', toError(error).message || 'Unable to send notification.')
    } finally {
      setModalLoading(prev => ({ ...prev, notification: false }))
    }
  }, [selectedApplication, showSuccess, showError])

  /*
   * `handleViewDocuments` and `handleViewHistory` used to live here.
   *
   * Both were parallel legacy detail calls (task 9.4, R8.5): one fetched
   * `/applications/{id}/documents/` and opened every signed URL in a tab, the
   * other fetched `/applications/{id}/summary/` only to toast how many status
   * changes there were. The review workspace now returns evidence and history in
   * its one read, and renders both — so these two calls could only ever disagree
   * with what the operator was already looking at. Deleted rather than left
   * unused: an unused fetch is still shipped code that can be re-wired.
   */

  const handleRefresh = useCallback(async () => {
    await refreshCurrentPage()
    showInfo('Refreshed', 'Application data refreshed successfully.')
  }, [refreshCurrentPage, showInfo])

  // Wrapper for updateStatus with error handling and toast notifications
  const handleStatusUpdate = useCallback(async (applicationId: string, newStatus: ApplicationStatus, options?: StatusCommandOptions) => {
    try {
      setUpdatingStatusId(applicationId)
      const result = await updateStatus(applicationId, newStatus, options)
      
      // If the API returned a payment warning, pass it through without showing success toast
      if (isWarningResult(result)) {
        return result
      }
      
      showSuccess('Status updated', `Application status changed to ${formatApplicationStatus(newStatus)}.`)
      return result
    } catch (error: unknown) {
      const status = getErrorStatus(error)
      const message = toError(error).message

      // Handle 409 conflict — application was modified by another user
      if (status === 409 || message.includes('Conflict detected') || message.includes('modified')) {
        logApiError('admin-applications', `/applications/${applicationId}/review/`, error)
        showError(
          'Conflict detected',
          'This application was modified by another user. Please reload to see the latest data.'
        )
        // Offer automatic reload of the current page data
        await refreshCurrentPage()
        return undefined
      }

      logApiError('admin-applications', `/applications/${applicationId}/review/`, error)
      showError('Status update failed', message || 'Unable to update application status. Please try again.')
      throw error // Re-throw to let the calling component know the operation failed
    } finally {
      setUpdatingStatusId(null)
    }
  }, [updateStatus, showSuccess, showError, refreshCurrentPage])

  // Wrapper for updatePaymentStatus with error handling and toast notifications
  const handlePaymentStatusUpdate = useCallback(async (
    applicationId: string,
    newPaymentStatus: string,
    verificationNotes?: string,
    force?: boolean
  ) => {
    try {
      setUpdatingPaymentId(applicationId)
      const result = await updatePaymentStatus(applicationId, newPaymentStatus, verificationNotes, force)

      // Handle advisory warning (no payment proof uploaded)
      if (isWarningResult(result)) {
        const confirmed = await confirmDialog.confirm({
          title: 'Payment Warning',
          message: result.message || 'No payment proof uploaded. Proceed anyway?',
          confirmText: 'Proceed',
          cancelText: 'Cancel',
          variant: 'danger'
        })
        if (confirmed) {
          // Retry with force flag
          await updatePaymentStatus(applicationId, newPaymentStatus, verificationNotes, true)
          showSuccess('Payment status updated', `Payment status changed to ${getPaymentStatusLabel(newPaymentStatus)}.`)
        }
        return
      }

      showSuccess('Payment status updated', `Payment status changed to ${getPaymentStatusLabel(newPaymentStatus)}.`)
    } catch (error: unknown) {
      const status = getErrorStatus(error)
      const message = toError(error).message

      // Handle 409 conflict — application was modified by another user
      if (status === 409 || message.includes('Conflict detected') || message.includes('modified')) {
        logApiError('admin-applications', `/applications/${applicationId}/review/`, error)
        showError(
          'Conflict detected',
          'This application was modified by another user. Please reload to see the latest data.'
        )
        await refreshCurrentPage()
        return
      }

      logApiError('admin-applications', `/applications/${applicationId}/review/`, error)
      showError('Payment update failed', message || 'Unable to update payment status. Please try again.')
      throw error // Re-throw to let the calling component know the operation failed
    } finally {
      setUpdatingPaymentId(null)
    }
  }, [updatePaymentStatus, showSuccess, showError, refreshCurrentPage, confirmDialog])

  const handleBulkAction = useCallback(async (action: BulkApplicationAction, ids: string[]) => {
    if (ids.length === 0) {
      showError('No selection', 'Please select applications to perform bulk action.')
      return
    }
    
    setBulkActionLoading(true)
    try {
      const targetStatus = BULK_ACTION_STATUS_MAP[action]
      // The versions these rows were read at (task 9.4, R8.4). A bulk decision
      // changes up to 25 applications on one press, so it states which versions
      // the operator was looking at; any that moved since fails the batch rather
      // than being silently overwritten.
      const expectedVersions = ids.reduce<Record<string, number>>((acc, id) => {
        const version = rowVersions[id]
        if (typeof version === 'number') acc[id] = version
        return acc
      }, {})
      await applicationService.bulkStatus({
        applicationIds: ids,
        status: targetStatus,
        expectedVersions,
      })

      showSuccess('Bulk action completed', `${ids.length} applications updated successfully.`)
      setSelectedIds([])
      await refreshCurrentPage()
    } catch (error: unknown) {
      const status = getErrorStatus(error)
      const message = toError(error).message

      if (status === 409 || message.includes('Conflict detected') || message.includes('modified')) {
        logApiError('admin-applications', '/applications/bulk-status/', error)
        showError(
          'Conflict detected',
          'One or more applications were modified by another user. Please reload and try again.'
        )
        await refreshCurrentPage()
      } else {
        logApiError('admin-applications', '/applications/bulk-status/', error)
        showError('Bulk action failed', message || 'Unable to complete bulk action.')
      }
    } finally {
      setBulkActionLoading(false)
    }
  }, [showSuccess, showError, refreshCurrentPage, rowVersions])

  /**
   * The headline numbers are the server's aggregates over the whole filtered
   * set (task 9.1, ADM-01). They used to be counted over the loaded page and
   * read as portfolio facts, so page 1 of 9 described 25 rows.
   *
   * `null` while there is no answer yet: a loading or failed read shows "—" and
   * says so, never a zero that reads as "nothing to do" (R8.6).
   */
  const metrics = useMemo(
    () => buildRosterMetrics(aggregates, { loadedCount: pagination.loadedCount }),
    [aggregates, pagination.loadedCount]
  )

  // P1-2: Keyboard shortcuts for admin power users
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) return
      if (showDetails) {
        if (e.key === 'Escape') { handleCloseDetails(); e.preventDefault() }
        return
      }
      if (e.key === 'r' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); void handleRefresh() }
      if (e.key === '/') {
        e.preventDefault()
        const input = document.querySelector<HTMLInputElement>('[aria-label="Search applications"]')
        input?.focus()
      }
      if (e.key === 'Escape') { handleCloseDetails() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [showDetails, handleCloseDetails, handleRefresh])

  return (
    <>
      <Seo
        title="Applications | Beanola Admissions"
        description="Review, filter, and manage all student admissions applications."
        path="/admin/applications"
        noindex
      />
    <PageShell
      title="Applications"
      eyebrow="Admissions Review"
      subtitle="Review intake volume, payment proof, and decision readiness from a single triage surface built for fast, accurate approvals."
      maxWidth="7xl"
      tone="admin"
      metrics={metrics}
      actions={
        <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
          {/* View Toggle */}
          <div className="hidden sm:flex items-center bg-muted rounded-lg p-1">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`min-h-touch min-w-touch flex items-center justify-center rounded-md transition-colors ${
                viewMode === 'cards'
                  ? 'bg-card text-primary shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-label="Card view"
              aria-pressed={viewMode === 'cards'}
            >
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`min-h-touch min-w-touch flex items-center justify-center rounded-md transition-colors ${
                viewMode === 'table'
                  ? 'bg-card text-primary shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-label="Table view"
              aria-pressed={viewMode === 'table'}
            >
              <Table className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="sm:hidden"
            aria-label="Toggle filters"
            aria-expanded={showFilters}
          >
            <Filter className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            aria-label="Refresh applications"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </Button>
          <div className="relative hidden sm:block">
            <button
              type="button"
              className="min-h-touch min-w-touch flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Keyboard shortcuts"
              onMouseEnter={() => setShowShortcuts(true)}
              onMouseLeave={() => setShowShortcuts(false)}
              onFocus={() => setShowShortcuts(true)}
              onBlur={() => setShowShortcuts(false)}
            >
              <Keyboard className="h-4 w-4" aria-hidden="true" />
            </button>
            {showShortcuts && (
              <div className="absolute right-0 top-full mt-2 z-50 w-52 rounded-lg border border-border bg-card p-3 shadow-md text-xs">
                <p className="font-semibold text-foreground mb-2">Keyboard shortcuts</p>
                <div className="space-y-1.5 text-muted-foreground">
                  <div className="flex justify-between"><span>Refresh list</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">R</kbd></div>
                  <div className="flex justify-between"><span>Focus search</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">/</kbd></div>
                  <div className="flex justify-between"><span>Close modal</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">Esc</kbd></div>
                </div>
              </div>
            )}
          </div>
        </div>
      }
    >
      {/* Filters and content */}
      <div className="px-4 py-4 pb-28 sm:px-6 sm:pb-4">
        {/*
          Export bar. One button, because there is one export: the server's
          page-independent CSV over the whole filtered set. It appears only when
          the backend says this actor holds `tenant.application.export` — and the
          backend refuses regardless, so the absence is convenience, not the
          boundary.
        */}
        {canExport && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { void handleExport() }}
              loading={isExportingRoster}
              className="min-h-touch text-xs"
            >
              <FileDown className="mr-1 h-3 w-3" aria-hidden="true" />
              Export CSV
            </Button>
            <span className="text-xs text-muted-foreground">
              Covers every application matching these filters, not just this page.
            </span>
          </div>
        )}

        {/*
          A deep link carrying a parameter this contract does not implement is
          reported rather than silently dropped — the ignored-filter half of
          ADM-01 made visible instead of invisible.
        */}
        {unknownParameters.length > 0 && (
          <div className="mb-4">
            <ErrorDisplay
              title="Some link filters were not applied"
              message={`The server does not implement: ${unknownParameters.join(', ')}. The list below ignores them.`}
              variant="inline"
            />
          </div>
        )}
        {/*
          Mobile filters sheet. It carries its own control-id namespace: both
          panels used to emit the same ids, so on a small viewport a label
          resolved to the hidden desktop control instead of the one on screen.
        */}
        {showFilters && (
          <div
            className="mb-6 rounded-lg border border-border bg-card p-4 shadow-sm sm:hidden"
            data-roster-filters="mobile"
          >
            <FiltersPanel
              idPrefix="mobile-"
              searchTerm={filters.searchTerm}
              statusFilter={filters.statusFilter}
              paymentFilter={filters.paymentFilter}
              programFilter={filters.programFilter}
              institutionFilter={filters.institutionFilter}
              draftFilter={filters.draftFilter}
              assignedReviewerFilter={filters.assignedReviewerFilter}
              lateSubmissionFilter={filters.lateSubmissionFilter}
              pendingAmendmentsFilter={filters.pendingAmendmentsFilter}
              reviewQueueFilter={filters.reviewQueueFilter}
              overdueReviewFilter={filters.overdueReviewFilter}
              pendingDocumentsFilter={filters.pendingDocumentsFilter}
              upcomingInterviewsFilter={filters.upcomingInterviewsFilter}
              deadlinePressureFilter={filters.deadlinePressureFilter}
              programOptions={programOptions}
              institutionOptions={institutionOptions}
              deadlinePressureHours={aggregates?.deadline_pressure_hours ?? null}
              onFilterChange={updateFilter}
            />
          </div>
        )}

        {/* Desktop Filters */}
        <div
          className="mb-6 hidden rounded-lg border border-border bg-card p-4 shadow-sm sm:block"
          data-roster-filters="desktop"
        >
          <FiltersPanel
            searchTerm={filters.searchTerm}
            statusFilter={filters.statusFilter}
            paymentFilter={filters.paymentFilter}
            programFilter={filters.programFilter}
            institutionFilter={filters.institutionFilter}
            draftFilter={filters.draftFilter}
            assignedReviewerFilter={filters.assignedReviewerFilter}
            lateSubmissionFilter={filters.lateSubmissionFilter}
            pendingAmendmentsFilter={filters.pendingAmendmentsFilter}
            reviewQueueFilter={filters.reviewQueueFilter}
            overdueReviewFilter={filters.overdueReviewFilter}
            pendingDocumentsFilter={filters.pendingDocumentsFilter}
            upcomingInterviewsFilter={filters.upcomingInterviewsFilter}
            deadlinePressureFilter={filters.deadlinePressureFilter}
            programOptions={programOptions}
            institutionOptions={institutionOptions}
            deadlinePressureHours={aggregates?.deadline_pressure_hours ?? null}
            onFilterChange={updateFilter}
          />
        </div>

        {error && (
          <div className="mb-6">
            <ErrorDisplay
              title="Error Loading Applications"
              message={error}
              onRetry={handleRefresh}
              variant="inline"
            />
          </div>
        )}

        {isRefreshing && (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
            <div className="h-2.5 w-2.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
            <span>Refreshing latest applications…</span>
          </div>
        )}

        {isInitialLoading ? (
          <ApplicationsSkeleton />
        ) : !isInitialLoading && applications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-lg border border-border bg-muted mb-4">
              <FileText className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No applications found</h3>
            <p className="text-sm text-muted-foreground max-w-md">No applications match your current filters. Try adjusting your search criteria or clearing filters.</p>
          </div>
        ) : (
          <ErrorBoundary level="section" onError={(error, errorInfo) => reportError(error, { component: 'Applications.ReviewPanel', ...errorInfo })}>
          {effectiveViewMode === 'table' ? (
          <ApplicationsTableView
            applications={applications}
            onViewDetails={handleViewDetails}
            onStatusUpdate={handleStatusUpdate as (id: string, status: string, options?: StatusCommandOptions) => Promise<void>}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            loading={isRefreshing}
          />
        ) : applications.length > ADMIN_CARD_VIRTUALIZATION_THRESHOLD ? (
          <VirtualizedApplicationsGrid
            applications={applications}
            onStatusUpdate={handleStatusUpdate as (id: string, status: string, options?: StatusCommandOptions) => Promise<void>}
            onPaymentStatusUpdate={handlePaymentStatusUpdate}
            onViewDetails={handleViewDetails}
            updatingStatusId={updatingStatusId}
            updatingPaymentId={updatingPaymentId}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
          />
        ) : (
          <ApplicationsTable
            applications={applications}
            onStatusUpdate={handleStatusUpdate as (id: string, status: string, options?: StatusCommandOptions) => Promise<void>}
            onPaymentStatusUpdate={handlePaymentStatusUpdate}
            onViewDetails={handleViewDetails}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
          />
        )}
          {/*
            One page navigator for every view mode (task 9.1, ADM-01). The
            roster used to append the next page to the rows on screen and show a
            "% loaded" figure, which is what made a page-derived total look
            plausible — the list really did hold everything it was counting. The
            page number, the page count, and the total are all the server's.
          */}
          <div className="mt-6">
            <RosterPagination
              page={pagination.currentPage}
              totalPages={pagination.totalPages}
              totalCount={pagination.totalCount}
              loadedCount={pagination.loadedCount}
              isPaging={isRefreshing}
              onPageChange={goToPage}
            />
          </div>
          </ErrorBoundary>
        )}

        <BulkActionsBar
          selectedIds={selectedIds}
          onBulkAction={handleBulkAction as (action: string, ids: string[]) => Promise<void>}
          onClearSelection={() => setSelectedIds([])}
        />

        <ApplicationDetailModal
          application={selectedApp}
          show={showDetails}
          updating={null}
          onClose={handleCloseDetails}
          onSendNotification={handleSendNotification}
          onUpdateStatus={handleStatusUpdate as (id: string, status: string, options?: StatusCommandOptions) => Promise<unknown>}
        />
      </div>
    </PageShell>
    <ConfirmAlertDialog
      isOpen={confirmDialog.isOpen}
      onClose={confirmDialog.handleCancel}
      onConfirm={confirmDialog.handleConfirm}
      title={confirmDialog.options.title}
      message={confirmDialog.options.message}
      confirmText={confirmDialog.options.confirmText}
      cancelText={confirmDialog.options.cancelText}
      variant={confirmDialog.options.variant}
    />
    </>
  )
}
