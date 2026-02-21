import { apiClient } from '@/services/client'
import { sanitizeText, sanitizeForLog } from './sanitize'
import type { NotificationData } from '@/types/notifications'

const NOTIFICATION_TEMPLATES = {
  submitted: {
    title: '✅ Application Submitted Successfully',
    content: (applicationNumber: string, program: string) => 
      `Your application #${applicationNumber} for ${program} has been submitted and is under review.`,
    type: 'success' as const
  },
  under_review: {
    title: '👀 Application Under Review',
    content: (applicationNumber: string, program: string) => 
      `Your application #${applicationNumber} for ${program} is currently being reviewed by our admissions team.`,
    type: 'info' as const
  },
  approved: {
    title: '🎉 Application Approved!',
    content: (applicationNumber: string, program: string) => 
      `Congratulations! Your application #${applicationNumber} for ${program} has been approved. Welcome to our institution!`,
    type: 'success' as const
  },
  rejected: {
    title: '❌ Application Status Update',
    content: (applicationNumber: string, program: string) => 
      `Your application #${applicationNumber} for ${program} has been reviewed. Please check your email for detailed feedback.`,
    type: 'error' as const
  },
  pending_documents: {
    title: '📄 Documents Required',
    content: (applicationNumber: string, program: string) => 
      `Your application #${applicationNumber} requires additional documents. Please upload them to continue processing.`,
    type: 'warning' as const
  }
} as const

export class NotificationService {
  static async sendNotification(data: NotificationData): Promise<boolean> {
    if (!data.userId || !data.title || !data.content) {
      console.error('Missing required notification data')
      return false
    }

    try {
      const sanitizedTitle = sanitizeText(data.title)
      const sanitizedContent = sanitizeText(data.content)
      const notifType = data.type || 'info'

      const result = await apiClient.request<{ duplicate?: boolean; notification?: unknown }>('/api/notifications?action=send', {
        method: 'POST',
        body: JSON.stringify({
          user_id: data.userId,
          title: sanitizedTitle,
          message: sanitizedContent,
          type: notifType,
          action_url: data.actionUrl || null,
        }),
      })

      // Backend returns { duplicate: true } when dedup catches a repeat — treat as silent success
      if (result && typeof result === 'object' && 'duplicate' in result && result.duplicate) {
        return false
      }

      return true
    } catch (error) {
      console.error('Error sending notification:', sanitizeForLog(String(error)))
      return false
    }
  }

  static async sendApplicationStatusNotification(
    userId: string, 
    applicationId: string, 
    status: string, 
    applicationNumber: string,
    program: string
  ): Promise<boolean> {
    if (!userId || !applicationId || !status || !applicationNumber || !program) {
      console.error('Missing required parameters for status notification')
      return false
    }

    const template = NOTIFICATION_TEMPLATES[status as keyof typeof NOTIFICATION_TEMPLATES]
    if (!template) {
      console.error('Invalid notification status:', sanitizeForLog(status))
      return false
    }

    const sanitizedAppNumber = sanitizeText(applicationNumber)
    const sanitizedProgram = sanitizeText(program)

    return this.sendNotification({
      userId,
      title: template.title,
      content: template.content(sanitizedAppNumber, sanitizedProgram),
      type: template.type,
      actionUrl: `/application/${applicationId}`
    })
  }

  static async sendWelcomeNotification(userId: string, userName: string): Promise<boolean> {
    if (!userId || !userName) {
      console.error('Missing required parameters for welcome notification')
      return false
    }

    const sanitizedName = sanitizeText(userName)
    return this.sendNotification({
      userId,
      title: '🎓 Welcome to MIHAS-KATC!',
      content: `Welcome ${sanitizedName}! Your account has been created successfully. You can now start your application process.`,
      type: 'success',
      actionUrl: '/student/application-wizard'
    })
  }

  static async sendDocumentUploadNotification(
    userId: string, 
    documentType: string, 
    applicationNumber: string
  ): Promise<boolean> {
    if (!userId || !documentType || !applicationNumber) {
      console.error('Missing required parameters for document notification')
      return false
    }

    const sanitizedDocType = sanitizeText(documentType)
    const sanitizedAppNumber = sanitizeText(applicationNumber)
    
    return this.sendNotification({
      userId,
      title: '📎 Document Uploaded',
      content: `Your ${sanitizedDocType} has been uploaded successfully for application #${sanitizedAppNumber}.`,
      type: 'success'
    })
  }

  static async sendDeadlineReminder(
    userId: string, 
    intakeName: string, 
    deadline: string
  ): Promise<boolean> {
    return this.sendNotification({
      userId,
      title: '⏰ Application Deadline Reminder',
      content: `Reminder: The application deadline for ${intakeName} is ${deadline}. Don't miss out!`,
      type: 'warning',
      actionUrl: '/student/application-wizard'
    })
  }
}
