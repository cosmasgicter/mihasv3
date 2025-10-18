import type { EmailReceipt } from '@/types/submission'
import { getApiBaseUrl } from './apiConfig'

const HTML_ESCAPE_LOOKUP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => HTML_ESCAPE_LOOKUP[char] ?? char)
}

function formatStatus(value: string): string {
  return value
    .replace(/[_\s]+/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase())
}

function wrapEmailBody(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MIHAS Notification</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f5f6f9;font-family:'Helvetica Neue',Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f6f9;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 10px 40px rgba(15,23,42,0.08);">
            <tr>
              <td style="padding:32px 40px;">
                ${content}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 40px;background-color:#f9fafb;color:#4b5563;font-size:12px;text-align:center;">
                © ${new Date().getFullYear()} MIHAS. All rights reserved.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function renderKeyValueRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:12px 16px;font-weight:600;color:#1f2937;background-color:#f9fafb;border-bottom:1px solid #e5e7eb;width:40%;">${escapeHtml(label)}</td>
    <td style="padding:12px 16px;color:#111827;background-color:#ffffff;border-bottom:1px solid #e5e7eb;">${escapeHtml(value)}</td>
  </tr>`
}

export function renderApplicationReceiptEmail(receipt: EmailReceipt): string {
  const section = `
    <h1 style="font-size:24px;margin:0 0 12px;color:#111827;">Application received</h1>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#374151;">
      Thank you for submitting your application to MIHAS. We have received the details below and will notify you once they have been reviewed.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border-radius:10px;overflow:hidden;box-shadow:inset 0 0 0 1px #e5e7eb;">
      ${renderKeyValueRow('Application number', receipt.applicationNumber)}
      ${renderKeyValueRow('Tracking code', receipt.trackingCode)}
      ${renderKeyValueRow('Programme', receipt.programName)}
      ${renderKeyValueRow('Submission date', receipt.submissionDate)}
      ${renderKeyValueRow('Payment status', formatStatus(receipt.paymentStatus))}
    </table>
    <p style="margin:24px 0 0;font-size:15px;line-height:1.6;color:#4b5563;">
      Keep this information for your records. You can use your tracking code to check the status of your application at any time.
    </p>
  `

  return wrapEmailBody(section)
}

export interface ApplicationSlipEmailData {
  applicantName: string
  applicationNumber: string
  trackingCode: string
  status: string
  slipUrl: string
  programName?: string
  paymentStatus?: string
}

export function renderApplicationSlipEmail(data: ApplicationSlipEmailData): string {
  const link = escapeHtml(data.slipUrl)
  const section = `
    <h1 style="font-size:24px;margin:0 0 12px;color:#111827;">Your application slip is ready</h1>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#374151;">
      Hello ${escapeHtml(data.applicantName)},<br />
      A digital copy of your MIHAS application slip is now available. You can download it using the secure link below.
    </p>
    <a href="${link}" style="display:inline-block;padding:14px 28px;background-color:#0ea5e9;color:#ffffff;font-weight:600;border-radius:9999px;text-decoration:none;margin-bottom:24px;">Download your slip</a>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border-radius:10px;overflow:hidden;box-shadow:inset 0 0 0 1px #e5e7eb;">
      ${renderKeyValueRow('Application number', data.applicationNumber)}
      ${renderKeyValueRow('Tracking code', data.trackingCode)}
      ${renderKeyValueRow('Status', formatStatus(data.status))}
      ${renderKeyValueRow('Programme', data.programName || 'Not specified')}
      ${renderKeyValueRow('Payment status', data.paymentStatus ? formatStatus(data.paymentStatus) : 'Pending review')}
    </table>
    <p style="margin:24px 0 0;font-size:15px;line-height:1.6;color:#4b5563;">
      If the button above does not work, copy and paste this link into your browser:<br />
      <span style="color:#2563eb;word-break:break-all;">${link}</span>
    </p>
  `

  return wrapEmailBody(section)
}

const getAppBaseUrl = () => {
  const apiBase = getApiBaseUrl()
  return import.meta.env.VITE_APP_BASE_URL || apiBase
}

// DEPRECATED: Legacy text-based email templates
// Use api/_lib/emailTemplates.js for new HTML email templates
export const EMAIL_TEMPLATES = {
  submitted: {
    subject: (program: string) => `✅ Application Submitted Successfully - ${program}`,
    body: (userName: string, program: string, applicationNumber: string) =>
      `Dear ${userName},\n\nYour application for ${program} has been successfully submitted!\n\n📋 Application Number: ${applicationNumber}\n📊 Status: Under Review\n⏰ Expected Processing Time: 3-5 business days\n\nYou can track your application status anytime at: ${getAppBaseUrl()}/track-application\n\nWhat's Next?\n- Our admissions team will review your application\n- You'll receive email updates on any status changes\n- Make sure to check your email regularly\n\nThank you for choosing MIHAS-KATC for your educational journey!\n\nBest regards,\nMIHAS-KATC Admissions Team\n\n---\nThis is an automated message. Please do not reply to this email.\nFor questions, contact us at info@mihas.edu.zm or info@katc.edu.zm`
  },

  approved: {
    subject: (program: string) => `🎉 Congratulations! Application Approved - ${program}`,
    body: (userName: string, program: string, applicationNumber: string) =>
      `Dear ${userName},\n\nCongratulations! We are pleased to inform you that your application for ${program} has been APPROVED!\n\n📋 Application Number: ${applicationNumber}\n🎓 Program: ${program}\n📅 Next Steps: You will receive enrollment details within 48 hours\n\nWelcome to the MIHAS-KATC family! We look forward to supporting your academic and professional growth.\n\nImportant Next Steps:\n1. Check your email for enrollment instructions\n2. Prepare required enrollment documents\n3. Complete registration process as instructed\n\nFor any questions about enrollment, please contact:\n- MIHAS: +260 961 515 151 | info@mihas.edu.zm\n- KATC: +260 966 992 299 | info@katc.edu.zm\n\nCongratulations once again!\n\nBest regards,\nMIHAS-KATC Admissions Team`
  },

  rejected: {
    subject: (program: string) => `Application Status Update - ${program}`,
    body: (userName: string, program: string, applicationNumber: string) =>
      `Dear ${userName},\n\nThank you for your interest in ${program} at MIHAS-KATC.\n\n📋 Application Number: ${applicationNumber}\n📊 Status: Not Selected\n\nAfter careful review of your application, we regret to inform you that we are unable to offer you admission at this time.\n\nThis decision does not reflect your potential or worth. We encourage you to:\n- Consider reapplying for future intakes\n- Explore other programs that might be a good fit\n- Contact our admissions team for feedback\n\nFuture Opportunities:\n- New intake periods open regularly\n- Consider our other accredited programs\n- Scholarship opportunities may be available\n\nFor questions or feedback, please contact:\n- MIHAS: +260 961 515 151 | info@mihas.edu.zm  \n- KATC: +260 966 992 299 | info@katc.edu.zm\n\nWe wish you all the best in your educational pursuits.\n\nBest regards,\nMIHAS-KATC Admissions Team`
  },

  pending_documents: {
    subject: (program: string) => `📄 Missing Documents Required - ${program}`,
    body: (userName: string, program: string, applicationNumber: string) =>
      `Dear ${userName},\n\nYour application for ${program} requires additional documents to continue processing.\n\n📋 Application Number: ${applicationNumber}\n📊 Status: Pending Documents\n⏰ Deadline: Please upload within 7 days\n\nRequired Documents:\nPlease log into your account to see which specific documents are needed.\n\nTo upload documents:\n1. Visit: ${getAppBaseUrl()}/apply\n2. Log into your account\n3. Navigate to your application\n4. Upload the required documents\n\nImportant: Failure to submit required documents within the deadline may result in application cancellation.\n\nFor technical support or questions:\n- MIHAS: +260 961 515 151 | info@mihas.edu.zm\n- KATC: +260 966 992 299 | info@katc.edu.zm\n\nBest regards,\nMIHAS-KATC Admissions Team`
  }
} as const
