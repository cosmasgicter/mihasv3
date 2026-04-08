import React from 'react'
import { Button } from '@/components/ui/Button'
import { 
  Search, 
  Filter as FilterIcon, 
  TrendingUp, 
  Download, 
  Settings, 
  RefreshCw,
  FileEdit,
  FileText,
  Calendar,
  User,
  BarChart3,
  Target,
  GraduationCap,
  CreditCard
} from 'lucide-react'

interface ApplicationsFiltersProps {
  searchTerm: string
  statusFilter: string
  sortBy: string
  sortOrder: string
  showAdvancedFilters: boolean
  dateRange: { start: string; end: string }
  programFilter: string
  institutionFilter: string
  paymentStatusFilter: string
  selectedCount: number
  onSearchChange: (value: string) => void
  onStatusFilterChange: (value: string) => void
  onSortChange: (sortBy: string, sortOrder: string) => void
  onToggleAdvancedFilters: () => void
  onToggleStats: () => void
  onShowExport: () => void
  onShowBulkActions: () => void
  onRefresh: () => void
  onDateRangeChange: (range: { start: string; end: string }) => void
  onProgramFilterChange: (value: string) => void
  onInstitutionFilterChange: (value: string) => void
  onPaymentStatusFilterChange: (value: string) => void
  onClearAdvancedFilters: () => void
}

export function ApplicationsFilters({
  searchTerm,
  statusFilter,
  sortBy,
  sortOrder,
  showAdvancedFilters,
  dateRange,
  programFilter,
  institutionFilter,
  paymentStatusFilter,
  selectedCount,
  onSearchChange,
  onStatusFilterChange,
  onSortChange,
  onToggleAdvancedFilters,
  onToggleStats,
  onShowExport,
  onShowBulkActions,
  onRefresh,
  onDateRangeChange,
  onProgramFilterChange,
  onInstitutionFilterChange,
  onPaymentStatusFilterChange,
  onClearAdvancedFilters
}: ApplicationsFiltersProps) {
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col space-y-4 sm:flex-row sm:justify-between sm:items-center sm:space-y-0">
        <div className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:space-y-0 sm:space-x-4">
          <h2 className="text-lg sm:text-xl font-bold text-foreground"><Search className="w-5 h-5" /> Search & Filter</h2>
          {selectedCount > 0 && (
            <div 
              className="flex items-center space-x-2 animate-scale-in"
            >
              <span className="text-sm text-secondary font-medium">
                {selectedCount} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={onShowBulkActions}
                className="btn-mobile"
                aria-label="Bulk actions"
              >
                <Settings className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Bulk Actions</span>
              </Button>
            </div>
          )}
        </div>
        
        <div className="flex items-center justify-between sm:space-x-3">
          <div className="flex space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleAdvancedFilters}
              className="touch-target"
              aria-label="Toggle advanced filters"
            >
              <FilterIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onShowExport}
              className="touch-target"
              aria-label="Export data"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleStats}
              className="touch-target"
              aria-label="Toggle statistics"
            >
              <TrendingUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              className="touch-target"
              aria-label="Refresh data"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Basic Search and Filters */}
      <div className="space-y-3 sm:space-y-0 sm:grid sm:grid-cols-1 md:grid-cols-4 sm:gap-4">
        {/* Search */}
        <div className="md:col-span-2">
          <div className="relative">
            <Search className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by applicant, email, application number, programme, or institution..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="form-input-mobile w-full pl-10 sm:pl-12 pr-4 py-3 border-2 border-border rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
        </div>
        
        {/* Status Filter */}
        <div>
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className="form-input-mobile w-full px-3 sm:px-4 py-3 border-2 border-border rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="all">All Application Statuses</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        
        {/* Sort Options */}
        <div>
          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [field, order] = e.target.value.split('-')
              onSortChange(field!, order!)
            }}
            className="form-input-mobile w-full px-3 sm:px-4 py-3 border-2 border-border rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="date-desc">Newest</option>
            <option value="date-asc">Oldest</option>
            <option value="name-asc">Applicant A-Z</option>
            <option value="name-desc">Applicant Z-A</option>
            <option value="status-asc">Status</option>
          </select>
        </div>
      </div>
      
      {/* Advanced Filters */}
        {showAdvancedFilters && (
          <div
            className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-primary/30 rounded-xl p-6 animate-slide-up"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-foreground"><Target className="w-5 h-5" /> Advanced Filters</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearAdvancedFilters}
                className="text-xs"
              >
                Clear All
              </Button>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Use payment filters to separate unpaid pay-later applications from proof that is already waiting for finance review.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Date Range */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground"><Calendar className="w-5 h-5" /> Date Range</label>
                <div className="space-y-2">
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => onDateRangeChange({...dateRange, start: e.target.value})}
                    className="w-full px-3 py-2 border border-input rounded-lg text-sm"
                    placeholder="Start date"
                  />
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => onDateRangeChange({...dateRange, end: e.target.value})}
                    className="w-full px-3 py-2 border border-input rounded-lg text-sm"
                    placeholder="End date"
                  />
                </div>
              </div>
              
              {/* Program Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground"><GraduationCap className="w-5 h-5" /> Program</label>
                <select
                  value={programFilter}
                  onChange={(e) => onProgramFilterChange(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-lg text-sm"
                >
                  <option value="all">All Programs</option>
                  <option value="Clinical Medicine">Clinical Medicine</option>
                  <option value="Environmental Health">Environmental Health</option>
                  <option value="Registered Nursing">Registered Nursing</option>
                </select>
              </div>
              
              {/* Institution Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">🏢 Institution</label>
                <select
                  value={institutionFilter}
                  onChange={(e) => onInstitutionFilterChange(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-lg text-sm"
                >
                  <option value="all">All Institutions</option>
                  <option value="Kalulushi Training Centre">Kalulushi Training Centre</option>
                  <option value="Mukuba Institute of Health and Allied Sciences">Mukuba Institute of Health and Allied Sciences</option>
                </select>
              </div>
              
              {/* Payment Status Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground"><CreditCard className="w-5 h-5" /> Payment Status</label>
                <select
                  value={paymentStatusFilter}
                  onChange={(e) => onPaymentStatusFilterChange(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-lg text-sm"
                >
                  <option value="all">All Payment States</option>
                  <option value="not_paid">Awaiting Payment</option>
                  <option value="pending_review">Awaiting Proof Review</option>
                  <option value="verified">Verified</option>
                  <option value="rejected">Rejected Proof</option>
                </select>
              </div>
            </div>
          </div>
        )}
    </div>
  )
}
