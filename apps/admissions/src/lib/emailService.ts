// Minimal email service
import { formatTimestamp } from '@/lib/dateFormat'

export const emailService = {
  async sendNotificationEmail(to: string, title: string, message: string) {
    return fetch('/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        subject: title,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">${title}</h2>
            <p style="color: #374151; line-height: 1.6;">${message}</p>
            <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="color: #6b7280; font-size: 12px;">
              MIHAS Application System - Do not reply to this email
            </p>
          </div>
        `,
        type: 'notification',
        metadata: { title }
      })
    })
  },

  async sendAcceptanceLetter(to: string, applicationNumber: string, pdfUrl: string) {
    return fetch('/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        subject: `Acceptance Letter - ${applicationNumber}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #10b981;">Congratulations! 🎉</h2>
            <p>Your application <strong>${applicationNumber}</strong> has been approved.</p>
            <p>Please find your acceptance letter attached or download it here:</p>
            <a href="${pdfUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
              Download Acceptance Letter
            </a>
            <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
              Next steps will be communicated to you shortly.
            </p>
          </div>
        `,
        type: 'acceptance_letter',
        metadata: { applicationNumber }
      })
    })
  },

  async sendInterviewSchedule(to: string, applicationNumber: string, scheduledAt: string, mode: string, location?: string) {
    const date = formatTimestamp(scheduledAt)

    return fetch('/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        subject: `Interview Scheduled - ${applicationNumber}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Interview Scheduled 📅</h2>
            <p>Your interview for application <strong>${applicationNumber}</strong> has been scheduled.</p>
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Date & Time:</strong> ${date}</p>
              <p style="margin: 5px 0;"><strong>Mode:</strong> ${mode}</p>
              ${location ? `<p style="margin: 5px 0;"><strong>Location:</strong> ${location}</p>` : ''}
            </div>
            <p style="color: #6b7280; font-size: 14px;">
              Please arrive 10 minutes early. Bring your ID and any required documents.
            </p>
          </div>
        `,
        type: 'interview_schedule',
        metadata: { applicationNumber, scheduledAt, mode }
      })
    })
  }
}
