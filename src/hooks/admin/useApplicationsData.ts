// @ts-nocheck
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { applicationService } from '@/services/applications'
import { apiClient } from '@/services/client'
import { ApplicationFilters, DEFAULT_APPLICATION_FILTERS } from './useApplicationFilters'
import { calculatePointsFromSummary } from '@/utils/grades'

interface ApplicationSummary {
  id: string
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
  last_payment_audit_id: number | null
  last_payment_audit_at: string | null
  last_payment_audit_by_name: string | null
  last_payment_audit_by_email: string | null
  last_payment_audit_notes: string | null
  last_payment_reference: string | null
  application_fee: number
  paid_amount: number
  submitted_at: string
  created_at: string
  result_slip_url: string
  extra_kyc_url: string
  pop_url: string
  grades_summary: string
  total_subjects: number
  points: number
  age: number
  days_since_submission: number
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

// Calculate completion percentage for draft applications
const calculateCompletionPercentage = (application: any): number => {
  if (application.status !== 'draft') return 100
  
  const requiredFields = [
    'full_name', 'date_of_birth', 'sex', 'phone', 'email',
    'residence_town', 'program', 'intake', 'institution',
    'result_slip_url', 'payment_method', 'amount'
  ]
  
  const completedFields = requiredFields.filter(field => {
    const value = application[field]
    return value !== null && value !== undefined && value !== ''
  })
  
  return Math.round((completedFields.length / requiredFields.length) * 100)
}

const mapApplicationRow = (row: any): ApplicationSummary => ({
  id: row.id,
  application_number: row.application_number ?? '',
  full_name: row.full_name ?? '',
  email: row.email ?? '',
  phone: row.phone ?? '',
  program: row.program ?? '',
  intake: row.intake ?? '',
  institution: row.institution ?? '',
  status: row.status ?? 'draft',
  payment_status: row.payment_status ?? 'pending_review',
  payment_verified_at: row.payment_verified_at ?? null,
  payment_verified_by: row.payment_verified_by ?? null,
  payment_verified_by_name: row.payment_verified_by_name ?? null,
  payment_verified_by_email: row.payment_verified_by_email ?? null,
  last_payment_audit_id: row.last_payment_audit_id ?? null,
  last_payment_audit_at: row.last_payment_audit_at ?? null,
  last_payment_audit_by_name: row.last_payment_audit_by_name ?? null,
  last_payment_audit_by_email: row.last_payment_audit_by_email ?? null,
  last_payment_audit_notes: row.last_payment_audit_notes ?? null,
  last_payment_reference: row.last_payment_reference ?? null,
  application_fee: Number(row.application_fee ?? 0),
  paid_amount: Number(row.paid_amount ?? row.amount ?? 0),
  submitted_at: row.submitted_at ?? row.created_at ?? '',
  created_at: row.created_at ?? row.submitted_at ?? '',
  result_slip_url: row.result_slip_url ?? '',
  extra_kyc_url: row.extra_kyc_url ?? '',
  pop_url: row.pop_url ?? '',
  grades_summary: row.grades_summary ?? '',
  total_subjects: Number(row.total_subjects ?? 0),
  points: Number(row.points ?? calculatePointsFromSummary(row.grades_summary)),
  age: Number(row.age ?? 0),
  days_since_submission: Number(row.days_since_submission ?? 0),
  isDraft: row.status === 'draft',
  completionPercentage: calculateCompletionPercentage(row),
  lastUpdated: row.updated_at ?? row.created_at ?? ''
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

  useEffect(() => {
    filtersRef.current = filters || DEFAULT_APPLICATION_FILTERS
  }, [filters])

  const hydrateApplicationById = useCallback(async (id: string) => {
    if (!id) return null
    try {
      const result = await applicationService.getById(id)
      return result?.application ? mapApplicationRow(result.application) : null
    } catch (err) {
      console.error('Failed to hydrate application:', err)
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
      const params: Record<string, any> = {
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
    } catch (err: any) {
      setError(err.message || 'Failed to load applications.')
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
    if (totalCount !== 0 && applications.length >= totalCount) return
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

  const updateStatus = useCallback(async (applicationId: string, newStatus: string) => {
    const previousApplications = applications
    try {
      setApplications(prev => prev.map(app => 
        app.id === applicationId ? { ...app, status: newStatus } : app
      ))
      await applicationService.updateStatus(applicationId, newStatus)
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ['applications'] }),
        queryClient.invalidateQueries({ queryKey: ['application-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
      ])
      await loadPage(currentPage, 'refresh')
    } catch (error) {
      console.error('Failed to update status:', error)
      setApplications(previousApplications)
      throw error
    }
  }, [applications, currentPage, loadPage, queryClient])

  const updatePaymentStatus = useCallback(async (
    applicationId: string,
    newPaymentStatus: string,
    verificationNotes?: string
  ) => {
    const previousApplications = applications
    try {
      setApplications(prev => prev.map(app => 
        app.id === applicationId ? { ...app, payment_status: newPaymentStatus } : app
      ))
      await applicationService.updatePaymentStatus(applicationId, newPaymentStatus, verificationNotes)
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ['applications'] }),
        queryClient.invalidateQueries({ queryKey: ['application-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['payment-status'] })
      ])
      await loadPage(currentPage, 'refresh')
    } catch (error) {
      console.error('Failed to update payment status:', error)
      setApplications(previousApplications)
      throw error
    }
  }, [applications, currentPage, loadPage, queryClient])

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
