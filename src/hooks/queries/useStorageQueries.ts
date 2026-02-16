import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { documentService } from '@/services/documents'
import { apiClient } from '@/services/client'
import { CACHE_CONFIG } from './useSupabaseQuery'

export const useStorageUpload = (bucket: string) => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ path, file }: { path: string; file: File }) => {
      const result = await documentService.upload({
        file,
        fileType: path.split('.').pop() || 'unknown',
        applicationId: bucket, // bucket maps to applicationId context
      })
      return result
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
      const result = await apiClient.request<Blob>(`/documents?action=download&bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`)
      return result
    },
    enabled,
    ...CACHE_CONFIG.static
  })
}

export const useStorageList = (bucket: string, path?: string) => {
  return useQuery({
    queryKey: ['storage', bucket, 'list', path],
    queryFn: async () => {
      const params = new URLSearchParams({ action: 'list', bucket })
      if (path) params.set('path', path)
      const result = await apiClient.request<unknown[]>(`/documents?${params.toString()}`)
      return result ?? []
    },
    ...CACHE_CONFIG.static
  })
}

export const useStorageDelete = (bucket: string) => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (paths: string[]) => {
      const result = await apiClient.request('/documents?action=delete', {
        method: 'POST',
        body: JSON.stringify({ bucket, paths })
      })
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage', bucket] })
    }
  })
}
