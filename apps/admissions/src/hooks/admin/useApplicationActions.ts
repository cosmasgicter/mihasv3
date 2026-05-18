import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { applicationService } from '@/services/applications'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { invalidateAdminApplicationQueries } from './applicationQueryInvalidation'
import { logger } from '@/lib/logger'

export function useApplicationActions() {
  const [updating, setUpdating] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()
  const confirmDialog = useConfirmDialog()

  const updateStatus = async (applicationId: string, newStatus: string, feedback?: string) => {
    try {
      setUpdating(applicationId)
      await applicationService.updateStatus(applicationId, newStatus, feedback)

      await invalidateAdminApplicationQueries(queryClient, { applicationId })
    } catch (error) {
      logger.error('Error updating application status:', error)
      throw error
    } finally {
      setUpdating(null)
    }
  }

  const deleteApplication = async (applicationId: string) => {
    const confirmed = await confirmDialog.confirm({
      title: 'Delete Application',
      message: 'This application will be permanently deleted.',
      confirmText: 'Delete',
      variant: 'danger'
    })
    if (!confirmed) return
    
    try {
      setUpdating(applicationId)
      await applicationService.delete(applicationId)

      await invalidateAdminApplicationQueries(queryClient)
    } catch (error) {
      logger.error('Error deleting application:', error)
      throw error
    } finally {
      setUpdating(null)
    }
  }

  const sendNotification = async (applicationId: string, notification: { title: string; message: string }) => {
    try {
      setLoading(true)
      await applicationService.sendNotification(applicationId, notification)
      await invalidateAdminApplicationQueries(queryClient, { applicationId })
    } catch (error) {
      logger.error('Error sending notification:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const submitFeedback = async (applicationId: string, feedbackText: string, userId?: string) => {
    try {
      setLoading(true)
      await applicationService.update(applicationId, {
        admin_feedback: feedbackText,
        admin_feedback_date: new Date().toISOString(),
        admin_feedback_by: userId,
        updated_at: new Date().toISOString()
      })

      await invalidateAdminApplicationQueries(queryClient, { applicationId })
    } catch (error) {
      logger.error('Error submitting feedback:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  return {
    updating,
    loading,
    updateStatus,
    deleteApplication,
    sendNotification,
    submitFeedback,
    confirmDialog
  }
}
