// Minimal email service
import { formatTimestamp } from '@/lib/dateFormat'
import { apiClient } from '@/services/client'

export const emailService = {
  async sendNotificationEmail(to: string, title: string, message: string) {
    return apiClient.request('/email/send', {
      method: 'POST',
      body: JSON.stringify({
        recipient_email: to,
        subject: title,
        body: `${title}\n\n${message}\n\nMIHAS Application System - Do not reply to this email`,
      })
    })
  },

  async sendAcceptanceLetter(to: string, applicationNumber: string, pdfUrl: string) {
    return apiClient.request('/email/send', {
      method: 'POST',
      body: JSON.stringify({
        recipient_email: to,
        subject: `Acceptance Letter - ${applicationNumber}`,
        body: [
          `Congratulations. Your application ${applicationNumber} has been approved.`,
          `Download your acceptance letter here: ${pdfUrl}`,
          'Next steps will be communicated to you shortly.',
        ].join('\n\n'),
      })
    })
  },

  async sendInterviewSchedule(to: string, applicationNumber: string, scheduledAt: string, mode: string, location?: string) {
    const date = formatTimestamp(scheduledAt)

    return apiClient.request('/email/send', {
      method: 'POST',
      body: JSON.stringify({
        recipient_email: to,
        subject: `Interview Scheduled - ${applicationNumber}`,
        body: [
          `Your interview for application ${applicationNumber} has been scheduled.`,
          `Date and time: ${date}`,
          `Mode: ${mode}`,
          ...(location ? [`Location: ${location}`] : []),
          'Please arrive 10 minutes early and bring your ID and any required documents.',
        ].join('\n\n'),
      })
    })
  }
}
