import { supabase } from './supabase'
import { NotificationService } from './notificationService'
import { EmailService } from './emailService'
import type { NotificationResult, BroadcastResult } from '@/types/notifications'

export class AdminNotificationService {
  static async updateApplicationStatus(
    applicationId: string,
    newStatus: string,
    adminUserId: string
  ): Promise<NotificationResult> {
    try {
      // Parallel queries for better performance
      const [applicationResult, userResult] = await Promise.all([
        supabase
          .from('applications_new')
          .select('*')
          .eq('id', applicationId)
          .single(),
        supabase
          .from('user_profiles')
          .select('full_name, email')
          .eq('user_id', applicationId)
          .single()
      ])

      if (applicationResult.error || !applicationResult.data) {
        return { success: false, error: 'Application not found' }
      }

      if (userResult.error || !userResult.data) {
        return { success: false, error: 'User not found' }
      }

      const application = applicationResult.data
      const user = userResult.data

      // Update application status (this will trigger the database trigger)
      const { error: updateError } = await supabase
        .from('applications_new')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', applicationId)

      if (updateError) {
        return { success: false, error: updateError.message }
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
      let query = supabase.from('user_profiles').select('user_id')
      
      if (targetRole === 'student') {
        query = query.eq('role', 'student')
      }

      const { data: users, error: usersError } = await query

      if (usersError) {
        return { success: false, sent: 0, error: usersError.message }
      }

      if (!users || users.length === 0) {
        return { success: false, sent: 0, error: 'No users found' }
      }

      // Process in batches to prevent memory issues
      const BATCH_SIZE = 100
      let totalSent = 0

      for (let i = 0; i < users.length; i += BATCH_SIZE) {
        const batch = users.slice(i, i + BATCH_SIZE)
        const notifications = batch.map(user => ({
          user_id: user.user_id,
          title,
          content,
          type,
          read: false
        }))

        const { error: insertError } = await supabase
          .from('in_app_notifications')
          .insert(notifications)

        if (insertError) {
          return { success: false, sent: totalSent, error: insertError.message }
        }

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