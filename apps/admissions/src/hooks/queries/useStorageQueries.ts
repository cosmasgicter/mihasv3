import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { documentService } from '@/services/documents'
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
      // For direct URLs (e.g. CDN/R2 signed URLs), fetch the blob directly
      if (/^https?:\/\//.test(path)) {
        const response = await fetch(path)
        if (!response.ok) {
          throw new Error(`Download failed: ${response.status}`)
        }
        return response.blob()
      }

      // For document IDs, get a signed URL via the document service then fetch
      const result = await documentService.getSignedUrl(path)
      if (!result?.url) {
        throw new Error('Could not retrieve a signed download URL')
      }
      const response = await fetch(result.url)
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`)
      }
      return response.blob()
    },
    enabled,
    ...CACHE_CONFIG.static
  })
}

export const useStorageList = (bucket: string, path?: string) => {
  return useQuery({
    queryKey: ['storage', bucket, 'list', path],
    queryFn: async () => {
      // Document listing by bucket/path is not yet available in the Django backend.
      // Returns empty array until the backend endpoint is implemented (task 9.1).
      return [] as unknown[]
    },
    ...CACHE_CONFIG.static
  })
}

export const useStorageDelete = (bucket: string) => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (_paths: string[]) => {
      // Document deletion is not yet available in the Django backend.
      // This will be wired up when the backend endpoint is implemented (task 9.1).
      throw new Error('Document deletion is not implemented in the Django backend yet')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage', bucket] })
    }
  })
}
