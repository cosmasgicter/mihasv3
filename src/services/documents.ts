import { apiClient } from './client'

export const documentService = {
  /** Upload a document. Maps to POST /api/documents?action=upload */
  upload: (data: { file: File; fileType: string; applicationId: string; userId?: string }) => {
    const formData = new FormData()
    formData.append('file', data.file)
    formData.append('fileType', data.fileType)
    formData.append('applicationId', data.applicationId)
    if (data.userId) formData.append('userId', data.userId)
    
    return apiClient.request('/documents?action=upload', {
      method: 'POST',
      body: formData,
      headers: {} // Let browser set Content-Type for FormData
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
