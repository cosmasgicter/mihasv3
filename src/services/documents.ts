import { apiClient } from './client'

export const documentService = {
  upload: (data: { fileName: string; fileData: any; documentType: string; applicationId: string }) =>
    apiClient.request('/api/documents/upload', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  generateAcceptanceLetter: (applicationId: string) =>
    apiClient.request('/api/documents/acceptance-letter', {
      method: 'POST',
      body: JSON.stringify({ applicationId })
    }),

  generateFinanceReceipt: (applicationId: string) =>
    apiClient.request('/api/documents/finance-receipt', {
      method: 'POST',
      body: JSON.stringify({ applicationId })
    })
}
