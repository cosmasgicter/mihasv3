import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { applicationService } from '@/services/applications'
import { ApplicationFilters, DEFAULT_APPLICATION_FILTERS } from './useApplicationFilters'
import {
  useAdminRealtimeMetrics,
  doesApplicationMatchFilters
} from './useAdminRealtimeMetrics'
import type { AdminApplicationChange } from './useAdminRealtimeMetrics'

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
  average_grade: number
  age: number
  days_since_submission: number
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

export function useApplicationsData(filters: ApplicationFilters = DEFAULT_APPLICATION_FILTERS) {
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
        if (error) {
          throw error
        }
        return data
      })
      .catch(error => {
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

      const { data, error: queryError, count } = await query
        .order('created_at', { ascending: false })
        .range(Math.max(from, 0), Math.max(to, Math.max(from, 0)))

      if (queryError) throw queryError

      setTotalCount(count ?? 0)

      if (isLoadMore) {
        setApplications(prev => {
          const existingIds = new Set(prev.map(item => item.id))
          const newRecords = (data || []).filter(item => !existingIds.has(item.id))
          return [...prev, ...newRecords]
        })
        setCurrentPage(safePage)
      } else if (isRefresh) {
        setApplications(data || [])
      } else {
        setApplications(data || [])
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

  const applyRealtimeChange = useCallback(async (change: AdminApplicationChange) => {
    const activeFilters = filtersRef.current || DEFAULT_APPLICATION_FILTERS
    const matchesNew = change.newRow ? doesApplicationMatchFilters(change.newRow, activeFilters) : false
    const matchesOld = change.oldRow ? doesApplicationMatchFilters(change.oldRow, activeFilters) : false

    if (change.type === 'insert') {
      if (!matchesNew) {
        return
      }

      try {
        const detailed = await hydrateApplicationById(change.targetId)
        if (!detailed) return

        let existed = false
        setApplications(prev => {
          existed = prev.some(item => item.id === change.targetId)
          const withoutTarget = prev.filter(item => item.id !== change.targetId)
          const maxItems = Math.max(pageSize * currentPage, pageSize)
          return [detailed, ...withoutTarget].slice(0, maxItems)
        })
        if (!existed) {
          setTotalCount(prev => prev + 1)
        }
      } catch (err) {
        console.warn('Failed to hydrate inserted application', err)
      }
      return
    }

    if (change.type === 'update') {
      if (matchesNew) {
        try {
          const detailed = await hydrateApplicationById(change.targetId)
          if (detailed) {
            setApplications(prev => {
              const index = prev.findIndex(item => item.id === change.targetId)
              if (index === -1) {
                if (currentPage > 1) {
                  return prev
                }
                const maxItems = Math.max(pageSize * currentPage, pageSize)
                return [detailed, ...prev].slice(0, maxItems)
              }

              const next = [...prev]
              next[index] = { ...next[index], ...detailed }
              return next
            })
          }
        } catch (err) {
          console.warn('Failed to refresh updated application', err)
        }
      }

      if (!matchesOld && matchesNew) {
        setTotalCount(prev => prev + 1)
      }

      if (matchesOld && !matchesNew) {
        let removed = false
        setApplications(prev => {
          const next = prev.filter(item => {
            if (item.id === change.targetId) {
              removed = true
              return false
            }
            return true
          })
          return next
        })
        if (removed) {
          setTotalCount(prev => Math.max(prev - 1, 0))
        }
      }
      return
    }

    if (change.type === 'delete') {
      if (matchesOld) {
        let removed = false
        setApplications(prev => {
          const next = prev.filter(item => {
            if (item.id === change.targetId) {
              removed = true
              return false
            }
            return true
          })
          return next
        })
        if (removed) {
          setTotalCount(prev => Math.max(prev - 1, 0))
        }
      }
    }
  }, [currentPage, hydrateApplicationById, pageSize])

  useAdminRealtimeMetrics({
    onChange: change => {
      void applyRealtimeChange(change)
    }
  })

  const pagination: PaginationState = useMemo(() => ({
    pageSize,
    currentPage,
    totalCount,
    loadedCount: applications.length,
    hasMore: applications.length < totalCount
  }), [applications.length, currentPage, pageSize, totalCount])

  const updateStatus = useCallback(async (applicationId: string, newStatus: string) => {
    try {
      await applicationService.updateStatus(applicationId, newStatus)
      await refreshCurrentPage()
    } catch (error) {
      console.error('Failed to update status:', error)
      throw error
    }
  }, [refreshCurrentPage])

  const updatePaymentStatus = useCallback(async (
    applicationId: string,
    newPaymentStatus: string,
    verificationNotes?: string
  ) => {
    try {
      await applicationService.updatePaymentStatus(applicationId, newPaymentStatus, verificationNotes)
      await refreshCurrentPage()
    } catch (error) {
      console.error('Failed to update payment status:', error)
      throw error
    }
  }, [refreshCurrentPage])

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
