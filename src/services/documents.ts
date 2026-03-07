import { apiClient } from './client'
import { fileToBase64 } from '@/utils/file-helpers'

export const documentService = {
  /** Upload a document. Maps to POST /api/documents?action=upload */
  upload: async (data: { file: File; fileType: string; applicationId: string; userId?: string }) => {
    const file = await fileToBase64(data.file)

    return apiClient.request('/documents?action=upload', {
      method: 'POST',
      body: JSON.stringify({
        file,
        fileName: data.file.name,
        contentType: data.file.type,
        applicationId: data.applicationId,
        userId: data.userId,
        documentType: data.fileType,
      })
    })
  },

  /** Extract text from a document. Maps to POST /api/documents?action=extract */
  extract: (data: { documentUrl: string; applicationId?: string }) =>
    apiClient.request('/documents?action=extract', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  /** Get a signed download URL. Maps to GET /api/documents?action=signed-url&key=... */
  getSignedUrl: (key: string) =>
    apiClient.request(`/documents?action=signed-url&key=${encodeURIComponent(key)}`, {
      method: 'GET'
    }),
}
