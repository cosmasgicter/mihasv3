import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { AdminNavigation } from '@/components/ui/AdminNavigation'
import {
  FiltersPanel,
  MetricsHeader,
  ApplicationsTable,
  ApplicationsSkeleton,
  ApplicationDetailModal
} from '@/components/admin/applications'
import { APPLICATION_FILTER_KEYS, useApplicationsData, useApplicationFilters } from '@/hooks/admin'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { applicationService } from '@/services/applications'
import {
  exportToCSV,
  exportToExcel,
  exportToPDF,
  type ApplicationData
} from '@/lib/exportUtils'
import { 
  FileDown, 
  FileSpreadsheet, 
  FileText, 
  Search, 
  Filter, 
  RefreshCw, 
  Users, 
  TrendingUp, 
  Clock, 
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  Send,
  Download
} from 'lucide-react'

const EXPORT_BATCH_SIZE = 500

const sanitizeSearchTerm = (value: string) => {
  return value
    .trim()
    .replace(/[%_]/g, match => `\\${match}`)
    .replace(/,/g, '\\,')
}

const mapRecordToApplication = (record: any): ApplicationData => ({
  application_number: record.application_number ?? '',
  full_name: record.full_name ?? '',
  email: record.email ?? '',
  phone: record.phone ?? '',
  program: record.program ?? '',
  intake: record.intake ?? '',
  institution: record.institution ?? '',
  status: record.status ?? '',
  payment_status: record.payment_status ?? '',
  application_fee: Number(record.application_fee ?? 0),
  paid_amount: Number(record.paid_amount ?? 0),
  submitted_at: record.submitted_at || record.created_at || '',
  created_at: record.created_at || record.submitted_at || '',
  grades_summary: record.grades_summary ?? '',
  total_subjects: Number(record.total_subjects ?? 0),
  average_grade: Number(record.average_grade ?? 0),
  age: Number(record.age ?? 0),
  days_since_submission: Number(record.days_since_submission ?? 0)
})

const yieldToBrowser = () => new Promise<void>(resolve => setTimeout(resolve, 0))

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

  useEffect(() => {
    const params = new URLSearchParams(searchParamsString)
    const hasRelevantParams = APPLICATION_FILTER_KEYS.some(key => params.has(key))

    if (!hasProcessedSearchParamsRef.current && !hasRelevantParams) {
      hasProcessedSearchParamsRef.current = true
      return
    }

    const updates: Array<[keyof typeof filters, string]> = []

    APPLICATION_FILTER_KEYS.forEach(key => {
      const value = params.get(key) ?? ''
      if (value !== filtersRef.current[key]) {
        updates.push([key, value])
      }
    })

    if (updates.length > 0) {
      updates.forEach(([key, value]) => {
        updateFilter(key, value)
      })
    }

    hasProcessedSearchParamsRef.current = true
  }, [searchParamsString, updateFilter])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const params = new URLSearchParams(window.location.search)
    let changed = false

    APPLICATION_FILTER_KEYS.forEach(key => {
      const value = filters[key]
      if (value) {
        if (params.get(key) !== value) {
          params.set(key, value)
          changed = true
        }
      } else if (params.has(key)) {
        params.delete(key)
        changed = true
      }
    })

    if (changed) {
      setSearchParams(params, { replace: true })
    }
  }, [filters, setSearchParams])

  const {
    applications,
    isInitialLoading,
    isRefreshing,
    isLoadingMore,
    error,
    pagination,
    hasMore,
    loadNextPage,
    updateStatus,
    updatePaymentStatus
  } = useApplicationsData(filters)

  const { showError, showSuccess, showInfo } = useToast()
  const [exportingFormat, setExportingFormat] = useState<'csv' | 'excel' | 'pdf' | null>(null)
  const [selectedApplication, setSelectedApplication] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [modalLoading, setModalLoading] = useState<{
    notification: boolean
    acceptance: boolean
    receipt: boolean
  }>({ notification: false, acceptance: false, receipt: false })
  const [showFilters, setShowFilters] = useState(false)
  const [quickStats, setQuickStats] = useState({
    todaySubmissions: 0,
    pendingReview: 0,
    approved: 0,
    rejected: 0
  })

  const activeFilters = useMemo(() => ({ ...filters }), [filters])

  const createExportStream = useCallback(() => {
    const filtersSnapshot = activeFilters

    return (async function* generate() {
      let page = 0
      while (true) {
        const from = page * EXPORT_BATCH_SIZE
        const to = from + EXPORT_BATCH_SIZE - 1

        let query = supabase
          .from('admin_application_detailed')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, to)

        if (filtersSnapshot.searchTerm) {
          const searchValue = sanitizeSearchTerm(filtersSnapshot.searchTerm)
          const pattern = `%${searchValue}%`
          query = query.or(
            `full_name.ilike.${pattern},email.ilike.${pattern},application_number.ilike.${pattern}`
          )
        }

        if (filtersSnapshot.statusFilter) {
          query = query.eq('status', filtersSnapshot.statusFilter)
        }

        if (filtersSnapshot.paymentFilter) {
          query = query.eq('payment_status', filtersSnapshot.paymentFilter)
        }

        if (filtersSnapshot.programFilter) {
          query = query.eq('program', filtersSnapshot.programFilter)
        }

        if (filtersSnapshot.institutionFilter) {
          query = query.eq('institution', filtersSnapshot.institutionFilter)
        }

        const { data, error } = await query

        if (error) {
          throw new Error(error.message || 'Failed to fetch applications for export')
        }

        const rows = (data ?? []).map(mapRecordToApplication)

        if (!rows.length) {
          break
        }

        yield rows

        if (rows.length < EXPORT_BATCH_SIZE) {
          break
        }

        page += 1
        await yieldToBrowser()
      }
    })()
  }, [activeFilters])

  const handleExport = useCallback(async (format: 'csv' | 'excel' | 'pdf') => {
    if (exportingFormat) {
      return
    }

    setExportingFormat(format)
    showInfo('Preparing export', 'Formatting applications for download…')

    try {
      const stream = createExportStream()
      const timestamp = new Date().toISOString().split('T')[0]
      const filenameBase = `applications_${timestamp}`

      if (format === 'csv') {
        await exportToCSV(stream, `${filenameBase}.csv`)
      } else if (format === 'excel') {
        await exportToExcel(stream, `${filenameBase}.xlsx`)
      } else {
        await exportToPDF(stream, `${filenameBase}.pdf`)
      }

      showSuccess('Export complete', 'Your applications report has been downloaded.')
    } catch (error) {
      console.error('Failed to export applications', error)
      showError('Export failed', error instanceof Error ? error.message : 'Unable to export applications right now.')
    } finally {
      setExportingFormat(null)
    }
  }, [createExportStream, exportingFormat, showError, showInfo, showSuccess])

  const isExporting = exportingFormat !== null

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
    return applications.find(app => app.id === selectedApplication) || null
  }, [selectedApplication, applications])

  const handleSendNotification = useCallback(async () => {
    if (!selectedApplication) return
    
    setModalLoading(prev => ({ ...prev, notification: true }))
    try {
      await applicationService.sendNotification(selectedApplication, {
        title: 'Application Update',
        message: 'Your application status has been updated. Please check your dashboard for details.'
      })
      showSuccess('Notification sent', 'Student has been notified successfully.')
    } catch (error) {
      showError('Failed to send notification', error instanceof Error ? error.message : 'Unable to send notification.')
    } finally {
      setModalLoading(prev => ({ ...prev, notification: false }))
    }
  }, [selectedApplication, showSuccess, showError])

  const handleViewDocuments = useCallback(() => {
    if (!selectedApp) return
    
    const documents = []
    if (selectedApp.result_slip_url) documents.push({ name: 'Result Slip', url: selectedApp.result_slip_url })
    if (selectedApp.extra_kyc_url) documents.push({ name: 'Extra KYC', url: selectedApp.extra_kyc_url })
    if (selectedApp.pop_url) documents.push({ name: 'Proof of Payment', url: selectedApp.pop_url })
    
    if (documents.length === 0) {
      showInfo('No documents', 'No documents have been uploaded for this application.')
      return
    }
    
    documents.forEach(doc => {
      window.open(doc.url, '_blank', 'noopener,noreferrer')
    })
  }, [selectedApp, showInfo])

  const handleViewHistory = useCallback(async () => {
    if (!selectedApplication) return
    
    try {
      const response = await applicationService.getById(selectedApplication, { include: ['statusHistory'] })
      if (response.statusHistory && response.statusHistory.length > 0) {
        showInfo('Status History', `Application has ${response.statusHistory.length} status changes. Check the application timeline for details.`)
      } else {
        showInfo('No history', 'No status changes recorded for this application.')
      }
    } catch (error) {
      showError('Failed to load history', error instanceof Error ? error.message : 'Unable to load application history.')
    }
  }, [selectedApplication, showSuccess, showError, showInfo])

  const handleGenerateAcceptanceLetter = useCallback(async () => {
    if (!selectedApplication) return
    
    setModalLoading(prev => ({ ...prev, acceptance: true }))
    try {
      await applicationService.generateAcceptanceLetter(selectedApplication)
      showSuccess('Acceptance letter generated', 'The acceptance letter has been generated and sent to the student.')
    } catch (error) {
      showError('Failed to generate letter', error instanceof Error ? error.message : 'Unable to generate acceptance letter.')
    } finally {
      setModalLoading(prev => ({ ...prev, acceptance: false }))
    }
  }, [selectedApplication, showSuccess, showError])

  const handleGenerateFinanceReceipt = useCallback(async () => {
    if (!selectedApplication) return
    
    setModalLoading(prev => ({ ...prev, receipt: true }))
    try {
      await applicationService.generateFinanceReceipt(selectedApplication)
      showSuccess('Finance receipt generated', 'The finance receipt has been generated and sent to the student.')
    } catch (error) {
      showError('Failed to generate receipt', error instanceof Error ? error.message : 'Unable to generate finance receipt.')
    } finally {
      setModalLoading(prev => ({ ...prev, receipt: false }))
    }
  }, [selectedApplication, showSuccess, showError])

  const handleRefresh = useCallback(async () => {
    window.location.reload()
  }, [])

  const handleBulkAction = useCallback(async (action: string, selectedIds: string[]) => {
    if (selectedIds.length === 0) {
      showError('No selection', 'Please select applications to perform bulk action.')
      return
    }
    
    try {
      for (const id of selectedIds) {
        if (action === 'approve') {
          await updateStatus(id, 'approved')
        } else if (action === 'reject') {
          await updateStatus(id, 'rejected')
        } else if (action === 'review') {
          await updateStatus(id, 'under_review')
        }
      }
      showSuccess('Bulk action completed', `${selectedIds.length} applications updated successfully.`)
    } catch (error) {
      showError('Bulk action failed', error instanceof Error ? error.message : 'Unable to complete bulk action.')
    }
  }, [updateStatus, showSuccess, showError])

  // Calculate quick stats
  const stats = useMemo(() => {
    const today = new Date().toDateString()
    return {
      total: applications.length,
      todaySubmissions: applications.filter(app => 
        new Date(app.submitted_at || app.created_at).toDateString() === today
      ).length,
      pendingReview: applications.filter(app => app.status === 'submitted').length,
      underReview: applications.filter(app => app.status === 'under_review').length,
      approved: applications.filter(app => app.status === 'approved').length,
      rejected: applications.filter(app => app.status === 'rejected').length,
      paymentPending: applications.filter(app => app.payment_status === 'pending_review').length,
      paymentVerified: applications.filter(app => app.payment_status === 'verified').length
    }
  }, [applications])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <AdminNavigation />
      
      {/* Mobile-First Header */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Applications</h1>
              <p className="text-xs text-gray-500">{stats.total} total applications</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="sm:hidden"
            >
              <Filter className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Stats Cards - Mobile First */}
      <div className="px-4 py-4 sm:px-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Clock className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Today</p>
                <p className="text-lg font-bold text-gray-900">{stats.todaySubmissions}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Pending</p>
                <p className="text-lg font-bold text-gray-900">{stats.pendingReview}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Approved</p>
                <p className="text-lg font-bold text-gray-900">{stats.approved}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-red-100 rounded-lg">
                <XCircle className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Rejected</p>
                <p className="text-lg font-bold text-gray-900">{stats.rejected}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Export Actions */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Export Data</h3>
            <Download className="h-4 w-4 text-gray-400" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { void handleExport('csv') }}
              loading={exportingFormat === 'csv'}
              disabled={isExporting && exportingFormat !== 'csv'}
              className="text-xs"
            >
              <FileDown className="mr-1 h-3 w-3" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { void handleExport('excel') }}
              loading={exportingFormat === 'excel'}
              disabled={isExporting && exportingFormat !== 'excel'}
              className="text-xs"
            >
              <FileSpreadsheet className="mr-1 h-3 w-3" />
              Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { void handleExport('pdf') }}
              loading={exportingFormat === 'pdf'}
              disabled={isExporting && exportingFormat !== 'pdf'}
              className="text-xs"
            >
              <FileText className="mr-1 h-3 w-3" />
              PDF
            </Button>
          </div>
        </div>

        {/* Mobile Filters Panel */}
        {showFilters && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6 sm:hidden">
            <FiltersPanel
              searchTerm={filters.searchTerm}
              statusFilter={filters.statusFilter}
              paymentFilter={filters.paymentFilter}
              programFilter={filters.programFilter}
              institutionFilter={filters.institutionFilter}
              onFilterChange={updateFilter}
            />
          </div>
        )}

        {/* Desktop Filters */}
        <div className="hidden sm:block bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6">
          <FiltersPanel
            searchTerm={filters.searchTerm}
            statusFilter={filters.statusFilter}
            paymentFilter={filters.paymentFilter}
            programFilter={filters.programFilter}
            institutionFilter={filters.institutionFilter}
            onFilterChange={updateFilter}
          />
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 mb-6">
            <div className="flex items-center gap-3">
              <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-medium text-red-800">Error Loading Applications</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="ml-auto text-red-600 border-red-300 hover:bg-red-50"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Retry
              </Button>
            </div>
          </div>
        )}

        {isRefreshing && (
          <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-600 mb-6">
            <LoadingSpinner size="sm" />
            <span>Refreshing latest applications…</span>
          </div>
        )}

        {isInitialLoading ? (
          <ApplicationsSkeleton />
        ) : (
          <ApplicationsTable
            applications={applications}
            totalCount={pagination.totalCount}
            loadedCount={pagination.loadedCount}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={loadNextPage}
            onStatusUpdate={updateStatus}
            onPaymentStatusUpdate={updatePaymentStatus}
            onViewDetails={handleViewDetails}
          />
        )}

        <ApplicationDetailModal
          application={selectedApp}
          show={showDetails}
          updating={null}
          onClose={handleCloseDetails}
          onSendNotification={handleSendNotification}
          onViewDocuments={handleViewDocuments}
          onViewHistory={handleViewHistory}
          onUpdateStatus={updateStatus}
          onGenerateAcceptanceLetter={handleGenerateAcceptanceLetter}
          onGenerateFinanceReceipt={handleGenerateFinanceReceipt}
        />
      </div>
    </div>
  )
}