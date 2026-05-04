import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { animateClasses } from '@/lib/animations'
import { useSearchParams } from 'react-router-dom'
import {
  FiltersPanel,
  ApplicationsTable,
  ApplicationsTableView,
  ApplicationsSkeleton,
  ApplicationDetailModal
} from '@/components/admin/applications'
import { BulkActionsBar } from '@/components/admin/applications/BulkActionsBar'
import { AdminMetrics } from '@/components/admin/applications/AdminMetrics'
import { APPLICATION_FILTER_KEYS, useApplicationsData, useApplicationFilters } from '@/hooks/admin'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { useToastStore } from '@/hooks/useToast'
import { applicationService } from '@/services/applications'
import { documentService } from '@/services/documents'
import { logApiError } from '@/lib/apiErrorLogger'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { ConfirmAlertDialog } from '@/components/ui/alert-dialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { PageShell } from '@/components/ui/PageShell'
import { Seo } from '@/components/seo/Seo'
import { VirtualizedApplicationsGrid } from '@/components/admin/applications/VirtualizedApplicationsGrid'
import { ApplicationCard } from '@/components/admin/applications/ApplicationCard'
import {
  exportToCSV,
  exportToExcel,
  exportToPDF,
  type ApplicationData
} from '@/lib/exportUtils'
import { calculatePointsFromSummary } from '@/lib/grades'
import { buildApplicationsOverview } from '@/pages/admin/lib/applicationsOverview'
import { getPaymentStatusLabel } from '@/lib/paymentStatus'
import { formatApplicationStatus, type ApplicationStatus } from '@/types/applicationStatus'
import { BULK_ACTION_STATUS_MAP, type BulkApplicationAction } from '@/lib/applicationStatusUi'
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
  CreditCard,
  Eye,
  Send,
  Download,
  LayoutGrid,
  Table,
  Keyboard
} from 'lucide-react'

const EXPORT_BATCH_SIZE = 500

const sanitizeSearchTerm = (value: string) => {
  return value
    .trim()
    .replace(/[%_]/g, match => `\\${match}`)
    .replace(/,/g, '\\,')
}

const mapRecordToApplication = (record: any): ApplicationData => {
  const points = record.points && Number(record.points) > 0 
    ? Number(record.points) 
    : calculatePointsFromSummary(record.grades_summary)

  const paymentReviewedAt = record.last_payment_audit_at ?? record.payment_verified_at ?? ''
  const paymentReviewedBy =
    record.last_payment_audit_by_name ??
    record.last_payment_audit_by_email ??
    record.payment_verified_by_name ??
    record.payment_verified_by_email ??
    ''
  
  return {
    application_number: record.application_number ?? '',
    full_name: record.full_name ?? '',
    email: record.email ?? '',
    phone: record.phone ?? '',
    program: record.program ?? '',
    intake: record.intake ?? '',
    institution: record.institution ?? '',
    status: record.status ?? '',
    payment_status: record.payment_status ?? 'not_paid',
    application_fee: Number(record.application_fee ?? 0),
    paid_amount: Number(record.paid_amount ?? 0),
    submitted_at: record.submitted_at || record.created_at || '',
    updated_at: record.updated_at || '',
    created_at: record.created_at || record.submitted_at || '',
    grades_summary: record.grades_summary ?? '',
    total_subjects: Number(record.total_subjects ?? 0),
    points,
    age: Number(record.age ?? 0),
    days_since_submission: Number(record.days_since_submission ?? 0),
    payment_reviewed_at: paymentReviewedAt,
    payment_reviewed_by: paymentReviewedBy,
    payment_review_notes: record.last_payment_audit_notes ?? '',
    payment_reference: record.last_payment_reference ?? ''
  }
}

const buildApplicationsExportFileName = (filters: {
  statusFilter?: string
  paymentFilter?: string
  programFilter?: string
  institutionFilter?: string
}) => {
  const datePart = new Date().toISOString().split('T')[0]!
  const segments = ['applications']

  if (filters.statusFilter) {
    segments.push(`status-${filters.statusFilter}`)
  }

  if (filters.paymentFilter) {
    segments.push(`payment-${filters.paymentFilter}`)
  }

  if (filters.programFilter) {
    segments.push(`program-${filters.programFilter}`)
  }

  if (filters.institutionFilter) {
    segments.push(`institution-${filters.institutionFilter}`)
  }

  segments.push(datePart)

  return segments
    .join('_')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-]/g, '')
    .replace(/_+/g, '_')
}

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
    refreshCurrentPage,
    updateStatus,
    updatePaymentStatus
  } = useApplicationsData(filters)

  const { success: showSuccess, error: showError, info: showInfo } = useToastStore()
  const [exportingFormat, setExportingFormat] = useState<'csv' | 'excel' | 'pdf' | null>(null)
  const [selectedApplication, setSelectedApplication] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [modalLoading, setModalLoading] = useState<{
    notification: boolean
    acceptance: boolean
    receipt: boolean
  }>({ notification: false, acceptance: false, receipt: false })
  const [showFilters, setShowFilters] = useState(false)
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')

  const programOptions = useMemo(() => [...new Set(applications.map(a => a.program).filter(Boolean))].sort(), [applications])
  const institutionOptions = useMemo(() => [...new Set(applications.map(a => a.institution).filter(Boolean))].sort(), [applications])
  const confirmDialog = useConfirmDialog()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  // Track which application is currently being updated (for virtualized grid)
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null)
  const [updatingPaymentId, setUpdatingPaymentId] = useState<string | null>(null)

  const activeFilters = useMemo(() => ({ ...filters }), [filters])

  const createExportStream = useCallback(() => {
    const filtersSnapshot = activeFilters

    return (async function* generate() {
      let page = 0
      while (true) {
        const response = await applicationService.exportApplications({
          page,
          limit: EXPORT_BATCH_SIZE,
          search: filtersSnapshot.searchTerm || undefined,
          status: filtersSnapshot.statusFilter || undefined,
          payment: filtersSnapshot.paymentFilter || undefined,
          program: filtersSnapshot.programFilter || undefined,
          institution: filtersSnapshot.institutionFilter || undefined,
        })

        if (!response?.applications) {
          throw new Error('Failed to fetch applications for export')
        }

        const rows = response.applications.map(mapRecordToApplication)

        if (!rows.length) {
          break
        }

        yield rows

        if (!response.hasMore || rows.length < EXPORT_BATCH_SIZE) {
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
      const filenameBase = buildApplicationsExportFileName(activeFilters)

      if (format === 'csv') {
        await exportToCSV(stream, `${filenameBase}.csv`)
      } else if (format === 'excel') {
        await exportToExcel(stream, `${filenameBase}.xlsx`)
      } else {
        await exportToPDF(stream, `${filenameBase}.pdf`)
      }

      showSuccess('Export complete', 'Your applications report has been downloaded.')
    } catch (error) {
      logApiError('admin-applications', '/applications/export/', error)
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
      showError('Failed to send notification', error instanceof Error ? error.message : 'Unable to send notification.')
    } finally {
      setModalLoading(prev => ({ ...prev, notification: false }))
    }
  }, [selectedApplication, showSuccess, showError])

  const handleViewDocuments = useCallback(async () => {
    if (!selectedApp) return

    try {
      const documents = await applicationService.getDocuments(selectedApp.id) as Array<{ id?: string; document_name?: string }> | undefined
      const realDocuments = (documents || []).filter((doc) => doc.id)

      if (realDocuments.length === 0) {
        showInfo('No documents', 'Open the application details to review any legacy document references.')
        return
      }

      const signedUrls = await Promise.all(
        realDocuments.map(async (doc) => {
          const result = await documentService.getSignedUrl(doc.id!)
          return (result as any)?.url as string | undefined
        }),
      )

      const opened = signedUrls.filter(Boolean)
      opened.forEach((url) => {
        window.open(url, '_blank', 'noopener,noreferrer')
      })

      if (opened.length === 0) {
        showError('Documents unavailable', 'No document links could be prepared.')
        return
      }

      showInfo('Documents opened', `Opened ${opened.length} document(s) in new tabs.`)
    } catch (error) {
      logApiError('admin-applications', `/applications/${selectedApp.id}/documents/`, error)
      showError('Documents unavailable', error instanceof Error ? error.message : 'Unable to prepare document links.')
    }
  }, [selectedApp, showError, showInfo])

  const handleViewHistory = useCallback(async () => {
    if (!selectedApplication) return
    
    try {
      const response = await applicationService.getById(selectedApplication, { include: ['statusHistory'] })
      if (response && response.statusHistory && response.statusHistory.length > 0) {
        showInfo('Status History', `Application has ${response.statusHistory.length} status changes. Check the application timeline for details.`)
      } else {
        showInfo('No history', 'No status changes recorded for this application.')
      }
    } catch (error) {
      logApiError('admin-applications', `/applications/${selectedApplication}/summary/`, error)
      showError('Failed to load history', error instanceof Error ? error.message : 'Unable to load application history.')
    }
  }, [selectedApplication, showError, showInfo])

  const handleGenerateAcceptanceLetter = useCallback(async () => {
    if (!selectedApplication) return
    
    setModalLoading(prev => ({ ...prev, acceptance: true }))
    try {
      await applicationService.generateAcceptanceLetter(selectedApplication)
      showSuccess('Acceptance letter generated', 'The acceptance letter has been generated and sent to the student.')
    } catch (error) {
      logApiError('admin-applications', `/applications/${selectedApplication}/acceptance-letter/`, error)
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
      logApiError('admin-applications', `/applications/${selectedApplication}/finance-receipt/`, error)
      showError('Failed to generate receipt', error instanceof Error ? error.message : 'Unable to generate finance receipt.')
    } finally {
      setModalLoading(prev => ({ ...prev, receipt: false }))
    }
  }, [selectedApplication, showSuccess, showError])

  const handleRefresh = useCallback(async () => {
    await refreshCurrentPage()
    showInfo('Refreshed', 'Application data refreshed successfully.')
  }, [refreshCurrentPage, showInfo])

  // Wrapper for updateStatus with error handling and toast notifications
  const handleStatusUpdate = useCallback(async (applicationId: string, newStatus: ApplicationStatus, options?: { notes?: string; force?: boolean }) => {
    try {
      setUpdatingStatusId(applicationId)
      const result = await updateStatus(applicationId, newStatus, options)
      
      // If the API returned a payment warning, pass it through without showing success toast
      if (result && typeof result === 'object' && 'warning' in result && (result as any).warning === true) {
        return result
      }
      
      showSuccess('Status updated', `Application status changed to ${formatApplicationStatus(newStatus)}.`)
      return result
    } catch (error: any) {
      const status = error?.status ?? 0
      const message = error instanceof Error ? error.message : String(error)

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
      if (result && typeof result === 'object' && 'warning' in result && (result as any).warning === true) {
        const confirmed = await confirmDialog.confirm({
          title: 'Payment Warning',
          message: (result as any).message || 'No payment proof uploaded. Proceed anyway?',
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
    } catch (error: any) {
      const status = error?.status ?? 0
      const message = error instanceof Error ? error.message : String(error)

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
      await applicationService.bulkStatus({
        applicationIds: ids,
        status: targetStatus,
      })

      showSuccess('Bulk action completed', `${ids.length} applications updated successfully.`)
      setSelectedIds([])
      await refreshCurrentPage()
    } catch (error: any) {
      const status = error?.status ?? 0
      const message = error instanceof Error ? error.message : String(error)

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
  }, [showSuccess, showError, refreshCurrentPage])

  const stats = useMemo(() => {
    return buildApplicationsOverview(applications, pagination.totalCount)
  }, [applications, pagination.totalCount])

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
        title="Applications | MIHAS-KATC Admissions"
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
      metrics={[
        {
          label: 'Portfolio',
          value: `${stats.total} total`,
          helper: `${stats.loadedCount} currently loaded in this view`,
        },
        {
          label: 'Decision queue',
          value: stats.decisionQueue,
          helper: `${stats.pendingReview} new + ${stats.underReview} under review`,
        },
        {
          label: 'Payment proof review',
          value: stats.paymentPending,
          helper: `${stats.paymentNotPaid + stats.paymentRejected} still need follow-up`,
        },
        {
          label: 'Approved',
          value: stats.approved,
          helper: `${stats.rejected} rejected decisions recorded`,
        },
      ]}
      actions={
        <div className="flex items-center space-x-2">
          {/* View Toggle */}
          <div className="hidden sm:flex items-center bg-muted rounded-lg p-1">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-md transition-colors ${
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
              className={`p-1.5 rounded-md transition-colors ${
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
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
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
                  <div className="flex justify-between"><span>Refresh list</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">R</kbd></div>
                  <div className="flex justify-between"><span>Focus search</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">/</kbd></div>
                  <div className="flex justify-between"><span>Close modal</span><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">Esc</kbd></div>
                </div>
              </div>
            )}
          </div>
        </div>
      }
    >
      {/* Enhanced Admin Metrics */}
      <div className="px-4 py-4 sm:px-6">
        <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.8fr)]">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              {['High-confidence approvals', 'Payment-first decisioning', 'Queue visibility'].map((item) => (
                <span key={item} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700">
                  {item}
                </span>
              ))}
            </div>
            <h2 className="mt-4 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
              Built for fast triage without sacrificing judgment
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              The review flow now emphasizes what admissions officers need first: today’s intake pressure, payment proof requiring attention, and the exact queue that still needs a decision.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs font-semibold uppercase text-primary">Review posture</p>
            <div className="mt-4 grid gap-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase text-slate-500">Today</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">{stats.todaySubmissions} new submissions landed</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase text-slate-500">Most urgent</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">
                  {stats.paymentPending > 0 ? 'Payment proof review is active' : stats.decisionQueue > 0 ? 'Decision queue needs attention' : 'Queue is under control'}
                </p>
              </div>
            </div>
          </div>
        </div>
        <AdminMetrics applications={applications} />
        
        {/* Quick Stats Cards - Mobile First */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Today</p>
                <p className="text-2xl font-bold text-foreground">{stats.todaySubmissions}</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-accent/10 rounded-lg">
                <AlertCircle className="h-4 w-4 text-accent" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Decision Queue</p>
                <p className="text-2xl font-bold text-foreground">{stats.decisionQueue}</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-orange-100 rounded-lg">
                <CreditCard className="h-4 w-4 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Proof Review</p>
                <p className="text-2xl font-bold text-foreground">{stats.paymentPending}</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-destructive/10 rounded-lg">
                <XCircle className="h-4 w-4 text-destructive" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Payment Follow-up</p>
                <p className="text-2xl font-bold text-foreground">{stats.paymentNotPaid + stats.paymentRejected}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Export Actions */}
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Export Data</h3>
            <Download className="h-4 w-4 text-muted-foreground" />
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
          <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:hidden">
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
              programOptions={programOptions}
              institutionOptions={institutionOptions}
              onFilterChange={updateFilter}
            />
          </div>
        )}

        {/* Desktop Filters */}
        <div className="mb-6 hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:block">
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
            programOptions={programOptions}
            institutionOptions={institutionOptions}
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
            <div className="grid h-16 w-16 place-items-center rounded-lg border border-slate-200 bg-slate-50 mb-4">
              <FileText className="h-7 w-7 text-slate-500" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No applications found</h3>
            <p className="text-sm text-muted-foreground max-w-md">No applications match your current filters. Try adjusting your search criteria or clearing filters.</p>
          </div>
        ) : viewMode === 'table' ? (
          <ApplicationsTableView
            applications={applications}
            onViewDetails={handleViewDetails}
            onStatusUpdate={handleStatusUpdate as (id: string, status: string) => Promise<void>}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            loading={isRefreshing}
          />
        ) : applications.length > 100 ? (
          <VirtualizedApplicationsGrid
            applications={applications}
            onStatusUpdate={handleStatusUpdate as (id: string, status: string) => Promise<void>}
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
            totalCount={pagination.totalCount}
            loadedCount={pagination.loadedCount}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={loadNextPage}
            onStatusUpdate={handleStatusUpdate as (id: string, status: string) => Promise<void>}
            onPaymentStatusUpdate={handlePaymentStatusUpdate}
            onViewDetails={handleViewDetails}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
          />
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
          onViewDocuments={handleViewDocuments}
          onViewHistory={handleViewHistory}
          onUpdateStatus={handleStatusUpdate as (id: string, status: string, options?: { notes?: string; force?: boolean }) => Promise<any>}
          onPaymentStatusUpdate={handlePaymentStatusUpdate}
          onGenerateAcceptanceLetter={handleGenerateAcceptanceLetter}
          onGenerateFinanceReceipt={handleGenerateFinanceReceipt}
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
