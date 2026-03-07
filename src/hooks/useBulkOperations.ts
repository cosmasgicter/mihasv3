import { applicationsData } from '@/data/applications'

interface BulkApiResponse {
  successCount?: number
  [key: string]: unknown
}

export function useBulkOperations() {
  const bulkUpdateStatusMutation = applicationsData.useBulkUpdateStatus()
  const bulkUpdatePaymentStatusMutation = applicationsData.useBulkUpdatePaymentStatus()
  const bulkDeleteMutation = applicationsData.useBulkDelete()

  const bulkUpdateStatus = async (applicationIds: string[], newStatus: string): Promise<number> => {
    const response = await bulkUpdateStatusMutation.mutateAsync({ applicationIds, status: newStatus }) as BulkApiResponse | undefined
    return response?.successCount ?? applicationIds.length
  }

  const bulkUpdatePaymentStatus = async (applicationIds: string[], newPaymentStatus: string): Promise<number> => {
    const response = await bulkUpdatePaymentStatusMutation.mutateAsync({ applicationIds, paymentStatus: newPaymentStatus }) as BulkApiResponse | undefined
    return response?.successCount ?? applicationIds.length
  }

  const bulkDeleteApplications = async (applicationIds: string[]): Promise<{ successCount: number; errorCount: number; errors: string[] }> => {
    const response = await bulkDeleteMutation.mutateAsync(applicationIds) as BulkApiResponse | undefined
    return {
      successCount: response?.successCount ?? applicationIds.length,
      errorCount: 0,
      errors: []
    }
  }

  const bulkSendNotifications = async (_applicationIds: string[], _notification: { title: string; message: string }): Promise<never> => {
    throw new Error('Bulk notifications not implemented in data module yet')
  }

  const loading = bulkUpdateStatusMutation.isPending || bulkUpdatePaymentStatusMutation.isPending || bulkDeleteMutation.isPending
  const error = bulkUpdateStatusMutation.error?.message || bulkUpdatePaymentStatusMutation.error?.message || bulkDeleteMutation.error?.message || ''

  const clearError = () => {
    bulkUpdateStatusMutation.reset()
    bulkUpdatePaymentStatusMutation.reset()
    bulkDeleteMutation.reset()
  }

  return {
    bulkUpdateStatus,
    bulkUpdatePaymentStatus,
    bulkDeleteApplications,
    bulkSendNotifications,
    loading,
    error,
    clearError
  }
}