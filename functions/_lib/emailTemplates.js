// Unified Email Template System
// Matches PDF template design from pdfTemplates.js

const COLORS = {
  primaryBlue: '#0ea5e9',
  darkGray: '#111827',
  mediumGray: '#4b5563',
  lightGray: '#f9fafb',
  borderGray: '#e5e7eb',
  white: '#ffffff'
};

function escapeHtml(value) {
  const lookup = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, char => lookup[char] ?? char);
}

function formatStatus(value) {
  return String(value ?? '')
    .replace(/[_\s]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(date) {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function createEmailWrapper(content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MIHAS Notification</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.lightGray};font-family:'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.lightGray};padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${COLORS.white};border-radius:12px;overflow:hidden;box-shadow:0 10px 40px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:${COLORS.primaryBlue};padding:24px 40px;text-align:center;">
              <h1 style="margin:0;color:${COLORS.white};font-size:24px;font-weight:600;">MIHAS</h1>
              <p style="margin:4px 0 0;color:${COLORS.white};font-size:14px;opacity:0.9;">Mukuba Institute of Health and Allied Sciences</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background-color:${COLORS.lightGray};color:${COLORS.mediumGray};font-size:12px;text-align:center;">
              © ${new Date().getFullYear()} MIHAS. All rights reserved.<br>
              <a href="https://mihas.edu.zm" style="color:${COLORS.primaryBlue};text-decoration:none;">mihas.edu.zm</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function createTableRow(label, value) {
  return `<tr>
    <td style="padding:12px 16px;font-weight:600;color:${COLORS.darkGray};background-color:${COLORS.lightGray};border-bottom:1px solid ${COLORS.borderGray};width:40%;">${escapeHtml(label)}</td>
    <td style="padding:12px 16px;color:${COLORS.darkGray};background-color:${COLORS.white};border-bottom:1px solid ${COLORS.borderGray};">${escapeHtml(value)}</td>
  </tr>`;
}

function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '#';
  const trimmed = url.trim();
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:') || trimmed.startsWith('vbscript:')) {
    return '#';
  }
  return escapeHtml(trimmed);
}

function createButton(text, url) {
  return `<a href="${sanitizeUrl(url)}" style="display:inline-block;padding:14px 28px;background-color:${COLORS.primaryBlue};color:${COLORS.white};font-weight:600;border-radius:9999px;text-decoration:none;margin:16px 0;">${escapeHtml(text)}</a>`;
}

// Application Slip Email
function generateApplicationSlipEmail(data) {
  const content = `
    <h2 style="font-size:20px;margin:0 0 16px;color:${COLORS.darkGray};">Your Application Slip is Ready</h2>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${COLORS.mediumGray};">
      Hello ${escapeHtml(data.full_name)},<br>
      Your MIHAS application slip is now available for download.
    </p>
    ${data.slipUrl ? createButton('Download Application Slip', sanitizeUrl(data.slipUrl)) : ''}
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border-radius:8px;overflow:hidden;box-shadow:inset 0 0 0 1px ${COLORS.borderGray};margin:20px 0;">
      ${createTableRow('Application Number', data.application_number)}
      ${createTableRow('Tracking Code', data.public_tracking_code)}
      ${createTableRow('Program', data.program_name)}
      ${createTableRow('Status', formatStatus(data.status))}
      ${createTableRow('Submitted', formatDate(data.submitted_at))}
    </table>
    <p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:${COLORS.mediumGray};">
      Keep this information for your records. You can track your application status anytime using your tracking code.
    </p>
  `;
  return createEmailWrapper(content);
}

// Application Submitted Email
function generateApplicationSubmittedEmail(data) {
  const content = `
    <h2 style="font-size:20px;margin:0 0 16px;color:${COLORS.darkGray};">Application Submitted Successfully</h2>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${COLORS.mediumGray};">
      Dear ${escapeHtml(data.full_name)},<br>
      Your application has been successfully submitted and is now under review.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border-radius:8px;overflow:hidden;box-shadow:inset 0 0 0 1px ${COLORS.borderGray};margin:20px 0;">
      ${createTableRow('Application Number', data.application_number)}
      ${createTableRow('Tracking Code', data.public_tracking_code)}
      ${createTableRow('Program', data.program_name)}
      ${createTableRow('Institution', data.institution)}
      ${createTableRow('Submission Date', formatDate(data.submitted_at))}
    </table>
    <p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:${COLORS.mediumGray};">
      Expected processing time: 3-5 business days. You will receive email updates on any status changes.
    </p>
  `;
  return createEmailWrapper(content);
}

// Application Approved Email
function generateApplicationApprovedEmail(data) {
  const content = `
    <h2 style="font-size:20px;margin:0 0 16px;color:${COLORS.darkGray};">🎉 Congratulations! Application Approved</h2>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${COLORS.mediumGray};">
      Dear ${escapeHtml(data.full_name)},<br>
      We are pleased to inform you that your application has been <strong>APPROVED</strong>!
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border-radius:8px;overflow:hidden;box-shadow:inset 0 0 0 1px ${COLORS.borderGray};margin:20px 0;">
      ${createTableRow('Application Number', data.application_number)}
      ${createTableRow('Program', data.program_name)}
      ${createTableRow('Institution', data.institution)}
      ${createTableRow('Status', 'Approved')}
    </table>
    <p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:${COLORS.mediumGray};">
      Welcome to the MIHAS family! You will receive enrollment details within 48 hours.
    </p>
  `;
  return createEmailWrapper(content);
}

// Application Rejected Email
function generateApplicationRejectedEmail(data) {
  const content = `
    <h2 style="font-size:20px;margin:0 0 16px;color:${COLORS.darkGray};">Application Status Update</h2>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${COLORS.mediumGray};">
      Dear ${escapeHtml(data.full_name)},<br>
      Thank you for your interest in ${escapeHtml(data.program_name)} at MIHAS.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border-radius:8px;overflow:hidden;box-shadow:inset 0 0 0 1px ${COLORS.borderGray};margin:20px 0;">
      ${createTableRow('Application Number', data.application_number)}
      ${createTableRow('Program', data.program_name)}
      ${createTableRow('Status', 'Not Selected')}
    </table>
    <p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:${COLORS.mediumGray};">
      After careful review, we are unable to offer you admission at this time. We encourage you to consider reapplying for future intakes.
    </p>
  `;
  return createEmailWrapper(content);
}

// Pending Documents Email
function generatePendingDocumentsEmail(data) {
  const content = `
    <h2 style="font-size:20px;margin:0 0 16px;color:${COLORS.darkGray};">📄 Missing Documents Required</h2>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${COLORS.mediumGray};">
      Dear ${escapeHtml(data.full_name)},<br>
      Your application requires additional documents to continue processing.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border-radius:8px;overflow:hidden;box-shadow:inset 0 0 0 1px ${COLORS.borderGray};margin:20px 0;">
      ${createTableRow('Application Number', data.application_number)}
      ${createTableRow('Program', data.program_name)}
      ${createTableRow('Status', 'Pending Documents')}
      ${createTableRow('Deadline', '7 days from receipt')}
    </table>
    <p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:${COLORS.mediumGray};">
      Please log into your account to see which specific documents are needed. Failure to submit required documents within the deadline may result in application cancellation.
    </p>
  `;
  return createEmailWrapper(content);
}

// Payment Receipt Email
function generatePaymentReceiptEmail(data) {
  const content = `
    <h2 style="font-size:20px;margin:0 0 16px;color:${COLORS.darkGray};">Payment Receipt</h2>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${COLORS.mediumGray};">
      Dear ${escapeHtml(data.full_name)},<br>
      Your payment has been received and processed successfully.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border-radius:8px;overflow:hidden;box-shadow:inset 0 0 0 1px ${COLORS.borderGray};margin:20px 0;">
      ${createTableRow('Receipt Number', data.receipt_number)}
      ${createTableRow('Application Number', data.application_number)}
      ${createTableRow('Amount', `ZMW ${data.amount}`)}
      ${createTableRow('Payment Method', data.payment_method)}
      ${createTableRow('Date', formatDate(data.payment_date))}
    </table>
    <p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:${COLORS.mediumGray};">
      Keep this receipt for your records. If you have any questions, please contact our admissions office.
    </p>
  `;
  return createEmailWrapper(content);
}

// Generic Notification Email
function generateGenericNotificationEmail(data) {
  const content = `
    <h2 style="font-size:20px;margin:0 0 16px;color:${COLORS.darkGray};">${escapeHtml(data.title)}</h2>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${COLORS.mediumGray};">
      ${escapeHtml(data.message)}
    </p>
    ${data.actionUrl ? createButton(escapeHtml(data.actionText || 'View Details'), sanitizeUrl(data.actionUrl)) : ''}
  `;
  return createEmailWrapper(content);
}

export {
  generateApplicationSlipEmail,
  generateApplicationSubmittedEmail,
  generateApplicationApprovedEmail,
  generateApplicationRejectedEmail,
  generatePendingDocumentsEmail,
  generatePaymentReceiptEmail,
  generateGenericNotificationEmail,
  escapeHtml,
  sanitizeUrl,
  formatStatus,
  formatDate
};
