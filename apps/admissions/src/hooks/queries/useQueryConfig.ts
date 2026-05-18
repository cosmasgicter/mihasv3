/**
 * Query cache configuration and optimistic mutation helpers.
 */
import { useMutation, useQueryClient, UseMutationOptions } from '@tanstack/react-query'

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




/**
 * Helper to create optimistic mutations with type safety
 */
export const useOptimisticMutation = <TData = unknown, TVariables = unknown>(
  queryKey: string[],
  mutationFn: (variables: TVariables) => Promise<TData>,
  optimisticUpdater: (oldData: TData | undefined, variables: TVariables) => TData,
  options?: Partial<UseMutationOptions<TData, Error, TVariables, { previousData?: TData }>>
) => {
  const queryClient = useQueryClient()

  return useMutation<TData, Error, TVariables, { previousData?: TData }>({
    mutationFn,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey })
      const previousData = queryClient.getQueryData<TData>(queryKey)
      queryClient.setQueryData<TData>(queryKey, (old) => 
        optimisticUpdater(old, variables)
      )
      return { previousData }
    },
    onError: (err, variables, onMutateResult, context) => {
      if (onMutateResult?.previousData !== undefined) {
        queryClient.setQueryData(queryKey, onMutateResult.previousData)
      }
      options?.onError?.(err, variables, onMutateResult, context)
    },
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey })
      options?.onSuccess?.(data, variables, onMutateResult, context)
    },
    ...options
  })
}
