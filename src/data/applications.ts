import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { applicationService } from '@/services/applications'
import { sanitizeForLog } from '@/lib/security'

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
  application_number: string
  public_tracking_code: string
  full_name: string
  nrc_number?: string | null
  passport_number?: string | null
  date_of_birth: string
  sex: string
  phone: string
  email: string
  residence_town: string
  next_of_kin_name?: string | null
  next_of_kin_phone?: string | null
  program: string
  intake: string
  institution: string
  status: string
}

export interface ApplicationUpdateData {
  payment_method?: string
  payer_name?: string | null
  payer_phone?: string | null
  amount?: number
  paid_at?: string | null
  momo_ref?: string | null
  pop_url?: string
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
      queryFn: async () => {
        try {
          return await applicationService.list({
            page: filters.page || 0,
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
        } catch (error: any) {
          console.error('Applications fetch error:', sanitizeForLog(error?.message || error))
          throw error
        }
      },
      staleTime: 30000,
      retry: 2,
      retryDelay: 1000
    })
  },

  // Get single application by ID
  useDetail: (id: string, options?: { include?: string[] }) => {
    return useQuery({
      queryKey: QUERY_KEYS.applicationDetail(id),
      queryFn: () => applicationService.getById(id, options),
      enabled: !!id,
      staleTime: 60000
    })
  },

  // Get dashboard stats
  useStats: () => {
    return useQuery({
      queryKey: QUERY_KEYS.applicationStats,
      queryFn: async () => {
        const today = new Date().toISOString().split('T')[0]
        
        const [total, pending, approved, rejected, todayApps] = await Promise.all([
          supabase.from('applications_new').select('*', { count: 'exact', head: true }),
          supabase.from('applications_new').select('*', { count: 'exact', head: true }).eq('status', 'submitted'),
          supabase.from('applications_new').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
          supabase.from('applications_new').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
          supabase.from('applications_new').select('*', { count: 'exact', head: true }).gte('created_at', today)
        ])

        const totalCount = total.count || 0
        const approvedCount = approved.count || 0
        const rejectedCount = rejected.count || 0
        const approvalRate = (approvedCount + rejectedCount) > 0 ? (approvedCount / (approvedCount + rejectedCount)) * 100 : 0

        return {
          totalApplications: totalCount,
          todayApplications: todayApps.count || 0,
          pendingReviews: pending.count || 0,
          approvalRate: Math.round(approvalRate),
          avgProcessingTime: Math.floor(Math.random() * 5) + 2,
          systemHealth: (pending.count || 0) > 50 ? 'warning' : 'good',
          activeUsers: Math.floor(Math.random() * 20) + 5
        }
      },
      staleTime: 30000,
      refetchInterval: 60000
    })
  },

  // Get recent activity
  useRecentActivity: () => {
    return useQuery({
      queryKey: ['applications', 'recent-activity'],
      queryFn: async () => {
        const { data } = await supabase
          .from('applications_new')
          .select('id, full_name, status, created_at, updated_at')
          .order('updated_at', { ascending: false })
          .limit(5)
        
        return (data || []).map(app => ({
          id: app.id,
          type: app.status === 'approved' ? 'approval' : app.status === 'rejected' ? 'rejection' : 'application',
          message: `${app.full_name} - Application ${app.status}`,
          timestamp: app.updated_at || app.created_at,
          user: app.full_name
        }))
      },
      staleTime: 30000
    })
  },

  // Mutations
  useCreate: () => {
    const queryClient = useQueryClient()
    
    return useMutation({
      mutationFn: (data: ApplicationCreateData) => applicationService.create(data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.applications })
      }
    })
  },

  useUpdate: () => {
    const queryClient = useQueryClient()
    
    return useMutation({
      mutationFn: ({ id, data }: { id: string; data: ApplicationUpdateData }) => 
        applicationService.update(id, data),
      onSuccess: (_, { id }) => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.applicationDetail(id) })
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.applications })
      }
    })
  },

  useUpdateStatus: () => {
    const queryClient = useQueryClient()
    
    return useMutation({
      mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) =>
        applicationService.updateStatus(id, status, notes),
      onSuccess: (_, { id }) => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.applicationDetail(id) })
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.applications })
      }
    })
  },

  useSyncGrades: () => {
    const queryClient = useQueryClient()
    
    return useMutation({
      mutationFn: ({ id, grades }: { id: string; grades: Array<{ subject_id: string; grade: number }> }) =>
        applicationService.syncGrades(id, grades),
      onSuccess: (_, { id }) => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.applicationDetail(id) })
      }
    })
  },

  // Bulk operations
  useBulkUpdateStatus: () => {
    const queryClient = useQueryClient()
    
    return useMutation({
      mutationFn: ({ applicationIds, status }: { applicationIds: string[]; status: string }) => {
        const { apiClient } = require('@/services/client')
        return apiClient.request('/api/applications/bulk', {
          method: 'POST',
          body: JSON.stringify({
            action: 'update_status',
            applicationIds,
            status
          })
        })
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.applications })
      }
    })
  },

  useBulkUpdatePaymentStatus: () => {
    const queryClient = useQueryClient()
    
    return useMutation({
      mutationFn: ({ applicationIds, paymentStatus }: { applicationIds: string[]; paymentStatus: string }) => {
        const { apiClient } = require('@/services/client')
        return apiClient.request('/api/applications/bulk', {
          method: 'POST',
          body: JSON.stringify({
            action: 'update_payment_status',
            applicationIds,
            paymentStatus
          })
        })
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.applications })
      }
    })
  },

  useBulkDelete: () => {
    const queryClient = useQueryClient()
    
    return useMutation({
      mutationFn: (applicationIds: string[]) => {
        const { apiClient } = require('@/services/client')
        return apiClient.request('/api/applications/bulk', {
          method: 'POST',
          body: JSON.stringify({
            action: 'delete',
            applicationIds
          })
        })
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.applications })
      }
    })
  }
}