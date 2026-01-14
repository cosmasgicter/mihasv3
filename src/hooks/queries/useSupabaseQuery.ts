import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Optimized cache configuration based on data volatility patterns
 * 
 * Data Volatility Categories:
 * - High volatility (realtime): Application status changes, notifications
 * - Medium volatility (applications): User applications, drafts
 * - Low volatility (users, auth): User profiles, session data
 * - Very low volatility (analytics, static): Reports, catalog data
 * 
 * Performance Targets:
 * - Reduce unnecessary network requests by 60%
 * - Improve perceived performance with optimistic updates
 * - Balance freshness with performance
 */
export const CACHE_CONFIG = {
  // Authentication data - Low volatility
  // Sessions rarely change except on login/logout
  // Increased staleTime from 5min to 10min to reduce auth checks
  auth: { 
    staleTime: 10 * 60 * 1000,  // 10 minutes (was 5 min)
    gcTime: 30 * 60 * 1000       // 30 minutes (was 10 min)
  },
  
  // Application data - Medium-high volatility
  // Applications change frequently during submission/review
  // Reduced staleTime from 2min to 1min for fresher data
  applications: { 
    staleTime: 1 * 60 * 1000,    // 1 minute (was 2 min)
    gcTime: 5 * 60 * 1000        // 5 minutes (unchanged)
  },
  
  // User profile data - Low volatility
  // User profiles change infrequently
  // Increased staleTime from 5min to 15min
  users: { 
    staleTime: 15 * 60 * 1000,   // 15 minutes (was 5 min)
    gcTime: 30 * 60 * 1000       // 30 minutes (was 10 min)
  },
  
  // Analytics data - Very low volatility
  // Reports and analytics are computed periodically
  // Increased staleTime from 10min to 30min
  analytics: { 
    staleTime: 30 * 60 * 1000,   // 30 minutes (was 10 min)
    gcTime: 60 * 60 * 1000       // 60 minutes (was 15 min)
  },
  
  // Static catalog data - Very low volatility
  // Programs, institutions, intakes change rarely
  // Increased staleTime from 1hr to 2hr
  static: { 
    staleTime: 2 * 60 * 60 * 1000,      // 2 hours (was 1 hr)
    gcTime: 24 * 60 * 60 * 1000         // 24 hours (unchanged)
  },
  
  // Real-time data - High volatility
  // Notifications, live status updates
  // Reduced staleTime from 30s to 15s for fresher real-time data
  realtime: { 
    staleTime: 15 * 1000,        // 15 seconds (was 30 sec)
    gcTime: 60 * 1000            // 60 seconds (unchanged)
  }
} as const

export const useAuthSession = (options?: Partial<UseQueryOptions>) => {
  return useQuery({
    queryKey: ['auth', 'session'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error
      return data.session
    },
    ...CACHE_CONFIG.auth,
    ...options
  })
}

export const useAuthUser = (options?: Partial<UseQueryOptions>) => {
  return useQuery({
    queryKey: ['auth', 'user'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser()
      if (error) throw error
      return data.user
    },
    ...CACHE_CONFIG.auth,
    ...options
  })
}

export const useTableQuery = <T = any>(
  table: string,
  queryKey: string[],
  queryBuilder?: (query: any) => any,
  options?: Partial<UseQueryOptions<T>>
) => {
  return useQuery<T>({
    queryKey: ['table', table, ...queryKey],
    queryFn: async () => {
      let query = supabase.from(table).select('*')
      if (queryBuilder) query = queryBuilder(query)
      const { data, error } = await query
      if (error) throw error
      return data
    },
    ...CACHE_CONFIG.applications,
    ...options
  })
}

export const useRpcQuery = <T = any>(
  rpcName: string,
  params?: Record<string, any>,
  options?: Partial<UseQueryOptions<T>>
) => {
  return useQuery<T>({
    queryKey: ['rpc', rpcName, params],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(rpcName, params)
      if (error) throw error
      return data
    },
    ...CACHE_CONFIG.analytics,
    ...options
  })
}

export const useTableMutation = <T = any>(
  table: string,
  operation: 'insert' | 'update' | 'delete' | 'upsert',
  invalidateKeys?: string[][],
  options?: Partial<UseMutationOptions<T, Error, any>>
) => {
  const queryClient = useQueryClient()

  return useMutation<T, Error, any>({
    mutationFn: async (payload) => {
      let query: any
      
      switch (operation) {
        case 'insert':
          query = supabase.from(table).insert(payload.data)
          break
        case 'update':
          query = supabase.from(table).update(payload.data).eq('id', payload.id)
          break
        case 'delete':
          query = supabase.from(table).delete().eq('id', payload.id)
          break
        case 'upsert':
          query = supabase.from(table).upsert(payload.data)
          break
      }
      
      const { data, error } = await query.select()
      if (error) throw error
      return data
    },
    // Optimistic updates for better perceived performance
    onMutate: async (payload) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['table', table] })
      
      // Snapshot previous value for rollback
      const previousData = queryClient.getQueryData(['table', table])
      
      // Optimistically update cache based on operation
      if (operation === 'update' && payload.id) {
        queryClient.setQueryData(['table', table], (old: any) => {
          if (!old) return old
          if (Array.isArray(old)) {
            return old.map(item => 
              item.id === payload.id ? { ...item, ...payload.data } : item
            )
          }
          return old
        })
      } else if (operation === 'insert') {
        queryClient.setQueryData(['table', table], (old: any) => {
          if (!old) return [payload.data]
          if (Array.isArray(old)) {
            return [...old, { ...payload.data, id: 'temp-' + Date.now() }]
          }
          return old
        })
      } else if (operation === 'delete' && payload.id) {
        queryClient.setQueryData(['table', table], (old: any) => {
          if (!old) return old
          if (Array.isArray(old)) {
            return old.filter(item => item.id !== payload.id)
          }
          return old
        })
      }
      
      // Return context for rollback
      return { previousData }
    },
    // Rollback on error
    onError: (err, payload, context: any) => {
      if (context?.previousData) {
        queryClient.setQueryData(['table', table], context.previousData)
      }
      // Call user's onError if provided
      options?.onError?.(err, payload, context)
    },
    onSuccess: (data, variables, context) => {
      // Invalidate related queries to refetch fresh data
      if (invalidateKeys) {
        invalidateKeys.forEach(key => {
          queryClient.invalidateQueries({ queryKey: key })
        })
      }
      queryClient.invalidateQueries({ queryKey: ['table', table] })
      
      // Call user's onSuccess if provided
      options?.onSuccess?.(data, variables, context)
    },
    ...options
  })
}

/**
 * Helper to create optimistic mutations with type safety
 * 
 * @example
 * const updateApplication = useOptimisticMutation(
 *   ['applications', applicationId],
 *   async (updates) => applicationService.update(applicationId, updates),
 *   (oldData, updates) => ({ ...oldData, ...updates })
 * )
 */
export const useOptimisticMutation = <TData = any, TVariables = any>(
  queryKey: string[],
  mutationFn: (variables: TVariables) => Promise<TData>,
  optimisticUpdater: (oldData: TData | undefined, variables: TVariables) => TData,
  options?: Partial<UseMutationOptions<TData, Error, TVariables>>
) => {
  const queryClient = useQueryClient()

  return useMutation<TData, Error, TVariables>({
    mutationFn,
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey })
      
      // Snapshot previous value
      const previousData = queryClient.getQueryData<TData>(queryKey)
      
      // Optimistically update
      queryClient.setQueryData<TData>(queryKey, (old) => 
        optimisticUpdater(old, variables)
      )
      
      // Return context for rollback
      return { previousData }
    },
    onError: (err, variables, context: any) => {
      // Rollback on error
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKey, context.previousData)
      }
      options?.onError?.(err, variables, context)
    },
    onSuccess: (data, variables, context) => {
      // Invalidate to refetch fresh data
      queryClient.invalidateQueries({ queryKey })
      options?.onSuccess?.(data, variables, context)
    },
    ...options
  })
}
