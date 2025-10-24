import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { CACHE_CONFIG } from './useSupabaseQuery'

export const useStorageUpload = (bucket: string) => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ path, file }: { path: string; file: File }) => {
      const { data, error } = await supabase.storage.from(bucket).upload(path, file)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage', bucket] })
    }
  })
}

export const useStorageDownload = (bucket: string, path: string, enabled = true) => {
  return useQuery({
    queryKey: ['storage', bucket, path],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(bucket).download(path)
      if (error) throw error
      return data
    },
    enabled,
    ...CACHE_CONFIG.static
  })
}

export const useStorageList = (bucket: string, path?: string) => {
  return useQuery({
    queryKey: ['storage', bucket, 'list', path],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(bucket).list(path)
      if (error) throw error
      return data
    },
    ...CACHE_CONFIG.static
  })
}

export const useStorageDelete = (bucket: string) => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (paths: string[]) => {
      const { data, error } = await supabase.storage.from(bucket).remove(paths)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage', bucket] })
    }
  })
}
