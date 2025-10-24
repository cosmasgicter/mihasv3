import { apiClient } from './client'

export const documentService = {
  upload: (data: { file: File; fileType: string; applicationId: string; userId?: string }) => {
    const formData = new FormData()
    formData.append('file', data.file)
    formData.append('fileType', data.fileType)
    formData.append('applicationId', data.applicationId)
    if (data.userId) formData.append('userId', data.userId)
    
    return apiClient.request('/documents/upload', {
      method: 'POST',
      body: formData,
      headers: {} // Let browser set Content-Type for FormData
    })
  },

  generateAcceptanceLetter: (applicationId: string) =>
    apiClient.request('/documents/acceptance-letter', {
      method: 'POST',
      body: JSON.stringify({ applicationId })
    }),

  generateFinanceReceipt: (applicationId: string) =>
    apiClient.request('/documents/finance-receipt', {
      method: 'POST',
      body: JSON.stringify({ applicationId })
    })
}
