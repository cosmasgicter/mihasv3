/**
 * Query cache configuration and auth query hooks.
 *
 * All queries go through the canonical ApiClient from services/client.ts.
 */
import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query'
import { apiClient } from '@/services/client'

import { QUERY_CACHE_CONFIG } from '@/lib/queryCacheConfig'

/**
 * Optimized cache configuration based on data volatility patterns
 * Uses centralized config profiles from queryCacheConfig.ts
 */
export const CACHE_CONFIG = {
  auth: { 
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000
  },
  applications: { 
    ...QUERY_CACHE_CONFIG.critical,
  },
  users: { 
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000
  },
  analytics: { 
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000
  },
  static: { 
    ...QUERY_CACHE_CONFIG.static,
    gcTime: 24 * 60 * 60 * 1000,
  },
  realtime: { 
    ...QUERY_CACHE_CONFIG.polling,
    gcTime: 60 * 1000
  }
} as const


export const useAuthSession = (options?: Partial<UseQueryOptions>) => {
  return useQuery({
    queryKey: ['auth', 'session'],
    queryFn: async () => {
      try {
        return await apiClient.request('/api/auth?action=session')
      } catch {
        return null
      }
    },
    ...CACHE_CONFIG.auth,
    ...options
  })
}

export const useAuthUser = (options?: Partial<UseQueryOptions>) => {
  return useQuery({
    queryKey: ['auth', 'user'],
    queryFn: async () => {
      try {
        const data = await apiClient.request<{ user?: any }>('/api/auth?action=session')
        return (data as any)?.user ?? null
      } catch {
        return null
      }
    },
    ...CACHE_CONFIG.auth,
    ...options
  })
}

/**
 * Helper to create optimistic mutations with type safety
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
      await queryClient.cancelQueries({ queryKey })
      const previousData = queryClient.getQueryData<TData>(queryKey)
      queryClient.setQueryData<TData>(queryKey, (old) => 
        optimisticUpdater(old, variables)
      )
      return { previousData }
    },
    onError: (err, variables, context: any) => {
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKey, context.previousData)
      }
      options?.onError?.(err, variables, context, {} as any)
    },
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey })
      options?.onSuccess?.(data, variables, context, {} as any)
    },
    ...options
  })
}
