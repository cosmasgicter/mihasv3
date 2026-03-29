import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { documentService } from '@/services/documents'
import { deleteFile, downloadFile, listFiles } from '@/lib/storage'
import { CACHE_CONFIG } from './useQueryConfig'

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
      const result = await downloadFile(bucket, path)
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Download failed')
      }
      return result.data
    },
    enabled,
    ...CACHE_CONFIG.static
  })
}

export const useStorageList = (bucket: string, path?: string) => {
  return useQuery({
    queryKey: ['storage', bucket, 'list', path],
    queryFn: async () => {
      const result = await listFiles(bucket, path)
      return result.files ?? []
    },
    ...CACHE_CONFIG.static
  })
}

export const useStorageDelete = (bucket: string) => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (paths: string[]) => {
      return Promise.all(paths.map((path) => deleteFile(bucket, path)))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage', bucket] })
    }
  })
}
