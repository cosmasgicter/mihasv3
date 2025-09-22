import { applicationsData } from '@/data/applications'

export function useBulkOperations() {
  const bulkUpdateStatusMutation = applicationsData.useBulkUpdateStatus()
  const bulkUpdatePaymentStatusMutation = applicationsData.useBulkUpdatePaymentStatus()
  const bulkDeleteMutation = applicationsData.useBulkDelete()

  const bulkUpdateStatus = async (applicationIds: string[], newStatus: string) => {
    const response = await bulkUpdateStatusMutation.mutateAsync({ applicationIds, status: newStatus })
    return response?.successCount || applicationIds.length
  }

  const bulkUpdatePaymentStatus = async (applicationIds: string[], newPaymentStatus: string) => {
    const response = await bulkUpdatePaymentStatusMutation.mutateAsync({ applicationIds, paymentStatus: newPaymentStatus })
    return response?.successCount || applicationIds.length
  }

  const bulkDeleteApplications = async (applicationIds: string[]) => {
    const response = await bulkDeleteMutation.mutateAsync(applicationIds)
    return {
      successCount: response?.successCount || applicationIds.length,
      errorCount: 0,
      errors: []
    }
  }

  const bulkSendNotifications = async (applicationIds: string[], notification: { title: string; message: string }) => {
    // This would need to be added to the data module if needed
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