import React, { useState, useMemo } from 'react'
import { Search, Filter, SortDesc, Download, RefreshCw, Users, FileText, Clock, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MobileOptimizedButton } from '../ui/MobileOptimizedButton'
import { EnhancedInput, EnhancedSelect } from '../ui/EnhancedFormComponents'
import { SkeletonTable } from '../ui/EnhancedLoadingSpinner'
import { BulkOperations } from './BulkOperations'

// Institution code to name mapping
const INSTITUTION_NAMES: Record<string, string> = {
  'KATC': 'Kalulushi Training Centre',
  'katc': 'Kalulushi Training Centre',
  'MIHAS': 'Mukuba Institute of Health and Allied Sciences',
  'mihas': 'Mukuba Institute of Health and Allied Sciences'
}

const getInstitutionName = (code?: string) => {
  if (!code) return 'Not specified'
  return INSTITUTION_NAMES[code] || code
}

export interface Application {
  id: string
  fullName: string
  email: string
  phone: string
  program: string
  status: 'draft' | 'submitted' | 'under-review' | 'approved' | 'rejected'
  paymentStatus: 'pending' | 'verified' | 'rejected'
  submittedAt: string
  institution: 'MIHAS' | 'KATC'
  trackingCode: string
  eligibilityScore?: number
}

interface EnhancedApplicationsTableProps {
  applications: Application[]
  loading?: boolean
  onRefresh?: () => void
  onExport?: (filteredData: Application[]) => void
  onStatusUpdate?: (applicationIds: string[], newStatus: string) => Promise<void>
  onPaymentUpdate?: (applicationIds: string[], newStatus: string) => Promise<void>
  onBulkEmail?: (applicationIds: string[]) => Promise<void>
}

type SortField = 'fullName' | 'submittedAt' | 'program' | 'status' | 'eligibilityScore'
type SortDirection = 'asc' | 'desc'

interface FilterState {
  search: string
  status: string
  paymentStatus: string
  program: string
  institution: string
  dateRange: string
  eligibilityRange: string
}

export function EnhancedApplicationsTable({
  applications,
  loading = false,
  onRefresh,
  onExport,
  onStatusUpdate,
  onPaymentUpdate,
  onBulkEmail
}: EnhancedApplicationsTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [sortField, setSortField] = useState<SortField>('submittedAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    status: '',
    paymentStatus: '',
    program: '',
    institution: '',
    dateRange: '',
    eligibilityRange: ''
  })

  // Filter and sort applications
  const filteredAndSortedApplications = useMemo(() => {
    let filtered = applications.filter(app => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase()
        const searchableText = `${app.fullName} ${app.email} ${app.trackingCode} ${app.phone}`.toLowerCase()
        if (!searchableText.includes(searchLower)) return false
      }

      // Status filters
      if (filters.status && app.status !== filters.status) return false
      if (filters.paymentStatus && app.paymentStatus !== filters.paymentStatus) return false
      if (filters.program && app.program !== filters.program) return false
      if (filters.institution && app.institution !== filters.institution) return false

      // Date range filter
      if (filters.dateRange) {
        const appDate = new Date(app.submittedAt)
        const now = new Date()
        const daysAgo = {
          'today': 1,
          'week': 7,
          'month': 30,
          'quarter': 90
        }[filters.dateRange]
        
        if (daysAgo) {
          const cutoffDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)
          if (appDate < cutoffDate) return false
        }
      }

      // Eligibility range filter
      if (filters.eligibilityRange && app.eligibilityScore !== undefined) {
        const [min, max] = filters.eligibilityRange.split('-').map(Number)
        if (app.eligibilityScore < min || app.eligibilityScore > max) return false
      }

      return true
    })

    // Sort applications
    filtered.sort((a, b) => {
      let aValue: any
      let bValue: any

      switch (sortField) {
        case 'fullName':
          aValue = a.fullName.toLowerCase()
          bValue = b.fullName.toLowerCase()
          break
        case 'submittedAt':
          aValue = new Date(a.submittedAt).getTime()
          bValue = new Date(b.submittedAt).getTime()
          break
        case 'eligibilityScore':
          aValue = a.eligibilityScore || 0
          bValue = b.eligibilityScore || 0
          break
        default:
          aValue = a[sortField]
          bValue = b[sortField]
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return filtered
  }, [applications, filters, sortField, sortDirection])

  // Statistics
  const stats = useMemo(() => {
    const total = filteredAndSortedApplications.length
    const submitted = filteredAndSortedApplications.filter(app => app.status === 'submitted').length
    const underReview = filteredAndSortedApplications.filter(app => app.status === 'under-review').length
    const approved = filteredAndSortedApplications.filter(app => app.status === 'approved').length
    const pendingPayment = filteredAndSortedApplications.filter(app => app.paymentStatus === 'pending').length

    return { total, submitted, underReview, approved, pendingPayment }
  }, [filteredAndSortedApplications])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const handleSelectAll = () => {
    if (selectedIds.length === filteredAndSortedApplications.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredAndSortedApplications.map(app => app.id))
    }
  }

  const handleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(selectedId => selectedId !== id))
    } else {
      setSelectedIds([...selectedIds, id])
    }
  }

  const clearFilters = () => {
    setFilters({
      search: '',
      status: '',
      paymentStatus: '',
      program: '',
      institution: '',
      dateRange: '',
      eligibilityRange: ''
    })
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      'draft': 'bg-gray-100 dark:bg-gray-800 dark:bg-gray-200 text-gray-800 dark:text-gray-200 dark:text-gray-700',
      'submitted': 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 dark:text-blue-800',
      'under-review': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200',
      'approved': 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200',
      'rejected': 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
    }[status] || 'bg-gray-100 dark:bg-gray-800 dark:bg-gray-200 text-gray-800 dark:text-gray-200 dark:text-gray-700'

    return (
      <span className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        styles
      )}>
        {status.replace('-', ' ').toUpperCase()}
      </span>
    )
  }

  const getPaymentBadge = (status: string) => {
    const styles = {
      'pending': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200',
      'verified': 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200',
      'rejected': 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
    }[status] || 'bg-gray-100 dark:bg-gray-800 dark:bg-gray-200 text-gray-800 dark:text-gray-200 dark:text-gray-700'

    return (
      <span className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        styles
      )}>
        {status.toUpperCase()}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-16 bg-gray-100 dark:bg-gray-800 dark:bg-gray-200 rounded-lg animate-pulse" />
        <SkeletonTable rows={10} cols={7} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-gray-800 dark:bg-gray-200 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span className="ml-2 text-sm font-medium text-gray-600 dark:text-gray-400">Total</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{stats.total}</p>
        </div>
        
        <div className="bg-white dark:bg-gray-800 dark:bg-gray-200 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <FileText className="w-5 h-5 text-green-600 dark:text-green-400" />
            <span className="ml-2 text-sm font-medium text-gray-600 dark:text-gray-400">Submitted</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{stats.submitted}</p>
        </div>
        
        <div className="bg-white dark:bg-gray-800 dark:bg-gray-200 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400 dark:text-yellow-500" />
            <span className="ml-2 text-sm font-medium text-gray-600 dark:text-gray-400">Review</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{stats.underReview}</p>
        </div>
        
        <div className="bg-white dark:bg-gray-800 dark:bg-gray-200 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
            <span className="ml-2 text-sm font-medium text-gray-600 dark:text-gray-400">Approved</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{stats.approved}</p>
        </div>
        
        <div className="bg-white dark:bg-gray-800 dark:bg-gray-200 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <Clock className="w-5 h-5 text-orange-600" />
            <span className="ml-2 text-sm font-medium text-gray-600 dark:text-gray-400">Payment</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{stats.pendingPayment}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white dark:bg-gray-800 dark:bg-gray-200 p-4 rounded-lg border border-gray-200 dark:border-gray-700 space-y-4">
        {/* Main toolbar */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1 max-w-md">
            <EnhancedInput
              placeholder="Search applications..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              leftIcon={<Search className="w-4 h-4" />}
            />
          </div>
          
          <div className="flex items-center gap-2">
            <MobileOptimizedButton
              onClick={() => setShowFilters(!showFilters)}
              variant="outline"
              size="md"
              icon={<Filter className="w-4 h-4" />}
            >
              Filters
            </MobileOptimizedButton>
            
            {onRefresh && (
              <MobileOptimizedButton
                onClick={onRefresh}
                variant="outline"
                size="md"
                icon={<RefreshCw className="w-4 h-4" />}
              >
                Refresh
              </MobileOptimizedButton>
            )}
            
            {onExport && (
              <MobileOptimizedButton
                onClick={() => onExport(filteredAndSortedApplications)}
                variant="outline"
                size="md"
                icon={<Download className="w-4 h-4" />}
              >
                Export
              </MobileOptimizedButton>
            )}
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <EnhancedSelect
              placeholder="All Statuses"
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              options={[
                { value: '', label: 'All Statuses' },
                { value: 'draft', label: 'Draft' },
                { value: 'submitted', label: 'Submitted' },
                { value: 'under-review', label: 'Under Review' },
                { value: 'approved', label: 'Approved' },
                { value: 'rejected', label: 'Rejected' }
              ]}
            />
            
            <EnhancedSelect
              placeholder="Payment Status"
              value={filters.paymentStatus}
              onChange={(e) => setFilters(prev => ({ ...prev, paymentStatus: e.target.value }))}
              options={[
                { value: '', label: 'All Payment Status' },
                { value: 'pending', label: 'Pending' },
                { value: 'verified', label: 'Verified' },
                { value: 'rejected', label: 'Rejected' }
              ]}
            />
            
            <EnhancedSelect
              placeholder="Program"
              value={filters.program}
              onChange={(e) => setFilters(prev => ({ ...prev, program: e.target.value }))}
              options={[
                { value: '', label: 'All Programs' },
                { value: 'clinical-medicine', label: 'Clinical Medicine' },
                { value: 'environmental-health', label: 'Environmental Health' },
                { value: 'registered-nursing', label: 'Registered Nursing' }
              ]}
            />
            
            <MobileOptimizedButton
              onClick={clearFilters}
              variant="outline"
              size="md"
              fullWidth
            >
              Clear Filters
            </MobileOptimizedButton>
          </div>
        )}
      </div>

      {/* Bulk Operations */}
      {selectedIds.length > 0 && (
        <BulkOperations
          selectedCount={selectedIds.length}
          onStatusUpdate={onStatusUpdate ? (status) => onStatusUpdate(selectedIds, status) : undefined}
          onPaymentUpdate={onPaymentUpdate ? (status) => onPaymentUpdate(selectedIds, status) : undefined}
          onSendEmail={onBulkEmail ? () => onBulkEmail(selectedIds) : undefined}
          onClearSelection={() => setSelectedIds([])}
        />
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 dark:bg-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === filteredAndSortedApplications.length && filteredAndSortedApplications.length > 0}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-blue-600 dark:text-blue-400 border-gray-300 dark:border-gray-600 dark:border-gray-400 rounded focus:ring-blue-500"
                  />
                </th>
                
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:bg-gray-800 dark:bg-gray-200"
                    onClick={() => handleSort('fullName')}>
                  <div className="flex items-center space-x-1">
                    <span>Name</span>
                    {sortField === 'fullName' && (
                      <SortDesc className={cn('w-4 h-4', sortDirection === 'desc' ? 'transform rotate-0' : 'transform rotate-180')} />
                    )}
                  </div>
                </th>
                
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:bg-gray-800 dark:bg-gray-200"
                    onClick={() => handleSort('program')}>
                  <div className="flex items-center space-x-1">
                    <span>Program</span>
                    {sortField === 'program' && (
                      <SortDesc className={cn('w-4 h-4', sortDirection === 'desc' ? 'transform rotate-0' : 'transform rotate-180')} />
                    )}
                  </div>
                </th>
                
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:bg-gray-800 dark:bg-gray-200"
                    onClick={() => handleSort('status')}>
                  <div className="flex items-center space-x-1">
                    <span>Status</span>
                    {sortField === 'status' && (
                      <SortDesc className={cn('w-4 h-4', sortDirection === 'desc' ? 'transform rotate-0' : 'transform rotate-180')} />
                    )}
                  </div>
                </th>
                
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                  Payment
                </th>
                
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:bg-gray-800 dark:bg-gray-200"
                    onClick={() => handleSort('submittedAt')}>
                  <div className="flex items-center space-x-1">
                    <span>Submitted</span>
                    {sortField === 'submittedAt' && (
                      <SortDesc className={cn('w-4 h-4', sortDirection === 'desc' ? 'transform rotate-0' : 'transform rotate-180')} />
                    )}
                  </div>
                </th>
                
                {/* Eligibility Score Column */}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:bg-gray-800 dark:bg-gray-200"
                    onClick={() => handleSort('eligibilityScore')}>
                  <div className="flex items-center space-x-1">
                    <span>Score</span>
                    {sortField === 'eligibilityScore' && (
                      <SortDesc className={cn('w-4 h-4', sortDirection === 'desc' ? 'transform rotate-0' : 'transform rotate-180')} />
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            
            <tbody className="bg-white dark:bg-gray-800 dark:bg-gray-200 divide-y divide-gray-200">
              {filteredAndSortedApplications.map((application) => (
                <tr key={application.id} className="hover:bg-gray-50 dark:bg-gray-900">
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(application.id)}
                      onChange={() => handleSelectOne(application.id)}
                      className="w-4 h-4 text-blue-600 dark:text-blue-400 border-gray-300 dark:border-gray-600 dark:border-gray-400 rounded focus:ring-blue-500"
                    />
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {application.fullName}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-500">
                        {application.trackingCode}
                      </div>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-gray-100">{application.email}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-500">{application.phone}</div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-gray-100">
                      {application.program.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-500">{getInstitutionName(application.institution)}</div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(application.status)}
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getPaymentBadge(application.paymentStatus)}
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-500">
                    {new Date(application.submittedAt).toLocaleDateString()}
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    {application.eligibilityScore !== undefined ? (
                      <div className="flex items-center">
                        <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 mr-2">
                          <div 
                            className={cn(
                              'h-2 rounded-full',
                              application.eligibilityScore >= 80 ? 'bg-green-500' :
                              application.eligibilityScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                            )}
                            style={{ width: `${application.eligibilityScore}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {application.eligibilityScore}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400 dark:text-gray-500">Not calculated</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {filteredAndSortedApplications.length === 0 && (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No applications found</h3>
              <p className="text-gray-500 dark:text-gray-500">
                {applications.length === 0 
                  ? 'No applications have been submitted yet.'
                  : 'Try adjusting your search or filter criteria.'
                }
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
