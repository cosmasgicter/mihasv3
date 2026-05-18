import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { applicationService } from '@/services/applications'
import { logApiError } from '@/lib/apiErrorLogger'
import { ApplicationFilters, DEFAULT_APPLICATION_FILTERS } from './useApplicationFilters'
import { calculatePointsFromSummary } from '@/lib/grades'
import type { GradeSummaryInput } from '@/lib/grades'
import { invalidateAdminApplicationQueries } from './applicationQueryInvalidation'

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
  payment_verified_at: string | null
  payment_verified_by: string | null
  payment_verified_by_name: string | null
  payment_verified_by_email: string | null
  last_payment_audit_id: string | null
  last_payment_audit_at: string | null
  last_payment_audit_by_name: string | null
  last_payment_audit_by_email: string | null
  last_payment_audit_notes: string | null
  last_payment_reference: string | null
  application_fee: number
  paid_amount: number
  submitted_at: string
  updated_at?: string
  created_at: string
  result_slip_url: string
  extra_kyc_url: string
  grades_summary: string
  total_subjects: number
  points: number
  age: number
  days_since_submission: number
  admin_feedback: string
  admin_feedback_date: string | null
  admin_feedback_by: string | null
  nationality: string
  isDraft: boolean
  completionPercentage: number
  lastUpdated: string
}

interface PaginationState {
  pageSize: number
  currentPage: number
  totalCount: number
  loadedCount: number
  hasMore: boolean
}

const DEFAULT_PAGE_SIZE = 25

type LoadMode = 'initial' | 'loadMore' | 'refresh'

/** Raw application row from the API — all fields optional and loosely typed */
type RawApplicationRow = Record<string, unknown> & { id: string; status?: string }

// Calculate completion percentage for draft applications
const calculateCompletionPercentage = (application: RawApplicationRow): number => {
  if (application.status !== 'draft') return 100
  
  const requiredFields = [
    'full_name', 'date_of_birth', 'sex', 'phone', 'email',
    'residence_town', 'program', 'intake', 'institution',
    'result_slip_url'
  ]
  
  const completedFields = requiredFields.filter(field => {
    const value = application[field]
    return value !== null && value !== undefined && value !== ''
  })
  
  return Math.round((completedFields.length / requiredFields.length) * 100)
}

const str = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : fallback

const strOrNull = (v: unknown): string | null =>
  typeof v === 'string' ? v : null

const mapApplicationRow = (row: RawApplicationRow): ApplicationSummary => ({
  id: String(row.id),
  user_id: str(row.user_id),
  application_number: str(row.application_number),
  full_name: str(row.full_name),
  email: str(row.email),
  phone: str(row.phone),
  program: str(row.program),
  intake: str(row.intake),
  institution: str(row.institution),
  status: str(row.status, 'draft'),
  payment_status: str(row.payment_status, 'not_paid'),
  payment_verified_at: strOrNull(row.payment_verified_at),
  payment_verified_by: strOrNull(row.payment_verified_by),
  payment_verified_by_name: strOrNull(row.payment_verified_by_name),
  payment_verified_by_email: strOrNull(row.payment_verified_by_email),
  last_payment_audit_id: strOrNull(row.last_payment_audit_id),
  last_payment_audit_at: strOrNull(row.last_payment_audit_at),
  last_payment_audit_by_name: strOrNull(row.last_payment_audit_by_name),
  last_payment_audit_by_email: strOrNull(row.last_payment_audit_by_email),
  last_payment_audit_notes: strOrNull(row.last_payment_audit_notes),
  last_payment_reference: strOrNull(row.last_payment_reference),
  application_fee: Number(row.application_fee ?? 0),
  paid_amount: Number(row.paid_amount ?? 0),
  submitted_at: str(row.submitted_at) || str(row.created_at),
  updated_at: str(row.updated_at),
  created_at: str(row.created_at) || str(row.submitted_at),
  result_slip_url: str(row.result_slip_url),
  extra_kyc_url: str(row.extra_kyc_url),
  grades_summary: str(row.grades_summary),
  total_subjects: Number(row.total_subjects ?? 0),
  points: Number(row.points ?? calculatePointsFromSummary(row.grades_summary as GradeSummaryInput)),
  age: Number(row.age ?? 0),
  days_since_submission: Number(row.days_since_submission ?? 0),
  admin_feedback: str(row.admin_feedback),
  admin_feedback_date: strOrNull(row.admin_feedback_date),
  admin_feedback_by: strOrNull(row.admin_feedback_by),
  nationality: str(row.nationality),
  isDraft: row.status === 'draft',
  completionPercentage: calculateCompletionPercentage(row),
  lastUpdated: str(row.updated_at) || str(row.created_at)
})

export function useApplicationsData(filters: ApplicationFilters = DEFAULT_APPLICATION_FILTERS) {
  const queryClient = useQueryClient()
  
  const [applications, setApplications] = useState<ApplicationSummary[]>([])
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [pageSize] = useState(DEFAULT_PAGE_SIZE)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  const filtersRef = useRef<ApplicationFilters>(filters || DEFAULT_APPLICATION_FILTERS)
  const applicationsRef = useRef<ApplicationSummary[]>([])

  useEffect(() => {
    filtersRef.current = filters || DEFAULT_APPLICATION_FILTERS
  }, [filters])

  useEffect(() => {
    applicationsRef.current = applications
  }, [applications])

  const hydrateApplicationById = useCallback(async (id: string) => {
    if (!id) return null
    try {
      const result = await applicationService.getById(id)
      return result?.application ? mapApplicationRow(result.application) : null
    } catch (err) {
      logApiError('admin-applications', `/applications/${id}/details/`, err)
      return null
    }
  }, [])

  const loadPage = useCallback(async (page: number, mode: LoadMode) => {
    const safePage = Math.max(page, 1)
    const activeFilters = filters || DEFAULT_APPLICATION_FILTERS

    const isInitial = mode === 'initial'
    const isLoadMore = mode === 'loadMore'
    const isRefresh = mode === 'refresh'

    try {
      setError('')

      if (isInitial) {
        setIsInitialLoading(true)
        setApplications([])
      } else if (isLoadMore) {
        setIsLoadingMore(true)
      } else if (isRefresh) {
        setIsRefreshing(true)
      }

      // Build query params for applicationService
      const params: Record<string, string | number | boolean> = {
        page: isRefresh ? 1 : safePage,
        pageSize: isRefresh ? (safePage * pageSize) : pageSize,
        sortBy: 'date',
        sortOrder: 'desc',
      }

      if (activeFilters.searchTerm) {
        params.search = activeFilters.searchTerm.trim()
      }
      if (activeFilters.statusFilter) {
        params.status = activeFilters.statusFilter
      }
      if (activeFilters.paymentFilter) {
        params.payment = activeFilters.paymentFilter
      }
      if (activeFilters.programFilter) {
        params.program = activeFilters.programFilter
      }
      if (activeFilters.institutionFilter) {
        params.institution = activeFilters.institutionFilter
      }
      if (activeFilters.assignedReviewerFilter) {
        params.reviewer_assignment = activeFilters.assignedReviewerFilter
      }
      if (activeFilters.lateSubmissionFilter) {
        params.is_late_submission = activeFilters.lateSubmissionFilter
      }
      if (activeFilters.pendingAmendmentsFilter) {
        params.has_pending_amendments = activeFilters.pendingAmendmentsFilter
      }
      if (activeFilters.reviewQueueFilter) {
        params.review_queue = activeFilters.reviewQueueFilter
      }
      if (activeFilters.overdueReviewFilter) {
        params.overdue_review = activeFilters.overdueReviewFilter
      }
      if (activeFilters.pendingDocumentsFilter) {
        params.has_pending_documents = activeFilters.pendingDocumentsFilter
      }
      if (activeFilters.upcomingInterviewsFilter) {
        params.has_upcoming_interviews = activeFilters.upcomingInterviewsFilter
      }
      if (activeFilters.draftFilter === 'drafts') {
        params.status = 'draft'
      } else if (activeFilters.draftFilter === 'completed') {
        params.excludeStatus = 'draft'
      }

      const result = await applicationService.list(params)
      const data = result?.applications ?? []
      const count = result?.totalCount ?? 0

      const mapped = data.map(mapApplicationRow)
      setTotalCount(count)

      if (isLoadMore) {
        setApplications(prev => {
          const existingIds = new Set(prev.map(item => item.id))
          const newRecords = mapped.filter(item => !existingIds.has(item.id))
          return [...prev, ...newRecords]
        })
        setCurrentPage(safePage)
      } else {
        setApplications(mapped)
        if (!isRefresh) setCurrentPage(safePage)
      }
    } catch (err: unknown) {
      logApiError('admin-applications', '/applications/', err)
      const message = err instanceof Error ? err.message : 'Failed to load applications.'
      setError(message)
      if (mode === 'loadMore') {
        setCurrentPage(prev => Math.max(prev - 1, 1))
      }
    } finally {
      if (isInitial) setIsInitialLoading(false)
      if (isLoadMore) setIsLoadingMore(false)
      if (isRefresh) setIsRefreshing(false)
    }
  }, [filters, pageSize])

  useEffect(() => {
    setApplications([])
    setTotalCount(0)
    setCurrentPage(1)
    void loadPage(1, 'initial')
  }, [loadPage])

  const loadNextPage = useCallback(async () => {
    if (isLoadingMore || isInitialLoading) return
    if (applications.length >= totalCount && totalCount > 0) return
    await loadPage(currentPage + 1, 'loadMore')
  }, [applications.length, currentPage, isInitialLoading, isLoadingMore, loadPage, totalCount])

  const refreshCurrentPage = useCallback(async () => {
    await loadPage(currentPage, 'refresh')
  }, [currentPage, loadPage])

  const loadApplications = useCallback(async () => {
    await loadPage(1, 'initial')
  }, [loadPage])

  const pagination: PaginationState = useMemo(() => ({
    pageSize,
    currentPage,
    totalCount,
    loadedCount: applications.length,
    hasMore: applications.length < totalCount
  }), [applications.length, currentPage, pageSize, totalCount])

  const updateStatus = useCallback(async (applicationId: string, newStatus: string, options?: { notes?: string; force?: boolean }) => {
    const previousApplications = applicationsRef.current
    try {
      setApplications(prev => prev.map(app => 
        app.id === applicationId ? { ...app, status: newStatus } : app
      ))
      const result = await applicationService.updateStatus(applicationId, newStatus, options?.notes, options?.force)
      
      // Check for advisory payment warning (Req 26.4)
      if (result && typeof result === 'object' && 'warning' in result && (result as { warning?: boolean }).warning === true) {
        // Revert optimistic update — this was just a warning, not a real update
        setApplications(previousApplications)
        return result
      }

      await invalidateAdminApplicationQueries(queryClient, { applicationId })
      await loadPage(currentPage, 'refresh')
      return result
    } catch (error) {
      logApiError('admin-applications', `/applications/${applicationId}/review/`, error)
      setApplications(previousApplications)
      throw error
    }
  }, [currentPage, loadPage, queryClient])

  const updatePaymentStatus = useCallback(async (
    applicationId: string,
    newPaymentStatus: string,
    verificationNotes?: string,
    force?: boolean
  ) => {
    const previousApplications = applicationsRef.current
    try {
      setApplications(prev => prev.map(app => 
        app.id === applicationId ? { ...app, payment_status: newPaymentStatus } : app
      ))
      const result = await applicationService.updatePaymentStatus(applicationId, newPaymentStatus, verificationNotes, force)

      // Check for advisory payment proof warning (same pattern as update_status)
      if (result && typeof result === 'object' && 'warning' in result && (result as { warning?: boolean }).warning === true) {
        // Revert optimistic update — this was just a warning, not a real update
        setApplications(previousApplications)
        return result
      }

      await invalidateAdminApplicationQueries(queryClient, {
        applicationId,
        includePaymentStatus: true,
      })
      await loadPage(currentPage, 'refresh')
    } catch (error) {
      logApiError('admin-applications', `/applications/${applicationId}/review/`, error)
      setApplications(previousApplications)
      throw error
    }
  }, [currentPage, loadPage, queryClient])

  return {
    applications,
    isInitialLoading,
    isRefreshing,
    isLoadingMore,
    error,
    pagination,
    hasMore: pagination.hasMore,
    loadNextPage,
    refreshCurrentPage,
    loadApplications,
    updateStatus,
    updatePaymentStatus
  }
}
