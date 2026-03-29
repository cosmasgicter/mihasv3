import { apiClient } from './client'

export const documentService = {
  /** Upload a document via Django multipart endpoint. */
  upload: async (data: { file: File; fileType: string; applicationId: string; userId?: string }) => {
    void data.userId
    const formData = new FormData()
    formData.append('file', data.file)
    formData.append('application_id', data.applicationId)
    formData.append('document_type', data.fileType)

    return apiClient.request('/documents/upload/', {
      method: 'POST',
      body: formData
    })
  },

  /** Extract text from an uploaded document via Celery. */
  extract: async (data: { documentId?: string; documentUrl?: string; applicationId?: string }) => {
    void data.documentUrl
    void data.applicationId

    if (!data.documentId) {
      throw new Error('Document extraction requires an uploaded document ID')
    }

    return apiClient.request(`/documents/${encodeURIComponent(data.documentId)}/extract/`, {
      method: 'POST'
    })
  },

  /** Get a signed download URL for a document. */
  getSignedUrl: async (documentId: string) => {
    return apiClient.request<{ url: string }>(`/documents/${encodeURIComponent(documentId)}/signed-url/`, {
      method: 'GET'
    })
  },
}
