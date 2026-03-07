import { apiClient } from '@/services/client'
import { applicationService } from '@/services/applications'
import { notificationService } from '@/services/notifications'
import { NotificationService } from './notificationService'
import { emailService } from './emailService'
import type { NotificationResult, BroadcastResult } from '@/types/notifications'

export class AdminNotificationService {
  static async updateApplicationStatus(
    applicationId: string,
    newStatus: string,
    adminUserId: string
  ): Promise<NotificationResult> {
    try {
      // Update application status via API
      const result = await applicationService.updateStatus(applicationId, newStatus)

      if (!result) {
        return { success: false, error: 'Failed to update application status' }
      }

      // The database trigger will automatically:
      // 1. Send in-app notification
      // 2. Queue email notification
      
      return { success: true }
    } catch (error) {
      console.error('Error updating application status:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  }

  static async sendCustomNotification(
    userId: string,
    title: string,
    content: string,
    type: 'info' | 'success' | 'warning' | 'error' = 'info',
    actionUrl?: string
  ): Promise<NotificationResult> {
    try {
      const success = await NotificationService.sendNotification({
        userId,
        title,
        content,
        type,
        actionUrl
      })

      return { success: Boolean(success) }
    } catch (error) {
      console.error('Error sending custom notification:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  }

  static async broadcastNotification(
    title: string,
    content: string,
    type: 'info' | 'success' | 'warning' | 'error' = 'info',
    targetRole: 'student' | 'all' = 'student'
  ): Promise<BroadcastResult> {
    try {
      // Use admin API to get users and send broadcast
      const result = await apiClient.request<{ users?: Array<{ id: string }> }>(
        `/admin?action=users&role=${targetRole === 'all' ? '' : targetRole}`
      )

      const users = result?.users ?? []

      if (users.length === 0) {
        return { success: false, sent: 0, error: 'No users found' }
      }

      // Send notifications via notification service
      let totalSent = 0
      const BATCH_SIZE = 100

      for (let i = 0; i < users.length; i += BATCH_SIZE) {
        const batch = users.slice(i, i + BATCH_SIZE)
        
        await Promise.all(
          batch.map(user =>
            notificationService.send({
              to: user.id,
              subject: title,
              message: content
            }).catch(() => false)
          )
        )

        totalSent += batch.length
      }

      return { success: true, sent: totalSent }
    } catch (error) {
      console.error('Error broadcasting notification:', error)
      return { 
        success: false, 
        sent: 0,
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  }
}
