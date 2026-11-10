import React, { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import type { ApplicationFilters } from '@/hooks/admin/useApplicationFilters'
import { DRAFT_FILTER_OPTIONS } from '@/hooks/admin/useApplicationFilters'
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback'
import { STATUS_FILTER_OPTIONS } from '@/lib/applicationStatusUi'

/**
 * One option in a facet-driven select (task 9.1, ADM-01).
 *
 * `value` is the canonical id the server filters on; `label` is what the server
 * called it, including its whole-set count. The panel used to receive
 * `string[]` — display names harvested from the loaded rows — so an offering
 * with no application on the current page was simply not offered as a filter,
 * and the option list changed as the operator paged.
 */
export interface FilterSelectOption {
  value: string
  label: string
}

interface FiltersPanelProps {
  searchTerm: string
  statusFilter: string
  paymentFilter: string
  programFilter: string
  institutionFilter: string
  draftFilter: string
  assignedReviewerFilter?: string
  lateSubmissionFilter?: string
  pendingAmendmentsFilter?: string
  reviewQueueFilter?: string
  overdueReviewFilter?: string
  pendingDocumentsFilter?: string
  upcomingInterviewsFilter?: string
  /**
   * An open condition or enrollment confirmation falls due inside the server's
   * deadline window. The dashboard's "Deadlines in 48h" tile links straight to
   * this filter, so the roster has to be able to *show* it — a filter applied by
   * a link with no visible control is a page an operator cannot explain or clear.
   */
  deadlinePressureFilter?: string
  /** The server's own window, so the label states it instead of restating 48. */
  deadlinePressureHours?: number | null
  programOptions?: FilterSelectOption[]
  institutionOptions?: FilterSelectOption[]
  /**
   * Prefix for this instance's control ids.
   *
   * The roster renders the panel twice — once for the mobile sheet and once for
   * the desktop rail — and both were emitting the same `id`/`htmlFor` pairs. Two
   * elements sharing a DOM id is not a cosmetic problem: `<label for="…">`
   * resolves to whichever comes first, so on a small viewport the mobile
   * control's label pointed at the hidden desktop control, and a screen reader
   * or a click on the label reached the wrong element. Each instance now owns its
   * own id namespace. The default is empty so the desktop ids are unchanged.
   */
  idPrefix?: string
  onFilterChange: (key: keyof ApplicationFilters, value: string) => void
}

export function FiltersPanel({
  searchTerm,
  statusFilter,
  paymentFilter,
  programFilter,
  institutionFilter,
  draftFilter,
  assignedReviewerFilter = '',
  lateSubmissionFilter = '',
  pendingAmendmentsFilter = '',
  reviewQueueFilter = '',
  overdueReviewFilter = '',
  pendingDocumentsFilter = '',
  upcomingInterviewsFilter = '',
  deadlinePressureFilter = '',
  deadlinePressureHours = null,
  programOptions = [],
  institutionOptions = [],
  idPrefix = '',
  onFilterChange
}: FiltersPanelProps) {
  /** This instance's id for a control, so two panels never collide. */
  const controlId = (name: string) => `${idPrefix}${name}`

  // Local state keeps the input responsive on every keystroke
  const [localSearch, setLocalSearch] = useState(searchTerm)

  // Sync local state when the parent resets filters externally
  useEffect(() => {
    setLocalSearch(searchTerm)
  }, [searchTerm])

  // Debounce the actual filter update (triggers API call) by 300ms
  const debouncedSearchChange = useDebouncedCallback(
    (value: string) => onFilterChange('searchTerm', value),
    300
  )

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setLocalSearch(value)
    debouncedSearchChange(value)
  }

  const activeFilterCount = [statusFilter, paymentFilter, programFilter, institutionFilter, draftFilter !== 'all' ? draftFilter : '', assignedReviewerFilter, lateSubmissionFilter, pendingAmendmentsFilter, reviewQueueFilter, overdueReviewFilter, pendingDocumentsFilter, upcomingInterviewsFilter, deadlinePressureFilter].filter(Boolean).length

  const handleClearAll = () => {
    onFilterChange('searchTerm', '')
    onFilterChange('statusFilter', '')
    onFilterChange('paymentFilter', '')
    onFilterChange('programFilter', '')
    onFilterChange('institutionFilter', '')
    onFilterChange('draftFilter', 'all')
    onFilterChange('assignedReviewerFilter', '')
    onFilterChange('lateSubmissionFilter', '')
    onFilterChange('pendingAmendmentsFilter', '')
    onFilterChange('reviewQueueFilter', '')
    onFilterChange('overdueReviewFilter', '')
    onFilterChange('pendingDocumentsFilter', '')
    onFilterChange('upcomingInterviewsFilter', '')
    onFilterChange('deadlinePressureFilter', '')
  }

  const selectClasses = "w-full h-11 rounded-lg border border-border/60 bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors hover:border-primary/20"

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Filters</span>
          {activeFilterCount > 0 && (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md bg-primary px-1.5 text-xs font-bold text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </div>
        {(activeFilterCount > 0 || localSearch) && (
          <button
            onClick={handleClearAll}
            /* 44 px, not 36 (admissions-v2 task 11.5, R16.2). */
            className="min-h-touch min-w-touch rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <select value={reviewQueueFilter} onChange={(e) => onFilterChange('reviewQueueFilter', e.target.value)} className={selectClasses} aria-label="Review queue filter">
          <option value="">Review queue</option>
          <option value="true">In review queue</option>
          <option value="false">Outside review queue</option>
        </select>
        <select value={overdueReviewFilter} onChange={(e) => onFilterChange('overdueReviewFilter', e.target.value)} className={selectClasses} aria-label="Overdue review filter">
          <option value="">Review SLA</option>
          <option value="true">Overdue reviews</option>
          <option value="false">Not overdue</option>
        </select>
        <select value={pendingDocumentsFilter} onChange={(e) => onFilterChange('pendingDocumentsFilter', e.target.value)} className={selectClasses} aria-label="Pending documents filter">
          <option value="">Documents</option>
          <option value="true">Documents pending</option>
          <option value="false">No pending documents</option>
        </select>
        <select value={upcomingInterviewsFilter} onChange={(e) => onFilterChange('upcomingInterviewsFilter', e.target.value)} className={selectClasses} aria-label="Upcoming interviews filter">
          <option value="">Interviews</option>
          <option value="true">Upcoming interviews</option>
          <option value="false">No upcoming interviews</option>
        </select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
        <div className="md:col-span-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search applicant, email, application number…"
              value={localSearch}
              onChange={handleSearchChange}
              className="pl-10 h-11 rounded-lg border-border/60 hover:border-primary/20 transition-colors"
              aria-label="Search applications"
            />
          </div>
        </div>
        
        <div>
          <label htmlFor={controlId('draft-filter')} className="sr-only">Draft filter</label>
          <select
            id={controlId('draft-filter')}
            value={draftFilter}
            onChange={(e) => onFilterChange('draftFilter', e.target.value)}
            className={selectClasses}
          >
            {DRAFT_FILTER_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        
        <div>
          <label htmlFor={controlId('status-filter')} className="sr-only">Status filter</label>
          <select
            id={controlId('status-filter')}
            value={statusFilter}
            onChange={(e) => onFilterChange('statusFilter', e.target.value)}
            className={selectClasses}
          >
            <option value="">All statuses</option>
            {STATUS_FILTER_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        
        <div>
          <label htmlFor={controlId('payment-filter')} className="sr-only">Payment filter</label>
          <select
            id={controlId('payment-filter')}
            value={paymentFilter}
            onChange={(e) => onFilterChange('paymentFilter', e.target.value)}
            className={selectClasses}
          >
            <option value="">All payment states</option>
            <option value="not_paid">Awaiting payment</option>
            <option value="pending_review">Awaiting payment review</option>
            <option value="verified">Verified</option>
            <option value="rejected">Payment rejected</option>
            <option value="deferred">Deferred</option>
          </select>
        </div>
        
        <div>
          <label htmlFor={controlId('program-filter')} className="sr-only">Programme filter</label>
          <select
            id={controlId('program-filter')}
            value={programFilter}
            onChange={(e) => onFilterChange('programFilter', e.target.value)}
            className={selectClasses}
          >
            <option value="">All programmes</option>
            {/*
              The server's facet for this query, so an offering with no row on
              the loaded page is still offered, and each option carries its own
              whole-set count (task 9.1, ADM-01).
            */}
            {programOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>
      
      {/* Second row for institution filter and new filters */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mt-3">
        <div className="md:col-span-2">
          <label htmlFor={controlId('institution-filter')} className="sr-only">Institution filter</label>
          <select
            id={controlId('institution-filter')}
            value={institutionFilter}
            onChange={(e) => onFilterChange('institutionFilter', e.target.value)}
            className={selectClasses}
          >
            <option value="">All institutions</option>
            {institutionOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={controlId('late-submission-filter')} className="sr-only">Late submission filter</label>
          <select
            id={controlId('late-submission-filter')}
            value={lateSubmissionFilter}
            onChange={(e) => onFilterChange('lateSubmissionFilter', e.target.value)}
            className={selectClasses}
          >
            <option value="">Late submission</option>
            <option value="true">Late only</option>
            <option value="false">On-time Only</option>
          </select>
        </div>
        <div>
          <label htmlFor={controlId('pending-amendments-filter')} className="sr-only">Pending amendments filter</label>
          <select
            id={controlId('pending-amendments-filter')}
            value={pendingAmendmentsFilter}
            onChange={(e) => onFilterChange('pendingAmendmentsFilter', e.target.value)}
            className={selectClasses}
          >
            <option value="">Amendments</option>
            <option value="true">Has pending amendments</option>
            <option value="false">No pending amendments</option>
          </select>
        </div>
        <div>
          <label htmlFor={controlId('assigned-reviewer-filter')} className="sr-only">Assigned reviewer filter</label>
          <select
            id={controlId('assigned-reviewer-filter')}
            value={assignedReviewerFilter}
            onChange={(e) => onFilterChange('assignedReviewerFilter', e.target.value)}
            className={selectClasses}
          >
            <option value="">All reviewers</option>
            <option value="assigned">Has reviewer</option>
            <option value="unassigned">No reviewer</option>
          </select>
        </div>
        <div>
          <label htmlFor={controlId('deadline-pressure-filter')} className="sr-only">Deadline pressure filter</label>
          <select
            id={controlId('deadline-pressure-filter')}
            value={deadlinePressureFilter}
            onChange={(e) => onFilterChange('deadlinePressureFilter', e.target.value)}
            className={selectClasses}
            aria-label="Deadline pressure filter"
          >
            <option value="">Deadlines</option>
            <option value="true">
              {deadlinePressureHours ? `Due within ${deadlinePressureHours}h` : 'Due soon'}
            </option>
            <option value="false">No near deadline</option>
          </select>
        </div>
      </div>
    </div>
  )
}
