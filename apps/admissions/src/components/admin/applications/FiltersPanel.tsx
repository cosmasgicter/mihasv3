import React, { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import type { ApplicationFilters } from '@/hooks/admin/useApplicationFilters'
import { DRAFT_FILTER_OPTIONS } from '@/hooks/admin/useApplicationFilters'
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback'

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
  onFilterChange
}: FiltersPanelProps) {
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

  return (
    <div className="bg-card rounded-lg shadow p-6 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div className="md:col-span-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-foreground" />
            <Input
              placeholder="Search applicant, email, application number, programme, or institution..."
              value={localSearch}
              onChange={handleSearchChange}
              className="pl-10"
            />
          </div>
        </div>
        
        <div>
          <label htmlFor="draft-filter" className="sr-only">Draft filter</label>
          <select
            id="draft-filter"
            value={draftFilter}
            onChange={(e) => onFilterChange('draftFilter', e.target.value)}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {DRAFT_FILTER_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        
        <div>
          <label htmlFor="status-filter" className="sr-only">Status filter</label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => onFilterChange('statusFilter', e.target.value)}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        
        <div>
          <label htmlFor="payment-filter" className="sr-only">Payment filter</label>
          <select
            id="payment-filter"
            value={paymentFilter}
            onChange={(e) => onFilterChange('paymentFilter', e.target.value)}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">All Payment States</option>
            <option value="not_paid">Awaiting Payment</option>
            <option value="pending_review">Awaiting Payment Review</option>
            <option value="verified">Verified</option>
            <option value="rejected">Payment Rejected</option>
          </select>
        </div>
        
        <div>
          <label htmlFor="program-filter" className="sr-only">Program filter</label>
          <select
            id="program-filter"
            value={programFilter}
            onChange={(e) => onFilterChange('programFilter', e.target.value)}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">All Programs</option>
            <option value="Clinical Medicine">Clinical Medicine</option>
            <option value="Environmental Health">Environmental Health</option>
            <option value="Registered Nursing">Registered Nursing</option>
          </select>
        </div>
      </div>
      
      {/* Second row for institution filter and new filters */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mt-4">
        <div className="md:col-span-2">
          <label htmlFor="institution-filter" className="sr-only">Institution filter</label>
          <select
            id="institution-filter"
            value={institutionFilter}
            onChange={(e) => onFilterChange('institutionFilter', e.target.value)}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">All Institutions</option>
            <option value="Kalulushi Training Centre">Kalulushi Training Centre</option>
            <option value="Mukuba Institute of Health and Allied Sciences">Mukuba Institute of Health and Allied Sciences</option>
          </select>
        </div>
        <div>
          <label htmlFor="late-submission-filter" className="sr-only">Late submission filter</label>
          <select
            id="late-submission-filter"
            value={lateSubmissionFilter}
            onChange={(e) => onFilterChange('lateSubmissionFilter', e.target.value)}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">Late Submission</option>
            <option value="true">Late Only</option>
            <option value="false">On-time Only</option>
          </select>
        </div>
        <div>
          <label htmlFor="pending-amendments-filter" className="sr-only">Pending amendments filter</label>
          <select
            id="pending-amendments-filter"
            value={pendingAmendmentsFilter}
            onChange={(e) => onFilterChange('pendingAmendmentsFilter', e.target.value)}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">Amendments</option>
            <option value="true">Has Pending Amendments</option>
            <option value="false">No Pending Amendments</option>
          </select>
        </div>
        <div>
          <label htmlFor="assigned-reviewer-filter" className="sr-only">Assigned reviewer filter</label>
          <select
            id="assigned-reviewer-filter"
            value={assignedReviewerFilter}
            onChange={(e) => onFilterChange('assignedReviewerFilter', e.target.value)}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">All Reviewers</option>
            <option value="assigned">Has Reviewer</option>
            <option value="unassigned">No Reviewer</option>
          </select>
        </div>
      </div>
    </div>
  )
}
