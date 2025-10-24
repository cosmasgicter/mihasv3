import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const CACHE_CONFIG = {
  auth: { staleTime: 5 * 60 * 1000, gcTime: 10 * 60 * 1000 },
  applications: { staleTime: 2 * 60 * 1000, gcTime: 5 * 60 * 1000 },
  users: { staleTime: 5 * 60 * 1000, gcTime: 10 * 60 * 1000 },
  analytics: { staleTime: 10 * 60 * 1000, gcTime: 15 * 60 * 1000 },
  static: { staleTime: 60 * 60 * 1000, gcTime: 24 * 60 * 60 * 1000 },
  realtime: { staleTime: 30 * 1000, gcTime: 60 * 1000 }
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
    onSuccess: () => {
      if (invalidateKeys) {
        invalidateKeys.forEach(key => {
          queryClient.invalidateQueries({ queryKey: key })
        })
      }
      queryClient.invalidateQueries({ queryKey: ['table', table] })
    },
    ...options
  })
}
