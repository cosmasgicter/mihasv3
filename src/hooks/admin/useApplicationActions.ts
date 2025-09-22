import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { applicationService } from '@/services/applications'

export function useApplicationActions() {
  const [updating, setUpdating] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  const updateStatus = async (applicationId: string, newStatus: string, feedback?: string) => {
    try {
      setUpdating(applicationId)
      await applicationService.updateStatus(applicationId, newStatus, feedback)
      
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      queryClient.invalidateQueries({ queryKey: ['application-stats'] })
    } catch (error) {
      console.error('Error updating application status:', error)
      throw error
    } finally {
      setUpdating(null)
    }
  }

  const deleteApplication = async (applicationId: string) => {
    if (!confirm('Are you sure you want to delete this application? This action cannot be undone.')) {
      return
    }
    
    try {
      setUpdating(applicationId)
      await applicationService.delete(applicationId)
      
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      queryClient.invalidateQueries({ queryKey: ['application-stats'] })
    } catch (error) {
      console.error('Error deleting application:', error)
      throw error
    } finally {
      setUpdating(null)
    }
  }

  const sendNotification = async (applicationId: string, notification: { title: string; message: string }) => {
    try {
      setLoading(true)
      await applicationService.sendNotification(applicationId, notification)
      queryClient.invalidateQueries({ queryKey: ['applications'] })
    } catch (error) {
      console.error('Error sending notification:', error)
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
      
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      queryClient.invalidateQueries({ queryKey: ['application-stats'] })
    } catch (error) {
      console.error('Error submitting feedback:', error)
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
    submitFeedback
  }
}