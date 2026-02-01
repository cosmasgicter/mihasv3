// @ts-nocheck
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useQueryClient, QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { applicationService } from '@/services/applications'
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
  // Draft-specific fields
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

const sanitizeSearchTerm = (value: string) => {
  return value
    .trim()
    .replace(/[%_]/g, match => `\\${match}`)
    .replace(/,/g, '\\,')
}

// Calculate completion percentage for draft applications
const calculateCompletionPercentage = (application: any): number => {
  if (application.status !== 'draft') return 100
  
  const requiredFields = [
    'full_name',
    'date_of_birth',
    'sex',
    'phone',
    'email',
    'residence_town',
    'program',
    'intake',
    'institution',
    'result_slip_url',
    'payment_method',
    'amount'
  ]
  
  const completedFields = requiredFields.filter(field => {
    const value = application[field]
    return value !== null && value !== undefined && value !== ''
  })
  
  return Math.round((completedFields.length / requiredFields.length) * 100)
}

const mapSupabaseApplication = (row: any): ApplicationSummary => ({
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
  // Draft-specific fields
  isDraft: row.status === 'draft',
  completionPercentage: calculateCompletionPercentage(row),
  lastUpdated: row.updated_at ?? row.created_at ?? ''
})

export function useApplicationsData(filters: ApplicationFilters = DEFAULT_APPLICATION_FILTERS) {
  // Call useQueryClient at the top level of the hook (not inside callbacks)
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
  const hydrationPromisesRef = useRef<Map<string, Promise<any>>>(new Map())

  useEffect(() => {
    filtersRef.current = filters || DEFAULT_APPLICATION_FILTERS
  }, [filters])

  const hydrateApplicationById = useCallback(async (id: string) => {
    if (!id) return null

    if (hydrationPromisesRef.current.has(id)) {
      return hydrationPromisesRef.current.get(id)
    }

    const hydrationPromise = supabase
      .from('admin_application_detailed')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        hydrationPromisesRef.current.delete(id)
        if (error) throw error
        return data ? mapSupabaseApplication(data) : null
      }, error => {
        hydrationPromisesRef.current.delete(id)
        throw error
      })

    hydrationPromisesRef.current.set(id, hydrationPromise)
    return hydrationPromise
  }, [])

  const loadPage = useCallback(async (page: number, mode: LoadMode) => {
    const safePage = Math.max(page, 1)
    const activeFilters = filters || DEFAULT_APPLICATION_FILTERS

    const isInitial = mode === 'initial'
    const isLoadMore = mode === 'loadMore'
    const isRefresh = mode === 'refresh'

    const from = isRefresh ? 0 : (safePage - 1) * pageSize
    const to = isRefresh ? (safePage * pageSize) - 1 : from + pageSize - 1

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

      let query = supabase
        .from('admin_application_detailed')
        .select('*', { count: 'exact' })

      if (activeFilters.searchTerm) {
        const searchValue = sanitizeSearchTerm(activeFilters.searchTerm)
        const pattern = `%${searchValue}%`
        query = query.or(
          `full_name.ilike.${pattern},email.ilike.${pattern},application_number.ilike.${pattern}`
        )
      }

      if (activeFilters.statusFilter) {
        query = query.eq('status', activeFilters.statusFilter)
      }

      if (activeFilters.paymentFilter) {
        query = query.eq('payment_status', activeFilters.paymentFilter)
      }

      if (activeFilters.programFilter) {
        query = query.eq('program', activeFilters.programFilter)
      }

      if (activeFilters.institutionFilter) {
        query = query.eq('institution', activeFilters.institutionFilter)
      }

      // Apply draft filter
      if (activeFilters.draftFilter === 'drafts') {
        query = query.eq('status', 'draft')
      } else if (activeFilters.draftFilter === 'completed') {
        query = query.neq('status', 'draft')
      }
      // 'all' shows both drafts and completed (no additional filter needed)

      const { data, error: queryError, count } = await query
        .order('created_at', { ascending: false })
        .range(Math.max(from, 0), Math.max(to, Math.max(from, 0)))

      if (queryError) throw queryError

      const mapped = (data || []).map(mapSupabaseApplication)
      setTotalCount(count ?? 0)

      if (isLoadMore) {
        setApplications(prev => {
          const existingIds = new Set(prev.map(item => item.id))
          const newRecords = mapped.filter(item => !existingIds.has(item.id))
          return [...prev, ...newRecords]
        })
        setCurrentPage(safePage)
      } else if (isRefresh) {
        setApplications(mapped)
      } else {
        setApplications(mapped)
        setCurrentPage(safePage)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load applications.')

      if (mode === 'loadMore') {
        setCurrentPage(prev => Math.max(prev - 1, 1))
      }
    } finally {
      if (isInitial) {
        setIsInitialLoading(false)
      }
      if (isLoadMore) {
        setIsLoadingMore(false)
      }
      if (isRefresh) {
        setIsRefreshing(false)
      }
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

    const totalLoaded = applications.length
    if (totalCount !== 0 && totalLoaded >= totalCount) return

    const nextPage = currentPage + 1
    await loadPage(nextPage, 'loadMore')
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
    // Store previous state for rollback
    const previousApplications = applications
    
    try {
      // Optimistic update - update local state immediately
      setApplications(prev => prev.map(app => 
        app.id === applicationId ? { ...app, status: newStatus } : app
      ))
      
      // Make the API call
      await applicationService.updateStatus(applicationId, newStatus)
      
      // Invalidate queries to refresh data from server
      // Using Promise.allSettled to ensure all invalidations are attempted
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ['applications'] }),
        queryClient.invalidateQueries({ queryKey: ['application-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
      ])
      
      // Refresh current page to get latest data
      await loadPage(currentPage, 'refresh')
    } catch (error) {
      console.error('Failed to update status:', error)
      // Revert optimistic update on error
      setApplications(previousApplications)
      throw error
    }
  }, [applications, currentPage, loadPage, queryClient])

  const updatePaymentStatus = useCallback(async (
    applicationId: string,
    newPaymentStatus: string,
    verificationNotes?: string
  ) => {
    // Store previous state for rollback
    const previousApplications = applications
    
    try {
      // Optimistic update - update local state immediately
      setApplications(prev => prev.map(app => 
        app.id === applicationId ? { ...app, payment_status: newPaymentStatus } : app
      ))
      
      // Make the API call
      await applicationService.updatePaymentStatus(applicationId, newPaymentStatus, verificationNotes)
      
      // Invalidate queries to refresh data from server
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ['applications'] }),
        queryClient.invalidateQueries({ queryKey: ['application-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['payment-status'] })
      ])
      
      // Refresh current page to get latest data
      await loadPage(currentPage, 'refresh')
    } catch (error) {
      console.error('Failed to update payment status:', error)
      // Revert optimistic update on error
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
