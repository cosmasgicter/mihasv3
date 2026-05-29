import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/services/client'
import { applicationService } from '@/services/applications'
import { adminDashboardService } from '@/services/admin/dashboard'
import { sanitizeForLog, sanitizeFilePath } from '@/lib/security'
import type { Application } from '@/types/database'
import { logger } from '@/lib/logger'
import { toError } from '@/lib/toError'

/** Strip null values from an object so it's compatible with Partial<Application> */
function stripNulls<T extends object>(obj: T): Partial<Application> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null) result[key] = value
  }
  return result as Partial<Application>
}

// Types
export interface ApplicationFilters {
  page?: number
  pageSize?: number
  status?: string
  search?: string
  sortBy?: 'date' | 'name' | 'status'
  sortOrder?: 'asc' | 'desc'
  program?: string
  institution?: string
  paymentStatus?: string
  startDate?: string
  endDate?: string
  mine?: boolean
}

export interface ApplicationCreateData {
  full_name: string
  nrc_number?: string | null
  passport_number?: string | null
  date_of_birth: string
  sex: string
  phone: string
  email: string
  residence_town: string
  country?: string
  nationality?: string
  next_of_kin_name?: string | null
  next_of_kin_phone?: string | null
  program: string
  intake: string
  institution: string
}

export interface ApplicationUpdateData {
  full_name?: string
  nrc_number?: string | null
  passport_number?: string | null
  date_of_birth?: string
  sex?: string
  phone?: string
  email?: string
  residence_town?: string
  country?: string
  nationality?: string
  next_of_kin_name?: string | null
  next_of_kin_phone?: string | null
  program?: string
  intake?: string
  institution?: string
  result_slip_url?: string
  extra_kyc_url?: string | null
  status?: string
  submitted_at?: string
}

// Query Keys
const QUERY_KEYS = {
  applications: ['applications'] as const,
  applicationsList: (filters: ApplicationFilters) => [...QUERY_KEYS.applications, 'list', filters] as const,
  applicationDetail: (id: string) => [...QUERY_KEYS.applications, 'detail', id] as const,
  applicationStats: ['applications', 'stats'] as const,
}

// Data Access Functions
export const applicationsData = {
  // List applications with filters
  useList: (filters: ApplicationFilters = {}) => {
    return useQuery({
      queryKey: QUERY_KEYS.applicationsList(filters),
      queryFn: async ({ signal }) => {
        try {
          return await applicationService.list({
            page: Math.max(filters.page || 1, 1),
            pageSize: filters.pageSize || 15,
            status: filters.status === 'all' ? undefined : filters.status,
            search: filters.search,
            sortBy: filters.sortBy || 'date',
            sortOrder: filters.sortOrder || 'desc',
            program: filters.program === 'all' ? undefined : filters.program,
            institution: filters.institution === 'all' ? undefined : filters.institution,
            paymentStatus: filters.paymentStatus === 'all' ? undefined : filters.paymentStatus,
            startDate: filters.startDate,
            endDate: filters.endDate,
            mine: filters.mine,
            includeStats: true
          })
        } catch (error: unknown) {
          if (signal?.aborted) {
            return { applications: [], totalCount: 0, page: 1, pageSize: 15 }
          }
          const message = toError(error).message
          logger.error('Applications fetch error:', sanitizeForLog(message))
          throw error
        }
      },
      staleTime: 60_000, // 60s — avoids redundant refetches on rapid mount/focus
      gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes for background refetch
      retry: 2,
      retryDelay: 1000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    })
  },

  // Get single application by ID
  useDetail: (id: string, options?: { include?: string[] }) => {
    return useQuery({
      queryKey: QUERY_KEYS.applicationDetail(id),
      queryFn: () => applicationService.getById(id, options),
      enabled: !!id,
      staleTime: 60_000, // 60s — consistent with list query
      gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    })
  },

  // Get dashboard stats
  useStats: () => {
    return useQuery({
      queryKey: QUERY_KEYS.applicationStats,
      queryFn: async () => {
        try {
          const overview = await adminDashboardService.getOverview()
          const stats = overview.stats
          const totalReviewed = (stats.approvedApplications ?? 0) + (stats.rejectedApplications ?? 0)
          const approvalRate = totalReviewed > 0
            ? Number((((stats.approvedApplications ?? 0) / totalReviewed) * 100).toFixed(1))
            : 0

          return {
            totalApplications: stats?.totalApplications ?? 0,
            todayApplications: stats?.todayApplications ?? 0,
            pendingReviews: stats?.pendingApplications ?? 0,
            approvalRate,
            avgProcessingTime: stats?.avgProcessingTime ?? 0,
            systemHealth: stats?.systemHealth ?? 'good',
            activeUsers: stats?.activeUsers ?? 0
          }
        } catch (error: unknown) {
          const message = toError(error).message
          logger.error('Stats fetch error:', sanitizeForLog(message))
          throw error
        }
      },
      staleTime: 60_000,
      gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
      refetchInterval: 60000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      retry: (failureCount: number, error: unknown) => {
        const status = (error as { status?: number })?.status
        if (status === 429) return false
        return failureCount < 2
      },
    })
  },

  // Get recent activity
  useRecentActivity: () => {
    return useQuery({
      queryKey: ['applications', 'recent-activity'],
      queryFn: async () => {
        try {
          const result = await applicationService.list({
            sortBy: 'date',
            sortOrder: 'desc',
            pageSize: 5
          })

          return (result?.applications || []).map(app => ({
            id: app.id,
            type: app.status === 'approved' ? 'approval' : app.status === 'rejected' ? 'rejection' : 'application',
            message: `${app.full_name} - Application ${app.status}`,
            timestamp: app.updated_at || app.created_at,
            user: app.full_name
          }))
        } catch (error: unknown) {
          const message = toError(error).message
          logger.error('Recent activity fetch error:', sanitizeForLog(message))
          throw error
        }
      },
      staleTime: 60_000,
      gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
      refetchOnWindowFocus: false,
      refetchOnMount: false
    })
  },

  // Mutations
  useCreate: () => {
    const queryClient = useQueryClient()
    
    return useMutation({
      mutationFn: (data: ApplicationCreateData) => applicationService.create(stripNulls(data)),
      onSuccess: async () => {
        // Force immediate invalidation and refetch of all related queries
        await queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.applications,
          refetchType: 'all' // Refetch all matching queries
        })
        await queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.applicationStats,
          refetchType: 'all'
        })
        await queryClient.invalidateQueries({ 
          queryKey: ['payment-status'],
          refetchType: 'all'
        })
        await queryClient.invalidateQueries({ 
          queryKey: ['student-dashboard'],
          refetchType: 'all'
        })
        // Dispatch custom event for components not using React Query
        window.dispatchEvent(new CustomEvent('applicationCreated'))
      }
    })
  },

  useUpdate: () => {
    const queryClient = useQueryClient()
    
    return useMutation({
      mutationFn: ({ id, data }: { id: string; data: ApplicationUpdateData }) => 
        applicationService.update(id, stripNulls(data)),
      onSuccess: async (_, { id }) => {
        await queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.applicationDetail(id),
          refetchType: 'all'
        })
        await queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.applications,
          refetchType: 'all'
        })
        await queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.applicationStats,
          refetchType: 'all'
        })
        await queryClient.invalidateQueries({ 
          queryKey: ['payment-status'],
          refetchType: 'all'
        })
        // Dispatch custom event for dashboard refresh
        window.dispatchEvent(new CustomEvent('applicationUpdated'))
      }
    })
  },

  useSubmit: () => {
    const queryClient = useQueryClient()

    return useMutation({
      mutationFn: ({ id, headers }: { id: string; headers?: Record<string, string> }) =>
        applicationService.submit(id, headers ? { headers } : undefined),
      onSuccess: async (_, { id }) => {
        await queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.applicationDetail(id),
          refetchType: 'all'
        })
        await queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.applications,
          refetchType: 'all'
        })
        await queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.applicationStats,
          refetchType: 'all'
        })
        await queryClient.invalidateQueries({
          queryKey: ['payment-status'],
          refetchType: 'all'
        })
        await queryClient.invalidateQueries({
          queryKey: ['student-dashboard'],
          refetchType: 'all'
        })
        window.dispatchEvent(new CustomEvent('applicationSubmitted'))
      }
    })
  },

  useUpdateStatus: () => {
    const queryClient = useQueryClient()
    
    return useMutation({
      mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) =>
        applicationService.updateStatus(id, status, notes),
      onSuccess: async (_, { id }) => {
        await queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.applicationDetail(id),
          refetchType: 'all'
        })
        await queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.applications,
          refetchType: 'all'
        })
        await queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.applicationStats,
          refetchType: 'all'
        })
        await queryClient.invalidateQueries({ 
          queryKey: ['admin-dashboard'],
          refetchType: 'all'
        })
        // Dispatch custom event for status change
        window.dispatchEvent(new CustomEvent('applicationStatusChanged'))
      }
    })
  },

  useSyncGrades: () => {
    const queryClient = useQueryClient()
    
    return useMutation({
      mutationFn: ({ id, grades }: { id: string; grades: Array<{ subject_id: string; grade: number }> }) =>
        applicationService.syncGrades(id, grades),
      onSuccess: async (_, { id }) => {
        await queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.applicationDetail(id),
          refetchType: 'all'
        })
        await queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.applications,
          refetchType: 'all'
        })
      }
    })
  },

  useDelete: () => {
    const queryClient = useQueryClient()
    
    return useMutation({
      mutationFn: (id: string) => applicationService.delete(id),
      onSuccess: async (_, id) => {
        await queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.applications,
          refetchType: 'all'
        })
        await queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.applicationStats,
          refetchType: 'all'
        })
        queryClient.removeQueries({ queryKey: QUERY_KEYS.applicationDetail(id) })
        // Dispatch custom event for deletion
        window.dispatchEvent(new CustomEvent('applicationDeleted'))
      }
    })
  },

  // Bulk operations
  useBulkUpdateStatus: () => {
    const queryClient = useQueryClient()
    
    return useMutation({
      mutationFn: async ({ applicationIds, status }: { applicationIds: string[]; status: string }) => {
        const result = await applicationService.bulkStatus({
          applicationIds,
          status,
        })
        const updated = typeof (result as { updated?: unknown })?.updated === 'number'
          ? (result as { updated: number }).updated
          : applicationIds.length
        return { successCount: updated, updated }
      },
      onSuccess: async () => {
        await queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.applications,
          refetchType: 'all'
        })
        await queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.applicationStats,
          refetchType: 'all'
        })
        await queryClient.invalidateQueries({ 
          queryKey: ['admin-dashboard'],
          refetchType: 'all'
        })
        window.dispatchEvent(new CustomEvent('applicationStatusChanged'))
      }
    })
  },

  useBulkUpdatePaymentStatus: () => {
    const queryClient = useQueryClient()
    
    return useMutation({
      mutationFn: async (_payload: { applicationIds: string[]; paymentStatus: string }) => {
        throw new Error('Bulk payment status updates must use the payment review flow.')
      },
      onSuccess: async () => {
        await queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.applications,
          refetchType: 'all'
        })
        await queryClient.invalidateQueries({ 
          queryKey: ['payment-status'],
          refetchType: 'all'
        })
        await queryClient.invalidateQueries({ 
          queryKey: ['payment-stats'],
          refetchType: 'all'
        })
        window.dispatchEvent(new CustomEvent('paymentStatusChanged'))
      }
    })
  },

  useBulkDelete: () => {
    const queryClient = useQueryClient()
    
    return useMutation({
      mutationFn: async (applicationIds: string[]) => {
        const results = await Promise.allSettled(applicationIds.map(id => applicationService.delete(id)))
        const errors = results
          .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
          .map(result => result.reason instanceof Error ? result.reason.message : 'Delete failed')

        if (errors.length > 0) {
          return {
            successCount: applicationIds.length - errors.length,
            errorCount: errors.length,
            errors,
          }
        }

        return {
          successCount: applicationIds.length,
          errorCount: 0,
          errors: [],
        }
      },
      onSuccess: async () => {
        await queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.applications,
          refetchType: 'all'
        })
        await queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.applicationStats,
          refetchType: 'all'
        })
        window.dispatchEvent(new CustomEvent('applicationDeleted'))
      }
    })
  }
}
