import { logApiError } from '@/lib/apiErrorLogger'
import { apiClient } from './client'

export const documentService = {
  /** Upload a document via Django multipart endpoint. */
  upload: async (data: { file: File; fileType: string; applicationId: string }) => {
    const formData = new FormData()
    formData.append('file', data.file)
    formData.append('application_id', data.applicationId)
    formData.append('document_type', data.fileType)

    try {
      const result = await apiClient.request('/documents/upload/', {
        method: 'POST',
        body: formData
      })
      return result ?? null
    } catch (err) {
      logApiError('documents', '/documents/upload/', err)
      throw err
    }
  },

  /** Extract text from an uploaded document via Celery. */
  extract: async (data: { documentId?: string }) => {
    if (!data.documentId) {
      throw new Error('Document extraction requires an uploaded document ID')
    }

    const endpoint = `/documents/${encodeURIComponent(data.documentId)}/extract/`
    try {
      const result = await apiClient.request(endpoint, {
        method: 'POST'
      })
      return result ?? null
    } catch (err) {
      logApiError('documents', endpoint, err)
      throw err
    }
  },

  /** Get a signed download URL for a document. */
  getSignedUrl: async (documentId: string) => {
    const endpoint = `/documents/${encodeURIComponent(documentId)}/signed-url/`
    try {
      const result = await apiClient.request<{ url: string }>(endpoint, {
        method: 'GET'
      })
      return result ?? null
    } catch (err) {
      logApiError('documents', endpoint, err)
      throw err
    }
  },
}
