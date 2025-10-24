/**
 * Standardized Email Service with Attachment Support
 * Uses Resend API for reliable email delivery
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || 'MIHAS Admissions <admissions@mihas.edu.zm>';

/**
 * Send email with optional attachments
 * @param {Object} options
 * @param {string|string[]} options.to - Recipient email(s)
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {Array<{filename: string, content: Buffer|string, contentType: string}>} options.attachments - Optional attachments
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
export async function sendEmail({ to, subject, html, attachments = [] }) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not configured, email not sent');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const payload = {
      from: FROM_EMAIL,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    };

    // Add attachments if provided
    if (attachments && attachments.length > 0) {
      payload.attachments = attachments.map(att => ({
        filename: att.filename,
        content: att.content instanceof Buffer 
          ? att.content.toString('base64')
          : att.content,
        contentType: att.contentType || 'application/octet-stream'
      }));
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to send email');
    }

    return { success: true, id: data.id };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send email with PDF attachment
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {Buffer} options.pdfBuffer - PDF file buffer
 * @param {string} options.pdfFilename - PDF filename
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
export async function sendEmailWithPDF({ to, subject, html, pdfBuffer, pdfFilename }) {
  return sendEmail({
    to,
    subject,
    html,
    attachments: [{
      filename: pdfFilename,
      content: pdfBuffer,
      contentType: 'application/pdf'
    }]
  });
}
