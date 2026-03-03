import { useQuery, useQueryClient } from '@tanstack/react-query'
import { applicationService } from '@/services/applications'
import { QUERY_CACHE_CONFIG } from '@/lib/queryCacheConfig'

const PAGE_SIZE = 15

interface ApplicationsDataParams {
  currentPage: number
  statusFilter: string
  searchTerm: string
  sortBy?: 'date' | 'name' | 'status'
  sortOrder?: 'asc' | 'desc'
  programFilter?: string
  institutionFilter?: string
  paymentStatusFilter?: string
  dateRange?: { start: string; end: string }
}

/**
 * Canonical hook for student-facing application data fetching.
 * Consolidates the former useApplicationsWithCounts and useApplicationsData hooks.
 *
 * Uses React Query with consistent ['applications', 'list', ...] cache keys
 * and centralized stale time from QUERY_CACHE_CONFIG.
 *
 * For admin-specific application data with pagination, filters, and
 * status/payment mutations, use the admin hook at src/hooks/admin/useApplicationsData.ts.
 */
export function useApplicationsData(params?: ApplicationsDataParams) {
  const queryClient = useQueryClient()

  // Normalize params with defaults
  const {
    currentPage = 1,
    statusFilter = 'all',
    searchTerm = '',
    sortBy = 'date',
    sortOrder = 'desc',
    programFilter = 'all',
    institutionFilter = 'all',
    paymentStatusFilter = 'all',
    dateRange = { start: '', end: '' },
  } = params ?? {}

  const filters = {
    page: currentPage,
    status: statusFilter,
    search: searchTerm,
    sortBy,
    sortOrder,
    program: programFilter,
    institution: institutionFilter,
    paymentStatus: paymentStatusFilter,
    startDate: dateRange.start,
    endDate: dateRange.end,
  }

  const applicationsQuery = useQuery({
    queryKey: ['applications', 'list', filters],
    queryFn: async () => {
      const result = await applicationService.list({
        page: currentPage,
        pageSize: PAGE_SIZE,
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: searchTerm || undefined,
        sortBy,
        sortOrder,
        program: programFilter === 'all' ? undefined : programFilter,
        institution: institutionFilter === 'all' ? undefined : institutionFilter,
        paymentStatus: paymentStatusFilter === 'all' ? undefined : paymentStatusFilter,
        startDate: dateRange.start || undefined,
        endDate: dateRange.end || undefined,
      })
      return result ?? { applications: [], totalCount: 0, stats: undefined }
    },
    ...QUERY_CACHE_CONFIG.critical,
  })

  /** Invalidate all application-related caches (call after create/update/submit) */
  const invalidateApplications = () => {
    return queryClient.invalidateQueries({ queryKey: ['applications'], refetchType: 'all' })
  }

  return {
    applications: applicationsQuery.data?.applications ?? [],
    totalCount: applicationsQuery.data?.totalCount ?? 0,
    stats: applicationsQuery.data?.stats,
    isLoading: applicationsQuery.isLoading,
    isStatsLoading: applicationsQuery.isLoading,
    error: applicationsQuery.error,
    refetch: applicationsQuery.refetch,
    refetchStats: applicationsQuery.refetch,
    invalidateApplications,
  }
}

/**
 * Simple hook to fetch all applications with counts (replaces useApplicationsWithCounts).
 * Uses the same ['applications', 'list'] cache key family for consistency.
 */
export function useApplicationsWithCounts() {
  return useQuery({
    queryKey: ['applications', 'list', { sortBy: 'date', sortOrder: 'desc' }],
    queryFn: async () => {
      const result = await applicationService.list({
        sortBy: 'date',
        sortOrder: 'desc',
      })
      return result?.applications ?? []
    },
    ...QUERY_CACHE_CONFIG.critical,
  })
}
