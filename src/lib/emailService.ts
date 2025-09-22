import { supabase } from './supabase'
import { sanitizeEmail, sanitizeText, sanitizeForLog } from './sanitize'
import { EMAIL_TEMPLATES } from './emailTemplates'
import type { EmailNotificationData } from '@/types/notifications'

export class EmailService {
  private static sanitizeHtmlContent(content: string): string {
    if (!content) return ''
    // Remove all HTML tags and dangerous characters
    return content
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: URLs
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .replace(/[<>"'`]/g, '') // Remove dangerous characters
      .trim()
  }

  static async queueEmailNotification(data: EmailNotificationData): Promise<boolean> {
    const sanitizedEmail = sanitizeEmail(data.recipientEmail)
    if (!sanitizedEmail || !data.applicationId || !data.subject || !data.body) {
      console.error('Invalid email notification data')
      return false
    }

    try {
      const { error } = await supabase
        .from('email_notifications')
        .insert({
          application_id: data.applicationId,
          recipient_email: sanitizedEmail,
          subject: sanitizeText(data.subject),
          body: this.sanitizeHtmlContent(data.body).substring(0, 5000),
          status: 'pending'
        })

      if (error) {
        console.error('Failed to queue email notification:', { error: sanitizeForLog(error.message) })
        return false
      }

      return true
    } catch (error) {
      console.error('Error queueing email notification:', { error: sanitizeForLog(String(error)) })
      return false
    }
  }

  static async sendApplicationStatusEmail(
    applicationId: string,
    userEmail: string,
    status: string,
    applicationNumber: string,
    program: string,
    userName: string
  ): Promise<boolean> {
    if (!applicationId || !userEmail || !status || !applicationNumber || !program || !userName) {
      console.error('Missing required parameters for email notification')
      return false
    }

    const sanitizedEmail = sanitizeEmail(userEmail)
    if (!sanitizedEmail) {
      console.error('Invalid email address format')
      return false
    }

    const template = EMAIL_TEMPLATES[status as keyof typeof EMAIL_TEMPLATES]
    if (!template) {
      console.error('Invalid email template status:', { status: sanitizeForLog(status) })
      return false
    }

    const sanitizedUserName = sanitizeText(userName)
    const sanitizedProgram = sanitizeText(program)
    const sanitizedAppNumber = sanitizeText(applicationNumber)

    return this.queueEmailNotification({
      applicationId,
      recipientEmail: sanitizedEmail,
      subject: this.sanitizeHtmlContent(template.subject(sanitizedProgram)),
      body: this.sanitizeHtmlContent(template.body(sanitizedUserName, sanitizedProgram, sanitizedAppNumber))
    })
  }
}