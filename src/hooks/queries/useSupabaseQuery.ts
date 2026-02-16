// @ts-nocheck
import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query'

/**
 * Helper for authenticated API calls using HTTP-only cookies
 */
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

/**
 * Optimized cache configuration based on data volatility patterns
 */
export const CACHE_CONFIG = {
  auth: { 
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000
  },
  applications: { 
    staleTime: 1 * 60 * 1000,
    gcTime: 5 * 60 * 1000
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
    staleTime: 2 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000
  },
  realtime: { 
    staleTime: 15 * 1000,
    gcTime: 60 * 1000
  }
} as const

export const useAuthSession = (options?: Partial<UseQueryOptions>) => {
  return useQuery({
    queryKey: ['auth', 'session'],
    queryFn: async () => {
      const response = await authFetch('/api/auth?action=session')
      if (!response.ok) {
        if (response.status === 401) return null
        throw new Error('Failed to get session')
      }
      const data = await response.json()
      return data.success ? data : null
    },
    ...CACHE_CONFIG.auth,
    ...options
  })
}

export const useAuthUser = (options?: Partial<UseQueryOptions>) => {
  return useQuery({
    queryKey: ['auth', 'user'],
    queryFn: async () => {
      const response = await authFetch('/api/auth?action=session')
      if (!response.ok) {
        if (response.status === 401) return null
        throw new Error('Failed to get user')
      }
      const data = await response.json()
      return data.success ? data.user : null
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
      options?.onError?.(err, variables, context)
    },
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey })
      options?.onSuccess?.(data, variables, context)
    },
    ...options
  })
}
